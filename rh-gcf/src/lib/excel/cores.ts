/**
 * Leitura e classificação das cores de preenchimento das células do Excel.
 * Resolve cores RGB, cores do tema (com tonalidade/tint) e cores indexadas.
 * Regra do RH: preenchimento VERMELHO = funcionário desligado. Amarelo e outras cores não.
 */

export interface CorCelula {
  argb?: string;
  theme?: number;
  tint?: number;
  indexed?: number;
}

export type ClasseCor = "VERMELHO" | "VERMELHO_CLARO" | "AMARELO" | "OUTRA" | "NENHUMA";

// Paleta indexada padrão do Excel (índices 0–63).
const PALETA_INDEXADA = [
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080",
  "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
  "000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF",
  "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
  "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696",
  "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333",
];

const TEMA_PADRAO_OFFICE = [
  "FFFFFF", "000000", "EEECE1", "1F497D", "4F81BD", "C0504D", "9BBB59", "8064A2", "4BACC6", "F79646", "0000FF", "800080",
];

/**
 * Lê as cores do tema (theme1.xml) na ordem dos índices usados pelas células:
 * 0=lt1, 1=dk1, 2=lt2, 3=dk2, 4–9=accent1–6, 10=hlink, 11=folHlink.
 */
export function lerCoresDoTema(xml: string | undefined | null): string[] {
  if (!xml) return [...TEMA_PADRAO_OFFICE];
  const nomes = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  const cores: Record<string, string> = {};
  for (const n of nomes) {
    const bloco = new RegExp(`<a:${n}>([\\s\\S]*?)</a:${n}>`).exec(xml)?.[1] ?? "";
    const srgb = /<a:srgbClr[^>]*val="([0-9A-Fa-f]{6})"/.exec(bloco)?.[1];
    const sys = /<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(bloco)?.[1];
    cores[n] = (srgb ?? sys ?? "").toUpperCase();
  }
  const ordem = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  return ordem.map((n, i) => cores[n] || TEMA_PADRAO_OFFICE[i]);
}

function hexParaRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
}

export function rgbParaHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexParaRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslParaHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `${to(r)}${to(g)}${to(b)}`;
}

/** Aplica a tonalidade (tint) do Excel: negativo escurece, positivo clareia. */
export function aplicarTint(hex: string, tint: number | undefined): string {
  if (!tint) return hex;
  const { h, s, l } = rgbParaHsl(hex);
  const l2 = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  return hslParaHex(h, s, Math.min(1, Math.max(0, l2)));
}

/** Converte a cor da célula em hexadecimal RRGGBB (ou null se não houver). */
export function resolverCor(cor: CorCelula | undefined | null, tema: string[]): string | null {
  if (!cor) return null;
  if (cor.argb && /^[0-9A-Fa-f]{8}$/.test(cor.argb)) {
    const alfa = cor.argb.slice(0, 2).toUpperCase();
    if (alfa === "00" && cor.argb.slice(2) === "000000") return null; // "sem cor"
    return cor.argb.slice(2).toUpperCase();
  }
  if (cor.argb && /^[0-9A-Fa-f]{6}$/.test(cor.argb)) return cor.argb.toUpperCase();
  if (typeof cor.theme === "number") {
    const base = tema[cor.theme];
    if (!base) return null;
    return aplicarTint(base, cor.tint);
  }
  if (typeof cor.indexed === "number") {
    if (cor.indexed >= 64) return null; // cores automáticas do sistema
    return PALETA_INDEXADA[cor.indexed] ?? null;
  }
  return null;
}

export function classificarCor(hex: string | null): ClasseCor {
  if (!hex) return "NENHUMA";
  const { h, s, l } = rgbParaHsl(hex);
  if (l >= 0.97) return "NENHUMA"; // branco
  if (s < 0.25 || l < 0.1) return "OUTRA"; // cinzas e preto
  const vermelho = h <= 15 || h >= 340;
  if (vermelho) return l <= 0.72 && s >= 0.4 ? "VERMELHO" : "VERMELHO_CLARO";
  if (h >= 40 && h <= 70) return "AMARELO";
  return "OUTRA";
}

/** Cor de preenchimento de uma célula ExcelJS (somente padrões sólidos/gradientes contam). */
export function corDoPreenchimento(fill: unknown, tema: string[]): string | null {
  if (!fill || typeof fill !== "object") return null;
  const f = fill as { type?: string; pattern?: string; fgColor?: CorCelula; bgColor?: CorCelula; stops?: { color: CorCelula }[] };
  if (f.type === "pattern") {
    if (!f.pattern || f.pattern === "none") return null;
    return resolverCor(f.fgColor, tema) ?? resolverCor(f.bgColor, tema);
  }
  if (f.type === "gradient" && f.stops?.length) return resolverCor(f.stops[0].color, tema);
  return null;
}

export const NOMES_CLASSE: Record<ClasseCor, string> = {
  VERMELHO: "Vermelho",
  VERMELHO_CLARO: "Vermelho claro",
  AMARELO: "Amarelo",
  OUTRA: "Outra cor",
  NENHUMA: "Sem cor",
};
