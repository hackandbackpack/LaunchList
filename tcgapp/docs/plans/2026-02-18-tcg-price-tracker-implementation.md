# TCG Price Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web-based TCG price tracking tool with inventory repricing, deployed on a DigitalOcean droplet.

**Architecture:** FastAPI + PostgreSQL + Jinja2 monolith on a single droplet. JustTCG API as sole data source for MVP. Nightly cron for automated price ingestion, on-demand queries for search and repricing. Dark cosmic UI theme adapted from ListPull.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, PostgreSQL 16, Jinja2, Tailwind CSS, Chart.js, Nginx, Uvicorn

**Design Doc:** `docs/plans/2026-02-18-tcg-price-tracker-design.md`

---

## Phase 1: Project Scaffolding & Database

### Task 1: Create project structure and dependencies

**Files:**
- Create: `tcgapp/requirements.txt`
- Create: `tcgapp/.env.example`
- Create: `tcgapp/app/__init__.py`
- Create: `tcgapp/app/config.py`

**Step 1: Create directory structure**

```bash
mkdir -p tcgapp/app/{routers,services,templates,static/{css,js,img}}
mkdir -p tcgapp/scripts
mkdir -p tcgapp/tests
touch tcgapp/app/__init__.py
touch tcgapp/app/routers/__init__.py
touch tcgapp/app/services/__init__.py
touch tcgapp/tests/__init__.py
```

**Step 2: Write requirements.txt**

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy==2.0.36
psycopg2-binary==2.9.10
alembic==1.14.1
jinja2==3.1.5
python-dotenv==1.0.1
httpx==0.28.1
python-multipart==0.0.20
pydantic==2.10.4
pydantic-settings==2.7.1
```

**Step 3: Write .env.example**

```
JUSTTCG_API_KEY=tcg_your_key_here
DATABASE_URL=postgresql://tcgapp:tcgapp@localhost:5432/tcgapp
SECRET_KEY=change-me-to-random-string
```

**Step 4: Write config.py**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    justtcg_api_key: str
    database_url: str = "postgresql://tcgapp:tcgapp@localhost:5432/tcgapp"
    secret_key: str = "change-me"

    class Config:
        env_file = ".env"


settings = Settings()
```

**Step 5: Commit**

```bash
git add tcgapp/
git commit -m "Scaffold tcgapp project structure and dependencies"
```

---

### Task 2: Database models

**Files:**
- Create: `tcgapp/app/database.py`
- Create: `tcgapp/app/models.py`

**Step 1: Write database.py**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**Step 2: Write models.py with all tables**

```python
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text,
    UniqueConstraint, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    category_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))

    groups: Mapped[list["Group"]] = relationship(back_populates="category")
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Group(Base):
    __tablename__ = "groups"

    group_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.category_id"))
    name: Mapped[str] = mapped_column(String(255))
    published_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    category: Mapped["Category"] = relationship(back_populates="groups")
    products: Mapped[list["Product"]] = relationship(back_populates="group")


class Product(Base):
    __tablename__ = "products"

    product_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("groups.group_id"), nullable=True
    )
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.category_id"))
    name: Mapped[str] = mapped_column(String(255))
    clean_name: Mapped[str] = mapped_column(String(255))
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rarity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    product_type: Mapped[str] = mapped_column(String(20), default="single")

    category: Mapped["Category"] = relationship(back_populates="products")
    group: Mapped["Group | None"] = relationship(back_populates="products")
    skus: Mapped[list["Sku"]] = relationship(back_populates="product")
    current_prices: Mapped[list["CurrentPrice"]] = relationship(
        back_populates="product"
    )
    price_history: Mapped[list["PriceHistory"]] = relationship(
        back_populates="product"
    )


class Sku(Base):
    __tablename__ = "skus"

    sku_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"))
    variant: Mapped[str] = mapped_column(String(50))
    condition: Mapped[str] = mapped_column(String(30))
    language: Mapped[str] = mapped_column(String(20), default="English")

    product: Mapped["Product"] = relationship(back_populates="skus")


class CurrentPrice(Base):
    __tablename__ = "current_prices"

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.product_id"), primary_key=True
    )
    variant: Mapped[str] = mapped_column(String(50), primary_key=True)
    market_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    low_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    mid_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    direct_low: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    source: Mapped[str] = mapped_column(String(20), default="justtcg")

    product: Mapped["Product"] = relationship(back_populates="current_prices")


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"))
    variant: Mapped[str] = mapped_column(String(50))
    date: Mapped[date] = mapped_column(Date)
    market_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    low_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="justtcg")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    product: Mapped["Product"] = relationship(back_populates="price_history")

    __table_args__ = (
        UniqueConstraint("product_id", "variant", "date", name="uq_price_per_day"),
    )


class WatchlistItem(Base):
    __tablename__ = "watchlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"))
    variant: Mapped[str] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped["Product"] = relationship()
    alerts: Mapped[list["PriceAlert"]] = relationship(back_populates="watchlist_item")


class PriceAlert(Base):
    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    watchlist_id: Mapped[int] = mapped_column(ForeignKey("watchlist.id"))
    threshold_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    time_window: Mapped[str] = mapped_column(String(10))
    direction: Mapped[str] = mapped_column(String(10), default="both")
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)

    watchlist_item: Mapped["WatchlistItem"] = relationship(back_populates="alerts")


class SealedTracking(Base):
    __tablename__ = "sealed_tracking"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"))
    variant: Mapped[str] = mapped_column(String(50), default="Normal")
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped["Product"] = relationship()
```

**Step 3: Commit**

```bash
git add tcgapp/app/database.py tcgapp/app/models.py
git commit -m "Add database engine and SQLAlchemy models for all tables"
```

---

### Task 3: Alembic migrations setup

**Files:**
- Create: `tcgapp/alembic.ini`
- Create: `tcgapp/alembic/env.py`

**Step 1: Initialize alembic**

```bash
cd tcgapp
python -m alembic init alembic
```

**Step 2: Edit alembic/env.py to import models and use config**

Update the `env.py` so `target_metadata = Base.metadata` and `sqlalchemy.url` comes from settings.

**Step 3: Edit alembic.ini** — set `sqlalchemy.url` placeholder (overridden by env.py).

**Step 4: Generate initial migration**

```bash
python -m alembic revision --autogenerate -m "Initial schema"
```

**Step 5: Commit**

```bash
git add tcgapp/alembic/ tcgapp/alembic.ini
git commit -m "Add Alembic migrations with initial schema"
```

---

## Phase 2: JustTCG API Client & Data Ingestion

### Task 4: JustTCG API client

**Files:**
- Create: `tcgapp/app/services/justtcg.py`
- Create: `tcgapp/tests/test_justtcg.py`

**Step 1: Write failing tests**

```python
import pytest
from unittest.mock import AsyncMock, patch
from app.services.justtcg import JustTCGClient


@pytest.fixture
def client():
    return JustTCGClient(api_key="test_key")


MOCK_CARD_RESPONSE = {
    "data": [
        {
            "id": "pokemon-sv08-charizard-ex-rare",
            "name": "Charizard ex",
            "game": "pokemon",
            "set": "sv08",
            "set_name": "Surging Sparks",
            "number": "006",
            "rarity": "Double Rare",
            "tcgplayerId": "572189",
            "variants": [
                {
                    "id": "pokemon-sv08-charizard-ex-rare_near-mint_normal",
                    "condition": "Near Mint",
                    "printing": "Normal",
                    "tcgplayerSkuId": "9876543",
                    "price": 12.50,
                    "priceChange24hr": -2.1,
                    "priceChange7d": 5.3,
                    "avgPrice7d": 13.00,
                    "minPrice7d": 11.00,
                    "maxPrice7d": 15.00,
                    "lastUpdated": 1739900000,
                    "priceHistory": [
                        {"p": 12.00, "t": 1739800000},
                        {"p": 12.50, "t": 1739900000},
                    ],
                }
            ],
        }
    ],
    "meta": {"total": 1, "limit": 20, "offset": 0, "hasMore": False},
    "_metadata": {
        "apiRequestsRemaining": 999,
        "apiDailyRequestsRemaining": 99,
    },
}


class TestJustTCGClient:
    @pytest.mark.asyncio
    async def test_search_card_by_name(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = MOCK_CARD_RESPONSE
            result = await client.search_cards(game="pokemon", query="Charizard ex")
            mock_req.assert_called_once()
            assert len(result["data"]) == 1
            assert result["data"][0]["name"] == "Charizard ex"

    @pytest.mark.asyncio
    async def test_get_card_by_tcgplayer_id(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = MOCK_CARD_RESPONSE
            result = await client.get_card(tcgplayer_id="572189")
            assert result["data"][0]["tcgplayerId"] == "572189"

    @pytest.mark.asyncio
    async def test_batch_lookup(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = MOCK_CARD_RESPONSE
            items = [{"tcgplayerId": "572189"}, {"tcgplayerId": "572190"}]
            result = await client.batch_lookup(items)
            mock_req.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_games(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {"data": [{"id": "pokemon", "name": "Pokemon"}]}
            result = await client.get_games()
            assert len(result["data"]) == 1

    @pytest.mark.asyncio
    async def test_get_sets(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {"data": [{"id": "sv08", "name": "Surging Sparks"}]}
            result = await client.get_sets(game="pokemon")
            assert len(result["data"]) == 1

    def test_extract_variant_prices(self, client):
        variant = MOCK_CARD_RESPONSE["data"][0]["variants"][0]
        prices = client.extract_prices(variant)
        assert prices["price"] == 12.50
        assert prices["condition"] == "Near Mint"
        assert prices["printing"] == "Normal"
        assert prices["sku_id"] == "9876543"
```

**Step 2: Run tests — verify they fail**

```bash
cd tcgapp && python -m pytest tests/test_justtcg.py -v
```

**Step 3: Implement JustTCG client**

```python
from typing import Any

import httpx

from app.config import settings

BASE_URL = "https://api.justtcg.com/v1"

GAME_SLUGS = {
    "pokemon": "pokemon",
    "magic": "magic-the-gathering",
    "onepiece": "one-piece-card-game",
    "lorcana": "disney-lorcana",
}


class JustTCGClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.justtcg_api_key
        self.headers = {"x-api-key": self.api_key}

    async def _request(
        self, method: str, endpoint: str, params: dict | None = None,
        json_body: Any = None,
    ) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{BASE_URL}{endpoint}",
                headers=self.headers,
                params=params,
                json=json_body,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    async def get_games(self) -> dict:
        return await self._request("GET", "/games")

    async def get_sets(self, game: str, query: str | None = None) -> dict:
        params = {"game": game}
        if query:
            params["q"] = query
        return await self._request("GET", "/sets", params=params)

    async def search_cards(self, game: str, query: str) -> dict:
        params = {
            "q": query,
            "game": game,
            "include_price_history": "true",
            "priceHistoryDuration": "7d",
        }
        return await self._request("GET", "/cards", params=params)

    async def get_card(
        self, tcgplayer_id: str | None = None, card_id: str | None = None,
    ) -> dict:
        params = {"include_price_history": "true", "priceHistoryDuration": "30d"}
        if tcgplayer_id:
            params["tcgplayerId"] = tcgplayer_id
        elif card_id:
            params["cardId"] = card_id
        return await self._request("GET", "/cards", params=params)

    async def batch_lookup(self, items: list[dict]) -> dict:
        return await self._request("POST", "/cards", json_body=items)

    @staticmethod
    def extract_prices(variant: dict) -> dict:
        return {
            "price": variant.get("price"),
            "condition": variant.get("condition"),
            "printing": variant.get("printing"),
            "sku_id": variant.get("tcgplayerSkuId"),
            "price_change_24h": variant.get("priceChange24hr"),
            "price_change_7d": variant.get("priceChange7d"),
            "price_change_30d": variant.get("priceChange30d"),
            "avg_price_7d": variant.get("avgPrice7d"),
            "min_price_7d": variant.get("minPrice7d"),
            "max_price_7d": variant.get("maxPrice7d"),
            "price_history": variant.get("priceHistory", []),
        }
```

**Step 4: Run tests — verify pass**

```bash
python -m pytest tests/test_justtcg.py -v
```

**Step 5: Commit**

```bash
git add tcgapp/app/services/justtcg.py tcgapp/tests/test_justtcg.py
git commit -m "Add JustTCG API client with search, batch, and price extraction"
```

---

### Task 5: Data ingestion service

**Files:**
- Create: `tcgapp/app/services/ingestion.py`
- Create: `tcgapp/tests/test_ingestion.py`

**Step 1: Write failing tests for ingestion logic**

Test that ingestion takes JustTCG API response data and correctly upserts products, SKUs, current_prices, and price_history rows.

```python
import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ingestion import IngestionService


MOCK_CARD = {
    "id": "pokemon-sv08-charizard-ex-rare",
    "name": "Charizard ex",
    "game": "pokemon",
    "set": "sv08",
    "set_name": "Surging Sparks",
    "number": "006",
    "rarity": "Double Rare",
    "tcgplayerId": "572189",
    "variants": [
        {
            "condition": "Near Mint",
            "printing": "Normal",
            "tcgplayerSkuId": "9876543",
            "price": 12.50,
            "minPrice7d": 11.00,
            "avgPrice7d": 13.00,
        },
        {
            "condition": "Near Mint",
            "printing": "Foil",
            "tcgplayerSkuId": "9876544",
            "price": 45.00,
            "minPrice7d": 40.00,
            "avgPrice7d": 44.00,
        },
    ],
}


class TestIngestionService:
    def test_parse_card_to_product(self):
        service = IngestionService(db=MagicMock())
        product = service.parse_product(MOCK_CARD)
        assert product["product_id"] == 572189
        assert product["name"] == "Charizard ex"
        assert product["rarity"] == "Double Rare"

    def test_parse_variants_to_skus(self):
        service = IngestionService(db=MagicMock())
        skus = service.parse_skus(MOCK_CARD)
        assert len(skus) == 2
        assert skus[0]["sku_id"] == 9876543
        assert skus[0]["variant"] == "Normal"
        assert skus[1]["variant"] == "Foil"

    def test_parse_variant_prices(self):
        service = IngestionService(db=MagicMock())
        prices = service.parse_current_prices(MOCK_CARD)
        assert len(prices) == 2
        assert prices[0]["market_price"] == Decimal("12.50")
        assert prices[0]["low_price"] == Decimal("11.00")
        assert prices[1]["variant"] == "Foil"
```

**Step 2: Run tests — verify fail**

**Step 3: Implement ingestion service**

The service parses JustTCG card responses into database-ready dicts, handles upserts for products/SKUs/prices, and records daily price history snapshots. Uses SQLAlchemy merge for upserts.

**Step 4: Run tests — verify pass**

**Step 5: Commit**

```bash
git add tcgapp/app/services/ingestion.py tcgapp/tests/test_ingestion.py
git commit -m "Add ingestion service for JustTCG data to database"
```

---

### Task 6: Seed script with test data

**Files:**
- Create: `tcgapp/scripts/seed.py`

**Step 1: Write seed script**

Seeds the 4 categories (Pokemon, MTG, One Piece, Lorcana) and fetches ~10 cards per game from JustTCG to populate the database with initial test data. Uses the JustTCG client and ingestion service.

Hardcoded search queries for test cards:
- Pokemon: "Charizard ex", "Pikachu ex", "Mewtwo ex", "Lugia V", "Mew ex", "Gardevoir ex", "Arceus VSTAR", "Giratina VSTAR", "Palkia VSTAR", "Miraidon ex"
- MTG: "The One Ring", "Sheoldred", "Ragavan", "Atraxa", "Solitude", "Orcish Bowmasters", "Fury", "Force of Will", "Liliana of the Veil", "Wrenn and Six"
- One Piece: "Monkey D. Luffy", "Roronoa Zoro", "Nami", "Boa Hancock", "Shanks", "Yamato", "Portgas D. Ace", "Trafalgar Law", "Eustass Kid", "Charlotte Katakuri"
- Lorcana: "Elsa", "Mickey Mouse", "Stitch", "Maleficent", "Simba", "Rapunzel", "Maui", "Ursula", "Robin Hood", "Cruella De Vil"

Also seeds ~5 sealed products per game (ETBs, booster boxes).

**Step 2: Run seed script against local database**

```bash
cd tcgapp && python scripts/seed.py
```

**Step 3: Commit**

```bash
git add tcgapp/scripts/seed.py
git commit -m "Add seed script for test card data across 4 TCGs"
```

---

### Task 7: Nightly ingestion cron script

**Files:**
- Create: `tcgapp/scripts/ingest.py`

**Step 1: Write ingestion script**

Standalone script that:
1. Queries all tracked products from the database
2. Batches them into JustTCG API calls (20 per batch)
3. Updates current_prices and inserts price_history rows
4. Logs results (success count, errors, API usage remaining)

**Step 2: Test locally**

```bash
cd tcgapp && python scripts/ingest.py
```

**Step 3: Commit**

```bash
git add tcgapp/scripts/ingest.py
git commit -m "Add nightly ingestion script for cron scheduling"
```

---

## Phase 3: FastAPI App & Core UI

### Task 8: FastAPI app shell with base template

**Files:**
- Create: `tcgapp/app/main.py`
- Create: `tcgapp/app/templates/base.html`
- Create: `tcgapp/static/css/app.css`

**Step 1: Write main.py with FastAPI app, Jinja2 templates, static files mount**

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI(title="TCG Price Tracker")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="app/templates")
```

**Step 2: Write base.html**

Dark cosmic theme adapted from ListPull:
- `<html>` with dark background `hsl(220, 20%, 6%)`
- Inter font from Google Fonts
- Tailwind CSS via CDN (for MVP; build step later)
- Top nav with links: Dashboard, Search, Sealed, Reprice, Watchlist, Settings
- Game badge color classes
- Glow card CSS utilities
- Chart.js CDN script tag
- Content block for child templates

**Step 3: Write app.css with custom cosmic theme styles**

Glow effects, gradient text, card hover animations, status badge colors, scrollbar styling — adapted from ListPull's `index.css` but plain CSS (no React/shadcn).

**Step 4: Run the app and verify base template renders**

```bash
cd tcgapp && uvicorn app.main:app --reload
```

**Step 5: Commit**

```bash
git add tcgapp/app/main.py tcgapp/app/templates/base.html tcgapp/static/
git commit -m "Add FastAPI app shell with dark cosmic base template"
```

---

### Task 9: Dashboard page

**Files:**
- Create: `tcgapp/app/routers/dashboard.py`
- Create: `tcgapp/app/templates/dashboard.html`

**Step 1: Write dashboard router**

- `GET /` — renders dashboard with:
  - Product counts per game (query categories + count products)
  - Last ingestion timestamp
  - Top price movers from watchlist (24h change)
  - Unacknowledged alert count

**Step 2: Write dashboard.html template**

- 4 stat cards (one per game) with product count and last update
- "Price Movers" section: table of biggest gainers/losers
- Alert badge in nav

**Step 3: Commit**

```bash
git add tcgapp/app/routers/dashboard.py tcgapp/app/templates/dashboard.html
git commit -m "Add dashboard page with stats and price movers"
```

---

### Task 10: Card search page

**Files:**
- Create: `tcgapp/app/routers/search.py`
- Create: `tcgapp/app/templates/search.html`

**Step 1: Write search router**

- `GET /search` — renders search form
- `GET /search?q=charizard&game=pokemon` — queries local DB first; if no results, queries JustTCG API and ingests results, then displays
- Returns paginated results (20 per page)

**Step 2: Write search.html template**

- Search bar with game filter dropdown
- Results grid: card image thumbnail, name, set, rarity, current market price
- Click through to card detail page
- "No results" state

**Step 3: Commit**

```bash
git add tcgapp/app/routers/search.py tcgapp/app/templates/search.html
git commit -m "Add card search page with JustTCG fallback"
```

---

### Task 11: Card detail page

**Files:**
- Create: `tcgapp/app/routers/cards.py`
- Create: `tcgapp/app/templates/card_detail.html`

**Step 1: Write card detail router**

- `GET /card/{product_id}` — fetches product, all variants with current prices, price history
- If price data is stale (>24h), refreshes from JustTCG

**Step 2: Write card_detail.html template**

- Card image (left column)
- Variant price table (right column): each variant row shows printing, condition, market price, low price, 7d/30d change
- Price history chart (Chart.js line graph below) — one line per variant
- Timeframe selector (7d, 30d, 90d)
- "Add to Watchlist" button
- External link to TCGPlayer product page

**Step 3: Write static/js/charts.js**

Chart.js configuration for price history line charts. Dark theme colors matching the cosmic aesthetic. Tooltip showing date + price.

**Step 4: Commit**

```bash
git add tcgapp/app/routers/cards.py tcgapp/app/templates/card_detail.html tcgapp/static/js/charts.js
git commit -m "Add card detail page with variant prices and history chart"
```

---

## Phase 4: Sealed Product Dashboard

### Task 12: Sealed product dashboard

**Files:**
- Create: `tcgapp/app/routers/sealed.py`
- Create: `tcgapp/app/templates/sealed.html`

**Step 1: Write sealed router**

- `GET /sealed` — queries sealed_tracking table, joins with price_history for past 7 days
- `POST /sealed/add` — add a product to sealed tracking
- `POST /sealed/remove` — remove from tracking

**Step 2: Write sealed.html template**

Summary table per game:
```
Product              | Today  | -1d    | -2d    | -3d    | -4d    | -5d    | -6d    | -7d    | Trend
SV: Prismatic ETB    | $54.99 | $55.49 | $56.00 | $55.25 | $54.00 | $53.50 | $53.00 | $52.50 | arrow
```

- Green text for price increases, red for decreases (comparing to previous day)
- Trend column: up/down/flat arrow
- "Add Sealed Product" button with search modal
- Game tabs to filter by game

**Step 3: Commit**

```bash
git add tcgapp/app/routers/sealed.py tcgapp/app/templates/sealed.html
git commit -m "Add sealed product dashboard with 7-day price summary"
```

---

## Phase 5: Inventory Repricing Tool

### Task 13: CSV repricing logic

**Files:**
- Create: `tcgapp/app/services/repricing.py`
- Create: `tcgapp/tests/test_repricing.py`

**Step 1: Write failing tests**

```python
import pytest
from decimal import Decimal
from app.services.repricing import RepricingService, RepricingStrategy


class TestRepricingService:
    def test_match_tcglow(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("15.00"),
            tcg_low=Decimal("12.50"),
            market_price=Decimal("14.00"),
            strategy=RepricingStrategy.MATCH_LOW,
        )
        assert result == Decimal("12.50")

    def test_undercut_by_percentage(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("15.00"),
            tcg_low=Decimal("12.50"),
            market_price=Decimal("14.00"),
            strategy=RepricingStrategy.UNDERCUT,
            undercut_pct=Decimal("5"),
        )
        assert result == Decimal("11.88")  # 12.50 * 0.95 rounded

    def test_match_market(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("15.00"),
            tcg_low=Decimal("12.50"),
            market_price=Decimal("14.00"),
            strategy=RepricingStrategy.MATCH_MARKET,
        )
        assert result == Decimal("14.00")

    def test_floor_price_enforced(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("15.00"),
            tcg_low=Decimal("0.50"),
            market_price=Decimal("0.75"),
            strategy=RepricingStrategy.MATCH_LOW,
            floor_price=Decimal("1.00"),
        )
        assert result == Decimal("1.00")

    def test_minimum_price_never_below_penny(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("0.10"),
            tcg_low=Decimal("0.005"),
            market_price=Decimal("0.01"),
            strategy=RepricingStrategy.MATCH_LOW,
        )
        assert result == Decimal("0.01")

    def test_parse_tcgplayer_csv(self):
        csv_content = (
            'TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,'
            'Rarity,Condition,TCG Market Price,TCG Direct Low,'
            'TCG Low Price With Shipping,TCG Low Price,Total Quantity,'
            'Add to Quantity,TCG Marketplace Price,Photo URL\n'
            '9876543,Pokemon,Surging Sparks,Charizard ex,,006,'
            'Double Rare,Near Mint,14.00,,12.75,12.50,5,'
            '0,15.00,\n'
        )
        service = RepricingService()
        rows = service.parse_csv(csv_content)
        assert len(rows) == 1
        assert rows[0]["sku_id"] == "9876543"
        assert rows[0]["current_listed_price"] == Decimal("15.00")
```

**Step 2: Run tests — verify fail**

**Step 3: Implement repricing service**

Includes: `RepricingStrategy` enum, `calculate_price()`, `parse_csv()`, `generate_csv()` methods.

**Step 4: Run tests — verify pass**

**Step 5: Commit**

```bash
git add tcgapp/app/services/repricing.py tcgapp/tests/test_repricing.py
git commit -m "Add repricing service with strategy options and CSV parsing"
```

---

### Task 14: Repricing UI

**Files:**
- Create: `tcgapp/app/routers/reprice.py`
- Create: `tcgapp/app/templates/reprice.html`

**Step 1: Write reprice router**

- `GET /reprice` — renders upload form
- `POST /reprice/upload` — accepts CSV file, parses it, fetches current prices from JustTCG for all SKUs, calculates proposed prices, returns preview
- `POST /reprice/download` — generates modified CSV for download

**Step 2: Write reprice.html template**

- Upload area (drag-and-drop + file picker)
- Strategy selector: radio buttons for match low / undercut / match market
- Undercut percentage slider (shown when undercut selected)
- Floor price input
- Preview table: Product Name | Condition | Variant | Current Price | TCG Low | Market | New Price | Diff
- Color-coded diff column (green = increase, red = decrease)
- "Download Repriced CSV" button

**Step 3: Commit**

```bash
git add tcgapp/app/routers/reprice.py tcgapp/app/templates/reprice.html
git commit -m "Add inventory repricing UI with CSV upload and preview"
```

---

## Phase 6: Watchlist & Alerts

### Task 15: Watchlist page

**Files:**
- Create: `tcgapp/app/routers/watchlist.py`
- Create: `tcgapp/app/templates/watchlist.html`

**Step 1: Write watchlist router**

- `GET /watchlist` — list all active watchlist items with current prices
- `POST /watchlist/add` — add product+variant to watchlist
- `POST /watchlist/{id}/remove` — deactivate watchlist item
- `POST /watchlist/{id}/alert` — configure alert for a watchlist item

**Step 2: Write watchlist.html template**

- Table of watched items: Card Name | Game | Variant | Current Price | 24h Change | 7d Change | Alert Status
- "Configure Alert" modal per item: threshold %, time window dropdown (24h/72h/7d), direction (up/down/both)
- Remove button per item

**Step 3: Commit**

```bash
git add tcgapp/app/routers/watchlist.py tcgapp/app/templates/watchlist.html
git commit -m "Add watchlist page with alert configuration"
```

---

### Task 16: Alert evaluation and alerts page

**Files:**
- Create: `tcgapp/app/services/alerts.py`
- Create: `tcgapp/tests/test_alerts.py`
- Create: `tcgapp/app/routers/alerts.py`
- Create: `tcgapp/app/templates/alerts.html`

**Step 1: Write failing tests for alert evaluation**

```python
from decimal import Decimal
from app.services.alerts import evaluate_alert


class TestAlertEvaluation:
    def test_price_up_triggers_upward_alert(self):
        triggered = evaluate_alert(
            old_price=Decimal("10.00"),
            new_price=Decimal("12.00"),
            threshold_pct=Decimal("15"),
            direction="up",
        )
        assert triggered is True  # 20% increase > 15% threshold

    def test_price_up_does_not_trigger_downward_alert(self):
        triggered = evaluate_alert(
            old_price=Decimal("10.00"),
            new_price=Decimal("12.00"),
            threshold_pct=Decimal("15"),
            direction="down",
        )
        assert triggered is False

    def test_both_direction_triggers_on_drop(self):
        triggered = evaluate_alert(
            old_price=Decimal("10.00"),
            new_price=Decimal("8.00"),
            threshold_pct=Decimal("15"),
            direction="both",
        )
        assert triggered is True  # 20% decrease > 15% threshold
```

**Step 2: Run tests — verify fail**

**Step 3: Implement alert evaluation logic**

**Step 4: Run tests — verify pass**

**Step 5: Write alerts router and template**

- `GET /alerts` — list triggered alerts (newest first)
- `POST /alerts/{id}/acknowledge` — mark alert as acknowledged
- Template shows: card name, variant, price change details, when triggered

**Step 6: Commit**

```bash
git add tcgapp/app/services/alerts.py tcgapp/tests/test_alerts.py \
       tcgapp/app/routers/alerts.py tcgapp/app/templates/alerts.html
git commit -m "Add alert evaluation logic and alerts page"
```

---

## Phase 7: Settings & Admin

### Task 17: Settings page

**Files:**
- Create: `tcgapp/app/routers/settings.py`
- Create: `tcgapp/app/templates/settings.html`

**Step 1: Write settings router**

- `GET /settings` — display current config (API key masked), tracked card list, sealed products, ingestion log
- `POST /settings/refresh` — trigger manual data refresh (runs ingestion for all tracked products)
- `POST /settings/cards/add` — add a card to tracked set by search
- `POST /settings/cards/remove` — remove from tracked set

**Step 2: Write settings.html template**

- API status card: key (masked), requests remaining today/month
- Tracked cards table per game with remove buttons
- Add card search form
- Sealed products management
- Manual refresh button with loading state
- Ingestion log: last run time, products updated, errors

**Step 3: Commit**

```bash
git add tcgapp/app/routers/settings.py tcgapp/app/templates/settings.html
git commit -m "Add settings page with tracked card management and manual refresh"
```

---

## Phase 8: Deployment

### Task 18: DigitalOcean droplet provisioning

**Step 1: Create droplet via MCP**

- Size: `s-1vcpu-2gb`
- Image: `ubuntu-24-04-x64`
- Region: `nyc1`
- SSH key: `JMFD`
- Tags: `testing`
- Name: `tcgapp`

**Step 2: SSH into droplet and install dependencies**

```bash
apt update && apt upgrade -y
apt install -y python3.12 python3.12-venv python3-pip postgresql postgresql-contrib nginx
```

**Step 3: Configure PostgreSQL**

```bash
sudo -u postgres createuser tcgapp
sudo -u postgres createdb tcgapp -O tcgapp
sudo -u postgres psql -c "ALTER USER tcgapp PASSWORD 'secure-password-here';"
```

**Step 4: Clone repo and set up venv**

```bash
cd /opt
git clone <repo-url> tcgapp
cd tcgapp/tcgapp
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Step 5: Configure .env**

```bash
cp .env.example .env
# Edit .env with actual values
```

**Step 6: Run migrations and seed**

```bash
python -m alembic upgrade head
python scripts/seed.py
```

**Step 7: Commit any deployment configs**

---

### Task 19: Nginx + Uvicorn + systemd setup

**Files:**
- Create: `tcgapp/deploy/tcgapp.service` (systemd unit)
- Create: `tcgapp/deploy/nginx.conf` (Nginx site config)

**Step 1: Write systemd service file**

```ini
[Unit]
Description=TCG Price Tracker
After=network.target postgresql.service

[Service]
User=www-data
WorkingDirectory=/opt/tcgapp/tcgapp
ExecStart=/opt/tcgapp/tcgapp/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
EnvironmentFile=/opt/tcgapp/tcgapp/.env

[Install]
WantedBy=multi-user.target
```

**Step 2: Write Nginx config**

Reverse proxy from port 80 → localhost:8000, serve static files directly.

**Step 3: Deploy to droplet**

```bash
cp deploy/tcgapp.service /etc/systemd/system/
systemctl enable tcgapp && systemctl start tcgapp
cp deploy/nginx.conf /etc/nginx/sites-available/tcgapp
ln -s /etc/nginx/sites-available/tcgapp /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

**Step 4: Set up cron for nightly ingestion**

```bash
crontab -e
# Add: 30 20 * * * /opt/tcgapp/tcgapp/venv/bin/python /opt/tcgapp/tcgapp/scripts/ingest.py >> /var/log/tcgapp-ingest.log 2>&1
```

**Step 5: Commit deploy configs**

```bash
git add tcgapp/deploy/
git commit -m "Add systemd and Nginx deployment configs"
```

---

### Task 20: Playwright verification

**Step 1: Navigate to the droplet's IP in the browser**

Using the Playwright MCP, open the app and verify:
- Dashboard loads with stats for 4 games
- Search returns results
- Card detail page shows variants and chart
- Sealed dashboard shows 7-day summary table
- Repricing upload form works
- Watchlist add/remove functions
- Settings page shows API status

**Step 2: Screenshot each page for verification**

**Step 3: Fix any issues found during testing**

---

## Task Dependency Graph

```
Task 1 (scaffold) → Task 2 (models) → Task 3 (alembic)
                                            ↓
Task 4 (JustTCG client) → Task 5 (ingestion) → Task 6 (seed) → Task 7 (cron script)
                                                       ↓
Task 8 (app shell + base template) → Task 9 (dashboard)
                                   → Task 10 (search)
                                   → Task 11 (card detail)
                                   → Task 12 (sealed dashboard)
Task 13 (repricing logic) → Task 14 (repricing UI)
Task 15 (watchlist) → Task 16 (alerts)
Task 17 (settings)
All above → Task 18 (droplet) → Task 19 (deploy) → Task 20 (playwright verify)
```

Tasks 9-12, 13-14, 15-16, and 17 can be parallelized after Task 8 is complete.
