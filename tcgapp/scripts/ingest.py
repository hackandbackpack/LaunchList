#!/usr/bin/env python3
"""Nightly ingestion script for updating tracked product prices from JustTCG."""

import asyncio
import logging
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.database import SessionLocal
from app.models import Product
from app.services.justtcg import JustTCGClient
from app.services.ingestion import IngestionService
from app.services.alerts import check_alerts

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

BATCH_SIZE = 20


async def run_ingestion():
    start_time = datetime.now()
    log.info("Starting nightly price ingestion")

    db = SessionLocal()
    client = JustTCGClient()
    ingestion = IngestionService(db=db)

    try:
        products = db.query(Product).all()
        total_products = len(products)
        log.info(f"Found {total_products} tracked products")

        if not total_products:
            log.info("No products to update, exiting")
            return

        success_total = 0
        error_total = 0

        for batch_start in range(0, total_products, BATCH_SIZE):
            batch = products[batch_start:batch_start + BATCH_SIZE]
            batch_items = [
                {"tcgplayerId": str(p.product_id)} for p in batch
            ]

            try:
                result = await client.batch_lookup(batch_items)
                cards = result.get("data", [])

                successes, errors = ingestion.ingest_batch(cards)
                success_total += successes
                error_total += errors

                metadata = result.get("_metadata", {})
                remaining = metadata.get("apiRequestsRemaining", "?")
                daily_remaining = metadata.get("apiDailyRequestsRemaining", "?")

                log.info(
                    f"Batch {batch_start // BATCH_SIZE + 1}: "
                    f"{successes} updated, {errors} errors | "
                    f"API: {remaining} req remaining, {daily_remaining} daily"
                )
            except Exception:
                log.exception(f"Batch {batch_start // BATCH_SIZE + 1} failed")
                error_total += len(batch)

        log.info("Checking price alerts...")
        triggered_alerts = check_alerts(db)
        if triggered_alerts:
            log.info(f"Triggered {len(triggered_alerts)} alerts")
        else:
            log.info("No alerts triggered")

        elapsed = (datetime.now() - start_time).total_seconds()
        log.info(
            f"Ingestion complete in {elapsed:.1f}s: "
            f"{success_total}/{total_products} updated, {error_total} errors"
        )
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(run_ingestion())
