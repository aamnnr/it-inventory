import type { Metadata } from "next";
import { FilterBar } from "@/components/filter-bar";
import { PrintButton } from "@/components/print-button";
import { EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { queryAssets, readFilters, type AssetListRow } from "@/lib/asset-query";
import { ASSET_STATUSES, CATEGORIES, CATEGORY_KEYS } from "@/lib/categories";
import { appOrigin, assetQrUrl, qrSvg } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cetak Label QR" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

const MAX_LABELS = 300;

export default async function AssetLabelsPage({ searchParams }: PageProps<"/aset/label">) {
  const sp = await searchParams;
  await getCurrentUser();
  const filters = readFilters(sp);
  const ids = typeof sp.ids === "string" ? sp.ids.split(",").filter(Boolean) : [];
  const supabase = await createClient();

  let assets: AssetListRow[] = [];
  if (ids.length) {
    const { data } = await supabase
      .from("assets")
      .select("*, company:company_id(code, name), holder:holder_employee_id(id, name), department:department_id(name), location:location_id(name)")
      .in("id", ids.slice(0, MAX_LABELS))
      .order("code");
    assets = (data ?? []) as AssetListRow[];
  } else if (filters.unit || filters.kategori || filters.status || filters.q) {
    assets = (await queryAssets(filters, { all: true })).rows.slice(0, MAX_LABELS);
  }

  const origin = await appOrigin();
  const labels = await Promise.all(assets.map(async (a) => ({ a, svg: await qrSvg(assetQrUrl(origin, a.code)) })));
  const { data: companies } = await supabase.from("companies").select("code, name").order("name");

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Cetak Label QR"
          subtitle="Tempel label di perangkat. Scan QR dengan kamera HP untuk langsung membuka detail aset."
          actions={labels.length > 0 && <PrintButton label={`Cetak ${labels.length} Label`} />}
        />
        {!ids.length && (
          <div className="mb-5 rounded-xl border border-border">
            <FilterBar
              action="/aset/label"
              q={filters.q}
              placeholder="Cari kode / nama…"
              selects={[
                { name: "unit", value: filters.unit, allLabel: "Pilih Unit", options: (companies ?? []).map((c) => ({ value: c.code, label: c.name })) },
                {
                  name: "kategori",
                  value: filters.kategori,
                  allLabel: "Semua Kategori",
                  options: CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORIES[k].label })),
                },
                {
                  name: "status",
                  value: filters.status,
                  allLabel: "Semua Status",
                  options: Object.entries(ASSET_STATUSES).map(([value, label]) => ({ value, label })),
                },
              ]}
            />
          </div>
        )}
        {labels.length > 0 && (
          <p className="mb-4 text-sm text-muted">
            Tips: cetak di kertas label stiker A4 (3 kolom), atau kertas biasa lalu tempel dengan selotip bening.
            Di dialog cetak, pilih skala 100% dan matikan &ldquo;header dan footer&rdquo;.
            {assets.length === MAX_LABELS && ` Maksimal ${MAX_LABELS} label sekali cetak.`}
          </p>
        )}
      </div>

      {labels.length === 0 ? (
        <EmptyState>Pilih unit, kategori, atau cari aset untuk menampilkan label.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-0">
          {labels.map(({ a, svg }) => (
            <div
              key={a.id}
              className="flex break-inside-avoid items-center gap-3 rounded-lg border border-dashed border-foreground/30 bg-white p-3 text-black print:h-[36mm] print:rounded-none print:border-black/40 print:p-[3mm]"
            >
              <div className="size-24 shrink-0 print:size-[28mm]" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="min-w-0 leading-tight">
                <p className="text-[9px] font-medium uppercase tracking-wider text-black/60">Aset IT · KFG</p>
                <p className="mt-0.5 font-mono text-sm font-bold">{a.code}</p>
                <p className="mt-0.5 line-clamp-2 text-xs">{a.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-black/60">{a.company?.name}</p>
                <p className="mt-1 text-[8px] text-black/50">Milik perusahaan · hubungi IT Support</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
