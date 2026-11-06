/**
 * User-tunable limits for TeleAgent models.
 *
 * WHY THIS EXISTS
 * The gateway exposes no model-catalogue endpoint (five candidate paths all
 * 404), so the only authority on a tier's context window is the official
 * desktop client's embedded seed table: 100K window / 16384 output, shared by
 * all three tiers ("预设档位共享一份 preset-context"). That number is what DSH
 * uses to decide when to compact, so it is worth being able to adjust:
 *
 *   - declare less  → compact earlier, and never risk a server-side reject;
 *   - declare more  → defer compaction, at the risk that the request is
 *                     rejected or silently truncated upstream.
 *
 * Defaults therefore stay at the client's value. An override is a DECLARATION
 * for DSH's budgeting, not something the server reports back, and the settings
 * surface says so.
 *
 * Storage: ~/.dsh/teleagent/config.json
 *   { "contextWindow": 100000, "maxOutputTokens": 16384,
 *     "perModel": { "chat-pro": { "contextWindow": 200000 } } }
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { FALLBACK_MODELS } from './product.js';

export const CONFIG_DIR = join(homedir(), '.dsh', 'teleagent');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/** What the official client declares for every tier. */
export const DEFAULT_CONTEXT_WINDOW = 100_000;
export const DEFAULT_MAX_OUTPUT = 16_384;

/**
 * Accepted ranges. The floor is high enough to be useful and the ceiling high
 * enough for a 1M claim; anything outside is almost certainly a typo (a user
 * pasting "1000000" into the wrong field, or leaving a 0 off).
 */
export const LIMITS = Object.freeze({
  contextWindow: { min: 16_000, max: 2_000_000 },
  maxOutputTokens: { min: 1_024, max: 128_000 },
});

const DEFAULTS = Object.freeze({
  contextWindow: DEFAULT_CONTEXT_WINDOW,
  maxOutputTokens: DEFAULT_MAX_OUTPUT,
  perModel: {},
});

function clampInt(value, range, fallback) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.round(n);
  if (i < range.min || i > range.max) return fallback;
  return i;
}

/**
 * Parse an explicitly supplied value, or undefined when it is not a number in
 * range. Used by writes, where "invalid" must be reported rather than repaired.
 */
function strictInt(value, range) {
  const n = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.round(n);
  if (i < range.min || i > range.max) return undefined;
  return i;
}

/** Normalise whatever is on disk into a valid config, dropping bad fields. */
export function normalizeConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const perModel = {};
  if (source.perModel && typeof source.perModel === 'object') {
    for (const [id, entry] of Object.entries(source.perModel)) {
      if (!entry || typeof entry !== 'object') continue;
      const context = clampInt(entry.contextWindow, LIMITS.contextWindow, undefined);
      const maxOut = clampInt(entry.maxOutputTokens, LIMITS.maxOutputTokens, undefined);
      if (context === undefined && maxOut === undefined) continue;
      perModel[id] = {
        ...context === undefined ? {} : { contextWindow: context },
        ...maxOut === undefined ? {} : { maxOutputTokens: maxOut },
      };
    }
  }
  return {
    contextWindow: clampInt(source.contextWindow, LIMITS.contextWindow, DEFAULTS.contextWindow),
    maxOutputTokens: clampInt(source.maxOutputTokens, LIMITS.maxOutputTokens, DEFAULTS.maxOutputTokens),
    perModel,
  };
}

/** mtime-keyed cache: `resolveModel` runs per request, disk reads should not. */
let cache = { mtimeMs: -1, config: null };

function readCache() {
  try {
    const { mtimeMs } = statSync(CONFIG_PATH);
    if (cache.config !== null && cache.mtimeMs === mtimeMs) return cache.config;
    return null;
  } catch {
    return null;
  }
}

/**
 * Read the config. Missing/corrupt file => defaults, never a throw: this value
 * feeds every model resolution, and a bad file must not take the provider down.
 */
export function readConfig() {
  const hit = readCache();
  if (hit !== null) return hit;
  let parsed;
  try {
    const text = readFileSync(CONFIG_PATH, 'utf8');
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const config = normalizeConfig(parsed);
  let mtimeMs = 0;
  try { mtimeMs = statSync(CONFIG_PATH).mtimeMs; } catch { /* absent */ }
  cache = { mtimeMs, config };
  return config;
}

/**
 * Persist a partial update; returns the normalised, stored config.
 *
 * Unlike `normalizeConfig` (which silently repairs a bad FILE on read, because
 * a broken file must not take the provider down), an explicit SAVE rejects
 * invalid input. Silently substituting the default here would quietly discard
 * the user's previous value — they would type 99999999, see no error, and lose
 * the 200K they had set a minute earlier.
 */
export async function writeConfig(patch) {
  const current = readConfig();
  const next = { ...current };
  if (patch && 'contextWindow' in patch) {
    const v = strictInt(patch.contextWindow, LIMITS.contextWindow);
    if (v === undefined) {
      throw new Error(`上下文大小需在 ${LIMITS.contextWindow.min} 到 ${LIMITS.contextWindow.max} 之间`);
    }
    next.contextWindow = v;
  }
  if (patch && 'maxOutputTokens' in patch) {
    const v = strictInt(patch.maxOutputTokens, LIMITS.maxOutputTokens);
    if (v === undefined) {
      throw new Error(`输出上限需在 ${LIMITS.maxOutputTokens.min} 到 ${LIMITS.maxOutputTokens.max} 之间`);
    }
    next.maxOutputTokens = v;
  }
  const merged = normalizeConfig({
    contextWindow: next.contextWindow,
    maxOutputTokens: next.maxOutputTokens,
    perModel: { ...current.perModel, ...(patch?.perModel ?? {}) },
  });
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o755 });
  await writeFile(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o644 });
  cache = { mtimeMs: -1, config: null };
  return merged;
}

/**
 * The limits one model should advertise.
 * @returns {{ contextWindow: number, maxOutputTokens: number }}
 */
export function limitsFor(modelId, config = readConfig()) {
  const base = FALLBACK_MODELS.find((m) => m.id === modelId);
  const override = config.perModel?.[modelId];
  return {
    contextWindow: override?.contextWindow ?? config.contextWindow
      ?? base?.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: override?.maxOutputTokens ?? config.maxOutputTokens
      ?? base?.maxTokens ?? DEFAULT_MAX_OUTPUT,
  };
}

/** Everything the panel needs: the tiers, their effective limits, and the source. */
export function describeConfig() {
  const config = readConfig();
  return {
    contextWindow: config.contextWindow,
    maxOutputTokens: config.maxOutputTokens,
    defaults: { contextWindow: DEFAULT_CONTEXT_WINDOW, maxOutputTokens: DEFAULT_MAX_OUTPUT },
    limits: LIMITS,
    perModel: config.perModel,
    models: FALLBACK_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      ...limitsFor(m.id, config),
    })),
  };
}
