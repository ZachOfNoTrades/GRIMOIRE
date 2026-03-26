import PermissionGuardServer from "@/components/PermissionGuardServer";
import ContentNotFound from "@/components/ContentNotFound";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGuardServer fallback={<ContentNotFound />}>
      {children}
    </PermissionGuardServer>
  );
}
