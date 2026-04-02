const express = require('express');
const { getDb, logActivity } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

// Track item in history for autocomplete
function trackHistory(name, category, quantity) {
  const existing = getDb().prepare('SELECT id, use_count FROM grocery_history WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    getDb().prepare('UPDATE grocery_history SET use_count = use_count + 1, last_used = CURRENT_TIMESTAMP, category = ?, quantity = ? WHERE id = ?')
      .run(category, quantity, existing.id);
  } else {
    getDb().prepare('INSERT INTO grocery_history (name, category, quantity) VALUES (?, ?, ?)').run(name, category, quantity);
  }
}

// GET /api/grocery - everyone can view
router.get('/', (req, res) => {
  const items = getDb().prepare(`
    SELECT g.*, u.display_name as added_by_name, u.avatar_emoji as added_by_emoji, u.avatar_url as added_by_avatar_url,
      u2.display_name as requested_by_name, u2.avatar_emoji as requested_by_emoji, u2.avatar_url as requested_by_avatar_url,
      p.id as pantry_id, p.quantity as pantry_quantity, p.location as pantry_location,
      ph.price as last_price, ph.store as last_store
    FROM grocery_items g
    LEFT JOIN users u ON g.added_by = u.id
    LEFT JOIN users u2 ON g.requested_by = u2.id
    LEFT JOIN pantry_items p ON LOWER(g.name) = LOWER(p.name)
    LEFT JOIN price_history ph ON ph.id = (SELECT ph2.id FROM price_history ph2 WHERE LOWER(ph2.item_name) = LOWER(g.name) ORDER BY ph2.recorded_at DESC LIMIT 1)
    ORDER BY g.is_checked ASC, COALESCE(g.on_hand, 0) ASC, g.category ASC, g.created_at DESC
  `).all();
  res.json(items);
});

// GET /api/grocery/autocomplete?q=mil
router.get('/autocomplete', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.json([]);
  const items = getDb().prepare(`
    SELECT name, category, quantity FROM grocery_history
    WHERE name LIKE ? COLLATE NOCASE
    ORDER BY use_count DESC, last_used DESC
    LIMIT 10
  `).all(`%${q}%`);
  res.json(items);
});

// GET /api/grocery/archives - list past lists
router.get('/archives', (req, res) => {
  const archives = getDb().prepare(`
    SELECT a.*, u.display_name as archived_by_name
    FROM grocery_archives a
    LEFT JOIN users u ON a.archived_by = u.id
    ORDER BY a.created_at DESC
    LIMIT 20
  `).all();
  res.json(archives);
});

// GET /api/grocery/archives/:id - get items from a past list
router.get('/archives/:id', (req, res) => {
  const archive = getDb().prepare('SELECT * FROM grocery_archives WHERE id = ?').get(req.params.id);
  if (!archive) return res.status(404).json({ error: 'Archive not found' });
  const items = getDb().prepare('SELECT * FROM grocery_archive_items WHERE archive_id = ? ORDER BY category, name').all(req.params.id);
  res.json({ ...archive, items });
});

// POST /api/grocery/archives - archive current list & clear checked
router.post('/archives', roleCheck('parent'), (req, res) => {
  const { label } = req.body;
  const checkedItems = getDb().prepare('SELECT * FROM grocery_items WHERE is_checked = 1').all();

  if (checkedItems.length === 0) {
    return res.status(400).json({ error: 'No checked items to archive' });
  }

  const archiveLabel = label || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const result = getDb().prepare('INSERT INTO grocery_archives (label, archived_by, item_count) VALUES (?, ?, ?)')
    .run(archiveLabel, req.user.id, checkedItems.length);

  const insertItem = getDb().prepare('INSERT INTO grocery_archive_items (archive_id, name, quantity, category) VALUES (?, ?, ?, ?)');
  for (const item of checkedItems) {
    insertItem.run(result.lastInsertRowid, item.name, item.quantity, item.category);
  }

  // Clear checked items
  getDb().prepare('DELETE FROM grocery_items WHERE is_checked = 1').run();

  logActivity(req.user.id, 'archived_grocery', 'grocery', result.lastInsertRowid, `Archived ${checkedItems.length} items`);
  res.status(201).json({ id: result.lastInsertRowid, message: `Archived ${checkedItems.length} items`, label: archiveLabel });
});

// POST /api/grocery/archives/:id/restore - re-add all items from an archive
router.post('/archives/:id/restore', roleCheck('parent'), (req, res) => {
  const archive = getDb().prepare('SELECT * FROM grocery_archives WHERE id = ?').get(req.params.id);
  if (!archive) return res.status(404).json({ error: 'Archive not found' });

  const items = getDb().prepare('SELECT * FROM grocery_archive_items WHERE archive_id = ?').all(req.params.id);
  const insert = getDb().prepare('INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)');

  let added = 0;
  for (const item of items) {
    // Skip if already on the current list
    const exists = getDb().prepare('SELECT id FROM grocery_items WHERE name = ? COLLATE NOCASE AND is_checked = 0').get(item.name);
    if (!exists) {
      insert.run(item.name, item.quantity, item.category, req.user.id);
      added++;
    }
  }

  logActivity(req.user.id, 'restored_grocery', 'grocery', archive.id, `Re-added ${added} items from "${archive.label}"`);
  res.json({ message: `Added ${added} items (${items.length - added} already on list)` });
});

// POST /api/grocery/archives/:id/restore-item - re-add a single item
router.post('/archives/:id/restore-item', roleCheck('parent'), (req, res) => {
  const { name, quantity, category } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const exists = getDb().prepare('SELECT id FROM grocery_items WHERE name = ? COLLATE NOCASE AND is_checked = 0').get(name);
  if (exists) return res.json({ message: 'Item already on list' });

  getDb().prepare('INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)')
    .run(name, quantity || '1', category || 'other', req.user.id);
  trackHistory(name, category || 'other', quantity || '1');

  res.status(201).json({ message: 'Item added' });
});

// POST /api/grocery - parent only
router.post('/', roleCheck('parent'), (req, res) => {
  const { name, quantity, category, forRecipe } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const cat = (category && category !== 'other') ? category : categorizeItem(name);
  const result = getDb().prepare(`
    INSERT INTO grocery_items (name, quantity, category, added_by, for_recipe)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, quantity || '1', cat, req.user.id, forRecipe || null);

  trackHistory(name, category || 'other', quantity || '1');
  logActivity(req.user.id, 'added_grocery', 'grocery', result.lastInsertRowid, name);

  const item = getDb().prepare(`
    SELECT g.*, u.display_name as added_by_name, u.avatar_emoji as added_by_emoji
    FROM grocery_items g LEFT JOIN users u ON g.added_by = u.id WHERE g.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(item);
});

// PUT /api/grocery/:id - parent only
router.put('/:id', roleCheck('parent'), (req, res) => {
  const { name, quantity, category } = req.body;
  const item = getDb().prepare('SELECT * FROM grocery_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  getDb().prepare(`
    UPDATE grocery_items SET
      name = COALESCE(?, name),
      quantity = COALESCE(?, quantity),
      category = COALESCE(?, category),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, quantity, category, req.params.id);

  res.json({ message: 'Item updated' });
});

// PATCH /api/grocery/:id/check - parent only
router.patch('/:id/check', roleCheck('parent'), (req, res) => {
  const item = getDb().prepare('SELECT * FROM grocery_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const newChecked = item.is_checked ? 0 : 1;
  getDb().prepare(`
    UPDATE grocery_items SET is_checked = ?, checked_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(newChecked, newChecked ? req.user.id : null, req.params.id);

  res.json({ isChecked: !!newChecked });
});

// PATCH /api/grocery/:id/on-hand - mark as already have it
router.patch('/:id/on-hand', roleCheck('parent'), (req, res) => {
  const item = getDb().prepare('SELECT * FROM grocery_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const newVal = item.on_hand ? 0 : 1;
  getDb().prepare('UPDATE grocery_items SET on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newVal, req.params.id);
  res.json({ onHand: !!newVal });
});

// DELETE /api/grocery/:id - parent only
router.delete('/:id', roleCheck('parent'), (req, res) => {
  getDb().prepare('DELETE FROM grocery_items WHERE id = ?').run(req.params.id);
  res.json({ message: 'Item deleted' });
});

// DELETE /api/grocery/checked/clear - parent only (no archive)
router.delete('/checked/clear', roleCheck('parent'), (req, res) => {
  const result = getDb().prepare('DELETE FROM grocery_items WHERE is_checked = 1').run();
  res.json({ message: `Cleared ${result.changes} items` });
});

// Auto-categorize grocery items by keyword matching
function categorizeItem(name) {
  const n = name.toLowerCase();

  // Pantry-specific compounds FIRST (before produce catches "olive", "pepper", etc.)
  if (/\b(olive oil|vegetable oil|canola oil|sesame oil|coconut oil|cooking oil|oil\b)/i.test(n)) return 'pantry';
  if (/\b(red wine vinegar|balsamic vinegar|apple cider vinegar|white vinegar|rice vinegar|vinegar)/i.test(n)) return 'pantry';
  if (/\b(salt and pepper|salt & pepper|black pepper|ground pepper|pepper flake|red pepper flake)/i.test(n)) return 'pantry';
  if (/\b(dried oregano|dried basil|dried thyme|dried parsley|dried dill|dried rosemary)/i.test(n)) return 'pantry';
  if (/\b(lemon juice|lime juice|orange juice concentrate)/i.test(n)) return 'pantry';

  // Produce (allow plurals/suffixes: tomato matches tomatoes, diced, etc.)
  if (/\b(lettuc|tomato|onion|garlic|pepper[s,\s]|potato|carrot|celer|broccol|spinach|kale|cucumber|avocado|mushroom|zucchini|squash|corn\b|bean sprout|cilantro|parsley|basil|mint\b|ginger|lemon|lime\b|orange|apple|banana|grape|strawberr|blueberr|raspberr|mango|pineapple|peach|pear\b|melon|watermelon|berr|fruit|vegetab|salad|herb|scallion|shallot|jalape|cabbage|cauliflower|asparagus|artichoke|beet|radish|turnip|sweet potato|green bean|snap pea|bell pepper|chil[li]|fresh |olive[s,\s]|arugula|romaine|endive|fennel|leek|chive|dill\b|rosemary|thyme|sage\b)/i.test(n) && !/oil|vinegar|dried|juice/i.test(n)) return 'produce';

  // Meat
  if (/\b(chicken|beef|pork|steak|ground|turkey|bacon|sausage|ham|lamb|meat|rib[s ]|roast|tenderloin|breast|thigh|wing|drumstick|salmon|tuna|shrimp|fish|cod|tilapia|crab|lobster|seafood|meatball|hot dog|brisket|chuck)/i.test(n)) return 'meat';

  // Dairy
  if (/\b(milk|cheese|butter|cream|yogurt|sour cream|egg[s,\b]|cream cheese|mozzarella|cheddar|parmesan|ricotta|cottage cheese|whipping cream|half and half|heavy cream|feta)/i.test(n)) return 'dairy';

  // Bakery
  if (/\b(bread|roll[s\b]|bun[s\b]|bagel|tortilla|pita|croissant|muffin|cake|pie crust|dough|biscuit|english muffin|flatbread|naan|wrap)/i.test(n)) return 'bakery';

  // Frozen
  if (/\b(frozen|ice cream|pizza|waffle|french fries|tater tot|popsicle)/i.test(n)) return 'frozen';

  // Beverages
  if (/\b(juice|soda|water|coffee|tea\b|drink|wine|beer|lemonade|gatorade)/i.test(n) && !/coconut|almond|vinegar/i.test(n)) return 'beverages';

  // Snacks
  if (/\b(chip[s\b]|cracker|cookie|candy|chocolate|popcorn|pretzel|granola bar|trail mix|snack|goldfish)/i.test(n)) return 'snacks';

  // Household
  if (/\b(paper towel|toilet paper|soap|detergent|trash bag|foil|plastic wrap|sponge|bleach|cleaner|wipe|napkin|tissue|laundry|dish soap|ziploc)/i.test(n)) return 'household';

  // Pantry (broad catch for shelf-stable items)
  if (/\b(flour|sugar|salt|oil|vinegar|soy sauce|ketchup|mustard|mayo|hot sauce|worcestershire|pasta|noodle|rice|quinoa|oat|cereal|pancake|syrup|honey|jam|jelly|peanut butter|canned|broth|stock|sauce|tomato sauce|tomato paste|bean[s\b]|lentil|chickpea|spice|season|cumin|paprika|oregano|cinnamon|nutmeg|baking|vanilla|cornstarch|breadcrumb|panko|crouton|soup|ramen|taco|salsa|dressing|marinade|coconut milk|almond milk|red wine vinegar|dried|hummus|tahini)/i.test(n)) return 'pantry';

  // Check grocery history for previously categorized items
  const history = getDb().prepare('SELECT category FROM grocery_history WHERE name = ? COLLATE NOCASE').get(name);
  if (history && history.category !== 'other') return history.category;

  return 'other';
}

// POST /api/grocery/from-recipe - add recipe ingredients to grocery list (parent only)
router.post('/from-recipe', roleCheck('parent'), (req, res) => {
  const { items, recipeName } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items array required' });

  let added = 0, skipped = 0;
  const insert = getDb().prepare('INSERT INTO grocery_items (name, quantity, category, added_by, for_recipe) VALUES (?, ?, ?, ?, ?)');

  for (const item of items) {
    if (!item.name || !item.name.trim()) continue;
    // Check for duplicates (case-insensitive, unchecked items only)
    const exists = getDb().prepare('SELECT id FROM grocery_items WHERE name = ? COLLATE NOCASE AND is_checked = 0').get(item.name.trim());
    if (exists) {
      skipped++;
      continue;
    }
    const cat = item.category || categorizeItem(item.name.trim());
    insert.run(item.name.trim(), item.quantity || '1', cat, req.user.id, recipeName || null);
    trackHistory(item.name.trim(), cat, item.quantity || '1');
    added++;
  }

  logActivity(req.user.id, 'added_grocery', 'grocery', null, `${added} items from recipe "${recipeName || 'unknown'}"`);
  res.json({ message: `Added ${added} items${skipped > 0 ? `, ${skipped} already on list` : ''}` });
});

router.categorizeItem = categorizeItem;
module.exports = router;
