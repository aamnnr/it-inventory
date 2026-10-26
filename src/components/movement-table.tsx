import Link from "next/link";
import { Trash } from "lucide-react";
import { deleteMovement } from "@/app/(app)/stok/actions";
import { formatDate, formatRupiah } from "@/lib/format";
import { MOVEMENT_TYPES, type StockMovement } from "@/lib/stock";
import { ConfirmButton } from "./confirm-button";
import { Badge, EmptyState, Table, Td, Th } from "./ui";

const TYPE_TONE = { masuk: "green", keluar: "blue", penyesuaian: "amber" } as const;

/** Tabel riwayat transaksi stok */
export function MovementTable({
  movements,
  itemNames,
  employeeNames,
  companyNames,
  canDelete,
}: {
  movements: StockMovement[];
  /** isi bila tabel memuat banyak barang (kolom Barang ditampilkan) */
  itemNames?: Map<string, { name: string; unit: string }>;
  employeeNames: Map<string, string>;
  companyNames: Map<string, string>;
  canDelete: boolean;
}) {
  if (!movements.length) return <EmptyState>Belum ada transaksi.</EmptyState>;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Tanggal</Th>
          {itemNames && <Th>Barang</Th>}
          <Th>Jenis</Th>
          <Th className="text-right">Jumlah</Th>
          <Th>Keterangan</Th>
          {canDelete && <Th />}
        </tr>
      </thead>
      <tbody>
        {movements.map((m) => {
          const item = itemNames?.get(m.item_id);
          const who = [
            m.recipient_employee_id && employeeNames.get(m.recipient_employee_id),
            m.recipient,
            m.recipient_company_id && companyNames.get(m.recipient_company_id),
          ].filter(Boolean);
          const details =
            m.type === "masuk"
              ? [m.unit_price ? `@ ${formatRupiah(m.unit_price)}` : null, m.warranty && `Garansi: ${m.warranty}`]
              : m.type === "keluar"
                ? [who.join(" · ")]
                : [];
          return (
            <tr key={m.id} className="hover:bg-subtle/60">
              <Td className="whitespace-nowrap text-muted">{formatDate(m.moved_at)}</Td>
              {itemNames && (
                <Td>
                  <Link href={`/stok/${m.item_id}`} className="hover:underline">{item?.name ?? "(barang dihapus)"}</Link>
                </Td>
              )}
              <Td>
                <Badge tone={TYPE_TONE[m.type]}>{MOVEMENT_TYPES[m.type]}</Badge>
              </Td>
              <Td className={`text-right font-medium tabular-nums whitespace-nowrap ${m.quantity > 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                {item && <span className="ml-1 text-xs font-normal text-muted">{item.unit}</span>}
              </Td>
              <Td className="text-muted">
                {[...details, m.notes].filter(Boolean).join(" — ") || "-"}
              </Td>
              {canDelete && (
                <Td className="w-10">
                  <form action={deleteMovement}>
                    <input type="hidden" name="id" value={m.id} />
                    <ConfirmButton
                      variant="ghost"
                      className="h-7 px-1.5"
                      title="Hapus transaksi (koreksi salah input)"
                      message="Hapus transaksi ini? Stok akan dihitung ulang. Gunakan hanya untuk memperbaiki salah input."
                    >
                      <Trash className="size-3.5" />
                    </ConfirmButton>
                  </form>
                </Td>
              )}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
