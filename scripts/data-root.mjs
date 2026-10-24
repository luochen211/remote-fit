#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MARKER_FILE = '.remote-fit-data';
export const ENV_VAR = 'REMOTE_FIT_DATA';

function readMarker(markerPath) {
  if (!fs.existsSync(markerPath)) return null;
  const line = fs.readFileSync(markerPath, 'utf8')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value && !value.startsWith('#'));
  return line || null;
}

// Precedence: REMOTE_FIT_DATA, then the .remote-fit-data marker, then the tool checkout itself.
export function resolveDataRoot({ env = process.env, toolRoot = TOOL_ROOT } = {}) {
  const fromEnv = env[ENV_VAR]?.trim();
  if (fromEnv) return { source: 'env', dataRoot: path.resolve(toolRoot, fromEnv) };
  const fromMarker = readMarker(path.join(toolRoot, MARKER_FILE));
  if (fromMarker) return { source: 'marker', dataRoot: path.resolve(toolRoot, fromMarker) };
  return { source: 'standalone', dataRoot: toolRoot };
}

// An external data root may already hold another tool's config/profile.yml,
// so RemoteFit keeps its own preferences in config/remote-fit.yml there.
export function dataPaths(options = {}) {
  const { source, dataRoot } = resolveDataRoot(options);
  const external = source !== 'standalone';
  return {
    source,
    dataRoot,
    exists: fs.existsSync(dataRoot),
    agentsGuide: external ? path.join(dataRoot, 'AGENTS.md') : null,
    cv: path.join(dataRoot, 'cv.md'),
    profile: path.join(dataRoot, 'config', external ? 'remote-fit.yml' : 'profile.yml'),
    contentPolicy: path.join(dataRoot, 'config', 'content-policy.json'),
    evidence: path.join(dataRoot, 'evidence'),
    data: path.join(dataRoot, 'data'),
    interviews: path.join(dataRoot, ...(external ? ['interview-prep'] : ['output', 'interviews']))
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const paths = dataPaths();
  console.log(JSON.stringify(paths, null, 2));
  if (!paths.exists) {
    console.error(`Data root does not exist: ${paths.dataRoot} (from ${paths.source})`);
    process.exitCode = 1;
  }
}
