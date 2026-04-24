const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeCheckpoint, writeReport } = require('../lib/reports.cjs');
const { initStateFile } = require('../lib/state.cjs');
const { resolveStatus, resolveWorkflowAdvisory } = require('../lib/status.cjs');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runway-status-'));
}

test('resolveStatus aggregates checkpoint, reports, and active state', () => {
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
    ones_work_item_id: '123',
    current_stage: 6,
    updated_at: '2026-04-15T12:05:00Z',
    plan_path: '.runway/plans/demo.md',
  });
  writeReport({
    rootDir,
    onesId: '123',
    reportKey: 'cr_report',
    content: '# CR report\n',
  });

  assert.deepEqual(resolveStatus(rootDir, '123', {
    sessionId: 'session-1',
    now: new Date('2026-04-15T12:30:00Z'),
    maxAgeMs: 7200000,
  }), {
    ones_id: '123',
    checkpoint: {
      path: '.runway/checkpoint-123.json',
      exists: true,
      data: {
        ones_work_item_id: '123',
        current_stage: 6,
        updated_at: '2026-04-15T12:05:00Z',
        plan_path: '.runway/plans/demo.md',
        docs: {
          cr_report: '.runway/docs/123/cr-report.md',
        },
      },
    },
    active_state: {
      path: '.claude/runway-state/pipeline.local.md',
      stale: false,
      state: {
        active: true,
        mode: 'pipeline',
        iteration: 1,
        max_iterations: 20,
        completion_promise: 'DONE',
        session_id: 'session-1',
        started_at: '2026-04-15T10:00:00Z',
        prompt: 'pipeline loop',
      },
    },
    artifacts: {},
    reports: {
      execution_report: {
        path: '.runway/docs/123/execution-report.md',
        exists: false,
        registered_path: null,
      },
      cr_report: {
        path: '.runway/docs/123/cr-report.md',
        exists: true,
        registered_path: '.runway/docs/123/cr-report.md',
      },
      qa_report: {
        path: '.runway/docs/123/qa-report.md',
        exists: false,
        registered_path: null,
      },
    },
  });
});

test('resolveStatus exposes xuecheng artifact links from checkpoint IDs', () => {
  const rootDir = makeTempRoot();

  writeCheckpoint(rootDir, {
    ones_work_item_id: '789',
    current_stage: 2,
    requirements_spec_content_id: 'spec-123',
    tech_spec_content_id: 'local:.runway/docs/789/tech-spec-draft.md',
    updated_at: '2026-04-15T12:05:00Z',
  });

  assert.deepEqual(resolveStatus(rootDir, '789').artifacts, {
    requirements_spec: {
      content_id: 'spec-123',
      url: 'https://km.sankuai.com/collabpage/spec-123',
    },
    tech_spec: {
      content_id: 'local:.runway/docs/789/tech-spec-draft.md',
      path: '.runway/docs/789/tech-spec-draft.md',
    },
  });
});

test('resolveWorkflowAdvisory returns active workflow with latest checkpoint summary', () => {
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

  assert.deepEqual(resolveWorkflowAdvisory(rootDir, {
    sessionId: 'session-1',
    now: new Date('2026-04-15T12:30:00Z'),
    maxAgeMs: 7200000,
  }), {
    active_state: {
      path: '.claude/runway-state/pipeline.local.md',
      stale: false,
      state: {
        active: true,
        mode: 'pipeline',
        iteration: 1,
        max_iterations: 20,
        completion_promise: 'DONE',
        session_id: 'session-1',
        started_at: '2026-04-15T10:00:00Z',
        prompt: 'pipeline loop',
      },
    },
    checkpoint: {
      ones_id: '456',
      path: '.runway/checkpoint-456.json',
      current_stage: 5,
      updated_at: '2026-04-15T12:05:00Z',
      active: true,
    },
  });
});
