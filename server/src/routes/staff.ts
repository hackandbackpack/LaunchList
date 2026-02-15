import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import {
  getAllOrders,
  getOrderById,
  getOrderWithItems,
  updateOrder,
  updateLineItem,
  deleteLineItem,
  getLineItemById,
  getLineItemsByOrderId,
} from '../services/orderService.js';
import { requestStatuses } from '../db/schema.js';
import { logAudit } from '../services/auditService.js';

const router = Router();

// All staff routes require authentication
router.use(requireAuth);
router.use(requireStaff);

const listOrdersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(requestStatuses).optional(),
});

// GET /api/staff/orders - List orders with pagination
router.get('/orders', (req, res, next) => {
  try {
    const { limit, offset, status } = listOrdersSchema.parse(req.query);
    const result = getAllOrders({ limit, offset, status });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/staff/orders/:id - Get order details with line items
router.get('/orders/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const result = getOrderWithItems(id);

    if (!result) {
      return next(createError('Order not found', 404, 'ORDER_NOT_FOUND'));
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

const updateOrderSchema = z.object({
  status: z.enum(requestStatuses).optional(),
  staffNotes: z.string().max(5000).optional(),
  estimatedTotal: z.number().min(0).max(100000).optional(),
  missingItems: z.string().max(2000).optional(),
});

// PATCH /api/staff/orders/:id - Update order
router.patch('/orders/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = updateOrderSchema.parse(req.body);

    const order = getOrderById(id);
    if (!order) {
      return next(createError('Order not found', 404, 'ORDER_NOT_FOUND'));
    }

    const updated = updateOrder(id, updates);
    logAudit(req, {
      action: 'order.update',
      entityType: 'order',
      entityId: id,
      details: JSON.stringify(updates),
    });
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
});

const updateLineItemSchema = z.object({
  quantityFound: z.number().int().min(0).optional(),
  unitPrice: z.number().min(0).optional(),
  conditionVariants: z.string().optional().refine(
    (val) => {
      if (!val) return true;
      try { JSON.parse(val); return true; } catch { return false; }
    },
    { message: 'conditionVariants must be valid JSON' }
  ),
  cardName: z.string().min(1).max(200).optional(),
});

// PATCH /api/staff/orders/:orderId/items/:itemId - Update line item
router.patch('/orders/:orderId/items/:itemId', (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const updates = updateLineItemSchema.parse(req.body);

    // Verify order exists
    const order = getOrderById(orderId);
    if (!order) {
      return next(createError('Order not found', 404, 'ORDER_NOT_FOUND'));
    }

    // Verify item exists and belongs to order
    const item = getLineItemById(itemId);
    if (!item || item.deckRequestId !== orderId) {
      return next(createError('Line item not found', 404, 'ITEM_NOT_FOUND'));
    }

    const updated = updateLineItem(itemId, updates);
    logAudit(req, {
      action: 'lineitem.update',
      entityType: 'lineitem',
      entityId: itemId,
      details: JSON.stringify(updates),
    });
    res.json({ lineItem: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/staff/orders/:orderId/items/:itemId - Delete line item
router.delete('/orders/:orderId/items/:itemId', (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;

    // Verify order exists
    const order = getOrderById(orderId);
    if (!order) {
      return next(createError('Order not found', 404, 'ORDER_NOT_FOUND'));
    }

    // Verify item exists and belongs to order
    const item = getLineItemById(itemId);
    if (!item || item.deckRequestId !== orderId) {
      return next(createError('Line item not found', 404, 'ITEM_NOT_FOUND'));
    }

    const deleted = deleteLineItem(itemId);
    if (!deleted) {
      return next(createError('Failed to delete line item', 500));
    }

    logAudit(req, {
      action: 'lineitem.delete',
      entityType: 'lineitem',
      entityId: itemId,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/staff/orders/:orderId/items - Get all line items for an order
router.get('/orders/:orderId/items', (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = getOrderById(orderId);
    if (!order) {
      return next(createError('Order not found', 404, 'ORDER_NOT_FOUND'));
    }

    const items = getLineItemsByOrderId(orderId);
    res.json({ lineItems: items });
  } catch (err) {
    next(err);
  }
});

export default router;
