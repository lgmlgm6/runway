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
    'shepherd_config',
    'qa_report',
    'deploy_stack',
    'test_report',
    'bug_analysis',
    'project_knowledge',
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
        fix_round: 0,
        fix_loop_status: 'idle',
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
    artifacts: {
      task_plan: {
        path: '.runway/plans/demo.md',
      },
    },
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
    '--pipeline-mode', 'fullstack',
    '--fullstack-handoff-status', 'pending',
    '--pipeline-options', JSON.stringify({ skip_papi: false, skip_shepherd: true }),
    '--papi-sync-status', 'success',
    '--papi-synced-apis', JSON.stringify(['/api/demo/create']),
    '--tclist-content-id', 'case-1',
    '--shepherd-config-status', 'skipped',
    '--test-failed-ids', JSON.stringify(['TC-1-1']),
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
  assert.equal(checkpoint.pipeline_mode, 'fullstack');
  assert.equal(checkpoint.fullstack_handoff_status, 'pending');
  assert.deepEqual(checkpoint.pipeline_options, { skip_papi: false, skip_shepherd: true });
  assert.deepEqual(checkpoint.papi_synced_apis, ['/api/demo/create']);
  assert.deepEqual(checkpoint.test_failed_ids, ['TC-1-1']);
  assert.equal(checkpoint.shepherd_config_status, 'skipped');
  assert.equal(checkpoint.tclist_content_id, 'case-1');

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
    '--fullstack-handoff-status', 'dispatched',
    '--current-stage', '6',
  ], {
    encoding: 'utf8',
  });

  assert.equal(partialCheckpointResult.status, 0);
  const updatedCheckpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  assert.equal(updatedCheckpoint.docs.qa_report, '.runway/docs/123/qa-report.md');
  assert.equal(updatedCheckpoint.tech_spec_content_id, 'tech-1');
  assert.equal(updatedCheckpoint.head_sha, 'abc123');
  assert.equal(updatedCheckpoint.pipeline_mode, 'fullstack');
  assert.equal(updatedCheckpoint.fullstack_handoff_status, 'dispatched');
  assert.equal(updatedCheckpoint.current_stage, 6);
});

test('fullstack handoff checkpoint states survive status resolution', () => {
  const rootDir = makeTempRoot();

  const writeResult = spawnSync(process.execPath, [
    cliPath,
    'checkpoint-write',
    '--root', rootDir,
    '--ones-id', '456',
    '--requirements-spec-content-id', 'spec-456',
    '--tech-spec-content-id', 'tech-456',
    '--tclist-content-id', 'tclist-456',
    '--pipeline-mode', 'fullstack',
    '--fullstack-handoff-status', 'pending',
    '--current-stage', '3',
    '--updated-at', '2026-04-16T08:00:00Z',
  ], {
    encoding: 'utf8',
  });

  assert.equal(writeResult.status, 0);

  const statusPending = spawnSync(process.execPath, [
    cliPath,
    'status',
    '--root', rootDir,
    '--ones-id', '456',
  ], {
    encoding: 'utf8',
  });

  assert.equal(statusPending.status, 0);
  const pendingPayload = JSON.parse(statusPending.stdout);
  assert.equal(pendingPayload.checkpoint.data.pipeline_mode, 'fullstack');
  assert.equal(pendingPayload.checkpoint.data.fullstack_handoff_status, 'pending');
  assert.equal(pendingPayload.checkpoint.data.current_stage, 3);
  assert.equal(pendingPayload.artifacts.requirements_spec.content_id, 'spec-456');
  assert.equal(pendingPayload.artifacts.tech_spec.content_id, 'tech-456');
  assert.equal(pendingPayload.artifacts.test_cases.content_id, 'tclist-456');

  const dispatchResult = spawnSync(process.execPath, [
    cliPath,
    'checkpoint-write',
    '--root', rootDir,
    '--ones-id', '456',
    '--fullstack-handoff-status', 'dispatched',
  ], {
    encoding: 'utf8',
  });

  assert.equal(dispatchResult.status, 0);

  const statusDispatched = spawnSync(process.execPath, [
    cliPath,
    'status',
    '--root', rootDir,
    '--ones-id', '456',
  ], {
    encoding: 'utf8',
  });

  assert.equal(statusDispatched.status, 0);
  const dispatchedPayload = JSON.parse(statusDispatched.stdout);
  assert.equal(dispatchedPayload.checkpoint.data.pipeline_mode, 'fullstack');
  assert.equal(dispatchedPayload.checkpoint.data.fullstack_handoff_status, 'dispatched');
  assert.equal(dispatchedPayload.checkpoint.data.current_stage, 3);
});

test('standard mode checkpoint remains distinct from fullstack handoff states', () => {
  const rootDir = makeTempRoot();

  const writeResult = spawnSync(process.execPath, [
    cliPath,
    'checkpoint-write',
    '--root', rootDir,
    '--ones-id', '789',
    '--requirements-spec-content-id', 'spec-789',
    '--tech-spec-content-id', 'tech-789',
    '--current-stage', '3',
    '--updated-at', '2026-04-16T09:00:00Z',
  ], {
    encoding: 'utf8',
  });

  assert.equal(writeResult.status, 0);

  const statusResult = spawnSync(process.execPath, [
    cliPath,
    'status',
    '--root', rootDir,
    '--ones-id', '789',
  ], {
    encoding: 'utf8',
  });

  assert.equal(statusResult.status, 0);
  const payload = JSON.parse(statusResult.stdout);
  assert.equal(payload.checkpoint.data.current_stage, 3);
  assert.equal(payload.checkpoint.data.pipeline_mode, undefined);
  assert.equal(payload.checkpoint.data.fullstack_handoff_status, undefined);
  assert.equal(payload.artifacts.requirements_spec.content_id, 'spec-789');
  assert.equal(payload.artifacts.tech_spec.content_id, 'tech-789');
});

test('knowledge-append writes entries to knowledge.json and knowledge-read filters by stage', () => {
  const rootDir = makeTempRoot();

  // Append a constraint targeting Stage 2
  const appendResult = spawnSync(process.execPath, [
    cliPath,
    'knowledge-append',
    '--root', rootDir,
    '--ones-id', 'feature-001',
    '--entries', JSON.stringify([{
      type: 'implicit_constraint',
      captured_at_stage: 1,
      trigger: 'hard_gate_diff',
      inject_into_stages: [2],
      inject_as: 'constraint',
      scope: 'project',
      summary: '接口字段只能新增不能修改',
      detail: 'AI草稿修改了字段类型 → 用户改回 — 下游未做版本隔离',
      confidence: 9,
    }]),
  ], { encoding: 'utf8' });

  assert.equal(appendResult.status, 0);
  assert.deepEqual(JSON.parse(appendResult.stdout), { appended: 1, total: 1 });

  // Append a pitfall targeting Stage 3 and 5
  const appendResult2 = spawnSync(process.execPath, [
    cliPath,
    'knowledge-append',
    '--root', rootDir,
    '--ones-id', 'feature-001',
    '--entries', JSON.stringify([{
      type: 'pitfall_root_cause',
      captured_at_stage: 5,
      trigger: 'task_blocked',
      inject_into_stages: [3, 5],
      inject_as: 'warning',
      scope: 'project',
      summary: 'MapStruct 不处理父类字段',
      detail: '父类字段需要 @Mapping 显式声明',
      confidence: 8,
    }]),
  ], { encoding: 'utf8' });

  assert.equal(appendResult2.status, 0);
  assert.deepEqual(JSON.parse(appendResult2.stdout), { appended: 1, total: 2 });

  // knowledge-read for Stage 2 should return only the constraint
  const readStage2 = spawnSync(process.execPath, [
    cliPath, 'knowledge-read', '--root', rootDir, '--inject-into-stage', '2', '--format', 'json',
  ], { encoding: 'utf8' });

  assert.equal(readStage2.status, 0);
  const stage2Entries = JSON.parse(readStage2.stdout);
  assert.equal(stage2Entries.length, 1);
  assert.equal(stage2Entries[0].type, 'implicit_constraint');
  assert.equal(stage2Entries[0].source_ones_id, 'feature-001');

  // knowledge-read for Stage 5 should return only the pitfall
  const readStage5 = spawnSync(process.execPath, [
    cliPath, 'knowledge-read', '--root', rootDir, '--inject-into-stage', '5', '--format', 'json',
  ], { encoding: 'utf8' });

  assert.equal(readStage5.status, 0);
  const stage5Entries = JSON.parse(readStage5.stdout);
  assert.equal(stage5Entries.length, 1);
  assert.equal(stage5Entries[0].type, 'pitfall_root_cause');

  // knowledge-read for Stage 1 should return empty (no entries target Stage 1)
  const readStage1 = spawnSync(process.execPath, [
    cliPath, 'knowledge-read', '--root', rootDir, '--inject-into-stage', '1', '--format', 'json',
  ], { encoding: 'utf8' });

  assert.equal(readStage1.status, 0);
  assert.deepEqual(JSON.parse(readStage1.stdout), []);
});

test('knowledge-read --format prompt renders structured XML blocks', () => {
  const rootDir = makeTempRoot();

  spawnSync(process.execPath, [
    cliPath,
    'knowledge-append',
    '--root', rootDir,
    '--ones-id', 'feature-002',
    '--entries', JSON.stringify([
      {
        type: 'implicit_constraint',
        captured_at_stage: 1,
        trigger: 'hard_gate_diff',
        inject_into_stages: [2],
        inject_as: 'constraint',
        scope: 'project',
        summary: '灰度开关必须走 Lion 配置',
        detail: '环境变量不支持动态调整',
        confidence: 9,
      },
      {
        type: 'ai_correction',
        captured_at_stage: 2,
        trigger: 'hard_gate_diff',
        inject_into_stages: [1, 2],
        inject_as: 'past_error',
        scope: 'project',
        summary: 'AI 误判了数据归属范围',
        detail: 'AI 写了全量查询，应限定为当前 mis',
        confidence: 9,
      },
    ]),
  ], { encoding: 'utf8' });

  const result = spawnSync(process.execPath, [
    cliPath, 'knowledge-read', '--root', rootDir, '--inject-into-stage', '2', '--format', 'prompt',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /<project-constraints>/);
  assert.match(result.stdout, /灰度开关必须走 Lion 配置/);
  assert.match(result.stdout, /<\/project-constraints>/);
  assert.match(result.stdout, /<past-corrections>/);
  assert.match(result.stdout, /AI 误判了数据归属范围/);
  assert.match(result.stdout, /<\/past-corrections>/);

  // Stage 1 only gets the ai_correction (inject_into_stages includes 1)
  const resultStage1 = spawnSync(process.execPath, [
    cliPath, 'knowledge-read', '--root', rootDir, '--inject-into-stage', '1', '--format', 'prompt',
  ], { encoding: 'utf8' });

  assert.equal(resultStage1.status, 0);
  assert.doesNotMatch(resultStage1.stdout, /<project-constraints>/);
  assert.match(resultStage1.stdout, /<past-corrections>/);
  assert.match(resultStage1.stdout, /AI 误判了数据归属范围/);
});

test('knowledge-read returns empty output when knowledge.json does not exist', () => {
  const rootDir = makeTempRoot();

  const jsonResult = spawnSync(process.execPath, [
    cliPath, 'knowledge-read', '--root', rootDir, '--inject-into-stage', '2', '--format', 'json',
  ], { encoding: 'utf8' });

  assert.equal(jsonResult.status, 0);
  assert.deepEqual(JSON.parse(jsonResult.stdout), []);

  const promptResult = spawnSync(process.execPath, [
    cliPath, 'knowledge-read', '--root', rootDir, '--inject-into-stage', '2', '--format', 'prompt',
  ], { encoding: 'utf8' });

  assert.equal(promptResult.status, 0);
  assert.equal(promptResult.stdout, '');
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
