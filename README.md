# Family HQ

A self-hosted family management web portal. Manage requests, grocery lists, meal plans, recipes, pantry inventory, polls, food orders, and more — all from one place. Includes an AI assistant powered by Claude that can take actions on your behalf.

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
- Ride requests include destination, date/time — auto-create Google Calendar events on approval
- Allowance requests include dollar amount
- Parents approve/deny with optional notes
- Grocery requests auto-add to grocery list on approval
- Meal requests prompt parent to pick a day/slot on approval
- Comment threads on each request
- Notifications on approval, denial, and comments
- Archive completed requests to keep the list clean
- Teens/children can only see their own requests

### Grocery List
- Parent-managed shared grocery list
- Categorized by aisle (produce, dairy, meat, bakery, frozen, pantry, beverages, snacks, household)
- **Smart auto-categorization** — ingredients automatically sorted into the correct aisle by keyword matching
- Autocomplete from item history
- Archive completed lists after shopping
- Browse and re-add from past archived lists
- "Already Have" — mark items you already have at home instead of deleting
- **Pantry cross-reference** — items matching pantry inventory show location and quantity
- **Recipe integration** — add recipe ingredients to grocery list with one click, tagged with recipe name
- Edit items: change name, quantity, or category
- Teens/children submit grocery requests for parent approval

### Meal Planner
- Weekly table view (rows = meal types, columns = days)
- Breakfast, lunch, dinner, snack slots
- **Recipe picker** — search and select from recipe book when adding meals
- After adding a meal from a recipe, prompted to add ingredients to grocery list
- Click any meal to see full details and linked recipe (ingredients, instructions)
- Recipe links and notes
- Mobile-friendly day view
- Teens/children suggest meals via request system

### Recipe Book
- Full recipe collection with title, description, ingredients, step-by-step instructions
- Prep time, cook time, servings, tags, source URL
- Search recipes by title, ingredients, or tags
- **Favorite recipes** — any user can star recipes; shows who favorited with avatars
- **Add ingredients to grocery list** — one click with editable quantities, auto-categorized, duplicates skipped
- Card grid view with detail modal
- Parent can add/edit/delete recipes
- AI assistant can create recipes with full details

### Pantry / Inventory (Parent Only)
- Track what's in your fridge, freezer, pantry, cabinets, and counter
- **Expiration date tracking** with color-coded warnings (amber: 3 days, red: expired)
- **Low stock toggle** — flag items running low
- One-tap "Add to grocery list" from any pantry item
- Search and filter by location
- Edit item name, quantity, location, expiration, notes
- AI assistant sees pantry inventory and can suggest meals based on what you have
- **AI vision scanning** — snap a photo of your fridge/pantry, AI identifies items and adds them

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
- Month and week views (default: week) with event display
- Create, view, and delete events from the portal
- Today's events shown on dashboard
- **Auto color-coding** — events colored by first word of title (person's name), configurable by parent
- Weekly meal plan shown below the calendar aligned with day columns
- Correct timezone handling (America/Chicago)
- Ride requests auto-create calendar events on approval

### AI Assistant (Claude / OpenAI)
- Floating chat bubble on every page
- Powered by Claude API (Anthropic) with OpenAI fallback
- **Full family context** — knows meals, grocery list, pantry, calendar, requests, messages, recipes, polls
- Conversation history within session
- Quick prompt suggestions

**AI Actions (tool use):**
| Action | Parent | Teen/Child |
|--------|--------|------------|
| Answer questions about family data | Yes | Yes |
| Create requests | Yes | Yes |
| Add grocery items directly | Yes | Creates request |
| Add meals to planner | Yes | Creates request |
| Add/create recipes | Yes | No |
| Add pantry items | Yes | No |
| Approve/deny requests | Yes | No |
| Add recipe ingredients to grocery | Yes | No |
| Post to message board | Yes | Yes |
| **Scan photos** (vision) | Yes | No |

**AI Vision:**
- Parent can snap a photo of fridge/pantry shelves
- AI identifies all visible items with quantities and locations
- Asks whether to add to pantry, grocery list, or both
- Auto-categorizes and deduplicates

### Family Message Board
- Sticky-note style cards with colorful backgrounds
- Photo capture from phone camera + upload to Immich
- Image compression before upload for fast transfers
- Drag-and-drop reordering (parent only)
- Pin important messages
- Comment threads on each note
- Show 3 notes by default with expand to see all
- Parent can edit, delete, pin any message

### Profile Pictures
- Upload profile pictures with crop/zoom/rotate editor
- Any user can upload their own; parent can upload for others
- Shown everywhere: sidebar, message board, requests, comments, polls, grocery list
- Falls back to emoji avatar if no photo

### Notifications
- Bell icon with unread count (polls every 30 seconds)
- Notifications for: new requests (parent), request approvals/denials (requester), comments, new polls/food orders
- Parent notifications auto-clear when they act on the request
- Mark individual or all as read
- Click notification to navigate to relevant page

### User Management
- Roles: **Parent** (full admin), **Teen**, **Child**, **Dashboard** (view-only)
- Forced password change on first login
- Emoji avatars with color picker + profile photo upload
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
| AI | Anthropic Claude API (with OpenAI fallback) |
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

SQLite database and uploaded avatars stored in Docker volumes. Data persists across container rebuilds.

### Reverse Proxy (Cloudflare Tunnel)

Works behind Cloudflare Tunnel. Set the tunnel service to `http://<ip>:8080`.

## Configuration

### Google Calendar
1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable Google Calendar API
3. Create OAuth 2.0 credentials (Web application)
4. Set redirect URI to `https://your-domain/calendar-callback`
5. In Family HQ: Calendar > Setup > enter Client ID, Secret, and Redirect URI

### AI Assistant
1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. In Family HQ: click the sparkle chat button > gear icon
3. Select Claude as provider, paste API key
4. Recommended model: `claude-haiku-4-5-20251001` (cheapest) or `claude-sonnet-4-20250514`

### Immich Photo Integration
Photos uploaded to the message board are stored in your Immich server. Configure the Immich URL and API key in the database (`immich_config` table).

### Roles

| Role | Can Do |
|------|--------|
| Parent | Everything — manage users, approve/deny requests, manage grocery/meals/calendar/polls/pantry/recipes, edit message board, AI photo scanning |
| Teen | Submit requests, view grocery/meals/calendar, post messages, vote in polls, submit food orders, use AI chat (text only) |
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
│       ├── recipeRoutes.js
│       ├── pantryRoutes.js
│       ├── messageRoutes.js
│       ├── pollRoutes.js
│       ├── calendarRoutes.js
│       ├── aiRoutes.js
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
        ├── components/
        │   ├── common/
        │   │   ├── Avatar.js
        │   │   ├── AiChat.js
        │   │   └── ImageCropper.js
        │   └── layout/
        │       └── AppShell.js
        └── pages/
            ├── DashboardPage.js
            ├── RequestsPage.js
            ├── GroceryPage.js
            ├── MealPlannerPage.js
            ├── RecipesPage.js
            ├── PantryPage.js
            ├── PollsPage.js
            ├── CalendarPage.js
            ├── AdminUsersPage.js
            ├── LoginPage.js
            ├── ChangePasswordPage.js
            ├── CalendarCallbackPage.js
            └── ProfilePage.js
```

## License

Private project. Not licensed for redistribution.
