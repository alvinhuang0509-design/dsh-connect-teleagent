/**
 * Client bundle test: verifies the composer readout registers and gates on the
 * session's selected provider, without needing a real browser or React.
 *
 * The bundle is a `window.__ModuleLoader__` CJS module that requires react /
 * react-dom / react/jsx-runtime. We supply tiny stubs, then drive the exported
 * `apply(ctx)` with a fake slot host and inspect the registered slots.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const BUNDLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js');

// ── React stubs ─────────────────────────────────────────────────────────
let stateSlots = [];
let stateIdx = 0;
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useRef: (v) => ({ current: v }),
  useState: (init) => {
    const i = stateIdx++;
    if (!(i in stateSlots)) stateSlots[i] = typeof init === 'function' ? init() : init;
    return [stateSlots[i], (v) => { stateSlots[i] = typeof v === 'function' ? v(stateSlots[i]) : v; }];
  },
  useCallback: (fn) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
  Fragment: 'Fragment',
};
const ReactDOM = { createPortal: (node) => node };
const jsxRuntime = { jsx: React.createElement, jsxs: React.createElement, Fragment: 'Fragment' };

// ── Load the bundle through the module loader contract ───────────────────
const registered = [];
// The REAL host may materialize a session-scoped inject factory more than once
// (e.g. once per live session). Model that: run the factory THREE times, which
// is the exact shape of the reported bug (three identical chips in one row).
const FACTORY_RUNS = 3;
const ctx = {
  effect: () => () => {},
  slots: {
    inject: (_name, fn) => {
      for (let i = 0; i < FACTORY_RUNS; i++) fn();
    },
    register: (opts, Component) => { registered.push({ opts, Component }); return () => {}; },
  },
  connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
};

const module = { exports: {} };
const sandbox = {
  window: {
    __ModuleLoader__: {
      load: ({ factory }) => {
        const req = (id) => {
          if (id === 'react') return React;
          if (id === 'react-dom') return ReactDOM;
          if (id === 'react/jsx-runtime') return jsxRuntime;
          throw new Error(`unexpected require(${id})`);
        };
        Object.assign(module.exports, factory(req));
      },
    },
  },
  module,
  exports: module.exports,
  console,
  document: {
    getElementById: () => null,
    createElement: () => ({}),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
    body: {},
  },
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
};
sandbox.window.innerWidth = 1280;
vm.createContext(sandbox);
vm.runInContext(readFileSync(BUNDLE, 'utf8'), sandbox);

const exported = module.exports;
assert.equal(typeof exported.apply, 'function');
assert.deepEqual([...exported.inject], ['slots', 'connection']);
exported.apply(ctx);

// ── Both slots registered ───────────────────────────────────────────────
const names = registered.map((r) => `${r.opts.name}#${r.opts.id}`);
console.log('registered:', names);
assert.ok(names.includes('settings.section#teleagent-connect'), 'settings section registered');
// The readout must sit in the composer TOOL ROW, immediately before the model
// selector (`conversation.input.right` renders in the same `standardControls`
// row as `conversation.input.model`, ahead of it).
assert.ok(names.includes('conversation.input.right#teleagent-connect-credits'), 'composer tool-row readout registered');
assert.ok(!names.includes('conversation.composer.dock#teleagent-connect-credits'), 'must no longer use the dock seat');

const pill = registered.find((r) => r.opts.id === 'teleagent-connect-credits');
assert.equal(pill.opts.name, 'conversation.input.right');
assert.equal(pill.opts.order, 0);

// ── DUPLICATE GUARD (regression: three chips in one composer row) ───────
// The inject factory ran FACTORY_RUNS times above; the chip must still be
// registered exactly ONCE, and the settings section exactly once too.
const creditRegs = registered.filter((r) => r.opts.id === 'teleagent-connect-credits');
assert.equal(creditRegs.length, 1, `chip must register exactly once despite ${FACTORY_RUNS} factory runs, got ${creditRegs.length}`);
const sectionRegs = registered.filter((r) => r.opts.id === 'teleagent-connect');
assert.equal(sectionRegs.length, 1, 'settings section must register exactly once');

// ── Gating ──────────────────────────────────────────────────────────────
function render(props) {
  stateSlots = [];
  stateIdx = 0;
  return pill.Component({ rpcCall: async () => ({}), ...props });
}

// Other provider => nothing drawn (no request loop either).
assert.equal(render({ useProjection: () => ({ lastUsed: { provider: 'workbuddy', model: 'hy4free' }, next: null }) }), null);
// No projection => nothing.
assert.equal(render({}), null);
// teleagent selected => chip renders.
const tree = render({ useProjection: () => ({ lastUsed: null, next: { provider: 'teleagent', model: 'chat-lite' } }) });
assert.ok(tree, 'must render for teleagent');
const flat = JSON.stringify(tree);
assert.ok(flat.includes('t2-pill'), 'chip wrapper class present');
assert.ok(flat.includes('t2-chip'), 'chip button class present');
// `next` outranks `lastUsed`.
assert.ok(render({ useProjection: () => ({ lastUsed: { provider: 'workbuddy', model: 'x' }, next: { provider: 'teleagent', model: 'chat-pro' } }) }));

// ── Signed-out must NOT read as "points failed to load" ────────────────
// Reported from a second client: a fresh machine with no TeleAgent
// credential showed a red "积分读取失败，请稍后重试" and a blank account name.
// Two defects produced that: (a) credits.* ran inside the same Promise.all as
// status, so a signed-out rejection discarded the successful status; (b) one
// boolean carried both "signed-out" and "read failed".
const bundleSrc = readFileSync(BUNDLE, 'utf8');
assert.ok(bundleSrc.includes('signed-out'), 'bundle must carry a distinct signed-out state');
assert.ok(bundleSrc.includes('这台机器还没有登录 TeleAgent'), 'signed-out copy must name the real cause');
assert.ok(
  !/Promise\.all\(\[\s*[^\]]*rpcCall\("status"\)[^\]]*rpcCall\("credits\.balance"\)/.test(bundleSrc),
  'status must not share a Promise.all with credits.* — that is what swallowed the real answer',
);

// ── Themed surfaces must use tokens the host actually defines ──────────
// The shipped 1.0.2 popover was light text on hard-coded white: it used
// `--dsw-alias-bg-elevated` / `--dsw-alias-border-default`, which do not exist,
// so the background fell back to #fff while the text token resolved to the dark
// theme's light grey. Assert the invented names are gone and the real ones used.
for (const ghost of ['--dsw-alias-bg-elevated', '--dsw-alias-border-default']) {
  assert.ok(!bundleSrc.includes(ghost), `invented token ${ghost} must not be used`);
}
for (const real of ['--dsw-alias-bg-layer-3', '--dsw-alias-border-l2', '--dsw-alias-label-secondary']) {
  assert.ok(bundleSrc.includes(real), `themed surface must use the real token ${real}`);
}

// ── Signed-out panel must offer a way out, not just a message ──────────
assert.ok(bundleSrc.includes('打开官方登录页'), 'signed-out panel must offer the login page');
assert.ok(bundleSrc.includes('login.submit'), 'signed-out panel must accept a pasted token inline');


console.log('✓ client bundle: slots registered (tool row) + provider gating + signed-out copy');
