import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { PaymentForm, SubscriptionForm } from "@/components/subscription-forms";
import { Badge, Card, DefinitionList, EmptyState, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { BILLING_CYCLES, SUBSCRIPTION_KINDS, dueStatus, type Subscription, type SubscriptionPayment } from "@/lib/care";
import { getLookups } from "@/lib/data";
import { formatDate, formatRupiah, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { deletePayment } from "../actions";

export const metadata: Metadata = { title: "Detail Langganan" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function SubscriptionPage({ params }: PageProps<"/langganan/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();
  const today = todayISO();
  const [{ data }, { data: payments }, { companies }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("id", id).maybeSingle(),
    supabase.from("subscription_payments").select("*").eq("subscription_id", id).order("paid_at", { ascending: false }),
    getLookups(),
  ]);
  if (!data) notFound();
  const s = { ...data, amount: data.amount === null ? null : Number(data.amount) } as Subscription;
  const due = dueStatus(s.next_due_date, today);
  const paidTotal = (payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return (
    <>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{s.name}</h1>
          {s.active ? <Badge tone={due.tone}>{due.label}</Badge> : <Badge>Nonaktif</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {SUBSCRIPTION_KINDS[s.kind]} · {BILLING_CYCLES[s.billing_cycle]} · {formatRupiah(s.amount)} ·{" "}
          {s.company_id ? companies.find((c) => c.id === s.company_id)?.name : "Grup"}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Informasi">
            <DefinitionList
              items={[
                { label: "Jatuh Tempo Berikutnya", value: s.next_due_date && formatDate(s.next_due_date) },
                { label: "Vendor", value: s.vendor },
                { label: "ID / Nomor Pelanggan", value: s.account_number },
                { label: "Tanggal Mulai", value: s.start_date && formatDate(s.start_date) },
                { label: "Kontak / Nomor Terkait", value: s.contact },
                { label: "Email Akun", value: s.email },
                { label: "Benefit", value: s.description },
                { label: "Catatan", value: s.notes },
              ]}
            />
          </Card>

          <Card title={`Riwayat Pembayaran (${payments?.length ?? 0}) · total ${formatRupiah(paidTotal)}`} flush>
            {payments?.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Dibayar</Th>
                    <Th>Untuk Jatuh Tempo</Th>
                    <Th className="text-right">Nominal</Th>
                    <Th>Catatan</Th>
                    {isAdmin && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {(payments as SubscriptionPayment[]).map((p) => (
                    <tr key={p.id}>
                      <Td className="whitespace-nowrap">{formatDate(p.paid_at)}</Td>
                      <Td className="whitespace-nowrap text-muted">{formatDate(p.period_due)}</Td>
                      <Td className="text-right tabular-nums whitespace-nowrap">{formatRupiah(p.amount === null ? null : Number(p.amount))}</Td>
                      <Td className="text-muted">{p.notes ?? "-"}</Td>
                      {isAdmin && (
                        <Td className="w-10">
                          <form action={deletePayment}>
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmButton
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              message="Hapus catatan pembayaran ini? Jatuh tempo TIDAK otomatis mundur; ubah manual lewat form edit bila perlu."
                            >
                              Hapus
                            </ConfirmButton>
                          </form>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState>Belum ada pembayaran yang dicatat.</EmptyState>
            )}
          </Card>
        </div>

        {isAdmin && (
          <div className="space-y-5">
            {s.active && (
              <Card title="Catat Pembayaran">
                <PaymentForm subscription={s} today={today} />
              </Card>
            )}
            <Card title="Edit Langganan">
              <SubscriptionForm subscription={s} companies={companies} />
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
