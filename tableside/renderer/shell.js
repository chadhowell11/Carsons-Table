// @ts-check
// Phase 0 tenant shell: proves a host resolved to a tenant and that tenant's
// tokens reached the page. Replaced by renderer/render.js composePage() in Phase 1.
import { escapeHtml } from './html.js';
import { fontsHref } from './tokens.js';

/** Head tags every tenant page carries (spec §6.3). @param {any} tenant */
export function tenantHead(tenant) {
  const robots = tenant.status === 'live' ? '' : '<meta name="robots" content="noindex,nofollow">';
  return [
    robots,
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${escapeHtml(fontsHref(tenant.brand))}">`,
    `<link rel="stylesheet" href="/t/${escapeHtml(tenant.slug)}/tokens.css">`,
  ].filter(Boolean).join('\n');
}

const SHELL_CSS = `
*{box-sizing:border-box}body{margin:0;background:var(--t-bg);color:var(--t-fg);font:16px/1.5 var(--t-body)}
header{background:var(--t-field);color:var(--t-on-field);padding:28px 16px}
header div,main{max-width:64rem;margin:0 auto}
h1{font:500 clamp(28px,5vw,44px)/1.1 var(--t-display);margin:0}
.eyebrow{font:italic 400 15px var(--t-display);color:var(--t-accent);margin:0 0 6px}
main{padding:28px 16px}
.note{border:1px solid var(--t-line);background:var(--t-surface);border-radius:var(--t-radius);padding:16px 18px;max-width:40rem}
`;

/** @param {{ tenant: any }} p */
export function composeShell({ tenant }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(tenant.name)}</title>
${tenantHead(tenant)}
<style>${SHELL_CSS}</style>
</head>
<body data-tenant="${escapeHtml(tenant.slug)}">
<header><div><p class="eyebrow">Welcome to</p><h1>${escapeHtml(tenant.name)}</h1></div></header>
<main><p class="note">Our new website is being set up. Please check back soon.</p></main>
</body>
</html>`;
}

/** @param {{ tenant: any }} p */
export function composePaused({ tenant }) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(tenant.name)}</title></head>
<body style="font-family:system-ui,sans-serif;margin:3rem auto;max-width:36rem;padding:0 16px">
<h1 style="font-weight:500">${escapeHtml(tenant.name)}</h1>
<p>Our website is temporarily unavailable. Please call us or check back soon.</p>
</body></html>`;
}
