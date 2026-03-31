const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/notifications
router.get('/', (req, res) => {
  const notifications = getDb().prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json(notifications);
});

// GET /api/notifications/unread-count
router.get('/unread-count', (req, res) => {
  const result = getDb().prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
  res.json({ count: result.count });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', (req, res) => {
  getDb().prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ message: 'Marked as read' });
});

// PATCH /api/notifications/read-all
router.patch('/read-all', (req, res) => {
  getDb().prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
  res.json({ message: 'All marked as read' });
});

module.exports = router;
