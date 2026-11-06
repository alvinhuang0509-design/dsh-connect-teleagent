window.__ModuleLoader__.load({
  id: "dsh-connect-teleagent",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugin-src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");
var import_jsx_runtime = require("react/jsx-runtime");
var PROVIDER = "teleagent";
var ENDPOINT = "teleagent-connect";
var CHANNEL = "/api";
function callRpc(connection, verb, payload, signal) {
  return connection.rpc.call(CHANNEL, ENDPOINT, { method: verb, payload }, signal);
}
function unwrap(result) {
  if (result?.ok === true) return result.value;
  if (result?.ok === false) {
    const e = new Error(result.error?.message || "TeleAgent RPC 请求失败");
    e.code = result.error?.code;
    throw e;
  }
  return result;
}
var STYLE_ID = "dsh-connect-teleagent-styles";
var CSS = `
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
.ta2-panel-empty { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; }
`;
function installStyles() {
  if (document.getElementById(STYLE_ID)) return () => {
  };
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
  return () => el.remove();
}
function TeleagentPage({ rpcCall }) {
  const [status, setStatus] = (0, import_react.useState)(null);
  const [models, setModels] = (0, import_react.useState)([]);
  const [balance, setBalance] = (0, import_react.useState)(null);
  const [checkin, setCheckin] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)("");
  const [error, setError] = (0, import_react.useState)("");
  const [notice, setNotice] = (0, import_react.useState)("");
  const [callback, setCallback] = (0, import_react.useState)("");
  const run = (0, import_react.useCallback)(async (key, method, payload) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      return await rpcCall(method, payload ?? {});
    } catch (e) {
      setError(e.message || String(e));
      return void 0;
    } finally {
      setBusy("");
    }
  }, [rpcCall]);
  const refresh = (0, import_react.useCallback)(async () => {
    const s = await run("status", "status");
    if (s) {
      setStatus(s);
      setModels(s.models ?? []);
    }
  }, [run]);
  (0, import_react.useEffect)(() => {
    refresh();
  }, [refresh]);
  const doLogin = async () => {
    const r = await run("login", "login.submit", { input: callback.trim() });
    if (r) {
      setNotice(`登录成功：${r.nickname || r.accountId}`);
      setCallback("");
      await refresh();
    }
  };
  const openLogin = async () => {
    const r = await run("url", "login.url");
    if (r?.url) window.open(r.url, "_blank", "noopener");
  };
  const doRepair = async () => {
    const r = await run("repair", "credential.repair");
    if (r) {
      setNotice(r.unchanged ? "凭据已完整，无需修复" : "已补齐 installId / deviceId");
      await refresh();
    }
  };
  const doBalance = async () => {
    const r = await run("balance", "credits.balance");
    if (r) setBalance(r);
  };
  const doStatus = async () => {
    const r = await run("checkin", "credits.status");
    if (r) setCheckin(r);
  };
  const doClaim = async () => {
    const r = await run("claim", "credits.claim");
    if (r) {
      setNotice(r.claimed ? "今日积分已领取（或此前已领）" : "领取后状态未变更，可能今日无可用签到");
      setCheckin((prev) => ({ ...prev ?? {}, ...r }));
    }
  };
  const logged = status?.loggedIn;
  return (0, import_jsx_runtime.jsxs)("div", { className: "ta2-page", children: [
    (0, import_jsx_runtime.jsxs)("div", { children: [
      (0, import_jsx_runtime.jsx)("h2", { className: "ta2-title", children: "TeleAgent · 星辰超级智能体" }),
      (0, import_jsx_runtime.jsx)("p", { className: "ta2-sub", children: "独立插件 · v1 网关签名（两轮 HMAC-SHA256 / JWT 签名段为密钥）。复用已有登录凭据，装好即用。" })
    ] }),
    (0, import_jsx_runtime.jsxs)("div", { className: "ta2-card", children: [
      (0, import_jsx_runtime.jsxs)("div", { className: "ta2-row", children: [
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-label", children: "登录状态" }),
        (0, import_jsx_runtime.jsx)("span", { className: `ta2-badge ${logged ? "on" : "off"}`, children: logged ? "已登录" : "未登录" }),
        status?.nickname && (0, import_jsx_runtime.jsx)("span", { className: "ta2-value", children: status.nickname }),
        status?.expired && (0, import_jsx_runtime.jsx)("span", { className: "ta2-err", children: "凭据已过期" })
      ] }),
      logged && (0, import_jsx_runtime.jsxs)("div", { className: "ta2-row", children: [
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-label", children: "凭据完整度" }),
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-value", children: `installId ${status.hasInstallId ? "✓" : "✗"} · deviceId ${status.hasDeviceId ? "✓" : "✗"}` })
      ] }),
      status?.expiresAt && (0, import_jsx_runtime.jsx)("div", { className: "ta2-row", children: [
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-label", children: "有效期至" }),
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-value", children: new Date(status.expiresAt).toLocaleString() })
      ] }),
      (0, import_jsx_runtime.jsxs)("div", { className: "ta2-row", children: [
        (0, import_jsx_runtime.jsx)("button", { className: "ta2-btn", disabled: !!busy, onClick: refresh, children: "刷新状态" }),
        (0, import_jsx_runtime.jsx)("button", { className: "ta2-btn", disabled: !!busy, onClick: openLogin, children: "打开官方登录页" }),
        (0, import_jsx_runtime.jsx)("button", { className: "ta2-btn", disabled: !!busy, onClick: doRepair, children: "修复凭据" })
      ] })
    ] }),
    (0, import_jsx_runtime.jsxs)("div", { className: "ta2-card", children: [
      (0, import_jsx_runtime.jsx)("div", { className: "ta2-sub", children: "在官方页面登录后，把回调 URL / deeplink / token 粘贴到这里（仅首次或凭据过期时需要）。" }),
      (0, import_jsx_runtime.jsxs)("div", { className: "ta2-row", children: [
        (0, import_jsx_runtime.jsx)("input", { className: "ta2-input", value: callback, placeholder: "https://… 或 <tenant>:eyJ…", onChange: (e) => setCallback(e.target.value) }),
        (0, import_jsx_runtime.jsx)("button", { className: "ta2-btn primary", disabled: !!busy || !callback.trim(), onClick: doLogin, children: "提交登录" })
      ] })
    ] }),
    (0, import_jsx_runtime.jsxs)("div", { className: "ta2-card", children: [
      (0, import_jsx_runtime.jsx)("div", { className: "ta2-label", children: "积分 / 每日签到" }),
      (0, import_jsx_runtime.jsxs)("div", { className: "ta2-row", children: [
        (0, import_jsx_runtime.jsx)("button", { className: "ta2-btn", disabled: !!busy || !logged, onClick: doBalance, children: "查询余额" }),
        (0, import_jsx_runtime.jsx)("button", { className: "ta2-btn", disabled: !!busy || !logged, onClick: doStatus, children: "签到状态" }),
        (0, import_jsx_runtime.jsx)("button", { className: "ta2-btn", disabled: !!busy || !logged, onClick: doClaim, children: "一键领取积分" })
      ] }),
      balance !== null && (0, import_jsx_runtime.jsxs)("div", { className: "ta2-row", children: [
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-label", children: "积分余额" }),
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-value", children: balance.balance === void 0 ? "接口未返回数值" : `${balance.balance} 分` }),
        balance.plan && (0, import_jsx_runtime.jsx)("span", { className: "ta2-value", children: `${balance.plan}` })
      ] }),
      checkin !== null && (0, import_jsx_runtime.jsxs)("div", { className: "ta2-row", children: [
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-label", children: "今日签到" }),
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-value", children: checkin.claimed ? `已领${checkin.buttonText ? `（${checkin.buttonText}）` : ""}` : "未领取" }),
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-value", children: `每日可领 ${checkin.dailyClaimablePoints} 分 · 累计 ${checkin.totalClaimDays} 天 / ${checkin.totalClaimedPoints} 分` })
      ] }),
      checkin?.activityTitle && (0, import_jsx_runtime.jsx)("div", { className: "ta2-models", children: `活动：${checkin.activityTitle}` })
    ] }),
    (0, import_jsx_runtime.jsxs)("div", { className: "ta2-card", children: [
      (0, import_jsx_runtime.jsx)("div", { className: "ta2-label", children: `可用模型（${models.length}）` }),
      (0, import_jsx_runtime.jsx)("div", { className: "ta2-models", children: models.map((m) => `${m.name} (${m.id})`).join(" · ") || "加载中…" })
    ] }),
    error && (0, import_jsx_runtime.jsx)("div", { className: "ta2-err", children: error }),
    notice && (0, import_jsx_runtime.jsx)("div", { className: "ta2-ok", children: notice }),
    (0, import_jsx_runtime.jsx)("div", { className: "ta2-warn", children: "⚠️ 风控提示：该网关有服务端风控（40105 疑似攻击 → 40109 账号级封禁，官方 App 也会失效）。请勿高频请求、并发或用它做压测；出现 40105 立即停用。本插件已把签名算法一次算对，不做任何试探性请求。" })
  ] });
}
function TeleagentComposerPill({ rpcCall, useProjection, sessionId }) {
  const projection = typeof useProjection === "function" ? useProjection("modelSelection") : void 0;
  const selected = projection?.next ?? projection?.lastUsed;
  const owned = selected?.provider === PROVIDER;
  const [status, setStatus] = (0, import_react.useState)(null);
  const [balance, setBalance] = (0, import_react.useState)(null);
  const [checkin, setCheckin] = (0, import_react.useState)(null);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [problem, setProblem] = (0, import_react.useState)(null);
  const [lastRefresh, setLastRefresh] = (0, import_react.useState)(0);
  const rootRef = import_react.default.useRef(null);
  const panelRef = import_react.default.useRef(null);
  const [pos, setPos] = (0, import_react.useState)(null);
  const load = (0, import_react.useCallback)(async () => {
    setBusy(true);
    try {
      const s = await rpcCall("status");
      setStatus(s);
      if (!s?.loggedIn) {
        setBalance(null);
        setCheckin(null);
        setProblem("signed-out");
        setLastRefresh(Date.now());
        return;
      }
      const [b, c] = await Promise.all([
        rpcCall("credits.balance").catch(() => null),
        rpcCall("credits.status").catch(() => null)
      ]);
      setBalance(b);
      setCheckin(c);
      setProblem(b === null ? "failed" : null);
      setLastRefresh(Date.now());
    } catch {
      setProblem("failed");
    } finally {
      setBusy(false);
    }
  }, [rpcCall]);
  (0, import_react.useEffect)(() => {
    if (!owned) return void 0;
    let alive = true;
    load().catch(() => {
    });
    const timer = setInterval(() => {
      if (alive) load().catch(() => {
      });
    }, 12e4);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [owned, load]);
  import_react.default.useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPos(null);
      return;
    }
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
  (0, import_react.useEffect)(() => {
    if (!open) return void 0;
    const onPointer = (event) => {
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t) === true || panelRef.current?.contains(t) === true) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!owned) return null;
  const total = balance?.balance;
  const signedOut = problem === "signed-out";
  const valueText = signedOut ? "未登录" : total === void 0 ? "—" : formatCredits(total);
  const dotClass = problem === "failed" ? "err" : signedOut || total === void 0 ? "warn" : "ok";
  const nickname = status?.nickname ?? "TeleAgent";
  const chipTitle = signedOut ? "尚未登录 TeleAgent（点击查看）" : problem === "failed" ? "积分读取失败（点击重试）" : `${nickname} · 积分 ${valueText}（点击查看账号）`;
  return (0, import_jsx_runtime.jsxs)("span", { ref: rootRef, className: "ta2-pill", children: [
    (0, import_jsx_runtime.jsxs)("button", {
      type: "button",
      className: "ta2-pill-btn",
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      title: chipTitle,
      onClick: () => setOpen((v) => !v),
      children: [
        (0, import_jsx_runtime.jsx)("span", { className: `ta2-pill-dot ${dotClass}` }),
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-pill-num", children: valueText }),
        (0, import_jsx_runtime.jsx)("span", { className: "ta2-pill-sep", children: "·" }),
        (0, import_jsx_runtime.jsx)("span", { children: signedOut ? "TeleAgent" : nickname })
      ]
    }),
    open && pos && (0, import_react_dom.createPortal)(
      (0, import_jsx_runtime.jsxs)("div", {
        ref: panelRef,
        className: "ta2-panel",
        role: "dialog",
        style: { top: `${pos.top}px`, left: `${pos.left}px` },
        children: [
          (0, import_jsx_runtime.jsxs)("div", { className: "ta2-panel-head", children: [
            (0, import_jsx_runtime.jsx)("span", { className: "ta2-panel-title", children: signedOut ? "TeleAgent" : nickname }),
            (0, import_jsx_runtime.jsx)("button", {
              type: "button",
              className: "ta2-panel-refresh",
              disabled: busy,
              onClick: () => {
                load().catch(() => {
                });
              },
              children: busy ? "刷新中…" : "一键刷新"
            })
          ] }),
          signedOut ? (0, import_jsx_runtime.jsxs)("div", { className: "ta2-panel-empty", children: [
            (0, import_jsx_runtime.jsx)("div", { className: "ta2-panel-meta", children: "本机还没有 TeleAgent 登录凭据。" }),
            (0, import_jsx_runtime.jsx)("div", { className: "ta2-panel-meta", children: "在「设置 → TeleAgent」里打开官方登录页并粘贴回调 URL 或 token 即可。" })
          ] }) : (0, import_jsx_runtime.jsxs)("table", { className: "ta2-panel-table", children: [
            (0, import_jsx_runtime.jsx)("thead", { children: (0, import_jsx_runtime.jsxs)("tr", { children: [
              (0, import_jsx_runtime.jsx)("th", { children: "账号" }),
              (0, import_jsx_runtime.jsx)("th", { className: "num", children: "积分" })
            ] }) }),
            (0, import_jsx_runtime.jsx)("tbody", { children: (0, import_jsx_runtime.jsx)("tr", { children: [
              (0, import_jsx_runtime.jsxs)("td", { children: [
                (0, import_jsx_runtime.jsx)("div", { className: "ta2-panel-name", children: [
                  (0, import_jsx_runtime.jsx)("span", { children: nickname }),
                  (0, import_jsx_runtime.jsx)("span", { className: "ta2-panel-current", children: "当前选用" })
                ] })
              ] }),
              (0, import_jsx_runtime.jsx)("td", { className: "num", children: valueText })
            ] }) })
          ] }),
          balance?.plan && (0, import_jsx_runtime.jsxs)("div", { className: "ta2-panel-meta", children: [
            "套餐：",
            balance.plan
          ] }),
          checkin && (0, import_jsx_runtime.jsxs)("div", { className: "ta2-panel-meta", children: [
            checkin.claimed ? "今日已签到" : "今日未签到",
            ` · 每日可领 ${checkin.dailyClaimablePoints ?? 0} 分`,
            ` · 累计 ${checkin.totalClaimDays ?? 0} 天 / ${checkin.totalClaimedPoints ?? 0} 分`
          ] }),
          checkin?.activityTitle && (0, import_jsx_runtime.jsxs)("div", { className: "ta2-panel-meta", children: ["活动：", checkin.activityTitle] }),
          problem === "failed" && (0, import_jsx_runtime.jsx)("div", { className: "ta2-panel-err", children: "积分读取失败，请稍后重试" }),
          status?.expired && (0, import_jsx_runtime.jsx)("div", { className: "ta2-panel-err", children: "登录凭据已过期，请在设置页重新登录" }),
          (0, import_jsx_runtime.jsxs)("div", { className: "ta2-panel-foot", children: [
            (0, import_jsx_runtime.jsx)("span", { children: lastRefresh ? `最近刷新 ${formatClock(lastRefresh)}` : "尚未刷新" }),
            status?.expiresAt ? (0, import_jsx_runtime.jsx)("span", { children: `至 ${new Date(status.expiresAt).toLocaleDateString()}` }) : null
          ] })
        ]
      }),
      document.body
    )
  ] });
}
function formatCredits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function formatClock(ms) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}
var name = "teleagent-connect-client";
var inject = ["slots", "connection"];
function registerOnce(ctx, slotName, options, Component) {
  const live = /* @__PURE__ */ new Map();
  return ctx.slots.inject(slotName, () => {
    if (live.has(options.id)) return live.get(options.id);
    const dispose = ctx.slots.register(options, Component);
    live.set(options.id, dispose);
    return dispose;
  });
}
function apply(ctx) {
  ctx.effect(() => installStyles(), "teleagent-connect: install styles");
  const rpcCall = async (method, payload, signal) => unwrap(await callRpc(ctx.connection, method, payload, signal));
  registerOnce(ctx, "settings.section", {
    name: "settings.section",
    id: "teleagent-connect",
    order: 51,
    label: () => "TeleAgent",
    inject: () => ({ rpcCall })
  }, TeleagentPage);
  registerOnce(ctx, "conversation.input.right", {
    name: "conversation.input.right",
    id: "teleagent-connect-credits",
    order: 0,
    inject: () => ({ rpcCall })
  }, TeleagentComposerPill);
}

    return module.exports;
  }
});
