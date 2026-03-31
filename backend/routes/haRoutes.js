const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

// GET /api/ha/config (parent only)
router.get('/config', roleCheck('parent'), (req, res) => {
  const config = getDb().prepare('SELECT * FROM ha_config ORDER BY id DESC LIMIT 1').get();
  res.json(config || { ha_url: '', ha_token: '', enabled: 0 });
});

// PUT /api/ha/config (parent only)
router.put('/config', roleCheck('parent'), (req, res) => {
  const { haUrl, haToken, enabled } = req.body;
  const existing = getDb().prepare('SELECT id FROM ha_config ORDER BY id DESC LIMIT 1').get();

  if (existing) {
    getDb().prepare('UPDATE ha_config SET ha_url = ?, ha_token = ?, enabled = ? WHERE id = ?')
      .run(haUrl, haToken, enabled ? 1 : 0, existing.id);
  } else {
    getDb().prepare('INSERT INTO ha_config (ha_url, ha_token, enabled) VALUES (?, ?, ?)')
      .run(haUrl, haToken, enabled ? 1 : 0);
  }

  res.json({ message: 'Home Assistant config saved' });
});

// GET /api/ha/entities - stub for future HA integration
router.get('/entities', (req, res) => {
  const config = getDb().prepare('SELECT * FROM ha_config WHERE enabled = 1 ORDER BY id DESC LIMIT 1').get();
  if (!config) {
    return res.json({ entities: [], message: 'Home Assistant not configured' });
  }

  // Future: proxy to HA REST API at config.ha_url/api/states
  // For now return watched entities from DB
  const entities = getDb().prepare('SELECT * FROM ha_entities WHERE show_on_dashboard = 1 ORDER BY sort_order').all();
  res.json({ entities, configured: true });
});

module.exports = router;
