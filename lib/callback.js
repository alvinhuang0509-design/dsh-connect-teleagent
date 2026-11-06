/** Parse the various shapes a user might paste after the official login.
 *  Dependency-free so it can be unit-tested without the DSH host.
 *
 * WHERE THE TOKEN ACTUALLY IS
 * The official flow does NOT leave a token in the address bar. After
 * authorising, the browser lands on
 *
 *     https://agent.teleai.com.cn/superCowork/sapi/cowork/auth?code=ucc.XXXXXX
 *
 * — only `code`, no `token`. The token is delivered through the
 * `teleai-cowork://auth?token=…` deeplink that the official desktop app
 * intercepts as an in-app navigation; it never reaches the address bar, and a
 * browser does not print cross-scheme navigations to the console either.
 * A `code` is single-use and cannot be exchanged by us (a spent code and a
 * fabricated one answer identically), so the only browser-side place the token
 * appears is the Network panel: the `Location` response header of that
 * `cowork/auth?code=…` request, or the body of the token-exchange response.
 *
 * Hence this parser is deliberately generous (callback URL, deeplink URL, bare
 * token) but must REPORT a code-only paste instead of just failing: telling a
 * user "no token found" when the thing they pasted visibly contains a `code`
 * is what sent people round the loop before.
 */

const TOKEN_SHAPE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const MAX_PLAUSIBLE = 8192;

/** A value that could be an auth token: a JWT-ish blob, or `<tenant>:<JWT>`. */
export function looksLikeToken(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length <= 40 || v.length > MAX_PLAUSIBLE) return false;
  // A pasted sentence (address-bar copies carry newlines) is not a credential.
  if (/\s/.test(v)) return false;
  return TOKEN_SHAPE.test(v);
}

/**
 * @param {string} input
 * @returns {{token: string} | {reason: string, kind: 'empty'|'code-only'|'no-token'|'not-string'}}
 */
export function parseCallbackInput(input) {
  if (typeof input !== 'string') return { reason: 'input is not a string', kind: 'not-string' };
  const text = input.trim();
  if (!text) return { reason: 'empty input', kind: 'empty' };

  // Any URL, including the `teleai-cowork://` deeplink form.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      const all = new URLSearchParams(u.search);
      const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
      for (const key of ['token', 'access_token', 'jwt', 'X-Token', 'tokenCode', 'code']) {
        const v = all.get(key) ?? hash.get(key);
        if (v && looksLikeToken(v)) return { token: decodeURIComponent(v) };
      }
      // Some deployments put the token in the path rather than a parameter.
      const candidate = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
      if (looksLikeToken(candidate)) return { token: candidate };
      // A `code` means the user pasted the post-login address bar — the exact
      // dead end this flow is known for. Say so specifically.
      const code = all.get('code') ?? hash.get('code');
      if (typeof code === 'string' && code.length > 0) {
        return { reason: `这是授权 code（${code.slice(0, 12)}…），不是 token`, kind: 'code-only' };
      }
    } catch { /* fall through to the bare-token attempt */ }
  }

  const bare = text.replace(/^['"]|['"]$/g, '');
  if (looksLikeToken(bare)) return { token: bare };

  // Last resort: pull a token-shaped substring out of surrounding text.
  // All three JWT segments, with the optional `<tenant>:` prefix — a regex that
  // stopped at the second dot would silently truncate the credential.
  const match = bare.match(/[A-Za-z0-9_-]{2,}:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)
    ?? bare.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (match && looksLikeToken(match[0])) return { token: match[0] };

  return { reason: 'no token-shaped value found', kind: 'no-token' };
}
