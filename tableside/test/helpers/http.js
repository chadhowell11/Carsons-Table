// HTTP against a local server with an explicit Host header (fetch forbids
// overriding Host, and *.localhost does not resolve through getaddrinfo).
import http from 'node:http';

/**
 * @param {string} base  e.g. http://127.0.0.1:3000
 * @param {string} host  Host header, e.g. carsons-table.localhost
 * @param {string} path
 * @param {{ method?: string, headers?: Record<string,string>, body?: string }} [opts]
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, text: string, json: () => any }>}
 */
export function hostRequest(base, host, path, opts = {}) {
  const u = new URL(path, base);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET',
      headers: { host, ...(opts.headers || {}) },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, text, json: () => JSON.parse(text) }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
