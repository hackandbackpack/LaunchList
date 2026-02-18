from decimal import Decimal
from app.services.alerts import evaluate_alert


class TestAlertEvaluation:
    def test_price_up_triggers_upward_alert(self):
        triggered = evaluate_alert(
            old_price=Decimal("10.00"),
            new_price=Decimal("12.00"),
            threshold_pct=Decimal("15"),
            direction="up",
        )
        assert triggered is True

    def test_price_up_does_not_trigger_downward_alert(self):
        triggered = evaluate_alert(
            old_price=Decimal("10.00"),
            new_price=Decimal("12.00"),
            threshold_pct=Decimal("15"),
            direction="down",
        )
        assert triggered is False

    def test_both_direction_triggers_on_drop(self):
        triggered = evaluate_alert(
            old_price=Decimal("10.00"),
            new_price=Decimal("8.00"),
            threshold_pct=Decimal("15"),
            direction="both",
        )
        assert triggered is True

    def test_small_change_does_not_trigger(self):
        triggered = evaluate_alert(
            old_price=Decimal("10.00"),
            new_price=Decimal("10.50"),
            threshold_pct=Decimal("10"),
            direction="both",
        )
        assert triggered is False

    def test_zero_old_price_no_crash(self):
        triggered = evaluate_alert(
            old_price=Decimal("0.00"),
            new_price=Decimal("5.00"),
            threshold_pct=Decimal("10"),
            direction="up",
        )
        assert triggered is True

    def test_equal_prices_no_trigger(self):
        triggered = evaluate_alert(
            old_price=Decimal("10.00"),
            new_price=Decimal("10.00"),
            threshold_pct=Decimal("5"),
            direction="both",
        )
        assert triggered is False
