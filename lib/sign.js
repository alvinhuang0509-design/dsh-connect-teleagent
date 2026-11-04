/**
 * TeleAgent cloud-gateway request signing — the CORRECTED `v1` protocol.
 *
 * # Why this file exists
 *
 * `dsh-codearts-auth` signed inference requests with `local-v1` and a locally
 * random `sessionKey`, sending both an `X-SA-*` and an `X-SuperAgent-*` group.
 * That was the app's LOCAL-kernel auth (127.0.0.1:4397), never valid for the
 * cloud gateway. Once the gateway began genuinely verifying signatures, every
 * request failed with `401 {"code":40104,"message":"unsupported sign version"}`
 * which DSH renders as the misleading "API 密钥无效".
 *
 * # The real protocol (two-round nested HMAC-SHA256, lowercase hex)
 *
 *   K        = 3rd dot-segment (JWT signature) of the `<tenant>:<JWT>` X-Token
 *   m1       = ["superagent-auth-v1", token, installId, tsSec, nonce].join("/")
 *   sig1     = hex(HMAC_SHA256(K, m1))
 *   bodyHash = hex(SHA256(exact_body_bytes))
 *   m2       = ["superagent-auth-v1", METHOD, signPath, tsSec, nonce,
 *               appVersion, bodyHash].join("\n")
 *   sig2     = hex(HMAC_SHA256(sig1, m2))  => X-Superagent-Signature
 *
 * Traps, all verified against the live endpoint (HTTP 200 on 2026-11-04):
 *   - round 1 uses "/" separators, round 2 uses "\n" — they are DIFFERENT;
 *   - the key is the JWT signature segment, NOT the channel apiKey, NOT a
 *     server-issued session key (no such endpoint exists), NOT sign_key;
 *   - timestamp is unix SECONDS (10 digits); ms => 40103 time out of sync;
 *   - the body hash must cover the exact bytes actually transmitted, so this
 *     function takes the raw body string/Buffer rather than re-serializing;
 *   - header sign version is "v1", the in-message scheme is "superagent-auth-v1";
 *   - encoding is lowercase hex (not base64url);
 *   - nonce is a UUID with hyphens, reused in m1, m2 and the header.
 *
 * The `X-SA-*` group is NOT sent at all: the cloud does not validate it and
 * sending it adds noise / risk. Only `X-Superagent-*` is required.
 *
 * Reference: https://github.com/liao96312/teleagent-proxy
 *   docs/signature-algorithms.md, scripts/teleagent-shim.js
 */

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  API_BASE, APP_VERSION, CHANNEL_API_KEY, INFER_PATH, ROUTE_TARGET, SIGN_PATH,
  SIGN_SCHEME, SIGN_VERSION, USER_AGENT,
} from './product.js';

/** Base62 alphabet used by the kernel's tracking IDs. */
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function base62(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += B62[randomBytes(1)[0] % 62];
  return s;
}

/** Kernel-shaped `<prefix>_<12hex><14base62>` tracking id. Not signature-checked. */
export function trackingId(prefix) {
  const ms = Date.now();
  const inv = (~ms) >>> 0;
  const hex = (inv.toString(16) + randomBytes(3).toString('hex')).slice(0, 12).padEnd(12, '0');
  return `${prefix}_${hex}${base62(14)}`;
}

/** UUIDv7, matching the kernel's X-Request-Id. Not signature-checked. */
export function uuidv7() {
  const b = randomBytes(16);
  const ms = Date.now();
  b[0] = (ms / 2 ** 40) & 0xff; b[1] = (ms / 2 ** 32) & 0xff;
  b[2] = (ms / 2 ** 24) & 0xff; b[3] = (ms / 2 ** 16) & 0xff;
  b[4] = (ms / 2 ** 8) & 0xff;  b[5] = ms & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Extract the HMAC key from an X-Token of the form `<tenant>:<JWT>`.
 * @param {string} token
 * @returns {string} the 43-char JWT signature segment
 */
export function signingKeyOf(token) {
  const jwt = token.includes(':') ? token.split(':').slice(1).join(':') : token;
  const parts = jwt.split('.');
  if (parts.length < 3 || !parts[2]) {
    throw new Error('teleagent: X-Token 不是 <tenant>:<JWT> 形状，无法提取签名密钥');
  }
  return parts[2];
}

/**
 * Compute the v1 `X-Superagent-Signature` value.
 *
 * @param {object} args
 * @param {string} args.token      full X-Token (`<tenant>:<JWT>`)
 * @param {string} args.installId  stable install UUID
 * @param {number} args.tsSec      unix seconds (same value used in headers)
 * @param {string} args.nonce      UUID (same value used in headers)
 * @param {string|Buffer} args.body  EXACT raw request body bytes
 * @param {string} [args.method]  HTTP method (default POST)
 * @param {string} [args.signPath] path in the signed message
 * @param {string} [args.appVersion]
 * @returns {string} 64-char lowercase hex
 */
export function computeSignature({ token, installId, tsSec, nonce, body, method = 'POST', signPath = SIGN_PATH, appVersion = APP_VERSION }) {
  const K = signingKeyOf(token);

  // Round 1 — "/" separators, keyed by the JWT signature segment.
  const m1 = [SIGN_SCHEME, token, installId, String(tsSec), nonce].join('/');
  const sig1 = createHmac('sha256', K).update(m1, 'utf8').digest('hex');

  // Round 2 — "\n" separators, keyed by the hex STRING from round 1.
  const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const bodyHash = createHash('sha256').update(bodyBuf).digest('hex');
  const m2 = [SIGN_SCHEME, method.toUpperCase(), signPath, String(tsSec), nonce, appVersion, bodyHash].join('\n');
  return createHmac('sha256', sig1).update(m2, 'utf8').digest('hex');
}

/**
 * Build the complete wire-aligned header set for one inference request.
 *
 * ⚠️ `body` MUST be the exact string/Buffer passed to fetch(). The gateway
 * recomputes the body hash; re-serializing here would produce a mismatch.
 *
 * @param {object} args
 * @param {{token: string, device_id?: string, install_id?: string}} args.credential
 * @param {string|Buffer} args.body
 * @param {string} [args.method]
 * @param {string} [args.signPath]
 * @returns {Record<string,string>}
 */
export function buildInferHeaders({ credential, body, method = 'POST', signPath = SIGN_PATH }) {
  const token = credential.token;
  if (!token) throw new Error('teleagent: 缺少 X-Token，请先登录');

  const installId = credential.install_id || credential.installId || '';
  if (!installId) throw new Error('teleagent: 缺少 installId（登录凭据不完整）');

  const tsSec = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const signature = computeSignature({ token, installId, tsSec, nonce, body, method, signPath });

  const sessionId = trackingId('ses');
  const headers = {
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${CHANNEL_API_KEY}`,
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'X-App-Version': APP_VERSION,
    'X-Message-Id': trackingId('msg'),
    'X-Request-Id': uuidv7(),
    'X-Route-Target': ROUTE_TARGET,
    'X-Session-Id': sessionId,
    'X-Superagent-Nonce': nonce,
    'X-Superagent-Sign-Version': SIGN_VERSION,
    'X-Superagent-Signature': signature,
    'X-Superagent-Timestamp': String(tsSec),
    'X-Teleai-Client-Type': 'desktop',
    'X-Teleai-Root-Session-Id': sessionId,
    'X-Teleai-Run-Unit-Type': 'agent_loop',
    'X-Teleai-Upstream-Request-Id': randomUUID(),
    'X-Token': token,
  };
  if (credential.device_id) headers['X-Superagent-Device-Id'] = credential.device_id;
  if (installId) headers['X-Superagent-Install-Id'] = installId;
  return headers;
}

/** Headers for business endpoints (user_info / credits / checkin). No signature needed. */
export function buildBusinessHeaders(credential) {
  const headers = {
    'Accept': 'application/json',
    'X-Token': credential.token,
    'X-App-Version': APP_VERSION,
    'X-Superagent-Timestamp': String(Math.floor(Date.now() / 1000)),
    'X-Superagent-Nonce': randomUUID(),
    'X-Route-Target': ROUTE_TARGET,
    'User-Agent': USER_AGENT,
  };
  if (credential.device_id) headers['X-Superagent-Device-Id'] = credential.device_id;
  if (credential.install_id) headers['X-Superagent-Install-Id'] = credential.install_id;
  return headers;
}

/** Full inference endpoint URL. */
export const INFER_URL = API_BASE + INFER_PATH;
