"use client";

import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/types";
import { Button } from "./ui";

export function SubmitButton({ children, variant, pendingText = "Menyimpan…" }: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function ActionMessage({ state }: { state: ActionState }) {
  if (state?.error) return <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{state.error}</p>;
  if (state?.ok) return <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{state.ok}</p>;
  return null;
}
