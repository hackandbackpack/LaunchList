import { sendEmail } from './emailService.js';
import { config } from '../config.js';

function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

export async function sendWelcomeEmail(email: string, loginUrl: string): Promise<boolean> {
  const safeStoreName = escapeHtml(config.store.name);
  const safeLoginUrl = escapeHtml(loginUrl);

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Welcome to ${safeStoreName}!</h1>

      <p>Your staff account has been created. You can now log in to the staff dashboard.</p>

      <p><strong>Important:</strong> You will be asked to change your password on your first login.</p>

      <div style="margin: 30px 0; text-align: center;">
        <a href="${safeLoginUrl}"
           style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
          Log In
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        If you did not expect this email, please ignore it.
      </p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

      <p style="color: #666; font-size: 14px;">${safeStoreName}</p>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Your ${config.store.name} Staff Account`,
    html,
  });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
  const safeStoreName = escapeHtml(config.store.name);
  const safeResetUrl = escapeHtml(resetUrl);

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Password Reset</h1>

      <p>A password reset was requested for your staff account. Click the button below to set a new password.</p>

      <div style="margin: 30px 0; text-align: center;">
        <a href="${safeResetUrl}"
           style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600;">
          Reset Password
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        This link expires in 1 hour. If you did not request a password reset, please ignore this email.
      </p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

      <p style="color: #666; font-size: 14px;">${safeStoreName}</p>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Password Reset - ${config.store.name}`,
    html,
  });
}
