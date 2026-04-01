const express = require('express');
const { getDb, logActivity } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

// Track item in history for autocomplete
function trackHistory(name, category, quantity) {
  const existing = getDb().prepare('SELECT id, use_count FROM grocery_history WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    getDb().prepare('UPDATE grocery_history SET use_count = use_count + 1, last_used = CURRENT_TIMESTAMP, category = ?, quantity = ? WHERE id = ?')
      .run(category, quantity, existing.id);
  } else {
    getDb().prepare('INSERT INTO grocery_history (name, category, quantity) VALUES (?, ?, ?)').run(name, category, quantity);
  }
}

// GET /api/grocery - everyone can view
router.get('/', (req, res) => {
  const items = getDb().prepare(`
    SELECT g.*, u.display_name as added_by_name, u.avatar_emoji as added_by_emoji, u.avatar_url as added_by_avatar_url,
      u2.display_name as requested_by_name, u2.avatar_emoji as requested_by_emoji, u2.avatar_url as requested_by_avatar_url
    FROM grocery_items g
    LEFT JOIN users u ON g.added_by = u.id
    LEFT JOIN users u2 ON g.requested_by = u2.id
    ORDER BY g.is_checked ASC, g.category ASC, g.created_at DESC
  `).all();
  res.json(items);
});

// GET /api/grocery/autocomplete?q=mil
router.get('/autocomplete', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.json([]);
  const items = getDb().prepare(`
    SELECT name, category, quantity FROM grocery_history
    WHERE name LIKE ? COLLATE NOCASE
    ORDER BY use_count DESC, last_used DESC
    LIMIT 10
  `).all(`%${q}%`);
  res.json(items);
});

// GET /api/grocery/archives - list past lists
router.get('/archives', (req, res) => {
  const archives = getDb().prepare(`
    SELECT a.*, u.display_name as archived_by_name
    FROM grocery_archives a
    LEFT JOIN users u ON a.archived_by = u.id
    ORDER BY a.created_at DESC
    LIMIT 20
  `).all();
  res.json(archives);
});

// GET /api/grocery/archives/:id - get items from a past list
router.get('/archives/:id', (req, res) => {
  const archive = getDb().prepare('SELECT * FROM grocery_archives WHERE id = ?').get(req.params.id);
  if (!archive) return res.status(404).json({ error: 'Archive not found' });
  const items = getDb().prepare('SELECT * FROM grocery_archive_items WHERE archive_id = ? ORDER BY category, name').all(req.params.id);
  res.json({ ...archive, items });
});

// POST /api/grocery/archives - archive current list & clear checked
router.post('/archives', roleCheck('parent'), (req, res) => {
  const { label } = req.body;
  const checkedItems = getDb().prepare('SELECT * FROM grocery_items WHERE is_checked = 1').all();

  if (checkedItems.length === 0) {
    return res.status(400).json({ error: 'No checked items to archive' });
  }

  const archiveLabel = label || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const result = getDb().prepare('INSERT INTO grocery_archives (label, archived_by, item_count) VALUES (?, ?, ?)')
    .run(archiveLabel, req.user.id, checkedItems.length);

  const insertItem = getDb().prepare('INSERT INTO grocery_archive_items (archive_id, name, quantity, category) VALUES (?, ?, ?, ?)');
  for (const item of checkedItems) {
    insertItem.run(result.lastInsertRowid, item.name, item.quantity, item.category);
  }

  // Clear checked items
  getDb().prepare('DELETE FROM grocery_items WHERE is_checked = 1').run();

  logActivity(req.user.id, 'archived_grocery', 'grocery', result.lastInsertRowid, `Archived ${checkedItems.length} items`);
  res.status(201).json({ id: result.lastInsertRowid, message: `Archived ${checkedItems.length} items`, label: archiveLabel });
});

// POST /api/grocery/archives/:id/restore - re-add all items from an archive
router.post('/archives/:id/restore', roleCheck('parent'), (req, res) => {
  const archive = getDb().prepare('SELECT * FROM grocery_archives WHERE id = ?').get(req.params.id);
  if (!archive) return res.status(404).json({ error: 'Archive not found' });

  const items = getDb().prepare('SELECT * FROM grocery_archive_items WHERE archive_id = ?').all(req.params.id);
  const insert = getDb().prepare('INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)');

  let added = 0;
  for (const item of items) {
    // Skip if already on the current list
    const exists = getDb().prepare('SELECT id FROM grocery_items WHERE name = ? COLLATE NOCASE AND is_checked = 0').get(item.name);
    if (!exists) {
      insert.run(item.name, item.quantity, item.category, req.user.id);
      added++;
    }
  }

  logActivity(req.user.id, 'restored_grocery', 'grocery', archive.id, `Re-added ${added} items from "${archive.label}"`);
  res.json({ message: `Added ${added} items (${items.length - added} already on list)` });
});

// POST /api/grocery/archives/:id/restore-item - re-add a single item
router.post('/archives/:id/restore-item', roleCheck('parent'), (req, res) => {
  const { name, quantity, category } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const exists = getDb().prepare('SELECT id FROM grocery_items WHERE name = ? COLLATE NOCASE AND is_checked = 0').get(name);
  if (exists) return res.json({ message: 'Item already on list' });

  getDb().prepare('INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)')
    .run(name, quantity || '1', category || 'other', req.user.id);
  trackHistory(name, category || 'other', quantity || '1');

  res.status(201).json({ message: 'Item added' });
});

// POST /api/grocery - parent only
router.post('/', roleCheck('parent'), (req, res) => {
  const { name, quantity, category } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const result = getDb().prepare(`
    INSERT INTO grocery_items (name, quantity, category, added_by)
    VALUES (?, ?, ?, ?)
  `).run(name, quantity || '1', category || 'other', req.user.id);

  trackHistory(name, category || 'other', quantity || '1');
  logActivity(req.user.id, 'added_grocery', 'grocery', result.lastInsertRowid, name);

  const item = getDb().prepare(`
    SELECT g.*, u.display_name as added_by_name, u.avatar_emoji as added_by_emoji
    FROM grocery_items g LEFT JOIN users u ON g.added_by = u.id WHERE g.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(item);
});

// PUT /api/grocery/:id - parent only
router.put('/:id', roleCheck('parent'), (req, res) => {
  const { name, quantity, category } = req.body;
  const item = getDb().prepare('SELECT * FROM grocery_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  getDb().prepare(`
    UPDATE grocery_items SET
      name = COALESCE(?, name),
      quantity = COALESCE(?, quantity),
      category = COALESCE(?, category),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, quantity, category, req.params.id);

  res.json({ message: 'Item updated' });
});

// PATCH /api/grocery/:id/check - parent only
router.patch('/:id/check', roleCheck('parent'), (req, res) => {
  const item = getDb().prepare('SELECT * FROM grocery_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const newChecked = item.is_checked ? 0 : 1;
  getDb().prepare(`
    UPDATE grocery_items SET is_checked = ?, checked_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(newChecked, newChecked ? req.user.id : null, req.params.id);

  res.json({ isChecked: !!newChecked });
});

// DELETE /api/grocery/:id - parent only
router.delete('/:id', roleCheck('parent'), (req, res) => {
  getDb().prepare('DELETE FROM grocery_items WHERE id = ?').run(req.params.id);
  res.json({ message: 'Item deleted' });
});

// DELETE /api/grocery/checked/clear - parent only (no archive)
router.delete('/checked/clear', roleCheck('parent'), (req, res) => {
  const result = getDb().prepare('DELETE FROM grocery_items WHERE is_checked = 1').run();
  res.json({ message: `Cleared ${result.changes} items` });
});

module.exports = router;
