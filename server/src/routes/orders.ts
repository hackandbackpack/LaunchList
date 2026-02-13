import { Router } from 'express';
import { z } from 'zod';
import { createOrder, getOrderByNumberAndEmail, getOrderLineItems } from '../services/orderService.js';
import { createError } from '../middleware/errorHandler.js';
import { gameTypes } from '../db/schema.js';
import { orderSubmitRateLimiter } from '../middleware/rateLimiter.js';
import { validateCsrf } from '../middleware/csrf.js';

const router = Router();

const lineItemSchema = z.object({
  quantity: z.number().int().min(1).max(99),
  cardName: z.string().min(1).max(200),
  parseConfidence: z.number().optional(),
  lineRaw: z.string(),
});

const submitOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim()
    .min(1, 'Phone is required')
    .max(20)
    .regex(/^\d{3}[-.]?\d{3}[-.]?\d{4}$/),
  notifyMethod: z.literal('email'),
  game: z.enum(gameTypes),
  format: z.string().trim().max(100).optional(),
  pickupWindow: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  rawDecklist: z.string().trim().min(1).max(50000),
  lineItems: z.array(lineItemSchema).min(1).max(500),
});

// POST /api/orders - Submit a new order (rate limited per IP)
router.post('/', orderSubmitRateLimiter, validateCsrf, async (req, res, next) => {
  try {
    const input = submitOrderSchema.parse(req.body);
    const result = await createOrder(input);

    res.status(201).json({
      orderNumber: result.order.orderNumber,
      order: result.order,
      lineItems: result.lineItems,
    });
  } catch (err) {
    next(err);
  }
});

const lookupSchema = z.object({
  orderNumber: z.string().min(1),
  email: z.string().email(),
});

// POST /api/orders/lookup - Look up an order by order number and email
router.post('/lookup', (req, res, next) => {
  try {
    const { orderNumber, email } = lookupSchema.parse(req.body);
    const order = getOrderByNumberAndEmail(orderNumber, email);

    if (!order) {
      return next(createError('Order not found', 404, 'ORDER_NOT_FOUND'));
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
});

const getItemsSchema = z.object({
  email: z.string().email(),
});

// GET /api/orders/:id/items - Get line items for an order (requires email verification)
router.get('/:id/items', (req, res, next) => {
  try {
    const { id } = req.params;
    const { email } = getItemsSchema.parse(req.query);

    const lineItems = getOrderLineItems(id, email);
    res.json({ lineItems });
  } catch (err) {
    next(err);
  }
});

export default router;
