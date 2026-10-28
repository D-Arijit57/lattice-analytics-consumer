import type {ApiErrorCode, RecordsResponse} from '../../shared/types.ts';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode | 'network',
    message: string,
  ) {
    super(message);
  }
}

/** Configuration / credential problems the viewer cannot fix by retrying, as opposed to transient failures. */
export const isConfigError = (e: ApiError) => e.code === 'misconfigured' || e.code === 'unauthorized' || e.code === 'not_found';

/** Fetches normalized records from this app's own server. The Lattice key never reaches the browser. */
export async function loadRecords(signal: AbortSignal, fresh = false): Promise<RecordsResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/records${fresh ? '?fresh' : ''}`, {signal, headers: {Accept: 'application/json'}});
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('network', 'Could not reach the Analytics server.');
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError('upstream', 'The server returned an unreadable response.');
  }
  if (!res.ok) {
    const e = (body as {error?: {code?: ApiErrorCode; message?: string}}).error;
    throw new ApiError(e?.code ?? 'upstream', e?.message ?? `Request failed (HTTP ${res.status}).`);
  }
  if (typeof body !== 'object' || body === null || !Array.isArray((body as RecordsResponse).records)) {
    throw new ApiError('upstream', 'The server returned an unexpected response.');
  }
  return body as RecordsResponse;
}
