import http from 'node:http';
import { getSetting, setSetting } from '../lib/settings';

/** How long an old link's page waits for the fresh check before giving up. */
const RETRY_WAIT = 3 * 60_000;

/**
 * Public front for the Cloudflare human-check page. tmclub-api opens that page (on TMCLUB_VERIFY_PORT)
 * only while a check is pending, under a fresh random token path (/<128-bit hex>/) that is sent by
 * Telegram. Requests under the current token are forwarded. A token from an earlier check link leads to
 * the current check, or starts a fresh one if the last check expired, so a link seen hours later still
 * works. Everything else (the root, guesses) gets a generic landing page: a crawler never reaches the check.
 */
export function startVerifyGateway(port: number, targetPort: number) {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('User-agent: *\nDisallow: /\n');
    }
    const pending = getSetting('tm_verify_url');
    const current = pending ? new URL(pending).pathname : null;
    if (current && current !== '/' && url.startsWith(current)) {
      const upstream = http.request({ host: '127.0.0.1', port: targetPort, path: url, method: req.method, headers: req.headers }, (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
        // Streamed as-is: the check page pushes the browser view as server-sent events.
        up.pipe(res);
      });
      // Check finished or expired between the lookup and the request.
      upstream.on('error', () => (res.headersSent ? res.end() : status(res, 'This check is over. Open your link again in a moment.')));
      return req.pipe(upstream);
    }

    const tokens: string[] = JSON.parse(getSetting('tm_verify_tokens') ?? '[]');
    // Only the page itself, not its assets/events: a crawler or prefetch of an old link must not start checks.
    const old = tokens.find((t) => url === t || url === t.replace(/\/$/, ''));
    if (!old || req.method !== 'GET') return landing(res);

    if (current) return redirect(res, current);
    const startedAt = Date.parse(getSetting('tm_retry_started_at') ?? '') || 0;
    const lastSync = Date.parse(getSetting('wp_last_sync') ?? '') || 0;
    const waiting = Date.now() - startedAt < RETRY_WAIT && lastSync < startedAt;
    if (getSetting('tm_state') === 'blocked' && !waiting) {
      // The check expired unsolved and the worker is paused: start a fresh one now.
      setSetting('tm_retry_started_at', new Date().toISOString());
      setSetting('tm_reset_requested', '1');
      return status(res, 'Preparing a fresh check. This page refreshes by itself.', 3);
    }
    if (waiting) return status(res, 'Preparing a fresh check. This page refreshes by itself.', 3);
    return status(res, 'Nothing to solve right now. All good.');
  });
  server.listen(port, '0.0.0.0');
  return server;
}

function redirect(res: http.ServerResponse, to: string) {
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  res.end();
}

function landing(res: http.ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  res.end(LANDING);
}

/** Small page for people holding a real check link. */
function status(res: http.ServerResponse, text: string, refreshSec?: number) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  res.end(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">` +
      (refreshSec ? `<meta http-equiv="refresh" content="${refreshSec}">` : '') +
      `<title>Club manager</title><body style="font-family:system-ui,sans-serif;max-width:30rem;margin:4rem auto;padding:0 1.25rem;color-scheme:light dark"><p style="font-size:1.25rem">${text}</p>`,
  );
}

const LANDING = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Club manager</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f4ef; --fg:#1d2433; --muted:#5b6577; --card:#fff; --wood:#8a5a2b; --metal:#c9ced8; }
  @media (prefers-color-scheme: dark) { :root { --bg:#12151c; --fg:#e8eaf0; --muted:#9aa3b5; --card:#1b2030; --wood:#b07a43; --metal:#4a5368; } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--fg); font-family:system-ui, sans-serif; }
  main { max-width:30rem; padding:2rem 1.25rem; text-align:center; }
  svg { width:min(100%, 22rem); height:auto; }
  h1 { font-size:1.5rem; margin:1rem 0 .5rem; }
  p { color:var(--muted); line-height:1.5; margin:.25rem 0; }
  .light { animation: cycle 6s infinite steps(1); }
  .green { animation-delay:0s } .amber { animation-delay:-4s } .red { animation-delay:-2s }
  @keyframes cycle { 0%{opacity:1} 33%{opacity:.18} 100%{opacity:.18} }
  .arm { transform-origin: 196px 150px; animation: bang 2.4s ease-in-out infinite; }
  @keyframes bang { 0%,70%,100%{ transform:rotate(0deg) } 80%{ transform:rotate(-28deg) } 88%{ transform:rotate(6deg) } }
  @media (prefers-reduced-motion: reduce) { .light, .arm { animation:none } }
</style>
<main>
  <svg viewBox="0 0 320 250" role="img" aria-label="A small robot at a lectern holding a gavel, next to a green, amber and red timing light">
    <!-- timing light -->
    <rect x="24" y="40" width="44" height="124" rx="10" fill="var(--card)" stroke="var(--fg)" stroke-width="3"/>
    <circle class="light green" cx="46" cy="66" r="13" fill="#2fa84f"/>
    <circle class="light amber" cx="46" cy="102" r="13" fill="#f0a020"/>
    <circle class="light red" cx="46" cy="138" r="13" fill="#d64545"/>
    <rect x="42" y="164" width="8" height="56" fill="var(--fg)"/>
    <rect x="28" y="218" width="36" height="8" rx="3" fill="var(--fg)"/>
    <!-- robot -->
    <line x1="170" y1="40" x2="170" y2="22" stroke="var(--fg)" stroke-width="3"/>
    <circle cx="170" cy="18" r="6" fill="#d64545"/>
    <rect x="132" y="40" width="76" height="60" rx="16" fill="var(--metal)" stroke="var(--fg)" stroke-width="3"/>
    <circle cx="154" cy="68" r="8" fill="var(--fg)"/><circle cx="186" cy="68" r="8" fill="var(--fg)"/>
    <circle cx="157" cy="65" r="2.5" fill="var(--card)"/><circle cx="189" cy="65" r="2.5" fill="var(--card)"/>
    <path d="M156 86 q14 10 28 0" fill="none" stroke="var(--fg)" stroke-width="3" stroke-linecap="round"/>
    <rect x="140" y="104" width="60" height="54" rx="10" fill="var(--metal)" stroke="var(--fg)" stroke-width="3"/>
    <!-- arm with gavel -->
    <g class="arm">
      <path d="M196 150 L236 118" stroke="var(--fg)" stroke-width="6" stroke-linecap="round"/>
      <rect x="222" y="104" width="34" height="18" rx="5" transform="rotate(52 239 113)" fill="var(--wood)" stroke="var(--fg)" stroke-width="3"/>
    </g>
    <!-- lectern -->
    <path d="M110 150 H232 L220 226 H122 Z" fill="var(--wood)" stroke="var(--fg)" stroke-width="3" stroke-linejoin="round"/>
    <rect x="102" y="142" width="138" height="12" rx="4" fill="var(--wood)" stroke="var(--fg)" stroke-width="3"/>
    <text x="171" y="196" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="#fff">TM</text>
  </svg>
  <h1>The club manager is on duty</h1>
  <p>Keeping time, counting the "ums", and filling in the agenda.</p>
  <p>Nothing to see here: no "ah"s, no "um"s, just a robot who never goes over time.</p>
</main>
</html>`;
