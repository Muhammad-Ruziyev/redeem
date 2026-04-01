import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EncryptionService } from '../../domain/encryption';
import { config } from '../../config/env';
import { AccountRepository } from '../../infrastructure/repositories/account.repository';
import { CreateAccountUseCase } from '../../application/use-cases/account/create-account.use-case';

const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);
const accountRepo = new AccountRepository();
const createAccountUseCase = new CreateAccountUseCase(accountRepo, encryptionService);

const AddAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  proxy_url: z.string().url().optional(), // Теперь прокси не обязателен
});

export async function accountRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/accounts',
    {
      schema: {
        body: AddAccountSchema,
        response: {
          201: z.object({
            message: z.string(),
            account_id: z.number(),
          }),
          409: z.object({
            message: z.string()
          })
        },
      },
    },
    async (request, reply) => {
      const { email, password, proxy_url } = request.body as z.infer<typeof AddAccountSchema>;

      try {
        const accountId = await createAccountUseCase.execute({
          email,
          passwordPlain: password,
          proxyUrl: proxy_url,
        });

        return reply.status(201).send({
          message: 'Account added successfully',
          account_id: accountId,
        });
      } catch (error: any) {
        if (error.code === '23505') { // Postgres unique violation
          return reply.status(409).send({ message: 'Account with this email already exists' });
        }
        throw error;
      }
    }
  );
}
