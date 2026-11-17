import "server-only";
import { query, queryOne } from "./db";
import type { LinhaHistorico } from "./historico";

export interface FiltrosHistorico {
  busca?: string | null;
  operacao?: string | null;
  entidade?: string | null;
  entidadeId?: number | null;
  usuarioId?: number | null;
  de?: string | null; // AAAA-MM-DD
  ate?: string | null;
  pagina?: number;
  porPagina?: number;
}

export type ItemHistorico = Omit<LinhaHistorico, "hash" | "hash_anterior" | "ip">;

export function filtrosDaUrl(sp: URLSearchParams): FiltrosHistorico {
  const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const data = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    busca: sp.get("busca")?.slice(0, 100) || null,
    operacao: sp.get("operacao") || null,
    entidade: sp.get("entidade") || null,
    entidadeId: num(sp.get("entidadeId")),
    usuarioId: num(sp.get("usuarioId")),
    de: data(sp.get("de")),
    ate: data(sp.get("ate")),
    pagina: Math.max(1, num(sp.get("pagina")) ?? 1),
  };
}

function montarWhere(f: FiltrosHistorico): { where: string; params: unknown[] } {
  const cond: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.busca) cond.push(`(registro_nome ILIKE ${p(`%${f.busca}%`)} OR descricao ILIKE ${p(`%${f.busca}%`)} OR usuario_nome ILIKE ${p(`%${f.busca}%`)})`);
  if (f.operacao) cond.push(`operacao = ${p(f.operacao)}`);
  if (f.entidade) cond.push(`entidade = ${p(f.entidade)}`);
  if (f.entidadeId) cond.push(`entidade_id = ${p(f.entidadeId)}`);
  if (f.usuarioId) cond.push(`usuario_id = ${p(f.usuarioId)}`);
  // Períodos considerados no fuso America/Fortaleza
  if (f.de) cond.push(`ocorrido_em >= (${p(f.de)}::date)::timestamp AT TIME ZONE 'America/Fortaleza'`);
  if (f.ate) cond.push(`ocorrido_em < ((${p(f.ate)}::date + 1)::timestamp AT TIME ZONE 'America/Fortaleza')`);
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", params };
}

export async function consultarHistorico(f: FiltrosHistorico): Promise<{ itens: ItemHistorico[]; total: number; pagina: number; porPagina: number }> {
  const porPagina = Math.min(f.porPagina ?? 50, 200);
  const pagina = f.pagina ?? 1;
  const { where, params } = montarWhere(f);
  const total = Number((await queryOne<{ n: string }>(`SELECT count(*) AS n FROM historico ${where}`, params))?.n ?? 0);
  const linhas = await query<LinhaHistorico>(
    `SELECT id, ocorrido_em, usuario_id, usuario_nome, operacao, entidade, entidade_id, registro_nome, campo, campo_label,
            valor_anterior, valor_novo, descricao, sensivel, lote_id
       FROM historico ${where} ORDER BY id DESC LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`,
    params,
  );
  const itens: ItemHistorico[] = linhas;
  return { itens, total, pagina, porPagina };
}

/** Todos os registros da consulta (sem paginação), do mais recente para o mais antigo. Somente leitura. */
export async function listarHistoricoParaExportacao(f: FiltrosHistorico, limite: number): Promise<{ itens: LinhaHistorico[]; limitado: boolean }> {
  const { where, params } = montarWhere(f);
  const linhas = await query<LinhaHistorico>(
    `SELECT id, ocorrido_em, usuario_id, usuario_nome, operacao, entidade, entidade_id, registro_nome, campo, campo_label,
            valor_anterior, valor_novo, descricao, sensivel, lote_id
       FROM historico ${where} ORDER BY id DESC LIMIT ${Math.floor(limite) + 1}`,
    params,
  );
  return { itens: linhas.slice(0, limite), limitado: linhas.length > limite };
}

/** Descrição legível dos filtros (subtítulo da planilha exportada). */
export function descreverFiltrosHistorico(f: FiltrosHistorico, operacoes: Record<string, string>): string {
  const p: string[] = [];
  if (f.busca) p.push(`Pesquisa: "${f.busca}"`);
  if (f.operacao) p.push(`Operação: ${operacoes[f.operacao] ?? f.operacao}`);
  if (f.de) p.push(`De ${f.de.split("-").reverse().join("/")}`);
  if (f.ate) p.push(`Até ${f.ate.split("-").reverse().join("/")}`);
  return p.length ? `Filtros: ${p.join(" · ")}` : "Sem filtros: todo o histórico";
}
