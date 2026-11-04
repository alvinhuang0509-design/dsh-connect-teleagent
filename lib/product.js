/**
 * TeleAgent (星辰超级智能体 / 中国电信天翼 AI) product constants.
 *
 * Extracted from `dsh-codearts-auth` and corrected against the live gateway.
 * The single most important correction is the signing scheme: see ./sign.js.
 */

export const PROVIDER_ID = 'teleagent';

/** Channel-level API key, embedded by the official desktop client. NOT a user credential. */
export const CHANNEL_API_KEY = 'sk-qvp4m6h9g20uM6PgYP7E';

/** Wire-verified client version. The old plugin used 2.5.3; the real kernel sends 2.5.0. */
export const APP_VERSION = '2.5.0';

/** The sign-version HEADER value. Only `v1` is accepted by the cloud gateway. */
export const SIGN_VERSION = 'v1';

/** The scheme constant embedded inside the signed message. NOT the header value. */
export const SIGN_SCHEME = 'superagent-auth-v1';

export const API_BASE = 'https://agent.teleai.com.cn/superCowork/sapi';
export const INFER_PATH = '/api/v1/chat/completions';
/** Path as it appears in the signing message (includes the /superCowork/sapi prefix). */
export const SIGN_PATH = '/superCowork/sapi' + INFER_PATH;
export const USER_INFO_PATH = '/cowork/user_info';

export const USER_CENTER_PATH = '/user/portal/companyStore/userCenter';
export const DAY_TASK_PATH = '/user/portal/companyStore/v2/checkDayTask';
export const CHECK_TASK_PATH = '/user/portal/companyStore/checkTask';
export const DAILY_LOGIN_TYPE = 'daily_login';

export const ROUTE_TARGET = 'ops-gateway';
export const USER_AGENT = 'super-agent/1.0';

export const REQUEST_TIMEOUT_MS = 120_000;

/** Credential refs in ~/.dsh/.credentials.yaml. */
export const CREDENTIAL_REF = 'TELEAGENT_ACCESS_TOKEN';
export const DEVICE_ID_REF = 'TELEAGENT_DEVICE_ID';
/** Legacy local-kernel session key. Retained for compatibility ONLY; not used by v1 signing. */
export const SIGN_KEY_REF = 'TELEAGENT_SIGN_KEY';

/**
 * Model tiers. The gateway does NOT expose a model-list endpoint; these are
 * the IDs the official desktop client sends in `chat/completions`' `model`
 * field (providerID "NewApi", modelID "chat-*").
 *
 * Verified from the client's app.asar seed table `KG` (chat-nano / chat-lite)
 * and the Go kernel's embedded sample session (chat-pro). Display names follow
 * the current client UI: 轻量 / 智能 / 旗舰. All three share one preset context
 * (100K window, 16384 output) — the client explicitly documents that the
 * preset tiers share a single context configuration.
 *
 * ⚠️ Do NOT invent DeepSeek/Qwen-style IDs here: the previous version listed
 * `deepseek-v3.1` etc. and the picker names did not match the real client.
 */
export const FALLBACK_MODELS = Object.freeze([
  { id: 'chat-nano', name: '轻量', contextWindow: 100_000, maxTokens: 16_384 },
  { id: 'chat-lite', name: '智能', contextWindow: 100_000, maxTokens: 16_384 },
  { id: 'chat-pro', name: '旗舰', contextWindow: 100_000, maxTokens: 16_384 },
]);
