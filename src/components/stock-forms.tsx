"use client";

import { useActionState, useState } from "react";
import { recordMovement, saveItem } from "@/app/(app)/stok/actions";
import { MOVEMENT_TYPES, STOCK_CATEGORIES, type MovementType, type StockItem } from "@/lib/stock";
import type { Company, Employee } from "@/lib/types";
import { ActionMessage, SubmitButton } from "./form-status";
import { Field, Input, Select, Textarea } from "./ui";

/** Form tambah / edit data barang */
export function ItemForm({ item }: { item?: StockItem }) {
  const [state, action] = useActionState(saveItem, undefined);
  const [category, setCategory] = useState(item?.category ?? STOCK_CATEGORIES[0]);
  const isInk = category === "Tinta & Kertas";

  return (
    <form action={action} className="space-y-4">
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Barang" className="sm:col-span-2">
          <Input name="name" defaultValue={item?.name} placeholder="mis. LOGITECH Mouse Kabel B100" required />
        </Field>
        <Field label="Kategori">
          <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {STOCK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Satuan">
          <Input name="unit" defaultValue={item?.unit ?? (isInk ? "botol" : "pcs")} key={item ? "u" : category} list="units" />
          <datalist id="units">
            {["pcs", "botol", "box", "roll", "meter", "set", "pack"].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        <Field label="Stok Minimum" hint="Muncul peringatan bila stok ≤ angka ini. Isi 0 bila tidak perlu.">
          <Input name="min_stock" type="number" min={0} defaultValue={item?.min_stock ?? (isInk ? 1 : 0)} key={item ? "m" : category} />
        </Field>
        <Field label="Lokasi Penyimpanan">
          <Input name="location" defaultValue={item?.location ?? ""} placeholder="mis. Laci Besi Lantai 2" />
        </Field>
        {isInk && (
          <>
            <Field label="Untuk Printer">
              <Input name="printer" defaultValue={item?.printer ?? ""} placeholder="mis. EPSON L3210" />
            </Field>
            <Field label="Kode Tinta">
              <Input name="ink_code" defaultValue={item?.ink_code ?? ""} placeholder="mis. 003, GI-790" />
            </Field>
          </>
        )}
        {!item && (
          <Field label="Stok Awal" hint="Jumlah yang ada sekarang. Pembelian berikutnya dicatat lewat Barang Masuk.">
            <Input name="initial_stock" type="number" min={0} defaultValue={0} />
          </Field>
        )}
        <Field label="Catatan" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={item?.notes ?? ""} />
        </Field>
        {item && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="active" defaultChecked={item.active} className="size-4" />
            Barang aktif (hapus centang untuk mengarsipkan barang yang tidak dipakai lagi)
          </label>
        )}
      </div>
      <ActionMessage state={state} />
      <SubmitButton>{item ? "Simpan Perubahan" : "Tambah Barang"}</SubmitButton>
    </form>
  );
}

const TAB_LABEL: Record<MovementType, string> = { masuk: "Masuk", keluar: "Keluar", penyesuaian: "Penyesuaian" };

type ItemOption =Pick<StockItem, "id" | "code" | "name" | "category" | "unit"> & { stock: number };

/** Form barang masuk / keluar / penyesuaian */
export function MovementForm({
  items,
  employees,
  companies,
  defaultItemId,
  defaultType = "keluar",
  today,
  lockItem,
}: {
  items: ItemOption[];
  employees: (Employee & { company_name: string })[];
  companies: Company[];
  defaultItemId?: string;
  defaultType?: MovementType;
  today: string;
  /** sembunyikan pilihan barang (dipakai di halaman detail barang) */
  lockItem?: boolean;
}) {
  const [state, action] = useActionState(recordMovement, undefined);
  const [type, setType] = useState<MovementType>(defaultType);
  const [itemId, setItemId] = useState(defaultItemId ?? "");
  const [companyId, setCompanyId] = useState("");
  const selected = items.find((i) => i.id === itemId);
  const categories = [...new Set(items.map((i) => i.category))].sort();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="type" value={type} />
      <div className="flex w-full max-w-sm rounded-lg bg-subtle p-1 text-sm">
        {(Object.keys(MOVEMENT_TYPES) as MovementType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 whitespace-nowrap rounded-md px-2 py-1 ${type === t ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {lockItem ? (
        <input type="hidden" name="item_id" value={itemId} />
      ) : (
        <Field label="Barang">
          <Select name="item_id" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
            <option value="">— pilih barang —</option>
            {categories.map((c) => (
              <optgroup key={c} label={c}>
                {items
                  .filter((i) => i.category === c)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.code} · {i.name} (stok {i.stock})
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      )}
      {selected && (
        <p className="text-sm text-muted">
          Stok saat ini: <b className="text-foreground">{selected.stock} {selected.unit}</b>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={type === "penyesuaian" ? "Selisih (+ / −)" : "Jumlah"}
          hint={type === "penyesuaian" ? "mis. −2 bila fisik kurang 2, +1 bila lebih 1" : undefined}
        >
          <Input name="quantity" type="number" min={type === "penyesuaian" ? undefined : 1} defaultValue={1} required />
        </Field>
        <Field label="Tanggal">
          <Input name="moved_at" type="date" defaultValue={today} required />
        </Field>

        {type === "masuk" && (
          <>
            <Field label="Harga Satuan (Rp)">
              <Input name="unit_price" inputMode="numeric" placeholder="mis. 62000" />
            </Field>
            <Field label="Garansi">
              <Input name="warranty" placeholder="mis. 1 tahun / s/d 2027-05-31" />
            </Field>
          </>
        )}

        {type === "keluar" && (
          <>
            <Field label="Unit Bisnis Penerima">
              <Select name="recipient_company_id" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— grup / tidak spesifik —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Karyawan Penerima" hint="Opsional">
              <Select name="recipient_employee_id" defaultValue="" key={companyId}>
                <option value="">—</option>
                {employees
                  .filter((e) => e.status === "aktif" && (!companyId || e.company_id === companyId))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}{companyId ? "" : ` · ${e.company_name}`}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Keperluan / Dipasang di" className="sm:col-span-2">
              <Input name="recipient" placeholder="mis. PC Mba Luna Marketing, CCTV Gerbang Futake" />
            </Field>
          </>
        )}

        <Field label={type === "penyesuaian" ? "Alasan" : "Catatan"} className="sm:col-span-2">
          <Input name="notes" placeholder={type === "penyesuaian" ? "mis. stok opname Oktober, barang rusak" : ""} />
        </Field>
      </div>

      <ActionMessage state={state} />
      <SubmitButton>Catat {MOVEMENT_TYPES[type]}</SubmitButton>
    </form>
  );
}
