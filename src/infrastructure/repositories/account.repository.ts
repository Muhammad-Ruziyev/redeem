import { db } from '../database/client';
import { AccountStatus } from '../../domain/types/database';

export class AccountRepository {
  /**
   * Creates a new account in the database.
   */
  async createAccount(data: { email: string; password_encrypted: string; proxy_url: string | null }) {
    return await db
      .insertInto('accounts')
      .values({
        email: data.email,
        password_encrypted: data.password_encrypted,
        proxy_url: data.proxy_url,
        status: 'needs_refresh', // Initially needs refresh to get first cookies
        last_used_at: new Date(0).toISOString(), // Set to epoch so it gets picked up immediately
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  }

  /**
   * Finds the oldest active account that hasn't been used recently.
   * This ensures we rotate accounts evenly.
   */
  async getAvailableAccount() {
    return await db
      .selectFrom('accounts')
      .selectAll()
      .where('status', '=', 'active')
      .orderBy('last_used_at', 'asc')
      .limit(1)
      .executeTakeFirst();
  }

  /**
   * Finds an account by its email.
   */
  async getAccountByEmail(email: string) {
    return await db
      .selectFrom('accounts')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
  }

  /**
   * Updates the session cookies and marks the account as active.
   */
  async updateSession(accountId: number, sessionCookies: string) {
    await db
      .updateTable('accounts')
      .set({
        session_cookies: sessionCookies,
        status: 'active',
        last_used_at: new Date().toISOString(),
      })
      .where('id', '=', accountId)
      .execute();
  }

  /**
   * Marks an account's status (e.g. when session expires or banned).
   */
  async updateStatus(accountId: number, status: AccountStatus) {
    await db
      .updateTable('accounts')
      .set({
        status,
        last_used_at: new Date().toISOString(),
      })
      .where('id', '=', accountId)
      .execute();
  }

  /**
   * Updates the last_used_at timestamp to push the account to the end of the rotation queue.
   */
  async markAsUsed(accountId: number) {
    await db
      .updateTable('accounts')
      .set({
        last_used_at: new Date().toISOString(),
      })
      .where('id', '=', accountId)
      .execute();
  }
}