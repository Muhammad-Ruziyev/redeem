import { Queue } from 'bullmq';
import { RedeemJobData } from '../../jobs/queues';

export class QueueRedeemBatchUseCase {
  constructor(private readonly redeemQueue: Queue<RedeemJobData>) {}

  async execute(playerId: string, ucCodes: string[]): Promise<number> {
    // Create jobs for BullMQ bulk insert
    const jobs = ucCodes.map((code) => ({
      name: 'redeem',
      data: {
        playerId,
        ucCode: code,
      },
      opts: {
        // Use ucCode as jobId to prevent exact duplicate jobs entering the queue at the same time
        jobId: `redeem:${playerId}:${code}`,
      },
    }));

    // Add jobs to queue in bulk (more efficient than adding one by one)
    await this.redeemQueue.addBulk(jobs);

    return jobs.length;
  }
}
