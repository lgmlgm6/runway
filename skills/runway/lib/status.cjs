const fs = require('node:fs');
const path = require('node:path');
const { REPORT_FILES, getCheckpointPath, getReportPath, readCheckpoint } = require('./reports.cjs');
const { isStateFileStale, resolveActiveState } = require('./state.cjs');

function relativeToRoot(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}

function stripNullish(value) {
  if (Array.isArray(value)) {
    return value.map(stripNullish);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== null && nestedValue !== undefined)
        .map(([key, nestedValue]) => [key, stripNullish(nestedValue)]),
    );
  }
  return value;
}

function buildReportsStatus(rootDir, onesId, checkpoint) {
  const docs = checkpoint?.docs || {};
  return Object.fromEntries(
    Object.keys(REPORT_FILES).map((reportKey) => {
      const absolutePath = getReportPath(rootDir, onesId, reportKey);
      return [reportKey, {
        path: relativeToRoot(rootDir, absolutePath),
        exists: fs.existsSync(absolutePath),
        registered_path: docs[reportKey] ?? null,
      }];
    }),
  );
}

function buildActiveStateStatus(rootDir, options = {}) {
  const resolved = resolveActiveState({
    rootDir,
    sessionId: options.sessionId ?? null,
    now: options.now,
    maxAgeMs: options.maxAgeMs,
  });

  if (!resolved) {
    return {
      path: null,
      stale: null,
      state: null,
    };
  }

  return {
    path: relativeToRoot(rootDir, resolved.filePath),
    stale: isStateFileStale(resolved.filePath, {
      now: options.now,
      maxAgeMs: options.maxAgeMs,
    }),
    state: resolved.state,
  };
}

function normalizeArtifactLocation(rootDir, contentId) {
  if (typeof contentId !== 'string' || contentId.length === 0) {
    return null;
  }

  if (contentId.startsWith('local:')) {
    const localPath = contentId.slice('local:'.length);
    if (!localPath) {
      return { content_id: contentId };
    }

    const resolvedPath = path.isAbsolute(localPath)
      ? relativeToRoot(rootDir, localPath)
      : localPath.split(path.sep).join('/');

    return {
      content_id: contentId,
      path: resolvedPath,
    };
  }

  return {
    content_id: contentId,
    url: `https://km.sankuai.com/collabpage/${contentId}`,
  };
}

function buildArtifactsStatus(rootDir, checkpoint) {
  return stripNullish({
    requirements_spec: normalizeArtifactLocation(rootDir, checkpoint?.requirements_spec_content_id),
    tech_spec: normalizeArtifactLocation(rootDir, checkpoint?.tech_spec_content_id),
    task_plan: checkpoint?.plan_path ? { path: checkpoint.plan_path } : null,
    papi_sync: (checkpoint?.papi_sync_status || checkpoint?.papi_synced_apis) ? {
      status: checkpoint?.papi_sync_status ?? null,
      synced_apis: checkpoint?.papi_synced_apis ?? null,
    } : null,
    test_cases: normalizeArtifactLocation(rootDir, checkpoint?.tclist_content_id),
    shepherd_config: checkpoint?.shepherd_config_status ? {
      status: checkpoint.shepherd_config_status,
    } : null,
    test_report: normalizeArtifactLocation(rootDir, checkpoint?.test_report_content_id),
    bug_analysis: normalizeArtifactLocation(rootDir, checkpoint?.bug_analysis_content_id),
    deploy_stack: checkpoint?.cargo_stack_uuid ? {
      stack_uuid: checkpoint.cargo_stack_uuid,
      base_url: checkpoint.cargo_base_url ?? null,
      swimlane: checkpoint.cargo_swimlane ?? null,
    } : null,
  });
}

function listCheckpointSummaries(rootDir) {
  const runwayDir = path.join(rootDir, '.runway');
  if (!fs.existsSync(runwayDir)) {
    return [];
  }

  return fs.readdirSync(runwayDir)
    .filter((name) => /^checkpoint-.+\.json$/.test(name))
    .map((name) => {
      const filePath = path.join(runwayDir, name);
      const checkpoint = readCheckpoint(filePath);
      return {
        ones_id: checkpoint.ones_work_item_id,
        path: relativeToRoot(rootDir, filePath),
        current_stage: checkpoint.current_stage ?? null,
        updated_at: checkpoint.updated_at ?? null,
        active: false,
      };
    })
    .sort((left, right) => {
      if (left.updated_at && right.updated_at) {
        return right.updated_at.localeCompare(left.updated_at);
      }
      return right.path.localeCompare(left.path);
    });
}

function resolveStatus(rootDir, onesId, options = {}) {
  const checkpointPath = getCheckpointPath(rootDir, onesId);
  const checkpointExists = fs.existsSync(checkpointPath);
  const checkpoint = checkpointExists ? readCheckpoint(checkpointPath) : null;

  return {
    ones_id: onesId,
    checkpoint: {
      path: relativeToRoot(rootDir, checkpointPath),
      exists: checkpointExists,
      data: checkpoint ? stripNullish(checkpoint) : null,
    },
    active_state: buildActiveStateStatus(rootDir, options),
    artifacts: buildArtifactsStatus(rootDir, checkpoint),
    reports: buildReportsStatus(rootDir, onesId, checkpoint),
  };
}

function resolveWorkflowAdvisory(rootDir, options = {}) {
  const activeState = buildActiveStateStatus(rootDir, options);
  const checkpoints = listCheckpointSummaries(rootDir);

  if (activeState.state?.active !== true) {
    return null;
  }

  const activeCheckpoint = checkpoints[0]
    ? {
        ...checkpoints[0],
        active: true,
      }
    : null;

  return {
    active_state: activeState,
    checkpoint: activeCheckpoint,
  };
}

module.exports = {
  buildActiveStateStatus,
  buildReportsStatus,
  listCheckpointSummaries,
  relativeToRoot,
  resolveStatus,
  resolveWorkflowAdvisory,
  stripNullish,
};
