// OpenAPI/Swagger for the partner API (F05). Called by buildApp() BEFORE the routes so that
// @fastify/swagger sees them. Only routes tagged PARTNER_TAG are documented (hideUntagged).
// The schemas below are documentation only: the partner plugin disables schema validation and
// schema-driven serialization so the fixed contract (error order and exact fields) is kept.
import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

export const PARTNER_TAG = 'partner';
export const OPENAPI_JSON_PATH = '/api/openapi.json';
export const DOCS_PATH = '/api/docs';

function errorResponse(description: string, code: string) {
  return {
    description,
    type: 'object',
    required: ['error'],
    properties: { error: { type: 'string', enum: [code] } },
    example: { error: code },
  } as const;
}

const unauthorized = errorResponse(
  'Cabeçalho X-Api-Key ausente ou chave inválida.',
  'unauthorized',
);

const security = [{ ApiKeyAuth: [] as string[] }];

const ticketStatus = {
  type: 'string',
  enum: ['pending', 'confirmed', 'declined', 'cancelled', 'refunded'],
} as const;

export const partnerSchemas = {
  listEvents: {
    tags: [PARTNER_TAG],
    summary: 'Eventos à venda',
    description:
      'Eventos publicados e não cancelados, com `availableSeats` = lotação − ingressos pendentes ou confirmados.',
    security,
    response: {
      200: {
        description: 'Lista de eventos à venda.',
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name', 'startsAt', 'priceCents', 'availableSeats'],
          properties: {
            id: { type: 'string', example: 'evt_8f2k' },
            name: { type: 'string', example: 'Jazz no Porão' },
            startsAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-12-05T21:00:00-03:00',
            },
            priceCents: { type: 'integer', example: 10000 },
            availableSeats: { type: 'integer', example: 2 },
          },
        },
        example: [
          {
            id: 'evt_8f2k',
            name: 'Jazz no Porão',
            startsAt: '2026-12-05T21:00:00-03:00',
            priceCents: 10000,
            availableSeats: 2,
          },
        ],
      },
      401: unauthorized,
    },
  },
  purchase: {
    tags: [PARTNER_TAG],
    summary: 'Compra de um ingresso',
    description:
      'Cria um ingresso `pending`; o pagamento é decidido depois pelo gateway. Erros, nesta ordem (depois da chave): 422 `invalid_request` → 404 `event_not_available` → 409 `sold_out`.',
    security,
    params: {
      type: 'object',
      required: ['eventId'],
      properties: { eventId: { type: 'string', example: 'evt_8f2k' } },
    },
    body: {
      type: 'object',
      required: ['buyerEmail', 'cardNumber'],
      properties: {
        buyerEmail: { type: 'string', format: 'email', example: 'ana@example.com' },
        cardNumber: { type: 'string', pattern: '^\\d{16}$', example: '4000000000000001' },
      },
      example: { buyerEmail: 'ana@example.com', cardNumber: '4000000000000001' },
    },
    response: {
      202: {
        description: 'Ingresso criado, aguardando o pagamento.',
        type: 'object',
        required: ['ticketId', 'code', 'status'],
        properties: {
          ticketId: { type: 'string', example: 'tkt_51xq' },
          code: { type: 'string', example: 'K7Q2M9XA' },
          status: { type: 'string', enum: ['pending'] },
        },
        example: { ticketId: 'tkt_51xq', code: 'K7Q2M9XA', status: 'pending' },
      },
      401: unauthorized,
      404: errorResponse('Evento inexistente, em rascunho ou cancelado.', 'event_not_available'),
      409: errorResponse('Sem vagas disponíveis.', 'sold_out'),
      422: errorResponse(
        'Corpo inválido: JSON quebrado, campo ausente, e-mail mal formado ou cartão sem 16 dígitos.',
        'invalid_request',
      ),
    },
  },
  ticket: {
    tags: [PARTNER_TAG],
    summary: 'Consulta de um ingresso (qualquer canal de venda)',
    security,
    params: {
      type: 'object',
      required: ['ticketId'],
      properties: { ticketId: { type: 'string', example: 'tkt_51xq' } },
    },
    response: {
      200: {
        description: 'Ingresso.',
        type: 'object',
        required: ['ticketId', 'code', 'eventId', 'status', 'checkedIn'],
        properties: {
          ticketId: { type: 'string', example: 'tkt_51xq' },
          code: { type: 'string', example: 'K7Q2M9XA' },
          eventId: { type: 'string', example: 'evt_8f2k' },
          status: ticketStatus,
          checkedIn: { type: 'boolean', example: false },
        },
        example: {
          ticketId: 'tkt_51xq',
          code: 'K7Q2M9XA',
          eventId: 'evt_8f2k',
          status: 'confirmed',
          checkedIn: false,
        },
      },
      401: unauthorized,
      404: errorResponse('Ingresso inexistente.', 'ticket_not_found'),
    },
  },
};

export async function registerDocs(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Catraca — API de parceiros',
        description:
          'Contrato fixo da API de parceiros. Toda rota exige o cabeçalho `X-Api-Key`; sem ele, ou com chave inválida, a resposta é `401 {"error":"unauthorized"}`.',
        version: '1.0.0',
      },
      tags: [{ name: PARTNER_TAG, description: 'API de parceiros' }],
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        },
      },
      security,
    },
    hideUntagged: true,
  });

  await app.register(fastifySwaggerUi, { routePrefix: DOCS_PATH });

  app.get(OPENAPI_JSON_PATH, { schema: { hide: true } }, async () => app.swagger());
}
