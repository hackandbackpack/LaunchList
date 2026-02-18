import pytest
from decimal import Decimal
from app.services.repricing import RepricingService, RepricingStrategy


class TestRepricingService:
    def test_match_tcglow(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("15.00"),
            tcg_low=Decimal("12.50"),
            market_price=Decimal("14.00"),
            strategy=RepricingStrategy.MATCH_LOW,
        )
        assert result == Decimal("12.50")

    def test_undercut_by_percentage(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("15.00"),
            tcg_low=Decimal("12.50"),
            market_price=Decimal("14.00"),
            strategy=RepricingStrategy.UNDERCUT,
            undercut_pct=Decimal("5"),
        )
        assert result == Decimal("11.88")

    def test_match_market(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("15.00"),
            tcg_low=Decimal("12.50"),
            market_price=Decimal("14.00"),
            strategy=RepricingStrategy.MATCH_MARKET,
        )
        assert result == Decimal("14.00")

    def test_floor_price_enforced(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("15.00"),
            tcg_low=Decimal("0.50"),
            market_price=Decimal("0.75"),
            strategy=RepricingStrategy.MATCH_LOW,
            floor_price=Decimal("1.00"),
        )
        assert result == Decimal("1.00")

    def test_minimum_price_never_below_penny(self):
        service = RepricingService()
        result = service.calculate_price(
            current_price=Decimal("0.10"),
            tcg_low=Decimal("0.005"),
            market_price=Decimal("0.01"),
            strategy=RepricingStrategy.MATCH_LOW,
        )
        assert result == Decimal("0.01")

    def test_parse_tcgplayer_csv(self):
        csv_content = (
            'TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,'
            'Rarity,Condition,TCG Market Price,TCG Direct Low,'
            'TCG Low Price With Shipping,TCG Low Price,Total Quantity,'
            'Add to Quantity,TCG Marketplace Price,Photo URL\n'
            '9876543,Pokemon,Surging Sparks,Charizard ex,,006,'
            'Double Rare,Near Mint,14.00,,12.75,12.50,5,'
            '0,15.00,\n'
        )
        service = RepricingService()
        rows = service.parse_csv(csv_content)
        assert len(rows) == 1
        assert rows[0]["sku_id"] == "9876543"
        assert rows[0]["current_listed_price"] == Decimal("15.00")
