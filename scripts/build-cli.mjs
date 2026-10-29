import { build } from 'esbuild';
import { chmod, cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'packages/cli');
const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
const rootMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (metadata.version !== rootMetadata.version) throw new Error('CLI and root versions must match.');
const output = path.resolve(directory, 'dist');
if (path.dirname(output) !== path.resolve(directory) || path.basename(output) !== 'dist')
  throw new Error('Unsafe CLI build directory.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/cli/main.ts'],
  outfile: path.join(directory, 'dist/cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: false,
  legalComments: 'eof',
  define: { GATEBREAKER_VERSION: JSON.stringify(metadata.version) },
});
await chmod(path.join(directory, 'dist/cli.js'), 0o755);
await cp(path.join(root, 'dist/core'), path.join(directory, 'dist/core'), { recursive: true });
for (const name of ['LICENSE', 'PRIVACY.md'])
  await cp(path.join(root, name), path.join(directory, name));
console.log('Built CLI: packages/cli/dist/cli.js');
