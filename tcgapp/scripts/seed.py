#!/usr/bin/env python3
"""Seed the database with test card data from JustTCG across all 4 TCGs."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.database import SessionLocal, engine
from app.models import Base, Category
from app.services.justtcg import JustTCGClient
from app.services.ingestion import IngestionService

CATEGORIES = [
    {"category_id": 1, "name": "pokemon", "display_name": "Pokemon"},
    {"category_id": 2, "name": "magic", "display_name": "Magic: The Gathering"},
    {"category_id": 3, "name": "onepiece", "display_name": "One Piece"},
    {"category_id": 4, "name": "lorcana", "display_name": "Disney Lorcana"},
]

SEARCH_QUERIES = {
    "pokemon": [
        "Charizard ex", "Pikachu ex", "Mewtwo ex", "Lugia V", "Mew ex",
        "Gardevoir ex", "Arceus VSTAR", "Giratina VSTAR", "Palkia VSTAR",
        "Miraidon ex",
    ],
    "magic-the-gathering": [
        "The One Ring", "Sheoldred", "Ragavan", "Atraxa", "Solitude",
        "Orcish Bowmasters", "Fury", "Force of Will", "Liliana of the Veil",
        "Wrenn and Six",
    ],
    "one-piece-card-game": [
        "Monkey D. Luffy", "Roronoa Zoro", "Nami", "Boa Hancock", "Shanks",
        "Yamato", "Portgas D. Ace", "Trafalgar Law", "Eustass Kid",
        "Charlotte Katakuri",
    ],
    "disney-lorcana": [
        "Elsa", "Mickey Mouse", "Stitch", "Maleficent", "Simba",
        "Rapunzel", "Maui", "Ursula", "Robin Hood", "Cruella De Vil",
    ],
}

SEALED_QUERIES = {
    "pokemon": [
        "Prismatic Evolutions Elite Trainer Box",
        "Surging Sparks Booster Box",
        "Prismatic Evolutions Booster Box",
        "Paldean Fates Elite Trainer Box",
        "151 Booster Box",
    ],
    "magic-the-gathering": [
        "Foundations Play Booster Box",
        "Duskmourn Play Booster Box",
        "Modern Horizons 3 Play Booster Box",
        "Bloomburrow Play Booster Box",
        "Murders at Karlov Manor Play Booster Box",
    ],
    "one-piece-card-game": [
        "OP-09 Booster Box",
        "OP-08 Booster Box",
        "OP-07 Booster Box",
        "OP-06 Booster Box",
        "OP-05 Booster Box",
    ],
    "disney-lorcana": [
        "Shimmering Skies Booster Box",
        "Azurite Sea Booster Box",
        "Ursula's Return Booster Box",
        "Into The Inklands Booster Box",
        "Rise of the Floodborn Booster Box",
    ],
}


async def seed_categories(db):
    """Seed the 4 game categories."""
    for cat_data in CATEGORIES:
        existing = db.query(Category).filter_by(
            category_id=cat_data["category_id"]
        ).first()
        if not existing:
            db.add(Category(**cat_data))
    db.commit()
    print(f"Seeded {len(CATEGORIES)} categories")


async def seed_cards(client: JustTCGClient, db, game: str, queries: list[str]):
    """Search and ingest cards for a game."""
    ingestion = IngestionService(db=db)
    total = 0

    for query in queries:
        try:
            result = await client.search_cards(game=game, query=query)
            cards = result.get("data", [])
            if cards:
                card = cards[0]
                if ingestion.ingest_card(card):
                    total += 1
                    print(f"  [{game}] Ingested: {card.get('name', query)}")
                else:
                    print(f"  [{game}] Skipped (no ID): {query}")
            else:
                print(f"  [{game}] No results: {query}")
        except Exception as exc:
            print(f"  [{game}] Error searching '{query}': {exc}")

    return total


async def seed_sealed(client: JustTCGClient, db, game: str, queries: list[str]):
    """Search and ingest sealed products for a game."""
    ingestion = IngestionService(db=db)
    total = 0

    for query in queries:
        try:
            result = await client.search_cards(game=game, query=query)
            cards = result.get("data", [])
            if cards:
                card = cards[0]
                card["product_type"] = "sealed"
                if ingestion.ingest_card(card):
                    total += 1
                    print(f"  [{game}] Sealed: {card.get('name', query)}")
        except Exception as exc:
            print(f"  [{game}] Sealed error '{query}': {exc}")

    return total


async def main():
    print("Starting seed process...")
    print(f"Using API key: {settings.justtcg_api_key[:8]}...")

    db = SessionLocal()
    client = JustTCGClient()

    try:
        await seed_categories(db)

        total_cards = 0
        total_sealed = 0

        for game, queries in SEARCH_QUERIES.items():
            print(f"\nSeeding {game} cards...")
            count = await seed_cards(client, db, game, queries)
            total_cards += count

        for game, queries in SEALED_QUERIES.items():
            print(f"\nSeeding {game} sealed products...")
            count = await seed_sealed(client, db, game, queries)
            total_sealed += count

        print(f"\nSeed complete: {total_cards} cards, {total_sealed} sealed products")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
