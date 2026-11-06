/**
 * Context-size configuration: defaults, validation, persistence, and the
 * adapter/catalogue wiring that makes a saved value reach model resolution.
 *
 * The gateway has no model-catalogue endpoint, so the window is a DECLARED
 * budget taken from the official client (100K). This file pins both halves of
 * that contract: bad input never leaves an unusable value behind, and a good
 * one is what `resolveModel` reports.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const home = mkdtempSync(join(tmpdir(), 'tg-ctx-'));
const realHome = process.env.HOME;
// `homedir()` reads HOME on POSIX; CONFIG_PATH is computed at module load, so
// this must happen before the import below.
process.env.HOME = home;

const DIR = join(import.meta.dirname, '..');
const cfg = await import(pathToFileURL(join(DIR, 'lib/model-config.js')).href);
const { FALLBACK_MODELS } = await import(pathToFileURL(join(DIR, 'lib/product.js')).href);

try {
  // ── defaults match the official client ────────────────────────────────
  assert.equal(cfg.DEFAULT_CONTEXT_WINDOW, 100_000);
  assert.equal(cfg.DEFAULT_MAX_OUTPUT, 16_384);
  const fresh = cfg.readConfig();
  assert.equal(fresh.contextWindow, 100_000);
  assert.equal(fresh.maxOutputTokens, 16_384);
  assert.equal(existsSync(cfg.CONFIG_PATH), false, 'reading must not create a file');

  // ── every tier reports the default window ─────────────────────────────
  for (const m of FALLBACK_MODELS) {
    assert.equal(cfg.limitsFor(m.id, fresh).contextWindow, 100_000);
    assert.equal(cfg.limitsFor(m.id, fresh).maxOutputTokens, 16_384);
  }

  // ── validation: out-of-range and non-numeric fall back, never throw ───
  assert.equal(cfg.normalizeConfig({ contextWindow: 1 }).contextWindow, 100_000, 'too small => default');
  assert.equal(cfg.normalizeConfig({ contextWindow: 99_999_999 }).contextWindow, 100_000, 'too large => default');
  assert.equal(cfg.normalizeConfig({ contextWindow: 'abc' }).contextWindow, 100_000);
  assert.equal(cfg.normalizeConfig({ contextWindow: '200000' }).contextWindow, 200_000, 'numeric string accepted');
  assert.equal(cfg.normalizeConfig(null).contextWindow, 100_000);
  assert.equal(cfg.normalizeConfig({ maxOutputTokens: 0 }).maxOutputTokens, 16_384);
  // a bad per-model entry is dropped, a good one kept
  const mixed = cfg.normalizeConfig({ perModel: { 'chat-pro': { contextWindow: 200_000 }, 'chat-lite': { contextWindow: 5 } } });
  assert.equal(mixed.perModel['chat-pro'].contextWindow, 200_000);
  assert.equal(mixed.perModel['chat-lite'], undefined);

  // ── persistence round-trip ────────────────────────────────────────────
  await cfg.writeConfig({ contextWindow: 200_000 });
  assert.ok(existsSync(cfg.CONFIG_PATH), 'save creates the file');
  assert.equal(cfg.readConfig().contextWindow, 200_000);
  assert.equal(cfg.limitsFor('chat-pro').contextWindow, 200_000);
  // the file holds exactly the normalised shape
  assert.equal(JSON.parse(readFileSync(cfg.CONFIG_PATH, 'utf8')).contextWindow, 200_000);

  // ── an explicit bad SAVE is rejected, and leaves the stored value alone ─
  await assert.rejects(() => cfg.writeConfig({ contextWindow: 1 }), /上下文大小/, 'out-of-range save must reject');
  await assert.rejects(() => cfg.writeConfig({ contextWindow: 'abc' }), /上下文大小/, 'non-numeric save must reject');
  assert.equal(cfg.readConfig().contextWindow, 200_000, 'a rejected save must not clobber the stored value');

  // ── a corrupt file degrades to defaults instead of taking the provider down
  writeFileSync(cfg.CONFIG_PATH, '{ not json', 'utf8');
  const recovered = cfg.readConfig();
  assert.equal(recovered.contextWindow, 100_000, 'corrupt file => defaults');

  // ── adapter reports the configured value ──────────────────────────────
  await cfg.writeConfig({ contextWindow: 500_000 });
  const { TeleagentAdapter } = await import(pathToFileURL(join(DIR, 'lib/adapter.js')).href);
  const ctx = {
    credentials: { async resolve() { return null; }, async set() {} },
    logger: { warn() {}, info() {} },
    llm: { registerAdapter() {} },
  };
  const adapter = new TeleagentAdapter(ctx);
  const resolved = await adapter.resolveModel('teleagent', 'chat-lite');
  assert.equal(resolved.context.contextWindow, 500_000, 'resolveModel must use the saved window');
  assert.equal(resolved.defaultMaxTokens, 16_384);
  // unknown model ids still get a usable budget rather than undefined
  const unknown = await adapter.resolveModel('teleagent', 'chat-future');
  assert.equal(unknown.context.contextWindow, 500_000);

  // ── describeConfig is what the panel renders ──────────────────────────
  const described = cfg.describeConfig();
  assert.equal(described.contextWindow, 500_000);
  assert.deepEqual(described.defaults, { contextWindow: 100_000, maxOutputTokens: 16_384 });
  assert.equal(described.models.length, 3);
  assert.ok(described.models.every((m) => m.contextWindow === 500_000));
  assert.ok(described.limits.contextWindow.min > 0 && described.limits.contextWindow.max >= 1_000_000);

  console.log('✓ context-size config: defaults, validation, persistence, adapter wiring');
} finally {
  process.env.HOME = realHome;
  rmSync(home, { recursive: true, force: true });
}
