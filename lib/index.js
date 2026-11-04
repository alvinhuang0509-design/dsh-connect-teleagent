/**
 * dsh-connect-teleagent — standalone TeleAgent provider for DeepSeek Harness.
 *
 * Extracted from dsh-codearts-auth's TeleAgent logic, with the inference signing
 * replaced by the CORRECT cloud-gateway `v1` protocol (see ./sign.js).
 *
 * It registers:
 *   - provider `teleagent` on ctx.llm (OpenAI-compatible streaming adapter);
 *   - a settings panel (settings.section slot) via the client bundle;
 *   - a slim host RPC endpoint for status / login / credits / check-in;
 *   - `/teleagent` slash commands for headless use.
 */

import { PROVIDER_ID } from './product.js';
import { registerTeleagentLlm } from './adapter.js';
import { TeleagentService } from './service.js';
import { registerRpc } from './rpc.js';

export const name = 'teleagent-connect';
export const inject = ['credentials', 'commands', 'llm'];

export function apply(ctx) {
  const service = new TeleagentService(ctx);
  const adapter = registerTeleagentLlm(ctx);

  // Expose the service for other plugins / programmatic use.
  ctx.provide('teleagentV2', service);

  registerRpc(ctx, service);

  // Slash commands (the original plugin registered none; these make the plugin
  // usable in headless/TUI profiles where the settings panel is unavailable).
  //
  // ⚠️ `commands.register` requires a `handler` FUNCTION returning a
  // CommandResult ({kind:'success'|'error', text}). An async generator (`run`)
  // is NOT accepted: normalizeDefinition throws synchronously during apply(),
  // which rolls back the WHOLE plugin (RPC endpoint + settings panel included).
  // That was the cause of "无法提交 token 登录".
  const commands = ctx.commands;
  commands?.register?.({
    name: 'teleagent',
    description: 'TeleAgent：状态 / 登录 / 积分 / 签到',
    input: { hint: 'status | login [回调URL] | repair | balance | checkin | claim | user' },
    async handler({ rawInput }) {
      const text = String(rawInput ?? '').trim();
      const verb = text.split(/\s+/)[0] || 'status';
      const rest = text.slice(verb.length).trim();
      try {
        let out;
        if (verb === 'status') {
          out = JSON.stringify(await service.status(), null, 2);
        } else if (verb === 'login') {
          if (!rest) {
            out = `官方登录页：${service.loginPageUrl()}\n\n登录后把回调 URL 粘贴给：/teleagent login <回调URL>`;
          } else {
            const r = await service.submitLogin(rest);
            out = `登录成功：${r.nickname || r.accountId}`;
          }
        } else if (verb === 'repair') {
          out = JSON.stringify(await service.repairCredential(), null, 2);
        } else if (verb === 'balance') {
          out = JSON.stringify(await service.creditBalance(), null, 2);
        } else if (verb === 'checkin') {
          out = JSON.stringify(await service.checkinStatus(), null, 2);
        } else if (verb === 'claim') {
          out = JSON.stringify(await service.claimDailyCheckin(), null, 2);
        } else if (verb === 'user') {
          out = JSON.stringify(await service.fetchUserInfo(), null, 2);
        } else {
          out = '用法：/teleagent status | login [回调URL] | repair | balance | checkin | claim | user';
        }
        return { kind: 'success', text: out };
      } catch (error) {
        return { kind: 'error', text: `TeleAgent 错误：${error instanceof Error ? error.message : String(error)}` };
      }
    },
  });

  ctx.logger?.info?.(`[${name}] provider "${PROVIDER_ID}" 已注册（v1 网关签名）`);
  return { service, adapter };
}
