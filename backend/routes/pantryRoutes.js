const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

// GET /api/pantry
router.get('/', (req, res) => {
  const { location, search } = req.query;
  let sql = 'SELECT p.*, u.display_name as added_by_name FROM pantry_items p LEFT JOIN users u ON p.added_by = u.id WHERE 1=1';
  const params = [];
  if (location) { sql += ' AND p.location = ?'; params.push(location); }
  if (search) { sql += ' AND p.name LIKE ?'; params.push(`%${search}%`); }
  sql += ` ORDER BY p.location, CASE WHEN p.expiration_date IS NOT NULL AND p.expiration_date <= date('now', '+3 days') THEN 0 ELSE 1 END, p.category, p.name`;
  res.json(getDb().prepare(sql).all(...params));
});

// GET /api/pantry/expiring - items expiring within 3 days
router.get('/expiring', (req, res) => {
  const items = getDb().prepare(`
    SELECT * FROM pantry_items
    WHERE expiration_date IS NOT NULL AND expiration_date <= date('now', '+3 days')
    ORDER BY expiration_date ASC
  `).all();
  res.json(items);
});

// GET /api/pantry/low-stock
router.get('/low-stock', (req, res) => {
  const items = getDb().prepare('SELECT * FROM pantry_items WHERE low_stock = 1 ORDER BY name').all();
  res.json(items);
});

// POST /api/pantry - parent only
router.post('/', roleCheck('parent'), (req, res) => {
  const { name, quantity, category, location, expirationDate, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const result = getDb().prepare(`
    INSERT INTO pantry_items (name, quantity, category, location, expiration_date, notes, added_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, quantity || '1', category || 'other', location || 'pantry', expirationDate || null, notes || null, req.user.id);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Item added' });
});

// PUT /api/pantry/:id - parent only
router.put('/:id', roleCheck('parent'), (req, res) => {
  const { name, quantity, category, location, expirationDate, notes, lowStock } = req.body;
  getDb().prepare(`
    UPDATE pantry_items SET
      name = COALESCE(?, name), quantity = COALESCE(?, quantity),
      category = COALESCE(?, category), location = COALESCE(?, location),
      expiration_date = ?, notes = COALESCE(?, notes),
      low_stock = COALESCE(?, low_stock), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, quantity, category, location, expirationDate !== undefined ? expirationDate : null, notes, lowStock !== undefined ? (lowStock ? 1 : 0) : null, req.params.id);
  res.json({ message: 'Updated' });
});

// PATCH /api/pantry/:id/low-stock - toggle low stock
router.patch('/:id/low-stock', roleCheck('parent'), (req, res) => {
  const item = getDb().prepare('SELECT * FROM pantry_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  getDb().prepare('UPDATE pantry_items SET low_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(item.low_stock ? 0 : 1, req.params.id);
  res.json({ lowStock: !item.low_stock });
});

// POST /api/pantry/:id/to-grocery - add low stock item to grocery list
router.post('/:id/to-grocery', roleCheck('parent'), (req, res) => {
  const item = getDb().prepare('SELECT * FROM pantry_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const exists = getDb().prepare('SELECT id FROM grocery_items WHERE name = ? COLLATE NOCASE AND is_checked = 0').get(item.name);
  if (exists) return res.json({ message: 'Already on grocery list' });

  const groceryRouter = require('./groceryRoutes');
  const cat = groceryRouter.categorizeItem ? groceryRouter.categorizeItem(item.name) : item.category;
  getDb().prepare('INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)')
    .run(item.name, item.quantity || '1', cat, req.user.id);
  res.json({ message: `Added "${item.name}" to grocery list` });
});

// POST /api/pantry/from-grocery - move checked grocery items to pantry
router.post('/from-grocery', roleCheck('parent'), (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });

  let added = 0;
  for (const item of items) {
    const existing = getDb().prepare('SELECT id FROM pantry_items WHERE name = ? COLLATE NOCASE').get(item.name);
    if (existing) {
      getDb().prepare('UPDATE pantry_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(item.quantity || '1', existing.id);
    } else {
      getDb().prepare('INSERT INTO pantry_items (name, quantity, category, location, added_by) VALUES (?, ?, ?, ?, ?)')
        .run(item.name, item.quantity || '1', item.category || 'other', 'pantry', req.user.id);
      added++;
    }
  }
  res.json({ message: `${added} new items added to pantry` });
});

// DELETE /api/pantry/:id - parent only
router.delete('/:id', roleCheck('parent'), (req, res) => {
  getDb().prepare('DELETE FROM pantry_items WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
