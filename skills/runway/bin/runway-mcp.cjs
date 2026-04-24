#!/usr/bin/env node

const { resolveStatus, resolveWorkflowAdvisory } = require('../lib/status.cjs');

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function success(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function failure(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

const TOOL_DEFS = [
  {
    name: 'runway_status',
    description: 'Return checkpoint, report, and active state status for a Runway workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string' },
        onesId: { type: 'string' },
        sessionId: { type: 'string' },
        now: { type: 'string' },
        maxAgeMs: { type: 'number' },
      },
      required: ['rootDir', 'onesId'],
      additionalProperties: false,
    },
    call(args) {
      return resolveStatus(args.rootDir, args.onesId, {
        sessionId: args.sessionId ?? null,
        now: args.now ? new Date(args.now) : undefined,
        maxAgeMs: args.maxAgeMs,
      });
    },
  },
  {
    name: 'runway_active_workflow',
    description: 'Return the currently active Runway workflow summary for the current session.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string' },
        sessionId: { type: 'string' },
        now: { type: 'string' },
        maxAgeMs: { type: 'number' },
      },
      required: ['rootDir'],
      additionalProperties: false,
    },
    call(args) {
      return resolveWorkflowAdvisory(args.rootDir, {
        sessionId: args.sessionId ?? null,
        now: args.now ? new Date(args.now) : undefined,
        maxAgeMs: args.maxAgeMs,
      });
    },
  },
];

const TOOLS_BY_NAME = Object.fromEntries(TOOL_DEFS.map((tool) => [tool.name, tool]));

function handleRequest(message) {
  if (message.method === 'initialize') {
    success(message.id, {
      protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'runway', version: '0.1.0' },
    });
    return;
  }

  if (message.method === 'notifications/initialized') {
    return;
  }

  if (message.method === 'tools/list') {
    success(message.id, {
      tools: TOOL_DEFS.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    });
    return;
  }

  if (message.method === 'tools/call') {
    const tool = TOOLS_BY_NAME[message.params?.name];
    if (!tool) {
      failure(message.id, -32601, 'Unknown tool');
      return;
    }

    try {
      const payload = tool.call(message.params?.arguments || {});
      success(message.id, {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      });
    } catch (error) {
      failure(message.id, -32000, error instanceof Error ? error.message : String(error));
    }
    return;
  }

  failure(message.id ?? null, -32601, 'Method not found');
}

let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const delimiterIndex = buffer.indexOf(Buffer.from('\r\n\r\n'));
    if (delimiterIndex === -1) break;

    const header = buffer.slice(0, delimiterIndex).toString('utf8');
    const match = header.match(/Content-Length: (\d+)/i);
    if (!match) {
      buffer = Buffer.alloc(0);
      break;
    }

    const contentLength = Number(match[1]);
    const frameLength = delimiterIndex + 4 + contentLength;
    if (buffer.length < frameLength) break;

    const body = buffer.slice(delimiterIndex + 4, frameLength).toString('utf8');
    buffer = buffer.slice(frameLength);
    handleRequest(JSON.parse(body));
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});
