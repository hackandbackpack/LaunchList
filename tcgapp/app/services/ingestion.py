import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.models import (
    Category, Product, Sku, CurrentPrice, PriceHistory, Group,
)

GAME_CATEGORY_MAP = {
    "pokemon": {"category_id": 1, "name": "pokemon", "display_name": "Pokemon"},
    "magic-the-gathering": {"category_id": 2, "name": "magic", "display_name": "Magic: The Gathering"},
    "one-piece-card-game": {"category_id": 3, "name": "onepiece", "display_name": "One Piece"},
    "disney-lorcana": {"category_id": 4, "name": "lorcana", "display_name": "Disney Lorcana"},
}


def _to_decimal(value) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def _clean_name(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9 ]", "", name).strip().lower()


class IngestionService:
    def __init__(self, db: Session):
        self.db = db

    def parse_product(self, card: dict) -> dict | None:
        tcgplayer_id = card.get("tcgplayerId")
        if not tcgplayer_id:
            return None

        game = card.get("game", "pokemon")
        category_info = GAME_CATEGORY_MAP.get(game, GAME_CATEGORY_MAP["pokemon"])

        return {
            "product_id": int(tcgplayer_id),
            "category_id": category_info["category_id"],
            "name": card.get("name", ""),
            "clean_name": _clean_name(card.get("name", "")),
            "image_url": card.get("image"),
            "number": card.get("number"),
            "rarity": card.get("rarity"),
            "product_type": "single",
        }

    def parse_skus(self, card: dict) -> list[dict]:
        tcgplayer_id = card.get("tcgplayerId")
        if not tcgplayer_id:
            return []

        skus = []
        for variant in card.get("variants", []):
            sku_id = variant.get("tcgplayerSkuId")
            if not sku_id:
                continue
            skus.append({
                "sku_id": int(sku_id),
                "product_id": int(tcgplayer_id),
                "variant": variant.get("printing", "Normal"),
                "condition": variant.get("condition", "Near Mint"),
                "language": "English",
            })
        return skus

    def parse_current_prices(self, card: dict) -> list[dict]:
        tcgplayer_id = card.get("tcgplayerId")
        if not tcgplayer_id:
            return []

        prices = []
        for variant in card.get("variants", []):
            prices.append({
                "product_id": int(tcgplayer_id),
                "variant": variant.get("printing", "Normal"),
                "market_price": _to_decimal(variant.get("price")),
                "low_price": _to_decimal(variant.get("minPrice7d")),
                "mid_price": _to_decimal(variant.get("avgPrice7d")),
                "source": "justtcg",
            })
        return prices

    def ensure_category(self, game: str) -> Category:
        info = GAME_CATEGORY_MAP.get(game, GAME_CATEGORY_MAP["pokemon"])
        existing = self.db.query(Category).filter_by(
            category_id=info["category_id"]
        ).first()
        if existing:
            return existing

        cat = Category(
            category_id=info["category_id"],
            name=info["name"],
            display_name=info["display_name"],
        )
        self.db.add(cat)
        self.db.flush()
        return cat

    def upsert_product(self, product_data: dict) -> Product:
        existing = self.db.query(Product).filter_by(
            product_id=product_data["product_id"]
        ).first()

        if existing:
            for key, value in product_data.items():
                if value is not None:
                    setattr(existing, key, value)
            return existing

        product = Product(**product_data)
        self.db.add(product)
        self.db.flush()
        return product

    def upsert_sku(self, sku_data: dict) -> Sku:
        existing = self.db.query(Sku).filter_by(sku_id=sku_data["sku_id"]).first()
        if existing:
            for key, value in sku_data.items():
                setattr(existing, key, value)
            return existing

        sku = Sku(**sku_data)
        self.db.add(sku)
        self.db.flush()
        return sku

    def upsert_current_price(self, price_data: dict) -> CurrentPrice:
        existing = self.db.query(CurrentPrice).filter_by(
            product_id=price_data["product_id"],
            variant=price_data["variant"],
        ).first()

        if existing:
            for key, value in price_data.items():
                setattr(existing, key, value)
            return existing

        price = CurrentPrice(**price_data)
        self.db.add(price)
        self.db.flush()
        return price

    def record_price_history(self, price_data: dict) -> PriceHistory | None:
        today = date.today()
        existing = self.db.query(PriceHistory).filter_by(
            product_id=price_data["product_id"],
            variant=price_data["variant"],
            date=today,
        ).first()

        if existing:
            existing.market_price = price_data.get("market_price")
            existing.low_price = price_data.get("low_price")
            return existing

        history = PriceHistory(
            product_id=price_data["product_id"],
            variant=price_data["variant"],
            date=today,
            market_price=price_data.get("market_price"),
            low_price=price_data.get("low_price"),
            source="justtcg",
        )
        self.db.add(history)
        self.db.flush()
        return history

    def ingest_card(self, card: dict) -> bool:
        product_data = self.parse_product(card)
        if not product_data:
            return False

        game = card.get("game", "pokemon")
        self.ensure_category(game)
        self.upsert_product(product_data)

        for sku_data in self.parse_skus(card):
            self.upsert_sku(sku_data)

        for price_data in self.parse_current_prices(card):
            self.upsert_current_price(price_data)
            self.record_price_history(price_data)

        self.db.commit()
        return True

    def ingest_batch(self, cards: list[dict]) -> tuple[int, int]:
        success_count = 0
        error_count = 0

        for card in cards:
            try:
                if self.ingest_card(card):
                    success_count += 1
                else:
                    error_count += 1
            except Exception:
                self.db.rollback()
                error_count += 1

        return success_count, error_count
