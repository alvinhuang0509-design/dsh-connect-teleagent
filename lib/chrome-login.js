/**
 * Browser-assisted TeleAgent login over the Chrome DevTools Protocol.
 *
 * WHY THIS EXISTS
 * The manual paste path is a dead end for most people. After authorising, the
 * browser lands on `…/cowork/auth?code=ucc.XXXX` — only a one-time code, no
 * token. The token travels in a `teleai-cowork://auth?token=…` deeplink that
 * the official desktop app intercepts as an in-app navigation; a browser never
 * shows it in the address bar and never prints cross-scheme navigations to the
 * console. The only browser-side sighting is the Network panel, which is not a
 * reasonable thing to ask of every user.
 *
 * So we drive our own browser instance instead: launch Chrome with remote
 * debugging on an isolated profile, attach to the page, and watch the network
 * traffic for the callback. That is exactly the mechanism the desktop client
 * uses (intercept the navigation), only observed from outside.
 *
 * ZERO DEPENDENCIES
 * Node 22+ ships a global `WebSocket` and `fetch`, so CDP needs no client
 * library. Everything below is plain CDP over that socket.
 *
 * SAFETY
 * - The profile is a throwaway temp dir: the user's own Chrome profile is never
 *   touched, and no cookie jar leaks into it.
 * - Only a local debugging port on 127.0.0.1 is used; nothing is exposed.
 * - The process is killed and the temp dir removed on success, failure, cancel
 *   and timeout alike.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { looksLikeToken } from './callback.js';

/** Where a Chromium-family browser usually lives, per platform. */
export function browserCandidates(platform = process.platform) {
  if (platform === 'darwin') {
    return [
      { path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', name: 'Google Chrome' },
      { path: '/Applications/Chromium.app/Contents/MacOS/Chromium', name: 'Chromium' },
      { path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', name: 'Microsoft Edge' },
      { path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', name: 'Brave' },
      { path: '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi', name: 'Vivaldi' },
    ];
  }
  if (platform === 'win32') {
    // Fall back to the conventional roots when the environment does not carry
    // them (a non-Windows caller, a stripped service environment). Relying on
    // the env vars alone produced an EMPTY candidate list there, which reads as
    // "no browser installed" rather than "could not look".
    const roots = [
      process.env['PROGRAMFILES'],
      process.env['PROGRAMFILES(X86)'],
      process.env['LOCALAPPDATA'],
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      'C:\\Users\\Default\\AppData\\Local',
    ].filter(Boolean);
    const out = [];
    for (const root of roots) {
      out.push({ path: join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), name: 'Google Chrome' });
      out.push({ path: join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), name: 'Microsoft Edge' });
      out.push({ path: join(root, 'Chromium', 'Application', 'chrome.exe'), name: 'Chromium' });
    }
    const seen = new Set();
    return out.filter((c) => (seen.has(c.path) ? false : (seen.add(c.path), true)));
  }
  return [
    { path: '/usr/bin/google-chrome', name: 'Google Chrome' },
    { path: '/usr/bin/google-chrome-stable', name: 'Google Chrome' },
    { path: '/usr/bin/chromium', name: 'Chromium' },
    { path: '/usr/bin/chromium-browser', name: 'Chromium' },
    { path: '/usr/bin/microsoft-edge', name: 'Microsoft Edge' },
    { path: '/snap/bin/chromium', name: 'Chromium' },
  ];
}

/** First installed Chromium-family browser, or null. */
export function findBrowser(platform = process.platform) {
  return browserCandidates(platform).find((c) => existsSync(c.path)) ?? null;
}

/** Pull the browser-level DevTools socket out of Chrome's stderr banner. */
export function devtoolsEndpointFrom(stderr) {
  const m = /DevTools listening on (ws:\/\/\S+)/.exec(String(stderr ?? ''));
  return m ? m[1] : null;
}

/**
 * Find a TeleAgent token in arbitrary text (a response body, a JSON payload).
 *
 * Three shapes are known:
 *   1. the deeplink the desktop app would intercept — `teleai-cowork://auth?token=…`
 *   2. a JSON field — `{"token":"…"}`
 *   3. a bare JWT, optionally prefixed `<tenant>:`.
 */
export function extractTokenFromText(text) {
  if (typeof text !== 'string' || text.length === 0) return null;

  const link = /teleai-cowork:\/\/[^\s"'<>]*?token=([^&"'<>\s]+)/i.exec(text);
  if (link) {
    const value = safeDecode(link[1]);
    if (looksLikeToken(value)) return value;
  }

  const field = /"token"\s*:\s*"([^"]{20,})"/i.exec(text) ?? /'token'\s*:\s*'([^']{20,})'/i.exec(text);
  if (field) {
    const value = safeDecode(field[1]);
    if (looksLikeToken(value)) return value;
  }

  const bare = /[A-Za-z0-9_-]{2,}:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.exec(text)
    ?? /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.exec(text);
  if (bare && looksLikeToken(bare[0])) return bare[0];

  return null;
}

function safeDecode(v) {
  try { return decodeURIComponent(v); } catch { return v; }
}

/**
 * A token from an intercepted callback response: the `Location` header when the
 * server 302-redirects to the deeplink, else the body when it returns HTML/JSON
 * and the page exchanges the code itself.
 */
export function extractTokenFromResponse({ headers, body } = {}) {
  if (Array.isArray(headers)) {
    for (const h of headers) {
      const name = String(h?.name ?? '').toLowerCase();
      if (name === 'location' || name === 'x-teleagent-token' || name === 'x-token') {
        const fromHeader = extractTokenFromText(String(h?.value ?? ''));
        if (fromHeader) return fromHeader;
      }
    }
  }
  return extractTokenFromText(typeof body === 'string' ? body : '');
}

/** True for the URL whose response carries (or leads to) the token. */
export function isCallbackUrl(url) {
  if (typeof url !== 'string') return false;
  return /\/cowork\/auth(\?|$)/i.test(url) || /^teleai-cowork:\/\//i.test(url);
}

/** Minimal CDP client over a WebSocket. */
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)); }
      catch { return; }
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(msg.error.message ?? 'CDP error'));
        else entry.resolve(msg.result ?? {});
        return;
      }
      for (const fn of this.listeners) fn(msg);
    });
  }

  static async connect(url, timeoutMs = 10_000) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP 连接超时')), timeoutMs);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP 连接失败')); }, { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.socket.send(JSON.stringify(payload)); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  close() {
    try { this.socket.close(); } catch { /* already gone */ }
  }
}

/**
 * One login attempt. `start()` resolves with the token, or rejects with a
 * message that explains what the user should do.
 */
export class BrowserLogin {
  #state = 'idle';
  #note = null;

  constructor({ loginUrl, timeoutMs = 300_000, browser = findBrowser() } = {}) {
    this.loginUrl = loginUrl;
    this.timeoutMs = timeoutMs;
    this.browser = browser;
    this.state = 'idle';
    this.note = null;
    this.child = null;
    this.profileDir = null;
    this.cdp = null;
    this.abort = null;
  }

  get snapshot() {
    return { state: this.#state, note: this.#note };
  }

  setState(state, note = null) {
    this.#state = state;
    this.#note = note;
  }

  /** Launch the browser and wait for the callback to reveal a token. */
  async start() {
    if (!this.browser) {
      throw new Error('未找到 Chrome / Edge / Chromium。请安装其中之一，或改用手动粘贴 token。');
    }
    this.setState('starting', '正在启动浏览器…');
    this.profileDir = await mkdtemp(join(tmpdir(), 'teleagent-login-'));

    try {
      const endpoint = await this.#launch();
      this.setState('waiting', '请在浏览器窗口里完成登录…');
      return await this.#watch(endpoint);
    } finally {
      await this.#cleanup();
    }
  }

  /** Cancel a running attempt; resolves the pending start() rejection. */
  cancel() {
    this.abort?.(new Error('已取消浏览器登录'));
  }

  async #launch() {
    const args = [
      '--remote-debugging-port=0',
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-features=Translate,MediaRouter,OptimizationHints',
      '--window-size=1080,820',
      this.loginUrl,
    ];
    this.child = spawn(this.browser.path, args, { stdio: ['ignore', 'ignore', 'pipe'] });

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('浏览器启动超时（未拿到调试端口）')), 30_000);
      let buffered = '';
      const onData = (chunk) => {
        buffered += String(chunk);
        const endpoint = devtoolsEndpointFrom(buffered);
        if (endpoint) { clearTimeout(timer); this.child.stderr?.off('data', onData); resolve(endpoint); }
      };
      this.child.stderr?.on('data', onData);
      this.child.once('error', (error) => { clearTimeout(timer); reject(new Error(`无法启动浏览器：${error.message}`)); });
      this.child.once('exit', (code) => {
        if (this.#state === 'starting') { clearTimeout(timer); reject(new Error(`浏览器已退出（code ${code}）`)); }
      });
    });
  }

  async #watch(endpoint) {
    this.cdp = await Cdp.connect(endpoint);

    // Attach to the page target (the login tab). It may not exist for a moment.
    const sessionId = await this.#attachToPage();
    const cdp = this.cdp;

    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, token) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        off();
        if (error) reject(error); else resolve(token);
      };
      const timer = setTimeout(() => finish(new Error('等待登录超时，请重试')), this.timeoutMs);
      this.abort = () => finish(new Error('已取消浏览器登录'));

      const off = cdp.on((msg) => {
        if (settled) return;
        const params = msg.params ?? {};

        // 1. The callback response itself. This is the deterministic path: the
        //    server redirects (or the page replies) with the deeplink in it.
        if (msg.method === 'Fetch.requestPaused') {
          void (async () => {
            try {
              const fromHeaders = extractTokenFromResponse({ headers: params.responseHeaders });
              let token = fromHeaders;
              if (!token && params.responseStatusCode && params.requestId) {
                const { body, base64Encoded } = await cdp.send('Fetch.getResponseBody', { requestId: params.requestId }, sessionId)
                  .catch(() => ({ body: '', base64Encoded: false }));
                const text = base64Encoded ? safeAtob(body) : String(body ?? '');
                token = extractTokenFromText(text);
              }
              await cdp.send('Fetch.continueRequest', { requestId: params.requestId }, sessionId).catch(() => {});
              if (token) finish(null, token);
            } catch {
              await cdp.send('Fetch.continueRequest', { requestId: params.requestId }, sessionId).catch(() => {});
            }
          })();
          return;
        }

        // 2. The deeplink navigation, if the page sets it from script and the
        //    browser reports it as a navigation rather than a document load.
        const url = params?.request?.url ?? params?.url ?? params?.documentURL;
        if (typeof url === 'string' && url.length > 0) {
          if (/^teleai-cowork:\/\//i.test(url)) {
            const token = extractTokenFromText(url);
            if (token) { finish(null, token); return; }
          }
          if (isCallbackUrl(url)) {
            const token = extractTokenFromText(url);
            if (token) finish(null, token);
          }
        }
      });

      void (async () => {
        try {
          await cdp.send('Fetch.enable', {
            patterns: [{ urlPattern: '*cowork/auth*', requestStage: 'Response' }],
          }, sessionId);
          await cdp.send('Network.enable', {}, sessionId);
          await cdp.send('Page.enable', {}, sessionId);
        } catch (error) {
          finish(error);
        }
      })();
    });
  }

  async #attachToPage() {
    const cdp = this.cdp;
    const deadline = Date.now() + 20_000;
    for (;;) {
      const { targetInfos = [] } = await cdp.send('Target.getTargets');
      const page = targetInfos.find((t) => t.type === 'page');
      if (page?.targetId) {
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
        return sessionId;
      }
      if (Date.now() > deadline) throw new Error('浏览器没有打开登录页面');
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  async #cleanup() {
    this.cdp?.close();
    this.cdp = null;
    if (this.child && this.child.exitCode === null) {
      try { this.child.kill('SIGTERM'); } catch { /* already gone */ }
    }
    this.child = null;
    if (this.profileDir) {
      const dir = this.profileDir;
      this.profileDir = null;
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function safeAtob(value) {
  try { return Buffer.from(String(value), 'base64').toString('utf8'); } catch { return ''; }
}
