// OpenAPI/Swagger registration (F05 fills this file). Called by buildApp() BEFORE the routes.
import type { FastifyInstance } from 'fastify';

export async function registerDocs(_app: FastifyInstance): Promise<void> {
  // F05: @fastify/swagger + @fastify/swagger-ui at /api/docs and /api/openapi.json.
}
