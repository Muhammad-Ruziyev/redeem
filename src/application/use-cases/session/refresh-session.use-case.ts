import { AccountRepository } from '../../../infrastructure/repositories/account.repository';
import { PlaywrightSessionManager } from '../../workers/playwright/session.manager';
import { EncryptionService } from '../../../domain/encryption';
import { db } from '../../../infrastructure/database/client';
import { logger } from '../../../infrastructure/logger';

export class RefreshSessionUseCase {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly sessionManager: PlaywrightSessionManager,
    private readonly encryptionService: EncryptionService
  ) {}

  async execute(jobId: string | undefined, accountId: number, attemptsMade: number, maxAttempts: number) {
    const logCtx = { jobId, accountId };

    logger.info(logCtx, 'Starting session refresh job');

    // 1. Fetch account details (including encrypted password)
    const account = await db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', accountId)
      .executeTakeFirst();

    if (!account) {
      logger.warn(logCtx, 'Account not found in DB, aborting refresh');
      return;
    }

    if (account.status === 'banned') {
      logger.warn(logCtx, 'Account is banned, aborting refresh');
      return;
    }

    // 2. Decrypt password
    let passwordPlain: string;
    try {
      passwordPlain = this.encryptionService.decrypt(account.password_encrypted);
    } catch (e) {
      logger.error(logCtx, 'Failed to decrypt account password. Aborting.');
      throw new Error('Decryption failed');
    }

    // 3. Run Playwright headless login
    try {
      const freshCookiesString = await this.sessionManager.loginAndGetCookies(
        account.email,
        passwordPlain,
        account.proxy_url
      );

      // 4. Encrypt new cookies and save to DB
      const encryptedCookies = this.encryptionService.encrypt(freshCookiesString);
      
      await this.accountRepo.updateSession(accountId, encryptedCookies);
      
      logger.info(logCtx, 'Session refreshed and account marked as active');

    } catch (error: any) {
      // If login fails repeatedly, we might want to mark it as banned/invalid
      if (attemptsMade >= maxAttempts - 1) {
        logger.error(logCtx, 'Max login attempts reached. Marking account as banned.');
        await this.accountRepo.updateStatus(accountId, 'banned');
      }
      throw error; // Rethrow to let BullMQ handle the retry logic
    }
  }
}
