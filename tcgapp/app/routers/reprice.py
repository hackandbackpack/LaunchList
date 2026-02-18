import io
from fastapi import APIRouter, Depends, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.repricing import RepricingService, RepricingStrategy
from app.services.justtcg import JustTCGClient

router = APIRouter()


@router.get("/reprice")
async def reprice_page(request: Request):
    from app.deps import templates
    return templates.TemplateResponse("reprice.html", {
        "request": request,
        "results": None,
        "strategy": "MATCH_LOW",
    })


@router.post("/reprice/upload")
async def reprice_upload(
    request: Request,
    file: UploadFile = File(...),
    strategy: str = Form(default="MATCH_LOW"),
    undercut_pct: str = Form(default="5"),
    floor_price: str = Form(default=""),
    db: Session = Depends(get_db),
):
    from decimal import Decimal
    service = RepricingService()

    content = await file.read()
    csv_text = content.decode("utf-8-sig")
    rows = service.parse_csv(csv_text)

    strat = RepricingStrategy[strategy]
    undercut = Decimal(undercut_pct) if undercut_pct else None
    floor = Decimal(floor_price) if floor_price else None

    # Fetch current prices from JustTCG for all SKUs
    client = JustTCGClient()
    sku_ids = [r["sku_id"] for r in rows if r.get("sku_id")]

    results = []
    for row in rows:
        tcg_low = row.get("tcg_low") or Decimal("0")
        market = row.get("market_price") or Decimal("0")
        current = row.get("current_listed_price") or Decimal("0")

        if tcg_low or market:
            new_price = service.calculate_price(
                current_price=current,
                tcg_low=tcg_low,
                market_price=market,
                strategy=strat,
                undercut_pct=undercut,
                floor_price=floor,
            )
        else:
            new_price = current

        diff = new_price - current if current else Decimal("0")
        results.append({
            **row,
            "new_price": new_price,
            "diff": diff,
        })

    # Store results in session-like approach via form hidden fields
    from app.deps import templates
    return templates.TemplateResponse("reprice.html", {
        "request": request,
        "results": results,
        "strategy": strategy,
        "undercut_pct": undercut_pct,
        "floor_price": floor_price,
        "original_csv": csv_text,
    })


@router.post("/reprice/download")
async def reprice_download(
    original_csv: str = Form(...),
    strategy: str = Form(default="MATCH_LOW"),
    undercut_pct: str = Form(default="5"),
    floor_price: str = Form(default=""),
):
    from decimal import Decimal
    service = RepricingService()

    rows = service.parse_csv(original_csv)
    strat = RepricingStrategy[strategy]
    undercut = Decimal(undercut_pct) if undercut_pct else None
    floor = Decimal(floor_price) if floor_price else None

    for row in rows:
        tcg_low = row.get("tcg_low") or Decimal("0")
        market = row.get("market_price") or Decimal("0")
        current = row.get("current_listed_price") or Decimal("0")

        if tcg_low or market:
            row["new_price"] = service.calculate_price(
                current_price=current,
                tcg_low=tcg_low,
                market_price=market,
                strategy=strat,
                undercut_pct=undercut,
                floor_price=floor,
            )
        else:
            row["new_price"] = current

    csv_output = service.generate_csv(rows)
    buffer = io.BytesIO(csv_output.encode("utf-8"))

    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=repriced_inventory.csv"},
    )
