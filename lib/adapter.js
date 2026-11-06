/**
 * TeleAgent LLM adapter for DeepSeek Harness.
 *
 * Registers provider `teleagent` on `ctx.llm` and streams OpenAI-compatible
 * SSE from the cloud gateway, signed with the CORRECTED v1 protocol.
 *
 * Differences from the `dsh-codearts-auth` TeleagentAdapter:
 *   - uses buildInferHeaders() from ./sign.js (v1, two-round HMAC, JWT key);
 *   - the request body is serialized ONCE and that exact string is both signed
 *     and sent (the body hash is part of the signature);
 *   - no X-SA-* local-kernel headers, no random sign_key;
 *   - wire-aligned tracking headers to reduce out-of-app fingerprinting.
 */

import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm';
import {
  API_BASE, APP_VERSION, FALLBACK_MODELS, INFER_PATH, PROVIDER_ID,
  REQUEST_TIMEOUT_MS, SIGN_PATH,
} from './product.js';
import { buildInferHeaders, INFER_URL } from './sign.js';
import { collectImages, consumeOpenAiSse, errorDetail, httpErrorCode, serializeMessages } from './openai-compat.js';
import { resolveActiveCredential, isExpired } from './credentials.js';
import { limitsFor } from './model-config.js';

export class TeleagentAdapter extends LlmAdapter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
  }

  /**
   * Advertise the tiers with the limits the user configured.
   *
   * The catalogue is static (no server endpoint), but the WINDOW is a declared
   * budget rather than a server fact, so it is read from model-config on every
   * call — changing it must reach the next picker render without a restart.
   */
  async listModels(provider) {
    return FALLBACK_MODELS.map((m) => ({
      provider: provider ?? PROVIDER_ID,
      id: m.id,
      name: m.name,
      inputModalities: ['text'],
      context: { contextWindow: limitsFor(m.id).contextWindow },
    }));
  }

  async resolveModel(provider, model) {
    const known = FALLBACK_MODELS.find((m) => m.id === model);
    const limits = limitsFor(model);
    return {
      provider: provider ?? PROVIDER_ID,
      id: model,
      name: known?.name ?? model,
      inputModalities: ['text'],
      context: { contextWindow: limits.contextWindow },
      defaultMaxTokens: limits.maxOutputTokens,
    };
  }

  /** Bind model metadata so a catalog refresh mid-turn cannot mix generations. */
  async prepareCall(provider, model) {
    return {
      model: await this.resolveModel(provider, model),
      stream: (options) => this.stream(options),
    };
  }

  async *stream(options) {
    const credential = await resolveActiveCredential(this.ctx);
    if (!credential) {
      throw new LlmError('teleagent: 未找到登录凭据，请在 Jet Hub 登录 TeleAgent', 'MISSING_CREDENTIAL');
    }
    if (isExpired(credential)) {
      throw new LlmError('teleagent: 登录已过期（约 30 天），请在 Jet Hub 重新登录', 'AUTH');
    }

    const imageRefs = new Map();
    for (const message of options.messages ?? []) {
      if (Array.isArray(message.content)) collectImages(message.content, imageRefs);
    }
    // TeleAgent's chat endpoint is text-only in this plugin; images are dropped
    // with an explicit placeholder rather than silently disappearing.
    let imageUrls;
    if (imageRefs.size > 0) {
      imageUrls = new Map();
      if (typeof this.ctx.attachments?.read === 'function') {
        for (const [id, ref] of imageRefs) {
          try {
            const image = await this.ctx.attachments.read(ref);
            if (image) imageUrls.set(id, `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}`);
          } catch { /* placeholder below */ }
        }
      }
    }

    const messages = serializeMessages(options.messages ?? [], imageUrls);
    if (options.system) messages.unshift({ role: 'system', content: options.system });

    const tools = options.tools?.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));

    const body = { model: options.model, messages, stream: true };
    if (tools?.length) body.tools = tools;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.stop?.length) body.stop = options.stop;

    // ⚠️ Serialize ONCE: this exact string is hashed into the signature.
    const bodyStr = JSON.stringify(body);
    const headers = buildInferHeaders({ credential, body: bodyStr, method: 'POST', signPath: SIGN_PATH });

    let response;
    try {
      response = await fetch(INFER_URL, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new LlmError(`teleagent: 请求失败：${errorMessage(error)}`, 'TRANSPORT');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const code = response.status === 402 ? 'QUOTA_EXCEEDED' : httpErrorCode(response.status);
      throw new LlmError(
        `teleagent: HTTP ${response.status}${text ? ` — ${errorDetail(text).slice(0, 500)}` : ''}${signHint(text)}`,
        code,
        { status: response.status },
      );
    }
    if (!response.body) throw new LlmError('teleagent: 响应缺少 body', 'EMPTY_RESPONSE');

    yield* consumeOpenAiSse(response, { signal: options.signal }, {
      label: PROVIDER_ID,
      firstTokenTimeoutMs: 120_000,
      chunkTimeoutMs: 120_000,
      ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
    });
  }
}

/** Human-readable hint for the gateway's notoriously misleading error codes. */
function signHint(text) {
  if (/"?code"?\s*:\s*"?(40103|40104|40101|40301)"?/.test(text) || /unsupported sign version|invalid signature/i.test(text)) {
    return '（网关签名校验失败：本插件使用 v1 两轮 HMAC 签名；若持续出现请确认登录凭据里的 installId 与 token 匹配，或重新登录）';
  }
  if (/"?code"?\s*:\s*"?40109"?/.test(text) || /current user is banned/i.test(text)) {
    return '（账号已被风控封禁：请立即停止请求、等待解封，详见插件 README 的风控说明）';
  }
  if (/"?code"?\s*:\s*"?40105"?/.test(text) || /疑似攻击/.test(text)) {
    return '（触发风控 40105：请立即停止请求并降低频率，避免账号级封禁 40109）';
  }
  return '';
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Idempotent registration (survives plugin-fiber restarts). */
export function registerTeleagentLlm(ctx) {
  const adapter = new TeleagentAdapter(ctx);
  try {
    ctx.llm.registerAdapter([PROVIDER_ID], adapter);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/already declared|already registered|is already (?:a|an) adapter/i.test(msg)) throw error;
    ctx.logger?.warn?.('[teleagent] adapter 已注册（fiber 重启竞态），保留现有路由');
  }
  return adapter;
}
