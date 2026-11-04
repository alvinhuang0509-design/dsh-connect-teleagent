/**
 * TeleAgent credential parsing & resolution.
 *
 * Design goal: REUSE the credentials already stored by `dsh-codearts-auth`
 * (refs TELEAGENT_ACCESS_TOKEN / TELEAGENT_ACCOUNT_<HEX> / TELEAGENT_DEVICE_ID),
 * so installing this plugin needs no re-login.
 *
 * The v1 signing protocol additionally needs a stable `installId`. The old
 * plugin never stored one (it only stored device_id + a now-useless sign_key).
 * We therefore keep a device-level TELEAGENT_INSTALL_ID ref: generated once on
 * first use, then reused. It is NOT a secret — just a stable client identifier.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  CREDENTIAL_REF, DEVICE_ID_REF, SIGN_KEY_REF,
} from './product.js';

/**
 * Local equivalent of @deepseek-ai/dsh-credentials' `credentialRef`.
 * The host helper is just a branded-string validator over this grammar; keeping
 * a local copy makes credential parsing/tests independent of host packages.
 */
function credentialRef(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new TypeError(`credential ref "${value}" must be a POSIX identifier`);
  }
  return value;
}

export const INSTALL_ID_REF = 'TELEAGENT_INSTALL_ID';

/**
 * Parse a stored credential. Accepts:
 *   - JSON string: {token, device_id, sign_key, account_id, nickname, install_id?}
 *   - bare token string (manual setup)
 * @returns {object|undefined}
 */
export function parseCredential(raw) {
  if (raw === undefined || raw === null) return undefined;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return undefined;
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (typeof obj.token === 'string' && looksLikeTeleagentToken(obj.token)) return normalize(obj);
      return undefined;
    } catch { return undefined; }
  }
  // Bare token (possibly wrapped in quotes). Must look like `<tenant>:<JWT>`
  // or a standalone JWT — otherwise a stray value would be stored as a
  // "credential" and fail only at the first inference request.
  const token = text.replace(/^['"]|['"]$/g, '');
  if (!looksLikeTeleagentToken(token)) return undefined;
  return normalize({ token });
}

/** TeleAgent tokens are `<tenant>:<JWT>` (or at minimum a 3-segment JWT). */
function looksLikeTeleagentToken(v) {
  if (typeof v !== 'string' || v.length < 40) return false;
  const jwt = v.includes(':') ? v.split(':').slice(1).join(':') : v;
  const parts = jwt.split('.');
  return parts.length === 3 && parts[0].length > 0 && parts[1].length > 0 && parts[2].length > 0;
}

function normalize(obj) {
  return {
    token: obj.token,
    device_id: nonEmpty(obj.device_id) ?? nonEmpty(obj.deviceId),
    install_id: nonEmpty(obj.install_id) ?? nonEmpty(obj.installId),
    // Retained for backwards compatibility; v1 signing does NOT read this.
    sign_key: nonEmpty(obj.sign_key) ?? nonEmpty(obj.signKey),
    account_id: nonEmpty(obj.account_id) ?? nonEmpty(obj.accountId),
    nickname: nonEmpty(obj.nickname),
    expires_at: typeof obj.expires_at === 'number' ? obj.expires_at : undefined,
  };
}

function nonEmpty(v) {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Resolve a credential value from the DSH credential service.
 * `resolve` may return a string or {value}; handle both.
 */
async function resolveRaw(ctx, refName) {
  try {
    const r = await ctx.credentials.resolve(credentialRef(refName));
    if (r === null || r === undefined) return undefined;
    if (typeof r === 'string') return r;
    if (typeof r === 'object' && 'value' in r) return r.value;
    return undefined;
  } catch (error) {
    ctx.logger?.warn?.(`[teleagent] 读取凭据 ${refName} 失败: ${String(error)}`);
    return undefined;
  }
}

/**
 * Resolve the ACTIVE credential, preferring the account-pool entry that
 * `~/.dsh/jet-hub/state.json` marks as enabled, then the default ref.
 *
 * @returns {Promise<object|undefined>} credential object (token, device_id, install_id, ...)
 */
export async function resolveActiveCredential(ctx) {
  // 1. Account-pool entry from Jet Hub state (what the user actually logged in with).
  const poolRef = await activePoolRef();
  let cred = poolRef ? parseCredential(await resolveRaw(ctx, poolRef)) : undefined;

  // 2. Default ref.
  if (!cred) cred = parseCredential(await resolveRaw(ctx, CREDENTIAL_REF));
  if (!cred) return undefined;

  // 3. Backfill device-level values that older logins did not store.
  if (!cred.device_id) cred.device_id = await resolveRaw(ctx, DEVICE_ID_REF);
  if (!cred.install_id) cred.install_id = await ensureInstallId(ctx);
  return cred;
}

/** Persist an updated credential back to the same ref it came from. */
export async function saveCredential(ctx, credential, refName) {
  const ref = refName ?? await activePoolRef() ?? CREDENTIAL_REF;
  await ctx.credentials.set(credentialRef(ref), JSON.stringify(credential));
  return ref;
}

/** Device-level installId: read, else generate + persist. */
export async function ensureInstallId(ctx) {
  const existing = await resolveRaw(ctx, INSTALL_ID_REF);
  if (existing) return existing;
  const generated = randomUUID();
  try {
    await ctx.credentials.set(credentialRef(INSTALL_ID_REF), generated);
  } catch (error) {
    ctx.logger?.warn?.(`[teleagent] 无法持久化 installId: ${String(error)}`);
  }
  return generated;
}

/** 12-hex device id, matching the official client's device-meta.json shape. */
export function generateDeviceId() {
  return randomBytes(6).toString('hex');
}

export async function ensureDeviceId(ctx) {
  const existing = await resolveRaw(ctx, DEVICE_ID_REF);
  if (existing) return existing;
  const generated = generateDeviceId();
  try { await ctx.credentials.set(credentialRef(DEVICE_ID_REF), generated); } catch { /* optional */ }
  return generated;
}

/** List credential refs that look like TeleAgent account-pool entries. */
export async function listAccountRefs(ctx) {
  try {
    const all = await ctx.credentials.list?.();
    if (!Array.isArray(all)) return [];
    return all
      .map((e) => (typeof e === 'string' ? e : e?.ref ?? e?.name ?? e?.key))
      .filter((n) => typeof n === 'string' && /^TELEAGENT_ACCOUNT_/.test(n));
  } catch { return []; }
}

/**
 * Which pool ref is enabled? Reads Jet Hub's own state file so we agree with
 * the panel. Falls back to the first TELEAGENT_ACCOUNT_* ref found.
 */
async function activePoolRef() {
  try {
    const state = JSON.parse(await readFile(join(homedir(), '.dsh', 'jet-hub', 'state.json'), 'utf8'));
    const rows = Array.isArray(state?.accounts) ? state.accounts : [];
    const row = rows.find((a) => a?.provider === 'teleagent' && a?.enabled !== false)
      ?? rows.find((a) => a?.provider === 'teleagent');
    if (typeof row?.credentialRef === 'string' && /^TELEAGENT_ACCOUNT_/.test(row.credentialRef)) {
      return row.credentialRef;
    }
  } catch { /* state file absent / unreadable — fall through */ }
  return undefined;
}

/** Decode JWT exp (ms) without verifying the signature. */
export function tokenExpiresAtMs(token) {
  try {
    const jwt = token.includes(':') ? token.split(':').slice(1).join(':') : token;
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch { return undefined; }
}

export function isExpired(credential, now = Date.now()) {
  const exp = credential.expires_at ?? tokenExpiresAtMs(credential.token);
  return exp !== undefined && exp <= now;
}

/** Legacy ref kept so we never delete/overwrite a value the old plugin owns. */
export const LEGACY_SIGN_KEY_REF = SIGN_KEY_REF;
