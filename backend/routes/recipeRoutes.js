const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

// GET /api/recipes
router.get('/', (req, res) => {
  const { search, tag } = req.query;
  let sql = 'SELECT r.*, u.display_name as created_by_name FROM recipes r LEFT JOIN users u ON r.created_by = u.id WHERE 1=1';
  const params = [];

  if (search) { sql += ' AND (r.title LIKE ? OR r.ingredients LIKE ? OR r.tags LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (tag) { sql += ' AND r.tags LIKE ?'; params.push(`%${tag}%`); }

  sql += ' ORDER BY r.title ASC';
  res.json(getDb().prepare(sql).all(...params));
});

// GET /api/recipes/:id
router.get('/:id', (req, res) => {
  const recipe = getDb().prepare('SELECT r.*, u.display_name as created_by_name FROM recipes r LEFT JOIN users u ON r.created_by = u.id WHERE r.id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json(recipe);
});

// POST /api/recipes - parent only
router.post('/', roleCheck('parent'), (req, res) => {
  const { title, description, ingredients, instructions, prepTime, cookTime, servings, tags, sourceUrl } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const result = getDb().prepare(`
    INSERT INTO recipes (title, description, ingredients, instructions, prep_time, cook_time, servings, tags, source_url, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', ingredients || '', instructions || '', prepTime || '', cookTime || '', servings || '', tags || '', sourceUrl || '', req.user.id);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Recipe added' });
});

// PUT /api/recipes/:id - parent only
router.put('/:id', roleCheck('parent'), (req, res) => {
  const { title, description, ingredients, instructions, prepTime, cookTime, servings, tags, sourceUrl } = req.body;

  getDb().prepare(`
    UPDATE recipes SET title = COALESCE(?, title), description = COALESCE(?, description),
    ingredients = COALESCE(?, ingredients), instructions = COALESCE(?, instructions),
    prep_time = COALESCE(?, prep_time), cook_time = COALESCE(?, cook_time),
    servings = COALESCE(?, servings), tags = COALESCE(?, tags), source_url = COALESCE(?, source_url),
    updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(title, description, ingredients, instructions, prepTime, cookTime, servings, tags, sourceUrl, req.params.id);

  res.json({ message: 'Recipe updated' });
});

// DELETE /api/recipes/:id - parent only
router.delete('/:id', roleCheck('parent'), (req, res) => {
  getDb().prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
  res.json({ message: 'Recipe deleted' });
});

module.exports = router;
