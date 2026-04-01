import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EncryptionService } from '../../domain/encryption';
import { config } from '../../config/env';
import { AccountRepository } from '../../infrastructure/repositories/account.repository';
import { sessionRefreshQueue } from '../../application/jobs/queues';

const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);
const accountRepo = new AccountRepository();

const ForceRefreshSchema = z.object({
  email: z.string().email(),
});

export async function forceRefreshRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/accounts/refresh',
    {
      schema: {
        body: ForceRefreshSchema,
        response: {
          202: z.object({
            message: z.string(),
          }),
          404: z.object({
            message: z.string()
          })
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body as z.infer<typeof ForceRefreshSchema>;

      try {
        const account = await accountRepo.getAccountByEmail(email);
        
        if (!account) {
          return reply.status(404).send({ message: 'Account not found' });
        }

        // Set status to needs_refresh and queue job
        await accountRepo.updateStatus(account.id, 'needs_refresh');
        await sessionRefreshQueue.add('refresh', { accountId: account.id });

        return reply.status(202).send({
          message: 'Account session refresh job queued',
        });
      } catch (error: any) {
        throw error;
      }
    }
  );
}
