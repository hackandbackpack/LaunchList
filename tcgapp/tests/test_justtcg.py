import pytest
from unittest.mock import AsyncMock, patch
from app.services.justtcg import JustTCGClient


@pytest.fixture
def client():
    return JustTCGClient(api_key="test_key")


MOCK_CARD_RESPONSE = {
    "data": [
        {
            "id": "pokemon-sv08-charizard-ex-rare",
            "name": "Charizard ex",
            "game": "pokemon",
            "set": "sv08",
            "set_name": "Surging Sparks",
            "number": "006",
            "rarity": "Double Rare",
            "tcgplayerId": "572189",
            "variants": [
                {
                    "id": "pokemon-sv08-charizard-ex-rare_near-mint_normal",
                    "condition": "Near Mint",
                    "printing": "Normal",
                    "tcgplayerSkuId": "9876543",
                    "price": 12.50,
                    "priceChange24hr": -2.1,
                    "priceChange7d": 5.3,
                    "avgPrice7d": 13.00,
                    "minPrice7d": 11.00,
                    "maxPrice7d": 15.00,
                    "lastUpdated": 1739900000,
                    "priceHistory": [
                        {"p": 12.00, "t": 1739800000},
                        {"p": 12.50, "t": 1739900000},
                    ],
                }
            ],
        }
    ],
    "meta": {"total": 1, "limit": 20, "offset": 0, "hasMore": False},
    "_metadata": {
        "apiRequestsRemaining": 999,
        "apiDailyRequestsRemaining": 99,
    },
}


class TestJustTCGClient:
    @pytest.mark.asyncio
    async def test_search_card_by_name(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = MOCK_CARD_RESPONSE
            result = await client.search_cards(game="pokemon", query="Charizard ex")
            mock_req.assert_called_once()
            assert len(result["data"]) == 1
            assert result["data"][0]["name"] == "Charizard ex"

    @pytest.mark.asyncio
    async def test_get_card_by_tcgplayer_id(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = MOCK_CARD_RESPONSE
            result = await client.get_card(tcgplayer_id="572189")
            assert result["data"][0]["tcgplayerId"] == "572189"

    @pytest.mark.asyncio
    async def test_batch_lookup(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = MOCK_CARD_RESPONSE
            items = [{"tcgplayerId": "572189"}, {"tcgplayerId": "572190"}]
            result = await client.batch_lookup(items)
            mock_req.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_games(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {"data": [{"id": "pokemon", "name": "Pokemon"}]}
            result = await client.get_games()
            assert len(result["data"]) == 1

    @pytest.mark.asyncio
    async def test_get_sets(self, client):
        with patch.object(client, "_request", new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {"data": [{"id": "sv08", "name": "Surging Sparks"}]}
            result = await client.get_sets(game="pokemon")
            assert len(result["data"]) == 1

    def test_extract_variant_prices(self, client):
        variant = MOCK_CARD_RESPONSE["data"][0]["variants"][0]
        prices = client.extract_prices(variant)
        assert prices["price"] == 12.50
        assert prices["condition"] == "Near Mint"
        assert prices["printing"] == "Normal"
        assert prices["sku_id"] == "9876543"
