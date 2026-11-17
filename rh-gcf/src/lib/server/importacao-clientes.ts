import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { queryOne, transacao } from "./db";
import { ErroHttp } from "./http";
import { registrar, type Ator } from "./historico";
import { SELECT_DATAS_CLIENTE, atualizarDataClienteExistente, dataClienteSchema, inserirDataCliente, listarDatasCliente } from "./datas";
import { arquivoJaImportado, limparPreviasAntigas, type ImportacaoAnterior } from "./lotes";
import { listarFuncionarios } from "./funcionarios";
import {
  analisarEventosEmpresa,
  analisarImportacaoClientes,
  chaveNomeCliente,
  resumirImportacaoClientes,
  type ClienteLido,
  type DadosDataCliente,
  type LeituraClientes,
  type PreviaClientes,
} from "@/lib/domain/clientes";
import { lerPlanilhaClientes } from "@/lib/excel/importar";
import type { DataCliente } from "@/lib/domain/tipos";

/**
 * Prévia da importação de clientes: compara a planilha com o cadastro e valida cada registro
 * com as mesmas regras do formulário (validação no servidor).
 */
export function montarPreviaClientes(leitura: LeituraClientes, existentes: DataCliente[], nomesFuncionarios: string[] = []): PreviaClientes {
  const { registros } = analisarImportacaoClientes(leitura.clientes, existentes);
  for (const r of registros) {
    if (r.acao !== "NOVO") continue;
    const v = dataClienteSchema.safeParse(r.dados);
    if (!v.success) {
      r.acao = "CORRIGIR";
      r.motivo = v.error.issues[0]?.message ?? "Dados inválidos.";
    }
  }
  const calendario = leitura.calendario ? analisarEventosEmpresa(leitura.calendario, leitura.base, nomesFuncionarios) : null;
  const base = leitura.base
    ? {
        aba: leitura.base.aba,
        colaboradores: leitura.base.colaboradores.length,
        comemorar: leitura.base.comemorar,
        faltamNoSistema: leitura.base.colaboradores.filter((c) => !new Set(nomesFuncionarios.map(chaveNomeCliente)).has(chaveNomeCliente(c.nome))).length,
      }
    : null;
  return { abas: leitura.abas, lidos: leitura.clientes, registros, resumo: resumirImportacaoClientes(registros, leitura.clientes.length), avisos: leitura.avisos, calendario, base };
}

export interface PreviaImportacaoClientes {
  loteId: number;
  tipo: "CLIENTES";
  arquivo: string;
  arquivoJaImportado: ImportacaoAnterior | null;
  clientes: PreviaClientes;
}

/** Lê a planilha de clientes e guarda a prévia para conferência. Nada é gravado nos cadastros ainda. */
export async function criarPreviaClientes(buffer: Buffer, nomeArquivo: string, usuarioId: number): Promise<PreviaImportacaoClientes> {
  await limparPreviasAntigas();
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  let leitura: LeituraClientes;
  try {
    leitura = await lerPlanilhaClientes(buffer, nomeArquivo);
  } catch (e) {
    throw new ErroHttp(422, e instanceof Error ? e.message : "Não foi possível ler a planilha.");
  }
  const [existentes, funcionarios] = await Promise.all([listarDatasCliente(), listarFuncionarios()]);
  const clientes = montarPreviaClientes(
    leitura,
    existentes,
    funcionarios.map((f) => f.nome ?? "").filter(Boolean),
  );
  const previa: Omit<PreviaImportacaoClientes, "loteId"> = {
    tipo: "CLIENTES",
    arquivo: nomeArquivo,
    arquivoJaImportado: await arquivoJaImportado(sha256),
    clientes,
  };
  const lote = await queryOne<{ id: number }>(
    "INSERT INTO lotes_importacao (arquivo_nome, arquivo_sha256, previa, criado_por) VALUES ($1, $2, $3, $4) RETURNING id",
    [nomeArquivo, sha256, JSON.stringify({ ...previa, resumo: clientes.resumo }), usuarioId],
  );
  return { loteId: lote!.id, ...previa };
}

export interface ResultadoClientes {
  clientesCriados: number;
  clientesAtualizados: number;
  camposClientes: number;
  clientesIgnorados: number;
  clientesCorrigir: number;
}

/**
 * Grava os clientes conferidos (dentro da transação da importação).
 * A análise é refeita com o cadastro atual, para não duplicar nada que tenha sido cadastrado depois da prévia.
 * - Novo: cadastrado com os valores da planilha.
 * - Já cadastrado: completa só os campos vazios; valores diferentes só são substituídos se o id estiver em `substituir`.
 */
export async function gravarClientes(
  c: PoolClient,
  lidos: ClienteLido[],
  substituir: Set<string>,
  ctx: { loteId: number; arquivo: string; ator: Ator; usuarioId: number },
): Promise<ResultadoClientes> {
  const r: ResultadoClientes = { clientesCriados: 0, clientesAtualizados: 0, camposClientes: 0, clientesIgnorados: 0, clientesCorrigir: 0 };
  if (lidos.length === 0) return r;
  // Impede cadastros simultâneos do mesmo cliente durante a gravação
  await c.query("LOCK TABLE datas_cliente IN SHARE ROW EXCLUSIVE MODE");
  const { registros } = analisarImportacaoClientes(lidos, await listarDatasCliente(c));

  for (const reg of registros) {
    const origem = { loteId: ctx.loteId, arquivo: ctx.arquivo, aba: reg.aba, linha: reg.linha };
    if (reg.acao === "IGNORAR") {
      r.clientesIgnorados++;
      continue;
    }
    if (reg.acao === "CORRIGIR") {
      r.clientesCorrigir++;
      continue;
    }
    if (reg.acao === "NOVO") {
      const v = dataClienteSchema.safeParse(reg.dados);
      if (!v.success) {
        r.clientesCorrigir++;
        continue;
      }
      await inserirDataCliente(c, v.data, ctx.ator, ctx.usuarioId, { ativo: reg.ativo ?? true, importacao: origem });
      r.clientesCriados++;
      continue;
    }

    // ATUALIZAR: relê o registro (pode ter sido completado por outra linha desta mesma planilha)
    const atual = (await c.query<DataCliente>(`${SELECT_DATAS_CLIENTE} WHERE id = $1`, [reg.existenteId])).rows[0];
    if (!atual) {
      r.clientesIgnorados++;
      continue;
    }
    const novo: DadosDataCliente = {
      cliente_nome: atual.cliente_nome,
      cnpj: atual.cnpj,
      tipo_data: atual.tipo_data,
      data_evento: atual.data_evento,
      inicio_parceria: atual.inicio_parceria,
      recorrente: atual.recorrente,
      observacoes: atual.observacoes,
      situacao_cliente: atual.situacao_cliente,
      inicio_parceria_precisao: atual.inicio_parceria_precisao,
      codigo: atual.codigo,
      tributacao: atual.tributacao,
      responsavel_fiscal: atual.responsavel_fiscal,
      responsavel_contabil: atual.responsavel_contabil,
      responsavel_dp: atual.responsavel_dp,
      dados_extras: atual.dados_extras ?? {},
      whatsapp: atual.whatsapp,
      nao_enviar: atual.nao_enviar,
      nao_enviar_motivo: atual.nao_enviar_motivo,
    };
    const definir = (campo: keyof DadosDataCliente, valor: string | null) => {
      if (campo === "recorrente" || campo === "nao_enviar") novo[campo] = valor === "true";
      else if (campo === "situacao_cliente") novo.situacao_cliente = valor === "INATIVO" ? "INATIVO" : "ATIVO";
      else if (campo === "dados_extras") novo.dados_extras = reg.dados.dados_extras;
      else if (campo === "inicio_parceria") {
        novo.inicio_parceria = reg.dados.inicio_parceria;
        novo.inicio_parceria_precisao = reg.dados.inicio_parceria_precisao;
      } else (novo as unknown as Record<string, string | null>)[campo] = valor;
    };
    for (const item of reg.completar) {
      const atualValor = (atual as unknown as Record<string, unknown>)[item.campo];
      if (atualValor == null || atualValor === "" || item.campo === "dados_extras") definir(item.campo, item.planilha);
    }
    if (substituir.has(reg.id)) for (const item of reg.conflitos) definir(item.campo, item.planilha);
    const v = dataClienteSchema.safeParse(novo);
    if (!v.success) {
      r.clientesCorrigir++;
      continue;
    }
    const alterados = await atualizarDataClienteExistente(c, atual, v.data, ctx.ator, ctx.usuarioId, origem);
    if (alterados > 0) {
      r.clientesAtualizados++;
      r.camposClientes += alterados;
    } else r.clientesIgnorados++;
  }
  return r;
}

export function descreverResultadoClientes(r: ResultadoClientes): string {
  return `${r.clientesCriados} datas de clientes cadastradas, ${r.clientesAtualizados} atualizadas, ${r.clientesIgnorados} ignoradas (já cadastradas ou duplicadas) e ${r.clientesCorrigir} que precisam de correção`;
}

/** Confirma a importação feita pelo botão Importar Excel da aba Datas do Cliente. */
export async function confirmarImportacaoClientes(loteId: number, substituir: string[], ator: Ator, usuarioId: number): Promise<ResultadoClientes> {
  return transacao(async (c) => {
    const lote = (
      await c.query<{ status: string; previa: Omit<PreviaImportacaoClientes, "loteId">; criado_em: Date }>(
        "SELECT status, previa, criado_em FROM lotes_importacao WHERE id = $1 FOR UPDATE",
        [loteId],
      )
    ).rows[0];
    if (!lote) throw new ErroHttp(404, "Importação não encontrada.");
    if (lote.status !== "PREVIA") throw new ErroHttp(409, "Esta importação já foi concluída ou cancelada.");
    if (lote.previa?.tipo !== "CLIENTES") throw new ErroHttp(409, "Esta prévia não é de clientes.");
    if (Date.now() - new Date(lote.criado_em).getTime() > 24 * 60 * 60 * 1000) throw new ErroHttp(409, "A prévia expirou. Envie a planilha novamente.");
    const previa = lote.previa;
    const r = await gravarClientes(c, previa.clientes.lidos, new Set(substituir), { loteId, arquivo: previa.arquivo, ator, usuarioId });
    await registrar(c, ator, [
      {
        operacao: "IMPORTACAO",
        entidade: "IMPORTACAO",
        entidadeId: loteId,
        registroNome: previa.arquivo,
        loteId,
        descricao: `${ator.nome} importou clientes de "${previa.arquivo}": ${descreverResultadoClientes(r)}.`,
      },
    ]);
    // A prévia com dados dos clientes é descartada depois de gravada.
    await c.query(
      `UPDATE lotes_importacao SET status = 'CONFIRMADA', resumo = $2, confirmado_por = $3, confirmado_em = now(),
         previa = jsonb_build_object('tipo', previa->'tipo', 'arquivo', previa->'arquivo', 'resumo', previa->'resumo') WHERE id = $1`,
      [loteId, JSON.stringify(r), usuarioId],
    );
    return r;
  });
}
