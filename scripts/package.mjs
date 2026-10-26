import { zipSync } from 'fflate';
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
await writeFile(path.join(release, 'SHA256SUMS'), `${sums.join('\n')}\n`);
