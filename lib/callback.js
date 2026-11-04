/** Parse the various shapes a user might paste after the official login.
 *  Dependency-free so it can be unit-tested without the DSH host. */

export function parseCallbackInput(input) {
  if (typeof input !== 'string') return { reason: 'input is not a string' };
  const text = input.trim();
  if (!text) return { reason: 'empty input' };

  if (/^https?:\/\//i.test(text) || text.includes('://')) {
    try {
      const u = new URL(text);
      const all = new URLSearchParams(u.search);
      const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
      for (const key of ['token', 'code', 'tokenCode', 'access_token', 'jwt', 'X-Token']) {
        const v = all.get(key) ?? hash.get(key);
        if (v && looksLikeToken(v)) return { token: decodeURIComponent(v) };
      }
      const candidate = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
      if (looksLikeToken(candidate)) return { token: candidate };
    } catch { /* fall through */ }
  }

  const bare = text.replace(/^['"]|['"]$/g, '');
  if (looksLikeToken(bare)) return { token: bare };

  const match = bare.match(/[A-Za-z0-9_-]{6,}:eyJ[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+/);
  if (match) return { token: match[0] };
  return { reason: 'no token-shaped value found' };
}

function looksLikeToken(v) {
  return typeof v === 'string' && v.length > 40 && /eyJ[A-Za-z0-9_.-]+\./.test(v);
}
