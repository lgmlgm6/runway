const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  initStateFile,
  readStateFile,
  updateStateFile,
  deactivateStateFile,
  isStateFileStale,
  resolveActiveState,
} = require('../lib/state.cjs');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runway-state-'));
}

test('initStateFile creates a state file with frontmatter and prompt body', () => {
  const rootDir = makeTempRoot();
  const filePath = initStateFile({
    rootDir,
    name: 'pipeline.local.md',
    mode: 'pipeline',
    maxIterations: 20,
    completionPromise: 'DONE',
    sessionId: 'session-1',
    startedAt: '2026-04-15T10:00:00Z',
    prompt: 'continue from here',
  });

  const state = readStateFile(filePath);
  assert.equal(state.active, true);
  assert.equal(state.mode, 'pipeline');
  assert.equal(state.iteration, 1);
  assert.equal(state.max_iterations, 20);
  assert.equal(state.completion_promise, 'DONE');
  assert.equal(state.session_id, 'session-1');
  assert.equal(state.started_at, '2026-04-15T10:00:00Z');
  assert.equal(state.prompt, 'continue from here');
});

test('updateStateFile merges fields and deactivateStateFile flips active false', () => {
  const rootDir = makeTempRoot();
  const filePath = initStateFile({
    rootDir,
    name: 'pipeline.local.md',
    mode: 'pipeline',
    maxIterations: 10,
    completionPromise: 'DONE',
    sessionId: 'session-1',
    startedAt: '2026-04-15T10:00:00Z',
    prompt: 'continue',
  });

  updateStateFile(filePath, { iteration: 3, max_iterations: 12 });
  let state = readStateFile(filePath);
  assert.equal(state.iteration, 3);
  assert.equal(state.max_iterations, 12);
  assert.equal(state.active, true);

  deactivateStateFile(filePath);
  state = readStateFile(filePath);
  assert.equal(state.active, false);
});

test('isStateFileStale treats old files as stale', () => {
  const rootDir = makeTempRoot();
  const filePath = initStateFile({
    rootDir,
    name: 'pipeline.local.md',
    mode: 'pipeline',
    maxIterations: 10,
    completionPromise: 'DONE',
    sessionId: 'session-1',
    startedAt: '2026-04-15T10:00:00Z',
    prompt: 'continue',
  });

  const staleAt = new Date('2026-04-15T10:00:00Z');
  const freshAt = new Date('2026-04-15T11:00:00Z');
  fs.utimesSync(filePath, staleAt, staleAt);

  assert.equal(isStateFileStale(filePath, { now: new Date('2026-04-15T13:00:01Z'), maxAgeMs: 2 * 60 * 60 * 1000 }), true);
  assert.equal(isStateFileStale(filePath, { now: freshAt, maxAgeMs: 2 * 60 * 60 * 1000 }), false);
});

test('resolveActiveState ignores stale state and returns the active fresh state', () => {
  const rootDir = makeTempRoot();
  const staleFile = initStateFile({
    rootDir,
    name: 'triangle-loop.local.md',
    mode: 'triangle',
    maxIterations: 10,
    completionPromise: null,
    sessionId: 'session-1',
    startedAt: '2026-04-15T10:00:00Z',
    prompt: 'triangle loop',
  });
  const freshFile = initStateFile({
    rootDir,
    name: 'pipeline.local.md',
    mode: 'pipeline',
    maxIterations: 10,
    completionPromise: 'DONE',
    sessionId: 'session-1',
    startedAt: '2026-04-15T10:00:00Z',
    prompt: 'pipeline loop',
  });

  fs.utimesSync(staleFile, new Date('2026-04-15T10:00:00Z'), new Date('2026-04-15T10:00:00Z'));
  fs.utimesSync(freshFile, new Date('2026-04-15T12:00:00Z'), new Date('2026-04-15T12:00:00Z'));

  const resolved = resolveActiveState({
    rootDir,
    sessionId: 'session-1',
    now: new Date('2026-04-15T12:30:00Z'),
    maxAgeMs: 2 * 60 * 60 * 1000,
  });

  assert.equal(resolved.filePath, freshFile);
  assert.equal(resolved.state.mode, 'pipeline');
});
