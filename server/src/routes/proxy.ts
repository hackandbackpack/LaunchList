import { Router } from 'express';
import { z } from 'zod';
import { proxyRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const TCGDEX_BASE_URL = 'https://api.tcgdex.net/v2/en';

interface TCGdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  set?: {
    id: string;
    name: string;
  };
  rarity?: string;
  category?: string;
}

interface NormalizedCard {
  id: string;
  name: string;
  set_name: string | null;
  set_id: string | null;
  rarity: string | null;
  image_url: string | null;
}

function normalizeCard(card: TCGdexCard): NormalizedCard {
  return {
    id: card.id,
    name: card.name,
    set_name: card.set?.name || null,
    set_id: card.set?.id || null,
    rarity: card.rarity || null,
    image_url: card.image ? `${card.image}/high.webp` : null,
  };
}

const searchSchema = z.object({
  action: z.enum(['search', 'card']),
  query: z.string().max(200).optional(),
  id: z.string().max(200).optional(),
});

// GET /api/proxy/pokemon-tcg - Proxy requests to TCGdex API
router.get('/pokemon-tcg', proxyRateLimiter, async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const params = searchSchema.parse(req.query);

    let url: string;
    let responseData: { cards: NormalizedCard[] } = { cards: [] };

    if (params.action === 'search' && params.query) {
      // Search for cards by name
      url = `${TCGDEX_BASE_URL}/cards?name=${encodeURIComponent(params.query)}`;

      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        return res.json({ cards: [] });
      }

      const cards = (await response.json()) as TCGdexCard[];
      responseData.cards = Array.isArray(cards) ? cards.slice(0, 20).map(normalizeCard) : [];
    } else if (params.action === 'card' && params.id) {
      // Get specific card by ID
      url = `${TCGDEX_BASE_URL}/cards/${encodeURIComponent(params.id)}`;

      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        return res.json({ cards: [] });
      }

      const card = (await response.json()) as TCGdexCard;
      responseData.cards = [normalizeCard(card)];
    }

    res.json(responseData);
  } catch (err) {
    // Return empty data on error (timeout, network issues, etc.)
    console.error('Pokemon TCG proxy error:', err);
    res.json({ cards: [] });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
