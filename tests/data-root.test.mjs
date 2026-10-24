import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { MARKER_FILE, dataPaths, resolveDataRoot } from '../scripts/data-root.mjs';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-fit-data-root-'));
  const toolRoot = path.join(directory, 'remote-fit');
  const dataRoot = path.join(directory, 'career-data');
  fs.mkdirSync(toolRoot);
  fs.mkdirSync(dataRoot);
  return { directory, toolRoot, dataRoot };
}

test('falls back to the tool checkout when no data root is configured', (context) => {
  const { directory, toolRoot } = fixture();
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const paths = dataPaths({ env: {}, toolRoot });
  assert.equal(paths.source, 'standalone');
  assert.equal(paths.dataRoot, toolRoot);
  assert.equal(paths.profile, path.join(toolRoot, 'config', 'profile.yml'));
  assert.equal(paths.interviews, path.join(toolRoot, 'output', 'interviews'));
  assert.equal(paths.agentsGuide, null);
});

test('reads the first non-comment line of the marker file relative to the tool root', (context) => {
  const { directory, toolRoot, dataRoot } = fixture();
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(toolRoot, MARKER_FILE), '# private data root\n\n../career-data\n');
  const paths = dataPaths({ env: {}, toolRoot });
  assert.equal(paths.source, 'marker');
  assert.equal(paths.dataRoot, dataRoot);
  assert.equal(paths.exists, true);
  assert.equal(paths.profile, path.join(dataRoot, 'config', 'remote-fit.yml'));
  assert.equal(paths.interviews, path.join(dataRoot, 'interview-prep'));
  assert.equal(paths.agentsGuide, path.join(dataRoot, 'AGENTS.md'));
});

test('lets the environment variable override the marker file', (context) => {
  const { directory, toolRoot, dataRoot } = fixture();
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(toolRoot, MARKER_FILE), '/somewhere/else\n');
  const resolved = resolveDataRoot({ env: { REMOTE_FIT_DATA: ` ${dataRoot} ` }, toolRoot });
  assert.deepEqual(resolved, { source: 'env', dataRoot });
});

test('reports a configured data root that does not exist', (context) => {
  const { directory, toolRoot } = fixture();
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const paths = dataPaths({ env: { REMOTE_FIT_DATA: '../missing' }, toolRoot });
  assert.equal(paths.exists, false);
});
