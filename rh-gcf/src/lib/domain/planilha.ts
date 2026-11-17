/**
 * Planilha Geral de Funcionários: filtros por coluna, pesquisa geral, ordenação e colunas visíveis.
 * Usado pela tela e pela exportação (a planilha exportada traz exatamente o que aparece na tela).
 */
import { z } from "zod";
import { CAMPOS_LISTA, CAMPO_POR_CHAVE, CHAVES_CAMPOS, type CampoChave } from "./campos";
import { formatarData, formatarDiaMes } from "./datas";
import { filtrarFuncionarios, type FiltroCadastro, type FiltroVinculo } from "./filtros";
import type { AnaliseCadastro } from "./pendencias";
import type { StatusVinculo, ValoresCampos } from "./tipos";
import { normalizarNome } from "@/lib/excel/normalizar";

export type FiltroVazio = "todos" | "vazios" | "preenchidos";
export type TipoFiltro = "texto" | "valores" | "periodo" | "diames";

export type FiltroColuna =
  | { tipo: "texto"; termo?: string; vazio?: FiltroVazio }
  /** Valores marcados ("" = vazio). Nenhum marcado = sem filtro. */
  | { tipo: "valores"; valores: string[] }
  | { tipo: "periodo"; de?: string | null; ate?: string | null; vazio?: FiltroVazio }
  | { tipo: "diames"; mes?: number | null; dia?: number | null; vazio?: FiltroVazio };

export type FiltrosColunas = Partial<Record<CampoChave, FiltroColuna>>;

export interface Ordenacao {
  campo: CampoChave;
  direcao: "asc" | "desc";
}

export interface ConsultaPlanilha {
  vinculo: FiltroVinculo;
  cadastro?: FiltroCadastro | null;
  /** Pesquisa geral: nome, e-mail ou telefone */
  busca?: string | null;
  colunas?: FiltrosColunas;
  ordem?: Ordenacao | null;
  /** Compatibilidade com links antigos (dashboard) */
  situacao?: string | null;
  modalidade?: string | null;
}

type Linha = Partial<ValoresCampos> & { status_vinculo: StatusVinculo; situacao: string | null; modalidade: string | null; nome: string | null; analise: Pick<AnaliseCadastro, "nivel"> };

export function tipoFiltro(chave: CampoChave): TipoFiltro {
  const t = CAMPO_POR_CHAVE[chave].tipo;
  if (t === "lista" || t === "controle") return "valores";
  if (t === "data") return "periodo";
  if (t === "diames") return "diames";
  return "texto";
}

const vazio = (v: string | null | undefined) => v == null || String(v).trim() === "";

function passaVazio(v: string | null | undefined, f: FiltroVazio | undefined): boolean {
  if (f === "vazios") return vazio(v);
  if (f === "preenchidos") return !vazio(v);
  return true;
}

export function filtroAtivo(f: FiltroColuna | undefined): boolean {
  if (!f) return false;
  switch (f.tipo) {
    case "texto":
      return !!f.termo?.trim() || (!!f.vazio && f.vazio !== "todos");
    case "valores":
      return f.valores.length > 0;
    case "periodo":
      return !!f.de || !!f.ate || (!!f.vazio && f.vazio !== "todos");
    case "diames":
      return !!f.mes || !!f.dia || (!!f.vazio && f.vazio !== "todos");
  }
}

/** O valor da célula passa no filtro da coluna? */
export function passaFiltro(chave: CampoChave, valor: string | null | undefined, f: FiltroColuna | undefined): boolean {
  if (!filtroAtivo(f)) return true;
  const v = vazio(valor) ? "" : String(valor).trim();
  switch (f!.tipo) {
    case "texto": {
      if (!passaVazio(v, f!.vazio)) return false;
      const termo = normalizarNome(f!.termo);
      if (!termo) return true;
      if (normalizarNome(v).includes(termo)) return true;
      // Telefone: compara só os dígitos
      const digitos = (f!.termo ?? "").replace(/\D/g, "");
      return CAMPO_POR_CHAVE[chave].tipo === "telefone" && digitos.length >= 3 && v.replace(/\D/g, "").includes(digitos);
    }
    case "valores":
      return f!.valores.some((x) => (x === "" ? v === "" : normalizarNome(x) === normalizarNome(v)));
    case "periodo": {
      if (!passaVazio(v, f!.vazio)) return false;
      if (!f!.de && !f!.ate) return true;
      if (!v) return false;
      const d = v.slice(0, 10);
      return (!f!.de || d >= f!.de) && (!f!.ate || d <= f!.ate);
    }
    case "diames": {
      if (!passaVazio(v, f!.vazio)) return false;
      if (!f!.mes && !f!.dia) return true;
      if (!v) return false;
      const mes = Number(v.slice(5, 7));
      const dia = Number(v.slice(8, 10));
      return (!f!.mes || mes === f!.mes) && (!f!.dia || dia === f!.dia);
    }
  }
}

/** Pesquisa geral por nome, e-mail ou telefone. */
export function passaBusca(f: { nome?: string | null; email?: string | null; telefone?: string | null }, busca: string | null | undefined): boolean {
  const termo = normalizarNome(busca);
  if (!termo) return true;
  if (normalizarNome(f.nome).includes(termo) || normalizarNome(f.email).includes(termo)) return true;
  const digitos = (busca ?? "").replace(/\D/g, "");
  return digitos.length >= 3 && (f.telefone ?? "").replace(/\D/g, "").includes(digitos);
}

function chaveOrdenacao(chave: CampoChave, v: string | null | undefined): string {
  if (vazio(v)) return "";
  const s = String(v).trim();
  const t = CAMPO_POR_CHAVE[chave].tipo;
  if (t === "data") return s.slice(0, 10);
  if (t === "diames") return s.slice(5, 10);
  return s;
}

/** Ordena pela coluna; vazios sempre no fim. Empate: nome. */
export function ordenarPlanilha<T extends Partial<ValoresCampos>>(lista: T[], ordem: Ordenacao | null | undefined): T[] {
  if (!ordem) return lista;
  const col = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  const sinal = ordem.direcao === "asc" ? 1 : -1;
  return [...lista].sort((a, b) => {
    const va = chaveOrdenacao(ordem.campo, a[ordem.campo]);
    const vb = chaveOrdenacao(ordem.campo, b[ordem.campo]);
    if (!va && vb) return 1;
    if (va && !vb) return -1;
    const c = sinal * col.compare(va, vb);
    return c !== 0 ? c : col.compare(a.nome ?? "", b.nome ?? "");
  });
}

/** Aplica vínculo, cadastro, pesquisa geral, filtros das colunas e ordenação. */
export function aplicarPlanilha<T extends Linha>(lista: T[], q: ConsultaPlanilha): T[] {
  const base = filtrarFuncionarios(lista, { filtro: q.vinculo, cadastro: q.cadastro ?? null, situacao: q.situacao ?? null, modalidade: q.modalidade ?? null });
  const filtros = Object.entries(q.colunas ?? {}).filter(([, f]) => filtroAtivo(f)) as [CampoChave, FiltroColuna][];
  const filtrada = base.filter((f) => passaBusca(f, q.busca) && filtros.every(([k, fc]) => passaFiltro(k, f[k], fc)));
  return ordenarPlanilha(filtrada, q.ordem);
}

/** Valores distintos de uma coluna (para o filtro por valores), com a quantidade de cada um. */
export function valoresDaColuna(lista: Partial<ValoresCampos>[], chave: CampoChave): { valor: string; quantidade: number }[] {
  const mapa = new Map<string, { valor: string; quantidade: number }>();
  for (const f of lista) {
    const v = vazio(f[chave]) ? "" : String(f[chave]).trim();
    const k = normalizarNome(v);
    const item = mapa.get(k) ?? { valor: v, quantidade: 0 };
    item.quantidade++;
    mapa.set(k, item);
  }
  const col = new Intl.Collator("pt-BR", { sensitivity: "base" });
  return [...mapa.values()].sort((a, b) => (a.valor === "" ? 1 : b.valor === "" ? -1 : col.compare(a.valor, b.valor)));
}

/** Texto exibido na célula (datas no formato brasileiro). */
export function textoCelula(chave: CampoChave, v: string | null | undefined): string {
  if (vazio(v)) return "";
  const t = CAMPO_POR_CHAVE[chave].tipo;
  if (t === "data") return formatarData(String(v));
  if (t === "diames") return formatarDiaMes(String(v));
  return String(v);
}

/** Descrição dos filtros (subtítulo da exportação). */
export function descreverConsulta(q: ConsultaPlanilha): string {
  const partes = [`Status: ${q.vinculo === "ativos" ? "Ativos" : q.vinculo === "desligados" ? "Desligados" : "Todos"}`];
  if (q.cadastro) partes.push(`Cadastros ${q.cadastro}`);
  if (q.situacao) partes.push(`Situação: ${q.situacao}`);
  if (q.modalidade) partes.push(`Modalidade: ${q.modalidade}`);
  if (q.busca?.trim()) partes.push(`Pesquisa: "${q.busca.trim()}"`);
  for (const [k, f] of Object.entries(q.colunas ?? {}) as [CampoChave, FiltroColuna][]) {
    if (!filtroAtivo(f)) continue;
    const label = CAMPO_POR_CHAVE[k].label;
    const vaz = "vazio" in f && f.vazio && f.vazio !== "todos" ? (f.vazio === "vazios" ? " (somente vazios)" : " (somente preenchidos)") : "";
    if (f.tipo === "texto") partes.push(`${label}${f.termo ? ` contém "${f.termo}"` : ""}${vaz}`);
    if (f.tipo === "valores") partes.push(`${label}: ${f.valores.map((x) => x || "(vazio)").join(", ")}`);
    if (f.tipo === "periodo") partes.push(`${label}${f.de ? ` de ${formatarData(f.de)}` : ""}${f.ate ? ` até ${formatarData(f.ate)}` : ""}${vaz}`);
    if (f.tipo === "diames") partes.push(`${label}${f.mes ? ` mês ${f.mes}` : ""}${f.dia ? ` dia ${f.dia}` : ""}${vaz}`);
  }
  if (q.ordem) partes.push(`Ordem: ${CAMPO_POR_CHAVE[q.ordem.campo].label} (${q.ordem.direcao === "asc" ? "crescente" : "decrescente"})`);
  return partes.join(" · ");
}

// ---------------------------------------------------------------------
// Validação (filtros vindos da URL da exportação e preferências do usuário)
// ---------------------------------------------------------------------

const chaveCampo = z.enum(CHAVES_CAMPOS as [CampoChave, ...CampoChave[]]);
const vazioSchema = z.enum(["todos", "vazios", "preenchidos"]).optional();
const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

export const filtroColunaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("texto"), termo: z.string().max(120).optional(), vazio: vazioSchema }),
  z.object({ tipo: z.literal("valores"), valores: z.array(z.string().max(300)).max(500) }),
  z.object({ tipo: z.literal("periodo"), de: dataISO, ate: dataISO, vazio: vazioSchema }),
  z.object({ tipo: z.literal("diames"), mes: z.number().int().min(1).max(12).nullable().optional(), dia: z.number().int().min(1).max(31).nullable().optional(), vazio: vazioSchema }),
]);

export const filtrosColunasSchema = z.partialRecord(chaveCampo, filtroColunaSchema);
export const ordenacaoSchema = z.object({ campo: chaveCampo, direcao: z.enum(["asc", "desc"]) });

// ---------------------------------------------------------------------
// Colunas: visibilidade e largura (preferência de cada usuário)
// ---------------------------------------------------------------------

export const CHAVE_PREFERENCIA_PLANILHA = "funcionarios.planilha";

export interface PreferenciaPlanilha {
  /** Colunas ocultas (o Nome nunca é ocultado) */
  ocultas: CampoChave[];
  larguras: Partial<Record<CampoChave, number>>;
}

export const preferenciaPlanilhaSchema = z.object({
  ocultas: z.array(chaveCampo).max(34).default([]),
  larguras: z.partialRecord(chaveCampo, z.number().int().min(60).max(800)).default({}),
});

export const PREFERENCIA_PADRAO: PreferenciaPlanilha = { ocultas: [], larguras: {} };

/** Largura padrão de cada coluna (px). */
export function larguraPadrao(chave: CampoChave): number {
  if (chave === "nome") return 260;
  if (chave === "contato_emergencia") return 260;
  if (chave === "email") return 230;
  if (chave === "telefone") return 150;
  if (chave === "conjuge" || chave.startsWith("filho")) return 170;
  const t = CAMPO_POR_CHAVE[chave].tipo;
  if (t === "data") return 118;
  if (t === "diames") return 110;
  if (t === "controle") return 118;
  if (t === "lista") return 130;
  return 120;
}

export const COLUNAS_PLANILHA = CAMPOS_LISTA.map((c) => c.chave);

/** Campos que podem ser alterados em lote (vários funcionários de uma vez). */
export const CAMPOS_EDICAO_LOTE: CampoChave[] = CHAVES_CAMPOS.filter((k) => {
  const t = CAMPO_POR_CHAVE[k].tipo;
  return t === "lista" || t === "controle" || k === "armario" || k.startsWith("ferias");
});
