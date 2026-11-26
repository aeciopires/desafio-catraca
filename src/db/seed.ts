// Idempotent seed: two organizers, one participant and one partner. Safe to run on every start.
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, type Queryable } from './pool.ts';
import { config } from '../config.ts';
import { newId } from '../lib/ids.ts';
import { logger } from '../observability/logger.ts';

export const SEED_PASSWORD = 'catraca123';
export const SEED_USERS = [
  { name: 'Organizador A', email: 'organizador.a@catraca.local', role: 'organizer' },
  { name: 'Organizador B', email: 'organizador.b@catraca.local', role: 'organizer' },
  { name: 'Participante Seed', email: 'participante@catraca.local', role: 'participant' },
] as const;
export const SEED_PARTNER_NAME = 'Parceiro Demo';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function seed(db: Queryable = pool): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const u of SEED_USERS) {
    // ON CONFLICT keeps existing rows untouched (ids stay stable across restarts).
    await db.query(
      `INSERT INTO users (id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ((lower(email))) DO NOTHING`,
      [newId('usr'), u.name, u.email, passwordHash, u.role],
    );
  }
  await db.query(
    `INSERT INTO partners (id, name, api_key_hash) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET api_key_hash = EXCLUDED.api_key_hash`,
    [newId('prt'), SEED_PARTNER_NAME, hashApiKey(config.partnerApiKey)],
  );
  logger.info(
    { users: SEED_USERS.map((u) => u.email), partner: SEED_PARTNER_NAME },
    'seed applied',
  );
}

if (import.meta.main) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      logger.error({ err }, `[ERRO][SEED-001] Falha na seed: ${err.message}`);
      process.exit(1);
    });
}
