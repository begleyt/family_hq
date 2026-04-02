const express = require('express');
const https = require('https');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

function getWalmartConfig() {
  return getDb().prepare('SELECT * FROM walmart_config ORDER BY id DESC LIMIT 1').get();
}

// Walmart Affiliate API search
async function searchWalmart(query, config) {
  if (!config || !config.api_key) return null;

  return new Promise((resolve, reject) => {
    const url = `https://developer.api.walmart.com/api-proxy/service/affil/product/v2/search?query=${encodeURIComponent(query)}&numItems=3&format=json`;
    const req = https.request(url, {
      headers: {
        'WM_SEC.ACCESS_TOKEN': config.api_key,
        'WM_CONSUMER.CHANNEL.TYPE': '0',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.items || []);
        } catch (e) {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.end();
  });
}

// GET /api/walmart/status
router.get('/status', (req, res) => {
  const config = getWalmartConfig();
  res.json({ configured: !!(config && config.api_key) });
});

// PUT /api/walmart/config - parent only
router.put('/config', roleCheck('parent'), (req, res) => {
  const { apiKey, affiliateId } = req.body;
  const existing = getDb().prepare('SELECT id FROM walmart_config ORDER BY id DESC LIMIT 1').get();
  if (existing) {
    getDb().prepare('UPDATE walmart_config SET api_key = ?, affiliate_id = ? WHERE id = ?')
      .run(apiKey, affiliateId || '', existing.id);
  } else {
    getDb().prepare('INSERT INTO walmart_config (api_key, affiliate_id) VALUES (?, ?)')
      .run(apiKey, affiliateId || '');
  }
  res.json({ message: 'Walmart config saved' });
});

// GET /api/walmart/search?q=milk - search Walmart for a product
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const config = getWalmartConfig();

  // Check cache first (within 24 hours)
  const cached = getDb().prepare(`
    SELECT * FROM walmart_products
    WHERE search_term = ? COLLATE NOCASE
    AND last_updated > datetime('now', '-24 hours')
    ORDER BY last_updated DESC LIMIT 3
  `).all(q);

  if (cached.length > 0) return res.json(cached);

  if (!config || !config.api_key) {
    return res.json({ error: 'Walmart API not configured', items: [] });
  }

  try {
    const items = await searchWalmart(q, config);
    const results = items.slice(0, 3).map(item => ({
      product_name: item.name,
      price: item.salePrice || item.msrp || null,
      product_url: item.productUrl || item.addToCartUrl || '',
      image_url: item.thumbnailImage || item.mediumImage || '',
      walmart_id: String(item.itemId || ''),
    }));

    // Cache results
    const insert = getDb().prepare('INSERT INTO walmart_products (search_term, product_name, price, product_url, image_url, walmart_id) VALUES (?, ?, ?, ?, ?, ?)');
    for (const r of results) {
      insert.run(q, r.product_name, r.price, r.product_url, r.image_url, r.walmart_id);
    }

    res.json(results);
  } catch (err) {
    console.error('Walmart search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// POST /api/walmart/lookup-list - look up prices for all grocery items
router.post('/lookup-list', roleCheck('parent'), async (req, res) => {
  const config = getWalmartConfig();
  if (!config || !config.api_key) {
    return res.json({ message: 'Walmart API not configured', items: [] });
  }

  const groceryItems = getDb().prepare('SELECT id, name FROM grocery_items WHERE is_checked = 0 AND COALESCE(on_hand, 0) = 0').all();
  const results = [];

  for (const item of groceryItems) {
    // Check cache first
    const cached = getDb().prepare(`
      SELECT price, product_url FROM walmart_products
      WHERE search_term = ? COLLATE NOCASE
      AND last_updated > datetime('now', '-24 hours')
      ORDER BY last_updated DESC LIMIT 1
    `).get(item.name);

    if (cached) {
      if (cached.price) {
        getDb().prepare('UPDATE grocery_items SET estimated_price = ?, walmart_url = ? WHERE id = ?')
          .run(cached.price, cached.product_url, item.id);
        results.push({ name: item.name, price: cached.price });
      }
      continue;
    }

    try {
      const items = await searchWalmart(item.name, config);
      if (items.length > 0) {
        const best = items[0];
        const price = best.salePrice || best.msrp || null;
        const url = best.productUrl || '';

        if (price) {
          getDb().prepare('UPDATE grocery_items SET estimated_price = ?, walmart_url = ? WHERE id = ?')
            .run(price, url, item.id);
          results.push({ name: item.name, price });

          // Cache
          getDb().prepare('INSERT INTO walmart_products (search_term, product_name, price, product_url, image_url, walmart_id) VALUES (?, ?, ?, ?, ?, ?)')
            .run(item.name, best.name, price, url, best.thumbnailImage || '', String(best.itemId || ''));
        }
      }
      // Rate limit: 100ms between requests
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error(`Walmart lookup failed for "${item.name}":`, e.message);
    }
  }

  const total = results.reduce((sum, r) => sum + (r.price || 0), 0);
  res.json({ items: results, total: Math.round(total * 100) / 100, message: `Found prices for ${results.length} of ${groceryItems.length} items` });
});

// POST /api/walmart/record-price - record actual price paid
router.post('/record-price', roleCheck('parent'), (req, res) => {
  const { itemName, price, store } = req.body;
  if (!itemName || !price) return res.status(400).json({ error: 'itemName and price required' });

  getDb().prepare('INSERT INTO price_history (item_name, price, store) VALUES (?, ?, ?)')
    .run(itemName, price, store || 'Walmart');

  res.json({ message: 'Price recorded' });
});

// GET /api/walmart/price-history?item=milk
router.get('/price-history', (req, res) => {
  const { item } = req.query;
  if (!item) return res.json([]);

  const history = getDb().prepare(`
    SELECT * FROM price_history
    WHERE item_name = ? COLLATE NOCASE
    ORDER BY recorded_at DESC LIMIT 20
  `).all(item);

  res.json(history);
});

// GET /api/walmart/spending-summary - total spent per trip
router.get('/spending-summary', (req, res) => {
  const summary = getDb().prepare(`
    SELECT date(recorded_at) as trip_date, store, SUM(price) as total, COUNT(*) as item_count
    FROM price_history
    GROUP BY date(recorded_at), store
    ORDER BY trip_date DESC
    LIMIT 20
  `).all();

  res.json(summary);
});

module.exports = router;
