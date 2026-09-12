import PermissionGuardServer from "@/components/PermissionGuardServer";
import ContentNotFound from "@/components/ContentNotFound";

// User administration (user detail / API keys / delete) — global-admin only.
// Sibling of `app/settings/ui/admin/layout.tsx`; see the note there.
export default function SettingsUserLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGuardServer fallback={<ContentNotFound />}>
      {children}
    </PermissionGuardServer>
  );
}
