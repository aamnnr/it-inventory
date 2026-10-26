import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Kembar Futa Group</p>
        <h1 className="mt-1 text-xl font-semibold">Inventaris IT Support</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Masuk dengan akun yang dibuat oleh admin.</p>
        <LoginForm />
      </div>
    </main>
  );
}
