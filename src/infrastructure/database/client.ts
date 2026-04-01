import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { config } from '../../config/env';
import { DatabaseSchema } from '../../domain/types/database';

// Initialize the connection pool
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
});

export const db = new Kysely<DatabaseSchema>({
  dialect: new PostgresDialect({
    pool,
  }),
});