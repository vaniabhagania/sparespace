import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Notice } from "@/components/status";
import { adminEnabled, isAdmin } from "@/lib/admin-session";
import { adminLoginAction } from "../actions";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="shell py-12">
      <div className="mx-auto max-w-md">
        <h1 className="text-5xl">Admin</h1>
        {adminEnabled() ? (
          <ActionForm action={adminLoginAction} className="panel mt-6 grid gap-4">
            <div>
              <label className="label" htmlFor="ad-token">Admin token</label>
              <input id="ad-token" name="token" type="password" className="field" autoComplete="current-password" required />
            </div>
            <SubmitButton pendingText="Checking…">Sign in</SubmitButton>
          </ActionForm>
        ) : (
          <div className="mt-6"><Notice>Admin isn&apos;t switched on for this site.</Notice></div>
        )}
      </div>
    </div>
  );
}
