/**
 * Utilitários de datas civis (sem horário) no formato ISO "AAAA-MM-DD".
 * Todo o cálculo de "hoje" usa o fuso America/Fortaleza.
 */

export const FUSO = "America/Fortaleza";

export type DataISO = string; // "AAAA-MM-DD"

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

export const DIAS_SEMANA = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado",
] as const;

/** Data de hoje no fuso America/Fortaleza. */
export function hojeFortaleza(agora: Date = new Date()): DataISO {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function partes(d: DataISO): { ano: number; mes: number; dia: number } {
  const m = RE_ISO.exec(d);
  if (!m) throw new Error(`Data inválida: ${d}`);
  return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

export function isDataISO(v: unknown): v is DataISO {
  if (typeof v !== "string") return false;
  const m = RE_ISO.exec(v);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 1900 || ano > 2200 || mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= diasNoMes(ano, mes);
}

export function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

export function diasNoMes(ano: number, mes: number): number {
  return [31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
}

function pad(n: number, t = 2): string {
  return String(n).padStart(t, "0");
}

export function montar(ano: number, mes: number, dia: number): DataISO {
  return `${pad(ano, 4)}-${pad(mes)}-${pad(dia)}`;
}

/**
 * Equivalente ao DATE(ano; mês; dia) do Excel: dias excedentes passam para o mês seguinte.
 * Ex.: 29/02 em ano não bissexto vira 01/03 (mesmo comportamento da planilha original).
 */
export function dataNormalizada(ano: number, mes: number, dia: number): DataISO {
  const t = Date.UTC(ano, mes - 1, dia);
  const d = new Date(t);
  return montar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Número de dias desde 1970-01-01 (para diferenças exatas). */
export function diaSerial(d: DataISO): number {
  const { ano, mes, dia } = partes(d);
  return Math.round(Date.UTC(ano, mes - 1, dia) / 86_400_000);
}

export function diferencaDias(de: DataISO, ate: DataISO): number {
  return diaSerial(ate) - diaSerial(de);
}

export function somarDias(d: DataISO, n: number): DataISO {
  const t = new Date((diaSerial(d) + n) * 86_400_000);
  return montar(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function diaDaSemana(d: DataISO): number {
  const { ano, mes, dia } = partes(d);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

export function inicioDoMes(ano: number, mes: number): DataISO {
  return montar(ano, mes, 1);
}

export function fimDoMes(ano: number, mes: number): DataISO {
  return montar(ano, mes, diasNoMes(ano, mes));
}

/** Avança n meses a partir de (ano, mês), com virada de ano. */
export function deslocarMes(ano: number, mes: number, n: number): { ano: number; mes: number } {
  const total = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/** Mês atual e próximo mês em relação a "hoje" (vira o ano automaticamente). */
export function mesAtualEProximo(hoje: DataISO) {
  const { ano, mes } = partes(hoje);
  const prox = deslocarMes(ano, mes, 1);
  return {
    atual: { ano, mes, inicio: inicioDoMes(ano, mes), fim: fimDoMes(ano, mes), nome: `${MESES[mes - 1]} de ${ano}` },
    proximo: {
      ano: prox.ano,
      mes: prox.mes,
      inicio: inicioDoMes(prox.ano, prox.mes),
      fim: fimDoMes(prox.ano, prox.mes),
      nome: `${MESES[prox.mes - 1]} de ${prox.ano}`,
    },
  };
}

// ---------------------------------------------------------------------
// Formatação e leitura em português
// ---------------------------------------------------------------------

export function formatarData(d: DataISO | null | undefined): string {
  if (!d) return "";
  const { ano, mes, dia } = partes(d);
  return `${pad(dia)}/${pad(mes)}/${ano}`;
}

export function formatarDiaMes(d: DataISO | null | undefined): string {
  if (!d) return "";
  const { mes, dia } = partes(d);
  return `${pad(dia)}/${pad(mes)}`;
}

export function formatarDataExtensa(d: DataISO): string {
  const { ano, mes, dia } = partes(d);
  return `${DIAS_SEMANA[diaDaSemana(d)]}, ${dia} de ${MESES[mes - 1]} de ${ano}`;
}

export function descreverDiasRestantes(dias: number): string {
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  if (dias === -1) return "Ontem";
  if (dias > 0) return `Em ${dias} dias`;
  return `Há ${Math.abs(dias)} dias`;
}

/**
 * Lê "DD/MM/AAAA", "DD/MM/AA", "AAAA-MM-DD" ou "DD/MM" (neste caso usa anoPadrao).
 * Retorna null se vazio; lança erro se inválido.
 */
export function lerData(texto: string | null | undefined, anoPadrao?: number): DataISO | null {
  if (texto == null) return null;
  const t = String(texto).trim();
  if (t === "") return null;
  if (RE_ISO.test(t)) {
    if (!isDataISO(t)) throw new Error("Data inválida");
    return t;
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t);
  if (!m) throw new Error("Data inválida");
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano: number;
  if (m[3] === undefined) {
    if (anoPadrao === undefined) throw new Error("Informe a data completa (DD/MM/AAAA)");
    ano = anoPadrao;
  } else {
    ano = Number(m[3]);
    if (m[3].length === 2) ano += ano >= 70 ? 1900 : 2000;
  }
  const iso = montar(ano, mes, dia);
  if (!isDataISO(iso)) throw new Error("Data inválida");
  return iso;
}
