// Guard a visual change against accidental service/action/contract modifications.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const baseline = process.argv[2] ?? 'HEAD';
const files = execFileSync('git', ['diff', '--name-only', baseline], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
assert.ok(files.every((file) => !/^(prisma\/|src\/lib\/|src\/app\/api\/)/.test(file) && !/\/actions\.ts$/.test(file)), 'Visual change must not modify DB, services, Auth, APIs or server actions');
const printer = ts.createPrinter();
function contracts(file, source) {
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls = [];
  const handlers = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (/Action$/.test(node.expression.text) || /^(get|list)[A-Z]/.test(node.expression.text))) {
      calls.push(printer.printNode(ts.EmitHint.Unspecified, node, root));
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body && !node.name.text.endsWith('Page') && !/^[A-Z]/.test(node.name.text)) {
      // statusLabel is a removed presentation-only label map, not an action.
      if (node.name.text !== 'statusLabel') handlers.push(printer.printNode(ts.EmitHint.Unspecified, node, root));
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return { calls: calls.sort(), handlers: handlers.sort() };
}
let count = 0;
for (const file of files.filter((name) => name.endsWith('.tsx'))) {
  const old = execFileSync('git', ['show', baseline + ':' + file], { encoding: 'utf8' });
  assert.deepEqual(contracts(file, readFileSync(file, 'utf8')), contracts(file, old), file + ': action calls, data queries and handlers unchanged');
  count++;
}
console.log(`Presentation contracts: ${count} changed TSX files OK; queries, action arguments and handlers unchanged`);
