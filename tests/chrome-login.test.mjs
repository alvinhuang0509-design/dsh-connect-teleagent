/**
 * Browser-assisted login: browser discovery, DevTools-endpoint parsing, and
 * token extraction from the shapes the callback actually produces.
 *
 * The interception itself needs a real browser, so the unit-testable surface is
 * the pure part: which browsers we find, how we read Chrome's "DevTools
 * listening on" banner, and whether a token can be recovered from a Location
 * header, a JSON body, or the deeplink.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = join(import.meta.dirname, '..');
const chrome = await import(pathToFileURL(join(DIR, 'lib/chrome-login.js')).href);

const token = 'Em9xR4:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3OTYzMDEzNjd9.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij0123456';

// ── browser discovery ────────────────────────────────────────────────────
// Per-platform candidate lists exist and are ordered with Chrome first, so a
// machine with several browsers gets the one users actually mean.
const macCandidates = chrome.browserCandidates('darwin');
assert.ok(macCandidates.length >= 3, 'darwin must offer several candidates');
assert.match(macCandidates[0].path, /Google Chrome/);
for (const c of macCandidates) assert.ok(c.name && c.path, 'each candidate needs a name and a path');
assert.ok(chrome.browserCandidates('win32').length > 0, 'win32 candidates exist');
assert.ok(chrome.browserCandidates('linux').length > 0, 'linux candidates exist');
// findBrowser returns either a candidate or null — never throws on this host.
const found = chrome.findBrowser();
assert.ok(found === null || (typeof found.path === 'string' && typeof found.name === 'string'));

// ── DevTools banner ──────────────────────────────────────────────────────
// Chrome prints the socket URL on stderr; the port is chosen dynamically (we
// pass --remote-debugging-port=0), so this line is the only way to learn it.
assert.equal(
  chrome.devtoolsEndpointFrom('DevTools listening on ws://127.0.0.1:54321/devtools/browser/abc-123'),
  'ws://127.0.0.1:54321/devtools/browser/abc-123',
);
assert.equal(
  chrome.devtoolsEndpointFrom('[1106/120000:ERROR:foo] noise\nDevTools listening on ws://127.0.0.1:9/devtools/browser/x\nmore'),
  'ws://127.0.0.1:9/devtools/browser/x',
  'must tolerate surrounding log noise',
);
assert.equal(chrome.devtoolsEndpointFrom('nothing here'), null);
assert.equal(chrome.devtoolsEndpointFrom(undefined), null);

// ── callback URL recognition ─────────────────────────────────────────────
assert.equal(chrome.isCallbackUrl('https://agent.teleai.com.cn/superCowork/sapi/cowork/auth?code=ucc.1'), true);
assert.equal(chrome.isCallbackUrl('https://agent.teleai.com.cn/superCowork/sapi/cowork/auth'), true);
assert.equal(chrome.isCallbackUrl('teleai-cowork://auth?token=abc'), true);
assert.equal(chrome.isCallbackUrl('https://agent.teleai.com.cn/superCowork/sapi/chat/completions'), false);
assert.equal(chrome.isCallbackUrl(undefined), false);

// ── token extraction: the three real shapes ──────────────────────────────
// 1. A 302 whose Location is the deeplink. This is the deterministic path.
assert.equal(
  chrome.extractTokenFromResponse({
    headers: [{ name: 'Location', value: `teleai-cowork://auth?token=${encodeURIComponent(token)}` }],
  }),
  token,
  'Location header carrying the deeplink must yield the token',
);
// Header names are matched case-insensitively.
assert.equal(
  chrome.extractTokenFromResponse({
    headers: [{ name: 'location', value: `teleai-cowork://auth?token=${encodeURIComponent(token)}` }],
  }),
  token,
);
// 2. An HTML body where the page script embeds the deeplink.
assert.equal(
  chrome.extractTokenFromResponse({
    headers: [{ name: 'Content-Type', value: 'text/html' }],
    body: `<script>location.href = "teleai-cowork://auth?token=${encodeURIComponent(token)}"</script>`,
  }),
  token,
  'deeplink inside an HTML body must be recovered',
);
// 3. A JSON body from a code→token exchange.
assert.equal(
  chrome.extractTokenFromResponse({ body: JSON.stringify({ code: 200, data: { token } }) }),
  token,
  'JSON token field must be recovered',
);
// A bare JWT with no wrapper at all.
assert.equal(chrome.extractTokenFromText(`prefix ${token} suffix`), token);
assert.equal(chrome.extractTokenFromText(token), token);

// ── negative cases: never invent a token ─────────────────────────────────
assert.equal(chrome.extractTokenFromText(''), null);
assert.equal(chrome.extractTokenFromText(undefined), null);
assert.equal(chrome.extractTokenFromText('{"code":4001,"message":"当前令牌是否存在"}'), null);
assert.equal(chrome.extractTokenFromResponse({ headers: [{ name: 'Location', value: '/master-auth?client_id=x' }] }), null);
// A code is NOT a token, and the extractor must not promote one.
assert.equal(chrome.extractTokenFromText('{ "code": "ucc.ABC123def" }'), null);

// ── the state machine the panel polls ────────────────────────────────────
const attempt = new chrome.BrowserLogin({ loginUrl: 'https://example.test/login', browser: null });
assert.deepEqual(attempt.snapshot, { state: 'idle', note: null });
attempt.setState('waiting', '请在浏览器窗口里完成登录…');
assert.deepEqual(attempt.snapshot, { state: 'waiting', note: '请在浏览器窗口里完成登录…' });
// Without a browser it fails fast with an actionable message instead of hanging.
await assert.rejects(() => attempt.start(), /未找到 Chrome|Chrome \/ Edge/, 'missing browser must be explained, not hang');
attempt.cancel(); // no-op, must not throw

console.log('✓ browser login: discovery, DevTools endpoint, token extraction, state machine');
