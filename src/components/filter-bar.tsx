"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";

type Option = { value: string; label: string };

const SEARCH_DELAY_MS = 400;

/**
 * Toolbar pencarian + filter dropdown.
 * - Dropdown langsung menerapkan filter; pencarian berjalan otomatis saat berhenti mengetik.
 * - Selama data baru dimuat: garis progres di atas, spinner di kotak cari, dan isi di bawah
 *   toolbar diredupkan (lihat [data-filter-pending] di globals.css) agar tidak terkesan macet.
 */
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
  /** tombol aksi di sisi kanan (Export, Cetak, dll.) */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  function apply() {
    clearTimeout(searchTimer.current);
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    const qs = params.toString();
    // halaman kembali ke 1 karena parameter "page" tidak ikut dikirim
    startTransition(() => router.push(qs ? `${action}?${qs}` : action, { scroll: false }));
  }

  return (
    <div className="relative" data-filter-pending={pending ? "" : undefined} aria-busy={pending}>
      {pending && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-xl" role="progressbar" aria-label="Memuat data">
          <div className="animate-filter-progress h-full w-1/3 bg-foreground/60" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 p-3">
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
        >
          <div className="relative min-w-48 flex-1 sm:max-w-72">
            {pending ? (
              <LoaderCircle className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
            ) : (
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            )}
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder={placeholder}
              onChange={() => {
                clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(apply, SEARCH_DELAY_MS);
              }}
              className="h-9 w-full rounded-lg border border-foreground/15 bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-muted/70 focus:border-foreground/30"
            />
          </div>
          {selects.map((s) => (
            <select
              key={s.name}
              name={s.name}
              defaultValue={s.value ?? ""}
              onChange={apply}
              className="h-9 w-40 shrink-0 truncate rounded-lg border border-foreground/15 bg-surface px-2.5 text-sm outline-none focus:border-foreground/30 sm:w-44"
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
        </form>
        {children && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
