// Render actual module pages in isolation. Never bootstraps a session or touches production data.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { fixture, constants } from '../tests/visual-system-fixture.mjs';

const root = process.cwd();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'billetera-visual-'));
const pages = ['tickets/page', 'tickets/nuevo/page', 'tickets/[number]/page', 'pedidos/page', 'pedidos/nuevo/page', 'pedidos/[number]/page', 'incidencias/page', 'incidencias/nueva/page', 'incidencias/[number]/page', 'campanas/page', 'campanas/nueva/page', 'campanas/[campaignId]/page', 'equipo/page', 'equipo/[memberId]/page', 'actividad/page', 'configuracion/page'];
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: 'visual' };
const output = path.join(temporary, 'pages.cjs');
let preserve = false;
try {
  await build({ stdin: { contents: pages.map((route, index) => `export { default as page${index} } from ${JSON.stringify(path.join(root, 'src/app', route + '.tsx'))};`).join('\n'), resolveDir: root, loader: 'tsx' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': path.join(root, 'src') }, plugins: [{ name: 'presentation-fixtures', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/(authorization|auth\/server|.*-service|.*-repository)$/ }, ({ path: module }) => ({ path: module, namespace: 'visual-data' }));
    builder.onLoad({ filter: /.*/, namespace: 'visual-data' }, () => ({ contents: `const f=globalThis.__visualFixture; const c=globalThis.__visualConstants;\n${Object.keys(fixture).map((name) => `export const ${name}=(...args)=>f.${name}(...args);`).join('\n')}\n${Object.keys(constants).map((name) => `export const ${name}=c.${name};`).join('\n')}\nexport class CaseConversationValidationError extends Error {}\nexport class TeamMemberNotFoundError extends Error {}`, loader: 'js' }));
    builder.onResolve({ filter: /^@\/app\/.*(?:actions|invitation-actions)$/ }, ({ path: module }) => ({ path: module, namespace: 'visual-actions' }));
    builder.onLoad({ filter: /.*/, namespace: 'visual-actions' }, async ({ path: module }) => {
      const source = await readFile(path.join(root, 'src', module.slice(2) + '.ts'), 'utf8');
      const names = [...source.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((match) => match[1]);
      return { contents: names.map((name) => `export async function ${name}(){throw new Error('No writes allowed in visual fixtures');}`).join('\n'), loader: 'js' };
    });
    builder.onResolve({ filter: /^@\/lib\/auth\/client$/ }, () => ({ path: 'auth-client', namespace: 'visual-auth' }));
    builder.onLoad({ filter: /.*/, namespace: 'visual-auth' }, () => ({ contents: `export const authClient={};`, loader: 'js' }));
  } }] });
  globalThis.__visualFixture = fixture;
  globalThis.__visualConstants = constants;
  // The bundle is outside the repo; resolve its existing dependencies without installing anything.
  const Module = require('node:module');
  process.env.NODE_PATH = path.join(root, 'node_modules'); Module.Module._initPaths();
  const rendered = require(output);
  // Compile the current stylesheet, not stale .next output; no Auth secret needed for visual QA.
  const { compile } = require('@tailwindcss/node');
  const { Scanner } = require('@tailwindcss/oxide');
  const compiler = await compile(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { base: path.join(root, 'src/app'), onDependency() {} });
  const scanner = new Scanner({ sources: [{ base: root, pattern: 'src/**/*.tsx', negated: false }] });
  const css = compiler.build(scanner.scan());
  let count = 0;
  for (let i = 0; i < pages.length; i++) {
    const tree = await rendered[`page${i}`]({ params: Promise.resolve({ number: '42', memberId: 'visual-member', campaignId: 'visual-campaign' }), searchParams: Promise.resolve({}) });
    const content = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router }, tree));
    assert.ok(content.includes('<h1'), pages[i] + ': heading');
    assert.ok(!content.includes('min-w-[900px]') && !content.includes('min-w-[760px]'), pages[i] + ': no forced wide table');
    assert.ok(!content.includes('rounded-2xl'), pages[i] + ': no generic cards');
    const name = pages[i].replaceAll('/', '-').replaceAll('[', '').replaceAll(']', '') + '.html';
    const shell = '<aside class="app-sidebar"><div class="sidebar-brand"><strong class="brand-wordmark">BILLETERA</strong><span class="sidebar-caption">CARTERA DE PRUEBA VISUAL</span></div><nav class="sidebar-nav"><a class="nav-link nav-link-active" href="#">Operación</a><a class="nav-link" href="#">Contactos</a><a class="nav-link" href="#">Bandeja</a></nav></aside><div class="mobile-app-bar"><strong class="brand-wordmark">BILLETERA</strong></div>';
    await writeFile(path.join(temporary, name), '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body class="signed-in">' + shell + '<div class="app-content">' + content + '</div></body></html>');
    count++;
  }
  console.log(`Visual SSR: ${count}/${pages.length} module pages OK; no DB/Auth/Meta operations`);
  if (process.argv.includes('--keep')) { preserve = true; console.log('Visual fixtures: ' + temporary); }
} finally {
  delete globalThis.__visualFixture; delete globalThis.__visualConstants;
  if (!preserve) await rm(temporary, { recursive: true, force: true });
}
