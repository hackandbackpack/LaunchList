from fastapi import APIRouter, Depends, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Product, CurrentPrice, PriceHistory, WatchlistItem, PriceAlert

router = APIRouter()


@router.get("/")
async def dashboard(request: Request, db: Session = Depends(get_db)):
    # Get product counts per category
    stats = []
    categories = db.query(Category).all()
    for cat in categories:
        count = db.query(func.count(Product.product_id)).filter(
            Product.category_id == cat.category_id
        ).scalar()
        stats.append({
            "name": cat.display_name,
            "slug": cat.name,
            "count": count or 0,
        })

    # Get top price movers (biggest 24h changes from watchlist)
    movers = (
        db.query(
            Product.name,
            Product.product_id,
            CurrentPrice.variant,
            CurrentPrice.market_price,
            Category.name.label("game"),
        )
        .join(CurrentPrice, Product.product_id == CurrentPrice.product_id)
        .join(Category, Product.category_id == Category.category_id)
        .join(WatchlistItem, Product.product_id == WatchlistItem.product_id)
        .filter(WatchlistItem.active.is_(True))
        .order_by(CurrentPrice.updated_at.desc())
        .limit(10)
        .all()
    )

    # Unacknowledged alert count
    alert_count = db.query(func.count(PriceAlert.id)).filter(
        PriceAlert.triggered_at.isnot(None),
        PriceAlert.acknowledged.is_(False),
    ).scalar() or 0

    from app.deps import templates
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "stats": stats,
        "movers": movers,
        "alert_count": alert_count,
    })
