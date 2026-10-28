import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './icons.mjs';
import { providerHosts } from './provider-hosts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const matches = providerHosts.map((host) => `https://${host}/*`);
const icons = Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icons/${size}.png`]));
const common = {
  manifest_version: 3,
  name: 'Gatebreaker',
  version: metadata.version,
  description: metadata.description,
  homepage_url: 'https://github.com/DavidNiessen/gatebreaker',
  permissions: ['activeTab', 'storage', 'downloads'],
  host_permissions: [...matches, 'https://hypeddit-gates-prod.s3.amazonaws.com/*'],
  icons,
  action: {
    default_title: 'Gatebreaker',
    default_popup: 'popup.html',
    default_icon: icons,
  },
  content_scripts: [
    {
      matches: ['https://hypeddit.com/spotify_callback*'],
      js: ['hypeddit-auth-return.js'],
      run_at: 'document_start',
      all_frames: false,
    },
    {
      matches: ['https://hypeddit.com/*'],
      js: ['hypeddit-captcha.js'],
      world: 'MAIN',
      run_at: 'document_idle',
      all_frames: true,
    },
    {
      matches: ['https://hypeddit.com/*'],
      js: ['captcha-frame.js'],
      run_at: 'document_idle',
      all_frames: true,
    },
    {
      matches,
      js: ['content.js'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
  },
};

for (const browser of ['chrome', 'firefox']) {
  // The path is constructed entirely from the fixed browser names above.
  const outdir = path.join(root, 'dist', browser);
  const relative = path.relative(path.join(root, 'dist'), outdir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Unsafe build directory');
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await cp(path.join(root, 'static'), outdir, { recursive: true });
  await build({
    absWorkingDir: root,
    entryPoints: {
      content: 'src/extension/entrypoints/content.ts',
      'hypeddit-auth-return': 'src/extension/entrypoints/hypeddit-auth-return.ts',
      'hypeddit-captcha': 'src/extension/entrypoints/hypeddit-captcha.ts',
      'captcha-frame': 'src/extension/entrypoints/captcha-frame.ts',
      background: 'src/extension/entrypoints/background.ts',
      popup: 'src/extension/entrypoints/popup.ts',
    },
    outdir,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: browser === 'chrome' ? 'chrome120' : 'firefox140',
    sourcemap: false,
    minify: false,
    legalComments: 'eof',
    logLevel: 'warning',
  });
  const manifest = {
    ...common,
    ...(browser === 'chrome'
      ? {
          minimum_chrome_version: '120',
          background: { service_worker: 'background.js' },
        }
      : {
          background: { scripts: ['background.js'] },
          browser_specific_settings: {
            gecko_android: { strict_min_version: '142.0' },
            gecko: {
              id: 'gatebreaker@davidniessen.github.io',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }),
  };
  await writeFile(path.join(outdir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Built ${browser}: ${path.relative(root, outdir)}`);
}
