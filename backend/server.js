const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize database
initDatabase();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/requests', require('./routes/requestRoutes'));
app.use('/api/grocery', require('./routes/groceryRoutes'));
app.use('/api/meals', require('./routes/mealRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/pantry', require('./routes/pantryRoutes'));
app.use('/api/recipes', require('./routes/recipeRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/polls', require('./routes/pollRoutes'));
app.use('/api/calendar', require('./routes/calendarRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/ha', require('./routes/haRoutes'));

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Family Portal API running on port ${PORT}`);
});
