from typing import Any

import httpx

from app.config import settings

BASE_URL = "https://api.justtcg.com/v1"

GAME_SLUGS = {
    "pokemon": "pokemon",
    "magic": "magic-the-gathering",
    "onepiece": "one-piece-card-game",
    "lorcana": "disney-lorcana",
}


class JustTCGClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.justtcg_api_key
        self.headers = {"x-api-key": self.api_key}

    async def _request(
        self, method: str, endpoint: str, params: dict | None = None,
        json_body: Any = None,
    ) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{BASE_URL}{endpoint}",
                headers=self.headers,
                params=params,
                json=json_body,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    async def get_games(self) -> dict:
        return await self._request("GET", "/games")

    async def get_sets(self, game: str, query: str | None = None) -> dict:
        params = {"game": game}
        if query:
            params["q"] = query
        return await self._request("GET", "/sets", params=params)

    async def search_cards(self, game: str, query: str) -> dict:
        params = {
            "q": query,
            "game": game,
            "include_price_history": "true",
            "priceHistoryDuration": "7d",
        }
        return await self._request("GET", "/cards", params=params)

    async def get_card(
        self, tcgplayer_id: str | None = None, card_id: str | None = None,
    ) -> dict:
        params = {"include_price_history": "true", "priceHistoryDuration": "30d"}
        if tcgplayer_id:
            params["tcgplayerId"] = tcgplayer_id
        elif card_id:
            params["cardId"] = card_id
        return await self._request("GET", "/cards", params=params)

    async def batch_lookup(self, items: list[dict]) -> dict:
        return await self._request("POST", "/cards", json_body=items)

    @staticmethod
    def extract_prices(variant: dict) -> dict:
        return {
            "price": variant.get("price"),
            "condition": variant.get("condition"),
            "printing": variant.get("printing"),
            "sku_id": variant.get("tcgplayerSkuId"),
            "price_change_24h": variant.get("priceChange24hr"),
            "price_change_7d": variant.get("priceChange7d"),
            "price_change_30d": variant.get("priceChange30d"),
            "avg_price_7d": variant.get("avgPrice7d"),
            "min_price_7d": variant.get("minPrice7d"),
            "max_price_7d": variant.get("maxPrice7d"),
            "price_history": variant.get("priceHistory", []),
        }
