import { AccountRepository } from '../../../infrastructure/repositories/account.repository';
import { EncryptionService } from '../../../domain/encryption';
import { sessionRefreshQueue } from '../../jobs/queues';

export class CreateAccountUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly encryptionService: EncryptionService
  ) {}

  async execute(data: { email: string; passwordPlain: string; proxyUrl?: string }): Promise<number> {
    // ZERO-TOLERANCE: Never store plain text passwords
    const passwordEncrypted = this.encryptionService.encrypt(data.passwordPlain);

    const result = await this.accountRepository.createAccount({
      email: data.email,
      password_encrypted: passwordEncrypted,
      proxy_url: data.proxyUrl || null,
    });

    // Automatically trigger a session refresh job for the newly created account
    await sessionRefreshQueue.add('refresh', { accountId: result.id });

    return result.id;
  }
}
