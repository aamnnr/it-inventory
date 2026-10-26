"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { ActionMessage, SubmitButton } from "@/components/form-status";
import { Field, Input } from "@/components/ui";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState(signIn, undefined);
  const next = useSearchParams().get("next") ?? "";
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {next.startsWith("/q/") && (
        <p className="rounded-md bg-subtle px-3 py-2 text-sm text-muted">Masuk dulu untuk melihat aset yang Anda scan.</p>
      )}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton pendingText="Masuk…">Masuk</SubmitButton>
    </form>
  );
}
