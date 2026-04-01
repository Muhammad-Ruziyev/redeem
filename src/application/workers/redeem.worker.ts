import { Worker, Job } from 'bullmq';
import { redisConnection, RedeemJobData, sessionRefreshQueue } from '../jobs/queues';
import { AccountRepository } from '../../infrastructure/repositories/account.repository';
import { RedeemLogRepository } from '../../infrastructure/repositories/redeem-log.repository';
import { MidasHttpClient } from '../../infrastructure/http/midas.client';
import { EncryptionService } from '../../domain/encryption';
import { config } from '../../config/env';
import { logger } from '../../infrastructure/logger';
import { ProcessRedeemJobUseCase } from '../use-cases/redeem/process-redeem-job.use-case';

const accountRepo = new AccountRepository();
const logRepo = new RedeemLogRepository();
const midasClient = new MidasHttpClient();
const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);

const processRedeemJobUseCase = new ProcessRedeemJobUseCase(
  accountRepo,
  logRepo,
  midasClient,
  encryptionService,
  sessionRefreshQueue
);

export const redeemWorker = new Worker<RedeemJobData>(
  'redeem-codes',
  async (job: Job<RedeemJobData>) => {
    const { playerId, ucCode } = job.data;
    try {
      return await processRedeemJobUseCase.execute(job.id!, playerId, ucCode);
    } catch (error: any) {
      logger.error({ jobId: job.id, err: error.message }, 'Redeem job failed');
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process 5 codes concurrently (scale as needed)
  }
);

redeemWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Job failed');
});
