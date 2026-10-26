import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary: "bg-primary text-surface hover:bg-primary-hover",
  secondary: "border border-border bg-surface hover:bg-subtle",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger/10",
  ghost: "text-muted hover:bg-subtle hover:text-foreground",
};
type ButtonVariant = keyof typeof buttonStyles;
const buttonBase =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

const fieldBase =
  "w-full rounded-lg border border-foreground/15 bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-foreground/40 focus:ring-2 focus:ring-foreground/5";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, "min-h-20", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, "h-9 pr-8", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ title, actions, children, className, flush }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** tanpa padding isi (untuk tabel) */
  flush?: boolean;
}) {
  return (
    <section className={cx("rounded-xl border border-border bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Kartu angka ringkasan, seperti "Total Workflow" pada referensi */
export function StatCard({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: ReactNode; href?: string }) {
  const body = (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-foreground/20">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

const badgeTones = {
  gray: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
  green: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  blue: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  amber: "bg-amber-400/20 text-amber-800 dark:text-amber-300",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
};
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", badgeTones[tone])}>
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, BadgeTone> = {
  dipakai: "blue",
  tersedia: "green",
  perbaikan: "amber",
  rusak: "red",
  pensiun: "gray",
  aktif: "green",
  pindah: "amber",
  resign: "gray",
};

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cx("border-y border-border bg-subtle px-3 py-2 text-left text-xs font-medium text-muted whitespace-nowrap first:pl-4 last:pr-4", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-border px-3 py-2.5 align-middle first:pl-4 last:pr-4", className)}>{children}</td>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="p-10 text-center text-sm text-muted">{children}</p>;
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className="mt-0.5 whitespace-pre-line break-words text-sm">{item.value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Paginasi bernomor: ‹ 1 2 3 … 9 10 › */
export function Pagination({ page, totalPages, hrefFor, summary }: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  summary: ReactNode;
}) {
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  const item = "flex size-8 items-center justify-center rounded-lg text-sm";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm text-muted">{summary}</p>
      {totalPages > 1 && (
        <nav className="flex items-center gap-1">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className={cx(item, "border border-border hover:bg-subtle")} aria-label="Sebelumnya">
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className={cx(item, "border border-border opacity-40")}><ChevronLeft className="size-4" /></span>
          )}
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className={cx(item, "text-muted")}>…</span>
            ) : (
              <Link
                key={p}
                href={hrefFor(p)}
                className={cx(item, p === page ? "bg-primary text-surface" : "hover:bg-subtle")}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </Link>
            ),
          )}
          {page < totalPages ? (
            <Link href={hrefFor(page + 1)} className={cx(item, "border border-border hover:bg-subtle")} aria-label="Berikutnya">
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className={cx(item, "border border-border opacity-40")}><ChevronRight className="size-4" /></span>
          )}
        </nav>
      )}
    </div>
  );
}
