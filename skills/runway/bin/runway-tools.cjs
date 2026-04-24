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

  fs.writeFileSync(projectPath, `${JSON.stringify({
    mis: requireArg(args, 'mis'),
    app_id: requireArg(args, 'app_id'),
    ones_space_id: requireArg(args, 'ones_space_id'),
    build_cmd: '',
    test_cmd: '',
    lint_cmd: '',
    notes: '',
  }, null, 2)}\n`);

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

    if (command === 'status') {
      handleStatus(args);
      return;
    }

    fail('Unknown command');
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
