import { zipSync } from 'fflate';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const release = path.join(root, 'release');
await mkdir(release, { recursive: true });

async function collect(directory, prefix = '') {
  const entries = {};
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      Object.assign(entries, await collect(path.join(directory, item.name), name));
    } else if (item.isFile()) {
      entries[name] = [
        new Uint8Array(await readFile(path.join(directory, item.name))),
        {
          // ZIP stores local calendar fields, so use a fixed local DOS timestamp.
          mtime: new Date(1980, 0, 1, 0, 0, 0),
          level: 9,
        },
      ];
    }
  }
  return entries;
}

const sums = [];
for (const browser of ['chrome', 'firefox']) {
  const directory = path.join(root, 'dist', browser);
  const entries = await collect(directory);
  if (!entries['manifest.json']) throw new Error(`Build ${browser} before packaging it.`);
  const archive = zipSync(entries);
  const name = `gatebreaker-${metadata.version}-${browser}.zip`;
  await writeFile(path.join(release, name), archive);
  sums.push(`${createHash('sha256').update(archive).digest('hex')}  ${name}`);
  console.log(`Packaged ${name}`);
}
if (!process.env.npm_execpath) throw new Error('Run packaging through npm run package.');
const packed = spawnSync(
  process.execPath,
  [
    process.env.npm_execpath,
    'pack',
    '--workspace',
    'packages/cli',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    release,
  ],
  { cwd: root, encoding: 'utf8' },
);
if (packed.status !== 0) throw new Error('CLI npm pack failed: ' + packed.stderr);
const info = JSON.parse(packed.stdout)[0];
const expected = `gatebreaker-cli-${metadata.version}.tgz`;
if (info.filename !== expected) throw new Error('Unexpected CLI package filename.');
sums.push(
  `${createHash('sha256')
    .update(await readFile(path.join(release, expected)))
    .digest('hex')}  ${expected}`,
);
console.log(`Packaged ${expected}`);
await writeFile(path.join(release, 'SHA256SUMS'), `${sums.join('\n')}\n`);
