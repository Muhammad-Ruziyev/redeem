import { Queue } from 'bullmq';
import { AccountRepository } from '../../../infrastructure/repositories/account.repository';
import { RedeemLogRepository } from '../../../infrastructure/repositories/redeem-log.repository';
import { MidasHttpClient } from '../../../infrastructure/http/midas.client';
import { EncryptionService } from '../../../domain/encryption';
import { SessionExpiredError, RiskControlError } from '../../../domain/errors/midas.errors';
import { logger } from '../../../infrastructure/logger';
import { RefreshSessionJobData } from '../../jobs/queues';

export class ProcessRedeemJobUseCase {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly logRepo: RedeemLogRepository,
    private readonly midasClient: MidasHttpClient,
    private readonly encryptionService: EncryptionService,
    private readonly sessionRefreshQueue: Queue<RefreshSessionJobData>
  ) {}

  async execute(jobId: string | undefined, playerId: string, ucCode: string) {
    const logCtx = { jobId, playerId, ucCode };

    logger.info(logCtx, 'Processing redeem job');

    // 1. Idempotency Check
    // If the exact same player+code exists and is either 'success' or 'pending', skip it.
    // Allow retrying if it was 'failed' or 'error' before.
    const existingLog = await this.logRepo.getLog(playerId, ucCode);
    if (existingLog && (existingLog.status === 'success' || existingLog.status === 'pending')) {
      logger.warn(logCtx, 'Code already processed successfully or is pending, skipping');
      return { status: 'skipped', reason: 'ALREADY_PROCESSED' };
    }

    // 2. Create pending log entry
    const logId = await this.logRepo.createLog({
      player_id: playerId,
      uc_code: ucCode,
      status: 'pending',
    });

    // 3. Get available account from pool
    const account = await this.accountRepo.getAvailableAccount();
    
    if (!account) {
      // If no accounts are active, we must throw an error so BullMQ retries the job later
      await this.logRepo.updateLog(logId.id, { status: 'error', reason: 'NO_ACTIVE_ACCOUNTS_AVAILABLE' });
      throw new Error('No active accounts available in the pool');
    }

    if (!account.session_cookies) {
      await this.accountRepo.updateStatus(account.id, 'needs_refresh');
      await this.sessionRefreshQueue.add('refresh', { accountId: account.id });
      throw new Error(`Account ${account.id} has no cookies. Pushed to refresh queue.`);
    }

    let decryptedCookies: string;
    try {
      decryptedCookies = this.encryptionService.decrypt(account.session_cookies);
    } catch (e) {
      await this.accountRepo.updateStatus(account.id, 'needs_refresh');
      throw new Error(`Failed to decrypt cookies for account ${account.id}`);
    }

    // Update log with the account we are using
    await this.logRepo.updateLog(logId.id, { status: 'pending', reason: `Using account ${account.id}` });

    try {
      // 4. Send request to Midasbuy
      const response = await this.midasClient.redeem(
        playerId,
        ucCode,
        decryptedCookies,
        account.proxy_url
      );

      // 5. Update log with success/failure from Midasbuy
      await this.logRepo.updateLog(logId.id, {
        status: response.status,
        reason: response.reason || 'OK',
      });

      // 6. Push account to the back of the queue (Rotate)
      await this.accountRepo.markAsUsed(account.id);

      logger.info({ ...logCtx, result: response.status }, 'Job completed');
      return response;

    } catch (error: any) {
      // Handle specific business errors gracefully
      if (error instanceof SessionExpiredError || error.name === 'SessionExpiredError' || error.message?.includes('Session expired')) {
        logger.warn(logCtx, `Session expired for account ${account.id}`);
        await this.accountRepo.updateStatus(account.id, 'needs_refresh');
        
        // Trigger session refresh job
        const { sessionRefreshQueue } = await import('../../jobs/queues');
        await sessionRefreshQueue.add('refresh', { accountId: account.id });
        
        // Throwing will cause BullMQ to retry the job (it will pick a different account next time)
        throw new Error('Session expired, account marked for refresh');
      }

      if (error instanceof RiskControlError) {
        logger.error(logCtx, `Risk control ban for account ${account.id}`);
        // Mark account as banned. A manual or delayed unban process is needed.
        await this.accountRepo.updateStatus(account.id, 'banned');
        throw error;
      }

      // Check if it's a circuit breaker error
      if (error.message?.includes('Circuit Breaker is open')) {
        throw new Error('Midasbuy API is currently unavailable (Circuit Breaker Open). Retrying later.');
      }

      // Network errors
      logger.error({ ...logCtx, err: error.message }, 'Unexpected error during redeem');
      
      await this.logRepo.updateLog(logId.id, {
        status: 'error',
        reason: error.message || 'Unknown error',
      });

      throw error; // Let BullMQ retry
    }
  }
}
