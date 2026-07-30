import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '@/lib/mcp/context';
import { json } from '@/lib/mcp/format';

export function registerMetaTools(server: McpServer, ctx: McpContext) {
  server.registerTool(
    'whoami',
    {
      description:
        'Returns the authenticated grimoire user. Call this first to confirm the MCP connection is wired to the right account.',
      inputSchema: {},
    },
    async () =>
      json({
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        globalAdmin: ctx.user.globalAdmin,
      }),
  );
}
