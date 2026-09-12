import PermissionGuardServer from "@/components/PermissionGuardServer";
import ContentNotFound from "@/components/ContentNotFound";

// Admin settings subtree — global-admin only. The guard used to sit on
// `/settings/ui` as a whole, but `/settings/ui/home` is now the per-user
// settings hub (everyone), so it lives on the admin-only branches instead.
export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGuardServer fallback={<ContentNotFound />}>
      {children}
    </PermissionGuardServer>
  );
}
