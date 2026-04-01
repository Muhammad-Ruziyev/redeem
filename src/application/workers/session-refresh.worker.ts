import { Worker, Job } from 'bullmq';
import { redisConnection, sessionRefreshQueue, RefreshSessionJobData } from '../jobs/queues';
import { AccountRepository } from '../../infrastructure/repositories/account.repository';
import { PlaywrightSessionManager } from './playwright/session.manager';
import { EncryptionService } from '../../domain/encryption';
import { config } from '../../config/env';
import { logger } from '../../infrastructure/logger';
import { RefreshSessionUseCase } from '../use-cases/session/refresh-session.use-case';

const accountRepo = new AccountRepository();
const sessionManager = new PlaywrightSessionManager();
const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);

const refreshSessionUseCase = new RefreshSessionUseCase(
  accountRepo,
  sessionManager,
  encryptionService
);

export const sessionRefreshWorker = new Worker<RefreshSessionJobData>(
  'session-refresh',
  async (job: Job<RefreshSessionJobData>) => {
    return await refreshSessionUseCase.execute(
      job.id,
      job.data.accountId,
      job.attemptsMade,
      job.opts.attempts || 2
    );
  },
  {
    connection: redisConnection,
    concurrency: 1, // DANGER: Keep concurrency at 1 or 2 max! Playwright consumes 500MB-1GB RAM per instance.
  }
);

sessionRefreshWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Session refresh job failed');
});
