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
const ctx = {
  effect: () => () => {},
  slots: {
    inject: (_name, fn) => { fn(); },
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
// teleagent selected => chip renders with points + account name.
const tree = render({ useProjection: () => ({ lastUsed: null, next: { provider: 'teleagent', model: 'chat-lite' } }) });
assert.ok(tree, 'must render for teleagent');
const flat = JSON.stringify(tree);
assert.ok(flat.includes('ta2-pill'), 'chip class present');
assert.ok(flat.includes('ta2-pill-num'), 'numeric value slot present');
// `next` outranks `lastUsed`.
assert.ok(render({ useProjection: () => ({ lastUsed: { provider: 'workbuddy', model: 'x' }, next: { provider: 'teleagent', model: 'chat-pro' } }) }));

console.log('✓ client bundle: slots registered (tool row) + provider gating correct');
