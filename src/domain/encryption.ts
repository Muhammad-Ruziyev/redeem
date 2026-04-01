import * as crypto from 'crypto';
import { DecryptionError } from './errors/crypto.errors';

/**
 * Service for encrypting and decrypting sensitive data (like passwords and cookies)
 * Uses AES-256-GCM to provide authenticated encryption.
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    // We already validated in env.ts that it is exactly 32 chars
    this.key = Buffer.from(encryptionKey, 'utf8');
  }

  /**
   * Encrypts a plain text string.
   * @param text The plain text to encrypt.
   * @returns A string in the format "ivHex:authTagHex:encryptedHex"
   */
  public encrypt(text: string): string {
    // 12 bytes is the recommended IV size for GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts an encrypted string.
   * @param encryptedData String in the format "ivHex:authTagHex:encryptedHex"
   * @returns The decrypted plain text.
   * @throws {DecryptionError} If the data is malformed or tampered with.
   */
  public decrypt(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new DecryptionError('Invalid encrypted data format');
      }

      const [ivHex, authTagHex, encryptedHex] = parts;
      
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      if (error instanceof DecryptionError) {
        throw error;
      }
      // Wrap internal crypto errors (like invalid auth tag/tampering)
      throw new DecryptionError(`Failed to decrypt data: ${(error as Error).message}`);
    }
  }
}
