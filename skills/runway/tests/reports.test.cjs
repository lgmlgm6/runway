const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getCheckpointPath,
  getReportPath,
  writeCheckpoint,
  registerReport,
  writeReport,
  readCheckpoint,
} = require('../lib/reports.cjs');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runway-reports-'));
}

test('getReportPath returns the canonical report path', () => {
  const reportPath = getReportPath('/tmp/project', '93833807', 'execution_report');
  assert.equal(reportPath, '/tmp/project/.runway/docs/93833807/execution-report.md');
});

test('registerReport stores report paths under checkpoint docs', () => {
  const rootDir = makeTempRoot();
  writeCheckpoint(rootDir, {
    ones_work_item_id: '93833807',
    current_stage: 5,
  });

  const relativePath = '.runway/docs/93833807/cr-report.md';
  const checkpoint = registerReport(rootDir, '93833807', 'cr_report', relativePath);

  assert.equal(checkpoint.docs.cr_report, relativePath);
  assert.deepEqual(readCheckpoint(getCheckpointPath(rootDir, '93833807')).docs, {
    cr_report: relativePath,
  });
});

test('writeReport writes content and updates checkpoint docs', () => {
  const rootDir = makeTempRoot();
  writeCheckpoint(rootDir, {
    ones_work_item_id: '93833807',
    current_stage: 6,
  });

  const result = writeReport({
    rootDir,
    onesId: '93833807',
    reportKey: 'qa_report',
    content: '# QA report',
  });

  assert.equal(result.relativePath, '.runway/docs/93833807/qa-report.md');
  assert.equal(fs.readFileSync(result.absolutePath, 'utf8'), '# QA report');
  assert.equal(readCheckpoint(getCheckpointPath(rootDir, '93833807')).docs.qa_report, result.relativePath);
});
