/**
 * TeleAgent service: business endpoints (user info / credits / daily check-in)
 * and manual login. These endpoints only need `X-Token` — NO signature.
 *
 * Extracted from `dsh-codearts-auth`'s teleagent-auth.js / teleagent-credits.js
 * and reduced to the operations this standalone plugin exposes.
 */

import { parseCallbackInput } from './callback.js';
import { BrowserLogin, findBrowser } from './chrome-login.js';
import {
  API_BASE, CHECK_TASK_PATH, CREDENTIAL_REF, DAILY_LOGIN_TYPE, DAY_TASK_PATH,
  USER_CENTER_PATH, USER_INFO_PATH,
} from './product.js';
import { buildBusinessHeaders } from './sign.js';
import {
  ensureDeviceId, ensureInstallId, isExpired, parseCredential,
  resolveActiveCredential, saveCredential, tokenExpiresAtMs,
} from './credentials.js';

export class TeleagentService {
  /**
   * The in-flight browser login, if any.
   *
   * A browser login takes tens of seconds, far too long to hold an RPC request
   * open. So `startBrowserLogin` returns immediately and the panel polls
   * `browserLoginStatus`. Only one attempt runs at a time: two browsers would
   * fight over the same one-time code.
   */
  browserLogin = null;

  constructor(ctx) {
    this.ctx = ctx;
    this.pendingLogins = new Map();
  }

  // ── credential helpers ────────────────────────────────────────────────

  async credential() {
    return resolveActiveCredential(this.ctx);
  }

  async status() {
    const c = await this.credential();
    if (!c) return { loggedIn: false };
    return {
      loggedIn: true,
      nickname: c.nickname,
      accountId: c.account_id,
      expiresAt: c.expires_at ?? tokenExpiresAtMs(c.token),
      expired: isExpired(c),
      hasInstallId: Boolean(c.install_id),
      hasDeviceId: Boolean(c.device_id),
    };
  }

  // ── business requests ─────────────────────────────────────────────────

  async requestJson(path, options = {}) {
    const c = options.credential ?? await this.credential();
    if (!c) throw new Error('teleagent: 未登录');
    const url = API_BASE + path;
    let response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: buildBusinessHeaders(c),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new Error(`teleagent: 请求 ${path} 失败：${String(error)}`);
    }
    const text = await response.text().catch(() => '');
    let parsed;
    try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
    if (!response.ok) {
      throw new Error(`teleagent: ${path} HTTP ${response.status}${text ? ` — ${text.slice(0, 300)}` : ''}`);
    }
    return { ok: true, data: parsed?.data ?? parsed, raw: parsed, status: response.status, text };
  }

  /** Validate a token by calling user_info. Returns the account info or throws. */
  async fetchUserInfo(credential) {
    const r = await this.requestJson(USER_INFO_PATH, { credential });
    const d = r.data ?? {};
    const accountId = d.accountId ?? d.userId;
    if (!accountId) throw new Error('teleagent: user_info 未返回账号信息，token 可能已失效');
    return {
      accountId,
      nickname: d.nickname ?? d.accountName ?? d.userName ?? d.phone?.replace(/\*/g, '') ?? 'TeleAgent',
      phone: d.phone,
    };
  }

  /**
   * Query the points balance.
   *
   * Real wire shape (verified 2026-11-04):
   *   {"code":200,"msg":"success","data":{"current_points_balance":"16034.51", …}}
   * The balance is a STRING (two-decimal amount), nested under `data`.
   * `requestJson` already unwraps `data`, so `d` IS the payload object.
   * Missing field => `balance: undefined` (never fabricate 0).
   */
  async creditBalance() {
    const r = await this.requestJson(USER_CENTER_PATH);
    const d = r.data ?? {};
    const balance = looseNumber(
      d.current_points_balance ?? d.currentPointsBalance ?? d.points_balance
        ?? d.balance ?? d.credit ?? d.remaining ?? d.points,
    );
    return {
      balance: balance === undefined ? undefined : roundCredits(balance),
      // Extra context from the same endpoint, useful in the panel.
      plan: d.plan_display_name,
      activityPoints: looseNumber(d.remaining_activity_points ?? d.total_activity_points),
      raw: r.raw,
    };
  }

  /**
   * Query the daily check-in panel.
   *
   * Real wire shape (verified 2026-11-04):
   *   {"code":200,"data":{"daily_task":{
   *     "daily_claimable_points":100,"total_claim_days":26,
   *     "total_claimed_points":2600,"claimed_today":true,"button_text":"今日已领"},
   *     "activity":{"activity_title":"邀请共享积分礼",…}}}
   */
  async checkinStatus() {
    const r = await this.requestJson(DAY_TASK_PATH);
    const d = r.data ?? {};
    const task = isRecord(d.daily_task) ? d.daily_task : {};
    const activity = isRecord(d.activity) ? d.activity : {};
    return {
      claimed: looseBoolean(task.claimed_today) ?? false,
      dailyClaimablePoints: looseNumber(task.daily_claimable_points) ?? 0,
      totalClaimDays: looseNumber(task.total_claim_days) ?? 0,
      totalClaimedPoints: looseNumber(task.total_claimed_points) ?? 0,
      buttonText: nonEmptyString(task.button_text) ?? '',
      activityTitle: nonEmptyString(activity.activity_title) ?? '',
      raw: r.raw,
    };
  }

  /**
   * Claim the daily check-in. This endpoint is a **GET**, not POST (the
   * official client calls `GET checkTask?type=daily_login`). The claim
   * response shape is undocumented, so we re-query the panel afterwards to
   * get the authoritative `claimed_today` state.
   */
  async claimDailyCheckin() {
    await this.requestJson(`${CHECK_TASK_PATH}?type=${DAILY_LOGIN_TYPE}`, { method: 'GET' });
    const status = await this.checkinStatus();
    return {
      claimed: status.claimed,
      dailyClaimablePoints: status.dailyClaimablePoints,
      totalClaimedPoints: status.totalClaimedPoints,
      buttonText: status.buttonText,
    };
  }

  // ── login (manual token / callback URL paste) ─────────────────────────

  loginPageUrl() {
    return 'https://www.teleai.com.cn/teleai-api/upms/public/auth/authorize'
      + '?client_id=Z2veLLEHhZfq3hb5hWIwqJuPajIuasYi'
      + `&redirect_uri=${encodeURIComponent(API_BASE + '/cowork/auth')}`;
  }

  /**
   * Accept a pasted callback URL, deeplink, or bare token, validate it,
   * then persist into the SAME ref shape the old plugin used.
   */
  async submitLogin(input) {
    const parsed = parseCallbackInput(input);
    if (!parsed.token) {
      // A code-only paste is the documented dead end, not a typo: the address
      // bar genuinely has no token in it. Name the actual next step instead of
      // reporting "no token found" at a value that visibly contains a code.
      if (parsed.kind === 'code-only') {
        throw new Error(
          'teleagent: ' + parsed.reason
          + '。授权后的地址栏里本来就没有 token——token 由官方桌面端的 teleai-cowork:// 协议取走。'
          + '请在浏览器开发者工具的 Network 面板勾选「保留日志(Preserve log)」，然后重新完成一次授权，'
          + '查看那条 cowork/auth?code=… 请求的响应头 Location；若响应是 HTML，'
          + '再看页面随后发出的换 token 请求的响应体。把里面的 token（或整条 teleai-cowork://auth?token=… 链接）粘贴过来。',
        );
      }
      throw new Error(`teleagent: 登录内容无效（${parsed.reason ?? '未找到 token'}）`);
    }

    const deviceId = await ensureDeviceId(this.ctx);
    const installId = await ensureInstallId(this.ctx);
    const credential = {
      token: parsed.token,
      device_id: deviceId,
      install_id: installId,
    };

    const info = await this.fetchUserInfo(credential);
    credential.account_id = info.accountId;
    credential.nickname = info.nickname;
    credential.expires_at = tokenExpiresAtMs(parsed.token);

    const ref = await saveCredential(this.ctx, credential);
    return { ok: true, accountId: info.accountId, nickname: info.nickname, expiresAt: credential.expires_at, ref };
  }

  /** Backfill install_id into an existing (legacy) credential without re-login. */
  /** What the panel needs before offering the button. */
  browserLoginAvailability() {
    const browser = findBrowser();
    return {
      available: browser !== null,
      browserName: browser?.name ?? null,
      note: browser === null
        ? '未找到 Chrome / Edge / Chromium，无法使用浏览器自动登录；请安装其中之一，或改用手动粘贴 token。'
        : null,
    };
  }

  /** Status of the current or last attempt. Never throws. */
  browserLoginStatus() {
    const attempt = this.browserLogin;
    if (!attempt) return { state: 'idle', note: null, ...this.browserLoginAvailability() };
    const snapshot = attempt.snapshot;
    return {
      ...snapshot,
      result: attempt.result ?? null,
      ...this.browserLoginAvailability(),
    };
  }

  /**
   * Launch a browser and resolve the token by intercepting the callback.
   *
   * Fire-and-forget: the RPC returns at once and the outcome is recorded on
   * `browserLogin` for the panel to poll. The token is then persisted through
   * the same `submitLogin` path as a pasted one, so both entry points share one
   * validation and one credential shape.
   */
  startBrowserLogin() {
    const current = this.browserLogin?.snapshot.state;
    if (current && ['starting', 'waiting', 'saving'].includes(current)) {
      return { started: false, state: current };
    }
    const availability = this.browserLoginAvailability();
    if (!availability.available) throw new Error(`teleagent: ${availability.note}`);

    const attempt = new BrowserLogin({ loginUrl: this.loginPageUrl() });
    this.browserLogin = attempt;
    attempt.setState('starting', '正在启动浏览器…');

    void (async () => {
      try {
        const token = await attempt.start();
        attempt.setState('saving', '已取得 token，正在保存…');
        const result = await this.submitLogin(token);
        attempt.result = result;
        attempt.setState('done', `登录成功：${result.nickname || result.accountId}`);
      } catch (error) {
        attempt.setState('failed', error?.message ?? String(error));
      }
    })();

    return { started: true, state: attempt.snapshot.state };
  }

  cancelBrowserLogin() {
    const attempt = this.browserLogin;
    if (!attempt) return { cancelled: false };
    attempt.cancel();
    return { cancelled: true };
  }

  async repairCredential() {
    const c = await this.credential();
    if (!c) return { ok: false, reason: 'no credential' };
    if (c.install_id && c.device_id) return { ok: true, unchanged: true };
    const updated = {
      ...c,
      device_id: c.device_id ?? await ensureDeviceId(this.ctx),
      install_id: c.install_id ?? await ensureInstallId(this.ctx),
    };
    const ref = await saveCredential(this.ctx, updated);
    return { ok: true, repaired: true, ref };
  }
}

/** Parse a pasted callback/token. Re-exported from the dependency-free module. */
export { parseCallbackInput } from './callback.js';

function roundCredits(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : value;
}

/**
 * Read a number from either a number or a string. Points balances arrive as
 * strings like "16034.51" (to avoid float drift), so both must be accepted.
 * An empty string must NOT become 0.
 */
function looseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Read a boolean, accepting true/false, 1/0 and their string forms. */
function looseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : undefined;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return undefined;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
