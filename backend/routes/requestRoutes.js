const express = require('express');
const { google } = require('googleapis');
const { getDb, logActivity } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function notify(userId, title, message, type, requestId) {
  getDb().prepare(`
    INSERT INTO notifications (user_id, title, message, type, request_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, title, message, type, requestId);
}

// GET /api/requests
router.get('/', (req, res) => {
  const { status, category, priority, archived, page = 1, limit = 50 } = req.query;
  let sql = `
    SELECT r.*,
      u1.display_name as submitted_by_name, u1.avatar_emoji as submitted_by_emoji,
      u2.display_name as assigned_to_name
    FROM requests r
    LEFT JOIN users u1 ON r.submitted_by = u1.id
    LEFT JOIN users u2 ON r.assigned_to = u2.id
    WHERE 1=1
  `;
  const params = [];

  // Filter archived
  if (archived === '1') {
    sql += ' AND COALESCE(r.archived, 0) = 1';
  } else {
    sql += ' AND COALESCE(r.archived, 0) = 0';
  }

  if (req.user.role !== 'parent') {
    sql += ' AND r.submitted_by = ?';
    params.push(req.user.id);
  }

  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  if (category) { sql += ' AND r.category = ?'; params.push(category); }
  if (priority) { sql += ' AND r.priority = ?'; params.push(priority); }

  sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const requests = getDb().prepare(sql).all(...params);
  res.json(requests);
});

// GET /api/requests/:id
router.get('/:id', (req, res) => {
  const request = getDb().prepare(`
    SELECT r.*,
      u1.display_name as submitted_by_name, u1.avatar_emoji as submitted_by_emoji,
      u2.display_name as assigned_to_name
    FROM requests r
    LEFT JOIN users u1 ON r.submitted_by = u1.id
    LEFT JOIN users u2 ON r.assigned_to = u2.id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!request) return res.status(404).json({ error: 'Request not found' });

  if (req.user.role !== 'parent' && request.submitted_by !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const comments = getDb().prepare(`
    SELECT c.*, u.display_name, u.avatar_emoji, u.role
    FROM request_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.request_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  res.json({ ...request, comments });
});

// POST /api/requests
router.post('/', (req, res) => {
  const { title, description, category, priority, groceryCategory, groceryQuantity, mealTypeRequested, rideTime, rideDestination, allowanceAmount } = req.body;
  if (!title || !category) {
    return res.status(400).json({ error: 'title and category are required' });
  }

  const result = getDb().prepare(`
    INSERT INTO requests (title, description, category, priority, submitted_by, grocery_category, grocery_quantity, meal_type_requested, ride_time, ride_destination, allowance_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, description || '', category, priority || 'normal', req.user.id,
    groceryCategory || null, groceryQuantity || null, mealTypeRequested || null,
    rideTime || null, rideDestination || null, allowanceAmount || null
  );

  logActivity(req.user.id, 'created_request', 'request', result.lastInsertRowid, `New request: ${title}`);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Request created' });
});

// PUT /api/requests/:id
router.put('/:id', async (req, res) => {
  const request = getDb().prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const { title, description, category, priority, status, assignedTo, parentNote, mealDate, mealType } = req.body;

  if (req.user.role !== 'parent' && request.submitted_by !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (req.user.role !== 'parent' && request.status !== 'open') {
    return res.status(403).json({ error: 'Cannot edit a non-open request' });
  }

  if (status && status !== request.status) {
    if (['approved', 'denied', 'completed', 'in_progress'].includes(status) && req.user.role !== 'parent') {
      return res.status(403).json({ error: 'Only parents can change status' });
    }
  }

  getDb().prepare(`
    UPDATE requests SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      category = COALESCE(?, category),
      priority = COALESCE(?, priority),
      status = COALESCE(?, status),
      assigned_to = COALESCE(?, assigned_to),
      parent_note = COALESCE(?, parent_note),
      resolved_by = CASE WHEN ? IN ('approved', 'denied', 'completed') THEN ? ELSE resolved_by END,
      resolved_at = CASE WHEN ? IN ('approved', 'denied', 'completed') THEN CURRENT_TIMESTAMP ELSE resolved_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, description, category, priority, status, assignedTo, parentNote, status, req.user.id, status, req.params.id);

  // Handle approval side-effects
  if (status === 'approved' && request.status !== 'approved') {
    // Grocery item request → add to grocery list
    if (request.category === 'grocery_item') {
      getDb().prepare(`
        INSERT INTO grocery_items (name, quantity, category, added_by, requested_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(request.title, request.grocery_quantity || '1', request.grocery_category || 'other', req.user.id, request.submitted_by);

      logActivity(req.user.id, 'added_grocery', 'grocery', null, `${request.title} (from request)`);
    }

    // Meal request → add to meal plan if date provided
    if (request.category === 'meal_request' && mealDate) {
      getDb().prepare(`
        INSERT INTO meals (meal_date, meal_type, title, description, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(mealDate, mealType || request.meal_type_requested || 'dinner', request.title, request.description || '', req.user.id);

      logActivity(req.user.id, 'planned_meal', 'meal', null, `${request.title} (from request)`);
    }

    // Ride request → create Google Calendar event if date/time provided
    if (request.category === 'ride_request' && request.ride_time) {
      try {
        const calConfig = getDb().prepare('SELECT * FROM google_calendar_config ORDER BY id DESC LIMIT 1').get();
        if (calConfig && calConfig.refresh_token) {
          const oauthClient = new google.auth.OAuth2(calConfig.client_id, calConfig.client_secret, calConfig.redirect_uri);
          oauthClient.setCredentials({ access_token: calConfig.access_token, refresh_token: calConfig.refresh_token });

          const submitter = getDb().prepare('SELECT display_name FROM users WHERE id = ?').get(request.submitted_by);
          const rideDate = new Date(request.ride_time);
          const endDate = new Date(rideDate.getTime() + 60 * 60 * 1000); // 1 hour duration

          const calendar = google.calendar({ version: 'v3', auth: oauthClient });
          await calendar.events.insert({
            calendarId: calConfig.calendar_id || 'primary',
            requestBody: {
              summary: `Ride: ${submitter?.display_name || 'Someone'} - ${request.title}`,
              description: request.description || '',
              location: request.ride_destination || '',
              start: { dateTime: rideDate.toISOString(), timeZone: 'America/Chicago' },
              end: { dateTime: endDate.toISOString(), timeZone: 'America/Chicago' },
            },
          });
          logActivity(req.user.id, 'calendar_ride', 'request', request.id, `Ride added to calendar for ${submitter?.display_name}`);
        }
      } catch (err) {
        console.error('Failed to create calendar event for ride:', err.message);
      }
    }

    // Notify the requester
    notify(
      request.submitted_by,
      'Request Approved!',
      `Your request "${request.title}" has been approved${parentNote ? ': ' + parentNote : ''}`,
      'approved',
      request.id
    );
  }

  if (status === 'denied' && request.status !== 'denied') {
    notify(
      request.submitted_by,
      'Request Denied',
      `Your request "${request.title}" was denied${parentNote ? ': ' + parentNote : ''}`,
      'denied',
      request.id
    );
  }

  if (status && status !== request.status) {
    logActivity(req.user.id, `${status}_request`, 'request', request.id, `${request.title} → ${status}`);
  }

  res.json({ message: 'Request updated' });
});

// POST /api/requests/:id/comments
router.post('/:id/comments', (req, res) => {
  const { comment } = req.body;
  if (!comment) return res.status(400).json({ error: 'comment is required' });

  const request = getDb().prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  if (req.user.role !== 'parent' && request.submitted_by !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  getDb().prepare(`
    INSERT INTO request_comments (request_id, user_id, comment)
    VALUES (?, ?, ?)
  `).run(req.params.id, req.user.id, comment);

  // Notify the other party about the comment
  if (req.user.role === 'parent' && request.submitted_by !== req.user.id) {
    notify(request.submitted_by, 'New Comment', `${req.user.displayName} commented on "${request.title}"`, 'comment', request.id);
  } else if (req.user.role !== 'parent') {
    // Notify all parents
    const parents = getDb().prepare("SELECT id FROM users WHERE role = 'parent' AND is_active = 1").all();
    parents.forEach(p => {
      notify(p.id, 'New Comment', `${req.user.displayName} commented on "${request.title}"`, 'comment', request.id);
    });
  }

  logActivity(req.user.id, 'commented', 'request', request.id, `Commented on: ${request.title}`);
  res.status(201).json({ message: 'Comment added' });
});

// PATCH /api/requests/:id/archive - toggle archive (parent only)
router.patch('/:id/archive', (req, res) => {
  if (req.user.role !== 'parent') return res.status(403).json({ error: 'Parents only' });
  const request = getDb().prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  const newVal = request.archived ? 0 : 1;
  getDb().prepare('UPDATE requests SET archived = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ archived: !!newVal });
});

// POST /api/requests/archive-completed - archive all completed/denied (parent only)
router.post('/archive-completed', (req, res) => {
  if (req.user.role !== 'parent') return res.status(403).json({ error: 'Parents only' });
  const result = getDb().prepare("UPDATE requests SET archived = 1 WHERE status IN ('approved', 'denied', 'completed') AND COALESCE(archived, 0) = 0").run();
  res.json({ message: `Archived ${result.changes} requests` });
});

module.exports = router;
