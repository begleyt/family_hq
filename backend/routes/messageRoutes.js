const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const https = require('https');
const http = require('http');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB max

function getImmichConfig() {
  return getDb().prepare('SELECT * FROM immich_config ORDER BY id DESC LIMIT 1').get();
}

// GET /api/messages/immich-proxy/:assetId/:size - proxy Immich images (NO AUTH - public, asset IDs not guessable)
router.get('/immich-proxy/:assetId/:size', async (req, res) => {
  const config = getImmichConfig();
  if (!config) return res.status(404).send('Not configured');

  const { assetId, size } = req.params;
  const endpoint = size === 'original' ? 'original' : 'thumbnail';
  const url = new URL(`/api/assets/${assetId}/${endpoint}`, config.server_url);

  const protocol = url.protocol === 'https:' ? https : http;
  const proxyReq = protocol.request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'GET',
    headers: { 'x-api-key': config.api_key },
    rejectUnauthorized: false,
  }, (proxyRes) => {
    res.set('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => res.status(500).send('Proxy error'));
  proxyReq.end();
});

// All routes below require authentication
router.use(authMiddleware);

// Upload to Immich API
async function uploadToImmich(fileBuffer, filename, mimetype) {
  const config = getImmichConfig();
  if (!config) throw new Error('Immich not configured');

  const form = new FormData();
  form.append('assetData', fileBuffer, { filename, contentType: mimetype });
  form.append('deviceAssetId', `family-hq-${Date.now()}`);
  form.append('deviceId', 'family-hq');
  form.append('fileCreatedAt', new Date().toISOString());
  form.append('fileModifiedAt', new Date().toISOString());

  const url = new URL('/api/assets', config.server_url);

  return new Promise((resolve, reject) => {
    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'x-api-key': config.api_key,
      },
      rejectUnauthorized: false, // Allow self-signed certs
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.message || `Immich error ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Immich response error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

// GET /api/messages
router.get('/', (req, res) => {
  const config = getImmichConfig();
  const messages = getDb().prepare(`
    SELECT m.*, u.display_name, u.avatar_emoji, u.avatar_color, u.avatar_url, u.role,
      (SELECT COUNT(*) FROM message_comments mc WHERE mc.message_id = m.id) as comment_count
    FROM messages m
    JOIN users u ON m.user_id = u.id
    ORDER BY m.pinned DESC, m.sort_order ASC, m.created_at DESC
    LIMIT 50
  `).all();

  // Build image URLs with Immich server base
  const serverUrl = config?.server_url || '';
  messages.forEach(m => {
    if (m.image_asset_id) {
      m.image_thumb = `${serverUrl}/api/assets/${m.image_asset_id}/thumbnail`;
      m.image_full = `${serverUrl}/api/assets/${m.image_asset_id}/original`;
      m.immich_api_key = config?.api_key || '';
    }
  });

  res.json(messages);
});

// (immich-proxy route defined above, before auth middleware)

// GET /api/messages/:id
router.get('/:id', (req, res) => {
  const message = getDb().prepare(`
    SELECT m.*, u.display_name, u.avatar_emoji, u.avatar_color, u.avatar_url, u.role
    FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = ?
  `).get(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });

  const comments = getDb().prepare(`
    SELECT mc.*, u.display_name, u.avatar_emoji, u.role
    FROM message_comments mc
    JOIN users u ON mc.user_id = u.id
    WHERE mc.message_id = ?
    ORDER BY mc.created_at ASC
  `).all(req.params.id);

  res.json({ ...message, comments });
});

// POST /api/messages - post with optional photo
router.post('/', upload.single('photo'), async (req, res) => {
  const content = req.body.content || '';
  if (!content.trim() && !req.file) return res.status(400).json({ error: 'content or photo required' });

  let imageUrl = null;
  let imageAssetId = null;

  // Upload photo to Immich if present
  if (req.file) {
    try {
      const result = await uploadToImmich(req.file.buffer, req.file.originalname, req.file.mimetype);
      imageAssetId = result.id;
      imageUrl = `/api/messages/immich-proxy/${result.id}/thumbnail`;
    } catch (err) {
      console.error('Immich upload error:', err.message);
      return res.status(500).json({ error: 'Photo upload failed: ' + err.message });
    }
  }

  getDb().prepare('UPDATE messages SET sort_order = sort_order + 1').run();
  const result = getDb().prepare('INSERT INTO messages (user_id, content, image_url, image_asset_id, sort_order) VALUES (?, ?, ?, ?, 0)')
    .run(req.user.id, content.trim() || (req.file ? '\u{1F4F8}' : ''), imageUrl, imageAssetId);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Posted' });
});

// PUT /api/messages/:id - parent can edit any, others can edit own
router.put('/:id', (req, res) => {
  const msg = getDb().prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  if (req.user.role !== 'parent' && msg.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { content, pinned } = req.body;
  getDb().prepare(`
    UPDATE messages SET
      content = COALESCE(?, content),
      pinned = COALESCE(?, pinned),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(content || null, pinned !== undefined ? (pinned ? 1 : 0) : null, req.params.id);

  res.json({ message: 'Updated' });
});

// PUT /api/messages/reorder - parent only
router.put('/', roleCheck('parent'), (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });

  const update = getDb().prepare('UPDATE messages SET sort_order = ? WHERE id = ?');
  const transaction = getDb().transaction((items) => {
    for (const item of items) {
      update.run(item.sort_order, item.id);
    }
  });
  transaction(order);

  res.json({ message: 'Order updated' });
});

// DELETE /api/messages/:id - parent only
router.delete('/:id', roleCheck('parent'), (req, res) => {
  getDb().prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// POST /api/messages/:id/comments - anyone
router.post('/:id/comments', (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });

  const msg = getDb().prepare('SELECT id FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  getDb().prepare('INSERT INTO message_comments (message_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.id, content.trim());

  res.status(201).json({ message: 'Comment added' });
});

// DELETE /api/messages/:id/comments/:commentId - parent only
router.delete('/:id/comments/:commentId', roleCheck('parent'), (req, res) => {
  getDb().prepare('DELETE FROM message_comments WHERE id = ? AND message_id = ?').run(req.params.commentId, req.params.id);
  res.json({ message: 'Comment deleted' });
});

module.exports = router;
