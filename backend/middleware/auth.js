const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'family-portal-secret-change-me';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getDb().prepare('SELECT id, username, display_name, role, avatar_emoji, avatar_color, avatar_url, must_change_password, is_active FROM users WHERE id = ?').get(decoded.id);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Force password change - allow only change-password and me endpoints
    if (user.must_change_password && !req.originalUrl.includes('/auth/change-password') && !req.originalUrl.includes('/auth/me')) {
      return res.status(403).json({ error: 'Must change password', mustChangePassword: true });
    }

    req.user = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      avatarEmoji: user.avatar_emoji,
      avatarColor: user.avatar_color,
      avatarUrl: user.avatar_url || null,
      mustChangePassword: !!user.must_change_password
    };

    // Dashboard role is view-only — block all write operations except auth endpoints
    if (user.role === 'dashboard' && req.method !== 'GET' && !req.originalUrl.includes('/auth/')) {
      return res.status(403).json({ error: 'Dashboard account is view-only' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { authMiddleware, generateToken, JWT_SECRET };
