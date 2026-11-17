/**
 * Leitura de valores de células ExcelJS, compartilhada pela importação de funcionários e de clientes.
 */
import type ExcelJS from "exceljs";
import { lerData, montar, type DataISO } from "@/lib/domain/datas";

export function letraColuna(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Valor "cru" de uma célula ExcelJS (hiperlink, rich text e fórmulas viram o valor exibido). */
export function valorCru(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o && typeof o.text !== "object") return o.text;
    if ("text" in o && typeof o.text === "object" && o.text && Array.isArray((o.text as { richText?: unknown[] }).richText))
      return ((o.text as { richText: { text: string }[] }).richText).map((t) => t.text).join("");
    if ("result" in o) return o.result ?? null;
    if ("error" in o) return null;
    return null;
  }
  return v;
}

export function dataDeValor(v: unknown, diaMes: boolean): { data: DataISO | null; erro?: string } {
  if (v == null || v === "") return { data: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { data: null, erro: "data inválida" };
    return { data: montar(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) };
  }
  if (typeof v === "number") {
    // Número de série do Excel (dias desde 1899-12-30)
    if (v > 0 && v < 2958466) {
      const d = new Date(Math.round((v - 25569) * 86_400_000));
      return { data: montar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
    }
    return { data: null, erro: `valor "${v}" não é uma data` };
  }
  const t = String(v).trim();
  if (t === "" || /^[—–-]+$/.test(t)) return { data: null };
  try {
    return { data: lerData(t, diaMes ? 2000 : undefined) };
  } catch {
    return { data: null, erro: `valor "${t}" não é uma data` };
  }
}

export function textoDeValor(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return montar(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  const t = String(v).trim();
  return t === "" ? null : t;
}
