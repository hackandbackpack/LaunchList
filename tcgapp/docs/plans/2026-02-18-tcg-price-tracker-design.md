# TCG Price Tracker — Design Document

**Date**: 2026-02-18
**Status**: Approved
**Project Name**: TCG Price Tracker (working title)

## Purpose

A web-based tool for tracking TCGPlayer card and sealed product prices over time, with inventory repricing capabilities. Supports Pokemon, Magic: The Gathering, One Piece, and Disney Lorcana.

## Goals

1. Track market prices and TCGLow for singles and sealed products across 4 TCGs
2. Build historical price data over time
3. Provide a clean UI for looking up cards, viewing price trends, and monitoring watchlisted items
4. Reprice TCGPlayer inventory CSVs against current market/low prices
5. Alert on significant price movements for tracked products

## Non-Goals (for MVP)

- Full catalog coverage of all 500k+ TCGPlayer SKUs (start with ~40 test cards + sealed products)
- Email/Discord/SMS notifications (in-app only for MVP)
- Multi-user auth (single-user tool for now)
- Mobile-native app

---

## Architecture

### Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python 3.12+ / FastAPI |
| Templates | Jinja2 (server-rendered) |
| Database | PostgreSQL 16 |
| Charts | Chart.js (client-side) |
| CSS | Tailwind CSS (dark cosmic theme from ListPull) |
| Font | Inter |
| Web Server | Nginx (reverse proxy) → Uvicorn |
| Deployment | Single DigitalOcean droplet (s-1vcpu-2gb) |
| Data Source | JustTCG API (primary, sole source for MVP) |
| Scheduler | systemd timer or cron (nightly price ingestion) |

### Deployment Topology

```
Single DigitalOcean Droplet (s-1vcpu-2gb, ubuntu-24-04-x64, nyc1)
├── Nginx (reverse proxy, port 80/443)
├── Uvicorn (FastAPI app, port 8000)
├── PostgreSQL 16 (local, port 5432)
└── Cron job (nightly JustTCG price pull)
```

---

## Data Model

### Tables

#### categories
| Column | Type | Notes |
|--------|------|-------|
| category_id | INTEGER PK | Mirrors TCGPlayer category ID |
| name | VARCHAR(100) | Internal name (e.g., "pokemon") |
| display_name | VARCHAR(100) | Display name (e.g., "Pokemon") |

Seeded with: Pokemon, Magic: The Gathering, One Piece Card Game, Disney Lorcana

#### groups
| Column | Type | Notes |
|--------|------|-------|
| group_id | INTEGER PK | Mirrors TCGPlayer group ID |
| category_id | INTEGER FK | References categories |
| name | VARCHAR(255) | Set name |
| published_on | DATE | Set release date |

#### products
| Column | Type | Notes |
|--------|------|-------|
| product_id | INTEGER PK | Mirrors TCGPlayer product ID |
| group_id | INTEGER FK | References groups |
| category_id | INTEGER FK | References categories |
| name | VARCHAR(255) | Full product name |
| clean_name | VARCHAR(255) | Normalized name for search |
| image_url | VARCHAR(500) | Card/product image |
| number | VARCHAR(20) | Collector number |
| rarity | VARCHAR(50) | Rarity level |
| product_type | VARCHAR(20) | "single" or "sealed" |

#### skus
| Column | Type | Notes |
|--------|------|-------|
| sku_id | INTEGER PK | Mirrors TCGPlayer SKU ID |
| product_id | INTEGER FK | References products |
| variant | VARCHAR(50) | Normal, Foil, Reverse Holo, etc. |
| condition | VARCHAR(30) | Near Mint, Lightly Played, etc. |
| language | VARCHAR(20) | English, Japanese, etc. |

#### current_prices
| Column | Type | Notes |
|--------|------|-------|
| product_id | INTEGER PK (composite) | References products |
| variant | VARCHAR(50) PK (composite) | Variant type |
| market_price | DECIMAL(10,2) | TCGPlayer market price |
| low_price | DECIMAL(10,2) | TCGLow / min price |
| mid_price | DECIMAL(10,2) | Mid price |
| direct_low | DECIMAL(10,2) | TCG Direct low |
| updated_at | TIMESTAMP | Last update time |
| source | VARCHAR(20) | "justtcg" |

#### price_history
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | Auto-increment |
| product_id | INTEGER FK | References products |
| variant | VARCHAR(50) | Variant type |
| date | DATE | Snapshot date |
| market_price | DECIMAL(10,2) | Market price on this date |
| low_price | DECIMAL(10,2) | Low price on this date |
| source | VARCHAR(20) | "justtcg" |
| created_at | TIMESTAMP | Record creation time |

Partitioned by month on `date` column for query performance at scale.

#### watchlist
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | Auto-increment |
| product_id | INTEGER FK | References products |
| variant | VARCHAR(50) | Variant to watch |
| notes | TEXT | User notes |
| added_at | TIMESTAMP | When added |
| active | BOOLEAN | Active flag |

#### price_alerts
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | Auto-increment |
| watchlist_id | INTEGER FK | References watchlist |
| threshold_pct | DECIMAL(5,2) | Percentage threshold |
| time_window | VARCHAR(10) | "24h", "72h", "7d" |
| direction | VARCHAR(10) | "up", "down", "both" |
| triggered_at | TIMESTAMP | Last trigger time |
| acknowledged | BOOLEAN | User acknowledged |

#### sealed_tracking
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | Auto-increment |
| product_id | INTEGER FK | References products |
| variant | VARCHAR(50) | Variant (usually "Normal") |
| display_order | INTEGER | Sort order on dashboard |
| active | BOOLEAN | Active tracking flag |

---

## Data Ingestion

### Source: JustTCG API

- Base URL: `https://api.justtcg.com/v1`
- Auth: `x-api-key` header
- Free tier: 1,000 requests/month, 100/day, 10/min, batch of 20

### MVP Scope

~10 cards per game (40 singles) + sealed products (~10-20 sealed SKUs) = ~60 tracked products total.

### Nightly Automated Pull

- Runs via cron at 8:30 PM UTC daily
- Batches all tracked products into POST /v1/cards requests (batch of 20)
- ~3 API calls per nightly run
- Updates current_prices and inserts price_history rows

### On-Demand Pulls

- Card search: fetches fresh pricing from JustTCG
- CSV repricing: batches inventory SKUs and fetches current prices
- Manual refresh button in UI

### API Budget

- Nightly: ~3 calls/day x 30 = 90 calls/month
- Remaining: ~910 calls for searches, repricing, manual refreshes

---

## Web UI

### Theme

Dark cosmic aesthetic adapted from ListPull project:
- Background: `hsl(220, 20%, 6%)` (very dark blue)
- Primary: `hsl(270, 100%, 65%)` (electric purple)
- Cards: `hsl(220, 18%, 10%)` with glow borders
- Font: Inter
- Effects: Glow shadows, semi-transparent overlays
- Game badge colors: Purple (MTG), Yellow (Pokemon), Red (One Piece), Blue (Lorcana)

### Pages

#### 1. Dashboard (/)
- Stats cards: tracked products per game, last update timestamp
- Price movers: biggest 24h/7d gainers and losers from watchlist
- Unacknowledged alert count badge

#### 2. Card Search (/search)
- Text search by card name
- Filter by game and set
- Results grid: card thumbnail, name, set, current market price

#### 3. Card Detail (/card/{product_id})
- Card image
- All variants with current prices (market, low, mid, direct low)
- Price history chart (Chart.js line graph, selectable timeframe)
- TCGPlayer product ID and external link
- Price change indicators (7d, 30d, 90d)
- "Add to Watchlist" button

#### 4. Sealed Product Dashboard (/sealed)
- Summary table per game showing pre-loaded sealed products
- Columns: Product | Today | -1d | -2d | -3d | -4d | -5d | -6d | -7d | Trend
- Green/red coloring on daily price changes
- Add/remove sealed SKUs to track
- Quick morning glance-and-reprice view

#### 5. Inventory Repricing (/reprice)
- Upload TCGPlayer CSV (drag-and-drop or file picker)
- Preview table: card name, current listed price, current TCGLow/market, proposed new price, difference
- Strategy selector:
  - Match TCGLow exactly
  - Undercut TCGLow by X% (configurable slider, 1-10%)
  - Match market price
  - Set floor price (minimum per item)
- Download modified CSV for re-upload to TCGPlayer

#### 6. Watchlist (/watchlist)
- All manually tracked products with current prices and change indicators
- Configure alerts per item: threshold %, time window (24h/72h/7d), direction
- Alert status indicators

#### 7. Alerts (/alerts)
- List of triggered alerts with product info, price change details, timestamp
- Acknowledge/dismiss individual alerts

#### 8. Settings (/settings)
- JustTCG API key configuration (stored as env var, displayed masked)
- Manage tracked cards: add/remove from test set
- Manage sealed products: add/remove tracked sealed SKUs
- Manual data refresh trigger
- Ingestion log: last run status, errors, API usage

---

## Inventory Repricing Logic

### Input
TCGPlayer seller inventory CSV export with columns:
- TCGplayer Id (SKU ID) — key field
- Product Line, Set Name, Product Name, Number, Rarity, Condition — read-only context
- TCG Market Price, TCG Direct Low, TCG Low Price With Shipping, TCG Low Price — reference prices
- Total Quantity — read-only
- Add to Quantity — left unchanged (set to 0)
- TCG Marketplace Price — this is what we update
- Photo URL — left unchanged

### Processing
1. Parse uploaded CSV
2. Extract all unique product IDs from SKU mappings
3. Batch fetch current prices from JustTCG
4. For each row, calculate new price based on selected strategy:
   - **Match TCGLow**: new_price = current low_price
   - **Undercut by X%**: new_price = low_price * (1 - X/100)
   - **Match Market**: new_price = market_price
   - **Floor price**: new_price = max(calculated_price, floor)
5. Present preview with diffs
6. On confirm, generate download CSV with updated TCG Marketplace Price column

### Output
Same CSV format, only TCG Marketplace Price column modified. Ready for direct re-upload to TCGPlayer.

---

## Project Structure

```
tcgapp/
├── app/
│   ├── main.py              # FastAPI app, routes
│   ├── config.py            # Settings, env vars
│   ├── database.py          # SQLAlchemy engine, session
│   ├── models.py            # ORM models
│   ├── schemas.py           # Pydantic schemas
│   ├── routers/
│   │   ├── dashboard.py     # Dashboard routes
│   │   ├── search.py        # Card search routes
│   │   ├── cards.py         # Card detail routes
│   │   ├── sealed.py        # Sealed product dashboard
│   │   ├── reprice.py       # Repricing tool routes
│   │   ├── watchlist.py     # Watchlist routes
│   │   ├── alerts.py        # Alerts routes
│   │   └── settings.py      # Settings routes
│   ├── services/
│   │   ├── justtcg.py       # JustTCG API client
│   │   ├── ingestion.py     # Data ingestion logic
│   │   ├── repricing.py     # CSV repricing logic
│   │   └── alerts.py        # Alert evaluation logic
│   └── templates/
│       ├── base.html         # Base template with theme
│       ├── dashboard.html
│       ├── search.html
│       ├── card_detail.html
│       ├── sealed.html
│       ├── reprice.html
│       ├── watchlist.html
│       ├── alerts.html
│       └── settings.html
├── static/
│   ├── css/
│   │   └── app.css           # Tailwind output + custom styles
│   ├── js/
│   │   └── charts.js         # Chart.js configuration
│   └── img/
├── scripts/
│   ├── ingest.py             # Nightly ingestion script (cron target)
│   └── seed.py               # Seed initial test data
├── requirements.txt
├── .env.example
└── README.md
```

---

## Deployment Plan

1. Create DigitalOcean droplet (s-1vcpu-2gb, ubuntu-24-04-x64, nyc1, tagged "testing")
2. Install: Python 3.12, PostgreSQL 16, Nginx, Node.js (for Tailwind build)
3. Clone repo, create venv, install dependencies
4. Configure .env with JustTCG API key and database credentials
5. Run database migrations
6. Seed initial test data (40 cards + sealed products)
7. Configure Nginx reverse proxy → Uvicorn
8. Set up cron for nightly ingestion
9. Verify with Playwright browser automation

---

## Future Expansion Path

When ready to scale beyond MVP:
1. Upgrade JustTCG to paid tier for more API calls
2. Add TCGCSV as bulk data source for full catalog coverage
3. Add email/Discord alert delivery
4. Add multi-user auth if needed
5. Resize droplet or containerize with Docker Compose
