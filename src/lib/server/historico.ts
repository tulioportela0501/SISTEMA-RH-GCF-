import { createHash } from "node:crypto";
import type { Executor } from "./db";
import { CAMPO_POR_CHAVE, type CampoChave } from "@/lib/domain/campos";
import { formatarData, formatarDiaMes } from "@/lib/domain/datas";

export type Operacao =
  | "CRIACAO"
  | "ALTERACAO"
  | "IMPORTACAO"
  | "EXPORTACAO"
  | "EXCLUSAO"
  | "DESLIGAMENTO"
  | "REATIVACAO"
  | "DESATIVACAO"
  | "ATIVACAO"
  | "SENHA"
  | "USUARIO";

export type Entidade = "FUNCIONARIO" | "DATA_COMEMORATIVA" | "DATA_CLIENTE" | "FELICITACAO" | "USUARIO" | "IMPORTACAO" | "HISTORICO" | "SISTEMA";

export const OPERACOES: Record<Operacao, string> = {
  CRIACAO: "Cadastro",
  ALTERACAO: "Edição",
  IMPORTACAO: "Importação",
  EXPORTACAO: "Exportação",
  EXCLUSAO: "Exclusão",
  DESLIGAMENTO: "Desligamento",
  REATIVACAO: "Reativação",
  DESATIVACAO: "Desativação de data",
  ATIVACAO: "Reativação de data",
  SENHA: "Senha",
  USUARIO: "Usuários",
};

export const ENTIDADES: Record<Entidade, string> = {
  FUNCIONARIO: "Funcionário",
  DATA_COMEMORATIVA: "Data comemorativa",
  DATA_CLIENTE: "Data do cliente",
  FELICITACAO: "Felicitação",
  USUARIO: "Usuário",
  IMPORTACAO: "Importação",
  HISTORICO: "Histórico",
  SISTEMA: "Sistema",
};

export interface Ator {
  id: number | null;
  nome: string;
  ip?: string | null;
}

export interface NovoRegistro {
  operacao: Operacao;
  entidade: Entidade;
  entidadeId?: number | null;
  registroNome?: string | null;
  campo?: string | null;
  campoLabel?: string | null;
  valorAnterior?: string | null;
  valorNovo?: string | null;
  descricao: string;
  sensivel?: boolean;
  loteId?: number | null;
}

export interface LinhaHistorico {
  id: string;
  ocorrido_em: Date;
  usuario_id: number | null;
  usuario_nome: string;
  operacao: Operacao;
  entidade: Entidade;
  entidade_id: number | null;
  registro_nome: string | null;
  campo: string | null;
  campo_label: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  descricao: string;
  sensivel: boolean;
  ip: string | null;
  lote_id: number | null;
  hash_anterior: string | null;
  hash: string;
}

const TRAVA_HISTORICO = 727_274;

function calcularHash(anterior: string | null, r: Omit<LinhaHistorico, "id" | "hash" | "hash_anterior">): string {
  const conteudo = JSON.stringify([
    anterior,
    r.ocorrido_em.toISOString(),
    r.usuario_id,
    r.usuario_nome,
    r.operacao,
    r.entidade,
    r.entidade_id,
    r.registro_nome,
    r.campo,
    r.campo_label,
    r.valor_anterior,
    r.valor_novo,
    r.descricao,
    r.sensivel,
    r.ip,
    r.lote_id,
  ]);
  return createHash("sha256").update(conteudo).digest("hex");
}

/** Grava registros no histórico. Deve ser chamado dentro de uma transação. */
export async function registrar(c: Executor, ator: Ator, registros: NovoRegistro[]): Promise<void> {
  if (registros.length === 0) return;
  await c.query("SELECT pg_advisory_xact_lock($1)", [TRAVA_HISTORICO]);
  const ultimo = await c.query<{ hash: string }>("SELECT hash FROM historico ORDER BY id DESC LIMIT 1");
  let anterior: string | null = ultimo.rows[0]?.hash ?? null;
  const agora = new Date();
  for (const reg of registros) {
    const linha = {
      ocorrido_em: agora,
      usuario_id: ator.id,
      usuario_nome: ator.nome,
      operacao: reg.operacao,
      entidade: reg.entidade,
      entidade_id: reg.entidadeId ?? null,
      registro_nome: reg.registroNome ?? null,
      campo: reg.campo ?? null,
      campo_label: reg.campoLabel ?? null,
      valor_anterior: reg.valorAnterior ?? null,
      valor_novo: reg.valorNovo ?? null,
      descricao: reg.descricao,
      sensivel: reg.sensivel ?? false,
      ip: ator.ip ?? null,
      lote_id: reg.loteId ?? null,
    };
    const hash = calcularHash(anterior, linha);
    await c.query(
      `INSERT INTO historico (ocorrido_em, usuario_id, usuario_nome, operacao, entidade, entidade_id, registro_nome,
         campo, campo_label, valor_anterior, valor_novo, descricao, sensivel, ip, lote_id, hash_anterior, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        linha.ocorrido_em, linha.usuario_id, linha.usuario_nome, linha.operacao, linha.entidade, linha.entidade_id,
        linha.registro_nome, linha.campo, linha.campo_label, linha.valor_anterior, linha.valor_novo, linha.descricao,
        linha.sensivel, linha.ip, linha.lote_id, anterior, hash,
      ],
    );
    anterior = hash;
  }
}

/** Valor legível para o histórico. */
export function valorLegivel(campo: CampoChave | string, valor: string | null | undefined): string {
  if (valor == null || String(valor).trim() === "") return "(vazio)";
  const def = CAMPO_POR_CHAVE[campo as CampoChave];
  if (def?.tipo === "data") return formatarData(valor);
  if (def?.tipo === "diames") return formatarDiaMes(valor);
  return String(valor);
}

/** Registros de alteração campo a campo entre dois estados de um funcionário. */
export function diferencasFuncionario(
  antes: Record<string, string | null>,
  depois: Record<string, string | null>,
  campos: CampoChave[],
  ctx: { ator: string; funcionarioId: number; nome: string },
): NovoRegistro[] {
  const regs: NovoRegistro[] = [];
  for (const campo of campos) {
    const a = antes[campo] ?? null;
    const d = depois[campo] ?? null;
    if ((a ?? "") === (d ?? "")) continue;
    const def = CAMPO_POR_CHAVE[campo];
    regs.push({
      operacao: "ALTERACAO",
      entidade: "FUNCIONARIO",
      entidadeId: ctx.funcionarioId,
      registroNome: ctx.nome,
      campo,
      campoLabel: def.label,
      valorAnterior: a,
      valorNovo: d,
      descricao: `${ctx.ator} alterou o campo ${def.label} de ${valorLegivel(campo, a)} para ${valorLegivel(campo, d)}.`,
    });
  }
  return regs;
}
