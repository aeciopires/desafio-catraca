// Session authentication (cookie "sid" -> sessions table) and role guards (R13).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.ts';
import { config } from '../config.ts';
import { newId, newSessionId } from '../lib/ids.ts';
import { DomainError } from '../lib/errors.ts';
import type { Role, UserRow } from '../domain/types.ts';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: CurrentUser | null;
  }
  interface FastifyReply {
    /** Values merged into every view by @fastify/view. */
    locals?: Record<string, unknown>;
  }
}

export const SESSION_COOKIE = 'sid';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request, reply) => {
    request.user = null;
    const raw = request.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        const { rows } = await query<CurrentUser>(
          `SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.id = $1 AND s.expires_at > now()`,
          [unsigned.value],
        );
        request.user = rows[0] ?? null;
      }
    }
    reply.locals = { ...(reply.locals ?? {}), user: request.user, currentPath: request.url };
  });
}

export async function startSession(reply: FastifyReply, userId: string): Promise<void> {
  const sid = newSessionId();
  await query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [sid, userId, String(config.sessionTtlDays)],
  );
  reply.setCookie(SESSION_COOKIE, sid, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    signed: true,
    maxAge: config.sessionTtlDays * 24 * 3600,
  });
}

export async function endSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = request.cookies[SESSION_COOKIE];
  if (raw) {
    const unsigned = request.unsignCookie(raw);
    if (unsigned.valid && unsigned.value)
      await query('DELETE FROM sessions WHERE id = $1', [unsigned.value]);
  }
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Only relative, same-site paths are accepted as post-login redirects. */
export function safeNext(next: unknown, fallback: string): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? next
    : fallback;
}

function roleGuard(role: Role) {
  return async function guard(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`, 302);
    }
    if (request.user.role !== role) {
      const message =
        role === 'organizer'
          ? 'Acesso restrito a organizadores.'
          : 'Acesso restrito a participantes.';
      return reply.code(403).view('error.ejs', { title: 'Acesso restrito', message });
    }
  };
}

/** preHandler: visitors -> 302 /login?next=..., other roles -> 403 without any data. */
export const requireOrganizer = roleGuard('organizer');
export const requireParticipant = roleGuard('participant');

export async function authenticate(email: string, password: string): Promise<CurrentUser> {
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [
    email.trim(),
  ]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new DomainError('invalid_credentials', 'E-mail ou senha inválidos');
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** Participant self sign-up. Organizers only come from the seed (out of scope otherwise). */
export async function registerParticipant(input: {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}): Promise<CurrentUser> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const errors: string[] = [];
  if (!name) errors.push('Informe o nome');
  if (!EMAIL_RE.test(email)) errors.push('Informe um e-mail válido');
  if (password.length < 6) errors.push('A senha deve ter pelo menos 6 caracteres');
  if (errors.length) throw new DomainError('validation_failed', errors[0], errors);
  const hash = await bcrypt.hash(password, 10);
  const id = newId('usr');
  const { rowCount } = await query(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'participant')
     ON CONFLICT ((lower(email))) DO NOTHING`,
    [id, name, email, hash],
  );
  if (!rowCount) throw new DomainError('email_taken', 'E-mail já cadastrado');
  return { id, name, email, role: 'participant' };
}
