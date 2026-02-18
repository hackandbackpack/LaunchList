import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

from app.services.ingestion import IngestionService


MOCK_CARD = {
    "id": "pokemon-sv08-charizard-ex-rare",
    "name": "Charizard ex",
    "game": "pokemon",
    "set": "sv08",
    "set_name": "Surging Sparks",
    "number": "006",
    "rarity": "Double Rare",
    "tcgplayerId": "572189",
    "image": "https://example.com/charizard.jpg",
    "variants": [
        {
            "condition": "Near Mint",
            "printing": "Normal",
            "tcgplayerSkuId": "9876543",
            "price": 12.50,
            "minPrice7d": 11.00,
            "avgPrice7d": 13.00,
        },
        {
            "condition": "Near Mint",
            "printing": "Foil",
            "tcgplayerSkuId": "9876544",
            "price": 45.00,
            "minPrice7d": 40.00,
            "avgPrice7d": 44.00,
        },
    ],
}


class TestIngestionService:
    def test_parse_card_to_product(self):
        service = IngestionService(db=MagicMock())
        product = service.parse_product(MOCK_CARD)
        assert product["product_id"] == 572189
        assert product["name"] == "Charizard ex"
        assert product["rarity"] == "Double Rare"

    def test_parse_variants_to_skus(self):
        service = IngestionService(db=MagicMock())
        skus = service.parse_skus(MOCK_CARD)
        assert len(skus) == 2
        assert skus[0]["sku_id"] == 9876543
        assert skus[0]["variant"] == "Normal"
        assert skus[1]["variant"] == "Foil"

    def test_parse_variant_prices(self):
        service = IngestionService(db=MagicMock())
        prices = service.parse_current_prices(MOCK_CARD)
        assert len(prices) == 2
        assert prices[0]["market_price"] == Decimal("12.50")
        assert prices[0]["low_price"] == Decimal("11.00")
        assert prices[1]["variant"] == "Foil"

    def test_parse_product_missing_tcgplayer_id(self):
        card = {**MOCK_CARD, "tcgplayerId": None}
        service = IngestionService(db=MagicMock())
        product = service.parse_product(card)
        assert product is None

    def test_parse_product_image_url(self):
        service = IngestionService(db=MagicMock())
        product = service.parse_product(MOCK_CARD)
        assert product["image_url"] == "https://example.com/charizard.jpg"
