// Enkripsi data sensitif (NIK, KK, password NVR, dll) dengan AES-256-GCM.
// Kunci diambil dari env SECRETS_KEY (32 byte, base64). Buat dengan: npm run gen-key
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.SECRETS_KEY;
  if (!raw) throw new Error("SECRETS_KEY belum diisi di environment");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("SECRETS_KEY harus 32 byte (base64)");
  return key;
}

export type SecretValues = Record<string, string>;

export function encryptSecrets(values: SecretValues): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

export function decryptSecrets(payload: string): SecretValues {
  const [version, body] = payload.split(":");
  if (version !== VERSION || !body) throw new Error("Format data terenkripsi tidak dikenali");
  const buf = Buffer.from(body, "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  const text = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  return JSON.parse(text) as SecretValues;
}
