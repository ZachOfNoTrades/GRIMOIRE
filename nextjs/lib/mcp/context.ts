import type { AuthUser } from '@/lib/permissions';

export interface McpContext {
  user: AuthUser;
}
