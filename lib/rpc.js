/**
 * Slim Jet Hub-style RPC endpoint for the standalone TeleAgent plugin.
 *
 * Registers ONE host-side HTTP route (`/api/teleagent-connect`) that answers the
 * small set of verbs the settings panel needs. The original plugin used a
 * 234 KB monolithic `jet-hub-rpc.js` covering 15 providers; this is the
 * TeleAgent-only subset.
 *
 * Envelope follows @deepseek-ai/dsh-client-connection:
 *   request : { type:'client-request', rpcId, method, payload }
 *   response: { type:'server-response', rpcId, result: {ok:true,value} | {ok:false,error:{code,message}} }
 */

import { FALLBACK_MODELS, PROVIDER_ID } from './product.js';

export const RPC_API_PATH = '/api/teleagent-connect';
export const RPC_ENDPOINT = 'teleagent-connect';

function reply(rpcId, result) {
  return Response.json({ type: 'server-response', rpcId, result });
}

function ok(value) { return { ok: true, value }; }
function fail(code, message) { return { ok: false, error: { code, message, details: {} } }; }

/**
 * @param {object} ctx   cordis context (must expose `connection`)
 * @param {TeleagentService} service
 */
export function registerRpc(ctx, service) {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection ?? connectionCtx.get?.('connection');
    if (!connection || typeof connection.fetch?.register !== 'function') {
      ctx.logger?.warn?.('[teleagent-connect] connection.fetch 不可用，设置面板 RPC 未注册');
      return;
    }
    connection.fetch.register({
      path: RPC_API_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
        const ct = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
        if (ct !== 'application/json') return new Response('content type must be application/json', { status: 415 });
        let message;
        try { message = await request.json(); } catch { return new Response('body is not JSON', { status: 400 }); }
        const rpcId = typeof message.rpcId === 'string' ? message.rpcId : 'invalid-request';
        const call = message.payload;
        if (message.type !== 'client-request' || message.method !== RPC_ENDPOINT
          || !call || typeof call.method !== 'string') {
          return reply(rpcId, fail('teleagent-connect/bad-request', 'Invalid management request.'));
        }
        try {
          return reply(rpcId, await handle(call.method, call.payload ?? {}, service, ctx));
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          ctx.logger?.warn?.(`[teleagent-connect] ${call.method} failed: ${msg}`);
          return reply(rpcId, fail('teleagent-connect/handler-failed', msg));
        }
      },
    });
  });
}

async function handle(method, payload, service, ctx) {
  switch (method) {
    case 'status': {
      const [status, models] = await Promise.all([
        service.status(),
        Promise.resolve(FALLBACK_MODELS.map((m) => ({ id: m.id, name: m.name }))),
      ]);
      return ok({ provider: PROVIDER_ID, ...status, models });
    }
    case 'login.url':
      return ok({ url: service.loginPageUrl() });
    case 'login.submit':
      return ok(await service.submitLogin(payload.input ?? payload.callback ?? payload.token ?? ''));
    case 'credential.repair':
      return ok(await service.repairCredential());
    case 'credits.balance':
      return ok(await service.creditBalance());
    case 'credits.status':
      return ok(await service.checkinStatus());
    case 'credits.claim':
      return ok(await service.claimDailyCheckin());
    case 'userInfo':
      return ok(await service.fetchUserInfo());
    case 'models.list':
      return ok(FALLBACK_MODELS.map((m) => ({ id: m.id, name: m.name, contextWindow: m.contextWindow })));
    default:
      return fail('teleagent-connect/unknown-method', `Unknown method: ${method}`);
  }
}
