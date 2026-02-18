import csv
import io
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum


class RepricingStrategy(Enum):
    MATCH_LOW = "match_low"
    UNDERCUT = "undercut"
    MATCH_MARKET = "match_market"


ABSOLUTE_MINIMUM = Decimal("0.01")
TWO_PLACES = Decimal("0.01")

# Column mappings from TCGPlayer export CSV to internal field names
CSV_COLUMN_MAP = {
    "TCGplayer Id": "sku_id",
    "Product Line": "product_line",
    "Set Name": "set_name",
    "Product Name": "product_name",
    "Title": "title",
    "Number": "number",
    "Rarity": "rarity",
    "Condition": "condition",
    "TCG Market Price": "market_price",
    "TCG Direct Low": "direct_low",
    "TCG Low Price With Shipping": "tcg_low_with_shipping",
    "TCG Low Price": "tcg_low",
    "Total Quantity": "total_quantity",
    "Add to Quantity": "add_to_quantity",
    "TCG Marketplace Price": "current_listed_price",
    "Photo URL": "photo_url",
}

PRICE_FIELDS = {
    "market_price",
    "direct_low",
    "tcg_low_with_shipping",
    "tcg_low",
    "current_listed_price",
}


def _to_decimal(value: str) -> Decimal | None:
    """Convert a string price value to Decimal, returning None for empty strings."""
    if not value or not value.strip():
        return None
    return Decimal(value.strip())


class RepricingService:
    def calculate_price(
        self,
        current_price: Decimal,
        tcg_low: Decimal,
        market_price: Decimal,
        strategy: RepricingStrategy,
        undercut_pct: Decimal | None = None,
        floor_price: Decimal | None = None,
    ) -> Decimal:
        """Calculate a new price based on the chosen repricing strategy.

        Args:
            current_price: The seller's current listed price.
            tcg_low: The lowest price on TCGPlayer.
            market_price: The TCGPlayer market price.
            strategy: Which repricing strategy to apply.
            undercut_pct: Percentage to undercut tcg_low (used with UNDERCUT strategy).
            floor_price: Optional minimum price the seller will accept.

        Returns:
            The calculated new price as a Decimal with 2 decimal places.
        """
        if strategy == RepricingStrategy.MATCH_LOW:
            new_price = tcg_low
        elif strategy == RepricingStrategy.UNDERCUT:
            pct = undercut_pct or Decimal("0")
            multiplier = Decimal("1") - (pct / Decimal("100"))
            new_price = (tcg_low * multiplier).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        elif strategy == RepricingStrategy.MATCH_MARKET:
            new_price = market_price
        else:
            new_price = current_price

        # Enforce floor price if set
        if floor_price is not None and new_price < floor_price:
            new_price = floor_price

        # Never go below the absolute minimum of one cent
        if new_price < ABSOLUTE_MINIMUM:
            new_price = ABSOLUTE_MINIMUM

        return new_price.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    def parse_csv(self, csv_content: str) -> list[dict]:
        """Parse a TCGPlayer inventory export CSV into a list of row dicts.

        Maps TCGPlayer column names to internal field names and converts
        price strings to Decimal values (empty strings become None).

        Args:
            csv_content: Raw CSV string from TCGPlayer inventory export.

        Returns:
            List of dicts with mapped field names and Decimal price values.
        """
        reader = csv.DictReader(io.StringIO(csv_content))
        rows = []

        for raw_row in reader:
            mapped_row = {}
            for csv_col, field_name in CSV_COLUMN_MAP.items():
                raw_value = raw_row.get(csv_col, "")
                if field_name in PRICE_FIELDS:
                    mapped_row[field_name] = _to_decimal(raw_value)
                else:
                    mapped_row[field_name] = raw_value
            rows.append(mapped_row)

        return rows

    def generate_csv(self, rows: list[dict]) -> str:
        """Generate a TCGPlayer-compatible CSV from processed row dicts.

        Writes back the original TCGPlayer column headers with updated
        TCG Marketplace Price values.

        Args:
            rows: List of row dicts (as returned by parse_csv, potentially
                  with modified current_listed_price values).

        Returns:
            CSV string ready for upload to TCGPlayer.
        """
        # Reverse the column map: internal field name -> CSV column header
        field_to_csv = {v: k for k, v in CSV_COLUMN_MAP.items()}
        headers = list(CSV_COLUMN_MAP.keys())

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()

        for row in rows:
            csv_row = {}
            for field_name, csv_col in field_to_csv.items():
                value = row.get(field_name, "")
                if value is None:
                    value = ""
                elif isinstance(value, Decimal):
                    value = str(value)
                csv_row[csv_col] = value
            writer.writerow(csv_row)

        return output.getvalue()
