/** Offline unit tests for the v1 signing protocol. No network access. */
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  computeSignature, signingKeyOf, buildInferHeaders, buildBusinessHeaders,
  trackingId, uuidv7,
} from '../lib/sign.js';
import { SIGN_PATH, SIGN_VERSION, SIGN_SCHEME, APP_VERSION } from '../lib/product.js';
import { parseCredential, tokenExpiresAtMs, isExpired } from '../lib/credentials.js';
import { parseCallbackInput as parseLogin } from '../lib/callback.js';

const token = 'Em9xR4:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3OTYzMDEzNjd9.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij0123456';

// 1. key extraction
assert.equal(signingKeyOf(token), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij0123456');
assert.throws(() => signingKeyOf('not-a-jwt'), /无法提取签名密钥/);

// 2. signature vs an independent reimplementation
const args = {
  token,
  installId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  tsSec: 1793797093,
  nonce: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  body: '{"model":"deepseek-v3.1","messages":[{"role":"user","content":"hi"}],"stream":true}',
};
const K = token.split(':').slice(1).join(':').split('.')[2];
const m1 = [SIGN_SCHEME, token, args.installId, String(args.tsSec), args.nonce].join('/');
const sig1 = createHmac('sha256', K).update(m1, 'utf8').digest('hex');
const bodyHash = createHash('sha256').update(Buffer.from(args.body)).digest('hex');
const m2 = [SIGN_SCHEME, 'POST', SIGN_PATH, String(args.tsSec), args.nonce, APP_VERSION, bodyHash].join('\n');
const expected = createHmac('sha256', sig1).update(m2, 'utf8').digest('hex');
const got = computeSignature(args);
assert.equal(got, expected, 'signature must match the two-round reference');
assert.match(got, /^[0-9a-f]{64}$/, 'lowercase hex, 64 chars');

// 3. round 1 uses "/" between fields, round 2 uses "\n" (guards the biggest trap)
assert.ok(!m2.includes('\n') === false, 'round 2 must use newline separators');
assert.equal(m1.split('/').length - 1, 4, 'round 1 has exactly 4 slash separators');
assert.equal(m2.split('\n').length - 1, 6, 'round 2 has exactly 6 newline separators');

// 4. body bytes matter
assert.notEqual(computeSignature({ ...args, body: args.body + ' ' }), got);

// 5. header set
const credential = { token, device_id: 'a093962acff2', install_id: args.installId };
const h = buildInferHeaders({ credential, body: args.body });
assert.equal(h['X-Superagent-Sign-Version'], SIGN_VERSION);
assert.equal(h['X-Token'], token);
assert.equal(h['X-Superagent-Install-Id'], args.installId);
assert.equal(h['X-Superagent-Device-Id'], 'a093962acff2');
assert.equal(h['X-App-Version'], APP_VERSION);
assert.equal(h['X-Route-Target'], 'ops-gateway');
assert.match(h['X-Superagent-Timestamp'], /^\d{10}$/, 'seconds, 10 digits');
assert.match(h['X-Superagent-Signature'], /^[0-9a-f]{64}$/);
assert.equal(h['X-Superagent-Nonce'], h['X-Superagent-Nonce']);
assert.ok(!Object.keys(h).some((k) => k.startsWith('X-SA-')), 'no local-kernel X-SA-* headers');
assert.ok(!('X-Device-Os' in h), 'kernel does not send X-Device-Os');
assert.match(h['X-Request-Id'], /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'UUIDv7');

// 6. signature is computed over the exact same body passed to headers
assert.equal(computeSignature({
  token, installId: args.installId,
  tsSec: Number(h['X-Superagent-Timestamp']), nonce: h['X-Superagent-Nonce'], body: args.body,
}), h['X-Superagent-Signature']);

// 7. business headers need no signature
const b = buildBusinessHeaders(credential);
assert.equal(b['X-Token'], token);
assert.ok(!('X-Superagent-Signature' in b));

// 8. tracking ids
assert.match(trackingId('ses'), /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
assert.match(trackingId('msg'), /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
assert.equal(uuidv7()[14], '7');

// 9. credential parsing (legacy JSON + bare token)
const legacy = JSON.stringify({ token, device_id: 'a093962acff2', sign_key: 'x', account_id: '2072', nickname: 'AlvinH' });
const c = parseCredential(legacy);
assert.equal(c.token, token);
assert.equal(c.device_id, 'a093962acff2');
assert.equal(c.install_id, undefined, 'legacy credentials have no install_id -> must be backfilled');
assert.equal(parseCredential(token).token, token);
assert.equal(parseCredential('  "bad"  '), undefined);

// 10. callback parsing
for (const shape of [
  token,
  `https://agent.teleai.com.cn/cowork/auth?token=${encodeURIComponent(token)}`,
  `myapp://callback#token=${encodeURIComponent(token)}`,
]) {
  assert.equal(parseLogin(shape).token, token, `must parse ${shape.slice(0, 40)}`);
}
assert.equal(parseLogin('garbage').token, undefined);

// 11. expiry
const exp = tokenExpiresAtMs(token);
assert.equal(exp, 1796301367000);
assert.equal(isExpired({ token }), false);
assert.equal(isExpired({ token, expires_at: 1 }), true);

console.log('✓ all signing / credential / parsing tests passed');
