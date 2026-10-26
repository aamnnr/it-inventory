import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, CalendarX2, Coins, Globe, KeyRound, Plus, Receipt, Wifi } from "lucide-react";
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatCard, StatGrid, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { BILLING_CYCLES, SUBSCRIPTION_KINDS, dueStatus, monthlyCost, type Subscription } from "@/lib/care";
import { byId, getLookups } from "@/lib/data";
import { formatDate, formatRupiah, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Langganan & Lisensi" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

const KIND_ICON = { internet: Wifi, lisensi: KeyRound, domain_hosting: Globe, lainnya: Receipt };
const KIND_COLOR = { internet: "bg-sky-500", lisensi: "bg-violet-500", domain_hosting: "bg-teal-500", lainnya: "bg-zinc-500" };

export default async function SubscriptionsPage({ searchParams }: PageProps<"/langganan">) {
  const sp = await searchParams;
  const showInactive = sp.status === "nonaktif";
  const user = await getCurrentUser();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data }, lookups] = await Promise.all([
    supabase.from("subscriptions").select("*").order("next_due_date", { ascending: true, nullsFirst: false }),
    getLookups(),
  ]);
  const all = ((data ?? []) as Subscription[]).map((s) => ({ ...s, amount: s.amount === null ? null : Number(s.amount) }));
  const active = all.filter((s) => s.active);
  const rows = (showInactive ? all.filter((s) => !s.active) : active).map((s) => ({ ...s, due: dueStatus(s.next_due_date, today) }));
  const companies = byId(lookups.companies);

  const overdue = active.filter((s) => s.next_due_date && s.next_due_date < today);
  const dueSoon = active.filter((s) => {
    const d = dueStatus(s.next_due_date, today).days;
    return d !== null && d >= 0 && d <= 7;
  });
  const perMonth = active.reduce((sum, s) => sum + monthlyCost(s), 0);

  return (
    <>
      <PageHeader
        title="Langganan & Lisensi"
        subtitle="Internet, lisensi software, dan tagihan rutin lainnya beserta pengingat jatuh temponya."
        actions={
          user.role === "admin" && (
            <LinkButton href="/langganan/baru">
              <Plus className="size-4" /> Tambah Langganan
            </LinkButton>
          )
        }
      />

      <StatGrid>
        <StatCard icon={Receipt} label="Langganan Aktif" value={active.length} />
        <StatCard icon={BellRing} label="Jatuh Tempo ≤ 7 Hari" value={dueSoon.length} />
        <StatCard icon={CalendarX2} label="Terlambat" value={overdue.length} />
        <StatCard icon={Coins} label="Perkiraan Biaya / Bulan" value={formatRupiah(perMonth)} />
      </StatGrid>

      <Card
        flush
        title={showInactive ? "Langganan Nonaktif" : "Langganan Aktif"}
        actions={
          <Link href={showInactive ? "/langganan" : "/langganan?status=nonaktif"} className="text-xs text-muted hover:text-foreground">
            {showInactive ? "Lihat yang aktif" : `Lihat nonaktif (${all.length - active.length})`}
          </Link>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Belum ada langganan.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Langganan</Th>
                <Th>Unit</Th>
                <Th>Siklus</Th>
                <Th className="text-right">Nominal</Th>
                <Th>Jatuh Tempo</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const Icon = KIND_ICON[s.kind];
                return (
                  <tr key={s.id} className="hover:bg-subtle/60">
                    <Td>
                      <Link href={`/langganan/${s.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                        <span className={`flex size-5 shrink-0 items-center justify-center rounded-md text-white ${KIND_COLOR[s.kind]}`}>
                          <Icon className="size-3" />
                        </span>
                        {s.name}
                      </Link>
                      <p className="ml-7.5 mt-0.5 text-xs text-muted">
                        {[SUBSCRIPTION_KINDS[s.kind], s.description].filter(Boolean).join(" · ")}
                      </p>
                    </Td>
                    <Td className="text-muted whitespace-nowrap">{s.company_id ? companies.get(s.company_id)?.name : "Grup"}</Td>
                    <Td className="text-muted">{BILLING_CYCLES[s.billing_cycle]}</Td>
                    <Td className="text-right tabular-nums whitespace-nowrap">{formatRupiah(s.amount)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(s.next_due_date)}</Td>
                    <Td>{s.active ? <Badge tone={s.due.tone}>{s.due.label}</Badge> : <Badge>Nonaktif</Badge>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
