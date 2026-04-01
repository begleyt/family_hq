const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');
const { authMiddleware, generateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = getDb().prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      avatarEmoji: user.avatar_emoji,
      avatarColor: user.avatar_color,
      avatarUrl: user.avatar_url || null,
      mustChangePassword: !!user.must_change_password
    }
  });
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  // If must_change_password, current password check is optional (they know it from first login)
  if (!user.must_change_password) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  getDb().prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.user.id);

  const token = generateToken(user);
  res.json({ message: 'Password changed successfully', token });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
