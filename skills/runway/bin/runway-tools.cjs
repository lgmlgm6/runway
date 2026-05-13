#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { computeInvalidatedArtifacts, getEarliestInvalidatedStage } = require('../lib/artifacts.cjs');
const {
  getCheckpointPath,
  getReportPath,
  readCheckpoint,
  writeCheckpoint,
  writeReport,
} = require('../lib/reports.cjs');
const {
  initStateFile,
  updateStateFile,
  isStateFileStale,
  resolveActiveState,
} = require('../lib/state.cjs');
const { resolveStatus } = require('../lib/status.cjs');
const { WORKFLOW_MANIFEST } = require('../lib/workflow-manifest.cjs');

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const key = token.slice(2).replace(/-/g, '_');
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        result[key] = true;
      } else {
        result[key] = next;
        index += 1;
      }
    } else {
      result._.push(token);
    }
  }
  return result;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function requireArg(args, key) {
  const value = args[key];
  if (value == null || value === '') {
    throw new Error(`Missing required argument: --${key.replace(/_/g, '-')}`);
  }
  return value;
}

function parseScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function parseJsonArg(args, key, fallback = null) {
  if (!Object.prototype.hasOwnProperty.call(args, key)) {
    return fallback;
  }

  const value = args[key];
  if (value == null || value === '') {
    return fallback;
  }

  return JSON.parse(value);
}

function readContentArg(args, key) {
  const directKey = key;
  const fileKey = `${key}_file`;

  if (args[fileKey]) {
    return fs.readFileSync(args[fileKey], 'utf8');
  }
  if (args[directKey] != null) {
    return String(args[directKey]);
  }
  return '';
}

function relativeToRoot(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}

function handleStatus(args) {
  const rootDir = requireArg(args, 'root');
  const onesId = requireArg(args, 'ones_id');

  printJson(resolveStatus(rootDir, onesId, {
    sessionId: args.session_id ?? null,
    now: args.now ? new Date(args.now) : undefined,
    maxAgeMs: args.max_age_ms ? Number(args.max_age_ms) : undefined,
  }));
}

function handleReportPath(args) {
  printJson({
    report: requireArg(args, 'report'),
    path: getReportPath(requireArg(args, 'root'), requireArg(args, 'ones_id'), requireArg(args, 'report')),
  });
}

function handleArtifactsInvalidate(args) {
  const artifact = requireArg(args, 'artifact');
  const invalidated = computeInvalidatedArtifacts(artifact);
  printJson({
    artifact,
    invalidated,
    resume_from_stage: getEarliestInvalidatedStage(invalidated),
  });
}

function handleStateInit(args) {
  const rootDir = requireArg(args, 'root');
  const filePath = initStateFile({
    rootDir,
    name: requireArg(args, 'name'),
    mode: requireArg(args, 'mode'),
    maxIterations: Number(requireArg(args, 'max_iterations')),
    completionPromise: args.completion_promise ?? null,
    sessionId: args.session_id ?? null,
    startedAt: args.started_at ?? null,
    prompt: readContentArg(args, 'prompt'),
  });

  printJson({
    path: relativeToRoot(rootDir, filePath),
  });
}

function handleStateUpdate(args) {
  const rootDir = requireArg(args, 'root');
  const filePath = path.join(rootDir, '.claude', 'runway-state', requireArg(args, 'name'));
  const updates = {};

  for (const [key, value] of Object.entries(args)) {
    if (key === '_' || key === 'root' || key === 'name') continue;
    updates[key] = parseScalar(String(value));
  }

  const state = updateStateFile(filePath, updates);
  printJson({
    path: relativeToRoot(rootDir, filePath),
    state,
  });
}

function handleCheckpointWrite(args) {
  const rootDir = requireArg(args, 'root');
  const onesId = requireArg(args, 'ones_id');
  const checkpointPath = getCheckpointPath(rootDir, onesId);
  const existing = fs.existsSync(checkpointPath) ? readCheckpoint(checkpointPath) : {};
  const hasArg = (key) => Object.prototype.hasOwnProperty.call(args, key);

  const checkpoint = {
    ...existing,
    ones_work_item_id: onesId,
    citadel_parent_id: hasArg('citadel_parent_id') ? args.citadel_parent_id : (existing.citadel_parent_id ?? null),
    prd_content_id: hasArg('prd_content_id') ? args.prd_content_id : (existing.prd_content_id ?? null),
    requirements_spec_content_id: hasArg('requirements_spec_content_id') ? args.requirements_spec_content_id : (existing.requirements_spec_content_id ?? null),
    tech_spec_content_id: hasArg('tech_spec_content_id') ? args.tech_spec_content_id : (existing.tech_spec_content_id ?? null),
    plan_path: hasArg('plan_path') ? args.plan_path : (existing.plan_path ?? null),
    branch_name: hasArg('branch_name') ? args.branch_name : (existing.branch_name ?? null),
    base_sha: hasArg('base_sha') ? args.base_sha : (existing.base_sha ?? null),
    head_sha: hasArg('head_sha') ? args.head_sha : (existing.head_sha ?? null),
    current_stage: hasArg('current_stage') ? Number(args.current_stage) : (existing.current_stage ?? null),
    updated_at: hasArg('updated_at') ? args.updated_at : (existing.updated_at ?? null),
    // --- 扩展阶段字段 ---
    pipeline_mode: hasArg('pipeline_mode') ? args.pipeline_mode : (existing.pipeline_mode ?? null),
    fullstack_handoff_status: hasArg('fullstack_handoff_status') ? args.fullstack_handoff_status : (existing.fullstack_handoff_status ?? null),
    pipeline_options: hasArg('pipeline_options') ? parseJsonArg(args, 'pipeline_options') : (existing.pipeline_options ?? null),
    papi_sync_status: hasArg('papi_sync_status') ? args.papi_sync_status : (existing.papi_sync_status ?? null),
    papi_synced_apis: hasArg('papi_synced_apis') ? parseJsonArg(args, 'papi_synced_apis') : (existing.papi_synced_apis ?? null),
    tclist_content_id: hasArg('tclist_content_id') ? args.tclist_content_id : (existing.tclist_content_id ?? null),
    shepherd_config_status: hasArg('shepherd_config_status') ? args.shepherd_config_status : (existing.shepherd_config_status ?? null),
    cargo_stack_uuid: hasArg('cargo_stack_uuid') ? args.cargo_stack_uuid : (existing.cargo_stack_uuid ?? null),
    cargo_swimlane: hasArg('cargo_swimlane') ? args.cargo_swimlane : (existing.cargo_swimlane ?? null),
    cargo_base_url: hasArg('cargo_base_url') ? args.cargo_base_url : (existing.cargo_base_url ?? null),
    cargo_test_url: hasArg('cargo_test_url') ? args.cargo_test_url : (existing.cargo_test_url ?? null),
    test_report_content_id: hasArg('test_report_content_id') ? args.test_report_content_id : (existing.test_report_content_id ?? null),
    test_failed_count: hasArg('test_failed_count') ? Number(args.test_failed_count) : (existing.test_failed_count ?? null),
    test_failed_ids: hasArg('test_failed_ids') ? parseJsonArg(args, 'test_failed_ids') : (existing.test_failed_ids ?? null),
    bug_analysis_content_id: hasArg('bug_analysis_content_id') ? args.bug_analysis_content_id : (existing.bug_analysis_content_id ?? null),
    fix_round: hasArg('fix_round') ? Number(args.fix_round) : (existing.fix_round ?? 0),
    fix_loop_status: hasArg('fix_loop_status') ? args.fix_loop_status : (existing.fix_loop_status ?? 'idle'),
    // --- 角色/模式字段 ---
    qa_mode: hasArg('qa_mode') ? args.qa_mode : (existing.qa_mode ?? null),
    skip_retrospective: hasArg('skip_retrospective') ? (args.skip_retrospective === 'true' || args.skip_retrospective === true) : (existing.skip_retrospective ?? null),
    // --- fullstack/litefull teammate 字段 ---
    role: hasArg('role') ? args.role : (existing.role ?? null),
    team_mode: hasArg('team_mode') ? (args.team_mode === 'true' || args.team_mode === true) : (existing.team_mode ?? null),
    leader_name: hasArg('leader_name') ? args.leader_name : (existing.leader_name ?? null),
    mini_spec_path: hasArg('mini_spec_path') ? args.mini_spec_path : (existing.mini_spec_path ?? null),
    spec_context_path: hasArg('spec_context_path') ? args.spec_context_path : (existing.spec_context_path ?? null),
  };

  writeCheckpoint(rootDir, checkpoint);
  printJson({
    path: relativeToRoot(rootDir, checkpointPath),
    checkpoint,
  });
}

function handleStateResolve(args) {
  const rootDir = requireArg(args, 'root');
  const resolved = resolveActiveState({
    rootDir,
    sessionId: args.session_id ?? null,
    now: args.now ? new Date(args.now) : undefined,
    maxAgeMs: args.max_age_ms ? Number(args.max_age_ms) : undefined,
  });

  if (!resolved) {
    printJson({ path: null, state: null });
    return;
  }

  printJson({
    path: relativeToRoot(rootDir, resolved.filePath),
    state: resolved.state,
  });
}

function handleStateStale(args) {
  const rootDir = requireArg(args, 'root');
  const filePath = path.join(rootDir, '.claude', 'runway-state', requireArg(args, 'name'));

  printJson({
    path: relativeToRoot(rootDir, filePath),
    stale: isStateFileStale(filePath, {
      now: args.now ? new Date(args.now) : undefined,
      maxAgeMs: args.max_age_ms ? Number(args.max_age_ms) : undefined,
    }),
  });
}

function handleReportWrite(args) {
  const rootDir = requireArg(args, 'root');
  const result = writeReport({
    rootDir,
    onesId: requireArg(args, 'ones_id'),
    reportKey: requireArg(args, 'report'),
    content: readContentArg(args, 'content'),
  });

  printJson({
    report: args.report,
    absolute_path: result.absolutePath,
    relative_path: result.relativePath,
  });
}

function getKnowledgePath(rootDir) {
  return path.join(rootDir, '.runway', 'knowledge.json');
}

function readKnowledge(rootDir) {
  const p = getKnowledgePath(rootDir);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
}

function handleKnowledgeAppend(args) {
  const rootDir = requireArg(args, 'root');
  const onesId = requireArg(args, 'ones_id');
  const entries = JSON.parse(requireArg(args, 'entries'));

  const existing = readKnowledge(rootDir);
  const now = new Date().toISOString();
  const base = Date.now();

  const newEntries = entries.map((entry, i) => ({
    id: `k-${base}-${String(i).padStart(3, '0')}`,
    source_ones_id: onesId,
    ts: now,
    ...entry,
  }));

  const knowledgePath = getKnowledgePath(rootDir);
  fs.mkdirSync(path.dirname(knowledgePath), { recursive: true });
  fs.writeFileSync(knowledgePath, `${JSON.stringify([...existing, ...newEntries], null, 2)}\n`);

  printJson({ appended: newEntries.length, total: existing.length + newEntries.length });
}

function formatKnowledgeAsPrompt(entries) {
  const constraints = entries.filter((k) => k.inject_as === 'constraint');
  const corrections = entries.filter((k) => k.inject_as === 'past_error');
  const pitfalls = entries.filter((k) => k.inject_as === 'warning');

  let out = '';

  if (constraints.length > 0) {
    out += '<project-constraints>\n以下是本项目的隐性业务约束，设计方案时必须遵守：\n\n';
    constraints.forEach((k, i) => {
      out += `${i + 1}. ${k.summary}\n   背景：${k.detail}\n   来源：需求 ${k.source_ones_id}\n\n`;
    });
    out += '</project-constraints>\n\n';
  }

  if (corrections.length > 0) {
    out += '<past-corrections>\n以下是 AI 在历史需求中的判断错误，本次请特别注意：\n\n';
    corrections.forEach((k, i) => {
      out += `${i + 1}. [Stage ${k.captured_at_stage} 纠正] ${k.summary}\n   详情：${k.detail}\n   来源：需求 ${k.source_ones_id}\n\n`;
    });
    out += '</past-corrections>\n\n';
  }

  if (pitfalls.length > 0) {
    out += '<known-pitfalls>\n以下是本项目历史上踩过的坑，请提前防范：\n\n';
    pitfalls.forEach((k, i) => {
      out += `${i + 1}. ${k.summary}\n   根因：${k.detail}\n   来源：需求 ${k.source_ones_id}\n\n`;
    });
    out += '</known-pitfalls>\n\n';
  }

  return out.trimEnd();
}

function handleKnowledgeRead(args) {
  const rootDir = requireArg(args, 'root');
  const stage = Number(requireArg(args, 'inject_into_stage'));
  const format = args.format ?? 'json';

  const all = readKnowledge(rootDir);
  const relevant = all.filter((k) => Array.isArray(k.inject_into_stages) && k.inject_into_stages.includes(stage));

  if (format === 'json') {
    printJson(relevant);
    return;
  }

  // format === 'prompt'
  const prompt = formatKnowledgeAsPrompt(relevant);
  process.stdout.write(prompt ? `${prompt}\n` : '');
}

// loop-init: check if a pipeline/triangle loop state already exists (orchestrated path).
// If not active (standalone path), create one from manifest parameters for the given stage.
function handleLoopInit(args) {
  const rootDir = requireArg(args, 'root');
  const stage = Number(requireArg(args, 'stage'));
  const sessionId = args.session_id ?? null;
  const startedAt = args.started_at ?? new Date().toISOString();

  const stageManifest = WORKFLOW_MANIFEST.stages[stage];
  if (!stageManifest) {
    throw new Error(`Unknown stage: ${stage}`);
  }

  const { loopName, maxIterations, completionPromise } = stageManifest;
  if (!loopName) {
    printJson({ created: false, reason: `stage ${stage} has no loop` });
    return;
  }

  const statePath = path.join(rootDir, '.claude', 'runway-state', loopName);

  // If an active state already exists, the orchestrator owns it — do not create a competing loop.
  if (fs.existsSync(statePath)) {
    const content = fs.readFileSync(statePath, 'utf8');
    if (/^active: true$/m.test(content)) {
      printJson({ created: false, reason: 'orchestrator-owned loop already active', path: relativeToRoot(rootDir, statePath) });
      return;
    }
  }

  // Standalone path: build the resume prompt from manifest metadata.
  const mode = loopName.includes('triangle') ? 'triangle' : 'pipeline';
  const promptText = args.prompt_text
    || `Runway [stage ${stage}] loop is running. Resume from where you left off. Output <promise>${completionPromise}</promise> only when genuinely complete.`;

  const filePath = initStateFile({
    rootDir,
    name: loopName,
    mode,
    maxIterations: maxIterations ?? 50,
    completionPromise: completionPromise ?? null,
    sessionId,
    startedAt,
    prompt: promptText,
  });

  printJson({ created: true, path: relativeToRoot(rootDir, filePath), stage, loopName });
}

function handleProjectMemoryInit(args) {
  const rootDir = requireArg(args, 'root');
  const runwayDir = path.join(rootDir, '.runway');
  const projectPath = path.join(runwayDir, 'project.json');

  fs.mkdirSync(runwayDir, { recursive: true });

  if (fs.existsSync(projectPath)) {
    printJson({
      path: relativeToRoot(rootDir, projectPath),
      created: false,
    });
    return;
  }

  // 必填字段
  const data = {
    mis: requireArg(args, 'mis'),
    app_id: args.app_id ?? '',
    ones_space_id: args.ones_space_id ?? '',
    build_cmd: args.build_cmd ?? '',
    test_cmd: args.test_cmd ?? '',
    lint_cmd: args.lint_cmd ?? '',
    notes: '',
  };

  // 可选字段：有值才写入，保持文件简洁
  const optionals = [
    'papi_base_url', 'papi_project_id', 'papi_token',
    'cargo_appkey',
    'test_base_domain',
    'shepherd_group_url', 'test_data_km_url',
  ];
  for (const k of optionals) {
    if (args[k]) data[k] = args[k];
  }

  fs.writeFileSync(projectPath, `${JSON.stringify(data, null, 2)}\n`);

  printJson({
    path: relativeToRoot(rootDir, projectPath),
    created: true,
  });
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const command = args._[0];

    if (command === 'report-path') {
      handleReportPath(args);
      return;
    }

    if (command === 'artifacts-invalidate') {
      handleArtifactsInvalidate(args);
      return;
    }

    if (command === 'state-init') {
      handleStateInit(args);
      return;
    }

    if (command === 'state-update') {
      handleStateUpdate(args);
      return;
    }

    if (command === 'checkpoint-write') {
      handleCheckpointWrite(args);
      return;
    }

    if (command === 'state-resolve') {
      handleStateResolve(args);
      return;
    }

    if (command === 'state-stale') {
      handleStateStale(args);
      return;
    }

    if (command === 'report-write') {
      handleReportWrite(args);
      return;
    }

    if (command === 'project-memory-init') {
      handleProjectMemoryInit(args);
      return;
    }

    if (command === 'knowledge-append') {
      handleKnowledgeAppend(args);
      return;
    }

    if (command === 'knowledge-read') {
      handleKnowledgeRead(args);
      return;
    }

    if (command === 'status') {
      handleStatus(args);
      return;
    }

    if (command === 'loop-init') {
      handleLoopInit(args);
      return;
    }

    fail('Unknown command');
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
