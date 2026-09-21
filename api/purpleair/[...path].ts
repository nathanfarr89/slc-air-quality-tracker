import { handleProxy } from '../../server/purpleairProxy.js';

// Server-only environment (no VITE_ prefix, so it is never bundled into the browser build).
declare const process: { env: Record<string, string | undefined> };

/** GET /api/purpleair/sensors and /api/purpleair/sensors/:id/history. See server/purpleairProxy.ts. */
export function GET(request: Request): Promise<Response> {
  return handleProxy(request, { apiKey: process.env.PURPLEAIR_API_KEY });
}
