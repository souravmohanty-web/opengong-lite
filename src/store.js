import {
  openSync, writeSync, fsyncSync, closeSync, renameSync, mkdirSync,
  readFileSync, existsSync, readdirSync,
} from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// Run-record durability primitives (technical-spec-core.md §run-records,
// research/03-harness.md Part 4). Two different problems, two mechanisms:
//   writeAtomic  — temp-write + fsync + rename, so a reader NEVER observes a
//                  half-written run.json (crash mid-write leaves the OLD file).
//   makeQueue    — single-writer serialization, so concurrent async mutators
//                  (p-limit(3) fan-out journalling calls) never interleave a
//                  read-modify-write and silently drop one entry.

export function writeAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${path.basename(filePath)}-${process.pid}-${randomBytes(4).toString('hex')}`);
  const buf = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, buf);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, filePath);
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

// A promise-chain mutex: every enqueued fn runs strictly after the previous
// one settles, regardless of how many callers race to enqueue concurrently.
export function makeQueue() {
  let tail = Promise.resolve();
  return function enqueue(fn) {
    const run = tail.then(fn, fn);
    tail = run.then(() => {}, () => {});
    return run;
  };
}

export function listRunDirs(runsRoot) {
  if (!existsSync(runsRoot)) return [];
  return readdirSync(runsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(runsRoot, d.name));
}
