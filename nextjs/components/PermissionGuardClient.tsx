"use client";

import { useSession } from "next-auth/react";
import { ReactNode } from "react";

interface PermissionGuardClientProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export default function PermissionGuardClient({
  children,
  fallback = null,
}: PermissionGuardClientProps) {
  const { data: session } = useSession();

  // Not authenticated
  if (!session) {
    return <>{fallback}</>;
  }

  // Return children if user is admin
  if (session.user.globalAdmin) {
    return <>{children}</>;
  }

  // Not admin - show fallback
  return <>{fallback}</>;
}
