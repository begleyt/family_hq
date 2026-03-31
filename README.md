# Family HQ

A self-hosted family management web portal. Manage requests, grocery lists, meal plans, polls, food orders, and more — all from one place.

## Features

### Dashboard
- Personalized greeting with family stats
- Sticky-note message board with drag-and-drop reordering (parent)
- Photo uploads to message board via Immich integration
- Today's meals, calendar events, and active polls at a glance
- Quick action shortcuts
- Dark mode toggle

### Request / Service Ticket System
- Categories: Fix Something, Buy Something, Permission, Chore Negotiation, Allowance, Ride Request, Tech Request, Grocery Item, Meal Request
- Ride requests include destination and time
- Allowance requests include dollar amount
- Parents approve/deny with optional notes
- Grocery requests auto-add to grocery list on approval
- Meal requests prompt parent to pick a day/slot on approval
- Comment threads on each request
- Notifications on approval, denial, and comments

### Grocery List
- Parent-managed shared grocery list
- Categorized by aisle (produce, dairy, meat, etc.)
- Autocomplete from item history
- Archive completed lists after shopping
- Browse and re-add from past archived lists
- Teens/children submit grocery requests for parent approval
- Shows who requested each item

### Meal Planner
- Weekly table view (rows = meal types, columns = days)
- Breakfast, lunch, dinner, snack slots
- Recipe links
- Mobile-friendly day view
- Teens/children suggest meals via request system

### Family Polls & Food Orders
- **Vote Polls** — Parent creates a question with options, everyone votes, live results with percentages
- **Food Orders** — Parent selects a restaurant, everyone enters their order
  - Guest orders for people without accounts (younger kids, visitors)
  - Parent can enter orders for others
  - Order summary view for easy drive-thru ordering
- Notifications sent to all family members when new poll/order is created
- Active polls shown on dashboard

### Google Calendar
- Full OAuth2 integration with Google Calendar API
- Month and week views with event display
- Create, view, and delete events from the portal
- Today's events shown on dashboard
- Color-coded events
- Correct timezone handling

### Family Message Board
- Sticky-note style cards with colorful backgrounds
- Photo capture from phone camera + upload to Immich
- Image compression before upload for fast transfers
- Drag-and-drop reordering (parent only)
- Pin important messages
- Comment threads on each note
- Show 6 notes by default with expand to see all
- Parent can edit, delete, pin any message

### Notifications
- Bell icon with unread count
- Notifications for request approvals/denials, comments, new polls
- Mark individual or all as read

### User Management
- Roles: **Parent** (full admin), **Teen**, **Child**, **Dashboard** (view-only)
- Forced password change on first login
- Emoji avatars with color picker
- Password reset by parent
- Dashboard role for wall-mounted tablets (read-only, no actions)

### Dark Mode
- System preference detection on first visit
- Manual toggle in sidebar
- Persists across sessions
- Full dark theme across all pages and modals

### PWA Support
- Installable as a web app on phones and tablets
- Service worker for offline static asset caching
- App manifest with icons
- Apple touch icon support

### Home Assistant (Stubbed)
- Database tables and API routes ready for future HA integration
- Entity display placeholders on dashboard

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS 3, Lucide Icons |
| Backend | Node.js, Express |
| Database | SQLite (better-sqlite3) |
| Auth | JWT with bcrypt |
| Calendar | Google Calendar API (googleapis) |
| Photos | Immich API integration |
| File Upload | Multer |
| Deployment | Docker Compose (nginx + node) |

## Deployment

### Prerequisites
- Docker and Docker Compose
- A machine to host (Raspberry Pi, NAS, VM, etc.)

### Quick Start

```bash
git clone https://github.com/begleyt/family_hq.git
cd family_hq

# Edit .env with your JWT secret
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env

# Build and start
docker compose build
docker compose up -d
```

Access at `http://<your-ip>:8080`

**Default login:** `admin` / `changeme` (forced password change on first login)

### Docker Compose Services

| Service | Port | Description |
|---------|------|-------------|
| family-frontend | 8080 | Nginx serving React build + API proxy |
| family-backend | 4000 | Express API server |

### Data Persistence

SQLite database is stored in a named Docker volume (`family-data`). Data persists across container rebuilds.

### Reverse Proxy (Cloudflare Tunnel)

Works behind Cloudflare Tunnel. Set the tunnel service to `http://<ip>:8080`.

## Configuration

### Google Calendar
1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable Google Calendar API
3. Create OAuth 2.0 credentials (Web application)
4. Set redirect URI to `https://your-domain/calendar-callback`
5. In Family HQ: Calendar > Setup > enter Client ID, Secret, and Redirect URI

### Immich Photo Integration
Photos uploaded to the message board are stored in your Immich server. Configure the Immich URL and API key in the database (`immich_config` table) or they are seeded on first run.

### Roles

| Role | Can Do |
|------|--------|
| Parent | Everything — manage users, approve/deny requests, manage grocery/meals/calendar/polls, edit message board |
| Teen | Submit requests, view grocery/meals/calendar, post messages, vote in polls, submit food orders |
| Child | Same as teen |
| Dashboard | View-only — no posting, no requests, no voting. For wall-mounted displays |

## Project Structure

```
family-portal/
├── docker-compose.yml
├── .env
├── backend/
│   ├── Dockerfile
│   ├── server.js
│   ├── database/
│   │   ├── schema.sql
│   │   └── db.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── roleCheck.js
│   └── routes/
│       ├── authRoutes.js
│       ├── userRoutes.js
│       ├── requestRoutes.js
│       ├── groceryRoutes.js
│       ├── mealRoutes.js
│       ├── messageRoutes.js
│       ├── pollRoutes.js
│       ├── calendarRoutes.js
│       ├── notificationRoutes.js
│       ├── dashboardRoutes.js
│       └── haRoutes.js
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── public/
    └── src/
        ├── App.js
        ├── api.js
        ├── context/
        ├── components/layout/
        └── pages/
```

## License

Private project. Not licensed for redistribution.
