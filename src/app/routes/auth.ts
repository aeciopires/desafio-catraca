// Participant sign-up, login (participants and organizers) and logout.
import type { FastifyInstance } from 'fastify';
import { authenticate, endSession, registerParticipant, safeNext, startSession } from '../auth.ts';
import { isDomainError } from '../../lib/errors.ts';

type Body = Record<string, string | undefined>;
type Query = { next?: string };

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: Query }>('/login', async (request, reply) => {
    return reply.view('auth/login.ejs', { next: request.query.next ?? '', error: null, email: '' });
  });

  app.post<{ Body: Body }>('/login', async (request, reply) => {
    const { email = '', password = '', next = '' } = request.body ?? {};
    try {
      const user = await authenticate(email, password);
      await startSession(reply, user.id);
      const fallback = user.role === 'organizer' ? '/organizer/events' : '/';
      return reply.redirect(safeNext(next, fallback), 303);
    } catch (err) {
      if (!isDomainError(err, 'invalid_credentials')) throw err;
      return reply.code(401).view('auth/login.ejs', { next, error: err.message, email });
    }
  });

  app.get<{ Querystring: Query }>('/signup', async (request, reply) => {
    return reply.view('auth/signup.ejs', { next: request.query.next ?? '', error: null, form: {} });
  });

  app.post<{ Body: Body }>('/signup', async (request, reply) => {
    const body = request.body ?? {};
    try {
      const user = await registerParticipant(body);
      await startSession(reply, user.id);
      return reply.redirect(safeNext(body.next, '/'), 303);
    } catch (err) {
      if (!isDomainError(err, 'validation_failed') && !isDomainError(err, 'email_taken')) throw err;
      return reply.code(422).view('auth/signup.ejs', {
        next: body.next ?? '',
        error: err.message,
        form: { name: body.name, email: body.email },
      });
    }
  });

  app.post('/logout', async (request, reply) => {
    await endSession(request, reply);
    return reply.redirect('/', 303);
  });
}
