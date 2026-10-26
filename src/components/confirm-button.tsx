"use client";

import type { ComponentProps } from "react";
import { Button } from "./ui";

/** Tombol submit yang meminta konfirmasi dulu, untuk aksi yang tidak bisa dibatalkan. */
export function ConfirmButton({ message, ...props }: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
