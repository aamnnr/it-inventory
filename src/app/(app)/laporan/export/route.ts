import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { todayISO } from "@/lib/format";
import { buildReport } from "@/lib/report";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Unduh laporan lengkap dalam satu file Excel (.xlsx). Data sensitif tidak ikut.
export async function GET(request: NextRequest) {
  await getCurrentUser();
  const sp = request.nextUrl.searchParams;
  const today = todayISO();
  const from = DATE_RE.test(sp.get("dari") ?? "") ? sp.get("dari")! : `${today.slice(0, 4)}-01-01`;
  const to = DATE_RE.test(sp.get("sampai") ?? "") ? sp.get("sampai")! : today;
  const unit = sp.get("unit") || undefined;

  const wb = await buildReport({ unit, from, to });
  const buffer = await wb.xlsx.writeBuffer();
  const name = `laporan-it-kfg${unit ? `-${unit}` : ""}-${from}-sd-${to}.xlsx`;
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
