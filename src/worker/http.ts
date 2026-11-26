// Registry of extra endpoints served on the worker's internal HTTP port (e.g. /metrics in F09).

export type ExtraHttpHandler = (
  path: string,
) => Promise<{ status: number; type: string; body: string } | null>;

export const extraHandlers: ExtraHttpHandler[] = [];

export function addWorkerHttpHandler(handler: ExtraHttpHandler): void {
  extraHandlers.push(handler);
}
