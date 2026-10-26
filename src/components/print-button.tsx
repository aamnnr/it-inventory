"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui";

export function PrintButton({ label = "Cetak" }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="size-4" /> {label}
    </Button>
  );
}
