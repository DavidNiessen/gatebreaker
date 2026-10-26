import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const matches = ['https://hypeddit.com/*', 'https://www.hypeddit.com/*'];
const icons = Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icons/${size}.png`]));
const common = {
  manifest_version: 3,
  name: 'Gatebreak',
  version: metadata.version,
  description: metadata.description,
  homepage_url: 'https://github.com/DavidNiessen/gatebreak',
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: matches,
  icons,
  action: {
    default_title: 'Gatebreak',
    default_popup: 'popup.html',
    default_icon: icons,
  },
  content_scripts: [
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
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await cp(path.join(root, 'static'), outdir, { recursive: true });
  await build({
    absWorkingDir: root,
    entryPoints: {
      content: 'src/entrypoints/content.ts',
      background: 'src/entrypoints/background.ts',
      popup: 'src/entrypoints/popup.ts',
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
            gecko: {
              id: 'gatebreak@davidniessen.github.io',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }),
  };
  await writeFile(path.join(outdir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Built ${browser}: ${path.relative(root, outdir)}`);
}
