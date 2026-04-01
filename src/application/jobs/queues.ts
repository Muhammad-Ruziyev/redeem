import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from '../../config/env';

// Initialize a single Redis connection for BullMQ
export const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export interface RedeemJobData {
  playerId: string;
  ucCode: string;
}

export interface RefreshSessionJobData {
  accountId: number;
}

// Queue for code redemption tasks
export const redeemQueue = new Queue<RedeemJobData>('redeem-codes', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // R-01: Retry transient errors
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: true,
    removeOnFail: 1000, // Keep last 1000 failed jobs for debugging
  },
});

// Queue for Playwright to refresh sessions in the background
export const sessionRefreshQueue = new Queue<RefreshSessionJobData>('session-refresh', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
    removeOnComplete: true,
  },
});
