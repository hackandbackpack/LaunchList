from datetime import date, timedelta

from fastapi import APIRouter, Depends, Request, Form
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SealedTracking, Product, PriceHistory, CurrentPrice, Category

router = APIRouter()


@router.get("/sealed")
async def sealed_dashboard(
    request: Request,
    game: str = "",
    db: Session = Depends(get_db),
):
    query = (
        db.query(SealedTracking)
        .join(Product, SealedTracking.product_id == Product.product_id)
        .filter(SealedTracking.active.is_(True))
        .order_by(SealedTracking.display_order)
    )

    if game:
        cat = db.query(Category).filter_by(name=game).first()
        if cat:
            query = query.filter(Product.category_id == cat.category_id)

    tracked = query.all()
    today = date.today()
    days = [today - timedelta(days=i) for i in range(8)]

    rows = []
    for item in tracked:
        product = db.query(Product).filter_by(
            product_id=item.product_id
        ).first()
        category = db.query(Category).filter_by(
            category_id=product.category_id
        ).first() if product else None

        daily_prices = []
        for day in days:
            hist = db.query(PriceHistory).filter_by(
                product_id=item.product_id,
                variant=item.variant,
                date=day,
            ).first()
            daily_prices.append(
                float(hist.market_price) if hist and hist.market_price else None
            )

        # Determine 7-day trend direction
        if len(daily_prices) >= 2 and daily_prices[0] and daily_prices[-1]:
            if daily_prices[0] > daily_prices[-1]:
                trend = "up"
            elif daily_prices[0] < daily_prices[-1]:
                trend = "down"
            else:
                trend = "flat"
        else:
            trend = "flat"

        rows.append({
            "tracking_id": item.id,
            "product": product,
            "game": category.name if category else "",
            "game_display": category.display_name if category else "",
            "daily_prices": daily_prices,
            "trend": trend,
        })

    categories = db.query(Category).all()

    from app.deps import templates
    return templates.TemplateResponse("sealed.html", {
        "request": request,
        "rows": rows,
        "days": [d.strftime("%m/%d") for d in days],
        "game_filter": game,
        "categories": categories,
    })


@router.post("/sealed/add")
async def add_sealed(
    product_id: int = Form(...),
    variant: str = Form(default="Normal"),
    db: Session = Depends(get_db),
):
    existing = db.query(SealedTracking).filter_by(
        product_id=product_id, variant=variant, active=True
    ).first()
    if not existing:
        tracking = SealedTracking(
            product_id=product_id,
            variant=variant,
        )
        db.add(tracking)
        db.commit()
    return RedirectResponse(url="/sealed", status_code=303)


@router.post("/sealed/remove")
async def remove_sealed(
    tracking_id: int = Form(...),
    db: Session = Depends(get_db),
):
    item = db.query(SealedTracking).filter_by(id=tracking_id).first()
    if item:
        item.active = False
        db.commit()
    return RedirectResponse(url="/sealed", status_code=303)
