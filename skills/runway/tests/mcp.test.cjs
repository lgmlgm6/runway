const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { initStateFile } = require('../lib/state.cjs');
const { writeCheckpoint, writeReport } = require('../lib/reports.cjs');

const mcpPath = path.join(__dirname, '..', 'bin', 'runway-mcp.cjs');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runway-mcp-'));
}

function createClient() {
  const child = spawn(process.execPath, [mcpPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = Buffer.alloc(0);
  const pending = [];

  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const delimiterIndex = buffer.indexOf(Buffer.from('\r\n\r\n'));
      if (delimiterIndex === -1) break;
      const header = buffer.slice(0, delimiterIndex).toString('utf8');
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) break;
      const contentLength = Number(match[1]);
      const frameLength = delimiterIndex + 4 + contentLength;
      if (buffer.length < frameLength) break;
      const body = buffer.slice(delimiterIndex + 4, frameLength).toString('utf8');
      buffer = buffer.slice(frameLength);
      const next = pending.shift();
      if (next) next.resolve(JSON.parse(body));
    }
  });

  child.stderr.on('data', () => {});

  return {
    child,
    request(message) {
      const body = JSON.stringify(message);
      child.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    },
    async close() {
      child.stdin.end();
      await new Promise((resolve) => child.once('exit', resolve));
    },
  };
}

test('runway MCP server lists tools and serves status queries', async () => {
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

  const client = createClient();
  try {
    const init = await client.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });
    assert.equal(init.result.serverInfo.name, 'runway');

    const tools = await client.request({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    assert.deepEqual(tools.result.tools.map((tool) => tool.name), [
      'runway_status',
      'runway_active_workflow',
    ]);

    const status = await client.request({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'runway_status',
        arguments: {
          rootDir,
          onesId: '123',
          sessionId: 'session-1',
          now: '2026-04-15T12:30:00Z',
          maxAgeMs: 7200000,
        },
      },
    });
    const payload = JSON.parse(status.result.content[0].text);
    assert.equal(payload.ones_id, '123');
    assert.equal(payload.active_state.state.mode, 'pipeline');
    assert.equal(payload.reports.cr_report.exists, true);
  } finally {
    await client.close();
  }
});
