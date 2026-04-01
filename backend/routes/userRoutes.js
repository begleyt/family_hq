const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, logActivity } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();

// Avatar upload storage
const avatarDir = path.join(__dirname, '..', 'data', 'avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: avatarDir,
    filename: (req, file, cb) => cb(null, `avatar-${req.params.id || 'self'}-${Date.now()}.jpg`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

// GET /api/users/avatar/:filename - serve avatar (PUBLIC, no auth needed for img tags)
router.get('/avatar/:filename', (req, res) => {
  const filePath = path.join(avatarDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

// All routes below require auth
router.use(authMiddleware);

// POST /api/users/me/avatar - upload own profile picture (any role)
router.post('/me/avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const avatarUrl = `/api/users/avatar/${req.file.filename}`;
  getDb().prepare('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(avatarUrl, req.user.id);

  res.json({ avatarUrl, message: 'Profile picture updated' });
});

// --- Parent-only routes below ---
// GET /api/users
router.get('/', roleCheck('parent'), (req, res) => {
  const users = getDb().prepare(`
    SELECT id, username, display_name, role, avatar_emoji, avatar_color, avatar_url, must_change_password, is_active, created_at
    FROM users ORDER BY role, display_name
  `).all();
  res.json(users);
});

// POST /api/users
router.post('/', roleCheck('parent'), (req, res) => {
  const { username, displayName, password, role, avatarEmoji, avatarColor } = req.body;
  if (!username || !displayName || !password || !role) {
    return res.status(400).json({ error: 'username, displayName, password, and role are required' });
  }
  if (!['parent', 'teen', 'child', 'dashboard'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const existing = getDb().prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = getDb().prepare(`
    INSERT INTO users (username, display_name, password_hash, role, avatar_emoji, avatar_color, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(username, displayName, hash, role, avatarEmoji || '😊', avatarColor || '#6366f1');

  logActivity(req.user.id, 'created_user', 'user', result.lastInsertRowid, `Created user ${displayName}`);
  res.status(201).json({ id: result.lastInsertRowid, message: 'User created' });
});

// PUT /api/users/:id
router.put('/:id', roleCheck('parent'), (req, res) => {
  const { displayName, role, avatarEmoji, avatarColor, isActive } = req.body;
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  getDb().prepare(`
    UPDATE users SET
      display_name = COALESCE(?, display_name),
      role = COALESCE(?, role),
      avatar_emoji = COALESCE(?, avatar_emoji),
      avatar_color = COALESCE(?, avatar_color),
      is_active = COALESCE(?, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(displayName, role, avatarEmoji, avatarColor, isActive, req.params.id);

  res.json({ message: 'User updated' });
});

// POST /api/users/:id/avatar - parent uploads avatar for another user
router.post('/:id/avatar', roleCheck('parent'), upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const avatarUrl = `/api/users/avatar/${req.file.filename}`;
  getDb().prepare('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(avatarUrl, req.params.id);

  res.json({ avatarUrl, message: 'Profile picture updated' });
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', roleCheck('parent'), (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: 'newPassword required' });

  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = bcrypt.hashSync(newPassword, 10);
  getDb().prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.params.id);

  res.json({ message: 'Password reset' });
});

// DELETE /api/users/:id
router.delete('/:id', roleCheck('parent'), (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  getDb().prepare('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deactivated' });
});

module.exports = router;
