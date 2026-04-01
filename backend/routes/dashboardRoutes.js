const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/dashboard
router.get('/', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Request stats
  const isParent = req.user.role === 'parent';
  const userFilter = isParent ? '' : 'AND submitted_by = ?';
  const userParams = isParent ? [] : [req.user.id];

  const openRequests = db.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'open' ${userFilter}`).get(...userParams).count;
  const inProgressRequests = db.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'in_progress' ${userFilter}`).get(...userParams).count;
  const totalRequests = db.prepare(`SELECT COUNT(*) as count FROM requests ${userFilter ? 'WHERE 1=1 ' + userFilter : ''}`).get(...userParams).count;

  // Grocery stats
  const groceryTotal = db.prepare('SELECT COUNT(*) as count FROM grocery_items WHERE is_checked = 0').get().count;
  const groceryChecked = db.prepare('SELECT COUNT(*) as count FROM grocery_items WHERE is_checked = 1').get().count;

  // Today's meals
  const todayMeals = db.prepare(`
    SELECT m.*, u.display_name as assigned_to_name
    FROM meals m LEFT JOIN users u ON m.assigned_to = u.id
    WHERE m.meal_date = ?
    ORDER BY CASE m.meal_type WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 WHEN 'dinner' THEN 3 WHEN 'snack' THEN 4 END
  `).all(today);

  // Recent activity
  const recentActivity = db.prepare(`
    SELECT a.*, u.display_name, u.avatar_emoji
    FROM activity_log a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT 15
  `).all();

  // Recent pending requests (for parent dashboard)
  const pendingRequests = isParent ? db.prepare(`
    SELECT r.*, u.display_name as submitted_by_name, u.avatar_emoji as submitted_by_emoji, u.avatar_url as submitted_by_avatar_url
    FROM requests r JOIN users u ON r.submitted_by = u.id
    WHERE r.status IN ('open', 'in_progress')
    ORDER BY r.created_at DESC LIMIT 5
  `).all() : [];

  // Family members count
  const familyCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;

  res.json({
    stats: {
      openRequests,
      inProgressRequests,
      totalRequests,
      groceryTotal,
      groceryChecked,
      familyCount,
      todayMealCount: todayMeals.length
    },
    todayMeals,
    recentActivity,
    pendingRequests
  });
});

module.exports = router;
