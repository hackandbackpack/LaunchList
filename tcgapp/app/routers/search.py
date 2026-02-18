from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product, CurrentPrice, Category
from app.services.justtcg import JustTCGClient
from app.services.ingestion import IngestionService

router = APIRouter()


@router.get("/search")
async def search_page(
    request: Request,
    q: str = Query(default=""),
    game: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    db: Session = Depends(get_db),
):
    results = []
    total = 0
    per_page = 20

    if q:
        query = db.query(Product).join(
            CurrentPrice, Product.product_id == CurrentPrice.product_id, isouter=True
        )

        if game:
            cat = db.query(Category).filter_by(name=game).first()
            if cat:
                query = query.filter(Product.category_id == cat.category_id)

        query = query.filter(
            or_(
                Product.name.ilike(f"%{q}%"),
                Product.clean_name.ilike(f"%{q}%"),
            )
        )

        total = query.count()
        products = query.offset((page - 1) * per_page).limit(per_page).all()

        for product in products:
            price = db.query(CurrentPrice).filter_by(
                product_id=product.product_id
            ).first()
            cat = db.query(Category).filter_by(
                category_id=product.category_id
            ).first()
            results.append({
                "product": product,
                "price": price,
                "game": cat.name if cat else "",
                "game_display": cat.display_name if cat else "",
            })

        # If no local results, try JustTCG API
        if not results and q:
            try:
                client = JustTCGClient()
                game_slug = game or "pokemon"
                api_result = await client.search_cards(game=game_slug, query=q)
                cards = api_result.get("data", [])

                ingestion = IngestionService(db=db)
                for card in cards[:per_page]:
                    ingestion.ingest_card(card)

                # Re-query after ingestion
                products = query.offset(0).limit(per_page).all()
                total = query.count()
                for product in products:
                    price = db.query(CurrentPrice).filter_by(
                        product_id=product.product_id
                    ).first()
                    cat = db.query(Category).filter_by(
                        category_id=product.category_id
                    ).first()
                    results.append({
                        "product": product,
                        "price": price,
                        "game": cat.name if cat else "",
                        "game_display": cat.display_name if cat else "",
                    })
            except Exception:
                pass

    categories = db.query(Category).all()
    total_pages = max(1, (total + per_page - 1) // per_page)

    from app.deps import templates
    return templates.TemplateResponse("search.html", {
        "request": request,
        "results": results,
        "query": q,
        "game": game,
        "page": page,
        "total": total,
        "total_pages": total_pages,
        "categories": categories,
    })
