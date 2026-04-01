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

// Gather family context
function getFamilyContext(userId, userRole) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

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
    ? db.prepare("SELECT title, category, priority, status FROM requests WHERE status IN ('open', 'in_progress') AND COALESCE(archived, 0) = 0 ORDER BY created_at DESC LIMIT 10").all()
    : db.prepare("SELECT title, category, priority, status FROM requests WHERE submitted_by = ? AND COALESCE(archived, 0) = 0 ORDER BY created_at DESC LIMIT 10").all(userId);

  const messages = db.prepare('SELECT m.content, u.display_name FROM messages m JOIN users u ON m.user_id = u.id ORDER BY m.created_at DESC LIMIT 5').all();
  const polls = db.prepare("SELECT title, type, restaurant_name FROM polls WHERE status = 'open'").all();

  let ctx = `Today is ${dayName}.\n\nFAMILY: ${members.map(m => `${m.display_name} (${m.role})`).join(', ')}\n\n`;
  ctx += `TODAY'S MEALS: ${meals.length === 0 ? 'None planned' : meals.map(m => `${m.meal_type}: ${m.title}`).join(', ')}\n\n`;
  ctx += `WEEK MEALS:\n${weekMeals.length === 0 ? 'None' : weekMeals.map(m => `${m.meal_date} ${m.meal_type}: ${m.title}`).join('\n')}\n\n`;
  ctx += `GROCERY LIST (${groceryItems.length} items): ${groceryItems.length === 0 ? 'Empty' : groceryItems.map(g => `${g.name} x${g.quantity}`).join(', ')}\n\n`;
  ctx += `OPEN REQUESTS: ${requests.length === 0 ? 'None' : requests.map(r => `[${r.status}] ${r.title} (${r.category})`).join(', ')}\n\n`;
  ctx += `MESSAGE BOARD: ${messages.length === 0 ? 'Empty' : messages.map(m => `${m.display_name}: ${m.content}`).join(' | ')}\n\n`;
  if (polls.length > 0) ctx += `ACTIVE POLLS: ${polls.map(p => p.type === 'food_order' ? `Food: ${p.restaurant_name}` : p.title).join(', ')}\n`;

  return ctx;
}

// Execute AI tool calls
function executeTool(toolName, toolInput, userId, userRole, displayName) {
  const db = getDb();

  switch (toolName) {
    case 'create_request': {
      const { title, category, priority, description } = toolInput;
      const result = db.prepare(`
        INSERT INTO requests (title, description, category, priority, submitted_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(title, description || '', category || 'other', priority || 'normal', userId);

      logActivity(userId, 'created_request', 'request', result.lastInsertRowid, `New request: ${title}`);

      // Notify parents
      const parents = db.prepare("SELECT id FROM users WHERE role = 'parent' AND is_active = 1 AND id != ?").all(userId);
      parents.forEach(p => {
        notify(p.id, 'New Request', `${displayName} submitted: "${title}"`, 'info', result.lastInsertRowid);
      });

      return `Request created: "${title}" (${category || 'other'}, ${priority || 'normal'})`;
    }

    case 'add_grocery_item': {
      if (userRole !== 'parent') return 'Only parents can add grocery items directly. Submit a grocery request instead.';
      const { name, quantity, grocery_category } = toolInput;
      db.prepare('INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)')
        .run(name, quantity || '1', grocery_category || 'other', userId);
      return `Added "${name}" (qty: ${quantity || '1'}) to the grocery list.`;
    }

    case 'post_message': {
      const { content } = toolInput;
      db.prepare('UPDATE messages SET sort_order = sort_order + 1').run();
      db.prepare('INSERT INTO messages (user_id, content, sort_order) VALUES (?, ?, 0)').run(userId, content);
      return `Posted to the message board: "${content}"`;
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

const AI_TOOLS = [
  {
    name: 'create_request',
    description: 'Create a family request/ticket on behalf of the current user. Use this when someone asks to request something, ask for a ride, request permission, suggest a meal, ask for a grocery item, etc.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the request' },
        category: { type: 'string', enum: ['fix_something', 'buy_something', 'permission', 'chore_negotiation', 'allowance', 'ride_request', 'tech_request', 'grocery_item', 'meal_request', 'other'], description: 'Request category' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Priority level' },
        description: { type: 'string', description: 'Additional details' },
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
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const config = getAiConfig();
  if (!config || !config.api_key) {
    return res.status(400).json({ error: 'AI not configured. Ask a parent to set it up in Settings.' });
  }

  const familyContext = getFamilyContext(req.user.id, req.user.role);

  const systemPrompt = `You are the Family HQ Assistant — a helpful, friendly AI for this family. You speak in a warm, casual tone and keep answers concise.

CURRENT USER: ${req.user.displayName} (${req.user.role})

FAMILY DATA:
${familyContext}

CAPABILITIES:
- You can answer questions about family meals, grocery list, requests, schedule, and messages.
- You can CREATE REQUESTS on behalf of the user using the create_request tool. Choose the right category automatically.
- If the user is a parent, you can ADD GROCERY ITEMS directly using add_grocery_item.
- If the user is a teen/child asking for grocery items, create a grocery_item request instead (it needs parent approval).
- You can POST MESSAGES to the family message board using post_message.
- Keep responses short (1-3 sentences). Be fun and family-friendly!`;

  // Build messages array with history
  const messages = [];
  if (Array.isArray(history)) {
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: 'user', content: message });

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
        const result = executeTool(tool.name, tool.input, req.user.id, req.user.role, req.user.displayName);
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
