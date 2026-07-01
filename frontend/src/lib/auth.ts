// lib/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { Resend } from 'resend';

import * as schema from '@/lib/db/schema';
import { db } from '@/lib/db';
import { logger } from '@/lib/misc/logger';

const MODULE = 'auth';

// ============================================
// Configuration
// ============================================

const config = {
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || 'TestForge <noreply@testforge.tech>',
    replyTo: process.env.REPLY_TO || 'testforge@arkeargo.resend.app',
    maxRetries: 3,
    retryDelay: 1000, // ms
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12 hours
    updateAge: 60 * 60, // 1 hour
  },
  verification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    tokenExpiry: 60 * 60, // 1 hour
  },
} as const;

// ============================================
// Email Client
// ============================================

class EmailClient {
  private resend: Resend | null = null;
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (!config.resend.apiKey) {
      logger.warn(MODULE, 'Resend API key not configured - email sending disabled');
      return;
    }

    try {
      this.resend = new Resend(config.resend.apiKey);
      this.initialized = true;
      logger.info(MODULE, 'Email client initialized successfully');
    } catch (error) {
      logger.error(MODULE, 'Failed to initialize email client', { error });
    }
  }

  private async retry<T>(
    fn: () => Promise<T>,
    retries: number = config.resend.maxRetries,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) throw error;

      logger.debug(MODULE, `Retrying email send (${retries} attempts left)`, { error });
      await new Promise((resolve) => setTimeout(resolve, config.resend.retryDelay));
      return this.retry(fn, retries - 1);
    }
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.initialized || !this.resend) {
      return {
        success: false,
        error: 'Email service not configured',
      };
    }

    try {
      const result = await this.retry(() =>
        this.resend!.emails.send({
          from: config.resend.from,
          to: [params.to],
          replyTo: config.resend.replyTo,
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      );

      if (result.error) {
        logger.error(MODULE, 'Email send failed', {
          to: params.to,
          error: result.error,
        });
        return {
          success: false,
          error: result.error.message,
        };
      }

      logger.info(MODULE, 'Email sent successfully', {
        to: params.to,
        subject: params.subject,
      });

      return { success: true };
    } catch (error) {
      logger.error(MODULE, 'Email send exception', {
        to: params.to,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  isConfigured(): boolean {
    return this.initialized && !!this.resend;
  }
}

const emailClient = new EmailClient();

// ============================================
// Email Templates
// ============================================

const emailTemplates = {
  verification: (url: string) => ({
    subject: 'Verify your email address for TestForge',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
              background: #f6f9fc; 
              margin: 0; 
              padding: 40px 20px; 
              -webkit-font-smoothing: antialiased;
            }
            .container { 
              max-width: 560px; 
              margin: 0 auto; 
              background: #ffffff; 
              border-radius: 12px; 
              padding: 48px 40px; 
              box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            }
            .header { 
              text-align: center; 
              margin-bottom: 32px; 
              padding-bottom: 24px;
              border-bottom: 1px solid #f0f4f8;
            }
            .logo { 
              font-size: 24px; 
              font-weight: 700; 
              color: #059669; 
              letter-spacing: -0.5px; 
              text-decoration: none;
            }
            .logo span { 
              background: #ecfdf5; 
              padding: 4px 12px; 
              border-radius: 6px; 
            }
            h1 { 
              color: #111827; 
              font-size: 22px; 
              font-weight: 600; 
              margin-bottom: 12px; 
              letter-spacing: -0.3px; 
            }
            p { 
              color: #4b5563; 
              font-size: 15px; 
              line-height: 1.6; 
              margin-bottom: 24px; 
            }
            .button-container { 
              text-align: center; 
              margin: 32px 0; 
            }
            .button { 
              display: inline-block; 
              background: #059669; 
              color: #ffffff; 
              padding: 13px 36px; 
              text-decoration: none; 
              border-radius: 6px; 
              font-weight: 600; 
              font-size: 15px; 
              transition: background 0.2s; 
            }
            .button:hover { 
              background: #047857; 
            }
            .divider { 
              border-top: 1px solid #f0f4f8; 
              margin: 32px 0 24px; 
            }
            .footer { 
              text-align: center; 
              font-size: 13px; 
              color: #6b7280; 
              line-height: 1.5;
            }
            .footer a { 
              color: #059669; 
              text-decoration: none; 
            }
            @media (max-width: 480px) {
              .container { padding: 32px 20px; }
              h1 { font-size: 20px; }
            }
          </style>
        </head>
        <body>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;padding:40px 20px;">
            <tr>
              <td align="center">
                <table class="container" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:48px 40px;">
                  <tr>
                    <td style="text-align:center;padding-bottom:24px;border-bottom:1px solid #f0f4f8;">
                      <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="font-size:24px;font-weight:700;color:#059669;text-decoration:none;letter-spacing:-0.5px;">
                        <span style="background:#ecfdf5;padding:4px 12px;border-radius:6px;">TestForge</span>
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 0 0;">
                      <h1 style="color:#111827;font-size:22px;font-weight:600;margin-bottom:12px;letter-spacing:-0.3px;">Verify your email address</h1>
                      <p style="color:#4b5563;font-size:15px;line-height:1.6;margin-bottom:24px;">
                        Thank you for creating a TestForge account. Please verify your email address to complete your registration and begin configuring your exam center.
                      </p>
                      <div style="text-align:center;margin:32px 0;">
                        <a href="${url}" class="button" style="display:inline-block;background:#059669;color:#ffffff;padding:13px 36px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
                          Verify Email Address
                        </a>
                      </div>
                      <p style="color:#6b7280;font-size:14px;line-height:1.6;margin-bottom:0;">
                        This verification link will expire in 1 hour. If you did not create an account, you can safely disregard this email.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:32px;border-top:1px solid #f0f4f8;text-align:center;font-size:13px;color:#6b7280;line-height:1.5;">
                      <p style="margin:0;">
                        TestForge — Examination Management Platform
                      </p>
                      <p style="margin:4px 0 0;">
                        <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="color:#059669;text-decoration:none;">${process.env.NEXT_PUBLIC_APP_URL}</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
    text: `
      Verify your email address for TestForge

      Thank you for creating a TestForge account. Please verify your email address to complete your registration.

      Click the link below to verify your email:
      ${url}

      This verification link will expire in 1 hour. If you did not create an account, you can safely disregard this email.

      TestForge — Examination Management Platform
      ${process.env.NEXT_PUBLIC_APP_URL}
    `,
  }),

  passwordReset: (url: string) => ({
    subject: 'Reset your password for TestForge',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Password</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
              background: #f6f9fc; 
              margin: 0; 
              padding: 40px 20px; 
              -webkit-font-smoothing: antialiased;
            }
            .container { 
              max-width: 560px; 
              margin: 0 auto; 
              background: #ffffff; 
              border-radius: 12px; 
              padding: 48px 40px; 
              box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            }
            .header { 
              text-align: center; 
              margin-bottom: 32px; 
              padding-bottom: 24px;
              border-bottom: 1px solid #f0f4f8;
            }
            .logo { 
              font-size: 24px; 
              font-weight: 700; 
              color: #059669; 
              letter-spacing: -0.5px; 
              text-decoration: none;
            }
            .logo span { 
              background: #ecfdf5; 
              padding: 4px 12px; 
              border-radius: 6px; 
            }
            h1 { 
              color: #111827; 
              font-size: 22px; 
              font-weight: 600; 
              margin-bottom: 12px; 
              letter-spacing: -0.3px; 
            }
            p { 
              color: #4b5563; 
              font-size: 15px; 
              line-height: 1.6; 
              margin-bottom: 24px; 
            }
            .button-container { 
              text-align: center; 
              margin: 32px 0; 
            }
            .button { 
              display: inline-block; 
              background: #059669; 
              color: #ffffff; 
              padding: 13px 36px; 
              text-decoration: none; 
              border-radius: 6px; 
              font-weight: 600; 
              font-size: 15px; 
              transition: background 0.2s; 
            }
            .button:hover { 
              background: #047857; 
            }
            .divider { 
              border-top: 1px solid #f0f4f8; 
              margin: 32px 0 24px; 
            }
            .footer { 
              text-align: center; 
              font-size: 13px; 
              color: #6b7280; 
              line-height: 1.5;
            }
            .footer a { 
              color: #059669; 
              text-decoration: none; 
            }
            @media (max-width: 480px) {
              .container { padding: 32px 20px; }
              h1 { font-size: 20px; }
            }
          </style>
        </head>
        <body>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;padding:40px 20px;">
            <tr>
              <td align="center">
                <table class="container" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:48px 40px;">
                  <tr>
                    <td style="text-align:center;padding-bottom:24px;border-bottom:1px solid #f0f4f8;">
                      <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="font-size:24px;font-weight:700;color:#059669;text-decoration:none;letter-spacing:-0.5px;">
                        <span style="background:#ecfdf5;padding:4px 12px;border-radius:6px;">TestForge</span>
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 0 0;">
                      <h1 style="color:#111827;font-size:22px;font-weight:600;margin-bottom:12px;letter-spacing:-0.3px;">Reset your password</h1>
                      <p style="color:#4b5563;font-size:15px;line-height:1.6;margin-bottom:24px;">
                        We received a request to reset the password for your TestForge account. Click the button below to create a new password.
                      </p>
                      <div style="text-align:center;margin:32px 0;">
                        <a href="${url}" class="button" style="display:inline-block;background:#059669;color:#ffffff;padding:13px 36px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
                          Reset Password
                        </a>
                      </div>
                      <p style="color:#6b7280;font-size:14px;line-height:1.6;margin-bottom:0;">
                        This link will expire in 1 hour. If you did not request a password reset, please ignore this email or contact support.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:32px;border-top:1px solid #f0f4f8;text-align:center;font-size:13px;color:#6b7280;line-height:1.5;">
                      <p style="margin:0;">
                        TestForge — Examination Management Platform
                      </p>
                      <p style="margin:4px 0 0;">
                        <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="color:#059669;text-decoration:none;">${process.env.NEXT_PUBLIC_APP_URL}</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
    text: `
      Reset your password for TestForge

      We received a request to reset the password for your TestForge account.

      Click the link below to create a new password:
      ${url}

      This link will expire in 1 hour. If you did not request a password reset, please ignore this email.

      TestForge — Examination Management Platform
      ${process.env.NEXT_PUBLIC_APP_URL}
    `,
  }),
};

// ============================================
// Email Sending Functions
// ============================================

async function sendVerificationEmail(email: string, url: string): Promise<void> {
  const template = emailTemplates.verification(url);

  logger.debug(MODULE, 'Preparing verification email', { email });

  // Development: Log URL for testing
  if (process.env.NODE_ENV === 'development') {
    logger.info(MODULE, `🔗 Verification URL: ${url}`);
    logger.debug(MODULE, '[DEV] Verification email would be sent', { email });

    // In development, still try to send if Resend is configured
    if (!emailClient.isConfigured()) {
      return;
    }
  }

  // Production: Send email
  const result = await emailClient.sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });

  if (!result.success) {
    logger.error(MODULE, 'Failed to send verification email', {
      email,
      error: result.error,
    });
    // Don't throw - let BetterAuth handle the error gracefully
    return;
  }

  logger.info(MODULE, 'Verification email sent', { email });
}

async function sendPasswordResetEmail(email: string, url: string): Promise<void> {
  const template = emailTemplates.passwordReset(url);

  logger.debug(MODULE, 'Preparing password reset email', { email });

  if (process.env.NODE_ENV === 'development') {
    logger.info(MODULE, `🔗 Password Reset URL: ${url}`);
    logger.debug(MODULE, '[DEV] Password reset email would be sent', { email });

    if (!emailClient.isConfigured()) {
      return;
    }
  }

  const result = await emailClient.sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });

  if (!result.success) {
    logger.error(MODULE, 'Failed to send password reset email', {
      email,
      error: result.error,
    });
    return;
  }

  logger.info(MODULE, 'Password reset email sent', { email });
}

// ============================================
// BetterAuth Configuration
// ============================================

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
    sendOnSignUp: config.verification.sendOnSignUp,
    autoSignInAfterVerification: config.verification.autoSignInAfterVerification,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      prompt: 'select_account',
    },
  },

  plugins: [nextCookies()],

  user: {
    changeEmail: {
      enabled: true,
    },
  },

  session: {
    expiresIn: config.session.expiresIn,
    updateAge: config.session.updateAge,
  },

  // BetterAuth logger - production safe
  logger: {
    log: (...args: unknown[]) => {
      if (process.env.NODE_ENV === 'development') {
        logger.debug('BetterAuth', String(args[0] || ''), args.length > 1 ? args[1] : undefined);
      }
    },
    info: (...args: unknown[]) => {
      if (process.env.NODE_ENV === 'development') {
        logger.info('BetterAuth', String(args[0] || ''), args.length > 1 ? args[1] : undefined);
      }
    },
    warn: (...args: unknown[]) => {
      if (process.env.NODE_ENV === 'development') {
        logger.warn('BetterAuth', String(args[0] || ''), args.length > 1 ? args[1] : undefined);
      }
    },
    error: (...args: unknown[]) => {
      // Always log errors in any environment
      logger.error('BetterAuth', String(args[0] || ''), args.length > 1 ? args[1] : undefined);
    },
  },
});

// ============================================
// Exports
// ============================================

export { emailClient };
export default auth;
