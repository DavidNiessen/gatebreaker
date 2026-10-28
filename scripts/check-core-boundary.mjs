import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const core = path.join(root, 'src', 'core');

async function sources(directory) {
  const names = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) names.push(...(await sources(name)));
    else if (entry.isFile() && name.endsWith('.ts')) names.push(name);
  }
  return names;
}

/** Prevent a source move from silently reintroducing extension or implicit-browser I/O. */
export async function assertCoreBoundary() {
  const errors = [];
  const files = await sources(core);
  for (const filename of files) {
    const text = await readFile(filename, 'utf8');
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
    const report = (node, message) => {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      errors.push(`${path.relative(root, filename)}:${line}: ${message}`);
    };
    const dependency = (node, specifier) => {
      if (!specifier.startsWith('.')) {
        report(node, `Core dependencies must be internal or injected, received ${specifier}`);
        return;
      }
      const relative = path.relative(core, path.resolve(path.dirname(filename), specifier));
      if (relative.startsWith('..') || path.isAbsolute(relative))
        report(node, `Core cannot import outside src/core: ${specifier}`);
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        dependency(node, node.moduleSpecifier.text);
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      )
        dependency(node, node.argument.literal.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const target = node.arguments[0];
        if (target && ts.isStringLiteral(target)) dependency(node, target.text);
        else report(node, 'Core dynamic imports must have a statically declared internal target');
      }
      if (ts.isPropertyAccessExpression(node)) {
        if (['localStorage', 'sessionStorage', 'cookie'].includes(node.name.text))
          report(node, 'Native browser session access belongs in a host adapter');
        if (
          ts.isIdentifier(node.expression) &&
          ['chrome', 'browser', 'window'].includes(node.expression.text)
        )
          report(node, 'Browser globals belong in the extension adapter');
        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'globalThis' &&
          node.name.text === 'fetch'
        )
          report(node, 'HTTP must use the injected provider transport');
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        if (['open', 'dispatchEvent'].includes(node.expression.name.text))
          report(node, 'Opening windows and dispatching UI events belongs in the extension');
        if (
          node.expression.name.text === 'addEventListener' &&
          ['view', 'window', 'document', 'document.defaultView'].includes(
            node.expression.expression.getText(source),
          )
        )
          report(node, 'Browser event observation belongs in the extension');
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'DOMParser'
      )
        report(node, 'HTML parsing must use the injected parser');
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  if (errors.length) throw new Error('Core boundary violations:\n' + errors.join('\n'));
  return files.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = await assertCoreBoundary();
  console.log(`Core boundary passed: ${count} source files`);
}
