"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/(app)/pengguna/actions";
import { ActionMessage, SubmitButton } from "./form-status";
import { Input, Select } from "./ui";

/** Satu baris pengguna: ubah nama (dan peran bila yang mengedit admin) */
export function ProfileRow({ profile, canEditRole, isSelf }: {
  profile: { id: string; full_name: string | null; email: string | null; role: "admin" | "viewer" };
  canEditRole: boolean;
  isSelf: boolean;
}) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 px-4 py-3">
      <input type="hidden" name="id" value={profile.id} />
      <div className="min-w-48 flex-1">
        <Input name="full_name" defaultValue={profile.full_name ?? ""} aria-label="Nama" required />
        <p className="mt-1 truncate text-xs text-muted">
          {profile.email ?? "-"} {isSelf && <span className="font-medium text-foreground">· Anda</span>}
        </p>
      </div>
      {canEditRole ? (
        <Select name="role" defaultValue={profile.role} className="w-auto" aria-label="Peran">
          <option value="admin">Admin IT</option>
          <option value="viewer">Viewer</option>
        </Select>
      ) : (
        <span className="text-sm text-muted">{profile.role === "admin" ? "Admin IT" : "Viewer"}</span>
      )}
      <SubmitButton variant="secondary">Simpan</SubmitButton>
      <div className="w-full empty:hidden">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
