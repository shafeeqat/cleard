// Runs every *.test.mjs in this directory sequentially and exits non-zero if
// any of them failed an assertion. Usage: node tests/run-all.mjs
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(__dirname).filter((f) => f.endsWith('.test.mjs')).sort();

let anyFailed = false;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  try {
    await import(pathToFileURL(join(__dirname, file)).href);
    if (process.exitCode) anyFailed = true;
    process.exitCode = 0; // reset between files; we track failure ourselves
  } catch (e) {
    anyFailed = true;
    console.error(e.message);
  }
}

process.exitCode = anyFailed ? 1 : 0;
console.log(anyFailed ? '\nSome tests FAILED.' : '\nAll tests passed.');
