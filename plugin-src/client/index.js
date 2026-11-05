// TeleAgent v2 settings panel — clean-room slim implementation.
// Bundled to lib/client.js by scripts/build-client.mjs.
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { jsx, jsxs } from 'react/jsx-runtime';

const PROVIDER = 'teleagent';

// The client calls connection.rpc.call("/api", "teleagent-connect", {...}), which
// POSTs to "/api/teleagent-connect" — matching lib/rpc.js's registered fetch path.
// The outer `method` is the endpoint name; the inner payload.method is the verb.
const ENDPOINT = 'teleagent-connect';
const CHANNEL = '/api';

function callRpc(connection, verb, payload, signal) {
  return connection.rpc.call(CHANNEL, ENDPOINT, { method: verb, payload }, signal);
}
function unwrap(result) {
  if (result?.ok === true) return result.value;
  if (result?.ok === false) {
    const e = new Error(result.error?.message || 'TeleAgent RPC 请求失败');
    e.code = result.error?.code;
    throw e;
  }
  return result;
}

const STYLE_ID = 'dsh-connect-teleagent-styles';
const CSS = `
.ta2-page { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; max-width: 720px; }
.ta2-title { font-size: 17px; font-weight: 600; margin: 0; }
.ta2-sub { font-size: 12px; opacity: .7; margin: 2px 0 0; line-height: 1.6; }
.ta2-card { border: 1px solid var(--dsw-alias-border-default, #e5e5e5); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.ta2-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ta2-label { font-size: 12px; opacity: .75; min-width: 84px; }
.ta2-value { font-size: 13px; font-weight: 500; }
.ta2-btn { border: 1px solid var(--dsw-alias-border-default, #d0d0d0); background: transparent; color: inherit; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.ta2-btn:hover { background: rgba(127,127,127,.1); }
.ta2-btn:disabled { opacity: .45; cursor: not-allowed; }
.ta2-btn.primary { background: #009273; border-color: #009273; color: #fff; }
.ta2-input { flex: 1; min-width: 240px; border: 1px solid var(--dsw-alias-border-default, #d0d0d0); background: transparent; color: inherit; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-family: ui-monospace, monospace; }
.ta2-ok { color: #009273; font-size: 12px; }
.ta2-err { color: #d03050; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
.ta2-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
.ta2-badge.on { background: rgba(0,146,115,.14); color: #009273; }
.ta2-badge.off { background: rgba(208,48,80,.12); color: #d03050; }
.ta2-models { font-size: 11px; opacity: .65; line-height: 1.7; }
.ta2-warn { font-size: 11px; opacity: .7; line-height: 1.6; border-left: 2px solid #d89b00; padding-left: 10px; }

/* ── composer readout: compact chip left of the model selector ───────── */
.ta2-pill { position: relative; display: inline-flex; align-items: center; }
/* Sized to sit in the composer tool row alongside the model selector: same
   height rhythm, muted until hovered, no border so it does not read as a
   second button competing with the picker. */
.ta2-pill-btn { display: inline-flex; align-items: center; border: 0; background: transparent; color: inherit; font: inherit; font-size: 12px; line-height: 1; opacity: .68; padding: 5px 8px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
.ta2-pill-btn:hover { opacity: 1; background: rgba(127,127,127,.14); }
.ta2-pill-btn[aria-expanded="true"] { opacity: 1; background: rgba(127,127,127,.14); }
.ta2-pill-sep { opacity: .38; margin: 0 5px; }
.ta2-pill-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.ta2-pill-dot.ok { background: #009273; }
.ta2-pill-dot.warn { background: #d89b00; }
.ta2-pill-dot.err { background: #d03050; }
.ta2-pill-num { font-variant-numeric: tabular-nums; font-weight: 600; }
.ta2-panel { position: fixed; z-index: 2147483000; min-width: 320px; max-width: 380px; background: var(--dsw-alias-bg-elevated, #fff); color: var(--dsw-alias-label-primary, #1a1a1a); border: 1px solid var(--dsw-alias-border-default, #e0e0e0); border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.18); padding: 12px 14px; font-size: 12px; display: flex; flex-direction: column; gap: 9px; }
.ta2-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 600; font-size: 13px; }
.ta2-panel-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ta2-panel-refresh { border: 1px solid var(--dsw-alias-border-default, #d0d0d0); background: transparent; color: inherit; border-radius: 6px; padding: 3px 9px; font-size: 11px; cursor: pointer; }
.ta2-panel-refresh:hover { background: rgba(127,127,127,.1); }
.ta2-panel-refresh:disabled { opacity: .45; cursor: not-allowed; }
.ta2-panel-table { width: 100%; border-collapse: collapse; }
.ta2-panel-table th { text-align: left; font-weight: 500; font-size: 11px; opacity: .6; padding: 3px 0; border-bottom: 1px solid var(--dsw-alias-border-default, #ececec); }
.ta2-panel-table th.num { text-align: right; }
.ta2-panel-table td { padding: 7px 0; border-bottom: 1px solid var(--dsw-alias-border-default, #f2f2f2); vertical-align: top; }
.ta2-panel-table td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
.ta2-panel-name { display: flex; flex-direction: column; gap: 2px; }
.ta2-panel-current { color: #009273; font-size: 11px; }
.ta2-panel-meta { font-size: 11px; opacity: .62; line-height: 1.6; }
.ta2-panel-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; opacity: .62; }
.ta2-panel-err { color: #d03050; font-size: 11px; }
`;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return () => {};
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
  return () => el.remove();
}

function TeleagentPage({ rpcCall }) {
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [balance, setBalance] = useState(null);
  const [checkin, setCheckin] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [callback, setCallback] = useState('');

  const run = useCallback(async (key, method, payload) => {
    setBusy(key); setError(''); setNotice('');
    try { return await rpcCall(method, payload ?? {}); }
    catch (e) { setError(e.message || String(e)); return undefined; }
    finally { setBusy(''); }
  }, [rpcCall]);

  const refresh = useCallback(async () => {
    const s = await run('status', 'status');
    if (s) { setStatus(s); setModels(s.models ?? []); }
  }, [run]);

  useEffect(() => { refresh(); }, [refresh]);

  const doLogin = async () => {
    const r = await run('login', 'login.submit', { input: callback.trim() });
    if (r) { setNotice(`登录成功：${r.nickname || r.accountId}`); setCallback(''); await refresh(); }
  };
  const openLogin = async () => {
    const r = await run('url', 'login.url');
    if (r?.url) window.open(r.url, '_blank', 'noopener');
  };
  const doRepair = async () => {
    const r = await run('repair', 'credential.repair');
    if (r) { setNotice(r.unchanged ? '凭据已完整，无需修复' : '已补齐 installId / deviceId'); await refresh(); }
  };
  const doBalance = async () => { const r = await run('balance', 'credits.balance'); if (r) setBalance(r); };
  const doStatus = async () => { const r = await run('checkin', 'credits.status'); if (r) setCheckin(r); };
  const doClaim = async () => {
    const r = await run('claim', 'credits.claim');
    if (r) {
      setNotice(r.claimed ? '今日积分已领取（或此前已领）' : '领取后状态未变更，可能今日无可用签到');
      setCheckin((prev) => ({ ...(prev ?? {}), ...r }));
    }
  };

  const logged = status?.loggedIn;

  return jsxs('div', { className: 'ta2-page', children: [
    jsxs('div', { children: [
      jsx('h2', { className: 'ta2-title', children: 'TeleAgent · 星辰超级智能体' }),
      jsx('p', { className: 'ta2-sub', children: '独立插件 · v1 网关签名（两轮 HMAC-SHA256 / JWT 签名段为密钥）。复用已有登录凭据，装好即用。' }),
    ] }),

    jsxs('div', { className: 'ta2-card', children: [
      jsxs('div', { className: 'ta2-row', children: [
        jsx('span', { className: 'ta2-label', children: '登录状态' }),
        jsx('span', { className: `ta2-badge ${logged ? 'on' : 'off'}`, children: logged ? '已登录' : '未登录' }),
        status?.nickname && jsx('span', { className: 'ta2-value', children: status.nickname }),
        status?.expired && jsx('span', { className: 'ta2-err', children: '凭据已过期' }),
      ] }),
      logged && jsxs('div', { className: 'ta2-row', children: [
        jsx('span', { className: 'ta2-label', children: '凭据完整度' }),
        jsx('span', { className: 'ta2-value', children: `installId ${status.hasInstallId ? '✓' : '✗'} · deviceId ${status.hasDeviceId ? '✓' : '✗'}` }),
      ] }),
      status?.expiresAt && jsx('div', { className: 'ta2-row', children: [
        jsx('span', { className: 'ta2-label', children: '有效期至' }),
        jsx('span', { className: 'ta2-value', children: new Date(status.expiresAt).toLocaleString() }),
      ] }),
      jsxs('div', { className: 'ta2-row', children: [
        jsx('button', { className: 'ta2-btn', disabled: !!busy, onClick: refresh, children: '刷新状态' }),
        jsx('button', { className: 'ta2-btn', disabled: !!busy, onClick: openLogin, children: '打开官方登录页' }),
        jsx('button', { className: 'ta2-btn', disabled: !!busy, onClick: doRepair, children: '修复凭据' }),
      ] }),
    ] }),

    jsxs('div', { className: 'ta2-card', children: [
      jsx('div', { className: 'ta2-sub', children: '在官方页面登录后，把回调 URL / deeplink / token 粘贴到这里（仅首次或凭据过期时需要）。' }),
      jsxs('div', { className: 'ta2-row', children: [
        jsx('input', { className: 'ta2-input', value: callback, placeholder: 'https://… 或 <tenant>:eyJ…', onChange: (e) => setCallback(e.target.value) }),
        jsx('button', { className: 'ta2-btn primary', disabled: !!busy || !callback.trim(), onClick: doLogin, children: '提交登录' }),
      ] }),
    ] }),

    jsxs('div', { className: 'ta2-card', children: [
      jsx('div', { className: 'ta2-label', children: '积分 / 每日签到' }),
      jsxs('div', { className: 'ta2-row', children: [
        jsx('button', { className: 'ta2-btn', disabled: !!busy || !logged, onClick: doBalance, children: '查询余额' }),
        jsx('button', { className: 'ta2-btn', disabled: !!busy || !logged, onClick: doStatus, children: '签到状态' }),
        jsx('button', { className: 'ta2-btn', disabled: !!busy || !logged, onClick: doClaim, children: '一键领取积分' }),
      ] }),
      balance !== null && jsxs('div', { className: 'ta2-row', children: [
        jsx('span', { className: 'ta2-label', children: '积分余额' }),
        jsx('span', { className: 'ta2-value', children: balance.balance === undefined ? '接口未返回数值' : `${balance.balance} 分` }),
        balance.plan && jsx('span', { className: 'ta2-value', children: `${balance.plan}` }),
      ] }),
      checkin !== null && jsxs('div', { className: 'ta2-row', children: [
        jsx('span', { className: 'ta2-label', children: '今日签到' }),
        jsx('span', { className: 'ta2-value', children: checkin.claimed ? `已领${checkin.buttonText ? `（${checkin.buttonText}）` : ''}` : '未领取' }),
        jsx('span', { className: 'ta2-value', children: `每日可领 ${checkin.dailyClaimablePoints} 分 · 累计 ${checkin.totalClaimDays} 天 / ${checkin.totalClaimedPoints} 分` }),
      ] }),
      checkin?.activityTitle && jsx('div', { className: 'ta2-models', children: `活动：${checkin.activityTitle}` }),
    ] }),

    jsxs('div', { className: 'ta2-card', children: [
      jsx('div', { className: 'ta2-label', children: `可用模型（${models.length}）` }),
      jsx('div', { className: 'ta2-models', children: models.map((m) => `${m.name} (${m.id})`).join(' · ') || '加载中…' }),
    ] }),

    error && jsx('div', { className: 'ta2-err', children: error }),
    notice && jsx('div', { className: 'ta2-ok', children: notice }),
    jsx('div', { className: 'ta2-warn', children: '⚠️ 风控提示：该网关有服务端风控（40105 疑似攻击 → 40109 账号级封禁，官方 App 也会失效）。请勿高频请求、并发或用它做压测；出现 40105 立即停用。本插件已把签名算法一次算对，不做任何试探性请求。' }),
  ] });
}

/**
 * The composer readout: a compact inline chip in the composer tool row, sitting
 * immediately BEFORE the model selector. Shows the account's points and opens a
 * panel with the account row + balance.
 *
 * Seat choice — `conversation.input.right` (list, session scope) renders in the
 * same `standardControls` row as `conversation.input.model`, directly before it:
 *
 *     [ …input.right entries ] [ model selector ] [ submit ]
 *
 * so entries there land immediately left of the model name. `order` puts us
 * after nothing else (the seat has no other occupants), and the seat is
 * `replaceRisk: none`, i.e. purely additive.
 *
 * Two pieces make this safe to register unconditionally:
 *  1. `useProjection('modelSelection')` tells us which provider the session is
 *     pointed at; we render nothing unless it is `teleagent`. `next` wins over
 *     `lastUsed` because a landed-but-unsent switch is already what the
 *     composer displays.
 *  2. Nothing is fetched until the chip is actually shown, so sessions using
 *     other providers cost zero requests.
 */
function TeleagentComposerPill({ rpcCall, useProjection, sessionId }) {
  const projection = typeof useProjection === 'function' ? useProjection('modelSelection') : undefined;
  const selected = projection?.next ?? projection?.lastUsed;
  const owned = selected?.provider === PROVIDER;

  const [status, setStatus] = useState(null);
  const [balance, setBalance] = useState(null);
  const [checkin, setCheckin] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);
  const rootRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const [pos, setPos] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [s, b, c] = await Promise.all([
        rpcCall('status'), rpcCall('credits.balance'), rpcCall('credits.status'),
      ]);
      setStatus(s); setBalance(b); setCheckin(c);
      setFailed(false); setLastRefresh(Date.now());
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }, [rpcCall]);

  // Fetch only while the pill is on screen for this provider.
  useEffect(() => {
    if (!owned) return undefined;
    let alive = true;
    load().catch(() => {});
    const timer = setInterval(() => { if (alive) load().catch(() => {}); }, 120_000);
    return () => { alive = false; clearInterval(timer); };
  }, [owned, load]);

  // Anchor the popover to the chip: prefer ABOVE (the tool row sits at the
  // bottom of the composer), fall back to BELOW when there is not enough room,
  // and clamp horizontally into the viewport.
  React.useLayoutEffect(() => {
    if (!open || !rootRef.current) { setPos(null); return; }
    const r = rootRef.current.getBoundingClientRect();
    const height = panelRef.current?.offsetHeight ?? 240;
    const width = panelRef.current?.offsetWidth ?? 340;
    const margin = 12;
    const gap = 8;
    const above = r.top - height - gap;
    const top = above >= margin ? above : Math.min(r.bottom + gap, window.innerHeight - height - margin);
    const left = Math.min(Math.max(margin, r.left), Math.max(margin, window.innerWidth - width - margin));
    setPos({ top, left });
  }, [open, balance, checkin, status]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t) === true || panelRef.current?.contains(t) === true) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!owned) return null;

  const total = balance?.balance;
  const valueText = total === undefined ? '—' : formatCredits(total);
  const dotClass = failed ? 'err' : total === undefined ? 'warn' : 'ok';
  const nickname = status?.nickname ?? 'TeleAgent';

  return jsxs('span', { ref: rootRef, className: 'ta2-pill', children: [
    jsxs('button', {
      type: 'button',
      className: 'ta2-pill-btn',
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
      title: failed ? '积分读取失败（点击重试）' : `${nickname} · 积分 ${valueText}（点击查看账号）`,
      onClick: () => setOpen((v) => !v),
      children: [
        jsx('span', { className: `ta2-pill-dot ${dotClass}` }),
        jsx('span', { className: 'ta2-pill-num', children: valueText }),
        jsx('span', { className: 'ta2-pill-sep', children: '·' }),
        jsx('span', { children: nickname }),
      ],
    }),
    open && pos && createPortal(
      jsxs('div', {
        ref: panelRef,
        className: 'ta2-panel',
        role: 'dialog',
        style: { top: `${pos.top}px`, left: `${pos.left}px` },
        children: [
          jsxs('div', { className: 'ta2-panel-head', children: [
            jsx('span', { className: 'ta2-panel-title', children: nickname }),
            jsx('button', {
              type: 'button',
              className: 'ta2-panel-refresh',
              disabled: busy,
              onClick: () => { load().catch(() => {}); },
              children: busy ? '刷新中…' : '一键刷新',
            }),
          ] }),
          jsxs('table', { className: 'ta2-panel-table', children: [
            jsx('thead', { children: jsxs('tr', { children: [
              jsx('th', { children: '账号' }),
              jsx('th', { className: 'num', children: '积分' }),
            ] }) }),
            jsx('tbody', { children: jsx('tr', { children: [
              jsxs('td', { children: [
                jsx('div', { className: 'ta2-panel-name', children: [
                  jsx('span', { children: nickname }),
                  jsx('span', { className: 'ta2-panel-current', children: '当前选用' }),
                ] }),
              ] }),
              jsx('td', { className: 'num', children: valueText }),
            ] }) }),
          ] }),
          balance?.plan && jsxs('div', { className: 'ta2-panel-meta', children: [
            '套餐：', balance.plan,
          ] }),
          checkin && jsxs('div', { className: 'ta2-panel-meta', children: [
            checkin.claimed ? '今日已签到' : '今日未签到',
            ` · 每日可领 ${checkin.dailyClaimablePoints ?? 0} 分`,
            ` · 累计 ${checkin.totalClaimDays ?? 0} 天 / ${checkin.totalClaimedPoints ?? 0} 分`,
          ] }),
          checkin?.activityTitle && jsxs('div', { className: 'ta2-panel-meta', children: ['活动：', checkin.activityTitle] }),
          failed && jsx('div', { className: 'ta2-panel-err', children: '积分读取失败，请稍后重试' }),
          jsxs('div', { className: 'ta2-panel-foot', children: [
            jsx('span', { children: lastRefresh ? `最近刷新 ${formatClock(lastRefresh)}` : '尚未刷新' }),
            status?.expiresAt ? jsx('span', { children: `至 ${new Date(status.expiresAt).toLocaleDateString()}` }) : null,
          ] }),
        ],
      }),
      document.body,
    ),
  ] });
}

function formatCredits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatClock(ms) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

export const name = 'teleagent-connect-client';
export const inject = ['slots', 'connection'];

/**
 * Register a list-slot entry at most ONCE per id.
 *
 * `conversation.input.right` is a `scope: 'session'` list slot, and
 * `ctx.slots.inject(name, factory)` may materialize the factory more than once
 * (e.g. once per live session scope). Registering straight from inside that
 * callback therefore produced N identical chips — the reported symptom was
 * THREE `· TeleAgent` readouts side by side in one composer row.
 *
 * The disposer is kept so a genuine re-apply (plugin fiber restart) can
 * re-register cleanly, while duplicate invocations inside one apply are ignored.
 */
function registerOnce(ctx, slotName, options, Component) {
  const live = new Map();
  return ctx.slots.inject(slotName, () => {
    if (live.has(options.id)) return live.get(options.id);
    const dispose = ctx.slots.register(options, Component);
    live.set(options.id, dispose);
    return dispose;
  });
}

export function apply(ctx) {
  ctx.effect(() => installStyles(), 'teleagent-connect: install styles');
  const rpcCall = async (method, payload, signal) =>
    unwrap(await callRpc(ctx.connection, method, payload, signal));
  registerOnce(ctx, 'settings.section', {
    name: 'settings.section',
    id: 'teleagent-connect',
    order: 51,
    label: () => 'TeleAgent',
    inject: () => ({ rpcCall }),
  }, TeleagentPage);

  // The readout in the composer tool row, immediately BEFORE the model selector
  // (both live in the same `standardControls` row). `registerOnce` keeps it to a
  // single chip even when the session-scoped factory runs several times; the
  // component itself hides unless this session is pointed at `teleagent`.
  registerOnce(ctx, 'conversation.input.right', {
    name: 'conversation.input.right',
    id: 'teleagent-connect-credits',
    order: 0,
    inject: () => ({ rpcCall }),
  }, TeleagentComposerPill);
}
