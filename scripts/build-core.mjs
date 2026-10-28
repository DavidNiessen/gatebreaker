import { build } from 'esbuild';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { assertCoreBoundary } from './check-core-boundary.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await assertCoreBoundary();
const outdir = path.resolve(root, 'dist', 'core');
const relative = path.relative(path.resolve(root, 'dist'), outdir);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
  throw new Error('Unsafe core build directory');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/core/index.ts'],
  outfile: path.join(outdir, 'index.js'),
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  sourcemap: false,
  legalComments: 'eof',
});
const declaration = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(root, 'tsconfig.core.json')],
  { cwd: root, stdio: 'inherit' },
);
if (declaration.status !== 0) throw new Error('Core declaration build failed');
async function declarations(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await declarations(name)));
    else if (entry.isFile() && name.endsWith('.d.ts')) files.push(name);
  }
  return files;
}
async function exists(name) {
  try {
    await access(name);
    return true;
  } catch {
    return false;
  }
}
// Bundler-mode sources omit extensions. Published ESM declarations must still
// resolve under NodeNext, including directory barrels, without consumer shims.
for (const filename of await declarations(path.join(outdir, 'types'))) {
  const source = await readFile(filename, 'utf8');
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const literals = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      literals.push(node.moduleSpecifier);
    else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      literals.push(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  const changes = [];
  for (const literal of literals) {
    if (!literal.text.startsWith('.') || path.extname(literal.text)) continue;
    const target = path.resolve(path.dirname(filename), literal.text);
    const suffix = (await exists(target + '.d.ts'))
      ? '.js'
      : (await exists(path.join(target, 'index.d.ts')))
        ? '/index.js'
        : null;
    if (!suffix) throw new Error('Unresolved emitted core type: ' + literal.text);
    changes.push({
      start: literal.getStart(parsed),
      end: literal.end,
      text: JSON.stringify(literal.text + suffix),
    });
  }
  let output = source;
  for (const change of changes.sort((a, b) => b.start - a.start))
    output = output.slice(0, change.start) + change.text + output.slice(change.end);
  if (output !== source) await writeFile(filename, output);
}
await writeFile(path.join(outdir, 'index.d.ts'), "export * from './types/core/index.js';\n");
const validation = ts.createProgram([path.join(outdir, 'index.d.ts')], {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: [],
  strict: true,
  skipLibCheck: false,
  noEmit: true,
});
const diagnostics = ts.getPreEmitDiagnostics(validation);
if (diagnostics.length) {
  process.stderr.write(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }),
  );
  throw new Error('Core declarations do not support NodeNext consumers');
}
console.log('Built core: dist/core/index.js and declarations');
