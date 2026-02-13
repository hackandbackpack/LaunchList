import { getDatabase } from '../db/index.js';
import * as schema from '../db/schema.js';
import { Request } from 'express';
import { AuthRequest } from '../middleware/auth.js';

interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string;
}

export function logAudit(req: Request, entry: AuditEntry) {
  const db = getDatabase();
  const userId = (req as AuthRequest).user?.id || null;
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

  db.insert(schema.auditLog).values({
    userId,
    action: entry.action,
    entityType: entry.entityType || null,
    entityId: entry.entityId || null,
    details: entry.details || null,
    ipAddress,
  }).run();
}
