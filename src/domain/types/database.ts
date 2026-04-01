import { Generated, ColumnType } from 'kysely';

export type AccountStatus = 'active' | 'needs_refresh' | 'banned';
export type RedeemStatus = 'pending' | 'success' | 'error';

export interface AccountsTable {
  id: Generated<number>;
  email: string;
  password_encrypted: string;
  proxy_url: string | null;
  session_cookies: string | null;
  status: AccountStatus;
  last_used_at: ColumnType<Date, string | undefined, string | Date>;
  created_at: Generated<Date>;
}

export interface RedeemLogsTable {
  id: Generated<number>;
  player_id: string;
  uc_code: string;
  account_id: number | null;
  status: RedeemStatus;
  reason: string | null;
  created_at: Generated<Date>;
  updated_at: ColumnType<Date, string | undefined, string | Date>;
}

export interface DatabaseSchema {
  accounts: AccountsTable;
  redeem_logs: RedeemLogsTable;
}