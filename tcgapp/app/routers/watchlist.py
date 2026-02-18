from fastapi import APIRouter, Depends, Request, Form
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import WatchlistItem, Product, CurrentPrice, Category, PriceAlert

router = APIRouter()


@router.get("/watchlist")
async def watchlist_page(request: Request, db: Session = Depends(get_db)):
    items = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.active.is_(True))
        .all()
    )

    rows = []
    for item in items:
        product = db.query(Product).filter_by(
            product_id=item.product_id
        ).first()
        price = db.query(CurrentPrice).filter_by(
            product_id=item.product_id, variant=item.variant
        ).first()
        category = db.query(Category).filter_by(
            category_id=product.category_id
        ).first() if product else None
        alerts = db.query(PriceAlert).filter_by(watchlist_id=item.id).all()

        rows.append({
            "item": item,
            "product": product,
            "price": price,
            "game": category.name if category else "",
            "game_display": category.display_name if category else "",
            "alerts": alerts,
        })

    from app.deps import templates
    return templates.TemplateResponse("watchlist.html", {
        "request": request,
        "rows": rows,
    })


@router.post("/watchlist/add")
async def add_to_watchlist(
    product_id: int = Form(...),
    variant: str = Form(default="Normal"),
    db: Session = Depends(get_db),
):
    existing = db.query(WatchlistItem).filter_by(
        product_id=product_id, variant=variant, active=True
    ).first()
    if not existing:
        item = WatchlistItem(product_id=product_id, variant=variant)
        db.add(item)
        db.commit()
    return RedirectResponse(url="/watchlist", status_code=303)


@router.post("/watchlist/{item_id}/remove")
async def remove_from_watchlist(
    item_id: int,
    db: Session = Depends(get_db),
):
    item = db.query(WatchlistItem).filter_by(id=item_id).first()
    if item:
        item.active = False
        db.commit()
    return RedirectResponse(url="/watchlist", status_code=303)


@router.post("/watchlist/{item_id}/alert")
async def configure_alert(
    item_id: int,
    threshold_pct: str = Form(...),
    time_window: str = Form(default="24h"),
    direction: str = Form(default="both"),
    db: Session = Depends(get_db),
):
    from decimal import Decimal
    alert = PriceAlert(
        watchlist_id=item_id,
        threshold_pct=Decimal(threshold_pct),
        time_window=time_window,
        direction=direction,
    )
    db.add(alert)
    db.commit()
    return RedirectResponse(url="/watchlist", status_code=303)
