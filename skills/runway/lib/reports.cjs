const fs = require('node:fs');
const path = require('node:path');

const REPORT_FILES = {
  execution_report: 'execution-report.md',
  cr_report: 'cr-report.md',
  qa_report: 'qa-report.md',
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getCheckpointPath(rootDir, onesId) {
  return path.join(rootDir, '.runway', `checkpoint-${onesId}.json`);
}

function readCheckpoint(checkpointPath) {
  return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
}

function writeCheckpoint(rootDir, checkpoint) {
  ensureDir(path.join(rootDir, '.runway'));
  const checkpointPath = getCheckpointPath(rootDir, checkpoint.ones_work_item_id);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
  return checkpointPath;
}

function getReportPath(rootDir, onesId, reportKey) {
  const filename = REPORT_FILES[reportKey];
  if (!filename) {
    throw new Error(`Unknown report key: ${reportKey}`);
  }

  return path.join(rootDir, '.runway', 'docs', onesId, filename);
}

function registerReport(rootDir, onesId, reportKey, relativePath) {
  const checkpointPath = getCheckpointPath(rootDir, onesId);
  const checkpoint = readCheckpoint(checkpointPath);
  const next = {
    ...checkpoint,
    docs: {
      ...(checkpoint.docs || {}),
      [reportKey]: relativePath,
    },
  };

  fs.writeFileSync(checkpointPath, JSON.stringify(next, null, 2));
  return next;
}

function writeReport({ rootDir, onesId, reportKey, content }) {
  const absolutePath = getReportPath(rootDir, onesId, reportKey);
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, content);

  const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');
  registerReport(rootDir, onesId, reportKey, relativePath);

  return {
    absolutePath,
    relativePath,
  };
}

module.exports = {
  REPORT_FILES,
  getCheckpointPath,
  getReportPath,
  readCheckpoint,
  registerReport,
  writeCheckpoint,
  writeReport,
};
