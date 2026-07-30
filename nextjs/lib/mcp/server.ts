import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';
import { registerMetaTools } from './tools/meta';
import { registerGolemTools } from './tools/golem';
import { registerQuestTools } from './tools/quest';
import { registerRuneTools } from './tools/rune';
import { registerForageTools } from './tools/forage';

// Registers every grimoire MCP tool on the given server, scoped to the resolved user.
// Called once per request from the route handler so each tool handler captures a fresh
// user context via closure — no shared mutable server, no AsyncLocalStorage.
export function registerGrimoireTools(server: McpServer, ctx: McpContext) {
  registerMetaTools(server, ctx);
  registerGolemTools(server, ctx);
  registerQuestTools(server, ctx);
  registerRuneTools(server, ctx);
  registerForageTools(server, ctx);
}
