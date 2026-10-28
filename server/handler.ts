import {loadConfig, type AppConfig} from './config.ts';
import {createRecordsService} from './service.ts';

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Web-standard handler for the app's only API route, GET /api/records[?fresh]. A bad configuration
 * returns a generic 500 and logs which variables are wrong, never their values.
 */
export function createApiHandler(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch) {
  let service: ReturnType<typeof createRecordsService> | null = null;
  let config: AppConfig | null = null;

  return async function handle(request: Request): Promise<Response> {
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {status, headers: {...HEADERS, ...extra}});

    const url = new URL(request.url);
    if (url.pathname.replace(/\/+$/, '') !== '/api/records') {
      return json(404, {error: {code: 'not_found', message: 'Unknown API route.'}});
    }
    if (request.method !== 'GET') {
      return json(405, {error: {code: 'bad_request', message: 'Use GET.'}}, {Allow: 'GET'});
    }

    if (!service) {
      try {
        config = loadConfig(env);
        service = createRecordsService(config, fetchImpl);
      } catch (err) {
        console.error((err as Error).message);
        return json(500, {error: {code: 'misconfigured', message: 'The server is not configured correctly.'}});
      }
    }
    const r = await service({fresh: url.searchParams.has('fresh')});
    return json(r.status, r.body);
  };
}
