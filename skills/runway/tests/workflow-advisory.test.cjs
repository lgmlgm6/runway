const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateFile } = require('../lib/state.cjs');
const { writeCheckpoint } = require('../lib/reports.cjs');
const { getWorkflowAdvisory } = require('../lib/workflow-advisory.cjs');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runway-advisory-'));
}

test('getWorkflowAdvisory returns a soft warning when an active runway workflow exists', () => {
  const rootDir = makeTempRoot();
  const statePath = initStateFile({
    rootDir,
    name: 'pipeline.local.md',
    mode: 'pipeline',
    maxIterations: 20,
    completionPromise: 'DONE',
    sessionId: 'session-1',
    startedAt: '2026-04-15T10:00:00Z',
    prompt: 'pipeline loop',
  });
  fs.utimesSync(statePath, new Date('2026-04-15T12:00:00Z'), new Date('2026-04-15T12:00:00Z'));
  writeCheckpoint(rootDir, {
    ones_work_item_id: '456',
    current_stage: 5,
    updated_at: '2026-04-15T12:05:00Z',
  });

  const message = getWorkflowAdvisory({
    toolName: 'Edit',
    filePath: path.join(rootDir, 'src', 'feature.js'),
    cwd: rootDir,
    sessionId: 'session-1',
    now: new Date('2026-04-15T12:30:00Z'),
    maxAgeMs: 7200000,
  });

  assert.match(message, /RUNWAY WORKFLOW ADVISORY/);
  assert.match(message, /pipeline/);
  assert.match(message, /Stage 5/);
  assert.match(message, /ONES 456/);
  assert.match(message, /runway-tools\.cjs" status/);
});

test('getWorkflowAdvisory stays silent for runway state files and subagent edits', () => {
  const rootDir = makeTempRoot();
  assert.equal(getWorkflowAdvisory({
    toolName: 'Edit',
    filePath: path.join(rootDir, '.runway', 'project.json'),
    cwd: rootDir,
  }), null);

  assert.equal(getWorkflowAdvisory({
    toolName: 'Edit',
    filePath: path.join(rootDir, 'src', 'feature.js'),
    cwd: rootDir,
    isSubagent: true,
  }), null);
});
