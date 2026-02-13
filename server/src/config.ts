import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000'),
  DATABASE_PATH: z.string().default('./data/listpull.db'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('7d'),

  // SMTP Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.string().default('false'),
  FROM_EMAIL: z.string().optional(),
  FROM_NAME: z.string().default('ListPull'),

  // Store Configuration
  STORE_NAME: z.string().default('Your Store'),
  STORE_EMAIL: z.string().optional(),
  STORE_PHONE: z.string().optional(),
  STORE_ADDRESS: z.string().optional(),

  // Order Configuration
  ORDER_PREFIX: z.string().default('LP'),

  // CORS
  CORS_ORIGIN: z.string().optional(),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }

  return {
    port: parseInt(result.data.PORT, 10),
    databasePath: result.data.DATABASE_PATH,
    jwtSecret: result.data.JWT_SECRET,
    jwtExpiry: result.data.JWT_EXPIRY,

    smtp: {
      host: result.data.SMTP_HOST,
      port: parseInt(result.data.SMTP_PORT, 10),
      user: result.data.SMTP_USER,
      pass: result.data.SMTP_PASS,
      secure: result.data.SMTP_SECURE === 'true',
      fromEmail: result.data.FROM_EMAIL,
      fromName: result.data.FROM_NAME,
    },

    store: {
      name: result.data.STORE_NAME,
      email: result.data.STORE_EMAIL,
      phone: result.data.STORE_PHONE,
      address: result.data.STORE_ADDRESS,
    },

    orderPrefix: result.data.ORDER_PREFIX,

    corsOrigin: result.data.CORS_ORIGIN || null,
  };
}

export const config = loadConfig();
export type Config = typeof config;
