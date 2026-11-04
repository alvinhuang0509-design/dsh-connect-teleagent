/**
 * Regression test: `apply()` must NOT throw synchronously.
 *
 * Real bug (2026-11-04, "无法提交 token 登录"): the slash command was
 * registered with `async *run()` instead of a `handler` FUNCTION returning a
 * CommandResult. dsh-commands' normalizeDefinition throws a TypeError during
 * apply(), and cordis rolls back the WHOLE plugin — so the RPC endpoint and
 * the settings panel were never registered. The login button appeared to do
 * nothing / fail.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const { apply, name, inject } = await import(pathToFileURL(`${DIR}/lib/index.js`).href);

const seen = { adapters: [], commands: [], rpc: [], injected: [], provided: [] };

// Strict mock replicating dsh-commands' normalizeDefinition validation.
const ctx = {
  credentials: { async resolve() { return null; }, async set() {} },
  llm: { registerAdapter(providers, adapter) { seen.adapters.push({ providers, adapter }); return { dispose() {} }; } },
  commands: {
    register(def) {
      if (!/^[a-z][a-z0-9-]*$/.test(def.name)) throw new TypeError(`command name "${def.name}" invalid`);
      if (typeof def.description !== 'string' || !def.description.trim()) throw new TypeError('description');
      if (typeof def.handler !== 'function') throw new TypeError(`command "${def.name}" handler must be a function`);
      if (def.input && (typeof def.input.hint !== 'string' || !def.input.hint.trim())) throw new TypeError('input hint');
      seen.commands.push(def);
      return () => {};
    },
  },
  connection: { fetch: { register(route) { seen.rpc.push(route); } }, rpc: {} },
  logger: { info() {}, warn() {} },
  provide(id, value) { seen.provided.push({ id, value }); },
  inject(names, fn) { seen.injected.push({ names, fn }); },
  effect() { return () => {}; },
  get(key) { return key === 'connection' ? ctx.connection : undefined; },
};

// 1. apply() completes without throwing.
let result;
assert.doesNotThrow(() => { /* async not needed; apply is synchronous */ });
result = apply(ctx);
assert.equal(name, 'teleagent-connect');
assert.deepEqual(inject, ['credentials', 'commands', 'llm']);
assert.ok(result.service && result.adapter);

// 2. LLM route registered.
assert.deepEqual(seen.adapters[0].providers, ['teleagent']);

// 3. Command has the CORRECT handler shape (this is the regression guard).
const cmd = seen.commands[0];
assert.equal(cmd.name, 'teleagent');
assert.equal(typeof cmd.handler, 'function', 'must be a function, not an async generator');
assert.ok(!('run' in cmd), 'must not use the old `run` generator');
const out = await cmd.handler({ rawInput: 'bogus' });
assert.equal(out.kind, 'success');
assert.match(out.text, /用法/);

// 4. The connection injection actually registers the RPC route.
assert.equal(seen.injected.length, 1);
assert.deepEqual(seen.injected[0].names, ['connection']);
seen.injected[0].fn(ctx);
assert.equal(seen.rpc.length, 1, 'RPC route must be registered');
assert.equal(seen.rpc[0].path, '/api/teleagent-connect');

// 5. The RPC route answers a status call with a well-formed envelope.
const envelope = {
  type: 'client-request', rpcId: 'r1', method: 'teleagent-connect',
  payload: { method: 'status', payload: {} },
};
const request = new Request('http://local/api/teleagent-connect', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope),
});
const response = await seen.rpc[0].fetch(request);
const body = await response.json();
assert.equal(body.type, 'server-response');
assert.equal(body.rpcId, 'r1');
assert.equal(body.result.ok, true);
assert.equal(body.result.value.provider, 'teleagent');

// 6. login.submit is reachable (the verb the login button calls).
const loginEnv = {
  type: 'client-request', rpcId: 'r2', method: 'teleagent-connect',
  payload: { method: 'login.submit', payload: { input: 'not-a-token' } },
};
const loginRes = await seen.rpc[0].fetch(new Request('http://local/api/teleagent-connect', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(loginEnv),
}));
const loginBody = await loginRes.json();
assert.equal(loginBody.result.ok, false, 'invalid token must produce a structured error');
assert.match(loginBody.result.error.message, /登录内容无效|teleagent/);

console.log('✓ apply() regression test passed (command handler shape + RPC + login.submit)');
