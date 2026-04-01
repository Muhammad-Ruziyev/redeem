import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load variables from .env file
dotenv.config();

const envSchema = z.object({
  APP_PORT: z.string().default('3000').transform(Number),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().length(32, 'Encryption key must be exactly 32 bytes/characters long'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  MIDAS_API_TIMEOUT_MS: z.string().default('10000').transform(Number),
});

type EnvConfig = z.infer<typeof envSchema>;

function validateConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
}

export const config = validateConfig();
