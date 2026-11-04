/**
 * Credits/check-in parsing against the REAL wire shapes captured 2026-11-04.
 * No network: `fetch` is stubbed to return the recorded JSON payloads.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const { TeleagentService } = await import(pathToFileURL(`${DIR}/lib/service.js`).href);
const { FALLBACK_MODELS } = await import(pathToFileURL(`${DIR}/lib/product.js`).href);

// ── Model catalogue must match the official client's tiers ──────────────
assert.deepEqual(FALLBACK_MODELS.map((m) => m.id), ['chat-nano', 'chat-lite', 'chat-pro']);
assert.deepEqual(FALLBACK_MODELS.map((m) => m.name), ['轻量', '智能', '旗舰']);
assert.ok(!FALLBACK_MODELS.some((m) => m.id.startsWith('deepseek')), 'no invented DeepSeek IDs');
assert.ok(FALLBACK_MODELS.every((m) => m.contextWindow === 100_000 && m.maxTokens === 16_384));

// ── Recorded wire responses ─────────────────────────────────────────────
const USER_CENTER = {
  code: 200, msg: 'success',
  data: {
    is_telecom_employee: true, plan_display_name: '免费版',
    current_points_balance: '16034.51',
    activities: [{ remaining_activity_points: '16034.51', total_activity_points: 16300 }],
  },
};
const DAY_TASK = {
  code: 200, msg: 'success',
  data: {
    brand_title: '积分福利社',
    activity: { visible: true, activity_title: '邀请共享积分礼' },
    daily_task: {
      visible: true, daily_claimable_points: 100, total_claim_days: 26,
      total_claimed_points: 2600, claimed_today: true, button_text: '今日已领',
    },
  },
};

const credential = { token: 'I7Kp2X:eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3OTYzMDEzNjd9.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij0123456' };
const ctx = {
  credentials: {
    async resolve(ref) {
      if (ref === 'TELEAGENT_ACCESS_TOKEN' || String(ref).startsWith('TELEAGENT_ACCOUNT_')) return { value: JSON.stringify(credential), source: 'file' };
      return null;
    },
    async set() {},
  },
  logger: { warn() {} },
};

const realFetch = globalThis.fetch;
const seen = [];
globalThis.fetch = async (url, init) => {
  seen.push({ url: String(url), method: init?.method ?? 'GET' });
  const payload = String(url).includes('userCenter') ? USER_CENTER : DAY_TASK;
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
};
try {
  const svc = new TeleagentService(ctx);

  // Balance: string amount nested under `data` must be parsed to a number.
  const balance = await svc.creditBalance();
  console.log('balance:', balance.balance, 'plan:', balance.plan);
  assert.equal(balance.balance, 16034.51);
  assert.equal(balance.plan, '免费版');

  // Check-in: nested `daily_task` + `activity`.
  const status = await svc.checkinStatus();
  console.log('checkin:', JSON.stringify(status));
  assert.equal(status.claimed, true);
  assert.equal(status.dailyClaimablePoints, 100);
  assert.equal(status.totalClaimDays, 26);
  assert.equal(status.totalClaimedPoints, 2600);
  assert.equal(status.buttonText, '今日已领');
  assert.equal(status.activityTitle, '邀请共享积分礼');

  // Claim must be a GET on checkTask, then re-query the panel.
  const claim = await svc.claimDailyCheckin();
  assert.equal(claim.claimed, true);
  assert.equal(claim.totalClaimedPoints, 2600);
  const claimCall = seen.find((s) => s.url.includes('checkTask'));
  assert.ok(claimCall, 'claim must call checkTask');
  assert.equal(claimCall.method, 'GET', 'claim endpoint is GET, not POST');

  // Missing balance field => undefined, NEVER 0.
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 200, data: { plan_display_name: '免费版' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const missing = await svc.creditBalance();
  assert.equal(missing.balance, undefined);
} finally {
  globalThis.fetch = realFetch;
}

console.log('✓ credits / check-in parsing + model catalogue tests passed');
