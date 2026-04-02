const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { getDb, logActivity } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

function getAiConfig() {
  return getDb().prepare('SELECT * FROM ai_config ORDER BY id DESC LIMIT 1').get();
}

function notify(userId, title, message, type, requestId) {
  getDb().prepare('INSERT INTO notifications (user_id, title, message, type, request_id) VALUES (?, ?, ?, ?, ?)')
    .run(userId, title, message, type, requestId);
}

// Fetch Google Calendar events
async function getCalendarEvents() {
  try {
    const { google } = require('googleapis');
    const db = getDb();
    const calConfig = db.prepare('SELECT * FROM google_calendar_config ORDER BY id DESC LIMIT 1').get();
    if (!calConfig || !calConfig.refresh_token) return [];

    const client = new google.auth.OAuth2(calConfig.client_id, calConfig.client_secret, calConfig.redirect_uri);
    client.setCredentials({ access_token: calConfig.access_token, refresh_token: calConfig.refresh_token });

    const calendar = google.calendar({ version: 'v3', auth: client });
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const response = await calendar.events.list({
      calendarId: calConfig.calendar_id || 'primary',
      timeMin: now.toISOString(),
      timeMax: weekEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    return (response.data.items || []).map(e => ({
      title: e.summary || '(No title)',
      date: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      location: e.location || '',
      allDay: !!e.start?.date,
    }));
  } catch (err) {
    console.error('AI calendar fetch error:', err.message);
    return [];
  }
}

// Gather family context
async function getFamilyContext(userId, userRole) {
  const db = getDb();
  const tz = 'America/Chicago';
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD format
  const dayName = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Build explicit date reference for upcoming days so AI doesn't miscalculate
  const upcomingDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz });
    const dayLabel = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
    upcomingDays.push(`${dayLabel} = ${dateStr}`);
  }

  const members = db.prepare("SELECT display_name, role FROM users WHERE is_active = 1 AND role != 'dashboard'").all();
  const meals = db.prepare('SELECT meal_type, title, description FROM meals WHERE meal_date = ?').all(today);

  const weekStart = new Date();
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekMeals = db.prepare('SELECT meal_date, meal_type, title FROM meals WHERE meal_date BETWEEN ? AND ?')
    .all(weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]);

  const groceryItems = db.prepare('SELECT name, quantity, category FROM grocery_items WHERE is_checked = 0 ORDER BY category').all();
  const requests = userRole === 'parent'
    ? db.prepare("SELECT r.id, r.title, r.category, r.priority, r.status, r.description, u.display_name as from_name FROM requests r LEFT JOIN users u ON r.submitted_by = u.id WHERE r.status IN ('open', 'in_progress') AND COALESCE(r.archived, 0) = 0 ORDER BY r.created_at DESC LIMIT 10").all()
    : db.prepare("SELECT id, title, category, priority, status, description FROM requests WHERE submitted_by = ? AND COALESCE(archived, 0) = 0 ORDER BY created_at DESC LIMIT 10").all(userId);

  const messages = db.prepare('SELECT m.content, u.display_name FROM messages m JOIN users u ON m.user_id = u.id ORDER BY m.created_at DESC LIMIT 5').all();
  const polls = db.prepare("SELECT title, type, restaurant_name FROM polls WHERE status = 'open'").all();
  const recipes = db.prepare('SELECT id, title, tags FROM recipes ORDER BY title LIMIT 50').all();
  const pantryItems = db.prepare('SELECT name, quantity, location, low_stock, expiration_date FROM pantry_items ORDER BY location, name').all();
  const expiringItems = db.prepare("SELECT name, expiration_date FROM pantry_items WHERE expiration_date IS NOT NULL AND expiration_date <= date('now', '+3 days') ORDER BY expiration_date").all();

  let ctx = `Today is ${dayName} (${today}).\n\n=== DATE LOOKUP TABLE ===\n${upcomingDays.join('\n')}\n=== END DATE LOOKUP ===\nRULE: When the user says a day name, ALWAYS look it up in the table above and use that EXACT YYYY-MM-DD date. NEVER calculate or add days yourself.\n\nFAMILY: ${members.map(m => `${m.display_name} (${m.role})`).join(', ')}\n\n`;
  ctx += `TODAY'S MEALS: ${meals.length === 0 ? 'None planned' : meals.map(m => `${m.meal_type}: ${m.title}`).join(', ')}\n\n`;
  ctx += `WEEK MEALS:\n${weekMeals.length === 0 ? 'None' : weekMeals.map(m => `${m.meal_date} ${m.meal_type}: ${m.title}`).join('\n')}\n\n`;
  ctx += `GROCERY LIST (${groceryItems.length} items): ${groceryItems.length === 0 ? 'Empty' : groceryItems.map(g => `${g.name} x${g.quantity}`).join(', ')}\n\n`;
  ctx += `OPEN REQUESTS:\n${requests.length === 0 ? 'None' : requests.map(r => `- ID:${r.id} [${r.status}] "${r.title}" (${r.category})${r.from_name ? ` from ${r.from_name}` : ''}`).join('\n')}\n\n`;
  ctx += `MESSAGE BOARD: ${messages.length === 0 ? 'Empty' : messages.map(m => `${m.display_name}: ${m.content}`).join(' | ')}\n\n`;
  if (polls.length > 0) ctx += `ACTIVE POLLS: ${polls.map(p => p.type === 'food_order' ? `Food: ${p.restaurant_name}` : p.title).join(', ')}\n\n`;
  ctx += `RECIPE BOOK (${recipes.length} recipes): ${recipes.length === 0 ? 'Empty' : recipes.map(r => `ID:${r.id} "${r.title}"${r.tags ? ` [${r.tags}]` : ''}`).join(', ')}\n\n`;
  if (pantryItems.length > 0) {
    const byLoc = {};
    pantryItems.forEach(p => { if (!byLoc[p.location]) byLoc[p.location] = []; byLoc[p.location].push(p); });
    ctx += `PANTRY INVENTORY:\n`;
    for (const [loc, items] of Object.entries(byLoc)) {
      ctx += `  ${loc}: ${items.map(i => `${i.name} (${i.quantity})${i.low_stock ? ' [LOW]' : ''}`).join(', ')}\n`;
    }
    ctx += '\n';
  }
  if (expiringItems.length > 0) {
    ctx += `EXPIRING SOON: ${expiringItems.map(e => `${e.name} (${e.expiration_date})`).join(', ')}\n\n`;
  }

  // Calendar events
  const calEvents = await getCalendarEvents();
  if (calEvents.length > 0) {
    ctx += `UPCOMING CALENDAR EVENTS (next 7 days):\n`;
    const tz = 'America/Chicago';
    calEvents.forEach(e => {
      const dateStr = e.allDay
        ? new Date(e.date).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }) + ' (all day)'
        : new Date(e.date).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      ctx += `- ${dateStr}: ${e.title}${e.location ? ` @ ${e.location}` : ''}\n`;
    });
  } else {
    ctx += `CALENDAR: No upcoming events found (calendar may not be connected)\n`;
  }

  return ctx;
}

// Execute AI tool calls
async function executeTool(toolName, toolInput, userId, userRole, displayName) {
  const db = getDb();

  switch (toolName) {
    case 'create_request': {
      const { title, category, priority, description, ride_destination, ride_time, allowance_amount, grocery_category, grocery_quantity, meal_type_requested } = toolInput;
      const result = db.prepare(`
        INSERT INTO requests (title, description, category, priority, submitted_by, ride_destination, ride_time, allowance_amount, grocery_category, grocery_quantity, meal_type_requested)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(title, description || '', category || 'other', priority || 'normal', userId,
        ride_destination || null, ride_time || null, allowance_amount || null,
        grocery_category || null, grocery_quantity || null, meal_type_requested || null);

      logActivity(userId, 'created_request', 'request', result.lastInsertRowid, `New request: ${title}`);

      // Notify parents
      const parents = db.prepare("SELECT id FROM users WHERE role = 'parent' AND is_active = 1 AND id != ?").all(userId);
      parents.forEach(p => {
        notify(p.id, 'New Request', `${displayName} submitted: "${title}"`, 'info', result.lastInsertRowid);
      });

      let confirmation = `Request created: "${title}" (${category || 'other'})`;
      if (ride_destination) confirmation += ` — to ${ride_destination}`;
      if (ride_time) confirmation += ` at ${ride_time}`;
      if (allowance_amount) confirmation += ` — $${allowance_amount}`;
      return confirmation;
    }

    case 'add_grocery_item': {
      if (userRole !== 'parent') return 'Only parents can add grocery items directly. Submit a grocery request instead.';
      const { name, quantity, grocery_category } = toolInput;
      db.prepare('INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)')
        .run(name, quantity || '1', grocery_category || 'other', userId);
      return `Added "${name}" (qty: ${quantity || '1'}) to the grocery list.`;
    }

    case 'add_meal': {
      if (userRole !== 'parent') return 'Only parents can add meals directly. Submit a meal_request instead.';
      const { meal_title, meal_date, meal_type, meal_description, recipe_id } = toolInput;
      db.prepare('INSERT INTO meals (meal_date, meal_type, title, description, recipe_id, created_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(meal_date, meal_type || 'dinner', meal_title, meal_description || '', recipe_id || null, userId);
      logActivity(userId, 'planned_meal', 'meal', null, `${meal_type || 'dinner'}: ${meal_title}`);
      return `Added "${meal_title}" to ${meal_type || 'dinner'} on ${meal_date}.`;
    }

    case 'add_grocery_items': {
      if (userRole !== 'parent') return 'Only parents can add grocery items.';
      const { grocery_items: gItems } = toolInput;
      if (!gItems || !gItems.length) return 'No items to add.';
      const groceryRouter = require('./groceryRoutes');
      let gAdded = 0, gSkipped = 0;
      for (const item of gItems) {
        const name = (item.name || '').trim();
        if (!name) continue;
        const exists = db.prepare('SELECT id FROM grocery_items WHERE name = ? COLLATE NOCASE AND is_checked = 0').get(name);
        if (exists) { gSkipped++; continue; }
        const cat = groceryRouter.categorizeItem ? groceryRouter.categorizeItem(name) : 'other';
        db.prepare('INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)')
          .run(name, item.quantity || '1', cat, userId);
        gAdded++;
      }
      return `Added ${gAdded} items to grocery list${gSkipped > 0 ? ` (${gSkipped} already on list)` : ''}.`;
    }

    case 'add_recipe_to_grocery': {
      if (userRole !== 'parent') return 'Only parents can add to the grocery list.';
      const { recipe_name: grRecipeName, ingredients: grIngredients } = toolInput;
      if (!grIngredients || !grIngredients.length) return 'No ingredients provided.';

      let added = 0, skipped = 0;
      for (const item of grIngredients) {
        const name = (typeof item === 'string' ? item : item.name || '').trim();
        if (!name) continue;
        const exists = db.prepare('SELECT id FROM grocery_items WHERE name = ? COLLATE NOCASE AND is_checked = 0').get(name);
        if (exists) { skipped++; continue; }
        const qty = typeof item === 'object' ? (item.quantity || '1') : '1';
        // Auto-categorize
        const groceryRouter = require('./groceryRoutes');
        const cat = groceryRouter.categorizeItem ? groceryRouter.categorizeItem(name) : 'other';
        db.prepare('INSERT INTO grocery_items (name, quantity, category, added_by, for_recipe) VALUES (?, ?, ?, ?, ?)')
          .run(name, qty, cat, userId, grRecipeName || null);
        added++;
      }
      return `Added ${added} ingredients to grocery list for "${grRecipeName || 'recipe'}"${skipped > 0 ? ` (${skipped} already on list)` : ''}.`;
    }

    case 'add_pantry_items': {
      if (userRole !== 'parent') return 'Only parents can add pantry items.';
      const { items: pantryItems } = toolInput;
      if (!pantryItems || !pantryItems.length) return 'No items to add.';
      let added = 0, updated = 0;
      for (const item of pantryItems) {
        const name = (item.name || '').trim();
        if (!name) continue;
        const existing = db.prepare('SELECT id FROM pantry_items WHERE name = ? COLLATE NOCASE').get(name);
        if (existing) {
          db.prepare('UPDATE pantry_items SET quantity = ?, location = COALESCE(?, location), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(item.quantity || '1', item.location || null, existing.id);
          updated++;
        } else {
          db.prepare('INSERT INTO pantry_items (name, quantity, category, location, added_by) VALUES (?, ?, ?, ?, ?)')
            .run(name, item.quantity || '1', item.category || 'other', item.location || 'pantry', userId);
          added++;
        }
      }
      return `Pantry updated: ${added} new items added${updated > 0 ? `, ${updated} existing items updated` : ''}.`;
    }

    case 'add_recipe': {
      if (userRole !== 'parent') return 'Only parents can add recipes.';
      const { recipe_title, recipe_description, recipe_ingredients, recipe_instructions, recipe_prep_time, recipe_cook_time, recipe_servings, recipe_tags } = toolInput;
      const result = db.prepare('INSERT INTO recipes (title, description, ingredients, instructions, prep_time, cook_time, servings, tags, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(recipe_title, recipe_description || '', recipe_ingredients || '', recipe_instructions || '', recipe_prep_time || '', recipe_cook_time || '', recipe_servings || '', recipe_tags || '', userId);
      return `Added recipe "${recipe_title}" to the recipe book (ID: ${result.lastInsertRowid}).`;
    }

    case 'post_message': {
      const { content } = toolInput;
      db.prepare('UPDATE messages SET sort_order = sort_order + 1').run();
      db.prepare('INSERT INTO messages (user_id, content, sort_order) VALUES (?, ?, 0)').run(userId, content);
      return `Posted to the message board: "${content}"`;
    }

    case 'approve_request': {
      if (userRole !== 'parent') return 'Only parents can approve requests.';
      const { request_id, parent_note } = toolInput;
      const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(request_id);
      if (!req) return `Request #${request_id} not found.`;
      if (req.status !== 'open' && req.status !== 'in_progress') return `Request "${req.title}" is already ${req.status}.`;

      db.prepare("UPDATE requests SET status = 'approved', parent_note = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(parent_note || null, userId, request_id);

      // Auto-add grocery item if grocery_item request
      if (req.category === 'grocery_item') {
        db.prepare('INSERT INTO grocery_items (name, quantity, category, added_by, requested_by) VALUES (?, ?, ?, ?, ?)')
          .run(req.title, req.grocery_quantity || '1', req.grocery_category || 'other', userId, req.submitted_by);
      }

      // Ride request → create Google Calendar event
      let calendarAdded = false;
      if (req.category === 'ride_request' && req.ride_time) {
        try {
          const { google } = require('googleapis');
          const calConfig = db.prepare('SELECT * FROM google_calendar_config ORDER BY id DESC LIMIT 1').get();
          if (calConfig && calConfig.refresh_token) {
            const oauthClient = new google.auth.OAuth2(calConfig.client_id, calConfig.client_secret, calConfig.redirect_uri);
            oauthClient.setCredentials({ access_token: calConfig.access_token, refresh_token: calConfig.refresh_token });

            const submitter = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.submitted_by);

            // Parse ride_time as local time string — don't convert through UTC
            // ride_time comes as "2026-04-03T19:00" or similar
            let rideTimeStr = req.ride_time;
            // Ensure it has seconds
            if (rideTimeStr && !rideTimeStr.includes(':00:')) {
              if (rideTimeStr.split(':').length === 2) rideTimeStr += ':00';
            }
            // Build end time (1 hour later)
            const timeParts = rideTimeStr.match(/(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
            let endTimeStr = rideTimeStr;
            if (timeParts) {
              const endHour = (parseInt(timeParts[2]) + 1) % 24;
              endTimeStr = `${timeParts[1]}T${String(endHour).padStart(2, '0')}:${timeParts[3]}:00`;
            }

            const calendar = google.calendar({ version: 'v3', auth: oauthClient });
            await calendar.events.insert({
              calendarId: calConfig.calendar_id || 'primary',
              requestBody: {
                summary: `Ride: ${submitter?.display_name || 'Someone'} - ${req.title}`,
                description: req.description || '',
                location: req.ride_destination || '',
                start: { dateTime: rideTimeStr, timeZone: 'America/Chicago' },
                end: { dateTime: endTimeStr, timeZone: 'America/Chicago' },
              },
            });
            calendarAdded = true;
          }
        } catch (err) {
          console.error('AI: Failed to create calendar event for ride:', err.message);
        }
      }

      // Notify requester
      notify(req.submitted_by, 'Request Approved!', `Your request "${req.title}" has been approved${parent_note ? ': ' + parent_note : ''}`, 'approved', request_id);

      // Mark parent notifications as read
      db.prepare('UPDATE notifications SET is_read = 1 WHERE request_id = ? AND user_id = ? AND is_read = 0').run(request_id, userId);

      logActivity(userId, 'approved_request', 'request', request_id, `${req.title} → approved`);
      let result = `Approved request "${req.title}"`;
      if (req.category === 'grocery_item') result += ' and added to grocery list';
      if (calendarAdded) result += ' and added to the calendar';
      return result + '.';
    }

    case 'deny_request': {
      if (userRole !== 'parent') return 'Only parents can deny requests.';
      const { request_id: denyId, reason } = toolInput;
      const dReq = db.prepare('SELECT * FROM requests WHERE id = ?').get(denyId);
      if (!dReq) return `Request #${denyId} not found.`;
      if (dReq.status !== 'open' && dReq.status !== 'in_progress') return `Request "${dReq.title}" is already ${dReq.status}.`;

      db.prepare("UPDATE requests SET status = 'denied', parent_note = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(reason || null, userId, denyId);

      notify(dReq.submitted_by, 'Request Denied', `Your request "${dReq.title}" was denied${reason ? ': ' + reason : ''}`, 'denied', denyId);
      db.prepare('UPDATE notifications SET is_read = 1 WHERE request_id = ? AND user_id = ? AND is_read = 0').run(denyId, userId);

      logActivity(userId, 'denied_request', 'request', denyId, `${dReq.title} → denied`);
      return `Denied request "${dReq.title}"${reason ? ` — ${reason}` : ''}.`;
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

const AI_TOOLS = [
  {
    name: 'create_request',
    description: 'Create a family request/ticket on behalf of the current user. Use this when someone asks to request something, ask for a ride, request permission, suggest a meal, ask for a grocery item, etc. For ride_request, always include ride_destination and ride_time. For allowance, include allowance_amount. For grocery_item, include grocery_category and grocery_quantity. For meal_request, include meal_type_requested.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the request (e.g., "Soccer practice", "Chocolate milk", "Tacos")' },
        category: { type: 'string', enum: ['fix_something', 'buy_something', 'permission', 'chore_negotiation', 'allowance', 'ride_request', 'tech_request', 'grocery_item', 'meal_request', 'other'], description: 'Request category' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Priority level' },
        description: { type: 'string', description: 'Additional details' },
        ride_destination: { type: 'string', description: 'For ride_request: where to (e.g., "Jake\'s house", "Soccer field")' },
        ride_time: { type: 'string', description: 'For ride_request: CRITICAL: Look up the date from DATE REFERENCE, then append the time. Format: YYYY-MM-DDTHH:MM. Example: if Saturday = 2026-04-04 and user says 7pm, use "2026-04-04T19:00". Do NOT calculate dates yourself.' },
        allowance_amount: { type: 'string', description: 'For allowance: dollar amount (e.g., "10.00")' },
        grocery_category: { type: 'string', enum: ['produce', 'dairy', 'meat', 'bakery', 'frozen', 'pantry', 'beverages', 'snacks', 'household', 'other'], description: 'For grocery_item: aisle/category' },
        grocery_quantity: { type: 'string', description: 'For grocery_item: quantity (e.g., "2", "1 gallon")' },
        meal_type_requested: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'For meal_request: which meal' },
      },
      required: ['title', 'category'],
    },
  },
  {
    name: 'add_grocery_item',
    description: 'Add an item to the grocery list. Only works for parent users. For non-parents, create a grocery_item request instead.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Item name' },
        quantity: { type: 'string', description: 'Quantity (e.g., "2", "1 gallon")' },
        grocery_category: { type: 'string', enum: ['produce', 'dairy', 'meat', 'bakery', 'frozen', 'pantry', 'beverages', 'snacks', 'household', 'other'] },
      },
      required: ['name'],
    },
  },
  {
    name: 'post_message',
    description: 'Post a message to the family message board.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Message content' },
      },
      required: ['content'],
    },
  },
  {
    name: 'add_meal',
    description: 'Add a meal to the family meal planner for a specific date and meal type. Only works for parent users. For non-parents, create a meal_request instead. Can optionally link to a recipe by ID.',
    input_schema: {
      type: 'object',
      properties: {
        meal_title: { type: 'string', description: 'Name of the meal (e.g., "Spaghetti & Meatballs")' },
        meal_date: { type: 'string', description: 'Date in YYYY-MM-DD format. CRITICAL: You MUST look up the exact date from the DATE REFERENCE list in the system context. Do NOT calculate or guess dates. Copy the date string exactly as shown next to the day name.' },
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'Which meal slot' },
        meal_description: { type: 'string', description: 'Optional notes' },
        recipe_id: { type: 'integer', description: 'Optional recipe ID from the recipe book to link' },
      },
      required: ['meal_title', 'meal_date', 'meal_type'],
    },
  },
  {
    name: 'add_grocery_items',
    description: 'Add multiple items to the grocery/shopping list at once. Use when the user shares a photo of items they need to buy, or lists multiple items. Auto-categorizes and skips duplicates.',
    input_schema: {
      type: 'object',
      properties: {
        grocery_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Item name' },
              quantity: { type: 'string', description: 'Quantity needed' },
            },
            required: ['name'],
          },
        },
      },
      required: ['grocery_items'],
    },
  },
  {
    name: 'add_pantry_items',
    description: 'Add multiple items to the family pantry inventory. Use when the user shares a photo of their fridge, freezer, or pantry shelves, or tells you what they have. Identify each item with estimated quantity and the storage location. Updates existing items if they already exist.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Item name (e.g., "whole milk", "cheddar cheese")' },
              quantity: { type: 'string', description: 'Estimated quantity (e.g., "1 gallon", "2 bags", "half full")' },
              location: { type: 'string', enum: ['fridge', 'freezer', 'pantry', 'cabinet', 'counter'], description: 'Where it is stored' },
              category: { type: 'string', enum: ['produce', 'dairy', 'meat', 'bakery', 'frozen', 'pantry', 'beverages', 'snacks', 'household', 'other'] },
            },
            required: ['name'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'add_recipe_to_grocery',
    description: 'Add recipe ingredients to the grocery/shopping list. Only for parents. Checks for duplicates — items already on the list are skipped. Tags each item with the recipe name. Use this when adding a meal to the planner if the user wants ingredients added, or when explicitly asked to shop for a recipe.',
    input_schema: {
      type: 'object',
      properties: {
        recipe_name: { type: 'string', description: 'Name of the recipe these ingredients are for' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Ingredient name (e.g., "chicken breast")' },
              quantity: { type: 'string', description: 'Amount needed (e.g., "2 lbs", "1 cup")' },
            },
            required: ['name'],
          },
          description: 'List of ingredients to add',
        },
      },
      required: ['recipe_name', 'ingredients'],
    },
  },
  {
    name: 'add_recipe',
    description: 'Add a recipe to the family recipe book. Only works for parent users. Include ingredients and instructions.',
    input_schema: {
      type: 'object',
      properties: {
        recipe_title: { type: 'string', description: 'Recipe name' },
        recipe_description: { type: 'string', description: 'Short description' },
        recipe_ingredients: { type: 'string', description: 'List of ingredients, one per line' },
        recipe_instructions: { type: 'string', description: 'Step-by-step instructions, one per line' },
        recipe_prep_time: { type: 'string', description: 'Prep time (e.g., "15 min")' },
        recipe_cook_time: { type: 'string', description: 'Cook time (e.g., "30 min")' },
        recipe_servings: { type: 'string', description: 'Number of servings (e.g., "4")' },
        recipe_tags: { type: 'string', description: 'Comma-separated tags (e.g., "chicken, quick, healthy")' },
      },
      required: ['recipe_title'],
    },
  },
  {
    name: 'approve_request',
    description: 'Approve an open family request. Only works for parent users. Use the request ID from the OPEN REQUESTS list. For grocery_item requests this also adds the item to the grocery list automatically.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'integer', description: 'The ID of the request to approve' },
        parent_note: { type: 'string', description: 'Optional note to include with the approval' },
      },
      required: ['request_id'],
    },
  },
  {
    name: 'deny_request',
    description: 'Deny/reject an open family request. Only works for parent users. Use the request ID from the OPEN REQUESTS list.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'integer', description: 'The ID of the request to deny' },
        reason: { type: 'string', description: 'Reason for denying the request' },
      },
      required: ['request_id'],
    },
  },
];

// GET /api/ai/status
router.get('/status', (req, res) => {
  const config = getAiConfig();
  res.json({
    configured: !!(config && config.api_key),
    provider: config?.provider || 'claude',
    model: config?.model || 'claude-sonnet-4-20250514',
  });
});

// PUT /api/ai/config - parent only
router.put('/config', roleCheck('parent'), (req, res) => {
  const { provider, apiKey, model } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API key required' });

  const existing = getDb().prepare('SELECT id FROM ai_config ORDER BY id DESC LIMIT 1').get();
  if (existing) {
    getDb().prepare('UPDATE ai_config SET provider = ?, api_key = ?, model = ? WHERE id = ?')
      .run(provider || 'claude', apiKey, model || 'claude-sonnet-4-20250514', existing.id);
  } else {
    getDb().prepare('INSERT INTO ai_config (provider, api_key, model) VALUES (?, ?, ?)')
      .run(provider || 'claude', apiKey, model || 'claude-sonnet-4-20250514');
  }
  res.json({ message: 'AI config saved' });
});

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  const { message, history, imageData } = req.body;
  if (!message && !imageData) return res.status(400).json({ error: 'message or image required' });

  const config = getAiConfig();
  if (!config || !config.api_key) {
    return res.status(400).json({ error: 'AI not configured. Ask a parent to set it up in Settings.' });
  }

  const familyContext = await getFamilyContext(req.user.id, req.user.role);

  const systemPrompt = `You are the Family HQ Assistant — a helpful, friendly AI for this family. You speak in a warm, casual tone and keep answers concise.

CURRENT USER: ${req.user.displayName} (${req.user.role})

FAMILY DATA:
${familyContext}

CAPABILITIES:
- You can answer questions about family meals, grocery list, requests, schedule, calendar, and messages.
- You can CREATE REQUESTS on behalf of the user using the create_request tool. Choose the right category automatically.
- If the user is a parent, you can ADD GROCERY ITEMS directly using add_grocery_item.
- If the user is a teen/child asking for grocery items, create a grocery_item request instead (it needs parent approval).
- You can POST MESSAGES to the family message board using post_message.
- If the user is a PARENT, you can ADD MEALS to the planner using add_meal. For teens/children, create a meal_request instead.
- If the user is a PARENT, you can ADD RECIPES to the recipe book using add_recipe. When adding a recipe, include ingredients and instructions.
- When adding a meal, you can optionally link it to a recipe from the RECIPE BOOK by recipe ID.
- If the user is a PARENT, you can ADD RECIPE INGREDIENTS TO THE GROCERY LIST using add_recipe_to_grocery. This checks for duplicates automatically. Each item is tagged with the recipe name. When adding a meal with a recipe, proactively ask if they want the ingredients added to the shopping list.
- If the user is a PARENT, you can ADD ITEMS TO THE PANTRY using add_pantry_items. Use this when the user shares a photo of their fridge/pantry or tells you what they have. Identify each item with quantity, location, and category.
- When the user shares a photo of food items, identify everything visible and ASK: "Would you like me to add these to your pantry inventory, your grocery list, or both?"
- If the user is a PARENT, you can APPROVE or DENY open requests using approve_request and deny_request tools. Use the request ID from the OPEN REQUESTS list. When approving grocery_item requests, the item is automatically added to the grocery list.
- When approving/denying, the requester is automatically notified.
- Keep responses short (1-3 sentences). Be fun and family-friendly!`;

  // Build messages array with history
  const messages = [];
  if (Array.isArray(history)) {
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  // Build user message with optional image
  if (imageData) {
    const content = [];
    if (message) content.push({ type: 'text', text: message });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: imageData.mediaType || 'image/jpeg', data: imageData.base64 }
    });
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: message });
  }

  try {
    const client = new Anthropic({ apiKey: config.api_key });

    // First call - may return tool use
    let response = await client.messages.create({
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systemPrompt,
      tools: AI_TOOLS,
      messages,
    });

    // Handle tool use loop (max 3 iterations)
    let iterations = 0;
    const actions = [];

    while (response.stop_reason === 'tool_use' && iterations < 3) {
      iterations++;
      const toolBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const tool of toolBlocks) {
        const result = await executeTool(tool.name, tool.input, req.user.id, req.user.role, req.user.displayName);
        actions.push({ tool: tool.name, input: tool.input, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result,
        });
      }

      // Continue conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await client.messages.create({
        model: config.model || 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: systemPrompt,
        tools: AI_TOOLS,
        messages,
      });
    }

    const textBlocks = response.content.filter(b => b.type === 'text');
    const reply = textBlocks.map(b => b.text).join('\n') || 'Done!';

    res.json({ reply, actions });
  } catch (err) {
    console.error('AI chat error:', err.message);
    res.status(500).json({ error: 'AI request failed: ' + err.message });
  }
});

module.exports = router;
