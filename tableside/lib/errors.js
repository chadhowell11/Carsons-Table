// @ts-check
// Honest errors (OHF §6): the status code names the party at fault.
//   datastore down on a write -> 503, never 400
//   no membership             -> 403, never 401
//   feature off               -> 404, never 403

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {Record<string, unknown> | string} [body] message string or extra body fields
   */
  constructor(status, code, body) {
    const extra = typeof body === 'string' ? { message: body } : (body || {});
    super(typeof extra.message === 'string' ? extra.message : code);
    this.status = status;
    this.code = code;
    this.body = { code, ...extra, message: typeof extra.message === 'string' ? extra.message : defaultMessage(status, code) };
  }
}

/** @param {number} status @param {string} code */
function defaultMessage(status, code) {
  return DEFAULT_MESSAGES[code] || (status >= 500 ? 'Something went wrong on our side.' : code);
}

export const DEFAULT_MESSAGES = Object.freeze({
  NOT_SIGNED_IN: 'Sign in to continue.',
  INVALID_TOKEN: 'Your session has expired. Sign in again.',
  NOT_A_MEMBER: "You don't have access to this restaurant's admin.",
  INSUFFICIENT_ROLE: "Your role doesn't allow this.",
  NOT_PLATFORM_ADMIN: 'Platform administrators only.',
  NOT_FOUND: 'Not found.',
  TENANT_ARCHIVED: 'Not found.',
  NO_TENANT: 'Not found.',
  STORE_UNAVAILABLE: 'Nothing was saved. Try again in a moment.',
  STORE_READ_UNAVAILABLE: "We couldn't read that right now. Try again in a moment.",
  STORAGE_UNAVAILABLE: 'The photo was not saved. Your other changes were saved.',
  AUTH_UNAVAILABLE: "The sign-in service didn't respond. Try again in a moment.",
  NOT_YET_AVAILABLE: 'This is not available yet.',
});

/**
 * Map anything thrown by a handler to { status, body }. Unknown errors are 500
 * with a generic body; the detail goes to the log, not to the client.
 * @param {unknown} err
 * @returns {{ status: number, body: Record<string, unknown> }}
 */
export function toResponse(err) {
  if (err instanceof HttpError) return { status: err.status, body: err.body };
  const e = /** @type {any} */ (err);
  if (e && e.type === 'entity.parse.failed') {
    return { status: 400, body: { code: 'BAD_JSON', message: 'The request body is not valid JSON.' } };
  }
  return { status: 500, body: { code: 'INTERNAL', message: 'Something went wrong on our side.' } };
}

/**
 * Classify a Supabase/PostgREST/pg error from a read or write.
 * Network failures and 5xx from the datastore are the datastore's fault (503).
 * RLS refusals (42501) are authorization (403). Constraint violations are the
 * caller's (400). Anything else we cannot attribute is 503 on writes: we would
 * rather say "nothing was saved" than blame the user for our outage.
 * @param {any} error  a supabase-js `error` object or a pg error
 * @param {'read'|'write'} op
 */
export function fromStoreError(error, op) {
  const code = error && (error.code || error.sqlState);
  if (code === '42501') return new HttpError(403, 'FORBIDDEN', 'Not allowed.');
  if (code === 'PGRST116') return new HttpError(404, 'NOT_FOUND');
  if (code === '23505') return new HttpError(409, 'CONFLICT', { message: 'That already exists.', detail: error.details || null });
  if (code === '23514' || code === '23502' || code === '22P02' || code === '23503') {
    return new HttpError(400, 'VALIDATION', { message: error.message, fields: {} });
  }
  return op === 'write' ? new HttpError(503, 'STORE_UNAVAILABLE') : new HttpError(503, 'STORE_READ_UNAVAILABLE');
}
