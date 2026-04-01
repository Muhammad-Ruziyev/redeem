import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { redeemQueue } from '../../application/jobs/queues';
import { logger } from '../../infrastructure/logger';
import { QueueRedeemBatchUseCase } from '../../application/use-cases/redeem/queue-redeem-batch.use-case';

const queueRedeemBatchUseCase = new QueueRedeemBatchUseCase(redeemQueue);

const RedeemRequestSchema = z.object({
  player_id: z.union([z.string(), z.number()]).transform(String),
  uc_codes: z.array(z.string()).min(1).max(100),
});

export async function redeemRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/redeem',
    {
      schema: {
        body: RedeemRequestSchema,
        response: {
          202: z.object({
            message: z.string(),
            job_count: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { player_id, uc_codes } = request.body as z.infer<typeof RedeemRequestSchema>;

      logger.info({ player_id, count: uc_codes.length }, 'Received batch redeem request');

      const jobCount = await queueRedeemBatchUseCase.execute(player_id, uc_codes);

      return reply.status(202).send({
        message: 'Codes accepted for processing',
        job_count: jobCount,
      });
    }
  );
}
