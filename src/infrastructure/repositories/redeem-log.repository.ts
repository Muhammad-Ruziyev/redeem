import { db } from '../database/client';
import { RedeemStatus } from '../../domain/types/database';

export class RedeemLogRepository {
  /**
   * Logs a new code redemption attempt.
   */
  async createLog(data: {
    player_id: string;
    uc_code: string;
    account_id?: number;
    status: RedeemStatus;
    reason?: string;
  }) {
    return await db
      .insertInto('redeem_logs')
      .values({
        player_id: data.player_id,
        uc_code: data.uc_code,
        account_id: data.account_id || null,
        status: data.status,
        reason: data.reason || null,
        updated_at: new Date().toISOString(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  }

  /**
   * Updates an existing log entry.
   */
  async updateLog(logId: number, data: { status: RedeemStatus; reason?: string }) {
    await db
      .updateTable('redeem_logs')
      .set({
        status: data.status,
        reason: data.reason || null,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', logId)
      .execute();
  }

  /**
   * Checks if a code has already been successfully redeemed (or is pending).
   */
  async checkCodeExists(ucCode: string) {
    const log = await db
      .selectFrom('redeem_logs')
      .select('id')
      .where('uc_code', '=', ucCode)
      .where('status', 'in', ['success', 'pending'])
      .limit(1)
      .executeTakeFirst();
      
    return !!log;
  }

  /**
   * Retrieves a log by player ID and UC code
   */
  async getLog(playerId: string, ucCode: string) {
    return await db
      .selectFrom('redeem_logs')
      .selectAll()
      .where('player_id', '=', playerId)
      .where('uc_code', '=', ucCode)
      .executeTakeFirst();
  }
}