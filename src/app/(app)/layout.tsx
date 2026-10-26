import { Suspense } from "react";
import { connection } from "next/server";
import { CalendarDays, LogOut } from "lucide-react";
import { Breadcrumb, NavLinks, NavLinksFallback } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

// Data inventaris selalu dibaca segar per request (tanpa cache), jadi navigasi
// menampilkan loading.tsx sebentar. Matikan saran "instant navigation" untuk segmen ini.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-1 flex-col gap-2 p-2 md:flex-row md:gap-0 md:p-3 print:block print:p-0">
      <aside className="flex flex-col print:hidden md:sticky md:top-3 md:h-[calc(100vh-1.5rem)] md:w-60 md:shrink-0 md:pr-3">
        <div className="flex items-center gap-2 px-2.5 py-2 md:mb-5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-surface">K</span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Inventaris IT</p>
            <p className="text-xs text-muted">Kembar Futa Group</p>
          </div>
        </div>
        <nav className="overflow-x-auto pb-1 md:flex-1 md:overflow-visible">
          <Suspense fallback={<NavLinksFallback />}>
            <SidebarNav />
          </Suspense>
        </nav>
        <div className="hidden space-y-1 md:block">
          <div className="flex items-center justify-between gap-2 px-2.5">
            <span className="text-xs text-muted">Tema</span>
            <ThemeToggle compact />
          </div>
          <Suspense fallback={<div className="h-12" />}>
            <UserBadge />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-surface shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <header className="flex h-12 items-center justify-between gap-3 border-b border-border px-4 print:hidden md:px-6">
          <Suspense fallback={<span />}>
            <Breadcrumb />
          </Suspense>
          <Suspense fallback={null}>
            <Today />
          </Suspense>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6 print:p-0">{children}</main>
        <div className="space-y-2 border-t border-border p-3 print:hidden md:hidden">
          <ThemeToggle />
          <Suspense fallback={null}>
            <UserBadge />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function SidebarNav() {
  await getCurrentUser();
  const supabase = await createClient();
  const today = todayISO();
  const inAWeek = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const [assets, employees, stock, maintenance, subscriptions] = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "aktif"),
    supabase.from("stock_items").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("maintenance_schedule").select("asset_id", { count: "exact", head: true }).lte("next_due", today),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("active", true).lte("next_due_date", inAWeek),
  ]);
  return (
    <NavLinks
      counts={{
        assets: assets.count ?? 0,
        employees: employees.count ?? 0,
        stock: stock.count ?? 0,
        maintenanceDue: maintenance.count ?? 0,
        subscriptionsDue: subscriptions.count ?? 0,
      }}
    />
  );
}

async function Today() {
  await connection(); // tanggal dihitung saat request, bukan saat prerender
  const label = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
  return (
    <span className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted sm:flex">
      <CalendarDays className="size-3.5" />
      {label}
    </span>
  );
}

async function UserBadge() {
  const user = await getCurrentUser();
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold ring-1 ring-border">
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.role === "admin" ? "Admin IT" : "Viewer"} · {user.email}</p>
      </div>
      <form action={signOut}>
        <button className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-danger" type="submit" title="Keluar">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
