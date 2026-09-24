// @ts-check
// THE ONLY file that sends email, and the only one that reads TS_EMAIL_* (spec §9).
// Shape follows the OHF module: one send({ to, template, data }), templates in
// lib/email-templates/, a suppression list, structured logs. HIPAA-specific
// rules are not carried over.
//
// Transport (PROVISIONAL, DECISIONS D19): an HTTP API with Resend's request
// shape. Swapping providers changes transport() only.
//
// Failure is not absence: in production a missing API key makes send() throw;
// it never pretends to have sent. In development with no key, mail is logged
// and the result says { status: 'logged' }.
import { adminSystemClient } from './db.js';
import { IS_PRODUCTION } from './platform.js';
import * as templates from './email-templates/index.js';

const KEYS = Object.freeze({ apiKey: 'TS_EMAIL_API_KEY', from: 'TS_EMAIL_FROM', endpoint: 'TS_EMAIL_API_URL' });
const DEFAULT_ENDPOINT = 'https://api.resend.com/emails';

export class EmailError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) { super(message); this.code = code; }
}

/** Default suppression lookup: platform.email_suppressions via the system client. @param {string} email */
async function dbIsSuppressed(email) {
  const { data, error } = await adminSystemClient().schema('platform').from('email_suppressions').select('reason').eq('email', email).maybeSingle();
  if (error) throw new EmailError('SUPPRESSION_UNREADABLE', `could not read suppression list: ${error.message}`);
  return data ? data.reason : null;
}

/** @param {string} email */
const domainOf = (email) => email.split('@')[1] || '?';

/**
 * @param {{
 *   env?: Record<string, string | undefined>, fetchImpl?: typeof fetch,
 *   isSuppressed?: (email: string) => Promise<string | null>,
 *   log?: (entry: Record<string, unknown>) => void, production?: boolean,
 * }} [deps]
 */
export function createMailer(deps = {}) {
  const env = deps.env || process.env;
  const doFetch = deps.fetchImpl || fetch;
  const isSuppressed = deps.isSuppressed || dbIsSuppressed;
  const log = deps.log || ((e) => console.log(JSON.stringify({ evt: 'email', ...e })));
  const production = deps.production ?? IS_PRODUCTION;

  /**
   * @param {{ to: string, template: string, data?: Record<string, unknown> }} msg
   * @returns {Promise<{ status: 'sent' | 'suppressed' | 'logged', id?: string, reason?: string }>}
   */
  return async function send({ to, template, data = {} }) {
    const email = String(to || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new EmailError('BAD_ADDRESS', `not an email address: ${JSON.stringify(to)}`);
    const render = /** @type {Record<string, (d: any) => {subject:string,text:string,html:string}>} */ (/** @type {unknown} */ (templates))[template];
    if (typeof render !== 'function') throw new EmailError('UNKNOWN_TEMPLATE', `no email template "${template}" (have: ${Object.keys(templates).join(', ')})`);
    const content = render(data);

    const reason = await isSuppressed(email);
    if (reason) { log({ template, to_domain: domainOf(email), status: 'suppressed', reason }); return { status: 'suppressed', reason }; }

    const apiKey = env[KEYS.apiKey]; const from = env[KEYS.from];
    if (!apiKey || !from) {
      if (production) throw new EmailError('NOT_CONFIGURED', `email is not configured (${KEYS.apiKey}/${KEYS.from} missing)`);
      log({ template, to: email, status: 'logged', subject: content.subject, text: content.text });
      return { status: 'logged' };
    }
    let res;
    try {
      res = await doFetch(env[KEYS.endpoint] || DEFAULT_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [email], subject: content.subject, text: content.text, html: content.html }),
      });
    } catch (e) {
      log({ template, to_domain: domainOf(email), status: 'failed', error: 'network' });
      throw new EmailError('PROVIDER_UNREACHABLE', `email provider unreachable: ${/** @type {Error} */ (e).message}`);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      log({ template, to_domain: domainOf(email), status: 'failed', http: res.status });
      throw new EmailError(res.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED', `email provider returned ${res.status}: ${body.message || ''}`.trim());
    }
    log({ template, to_domain: domainOf(email), status: 'sent', id: body.id });
    return { status: 'sent', id: body.id };
  };
}

/** The process-wide mailer. */
export const send = createMailer();
