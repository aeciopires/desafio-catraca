// Applies due payment decisions to tickets (R08, R11). This is the only place where the gateway
// changes a ticket status, and it only ever changes tickets that are still pending.
import { withTransaction } from '../db/pool.ts';
import { logger } from '../observability/logger.ts';

interface DueJob {
  id: string;
  ticket_id: string;
  decision: 'approved' | 'declined';
}

/** Processes due payment jobs and returns how many were handled. */
export async function processDuePayments(limit = 50): Promise<number> {
  return withTransaction(async (client) => {
    // SKIP LOCKED lets several workers run without processing the same job twice.
    const { rows: jobs } = await client.query<DueJob>(
      `SELECT id, ticket_id, decision FROM payment_jobs
        WHERE state = 'scheduled' AND due_at <= now()
        ORDER BY due_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [limit],
    );
    for (const job of jobs) {
      const status = job.decision === 'approved' ? 'confirmed' : 'declined';
      // Only a pending ticket changes: cancelled/refunded tickets never come back (R11).
      const result = await client.query(
        `UPDATE tickets SET status = $2, updated_at = now() WHERE id = $1 AND status = 'pending'`,
        [job.ticket_id, status],
      );
      await client.query(
        `UPDATE payment_jobs SET state = 'done', processed_at = now() WHERE id = $1`,
        [job.id],
      );
      logger.info(
        {
          ticketId: job.ticket_id,
          jobId: job.id,
          decision: job.decision,
          applied: (result.rowCount ?? 0) > 0,
        },
        'payment processed',
      );
    }
    return jobs.length;
  });
}
