const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WORKFLOW_MANIFEST } = require('../lib/workflow-manifest.cjs');
const { STAGE_CONTRACTS, getStageContract, validateStageTransition } = require('../lib/contracts.cjs');
const {
  ARTIFACT_TO_STAGE,
  computeInvalidatedArtifacts,
  getEarliestInvalidatedStage,
  markArtifactsInvalid,
} = require('../lib/artifacts.cjs');
const { initStateFile } = require('../lib/state.cjs');

// ── manifest structure ────────────────────────────────────────────────────────

test('manifest has all 12 stages with required control-plane fields', () => {
  const requiredFields = ['skill', 'hardGate', 'inputs', 'outputs', 'loopName', 'maxIterations', 'completionPromise'];
  for (let stage = 1; stage <= 12; stage++) {
    const s = WORKFLOW_MANIFEST.stages[stage];
    assert.ok(s, `stage ${stage} missing from manifest`);
    for (const field of requiredFields) {
      assert.ok(Object.prototype.hasOwnProperty.call(s, field), `stage ${stage} missing field: ${field}`);
    }
  }
});

test('manifest hard gates are only on stages 1 and 2', () => {
  assert.equal(WORKFLOW_MANIFEST.stages[1].hardGate, true);
  assert.equal(WORKFLOW_MANIFEST.stages[2].hardGate, true);
  for (let stage = 3; stage <= 12; stage++) {
    assert.equal(WORKFLOW_MANIFEST.stages[stage].hardGate, false, `stage ${stage} should not be a hard gate`);
  }
});

test('manifest pipeline loop stages share the pipeline contract', () => {
  for (const stage of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const s = WORKFLOW_MANIFEST.stages[stage];
    assert.equal(s.loopName, 'pipeline.local.md', `stage ${stage} loopName`);
    assert.ok(s.maxIterations > 0, `stage ${stage} maxIterations must be positive`);
    assert.equal(s.completionPromise, 'RUNWAY STAGES 3-12 COMPLETE');
  }
});

test('manifest stage 2 uses triangle loop and has no completionPromise', () => {
  const s2 = WORKFLOW_MANIFEST.stages[2];
  assert.equal(s2.loopName, 'triangle-loop.local.md');
  assert.equal(s2.completionPromise, null);
  assert.ok(s2.maxIterations > 0);
});

test('manifest stage 1 has no loop', () => {
  assert.equal(WORKFLOW_MANIFEST.stages[1].loopName, null, 'stage 1 should have no loop');
});

test('manifest invalidation map covers the expanded artifact graph', () => {
  const artifacts = Object.keys(WORKFLOW_MANIFEST.invalidation);
  const expected = [
    'requirements_spec',
    'tech_spec',
    'task_plan',
    'papi_sync',
    'test_cases',
    'branch_execution',
    'execution_report',
    'cr_report',
    'shepherd_config',
    'qa_report',
    'deploy_stack',
    'test_report',
    'bug_analysis',
    'project_knowledge',
  ];
  assert.deepEqual(artifacts.sort(), expected.sort());
});

test('manifest artifactToStage covers all expanded artifacts and maps to correct stages', () => {
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.requirements_spec, 1);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.tech_spec, 2);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.task_plan, 3);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.papi_sync, 3);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.test_cases, 3);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.branch_execution, 4);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.execution_report, 5);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.cr_report, 6);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.shepherd_config, 7);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.qa_report, 8);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.deploy_stack, 9);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.test_report, 10);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.bug_analysis, 11);
  assert.equal(WORKFLOW_MANIFEST.artifactToStage.project_knowledge, 12);
});

// ── contracts re-export from manifest ────────────────────────────────────────

test('contracts.cjs STAGE_CONTRACTS is derived from manifest and has all 12 stages', () => {
  for (let stage = 1; stage <= 12; stage++) {
    const contract = STAGE_CONTRACTS[stage];
    assert.ok(contract, `STAGE_CONTRACTS missing stage ${stage}`);
    assert.equal(contract.stage, stage);
    assert.equal(contract.skill, WORKFLOW_MANIFEST.stages[stage].skill);
    assert.equal(contract.hardGate, WORKFLOW_MANIFEST.stages[stage].hardGate);
    assert.deepEqual(contract.requiredInputs, WORKFLOW_MANIFEST.stages[stage].inputs);
    assert.deepEqual(contract.requiredOutputs, WORKFLOW_MANIFEST.stages[stage].outputs);
  }
});

test('getStageContract returns correct compound contract for stage 3', () => {
  const contract = getStageContract(3);
  assert.equal(contract.skill, 'runway-task-planning (+ runway-papi / runway-tclist)');
  assert.equal(contract.hardGate, false);
  assert.deepEqual(contract.requiredOutputs, ['plan_path']);
});

test('validateStageTransition fails when required outputs are missing', () => {
  const result = validateStageTransition({ fromStage: 2, toStage: 3, payload: {} });
  assert.equal(result.ok, false);
  assert.match(result.error, /missing required outputs/i);
  assert.deepEqual(result.missing, ['tech_spec_content_id']);
});

test('validateStageTransition succeeds with required handoff payload', () => {
  const result = validateStageTransition({
    fromStage: 10,
    toStage: 11,
    payload: {
      test_report_content_id: 'km-123',
      test_failed_count: 2,
      test_failed_ids: ['TC-1-1'],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.contract.hardGate, false);
});

// ── artifacts re-export from manifest ────────────────────────────────────────

test('artifacts.cjs ARTIFACT_TO_STAGE is derived from manifest', () => {
  assert.deepEqual(ARTIFACT_TO_STAGE, WORKFLOW_MANIFEST.artifactToStage);
});

test('computeInvalidatedArtifacts for requirements_spec matches manifest', () => {
  assert.deepEqual(
    computeInvalidatedArtifacts('requirements_spec'),
    WORKFLOW_MANIFEST.invalidation.requirements_spec,
  );
});

test('getEarliestInvalidatedStage returns correct stage for cr_report + qa_report + project_knowledge', () => {
  assert.equal(getEarliestInvalidatedStage(['cr_report', 'qa_report', 'project_knowledge']), 6);
});

test('markArtifactsInvalid deduplicates and sorts by stage', () => {
  const result = markArtifactsInvalid({ invalidated_artifacts: ['qa_report'] }, 'task_plan');
  assert.deepEqual(result.invalidated_artifacts, [
    'branch_execution', 'execution_report', 'cr_report', 'shepherd_config', 'qa_report', 'deploy_stack', 'test_report', 'bug_analysis', 'project_knowledge',
  ]);
  assert.equal(result.resume_from_stage, 4);
});

// ── loop-init orchestrated vs standalone paths ────────────────────────────────

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runway-manifest-test-'));
}

const RUNWAY_TOOLS = path.join(__dirname, '..', 'bin', 'runway-tools.cjs');
const { spawnSync } = require('node:child_process');

function runLoopInit(rootDir, stage, sessionId) {
  return spawnSync('node', [
    RUNWAY_TOOLS, 'loop-init',
    '--root', rootDir,
    '--stage', String(stage),
    '--session-id', sessionId,
  ], { encoding: 'utf8', timeout: 10000 });
}

test('loop-init creates pipeline state for stage 5 in standalone mode', () => {
  const rootDir = makeTempRoot();
  const result = runLoopInit(rootDir, 5, 'sess-standalone');
  const out = JSON.parse(result.stdout);
  assert.equal(out.created, true);
  assert.equal(out.loopName, 'pipeline.local.md');
  assert.ok(fs.existsSync(path.join(rootDir, '.claude', 'runway-state', 'pipeline.local.md')));
});

test('loop-init creates pipeline loop for stage 4', () => {
  const rootDir = makeTempRoot();
  const result = runLoopInit(rootDir, 4, 'sess-stage4');
  const out = JSON.parse(result.stdout);
  assert.equal(out.created, true);
  assert.equal(out.loopName, 'pipeline.local.md');
});

test('loop-init detects orchestrator-owned active state and does not create competing loop', () => {
  const rootDir = makeTempRoot();
  // Simulate orchestrator having already created the pipeline state for stage 5
  initStateFile({
    rootDir,
    name: 'pipeline.local.md',
    mode: 'pipeline',
    maxIterations: 200,
    completionPromise: 'RUNWAY STAGES 3-12 COMPLETE',
    sessionId: 'sess-orch',
    startedAt: new Date().toISOString(),
    prompt: 'orchestrator prompt',
  });

  // Stage 6 standalone call should detect existing active state
  const result = runLoopInit(rootDir, 6, 'sess-orch');
  const out = JSON.parse(result.stdout);
  assert.equal(out.created, false);
  assert.match(out.reason, /orchestrator-owned loop already active/);
});

test('loop-init creates triangle loop for stage 2', () => {
  const rootDir = makeTempRoot();
  const result = runLoopInit(rootDir, 2, 'sess-stage2');
  const out = JSON.parse(result.stdout);
  assert.equal(out.created, true);
  assert.equal(out.loopName, 'triangle-loop.local.md');
  assert.ok(fs.existsSync(path.join(rootDir, '.claude', 'runway-state', 'triangle-loop.local.md')));
});
