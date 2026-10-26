"use client";

import Form from "next/form";
import { useRef } from "react";
import { Search } from "lucide-react";

type Option = { value: string; label: string };

/** Toolbar pencarian + filter dropdown; berubah langsung saat dipilih. */
export function FilterBar({
  action,
  q,
  placeholder,
  selects,
  hidden,
  children,
}: {
  action: string;
  q?: string;
  placeholder: string;
  selects: { name: string; value?: string; allLabel: string; options: Option[] }[];
  /** parameter yang ikut terkirim tanpa ditampilkan, mis. tab aktif */
  hidden?: Record<string, string>;
  children?: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const submit = () => form.current?.requestSubmit();
  return (
    <div className="flex flex-wrap items-center gap-2 p-3">
      <Form ref={form} action={action} className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={q}
            placeholder={placeholder}
            className="h-9 w-full rounded-lg border border-foreground/15 bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-muted/70 focus:border-foreground/30"
          />
        </div>
        {selects.map((s) => (
          <select
            key={s.name}
            name={s.name}
            defaultValue={s.value ?? ""}
            onChange={submit}
            className="h-9 rounded-lg border border-foreground/15 bg-surface px-2.5 text-sm outline-none focus:border-foreground/30"
          >
            <option value="">{s.allLabel}</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button type="submit" className="sr-only">Cari</button>
      </Form>
      {children}
    </div>
  );
}
