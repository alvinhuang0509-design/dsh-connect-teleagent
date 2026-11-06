// TeleAgent client: composer readout + settings panel.
// Bundled to lib/client.js by scripts/build-client.mjs.
//
// THEME CONTRACT: every colour that must follow the app theme is taken from a
// host `--dsw-alias-*` token that actually exists. The previous build used
// `--dsw-alias-bg-elevated` / `--dsw-alias-border-default`, which the host does
// not define — the background silently fell back to hard-coded white while the
// text token (`--dsw-alias-label-primary`) resolved to the dark theme's light
// grey. The popover rendered as light text on a white card: effectively blank.
// Text therefore inherits (correct in both themes) and only surfaces that have
// a verified token set one.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { jsx, jsxs } from 'react/jsx-runtime';

const PROVIDER = 'teleagent';

// The client calls connection.rpc.call("/api", "teleagent-connect", {...}),
// which POSTs to "/api/teleagent-connect" — matching lib/rpc.js's fetch path.
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
/* ── shared ───────────────────────────────────────────────────────────── */
.t2-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.32)); background: transparent; color: inherit; border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 12px; line-height: 1.2; cursor: pointer; transition: background .12s ease, border-color .12s ease; }
.t2-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.t2-btn:disabled { opacity: .45; cursor: not-allowed; }
.t2-btn.primary { background: var(--dsw-alias-brand-primary, #4d6bfe); border-color: transparent; color: #fff; font-weight: 500; }
.t2-btn.primary:hover:not(:disabled) { filter: brightness(1.06); }
.t2-btn.ghost { border-color: transparent; padding: 4px 8px; }
.t2-input { flex: 1; min-width: 0; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.32)); background: var(--dsw-alias-bg-layer-2, transparent); color: inherit; border-radius: 8px; padding: 7px 10px; font: inherit; font-size: 12px; }
.t2-input:focus { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: -1px; }
.t2-muted { color: var(--dsw-alias-label-secondary, inherit); font-size: 11px; line-height: 1.65; }
.t2-dim { color: var(--dsw-alias-label-tertiary, inherit); font-size: 11px; }
.t2-err { color: var(--dsw-alias-state-error-primary, #d03050); font-size: 11px; line-height: 1.6; }
.t2-ok { color: var(--dsw-alias-state-success-primary, #009273); font-size: 11px; }

/* ── settings page ────────────────────────────────────────────────────── */
.t2-page { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; max-width: 720px; }
.t2-h1 { font-size: 17px; font-weight: 600; margin: 0; }
.t2-card { border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.28)); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.t2-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.t2-key { font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); min-width: 84px; }
.t2-val { font-size: 13px; font-weight: 500; }
.t2-badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; font-size: 11px; }
.t2-badge.on { background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #009273) 14%, transparent); color: var(--dsw-alias-state-success-primary, #009273); }
.t2-badge.off { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d89b00) 16%, transparent); color: var(--dsw-alias-state-warn-primary, #a06b00); }
.t2-note { border-left: 2px solid var(--dsw-alias-state-warn-primary, #d89b00); padding-left: 10px; }

/* ── composer readout chip ────────────────────────────────────────────── */
.t2-pill { position: relative; display: inline-flex; align-items: center; }
.t2-chip { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: inherit; font: inherit; font-size: 12px; line-height: 1; opacity: .7; padding: 5px 8px; border-radius: 8px; cursor: pointer; white-space: nowrap; transition: opacity .12s ease, background .12s ease; }
.t2-chip:hover { opacity: 1; background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.t2-chip[aria-expanded="true"] { opacity: 1; background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.t2-chip.attention { opacity: 1; }
.t2-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.t2-dot.ok { background: var(--dsw-alias-state-success-primary, #009273); }
.t2-dot.warn { background: var(--dsw-alias-state-warn-primary, #d89b00); }
.t2-dot.err { background: var(--dsw-alias-state-error-primary, #d03050); }
.t2-dot.idle { background: var(--dsw-alias-label-tertiary, #999); }
.t2-num { font-variant-numeric: tabular-nums; font-weight: 600; }
.t2-sep { opacity: .4; }

/* ── popover ──────────────────────────────────────────────────────────── */
.t2-pop { position: fixed; z-index: 2147483000; width: 336px; box-sizing: border-box; background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base, #fff)); color: inherit; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3)); border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.22); padding: 12px 14px 10px; font-size: 12px; display: flex; flex-direction: column; gap: 10px; }
.t2-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.t2-pop-id { display: flex; align-items: center; gap: 7px; min-width: 0; }
.t2-pop-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.t2-pop-sub { font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.t2-pop-body { display: flex; flex-direction: column; gap: 8px; }
.t2-metrics { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: baseline; }
.t2-metrics .k { font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); white-space: nowrap; }
.t2-metrics .v { font-size: 12px; font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; }
.t2-hero { display: flex; flex-direction: column; gap: 2px; }
.t2-hero-num { font-size: 22px; font-weight: 650; line-height: 1.15; font-variant-numeric: tabular-nums; }
.t2-hero-unit { font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); }
.t2-divider { height: 1px; background: var(--dsw-alias-border-l1, rgba(127,127,127,.2)); margin: 2px 0; }
.t2-empty { display: flex; flex-direction: column; gap: 7px; padding: 2px 0 4px; }
.t2-empty-title { font-size: 12px; font-weight: 600; }
.t2-skel { height: 12px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.16)); animation: t2-pulse 1.4s ease-in-out infinite; }
@keyframes t2-pulse { 0%,100% { opacity: .45 } 50% { opacity: .85 } }
.t2-login { display: flex; gap: 6px; }
.t2-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-tertiary, inherit); }
`;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return () => {};
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
  return () => el.remove();
}

function formatCredits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function formatTokens(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}
function formatClock(ms) {
  try { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

/**
 * Read the account state, then the credit figures ONLY when signed in.
 *
 * `status` is fetched alone on purpose: it is the one call that always answers,
 * and the previous build lost it by bundling everything into a single
 * `Promise.all` that `credits.balance` rejected (the service throws
 * "未登录" with no credential). The panel then showed a blank account name
 * next to a red "积分读取失败" on machines that simply had not logged in yet.
 */
function useAccountState(rpcCall, active) {
  const [status, setStatus] = useState(null);
  const [balance, setBalance] = useState(null);
  const [checkin, setCheckin] = useState(null);
  const [problem, setProblem] = useState(null); // 'signed-out' | 'failed' | null
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(0);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const s = await rpcCall('status');
      setStatus(s);
      if (!s?.loggedIn) {
        setBalance(null); setCheckin(null);
        setProblem('signed-out');
        return;
      }
      const [b, c] = await Promise.all([
        rpcCall('credits.balance').catch(() => null),
        rpcCall('credits.status').catch(() => null),
      ]);
      setBalance(b); setCheckin(c);
      setProblem(b === null ? 'failed' : null);
    } catch {
      setProblem('failed');
    } finally {
      setBusy(false); setLoaded(true); setRefreshedAt(Date.now());
    }
  }, [rpcCall]);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    load().catch(() => {});
    const timer = setInterval(() => { if (alive) load().catch(() => {}); }, 120_000);
    return () => { alive = false; clearInterval(timer); };
  }, [active, load]);

  return { status, balance, checkin, problem, busy, loaded, refreshedAt, load };
}

/** Chip + popover live in the composer tool row, immediately before the model picker. */
function TeleagentChip({ rpcCall, useProjection }) {
  const projection = typeof useProjection === 'function' ? useProjection('modelSelection') : undefined;
  const selected = projection?.next ?? projection?.lastUsed;
  const owned = selected?.provider === PROVIDER;

  const state = useAccountState(rpcCall, owned);
  const { status, balance, checkin, problem, busy, loaded, refreshedAt, load } = state;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [callback, setCallback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const rootRef = useRef(null);
  const popRef = useRef(null);

  // Anchor above the chip; fall below when the composer sits high on screen.
  React.useLayoutEffect(() => {
    if (!open || !rootRef.current) { setPos(null); return; }
    const r = rootRef.current.getBoundingClientRect();
    const h = popRef.current?.offsetHeight ?? 260;
    const w = popRef.current?.offsetWidth ?? 336;
    const gap = 8, margin = 12;
    const above = r.top - h - gap;
    const top = above >= margin ? above : Math.min(r.bottom + gap, window.innerHeight - h - margin);
    const left = Math.min(Math.max(margin, r.left), Math.max(margin, window.innerWidth - w - margin));
    setPos({ top, left });
  }, [open, balance, checkin, problem, notice, formError]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t) === true || popRef.current?.contains(t) === true) return;
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

  const signedOut = problem === 'signed-out';
  const total = balance?.balance;
  const nickname = status?.nickname;
  // The tier the session is pointed at, from the catalogue `status` returns.
  const modelRow = status?.models?.find((m) => m.id === selected?.model);

  // Chip copy is the whole readout when collapsed, so it states the situation
  // rather than a bare placeholder: "登录 TeleAgent" is an invitation, "—" was
  // a shrug the user could not act on.
  let chipText;
  let dot;
  if (signedOut) { chipText = '登录 TeleAgent'; dot = 'warn'; }
  else if (!loaded) { chipText = '读取中'; dot = 'idle'; }
  else if (problem === 'failed') { chipText = '读取失败'; dot = 'err'; }
  else if (total === undefined) { chipText = '—'; dot = 'warn'; }
  else { chipText = formatCredits(total); dot = 'ok'; }

  const openLoginPage = async () => {
    setFormError(''); setNotice('');
    try {
      const r = await rpcCall('login.url');
      if (r?.url) window.open(r.url, '_blank', 'noopener');
      else setFormError('未能获取登录页地址');
    } catch (e) { setFormError(e.message || String(e)); }
  };

  const submitLogin = async () => {
    const input = callback.trim();
    if (!input) return;
    setSubmitting(true); setFormError(''); setNotice('');
    try {
      const r = await rpcCall('login.submit', { input });
      setCallback('');
      setNotice(`已登录：${r.nickname || r.accountId}`);
      await load();
    } catch (e) {
      setFormError(e.message || String(e));
    } finally { setSubmitting(false); }
  };

  // Three exclusive panel bodies, written as plain branches: the signed-out
  // invite, a loading skeleton, and the account readout.
  let body;
  if (signedOut) {
    body = jsxs('div', { className: 't2-empty', children: [
      jsx('div', { className: 't2-empty-title', children: '这台机器还没有登录 TeleAgent' }),
      jsx('div', { className: 't2-muted', children: '登录后即可查看积分、每日签到，并直接用它对话。' }),
      jsx('div', { className: 't2-login', children:
        jsx('button', { type: 'button', className: 't2-btn', onClick: openLoginPage, children: '打开官方登录页' }),
      }),
      jsxs('div', { className: 't2-login', children: [
        jsx('input', {
          className: 't2-input',
          value: callback,
          placeholder: '粘贴回调地址或 token',
          spellCheck: false,
          onChange: (e) => setCallback(e.target.value),
          onKeyDown: (e) => {
            // Keep Enter inside the form instead of letting the composer send.
            if (e.key === 'Enter') { e.preventDefault(); submitLogin(); }
            e.stopPropagation();
          },
        }),
        jsx('button', {
          type: 'button',
          className: 't2-btn primary',
          disabled: submitting || !callback.trim(),
          onClick: submitLogin,
          children: submitting ? '登录中…' : '登录',
        }),
      ] }),
      jsx('div', { className: 't2-dim', children: '在登录页完成授权后，把地址栏里那条带 token 的链接复制过来即可。' }),
    ] });
  } else if (!loaded) {
    body = jsxs('div', { className: 't2-pop-body', children: [
      jsx('div', { className: 't2-skel', style: { width: '60%' } }),
      jsx('div', { className: 't2-skel', style: { width: '85%', marginTop: 8 } }),
      jsx('div', { className: 't2-skel', style: { width: '45%', marginTop: 8 } }),
    ] });
  } else {
    const rows = [];
    if (modelRow?.contextWindow) {
      rows.push(
        jsx('span', { className: 'k', key: 'k-ctx', children: '上下文' }),
        jsx('span', { className: 'v', key: 'v-ctx', children: formatTokens(modelRow.contextWindow) }),
      );
    }
    if (balance?.plan) rows.push(jsx('span', { className: 'k', key: 'k-plan', children: '套餐' }), jsx('span', { className: 'v', key: 'v-plan', children: balance.plan }));
    if (checkin) {
      rows.push(
        jsx('span', { className: 'k', key: 'k-checkin', children: '今日签到' }),
        jsx('span', {
          className: 'v', key: 'v-checkin',
          children: checkin.claimed
            ? `已领 ${checkin.dailyClaimablePoints ?? 0} 分`
            : `未领 · 可领 ${checkin.dailyClaimablePoints ?? 0} 分`,
        }),
        jsx('span', { className: 'k', key: 'k-total', children: '累计' }),
        jsx('span', {
          className: 'v', key: 'v-total',
          children: `${checkin.totalClaimDays ?? 0} 天 / ${formatCredits(checkin.totalClaimedPoints ?? 0)} 分`,
        }),
      );
    }
    body = jsxs('div', { className: 't2-pop-body', children: [
      total !== undefined
        ? jsxs('div', { className: 't2-hero', children: [
          jsx('div', { className: 't2-hero-num', children: formatCredits(total) }),
          jsx('div', { className: 't2-hero-unit', children: '积分余额' }),
        ] })
        : jsxs('div', { className: 't2-metrics', children: [
          jsx('span', { className: 'k', children: '积分' }),
          jsx('span', { className: 'v', children: '读取失败' }),
        ] }),
      rows.length ? jsx('div', { className: 't2-metrics', children: rows }) : null,
      checkin?.activityTitle
        ? jsx('div', { className: 't2-dim', children: `活动：${checkin.activityTitle}` })
        : null,
      problem === 'failed' && jsx('div', { className: 't2-err', children: '积分读取失败，请点右上角刷新重试' }),
      status?.expired && jsx('div', { className: 't2-err', children: '登录已过期，请重新登录' }),
    ] });
  }

  return jsxs('span', { ref: rootRef, className: 't2-pill', children: [
    jsxs('button', {
      type: 'button',
      className: `t2-chip${signedOut ? ' attention' : ''}`,
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
      title: signedOut ? '点击登录 TeleAgent' : '点击查看 TeleAgent 账号',
      onClick: () => setOpen((v) => !v),
      children: [
        jsx('span', { className: `t2-dot ${dot}` }),
        dot === 'ok' ? jsx('span', { className: 't2-num', children: chipText }) : jsx('span', { children: chipText }),
        !signedOut && nickname
          ? [jsx('span', { className: 't2-sep', key: 'sep', children: '·' }), jsx('span', { key: 'nick', children: nickname })]
          : null,
      ],
    }),
    open && pos && createPortal(
      jsxs('div', {
        ref: popRef,
        className: 't2-pop',
        role: 'dialog',
        style: { top: `${pos.top}px`, left: `${pos.left}px` },
        onKeyDown: (e) => e.stopPropagation(),
        children: [
          jsxs('div', { className: 't2-pop-head', children: [
            jsxs('div', { className: 't2-pop-id', children: [
              jsx('span', { className: `t2-dot ${dot}` }),
              jsxs('div', { style: { minWidth: 0 }, children: [
                jsx('div', { className: 't2-pop-name', children: 'TeleAgent' }),
                jsx('div', { className: 't2-pop-sub', children: signedOut
                  ? '未登录 · 星辰超级智能体'
                  : (nickname ? `${nickname} · 当前选用` : '星辰超级智能体') }),
              ] }),
            ] }),
            jsx('button', {
              type: 'button',
              className: 't2-btn ghost',
              disabled: busy,
              onClick: () => { setNotice(''); load().catch(() => {}); },
              children: busy ? '刷新中…' : '刷新',
            }),
          ] }),
          jsx('div', { className: 't2-divider' }),
          body,
          notice && jsx('div', { className: 't2-ok', children: notice }),
          formError && jsx('div', { className: 't2-err', children: formError }),
          jsxs('div', { className: 't2-foot', children: [
            jsx('span', { children: refreshedAt ? `更新于 ${formatClock(refreshedAt)}` : '尚未读取' }),
            status?.expiresAt
              ? jsx('span', { children: `凭据至 ${new Date(status.expiresAt).toLocaleDateString()}` })
              : null,
          ] }),
        ],
      }),
      document.body,
    ),
  ] });
}

/** Settings page: the same state, laid out as a card, plus recovery actions. */
function TeleagentPage({ rpcCall }) {
  const state = useAccountState(rpcCall, true);
  const { status, balance, checkin, problem, busy, load } = state;

  const [models, setModels] = useState([]);
  const [config, setConfig] = useState(null);
  const [ctxDraft, setCtxDraft] = useState('');
  const [savingCtx, setSavingCtx] = useState(false);
  const [callback, setCallback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [s, c] = await Promise.all([
        rpcCall('status').catch(() => null),
        rpcCall('config.get').catch(() => null),
      ]);
      if (s) setModels(s.models ?? []);
      if (c) { setConfig(c); setCtxDraft(String(c.contextWindow)); }
    } catch { /* the shared loader reports failures */ }
  }, [rpcCall]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn) => {
    setError(''); setNotice('');
    try { await fn(); }
    catch (e) { setError(e.message || String(e)); }
  };

  const openLogin = () => run(async () => {
    const r = await rpcCall('login.url');
    if (r?.url) window.open(r.url, '_blank', 'noopener');
  });

  const doLogin = async () => {
    const input = callback.trim();
    if (!input) return;
    setSubmitting(true); setError(''); setNotice('');
    try {
      const r = await rpcCall('login.submit', { input });
      setCallback('');
      setNotice(`登录成功：${r.nickname || r.accountId}`);
      await load();
    } catch (e) { setError(e.message || String(e)); }
    finally { setSubmitting(false); }
  };

  const doRepair = () => run(async () => {
    const r = await rpcCall('credential.repair');
    setNotice(r?.unchanged ? '凭据已完整，无需修复' : '已补齐 installId / deviceId');
    await load();
  });

  const saveContext = async () => {
    const value = Number(ctxDraft);
    const bounds = config?.limits?.contextWindow;
    if (!Number.isFinite(value)) { setError('上下文大小需要是一个数字'); return; }
    if (bounds && (value < bounds.min || value > bounds.max)) {
      setError(`上下文大小需在 ${formatTokens(bounds.min)} 到 ${formatTokens(bounds.max)} 之间`);
      return;
    }
    setSavingCtx(true); setError(''); setNotice('');
    try {
      const next = await rpcCall('config.set', { contextWindow: Math.round(value) });
      setConfig({ ...(config ?? {}), ...next });
      setCtxDraft(String(next.contextWindow));
      setNotice(`上下文大小已设为 ${formatTokens(next.contextWindow)}，下一个请求生效`);
      await refresh();
    } catch (e) { setError(e.message || String(e)); }
    finally { setSavingCtx(false); }
  };

  const doClaim = () => run(async () => {
    const r = await rpcCall('credits.claim');
    setNotice(r?.claimed ? '今日积分已领取（或此前已领）' : '领取后状态未变更，可能今日无可用签到');
    await load();
  });

  const logged = status?.loggedIn;

  return jsxs('div', { className: 't2-page', children: [
    jsxs('div', { children: [
      jsx('h2', { className: 't2-h1', children: 'TeleAgent · 星辰超级智能体' }),
      jsx('p', { className: 't2-muted', children: '中国电信天翼 AI。使用 v1 云网关签名（两轮 HMAC-SHA256），复用本机已有的登录凭据。' }),
    ] }),

    jsxs('div', { className: 't2-card', children: [
      jsxs('div', { className: 't2-row', children: [
        jsx('span', { className: 't2-key', children: '登录状态' }),
        jsx('span', { className: `t2-badge ${logged ? 'on' : 'off'}`, children: logged ? '已登录' : '未登录' }),
        status?.nickname && jsx('span', { className: 't2-val', children: status.nickname }),
        status?.expired && jsx('span', { className: 't2-err', children: '凭据已过期，请重新登录' }),
      ] }),
      logged && jsxs('div', { className: 't2-row', children: [
        jsx('span', { className: 't2-key', children: '凭据完整度' }),
        jsx('span', { className: 't2-val', children: `installId ${status.hasInstallId ? '✓' : '✗'} · deviceId ${status.hasDeviceId ? '✓' : '✗'}` }),
      ] }),
      status?.expiresAt && jsxs('div', { className: 't2-row', children: [
        jsx('span', { className: 't2-key', children: '有效期至' }),
        jsx('span', { className: 't2-val', children: new Date(status.expiresAt).toLocaleString() }),
      ] }),
      jsxs('div', { className: 't2-row', children: [
        jsx('button', { className: 't2-btn', disabled: busy, onClick: () => { load().catch(() => {}); }, children: busy ? '刷新中…' : '刷新' }),
        jsx('button', { className: 't2-btn', onClick: openLogin, children: '打开官方登录页' }),
        logged && jsx('button', { className: 't2-btn', onClick: doRepair, children: '修复凭据' }),
      ] }),
    ] }),

    jsxs('div', { className: 't2-card', children: [
      jsx('div', { className: 't2-muted', children: '在官方页面完成授权后，把地址栏里带 token 的链接（或 token 本身）粘贴到下面。' }),
      jsxs('div', { className: 't2-row', children: [
        jsx('input', {
          className: 't2-input',
          value: callback,
          placeholder: 'https://… 或 <tenant>:eyJ…',
          spellCheck: false,
          onChange: (e) => setCallback(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') doLogin(); },
        }),
        jsx('button', { className: 't2-btn primary', disabled: submitting || !callback.trim(), onClick: doLogin, children: submitting ? '登录中…' : '登录' }),
      ] }),
    ] }),

    logged && jsxs('div', { className: 't2-card', children: [
      jsx('div', { className: 't2-key', children: '积分 / 每日签到' }),
      jsxs('div', { className: 't2-row', children: [
        jsx('button', { className: 't2-btn', disabled: busy, onClick: doClaim, children: '领取今日积分' }),
      ] }),
      balance && jsxs('div', { className: 't2-row', children: [
        jsx('span', { className: 't2-key', children: '积分余额' }),
        jsx('span', { className: 't2-val', children: balance.balance === undefined ? '接口未返回数值' : `${formatCredits(balance.balance)} 分` }),
        balance.plan && jsx('span', { className: 't2-muted', children: balance.plan }),
      ] }),
      checkin && jsxs('div', { className: 't2-row', children: [
        jsx('span', { className: 't2-key', children: '今日签到' }),
        jsx('span', { className: 't2-val', children: checkin.claimed ? '已领取' : '未领取' }),
        jsx('span', { className: 't2-muted', children: `每日可领 ${checkin.dailyClaimablePoints} 分 · 累计 ${checkin.totalClaimDays} 天 / ${checkin.totalClaimedPoints} 分` }),
      ] }),
      checkin?.activityTitle && jsx('div', { className: 't2-dim', children: `活动：${checkin.activityTitle}` }),
    ] }),

    jsxs('div', { className: 't2-card', children: [
      jsx('div', { className: 't2-key', children: '上下文大小' }),
      jsx('div', { className: 't2-muted', children: config
        ? `当前 ${formatTokens(config.contextWindow)}（官方客户端声明值：${formatTokens(config.defaults?.contextWindow)}）。这是给 DSH 的预算声明，不是服务端回报的上限；调大可能被服务端拒绝或截断，调小会更早触发压缩。`
        : '读取中…' }),
      jsxs('div', { className: 't2-row', children: [
        ...[100_000, 200_000, 500_000, 1_000_000].map((preset) => jsx('button', {
          key: preset,
          className: 't2-btn',
          disabled: savingCtx || config?.contextWindow === preset,
          onClick: () => setCtxDraft(String(preset)),
          children: formatTokens(preset),
        }, preset)),
      ] }),
      jsxs('div', { className: 't2-row', children: [
        jsx('input', {
          className: 't2-input',
          value: ctxDraft,
          inputMode: 'numeric',
          placeholder: '自定义，如 100000',
          onChange: (e) => setCtxDraft(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') saveContext(); },
        }),
        jsx('button', {
          className: 't2-btn primary',
          disabled: savingCtx || !String(ctxDraft).trim(),
          onClick: saveContext,
          children: savingCtx ? '保存中…' : '保存',
        }),
      ] }),
      jsx('div', { className: 't2-dim', children: `取值范围 ${formatTokens(config?.limits?.contextWindow?.min ?? 16_000)} – ${formatTokens(config?.limits?.contextWindow?.max ?? 2_000_000)}；单个模型的输出上限 ${formatTokens(config?.maxOutputTokens ?? 16_384)}。` }),
    ] }),

    jsxs('div', { className: 't2-card', children: [
      jsx('div', { className: 't2-key', children: `可用模型（${models.length}）` }),
      jsx('div', { className: 't2-dim', children: models.map((m) => `${m.name}（${m.id}）· ${formatTokens(m.contextWindow)}`).join('  ·  ') || '加载中…' }),
    ] }),

    error && jsx('div', { className: 't2-err', children: error }),
    notice && jsx('div', { className: 't2-ok', children: notice }),
    jsx('div', { className: 't2-muted t2-note', children: '风控提示：该网关有服务端风控（40105 疑似攻击 → 40109 账号级封禁，官方 App 也会失效）。请勿高频请求或并发压测；出现 40105 请立即停用。本插件签名一次算对，不做任何试探性请求。' }),
  ] });
}

/**
 * Register a slot entry at most ONCE per id.
 *
 * `conversation.input.right` is a `scope: 'session'` list slot and the host may
 * materialize its inject factory once per live session; registering straight
 * from the factory produced N identical chips in one composer row.
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

export const name = 'teleagent-connect-client';
export const inject = ['slots', 'connection'];

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
  // (both render inside the host's `standardControls` row).
  registerOnce(ctx, 'conversation.input.right', {
    name: 'conversation.input.right',
    id: 'teleagent-connect-credits',
    order: 0,
    inject: () => ({ rpcCall }),
  }, TeleagentChip);
}
