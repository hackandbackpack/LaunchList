from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import PriceAlert, WatchlistItem, CurrentPrice, PriceHistory


def evaluate_alert(
    old_price: Decimal,
    new_price: Decimal,
    threshold_pct: Decimal,
    direction: str,
) -> bool:
    if old_price == new_price:
        return False

    if old_price == Decimal("0"):
        return direction in ("up", "both")

    pct_change = ((new_price - old_price) / old_price) * 100

    if direction == "up":
        return pct_change >= threshold_pct
    elif direction == "down":
        return pct_change <= -threshold_pct
    else:
        return abs(pct_change) >= threshold_pct


def check_alerts(db: Session) -> list[dict]:
    triggered = []
    active_alerts = (
        db.query(PriceAlert)
        .join(WatchlistItem)
        .filter(
            WatchlistItem.active.is_(True),
            PriceAlert.triggered_at.is_(None),
        )
        .all()
    )

    for alert in active_alerts:
        watchlist_item = alert.watchlist_item
        product_id = watchlist_item.product_id
        variant = watchlist_item.variant

        current = (
            db.query(CurrentPrice)
            .filter_by(product_id=product_id, variant=variant)
            .first()
        )
        if not current or not current.market_price:
            continue

        history = (
            db.query(PriceHistory)
            .filter_by(product_id=product_id, variant=variant)
            .order_by(PriceHistory.date.desc())
            .offset(1)
            .first()
        )
        if not history or not history.market_price:
            continue

        if evaluate_alert(
            old_price=history.market_price,
            new_price=current.market_price,
            threshold_pct=alert.threshold_pct,
            direction=alert.direction,
        ):
            alert.triggered_at = datetime.now()
            triggered.append({
                "alert_id": alert.id,
                "product_id": product_id,
                "variant": variant,
                "old_price": history.market_price,
                "new_price": current.market_price,
                "threshold_pct": alert.threshold_pct,
                "direction": alert.direction,
            })

    if triggered:
        db.commit()

    return triggered
