from fastapi import APIRouter, Depends, Request, Form
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models import Product, Category, SealedTracking
from app.services.justtcg import JustTCGClient
from app.services.ingestion import IngestionService

router = APIRouter()


@router.get("/settings")
async def settings_page(request: Request, db: Session = Depends(get_db)):
    # Masked API key
    api_key = settings.justtcg_api_key
    masked_key = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else "Not configured"

    # Product counts per category
    categories = db.query(Category).all()
    tracked = []
    for cat in categories:
        products = db.query(Product).filter_by(category_id=cat.category_id).all()
        tracked.append({
            "category": cat,
            "products": products,
            "count": len(products),
        })

    sealed_count = db.query(func.count(SealedTracking.id)).filter(
        SealedTracking.active.is_(True)
    ).scalar() or 0

    total_products = db.query(func.count(Product.product_id)).scalar() or 0

    from app.deps import templates
    return templates.TemplateResponse("settings.html", {
        "request": request,
        "masked_key": masked_key,
        "tracked": tracked,
        "sealed_count": sealed_count,
        "total_products": total_products,
    })


@router.post("/settings/refresh")
async def manual_refresh(db: Session = Depends(get_db)):
    client = JustTCGClient()
    ingestion = IngestionService(db=db)

    products = db.query(Product).all()
    batch_size = 20
    success = 0
    errors = 0

    for i in range(0, len(products), batch_size):
        batch = products[i:i + batch_size]
        items = [{"tcgplayerId": str(p.product_id)} for p in batch]
        try:
            result = await client.batch_lookup(items)
            cards = result.get("data", [])
            s, e = ingestion.ingest_batch(cards)
            success += s
            errors += e
        except Exception:
            errors += len(batch)

    return RedirectResponse(url="/settings", status_code=303)


@router.post("/settings/cards/remove")
async def remove_card(
    product_id: int = Form(...),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter_by(product_id=product_id).first()
    if product:
        db.delete(product)
        db.commit()
    return RedirectResponse(url="/settings", status_code=303)
