const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cliPath = path.join(__dirname, '..', 'bin', 'runway-tools.cjs');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runway-cli-'));
}

test('report-path command prints canonical path as json', () => {
  const result = spawnSync(process.execPath, [cliPath, 'report-path', '--root', '/tmp/project', '--ones-id', '123', '--report', 'cr_report'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    report: 'cr_report',
    path: '/tmp/project/.runway/docs/123/cr-report.md',
  });
});

test('artifacts-invalidate command prints invalidation payload', () => {
  const result = spawnSync(process.execPath, [cliPath, 'artifacts-invalidate', '--artifact', 'task_plan'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.invalidated, [
    'branch_execution',
    'execution_report',
    'cr_report',
    'qa_report',
  ]);
  assert.equal(payload.resume_from_stage, 4);
});

test('state-init and state-update commands manage runtime state files', () => {
  const rootDir = makeTempRoot();
  const promptPath = path.join(rootDir, 'prompt.md');
  fs.writeFileSync(promptPath, 'continue from current step');

  const initResult = spawnSync(process.execPath, [
    cliPath,
    'state-init',
    '--root', rootDir,
    '--name', 'pipeline.local.md',
    '--mode', 'pipeline',
    '--max-iterations', '20',
    '--completion-promise', 'DONE',
    '--session-id', 'session-1',
    '--started-at', '2026-04-15T10:00:00Z',
    '--prompt-file', promptPath,
  ], {
    encoding: 'utf8',
  });

  assert.equal(initResult.status, 0);
  const initPayload = JSON.parse(initResult.stdout);
  assert.equal(initPayload.path, '.claude/runway-state/pipeline.local.md');

  const statePath = path.join(rootDir, '.claude', 'runway-state', 'pipeline.local.md');
  assert.equal(fs.existsSync(statePath), true);
  assert.match(fs.readFileSync(statePath, 'utf8'), /active: true/);
  assert.match(fs.readFileSync(statePath, 'utf8'), /continue from current step/);

  const updateResult = spawnSync(process.execPath, [
    cliPath,
    'state-update',
    '--root', rootDir,
    '--name', 'pipeline.local.md',
    '--active', 'false',
  ], {
    encoding: 'utf8',
  });

  assert.equal(updateResult.status, 0);
  assert.match(fs.readFileSync(statePath, 'utf8'), /active: false/);
});

test('state-resolve returns the active fresh state for the current session', () => {
  const rootDir = makeTempRoot();
  const stalePromptPath = path.join(rootDir, 'stale-prompt.md');
  const freshPromptPath = path.join(rootDir, 'fresh-prompt.md');
  fs.writeFileSync(stalePromptPath, 'triangle loop');
  fs.writeFileSync(freshPromptPath, 'pipeline loop');

  spawnSync(process.execPath, [
    cliPath,
    'state-init',
    '--root', rootDir,
    '--name', 'triangle-loop.local.md',
    '--mode', 'triangle',
    '--max-iterations', '20',
    '--session-id', 'session-1',
    '--started-at', '2026-04-15T08:00:00Z',
    '--prompt-file', stalePromptPath,
  ], {
    encoding: 'utf8',
  });

  spawnSync(process.execPath, [
    cliPath,
    'state-init',
    '--root', rootDir,
    '--name', 'pipeline.local.md',
    '--mode', 'pipeline',
    '--max-iterations', '20',
    '--session-id', 'session-1',
    '--started-at', '2026-04-15T10:00:00Z',
    '--prompt-file', freshPromptPath,
  ], {
    encoding: 'utf8',
  });

  const stalePath = path.join(rootDir, '.claude', 'runway-state', 'triangle-loop.local.md');
  const freshPath = path.join(rootDir, '.claude', 'runway-state', 'pipeline.local.md');
  fs.utimesSync(stalePath, new Date('2026-04-15T08:00:00Z'), new Date('2026-04-15T08:00:00Z'));
  fs.utimesSync(freshPath, new Date('2026-04-15T12:00:00Z'), new Date('2026-04-15T12:00:00Z'));

  const result = spawnSync(process.execPath, [
    cliPath,
    'state-resolve',
    '--root', rootDir,
    '--session-id', 'session-1',
    '--now', '2026-04-15T12:30:00Z',
    '--max-age-ms', '7200000',
  ], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    path: '.claude/runway-state/pipeline.local.md',
    state: {
      active: true,
      mode: 'pipeline',
      iteration: 1,
      max_iterations: 20,
      completion_promise: null,
      session_id: 'session-1',
      started_at: '2026-04-15T10:00:00Z',
      prompt: 'pipeline loop',
    },
  });
});

test('state-stale reports whether a named state file is stale', () => {
  const rootDir = makeTempRoot();
  const promptPath = path.join(rootDir, 'prompt.md');
  fs.writeFileSync(promptPath, 'continue from current step');

  spawnSync(process.execPath, [
    cliPath,
    'state-init',
    '--root', rootDir,
    '--name', 'pipeline.local.md',
    '--mode', 'pipeline',
    '--max-iterations', '20',
    '--session-id', 'session-1',
    '--started-at', '2026-04-15T10:00:00Z',
    '--prompt-file', promptPath,
  ], {
    encoding: 'utf8',
  });

  const statePath = path.join(rootDir, '.claude', 'runway-state', 'pipeline.local.md');
  fs.utimesSync(statePath, new Date('2026-04-15T10:00:00Z'), new Date('2026-04-15T10:00:00Z'));

  const result = spawnSync(process.execPath, [
    cliPath,
    'state-stale',
    '--root', rootDir,
    '--name', 'pipeline.local.md',
    '--now', '2026-04-15T12:30:01Z',
    '--max-age-ms', '7200000',
  ], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    path: '.claude/runway-state/pipeline.local.md',
    stale: true,
  });
});

test('status command aggregates checkpoint, reports, and active state', () => {
  const rootDir = makeTempRoot();
  const promptPath = path.join(rootDir, 'pipeline-prompt.md');
  const reportPath = path.join(rootDir, 'cr-report.md');
  fs.writeFileSync(promptPath, 'pipeline loop');
  fs.writeFileSync(reportPath, '# CR report\n');

  const initResult = spawnSync(process.execPath, [
    cliPath,
    'state-init',
    '--root', rootDir,
    '--name', 'pipeline.local.md',
    '--mode', 'pipeline',
    '--max-iterations', '20',
    '--completion-promise', 'RUNWAY COMPLETE',
    '--session-id', 'session-1',
    '--started-at', '2026-04-15T10:00:00Z',
    '--prompt-file', promptPath,
  ], {
    encoding: 'utf8',
  });
  assert.equal(initResult.status, 0);

  const statePath = path.join(rootDir, '.claude', 'runway-state', 'pipeline.local.md');
  fs.utimesSync(statePath, new Date('2026-04-15T12:00:00Z'), new Date('2026-04-15T12:00:00Z'));

  const checkpointResult = spawnSync(process.execPath, [
    cliPath,
    'checkpoint-write',
    '--root', rootDir,
    '--ones-id', '123',
    '--plan-path', '.runway/plans/demo.md',
    '--current-stage', '6',
    '--updated-at', '2026-04-15T12:05:00Z',
  ], {
    encoding: 'utf8',
  });
  assert.equal(checkpointResult.status, 0);

  const reportResult = spawnSync(process.execPath, [
    cliPath,
    'report-write',
    '--root', rootDir,
    '--ones-id', '123',
    '--report', 'cr_report',
    '--content-file', reportPath,
  ], {
    encoding: 'utf8',
  });
  assert.equal(reportResult.status, 0);

  const result = spawnSync(process.execPath, [
    cliPath,
    'status',
    '--root', rootDir,
    '--ones-id', '123',
    '--session-id', 'session-1',
    '--now', '2026-04-15T12:30:00Z',
    '--max-age-ms', '7200000',
  ], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    ones_id: '123',
    checkpoint: {
      path: '.runway/checkpoint-123.json',
      exists: true,
      data: {
        ones_work_item_id: '123',
        plan_path: '.runway/plans/demo.md',
        current_stage: 6,
        updated_at: '2026-04-15T12:05:00Z',
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
        completion_promise: 'RUNWAY COMPLETE',
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

test('checkpoint-write and report-write commands update the canonical checkpoint', () => {
  const rootDir = makeTempRoot();
  const reportPath = path.join(rootDir, 'qa-report.md');
  fs.writeFileSync(reportPath, '# QA report\n');

  const checkpointResult = spawnSync(process.execPath, [
    cliPath,
    'checkpoint-write',
    '--root', rootDir,
    '--ones-id', '123',
    '--citadel-parent-id', 'parent-1',
    '--prd-content-id', 'prd-1',
    '--requirements-spec-content-id', 'spec-1',
    '--tech-spec-content-id', 'tech-1',
    '--plan-path', '.runway/plans/demo.md',
    '--current-stage', '7',
    '--updated-at', '2026-04-15T12:00:00Z',
  ], {
    encoding: 'utf8',
  });

  assert.equal(checkpointResult.status, 0);
  const checkpointFile = path.join(rootDir, '.runway', 'checkpoint-123.json');
  const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  assert.equal(checkpoint.current_stage, 7);
  assert.equal(checkpoint.tech_spec_content_id, 'tech-1');
  assert.equal(checkpoint.branch_name, null);

  const reportResult = spawnSync(process.execPath, [
    cliPath,
    'report-write',
    '--root', rootDir,
    '--ones-id', '123',
    '--report', 'qa_report',
    '--content-file', reportPath,
  ], {
    encoding: 'utf8',
  });

  assert.equal(reportResult.status, 0);
  const savedReportPath = path.join(rootDir, '.runway', 'docs', '123', 'qa-report.md');
  assert.equal(fs.readFileSync(savedReportPath, 'utf8'), '# QA report\n');

  const partialCheckpointResult = spawnSync(process.execPath, [
    cliPath,
    'checkpoint-write',
    '--root', rootDir,
    '--ones-id', '123',
    '--head-sha', 'abc123',
    '--current-stage', '6',
  ], {
    encoding: 'utf8',
  });

  assert.equal(partialCheckpointResult.status, 0);
  const updatedCheckpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  assert.equal(updatedCheckpoint.docs.qa_report, '.runway/docs/123/qa-report.md');
  assert.equal(updatedCheckpoint.tech_spec_content_id, 'tech-1');
  assert.equal(updatedCheckpoint.head_sha, 'abc123');
  assert.equal(updatedCheckpoint.current_stage, 6);
});

test('project-memory-init creates the default project memory once and preserves edits', () => {
  const rootDir = makeTempRoot();

  const createResult = spawnSync(process.execPath, [
    cliPath,
    'project-memory-init',
    '--root', rootDir,
    '--mis', 'mis-1',
    '--app-id', 'app-1',
    '--ones-space-id', 'space-1',
  ], {
    encoding: 'utf8',
  });

  assert.equal(createResult.status, 0);
  assert.deepEqual(JSON.parse(createResult.stdout), {
    path: '.runway/project.json',
    created: true,
  });

  const projectFile = path.join(rootDir, '.runway', 'project.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(projectFile, 'utf8')), {
    mis: 'mis-1',
    app_id: 'app-1',
    ones_space_id: 'space-1',
    build_cmd: '',
    test_cmd: '',
    lint_cmd: '',
    notes: '',
  });

  fs.writeFileSync(projectFile, JSON.stringify({
    mis: 'custom-mis',
    app_id: 'custom-app',
    ones_space_id: 'custom-space',
    build_cmd: 'npm run build',
    test_cmd: 'npm test',
    lint_cmd: 'npm run lint',
    notes: 'keep me',
  }, null, 2));

  const secondResult = spawnSync(process.execPath, [
    cliPath,
    'project-memory-init',
    '--root', rootDir,
    '--mis', 'mis-2',
    '--app-id', 'app-2',
    '--ones-space-id', 'space-2',
  ], {
    encoding: 'utf8',
  });

  assert.equal(secondResult.status, 0);
  assert.deepEqual(JSON.parse(secondResult.stdout), {
    path: '.runway/project.json',
    created: false,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(projectFile, 'utf8')), {
    mis: 'custom-mis',
    app_id: 'custom-app',
    ones_space_id: 'custom-space',
    build_cmd: 'npm run build',
    test_cmd: 'npm test',
    lint_cmd: 'npm run lint',
    notes: 'keep me',
  });
});
