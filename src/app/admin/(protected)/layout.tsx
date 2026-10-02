import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminUserProvider } from "@/components/admin/AdminUserContext";
import { currentAdmin, serializeAdmin } from "@/lib/admin/server";
import { liveRunId } from "@/lib/admin/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Console VICE VERSA" };

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await currentAdmin();
  if (!user) redirect("/admin/login");
  if (user.mustChangePassword) redirect("/admin/password");
  const live = await liveRunId(getDb());
  return (
    <AdminUserProvider user={serializeAdmin(user)}>
      <AdminShell liveRunId={live}>{children}</AdminShell>
    </AdminUserProvider>
  );
}
