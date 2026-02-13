# ListPull

A decklist ordering system for trading card game stores. Customers submit decklists online, staff pull singles from inventory, and everyone saves time.

## What It Does

**For Customers:**
- Submit decklists by pasting text or uploading files (.txt, .csv, .dek)
- Smart parsing handles multiple decklist formats with autocomplete
- Track order status with an order number and email lookup
- Get notified when cards are ready for pickup

**For Staff:**
- Dashboard with order management, search, and filtering
- Per-card inventory tracking with quantity found, pricing, and condition variants
- Magic cards grouped by color identity for faster pulling
- Auto-fetched reference pricing from Scryfall and Pokemon TCG APIs
- One-click "Copy Customer Message" generates a ready-to-send pickup summary
- Role-based access (staff / admin)

**Supported Games:**
- Magic: The Gathering (full Scryfall integration, color grouping, pricing)
- Pokemon TCG (TCGdex API via backend proxy)
- One Piece TCG
- Other / generic (text-based)

## Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query

**Backend:** Node.js, Express, TypeScript, Drizzle ORM, SQLite, JWT auth, Nodemailer

**Deployment:** Docker (single container), Nginx reverse proxy, Let's Encrypt SSL

## Getting Started

### Local Development

Requires Node.js 18+ and npm.

```bash
git clone https://github.com/hackandbackpack/listpull.git
cd listpull

# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Copy and configure environment
cp .env.example listpull.env
# Edit listpull.env - fill in required fields (JWT_SECRET, store info)

# Start the dev server
npm run dev
```

Frontend runs on the Vite dev server with hot reload. The backend runs separately from the `server/` directory.

### Docker Deployment

```bash
cp .env.example listpull.env
# Edit listpull.env with your store details

# Build and start
docker compose --env-file listpull.env up -d --build

# Create the admin account
docker exec -it listpull sh
ADMIN_PASSWORD=your-secure-password node dist/db/seed.js
exit
```

Access at http://localhost:3000. Staff login at `/staff/login` with `admin@store.com`.

See [deploy/README.md](deploy/README.md) for production deployment with Nginx, SSL, and the automated installer.

## Configuration

All settings live in a single `listpull.env` file. See `.env.example` for the full list.

| Setting | Description | Required |
|---------|-------------|----------|
| `JWT_SECRET` | Auth token signing key (min 32 chars). Generate with `openssl rand -hex 32` | Yes |
| `STORE_NAME` | Store display name | Yes |
| `STORE_EMAIL` | Contact email | Yes |
| `STORE_PHONE` | Contact phone (XXX.XXX.XXXX) | Yes |
| `STORE_ADDRESS` | Store address | Yes |
| `SMTP_HOST` | SMTP server for email notifications (leave blank to disable) | No |
| `ORDER_PREFIX` | Order number prefix (default: LP) | No |
| `ORDER_HOLD_DAYS` | Days to hold pulled cards (default: 7) | No |

## Project Structure

```
listpull/
├── src/                    # Frontend (React)
│   ├── pages/              # Route pages (Index, Submit, Status, Staff)
│   ├── components/         # UI components
│   │   ├── staff/          # Staff-specific (DeckCardList, EditableCardListItem)
│   │   ├── layout/         # Header, Footer, PageLayout
│   │   └── ui/             # shadcn/ui base components
│   ├── hooks/              # useAuth, useScryfallAutocomplete
│   ├── lib/                # deckParser, scryfall, colorUtils, exportMessage
│   └── integrations/api/   # API client
├── server/                 # Backend (Express)
│   └── src/
│       ├── routes/         # auth, orders, staff, notifications, proxy
│       ├── services/       # emailService, orderService
│       ├── middleware/      # auth, errorHandler, rateLimiter
│       └── db/             # schema, seed, migrations
├── deploy/                 # Deployment scripts and configs
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## Scripts

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

## Management

```bash
# View logs
docker compose --env-file listpull.env logs -f

# Restart
docker compose --env-file listpull.env restart

# Update
git pull && docker compose --env-file listpull.env up -d --build

# Backup database
docker cp listpull:/app/data/listpull.db ./backup-$(date +%Y%m%d).db
```
