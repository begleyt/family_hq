const express = require('express');
const { google } = require('googleapis');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const router = express.Router();
router.use(authMiddleware);

function getOAuth2Client() {
  const config = getDb().prepare('SELECT * FROM google_calendar_config ORDER BY id DESC LIMIT 1').get();
  if (!config || !config.client_id) return { client: null, config: null };

  const client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    config.redirect_uri
  );

  if (config.access_token) {
    client.setCredentials({
      access_token: config.access_token,
      refresh_token: config.refresh_token,
      expiry_date: config.token_expiry ? new Date(config.token_expiry).getTime() : undefined,
    });

    // Auto-refresh token on expiry
    client.on('tokens', (tokens) => {
      const updates = {};
      if (tokens.access_token) updates.access_token = tokens.access_token;
      if (tokens.refresh_token) updates.refresh_token = tokens.refresh_token;
      if (tokens.expiry_date) updates.token_expiry = new Date(tokens.expiry_date).toISOString();

      if (Object.keys(updates).length > 0) {
        const sets = Object.entries(updates).map(([k, v]) => `${k} = '${v}'`).join(', ');
        getDb().exec(`UPDATE google_calendar_config SET ${sets} WHERE id = ${config.id}`);
      }
    });
  }

  return { client, config };
}

// GET /api/calendar/status - check if Google Calendar is connected
router.get('/status', (req, res) => {
  const config = getDb().prepare('SELECT id, client_id, client_secret, redirect_uri, calendar_id, connected_at, access_token, refresh_token FROM google_calendar_config ORDER BY id DESC LIMIT 1').get();
  res.json({
    configured: !!(config && config.client_id),
    connected: !!(config && config.refresh_token),
    calendarId: config?.calendar_id || 'primary',
    clientId: config?.client_id || '',
    redirectUri: config?.redirect_uri || '',
    connectedAt: config?.connected_at || null,
  });
});

// PUT /api/calendar/config - save Google OAuth credentials (parent only)
router.put('/config', roleCheck('parent'), (req, res) => {
  const { clientId, clientSecret, redirectUri, calendarId } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'clientId and clientSecret are required' });
  }

  const existing = getDb().prepare('SELECT id FROM google_calendar_config ORDER BY id DESC LIMIT 1').get();
  if (existing) {
    getDb().prepare(`
      UPDATE google_calendar_config SET
        client_id = ?, client_secret = ?, redirect_uri = ?, calendar_id = ?
      WHERE id = ?
    `).run(clientId, clientSecret, redirectUri || '', calendarId || 'primary', existing.id);
  } else {
    getDb().prepare(`
      INSERT INTO google_calendar_config (client_id, client_secret, redirect_uri, calendar_id, connected_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(clientId, clientSecret, redirectUri || '', calendarId || 'primary', req.user.id);
  }

  res.json({ message: 'Config saved' });
});

// GET /api/calendar/auth-url - get Google OAuth URL (parent only)
router.get('/auth-url', roleCheck('parent'), (req, res) => {
  const { client, config } = getOAuth2Client();
  if (!client) return res.status(400).json({ error: 'Google Calendar not configured' });

  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });

  res.json({ url });
});

// POST /api/calendar/callback - exchange auth code for tokens (parent only)
router.post('/callback', roleCheck('parent'), async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Authorization code required' });

  const { client, config } = getOAuth2Client();
  if (!client) return res.status(400).json({ error: 'Google Calendar not configured' });

  try {
    const { tokens } = await client.getToken(code);

    getDb().prepare(`
      UPDATE google_calendar_config SET
        access_token = ?, refresh_token = ?, token_expiry = ?, connected_by = ?, connected_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      req.user.id,
      config.id
    );

    res.json({ message: 'Google Calendar connected!' });
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.status(400).json({ error: 'Failed to connect: ' + err.message });
  }
});

// POST /api/calendar/disconnect - remove tokens (parent only)
router.post('/disconnect', roleCheck('parent'), (req, res) => {
  getDb().prepare(`
    UPDATE google_calendar_config SET access_token = NULL, refresh_token = NULL, token_expiry = NULL
    WHERE id = (SELECT id FROM google_calendar_config ORDER BY id DESC LIMIT 1)
  `).run();
  res.json({ message: 'Disconnected' });
});

// GET /api/calendar/events - list events
router.get('/events', async (req, res) => {
  const { client, config } = getOAuth2Client();
  if (!client || !config?.refresh_token) {
    return res.json({ events: [], connected: false });
  }

  const { timeMin, timeMax } = req.query;
  const now = new Date();
  const defaultMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const defaultMax = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.list({
      calendarId: config.calendar_id || 'primary',
      timeMin: timeMin || defaultMin,
      timeMax: timeMax || defaultMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const events = (response.data.items || []).map(e => ({
      id: e.id,
      title: e.summary || '(No title)',
      description: e.description || '',
      location: e.location || '',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      allDay: !!e.start?.date,
      color: e.colorId || null,
      htmlLink: e.htmlLink || '',
    }));

    res.json({ events, connected: true });
  } catch (err) {
    console.error('Calendar fetch error:', err.message);
    if (err.code === 401 || err.code === 403) {
      return res.json({ events: [], connected: false, error: 'Token expired, please reconnect' });
    }
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/calendar/events - create event (parent only)
router.post('/events', roleCheck('parent'), async (req, res) => {
  const { client, config } = getOAuth2Client();
  if (!client || !config?.refresh_token) {
    return res.status(400).json({ error: 'Google Calendar not connected' });
  }

  const { title, description, location, startDate, startTime, endDate, endTime, allDay, timeZone } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const tz = timeZone || 'America/Chicago';
  const event = {
    summary: title,
    description: description || '',
    location: location || '',
  };

  if (allDay) {
    event.start = { date: startDate };
    event.end = { date: endDate || startDate };
  } else {
    event.start = { dateTime: `${startDate}T${startTime || '09:00'}:00`, timeZone: tz };
    event.end = { dateTime: `${endDate || startDate}T${endTime || '10:00'}:00`, timeZone: tz };
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.insert({
      calendarId: config.calendar_id || 'primary',
      requestBody: event,
    });

    res.status(201).json({ id: response.data.id, htmlLink: response.data.htmlLink, message: 'Event created' });
  } catch (err) {
    console.error('Create event error:', err.message);
    res.status(500).json({ error: 'Failed to create event: ' + err.message });
  }
});

// PUT /api/calendar/events/:id - update event (parent only)
router.put('/events/:id', roleCheck('parent'), async (req, res) => {
  const { client, config } = getOAuth2Client();
  if (!client || !config?.refresh_token) {
    return res.status(400).json({ error: 'Google Calendar not connected' });
  }

  const { title, description, location, startDate, startTime, endDate, endTime, allDay, timeZone } = req.body;
  const tz = timeZone || 'America/Chicago';

  const event = {};
  if (title) event.summary = title;
  if (description !== undefined) event.description = description;
  if (location !== undefined) event.location = location;

  if (startDate) {
    if (allDay) {
      event.start = { date: startDate };
      event.end = { date: endDate || startDate };
    } else {
      event.start = { dateTime: `${startDate}T${startTime || '09:00'}:00`, timeZone: tz };
      event.end = { dateTime: `${endDate || startDate}T${endTime || '10:00'}:00`, timeZone: tz };
    }
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    await calendar.events.patch({
      calendarId: config.calendar_id || 'primary',
      eventId: req.params.id,
      requestBody: event,
    });

    res.json({ message: 'Event updated' });
  } catch (err) {
    console.error('Update event error:', err.message);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/calendar/events/:id - delete event (parent only)
router.delete('/events/:id', roleCheck('parent'), async (req, res) => {
  const { client, config } = getOAuth2Client();
  if (!client || !config?.refresh_token) {
    return res.status(400).json({ error: 'Google Calendar not connected' });
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    await calendar.events.delete({
      calendarId: config.calendar_id || 'primary',
      eventId: req.params.id,
    });

    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Delete event error:', err.message);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

module.exports = router;
