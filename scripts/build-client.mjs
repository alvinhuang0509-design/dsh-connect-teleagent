// Bundle the settings panel into a window.__ModuleLoader__ CommonJS module.
// Mirrors the pattern used by dsh-codearts-auth / dsh-rhine-splash.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'lib/client.js');

const result = await build({
  entryPoints: [resolve(root, 'plugin-src/client/index.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome100'],
  charset: 'utf8',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  write: false,
  minify: false,
  legalComments: 'none',
});

const code = result.outputFiles?.[0]?.text;
if (!code) throw new Error('esbuild produced no client bundle');

const wrapped = `window.__ModuleLoader__.load({
  id: "dsh-connect-teleagent",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  }
});
`;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, wrapped, 'utf8');
console.log(`Wrote ${out} (${wrapped.length} bytes)`);
