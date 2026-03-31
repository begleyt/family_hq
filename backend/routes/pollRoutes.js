const express = require('express');
const { getDb, logActivity } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

// GET /api/polls - list polls
router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT p.*, u.display_name as created_by_name, u.avatar_emoji as created_by_emoji,
      (SELECT COUNT(DISTINCT pv.user_id) FROM poll_votes pv WHERE pv.poll_id = p.id) as voter_count,
      (SELECT COUNT(*) FROM food_orders fo WHERE fo.poll_id = p.id) as order_count
    FROM polls p
    JOIN users u ON p.created_by = u.id
  `;
  const params = [];
  if (status) { sql += ' WHERE p.status = ?'; params.push(status); }
  sql += ' ORDER BY p.status ASC, p.created_at DESC';

  res.json(getDb().prepare(sql).all(...params));
});

// GET /api/polls/:id - get poll with options, votes, or food orders
router.get('/:id', (req, res) => {
  const poll = getDb().prepare(`
    SELECT p.*, u.display_name as created_by_name, u.avatar_emoji as created_by_emoji
    FROM polls p JOIN users u ON p.created_by = u.id WHERE p.id = ?
  `).get(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  if (poll.type === 'poll') {
    const options = getDb().prepare(`
      SELECT po.*,
        (SELECT COUNT(*) FROM poll_votes pv WHERE pv.option_id = po.id) as vote_count
      FROM poll_options po WHERE po.poll_id = ?
      ORDER BY po.id
    `).all(req.params.id);

    const myVotes = getDb().prepare('SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?')
      .all(req.params.id, req.user.id).map(v => v.option_id);

    const voters = getDb().prepare(`
      SELECT pv.option_id, u.display_name, u.avatar_emoji
      FROM poll_votes pv JOIN users u ON pv.user_id = u.id
      WHERE pv.poll_id = ?
    `).all(req.params.id);

    const totalVotes = getDb().prepare('SELECT COUNT(DISTINCT user_id) as count FROM poll_votes WHERE poll_id = ?').get(req.params.id).count;

    res.json({ ...poll, options, myVotes, voters, totalVotes });
  } else {
    // Food order
    const orders = getDb().prepare(`
      SELECT fo.*, u.display_name, u.avatar_emoji, u2.display_name as entered_by_name
      FROM food_orders fo
      LEFT JOIN users u ON fo.user_id = u.id
      LEFT JOIN users u2 ON fo.entered_by = u2.id
      WHERE fo.poll_id = ?
      ORDER BY fo.created_at ASC
    `).all(req.params.id);

    const allUsers = getDb().prepare("SELECT id, display_name, avatar_emoji, role FROM users WHERE is_active = 1 AND role != 'dashboard'").all();

    res.json({ ...poll, orders, allUsers });
  }
});

// POST /api/polls - create poll (parent only)
router.post('/', roleCheck('parent'), (req, res) => {
  const { title, type, restaurantName, options, allowMultiple } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const pollType = type === 'food_order' ? 'food_order' : 'poll';

  const result = getDb().prepare(`
    INSERT INTO polls (title, type, restaurant_name, allow_multiple, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, pollType, restaurantName || null, allowMultiple ? 1 : 0, req.user.id);

  const pollId = result.lastInsertRowid;

  // Add options for regular polls
  if (pollType === 'poll' && Array.isArray(options)) {
    const insert = getDb().prepare('INSERT INTO poll_options (poll_id, label, created_by) VALUES (?, ?, ?)');
    for (const opt of options) {
      if (opt.trim()) insert.run(pollId, opt.trim(), req.user.id);
    }
  }

  logActivity(req.user.id, 'created_poll', 'poll', pollId, pollType === 'food_order' ? `Food order: ${restaurantName || title}` : `Poll: ${title}`);

  // Notify all active non-dashboard users
  const users = getDb().prepare("SELECT id FROM users WHERE is_active = 1 AND role != 'dashboard' AND id != ?").all(req.user.id);
  const notifyInsert = getDb().prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)');
  for (const u of users) {
    if (pollType === 'food_order') {
      notifyInsert.run(u.id, `Food Order: ${restaurantName || title}`, `${req.user.displayName} wants to know what you want from ${restaurantName || 'the restaurant'}!`, 'info');
    } else {
      notifyInsert.run(u.id, 'New Poll!', `${req.user.displayName} posted a poll: "${title}"`, 'info');
    }
  }

  res.status(201).json({ id: pollId, message: 'Poll created' });
});

// POST /api/polls/:id/vote - vote on a poll option
router.post('/:id/vote', (req, res) => {
  const { optionId } = req.body;
  const poll = getDb().prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (poll.status !== 'open') return res.status(400).json({ error: 'Poll is closed' });
  if (poll.type !== 'poll') return res.status(400).json({ error: 'Use food order endpoint' });

  // Remove existing vote(s) if not allow_multiple
  if (!poll.allow_multiple) {
    getDb().prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  }

  try {
    getDb().prepare('INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)').run(req.params.id, optionId, req.user.id);
  } catch (e) {
    // Already voted for this option (unique constraint)
    getDb().prepare('DELETE FROM poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?').run(req.params.id, optionId, req.user.id);
  }

  res.json({ message: 'Vote recorded' });
});

// POST /api/polls/:id/order - submit food order
router.post('/:id/order', (req, res) => {
  const { items, notes, userId, guestName } = req.body;
  if (!items) return res.status(400).json({ error: 'items is required' });

  const poll = getDb().prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (poll.status !== 'open') return res.status(400).json({ error: 'Order is closed' });
  if (poll.type !== 'food_order') return res.status(400).json({ error: 'Not a food order' });

  // Guest order (no account) — parent only
  if (guestName && req.user.role === 'parent') {
    getDb().prepare(`
      INSERT INTO food_orders (poll_id, user_id, guest_name, items, notes, entered_by)
      VALUES (?, NULL, ?, ?, ?, ?)
    `).run(req.params.id, guestName, items, notes || null, req.user.id);
    return res.json({ message: 'Guest order added' });
  }

  const targetUserId = (userId && req.user.role === 'parent') ? userId : req.user.id;
  const enteredBy = (userId && req.user.role === 'parent' && userId !== req.user.id) ? req.user.id : null;

  // Remove previous order for this user
  getDb().prepare('DELETE FROM food_orders WHERE poll_id = ? AND user_id = ?').run(req.params.id, targetUserId);

  getDb().prepare(`
    INSERT INTO food_orders (poll_id, user_id, items, notes, entered_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, targetUserId, items, notes || null, enteredBy);

  res.json({ message: 'Order submitted' });
});

// DELETE /api/polls/:id/order/:orderId - remove a food order (parent only)
router.delete('/:id/order/:orderId', roleCheck('parent'), (req, res) => {
  getDb().prepare('DELETE FROM food_orders WHERE id = ? AND poll_id = ?').run(req.params.orderId, req.params.id);
  res.json({ message: 'Order removed' });
});

// PUT /api/polls/:id - close/reopen poll (parent only)
router.put('/:id', roleCheck('parent'), (req, res) => {
  const { status } = req.body;
  if (status === 'closed') {
    getDb().prepare('UPDATE polls SET status = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?').run('closed', req.params.id);
  } else if (status === 'open') {
    getDb().prepare('UPDATE polls SET status = ?, closed_at = NULL WHERE id = ?').run('open', req.params.id);
  }
  res.json({ message: 'Poll updated' });
});

// DELETE /api/polls/:id - delete poll (parent only)
router.delete('/:id', roleCheck('parent'), (req, res) => {
  getDb().prepare('DELETE FROM polls WHERE id = ?').run(req.params.id);
  res.json({ message: 'Poll deleted' });
});

module.exports = router;
