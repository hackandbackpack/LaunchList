import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { DeckRequest, DeckLineItem, ConditionVariant } from '../db/schema.js';
import { escapeHtml } from '../utils/html.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!config.smtp.host || !config.smtp.user) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('SMTP not configured, email sending disabled');
    }
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }

  return transporter;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Email would be sent to:', options.to);
    }
    return false;
  }

  try {
    await transport.sendMail({
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return true;
  } catch (err) {
    console.error('Failed to send email:', err instanceof Error ? err.message : 'Unknown error');
    return false;
  }
}

export async function verifySmtpConnection(): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) return false;
  try {
    await transport.verify();
    console.log('SMTP connection verified');
    return true;
  } catch (err) {
    console.error('SMTP verification failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function generateItemsHtml(lineItems: DeckLineItem[]): string {
  return lineItems
    .map((item) => {
      let priceInfo = '';
      if (item.quantityFound !== null && item.quantityFound !== undefined) {
        priceInfo = ` - Found: ${item.quantityFound}`;
        if (item.unitPrice) {
          priceInfo += ` @ ${formatCurrency(item.unitPrice)} each`;
        }
      }

      let conditionInfo = '';
      if (item.conditionVariants) {
        try {
          const variants: ConditionVariant[] = JSON.parse(item.conditionVariants);
          if (variants.length > 0) {
            conditionInfo = '<ul style="margin: 4px 0 0 20px; padding: 0;">';
            for (const v of variants) {
              conditionInfo += `<li>${escapeHtml(v.condition)}: ${v.quantity} @ ${formatCurrency(v.price)}</li>`;
            }
            conditionInfo += '</ul>';
          }
        } catch (err) {
          console.error('Failed to parse condition variants:', err instanceof Error ? err.message : 'Invalid JSON');
        }
      }

      // Escape user-provided card name
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}x</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(item.cardName)}${priceInfo}${conditionInfo}</td>
        </tr>
      `;
    })
    .join('');
}

export async function sendConfirmationEmail(
  order: DeckRequest,
  lineItems: DeckLineItem[]
): Promise<boolean> {
  // Escape all user-provided content
  const safeCustomerName = escapeHtml(order.customerName);
  const safeOrderNumber = escapeHtml(order.orderNumber);
  const safeGame = escapeHtml(order.game.charAt(0).toUpperCase() + order.game.slice(1));
  const safeFormat = order.format ? escapeHtml(order.format) : '';
  const safePickupWindow = order.pickupWindow ? escapeHtml(order.pickupWindow) : '';
  const safeNotes = order.notes ? escapeHtml(order.notes) : '';
  const safeStoreName = escapeHtml(config.store.name);
  const safeStoreAddress = config.store.address ? escapeHtml(config.store.address) : '';
  const safeStorePhone = config.store.phone ? escapeHtml(config.store.phone) : '';

  const subject = `Order Confirmation - ${order.orderNumber}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Order Received!</h1>

      <p>Hi ${safeCustomerName},</p>

      <p>We've received your decklist order. Here are your order details:</p>

      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Order Number:</strong> ${safeOrderNumber}</p>
        <p style="margin: 5px 0;"><strong>Game:</strong> ${safeGame}</p>
        ${safeFormat ? `<p style="margin: 5px 0;"><strong>Format:</strong> ${safeFormat}</p>` : ''}
        ${safePickupWindow ? `<p style="margin: 5px 0;"><strong>Preferred Pickup:</strong> ${safePickupWindow}</p>` : ''}
      </div>

      <h2 style="color: #333; margin-top: 30px;">Your Cards (${lineItems.length} items)</h2>

      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px; text-align: left;">Qty</th>
            <th style="padding: 8px; text-align: left;">Card</th>
          </tr>
        </thead>
        <tbody>
          ${generateItemsHtml(lineItems)}
        </tbody>
      </table>

      ${safeNotes ? `
        <div style="margin-top: 20px;">
          <strong>Your Notes:</strong>
          <p style="background: #fff8e1; padding: 10px; border-radius: 4px;">${safeNotes}</p>
        </div>
      ` : ''}

      <p style="margin-top: 30px;">We'll notify you when your order is ready for pickup!</p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

      <p style="color: #666; font-size: 14px;">
        ${safeStoreName}<br>
        ${safeStoreAddress}<br>
        ${safeStorePhone}
      </p>
    </body>
    </html>
  `;

  return sendEmail({ to: order.email, subject, html });
}

export async function sendReadyEmail(
  order: DeckRequest,
  lineItems: DeckLineItem[]
): Promise<boolean> {
  // Escape all user-provided content
  const safeCustomerName = escapeHtml(order.customerName);
  const safeOrderNumber = escapeHtml(order.orderNumber);
  const safeMissingItems = order.missingItems ? escapeHtml(order.missingItems) : '';
  const safeStoreName = escapeHtml(config.store.name);
  const safeStoreAddress = config.store.address ? escapeHtml(config.store.address) : '';
  const safeStoreEmail = config.store.email ? escapeHtml(config.store.email) : '';
  const safeStorePhone = config.store.phone ? escapeHtml(config.store.phone) : '';

  const subject = `Your Order is Ready! - ${order.orderNumber}`;

  // Calculate total if available
  let totalSection = '';
  if (order.estimatedTotal) {
    totalSection = `
      <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px 0; color: #2e7d32;">Estimated Total: ${formatCurrency(order.estimatedTotal)}</h3>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #2e7d32;">Your Order is Ready!</h1>

      <p>Hi ${safeCustomerName},</p>

      <p>Great news! Your decklist order <strong>${safeOrderNumber}</strong> is ready for pickup.</p>

      ${totalSection}

      <h2 style="color: #333; margin-top: 30px;">Order Details</h2>

      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px; text-align: left;">Qty</th>
            <th style="padding: 8px; text-align: left;">Card</th>
          </tr>
        </thead>
        <tbody>
          ${generateItemsHtml(lineItems)}
        </tbody>
      </table>

      ${safeMissingItems ? `
        <div style="margin-top: 20px; background: #fff3e0; padding: 15px; border-radius: 8px;">
          <strong style="color: #e65100;">Note about some items:</strong>
          <p style="margin: 10px 0 0 0;">${safeMissingItems}</p>
        </div>
      ` : ''}

      <div style="margin-top: 30px; background: #e3f2fd; padding: 15px; border-radius: 8px;">
        <h3 style="margin: 0 0 10px 0; color: #1565c0;">Pickup Information</h3>
        <p style="margin: 0;">${safeStoreName}</p>
        ${safeStoreAddress ? `<p style="margin: 5px 0 0 0;">${safeStoreAddress}</p>` : ''}
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

      <p style="color: #666; font-size: 14px;">
        Questions? Contact us at ${safeStoreEmail || safeStorePhone || 'the store'}
      </p>
    </body>
    </html>
  `;

  return sendEmail({ to: order.email, subject, html });
}
