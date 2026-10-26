import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";

/** Alamat aplikasi saat ini (mis. https://it-inventory.vercel.app), diambil dari request */
export async function appOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** URL pendek yang dicetak di label: /q/FTK-PC-001 → halaman detail aset */
export function assetQrUrl(origin: string, code: string) {
  return `${origin}/q/${encodeURIComponent(code)}`;
}

/** QR code dalam bentuk SVG (tajam saat dicetak) */
export function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
}
