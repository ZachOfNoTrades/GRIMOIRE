import { isAdmin } from "@/lib/permissions";
import { ReactNode } from "react";

interface PermissionGuardServerProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export default async function PermissionGuardServer({
  children,
  fallback = null,
}: PermissionGuardServerProps) {
  // Return children if user is admin
  if (await isAdmin()) {
    return <>{children}</>;
  }

  // Not admin - show fallback
  return <>{fallback}</>;
}
