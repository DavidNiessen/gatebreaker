import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this check through npm run test:cli:package.');
const temporary = await mkdtemp(path.join(tmpdir(), 'gatebreaker-consumer-'));
const metadata = JSON.parse(await readFile(path.join(root, 'packages/cli/package.json'), 'utf8'));
function execute(args, cwd = temporary) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0)
    throw new Error(`Consumer check failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
try {
  const packed = JSON.parse(
    execute(
      [
        npm,
        'pack',
        '--workspace',
        'packages/cli',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporary,
      ],
      root,
    ),
  )[0];
  assert.equal(packed.name, 'gatebreaker-cli');
  for (const expected of [
    'dist/browser.js',
    'dist/browser-extension/manifest.json',
    'dist/browser-extension/content.js',
  ])
    assert(
      packed.files.some(({ path: filename }) => filename === expected),
      `Missing browser host: ${expected}`,
    );
  assert(packed.files.some(({ path: filename }) => filename === 'dist/cli.js'));
  assert(packed.files.some(({ path: filename }) => filename === 'dist/core/index.d.ts'));
  for (const { path: filename } of packed.files)
    assert(
      /^(?:dist\/|package\.json$|README\.md$|LICENSE$|PRIVACY\.md$)/.test(filename),
      `Unexpected packed file: ${filename}`,
    );
  const consumer = path.join(temporary, 'consumer');
  await mkdir(consumer);
  await writeFile(
    path.join(consumer, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  execute(
    [
      npm,
      'install',
      '--omit=dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      path.join(temporary, packed.filename),
    ],
    consumer,
  );
  const bin = path.join(consumer, 'node_modules/gatebreaker-cli/dist/cli.js');
  assert.equal(execute([bin, '--version'], consumer).trim(), metadata.version);
  const help = execute([bin, '--help'], consumer);
  assert.match(help, /Usage: gatebreaker/);
  assert.doesNotMatch(help, /^\s+--browser(?:\s|$)/m);
  const removed = spawnSync(process.execPath, [bin, '--browser'], {
    cwd: consumer,
    encoding: 'utf8',
  });
  assert.equal(removed.status, 2);
  assert.match(removed.stderr, /Unknown option/);
  assert.equal(JSON.parse(execute([bin, '--providers', '--json'], consumer)).length, 13);
  // npm must resolve the installed executable itself, including Windows' command shim.
  assert.equal(
    execute([npm, 'exec', '--offline', '--', 'gatebreaker', '--version'], consumer).trim(),
    metadata.version,
  );
  const fixture = path.join(consumer, 'fixture.mjs');
  await writeFile(
    fixture,
    `
    import assert from 'node:assert/strict';
    import { createGatebreaker, providers } from 'gatebreaker-cli/core';
    assert.equal(typeof createGatebreaker, 'function');
    assert.equal(providers.length, 13);
    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'https://boost.ink/package-fixture');
      return new Response('<button class="complete_btn">Proceed</button><script src="/assets/js/unlock.js?v=3.5.10" bufpsvdhmjybvgfncqfa="' + btoa('https://files.example/original.wav?signature=authored%2Fvalue') + '"></script>');
    };
  `,
  );
  const result = JSON.parse(
    execute(
      ['--import', pathToFileURL(fixture).href, bin, '--json', 'https://boost.ink/package-fixture'],
      consumer,
    ),
  );
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://files.example/original.wav?signature=authored%2Fvalue');
  console.log(
    `Verified clean production install, npm executable and core export: ${packed.filename}`,
  );
} finally {
  // Only the exact directory created by mkdtemp above can be removed.
  if (
    path.dirname(temporary) === path.resolve(tmpdir()) &&
    path.basename(temporary).startsWith('gatebreaker-consumer-')
  )
    await rm(temporary, { recursive: true, force: true });
}
