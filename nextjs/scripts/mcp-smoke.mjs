#!/usr/bin/env node
// Smoke test for the grimoire MCP server.
// Usage:
//   GRIMOIRE_API_KEY=grm_xxx node scripts/mcp-smoke.mjs
//   MCP_URL=https://grimoire.zachsmith.app/api/mcp GRIMOIRE_API_KEY=grm_xxx node scripts/mcp-smoke.mjs

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const KEY = process.env.GRIMOIRE_API_KEY;
const URL_ = process.env.MCP_URL || 'http://localhost:3000/api/mcp';

if (!KEY) {
  console.error('Missing GRIMOIRE_API_KEY env var.');
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL(URL_), {
  requestInit: { headers: { Authorization: `Bearer ${KEY}` } },
});
const client = new Client({ name: 'grimoire-mcp-smoke', version: '0.1.0' });

let failed = 0;
async function step(label, fn) {
  process.stdout.write(`• ${label} ... `);
  try {
    const r = await fn();
    console.log('OK');
    if (process.env.VERBOSE) console.log(JSON.stringify(r, null, 2));
    return r;
  } catch (err) {
    failed++;
    console.log('FAIL');
    console.error('  ' + (err?.message || err));
    return null;
  }
}

await client.connect(transport);

const tools = await step('tools/list', () => client.listTools());
if (tools) {
  console.log(`  ${tools.tools.length} tools registered`);
}

await step('whoami', () => client.callTool({ name: 'whoami', arguments: {} }));
await step('golem_get_user_profile', () =>
  client.callTool({ name: 'golem_get_user_profile', arguments: {} }),
);
await step('golem_get_current_program', () =>
  client.callTool({ name: 'golem_get_current_program', arguments: {} }),
);
await step('golem_get_volume_landmarks', () =>
  client.callTool({ name: 'golem_get_volume_landmarks', arguments: {} }),
);
await step('quest_list_tasks', () =>
  client.callTool({ name: 'quest_list_tasks', arguments: {} }),
);
await step('quest_get_balance', () =>
  client.callTool({ name: 'quest_get_balance', arguments: { ledgerLimit: 5 } }),
);
await step('rune_list_decks', () =>
  client.callTool({ name: 'rune_list_decks', arguments: {} }),
);

await client.close();

if (failed > 0) {
  console.error(`\n${failed} step(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
