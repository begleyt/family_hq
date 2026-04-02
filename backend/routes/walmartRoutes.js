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

// GET /api/walmart/monthly-spending - spending by month and store
router.get('/monthly-spending', roleCheck('parent'), (req, res) => {
  const data = getDb().prepare(`
    SELECT strftime('%Y-%m', recorded_at) as month, store, SUM(price) as total, COUNT(*) as item_count
    FROM price_history
    GROUP BY month, store
    ORDER BY month DESC
    LIMIT 60
  `).all();
  res.json(data);
});

// Normalize generic name for fuzzy matching
function normalizeForComparison(name) {
  return (name || '').toLowerCase()
    .replace(/\b(fresh|organic|natural|original|classic|regular|homestyle|home style)\b/gi, '')
    .replace(/\b(oz|lb|lbs|ct|pk|pack|gallon|gal|qt|pt|fl)\b/gi, '')
    .replace(/\b\d+(\.\d+)?\s*/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// GET /api/walmart/store-comparison - compare prices across stores per item
router.get('/store-comparison', roleCheck('parent'), (req, res) => {
  const groceryRouter = require('./groceryRoutes');
  const items = getDb().prepare(`
    SELECT item_name, COALESCE(generic_name, item_name) as generic_name, brand, store,
      ROUND(AVG(price), 2) as avg_price,
      MIN(price) as min_price,
      MAX(price) as max_price,
      COUNT(*) as times_bought,
      MAX(recorded_at) as last_bought
    FROM price_history
    GROUP BY LOWER(COALESCE(generic_name, item_name)), store
    ORDER BY generic_name, avg_price ASC
  `).all();

  // Group by normalized generic name for fuzzy matching
  const grouped = {};
  items.forEach(i => {
    const key = normalizeForComparison(i.generic_name);
    const category = groceryRouter.categorizeItem ? groceryRouter.categorizeItem(i.generic_name) : 'other';
    if (!grouped[key]) grouped[key] = { name: i.generic_name, category, stores: [] };
    grouped[key].stores.push({
      store: i.store,
      brand: i.brand || null,
      itemName: i.item_name,
      avgPrice: i.avg_price,
      minPrice: i.min_price,
      maxPrice: i.max_price,
      timesBought: i.times_bought,
      lastBought: i.last_bought,
    });
  });

  const result = Object.values(grouped).filter(g => g.stores.length >= 1)
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(result);
});

// GET /api/walmart/receipts - full receipt history
router.get('/receipts', roleCheck('parent'), (req, res) => {
  const trips = getDb().prepare(`
    SELECT date(recorded_at) as trip_date, store,
      SUM(price) as total, COUNT(*) as item_count,
      GROUP_CONCAT(item_name || '|' || price, ';;') as items_raw
    FROM price_history
    GROUP BY date(recorded_at), store
    ORDER BY trip_date DESC
    LIMIT 50
  `).all();

  const receipts = trips.map(t => ({
    date: t.trip_date,
    store: t.store,
    total: Math.round(t.total * 100) / 100,
    itemCount: t.item_count,
    items: t.items_raw ? t.items_raw.split(';;').map(i => {
      const [name, price] = i.split('|');
      return { name, price: parseFloat(price) };
    }) : [],
  }));

  res.json(receipts);
});

// GET /api/walmart/spending-stats - overall stats
router.get('/spending-stats', roleCheck('parent'), (req, res) => {
  const thisMonth = getDb().prepare(`
    SELECT COALESCE(SUM(price), 0) as total, COUNT(DISTINCT date(recorded_at)) as trips
    FROM price_history WHERE strftime('%Y-%m', recorded_at) = strftime('%Y-%m', 'now')
  `).get();

  const lastMonth = getDb().prepare(`
    SELECT COALESCE(SUM(price), 0) as total
    FROM price_history WHERE strftime('%Y-%m', recorded_at) = strftime('%Y-%m', 'now', '-1 month')
  `).get();

  const avgTrip = getDb().prepare(`
    SELECT AVG(trip_total) as avg FROM (
      SELECT SUM(price) as trip_total FROM price_history
      GROUP BY date(recorded_at), store
    )
  `).get();

  const topStore = getDb().prepare(`
    SELECT store, SUM(price) as total FROM price_history
    WHERE strftime('%Y-%m', recorded_at) = strftime('%Y-%m', 'now')
    GROUP BY store ORDER BY total DESC LIMIT 1
  `).get();

  res.json({
    thisMonth: Math.round((thisMonth?.total || 0) * 100) / 100,
    lastMonth: Math.round((lastMonth?.total || 0) * 100) / 100,
    tripsThisMonth: thisMonth?.trips || 0,
    avgTripCost: Math.round((avgTrip?.avg || 0) * 100) / 100,
    topStore: topStore?.store || null,
    topStoreTotal: Math.round((topStore?.total || 0) * 100) / 100,
  });
});

// POST /api/walmart/scan-receipt - AI scans receipt photo
router.post('/scan-receipt', roleCheck('parent'), async (req, res) => {
  const { imageData, store } = req.body;
  if (!imageData) return res.status(400).json({ error: 'Image required' });

  // Get AI config
  const aiConfig = getDb().prepare('SELECT * FROM ai_config ORDER BY id DESC LIMIT 1').get();
  if (!aiConfig || !aiConfig.api_key) {
    return res.status(400).json({ error: 'AI not configured' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: aiConfig.api_key });

    const response = await client.messages.create({
      model: aiConfig.model || 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: imageData.mediaType || 'image/jpeg', data: imageData.base64 }
          },
          {
            type: 'text',
            text: `Read this store receipt and extract every item with its price. Return ONLY valid JSON in this exact format, no other text:
{"store": "store name from receipt", "date": "YYYY-MM-DD", "items": [{"name": "full item name", "generic_name": "generic product name", "brand": "brand name or store brand", "price": 1.99, "quantity": 1}], "total": 25.99, "tax": 1.50}

IMPORTANT RULES:
- "name": The full readable item name including brand (e.g., "Great Value Whole Milk 1 Gallon")
- "generic_name": The product WITHOUT the brand, normalized for comparison across stores (e.g., "Whole Milk 1 Gallon"). This is key for comparing store brands.
- "brand": The brand name. For store brands use: "Great Value" (Walmart), "Kirkland" (Costco), "Friendly Farms" (Aldi), "Good & Gather" (Target), "365" (Whole Foods), "Market Pantry" (Target), "Clancy's" (Aldi), "Millville" (Aldi), etc. For name brands use the actual brand (e.g., "Coca-Cola", "Kraft").
- Clean up abbreviated names (e.g., "GV WHL MLK GAL" → name: "Great Value Whole Milk 1 Gallon", generic_name: "Whole Milk 1 Gallon", brand: "Great Value")
- If you can't read a price, skip that item.`
          }
        ]
      }],
    });

    const text = response.content[0]?.text || '';
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(400).json({ error: 'Could not read receipt', raw: text });
    }

    const receipt = JSON.parse(jsonMatch[0]);
    const storeName = store || receipt.store || 'Unknown Store';

    // AI normalize: match against existing generic names to merge similar items
    const existingNames = getDb().prepare('SELECT DISTINCT generic_name FROM price_history WHERE generic_name IS NOT NULL').all().map(r => r.generic_name);

    if (existingNames.length > 0 && receipt.items?.length > 0) {
      try {
        const normalizeResponse = await client.messages.create({
          model: aiConfig.model || 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Match these new receipt items to existing product names where they're the same product. Return ONLY valid JSON.

EXISTING PRODUCTS IN DATABASE:
${existingNames.slice(0, 100).join('\n')}

NEW ITEMS TO MATCH:
${receipt.items.map(i => i.generic_name || i.name).join('\n')}

Return a JSON object mapping each new item to its matching existing name, or keep the original if no match:
{"new item name": "matched existing name or original if no match"}

Match rules:
- "Strawberry Pack" and "Strawberries" = same product, use the existing name
- "2% Milk" and "2% Reduced Fat Milk" = same product
- "Guacamole" and "Fresh Guacamole" = same product
- Different sizes ARE different (1 Gallon vs Half Gallon)
- Different flavors ARE different (Vanilla vs Chocolate)
- Only match if truly the same product`
          }]
        });

        const matchText = normalizeResponse.content[0]?.text || '{}';
        const matchJson = matchText.match(/\{[\s\S]*\}/);
        if (matchJson) {
          const matches = JSON.parse(matchJson[0]);
          // Apply matches to receipt items
          receipt.items.forEach(item => {
            const key = item.generic_name || item.name;
            if (matches[key] && matches[key] !== key) {
              item.generic_name = matches[key];
            }
          });
        }
      } catch (e) {
        console.error('AI normalize error:', e.message);
        // Continue without normalization
      }
    }

    // Record prices in history
    const insertPrice = getDb().prepare('INSERT INTO price_history (item_name, price, store, generic_name, brand) VALUES (?, ?, ?, ?, ?)');
    let recorded = 0;
    for (const item of (receipt.items || [])) {
      if (item.name && item.price) {
        insertPrice.run(item.name, item.price, storeName, item.generic_name || item.name, item.brand || null);
        recorded++;
      }
    }

    res.json({
      store: storeName,
      date: receipt.date || new Date().toISOString().split('T')[0],
      items: receipt.items || [],
      total: receipt.total || null,
      tax: receipt.tax || null,
      recorded,
      message: `Scanned ${recorded} items from ${storeName}`
    });
  } catch (err) {
    console.error('Receipt scan error:', err.message);
    res.status(500).json({ error: 'Failed to scan receipt: ' + err.message });
  }
});

// POST /api/walmart/ai-cleanup - AI backfills generic names and merges duplicates
router.post('/ai-cleanup', roleCheck('parent'), async (req, res) => {
  // Step 0: Backfill null generic_names using AI
  const nullItems = getDb().prepare('SELECT DISTINCT item_name, store FROM price_history WHERE generic_name IS NULL').all();
  if (nullItems.length > 0) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const aiConfig = getDb().prepare('SELECT * FROM ai_config ORDER BY id DESC LIMIT 1').get();
      if (aiConfig?.api_key) {
        const client = new Anthropic({ apiKey: aiConfig.api_key });
        const backfillResponse = await client.messages.create({
          model: aiConfig.model || 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `For each grocery item, extract the generic product name (without brand) and the brand name. Return ONLY valid JSON.

ITEMS:
${nullItems.map(i => `${i.item_name} (from ${i.store})`).join('\n')}

Return: [{"item_name": "original name", "generic_name": "product without brand", "brand": "brand name or null"}]

Store brand mappings: Great Value=Walmart, Kirkland=Costco, Friendly Farms/Clancy's/Millville/Simply Nature/Happy Farms=Aldi, Good & Gather/Market Pantry=Target, 365=Whole Foods.
If no brand detected, use the item name as generic_name and brand as null.`
          }]
        });

        const bText = backfillResponse.content[0]?.text || '[]';
        const bMatch = bText.match(/\[[\s\S]*\]/);
        if (bMatch) {
          const backfills = JSON.parse(bMatch[0]);
          const update = getDb().prepare('UPDATE price_history SET generic_name = ?, brand = ? WHERE item_name = ? AND generic_name IS NULL');
          for (const b of backfills) {
            if (b.item_name && b.generic_name) {
              update.run(b.generic_name, b.brand || null, b.item_name);
            }
          }
        }
      }
    } catch (e) {
      console.error('Backfill error:', e.message);
    }
  }
  const aiConfig = getDb().prepare('SELECT * FROM ai_config ORDER BY id DESC LIMIT 1').get();
  if (!aiConfig || !aiConfig.api_key) return res.status(400).json({ error: 'AI not configured' });

  const names = getDb().prepare('SELECT DISTINCT generic_name FROM price_history WHERE generic_name IS NOT NULL ORDER BY generic_name').all().map(r => r.generic_name);
  if (names.length < 2) return res.json({ message: 'Not enough items to clean up', merged: 0 });

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: aiConfig.api_key });

    const response = await client.messages.create({
      model: aiConfig.model || 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `These are product names from a grocery price tracking database. Find duplicates that are the SAME product and should be merged. Return ONLY valid JSON.

PRODUCT NAMES:
${names.join('\n')}

Return a JSON array of merges. Each merge has "keep" (the best canonical name) and "merge" (array of names that should be renamed to "keep"):
[{"keep": "Strawberries", "merge": ["Strawberry Pack", "Fresh Strawberries", "Strawberries 1lb"]}]

Rules:
- Only merge truly identical products (different names for the same thing)
- Keep the most descriptive/clear name
- Different sizes ARE different products
- Different flavors ARE different products
- If no duplicates found, return []`
      }]
    });

    const text = response.content[0]?.text || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const merges = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    let totalMerged = 0;
    const update = getDb().prepare('UPDATE price_history SET generic_name = ? WHERE generic_name = ?');

    for (const merge of merges) {
      if (merge.keep && Array.isArray(merge.merge)) {
        for (const oldName of merge.merge) {
          const result = update.run(merge.keep, oldName);
          totalMerged += result.changes;
        }
      }
    }

    res.json({ message: `Merged ${totalMerged} records across ${merges.length} product groups`, merges });
  } catch (err) {
    console.error('AI cleanup error:', err.message);
    res.status(500).json({ error: 'Cleanup failed: ' + err.message });
  }
});

// POST /api/walmart/receipt-checklist - check off grocery items and add to pantry
router.post('/receipt-checklist', roleCheck('parent'), (req, res) => {
  const { items, addToPantry } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items required' });

  let checked = 0, pantryAdded = 0;
  for (const item of items) {
    // Try to match and check off grocery items
    const grocery = getDb().prepare('SELECT id FROM grocery_items WHERE name LIKE ? COLLATE NOCASE AND is_checked = 0').get(`%${item.name}%`);
    if (grocery) {
      getDb().prepare('UPDATE grocery_items SET is_checked = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(grocery.id);
      checked++;
    }

    // Add to pantry if requested
    if (addToPantry && item.name) {
      const existing = getDb().prepare('SELECT id FROM pantry_items WHERE name = ? COLLATE NOCASE').get(item.name);
      if (existing) {
        getDb().prepare('UPDATE pantry_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(item.quantity || '1', existing.id);
      } else {
        const groceryRouter = require('./groceryRoutes');
        const cat = groceryRouter.categorizeItem ? groceryRouter.categorizeItem(item.name) : 'other';
        const loc = ['dairy', 'meat', 'produce'].includes(cat) ? 'fridge' : cat === 'frozen' ? 'freezer' : 'pantry';
        getDb().prepare('INSERT INTO pantry_items (name, quantity, category, location, added_by) VALUES (?, ?, ?, ?, ?)')
          .run(item.name, item.quantity || '1', cat, loc, req.user.id);
        pantryAdded++;
      }
    }
  }

  res.json({ checked, pantryAdded, message: `Checked off ${checked} items${pantryAdded > 0 ? `, added ${pantryAdded} to pantry` : ''}` });
});

module.exports = router;
