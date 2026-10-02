import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/admin/PasswordForm";
import { currentAdmin } from "@/lib/admin/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mot de passe — Console VICE VERSA" };

export default async function PasswordPage() {
  const user = await currentAdmin();
  if (!user) redirect("/admin/login?next=/admin/password");
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-3xl">Changer de mot de passe</h1>
      <PasswordForm forced={user.mustChangePassword} />
    </main>
  );
}
