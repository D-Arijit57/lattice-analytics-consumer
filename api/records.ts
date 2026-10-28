import {createApiHandler} from '../server/handler.ts';

/**
 * Vercel serverless entry for GET /api/records. Reuses the same handler as the Node server
 * (server/index.ts); configuration comes from the project's environment variables.
 */
const handle = createApiHandler();

export function GET(request: Request): Promise<Response> {
  return handle(request);
}
