// Partner API under /api/partner (F05). Fixed contract from TASK.md: every route requires a valid
// X-Api-Key (401 {"error":"unauthorized"} otherwise).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../../db/pool.ts';
import { hashApiKey } from '../../db/seed.ts';

export interface PartnerIdentity {
  id: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    partner?: PartnerIdentity;
  }
}

async function findPartnerByKey(key: string): Promise<PartnerIdentity | null> {
  const { rows } = await query<PartnerIdentity>(
    'SELECT id, name FROM partners WHERE api_key_hash = $1',
    [hashApiKey(key)],
  );
  return rows[0] ?? null;
}

/** onRequest hook: runs before body parsing, so an invalid body never hides a missing key. */
async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers['x-api-key'];
  const key = Array.isArray(header) ? header[0] : header;
  const partner = typeof key === 'string' && key !== '' ? await findPartnerByKey(key) : null;
  if (!partner) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  request.partner = partner;
}

export default async function partnerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireApiKey);
  // F05: the three fixed-contract routes follow.
}
