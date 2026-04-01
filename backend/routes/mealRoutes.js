const express = require('express');
const { getDb, logActivity } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

// GET /api/meals?week=2026-03-30 - everyone can view
router.get('/', (req, res) => {
  const { week } = req.query;
  let startDate;
  if (week) {
    startDate = new Date(week);
  } else {
    startDate = new Date();
    const day = startDate.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    startDate.setDate(startDate.getDate() + diff);
  }

  const start = startDate.toISOString().split('T')[0];
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const end = endDate.toISOString().split('T')[0];

  const meals = getDb().prepare(`
    SELECT m.*, u.display_name as created_by_name, u2.display_name as assigned_to_name
    FROM meals m
    LEFT JOIN users u ON m.created_by = u.id
    LEFT JOIN users u2 ON m.assigned_to = u2.id
    WHERE m.meal_date BETWEEN ? AND ?
    ORDER BY m.meal_date ASC,
      CASE m.meal_type WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 WHEN 'dinner' THEN 3 WHEN 'snack' THEN 4 END
  `).all(start, end);

  res.json({ meals, weekStart: start, weekEnd: end });
});

// POST /api/meals - parent only
router.post('/', roleCheck('parent'), (req, res) => {
  const { mealDate, mealType, title, description, recipeUrl, assignedTo, recipeId } = req.body;
  if (!mealDate || !mealType || !title) {
    return res.status(400).json({ error: 'mealDate, mealType, and title are required' });
  }

  const result = getDb().prepare(`
    INSERT INTO meals (meal_date, meal_type, title, description, recipe_url, assigned_to, recipe_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(mealDate, mealType, title, description || '', recipeUrl || null, assignedTo || null, recipeId || null, req.user.id);

  logActivity(req.user.id, 'planned_meal', 'meal', result.lastInsertRowid, `${mealType}: ${title}`);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Meal added' });
});

// PUT /api/meals/:id - parent only
router.put('/:id', roleCheck('parent'), (req, res) => {
  const meal = getDb().prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });

  const { mealDate, mealType, title, description, recipeUrl, assignedTo } = req.body;

  getDb().prepare(`
    UPDATE meals SET
      meal_date = COALESCE(?, meal_date),
      meal_type = COALESCE(?, meal_type),
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      recipe_url = COALESCE(?, recipe_url),
      assigned_to = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(mealDate, mealType, title, description, recipeUrl, assignedTo || null, req.params.id);

  res.json({ message: 'Meal updated' });
});

// DELETE /api/meals/:id - parent only
router.delete('/:id', roleCheck('parent'), (req, res) => {
  getDb().prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ message: 'Meal deleted' });
});

module.exports = router;
