/**
 * Runs the spec files listed in execution-order.js strictly one at a time, in
 * array order, stopping at the first failing file.
 *
 *   npm run test:ordered -- [playwright options]
 *
 * Any extra arguments (e.g. --project=chromium --headed) are passed to every
 * `playwright test` run. Without --project, every project in
 * playwright.config.ts runs (chromium, firefox, webkit).
 *
 * Runner-only options:
 *   --dry-run        validate the list (files exist) and print the order
 *   --order=<file>   use another order module instead of execution-order.js
 *
 * Each run writes a blob report; at the end they are merged into the usual
 * playwright-report/ HTML report (also when a file failed).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const blobRoot = path.join(root, 'blob-report');
const mergeDir = path.join(blobRoot, 'all');

let dryRun = false;
let orderModule = path.join(root, 'execution-order.js');
const passthrough = [];
for (const arg of process.argv.slice(2)) {
  if (arg === '--dry-run') dryRun = true;
  else if (arg.startsWith('--order=')) orderModule = path.resolve(arg.slice('--order='.length));
  else passthrough.push(arg);
}

const { executionOrder } = require(orderModule);

// 1. Validate: non-empty, no duplicates, every file exists.
const problems = [];
if (!Array.isArray(executionOrder) || executionOrder.length === 0) {
  problems.push('executionOrder is empty.');
}
const seen = new Set();
for (const spec of executionOrder) {
  if (seen.has(spec)) problems.push(`Duplicate entry: ${spec}`);
  seen.add(spec);
  if (!fs.existsSync(path.join(root, spec))) problems.push(`File not found: ${spec}`);
}
if (problems.length > 0) {
  console.error('Invalid execution order:\n  ' + problems.join('\n  '));
  process.exit(2);
}

console.log('Execution order:');
executionOrder.forEach((spec, i) => console.log(`  ${i + 1}. ${spec}`));
if (dryRun) {
  console.log('\nDry run: all files exist, nothing executed.');
  process.exit(0);
}

// Invoke Playwright's CLI through node directly: no shell, so paths with
// spaces and quoting behave the same on Windows and Linux.
const playwrightCli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');

fs.rmSync(blobRoot, { recursive: true, force: true });
fs.mkdirSync(mergeDir, { recursive: true });

function run(args, env) {
  return spawnSync(process.execPath, [playwrightCli, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  }).status;
}

let failedSpec = null;
let failedCode = 0;

for (let i = 0; i < executionOrder.length; i++) {
  const spec = executionOrder[i];
  console.log(`\n=== [${i + 1}/${executionOrder.length}] ${spec} ===\n`);

  const blobDir = path.join(blobRoot, String(i + 1));
  const status = run(
    ['test', spec, '--workers=1', '--reporter=list,blob', ...passthrough],
    { PLAYWRIGHT_BLOB_OUTPUT_DIR: blobDir }
  );

  if (fs.existsSync(blobDir)) {
    for (const f of fs.readdirSync(blobDir)) {
      fs.copyFileSync(path.join(blobDir, f), path.join(mergeDir, `${String(i + 1).padStart(2, '0')}-${f}`));
    }
  }

  if (status !== 0) {
    failedSpec = spec;
    failedCode = status ?? 1;
    break;
  }
}

// Merge whatever ran into the single HTML report.
if (fs.readdirSync(mergeDir).length > 0) {
  run(['merge-reports', '--reporter=html', mergeDir], { PLAYWRIGHT_HTML_OPEN: 'never' });
}

if (failedSpec) {
  console.error(`\nStopped: "${failedSpec}" failed. Remaining files were not run.`);
  process.exit(failedCode);
}
console.log('\nAll files in the execution order passed.');
