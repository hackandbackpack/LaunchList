from fastapi import APIRouter, Depends, Request, Form
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PriceAlert, WatchlistItem, Product, Category

router = APIRouter()


@router.get("/alerts")
async def alerts_page(request: Request, db: Session = Depends(get_db)):
    triggered = (
        db.query(PriceAlert)
        .filter(PriceAlert.triggered_at.isnot(None))
        .order_by(PriceAlert.triggered_at.desc())
        .all()
    )

    rows = []
    for alert in triggered:
        watchlist_item = db.query(WatchlistItem).filter_by(
            id=alert.watchlist_id
        ).first()
        if not watchlist_item:
            continue
        product = db.query(Product).filter_by(
            product_id=watchlist_item.product_id
        ).first()
        category = db.query(Category).filter_by(
            category_id=product.category_id
        ).first() if product else None

        rows.append({
            "alert": alert,
            "product": product,
            "variant": watchlist_item.variant,
            "game": category.name if category else "",
        })

    from app.deps import templates
    return templates.TemplateResponse("alerts.html", {
        "request": request,
        "rows": rows,
    })


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
):
    alert = db.query(PriceAlert).filter_by(id=alert_id).first()
    if alert:
        alert.acknowledged = True
        db.commit()
    return RedirectResponse(url="/alerts", status_code=303)
