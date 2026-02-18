from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers import dashboard, search, cards, sealed, reprice, watchlist, alerts
from app.routers import settings as settings_router

app = FastAPI(title="TCG Price Tracker")

static_dir = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

app.include_router(dashboard.router)
app.include_router(search.router)
app.include_router(cards.router)
app.include_router(sealed.router)
app.include_router(reprice.router)
app.include_router(watchlist.router)
app.include_router(alerts.router)
app.include_router(settings_router.router)
