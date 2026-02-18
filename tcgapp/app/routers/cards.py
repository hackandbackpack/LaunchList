from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product, CurrentPrice, PriceHistory, Category, Sku
from app.services.justtcg import JustTCGClient
from app.services.ingestion import IngestionService

router = APIRouter()


@router.get("/card/{product_id}")
async def card_detail(
    request: Request,
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter_by(product_id=product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Card not found")

    category = db.query(Category).filter_by(
        category_id=product.category_id
    ).first()

    variants = db.query(CurrentPrice).filter_by(
        product_id=product_id
    ).all()

    # Refresh from API if no price data or prices are older than 24 hours
    stale_threshold = datetime.now() - timedelta(hours=24)
    if not variants or (variants and variants[0].updated_at < stale_threshold):
        try:
            client = JustTCGClient()
            result = await client.get_card(tcgplayer_id=str(product_id))
            cards = result.get("data", [])
            if cards:
                ingestion = IngestionService(db=db)
                ingestion.ingest_card(cards[0])
                variants = db.query(CurrentPrice).filter_by(
                    product_id=product_id
                ).all()
        except Exception:
            pass

    history = (
        db.query(PriceHistory)
        .filter_by(product_id=product_id)
        .order_by(PriceHistory.date.asc())
        .all()
    )

    skus = db.query(Sku).filter_by(product_id=product_id).all()

    # Build chart data grouped by variant for the price history graph
    chart_data = {}
    for row in history:
        if row.variant not in chart_data:
            chart_data[row.variant] = {"dates": [], "prices": []}
        chart_data[row.variant]["dates"].append(row.date.isoformat())
        chart_data[row.variant]["prices"].append(
            float(row.market_price) if row.market_price else None
        )

    from app.deps import templates
    return templates.TemplateResponse("card_detail.html", {
        "request": request,
        "product": product,
        "category": category,
        "variants": variants,
        "skus": skus,
        "history": history,
        "chart_data": chart_data,
        "game": category.name if category else "",
    })
