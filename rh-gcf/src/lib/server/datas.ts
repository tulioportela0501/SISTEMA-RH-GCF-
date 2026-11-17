import "server-only";
import { z } from "zod";
import { query, queryOne, transacao, type Executor } from "./db";
import { ErroHttp } from "./http";
import { registrar, type Ator, type NovoRegistro } from "./historico";
import { formatarData, formatarDiaMes, isDataISO } from "@/lib/domain/datas";
import { cnpjValido, formatarCnpj, limparCnpj } from "@/lib/domain/cnpj";
import { formatarWhatsapp, normalizarWhatsapp } from "@/lib/domain/whatsapp";
import { formatarInicioGcf } from "@/lib/domain/clientes";
import type { DataCliente, DataComemorativa } from "@/lib/domain/tipos";

const textoOpcional = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))
    .refine((v) => v == null || v.length <= max, { message: `Máximo de ${max} caracteres.` });

const dataObrigatoria = (rotulo: string) =>
  z.string({ error: `Informe ${rotulo}.` }).refine((v) => isDataISO(v), { message: `${rotulo[0].toUpperCase()}${rotulo.slice(1)} inválida.` });

const dataOpcional = (rotulo: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null || v === "" ? null : v))
    .refine((v) => v == null || isDataISO(v), { message: `${rotulo} inválida.` });

// ---------------------------------------------------------------------
// Datas comemorativas do escritório
// ---------------------------------------------------------------------

export const dataComemorativaSchema = z.object({
  titulo: z.string().trim().min(1, "Informe o nome da data.").max(200),
  data: dataObrigatoria("a data"),
  recorrente: z.boolean().default(true),
  categoria: z.string().trim().min(1).max(60).default("Data comemorativa"),
  descricao: textoOpcional(1000),
});

const SELECT_DC = "SELECT id, titulo, data, recorrente, categoria, descricao, ativo, origem, linha_planilha, versao FROM datas_comemorativas";

export async function listarDatasComemorativas(): Promise<DataComemorativa[]> {
  return query<DataComemorativa>(`${SELECT_DC} ORDER BY extract(month from data), extract(day from data), titulo`);
}

function descreverDataComemorativa(d: { data: string; recorrente: boolean }): string {
  return d.recorrente ? `${formatarDiaMes(d.data)} (todo ano)` : formatarData(d.data);
}

export async function salvarDataComemorativa(
  id: number | null,
  entrada: z.infer<typeof dataComemorativaSchema>,
  versao: number | null,
  ator: Ator,
  usuarioId: number,
): Promise<DataComemorativa> {
  return transacao(async (c) => {
    if (id == null) {
      const r = await c.query<{ id: number }>(
        `INSERT INTO datas_comemorativas (titulo, data, recorrente, categoria, descricao, criado_por, atualizado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
        [entrada.titulo, entrada.data, entrada.recorrente, entrada.categoria, entrada.descricao, usuarioId],
      );
      await registrar(c, ator, [
        {
          operacao: "CRIACAO",
          entidade: "DATA_COMEMORATIVA",
          entidadeId: r.rows[0].id,
          registroNome: entrada.titulo,
          descricao: `${ator.nome} cadastrou a data comemorativa ${entrada.titulo} em ${descreverDataComemorativa(entrada)}.`,
        },
      ]);
      return (await c.query<DataComemorativa>(`${SELECT_DC} WHERE id = $1`, [r.rows[0].id])).rows[0];
    }
    const atual = (await c.query<DataComemorativa>(`${SELECT_DC} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Data comemorativa não encontrada.");
    if (versao != null && atual.versao !== versao) throw new ErroHttp(409, "Este registro foi alterado por outra pessoa. Recarregue a página.");
    const campos: { chave: keyof typeof entrada; label: string; fmt?: (v: unknown) => string }[] = [
      { chave: "titulo", label: "Nome" },
      { chave: "data", label: "Data", fmt: (v) => formatarData(String(v)) },
      { chave: "recorrente", label: "Repetir todo ano", fmt: (v) => (v ? "Sim" : "Não") },
      { chave: "categoria", label: "Categoria" },
      { chave: "descricao", label: "Descrição" },
    ];
    const regs: NovoRegistro[] = [];
    for (const campo of campos) {
      const a = (atual as unknown as Record<string, unknown>)[campo.chave];
      const n = entrada[campo.chave];
      if ((a ?? "") === (n ?? "")) continue;
      const fmt = (v: unknown) => (v == null || v === "" ? "(vazio)" : campo.fmt ? campo.fmt(v) : String(v));
      regs.push({
        operacao: "ALTERACAO",
        entidade: "DATA_COMEMORATIVA",
        entidadeId: id,
        registroNome: entrada.titulo,
        campo: campo.chave,
        campoLabel: campo.label,
        valorAnterior: a == null ? null : String(a),
        valorNovo: n == null ? null : String(n),
        descricao: `${ator.nome} alterou o campo ${campo.label} de ${fmt(a)} para ${fmt(n)}.`,
      });
    }
    if (regs.length) {
      await c.query(
        `UPDATE datas_comemorativas SET titulo=$2, data=$3, recorrente=$4, categoria=$5, descricao=$6, versao = versao + 1,
           atualizado_em = now(), atualizado_por = $7 WHERE id = $1`,
        [id, entrada.titulo, entrada.data, entrada.recorrente, entrada.categoria, entrada.descricao, usuarioId],
      );
      await registrar(c, ator, regs);
    }
    return (await c.query<DataComemorativa>(`${SELECT_DC} WHERE id = $1`, [id])).rows[0];
  });
}

export async function alterarAtivoDataComemorativa(id: number, ativo: boolean, ator: Ator, usuarioId: number): Promise<void> {
  await transacao(async (c) => {
    const atual = (await c.query<DataComemorativa>(`${SELECT_DC} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Data comemorativa não encontrada.");
    if (atual.ativo === ativo) return;
    await c.query("UPDATE datas_comemorativas SET ativo=$2, versao=versao+1, atualizado_em=now(), atualizado_por=$3 WHERE id=$1", [id, ativo, usuarioId]);
    await registrar(c, ator, [
      {
        operacao: ativo ? "ATIVACAO" : "DESATIVACAO",
        entidade: "DATA_COMEMORATIVA",
        entidadeId: id,
        registroNome: atual.titulo,
        descricao: `${ator.nome} ${ativo ? "reativou" : "desativou"} a data comemorativa ${atual.titulo}.`,
      },
    ]);
  });
}

// ---------------------------------------------------------------------
// Datas do cliente
// ---------------------------------------------------------------------

export const dataClienteSchema = z
  .object({
    cliente_nome: z.string().trim().min(1, "Informe o nome ou a razão social do cliente.").max(250),
    cnpj: textoOpcional(30).refine((v) => v == null || cnpjValido(v), { message: "CNPJ inválido. Confira os dígitos." }),
    tipo_data: z.string().trim().min(1, "Informe o tipo de data ou comemoração.").max(120),
    data_evento: dataOpcional("Data do evento"),
    inicio_parceria: dataOpcional("Data de início da parceria"),
    recorrente: z.boolean().default(true),
    observacoes: textoOpcional(2000),
    situacao_cliente: z.enum(["ATIVO", "INATIVO"]).default("ATIVO"),
    inicio_parceria_precisao: z.enum(["DIA", "MES"]).default("DIA"),
    // Dados da planilha geral de clientes
    codigo: textoOpcional(40),
    tributacao: textoOpcional(80),
    responsavel_fiscal: textoOpcional(120),
    responsavel_contabil: textoOpcional(120),
    responsavel_dp: textoOpcional(120),
    dados_extras: z.record(z.string().max(80), z.string().max(500)).default({}),
    // Felicitações: sem WhatsApp válido ou com "não deseja receber", nada é preparado
    whatsapp: textoOpcional(40).refine((v) => v == null || normalizarWhatsapp(v) != null, {
      message: "WhatsApp inválido. Informe DDD + celular, ex.: (98) 99999-0000.",
    }),
    nao_enviar: z.boolean().default(false),
    nao_enviar_motivo: textoOpcional(300),
  })
  .refine((d) => d.data_evento || d.inicio_parceria || d.tipo_data.toLowerCase() === "aniversário de parceria", {
    message: "Informe a data do evento ou o Início GCF.",
    path: ["data_evento"],
  })
  .transform((d) => ({
    ...d,
    cnpj: d.cnpj ? formatarCnpj(limparCnpj(d.cnpj)) : null,
    whatsapp: normalizarWhatsapp(d.whatsapp),
    // Só mês e ano: guarda o dia 01 (não é exibido nem usado como dia real)
    inicio_parceria: d.inicio_parceria && d.inicio_parceria_precisao === "MES" ? `${d.inicio_parceria.slice(0, 7)}-01` : d.inicio_parceria,
  }));

const SELECT_CL = `SELECT id, cliente_nome, cnpj, tipo_data, data_evento, inicio_parceria, recorrente, observacoes, situacao_cliente,
  ativo, versao, codigo, tributacao, responsavel_fiscal, responsavel_contabil, responsavel_dp, dados_extras, inicio_parceria_precisao,
  whatsapp, nao_enviar, nao_enviar_motivo FROM datas_cliente`;

export async function listarDatasCliente(ex?: Executor): Promise<DataCliente[]> {
  return query<DataCliente>(`${SELECT_CL} ORDER BY lower(cliente_nome), id`, [], ex);
}

export { SELECT_CL as SELECT_DATAS_CLIENTE };

const CAMPOS_CLIENTE: { chave: keyof z.infer<typeof dataClienteSchema>; label: string; tipo?: "data" | "bool" | "situacao" | "whatsapp" | "inicio" | "precisao" | "json" }[] = [
  { chave: "cliente_nome", label: "Cliente" },
  { chave: "cnpj", label: "CNPJ" },
  { chave: "tipo_data", label: "Tipo de data" },
  { chave: "data_evento", label: "Data do evento", tipo: "data" },
  { chave: "inicio_parceria", label: "Início GCF", tipo: "inicio" },
  { chave: "recorrente", label: "Repetir todo ano", tipo: "bool" },
  { chave: "observacoes", label: "Observações" },
  { chave: "situacao_cliente", label: "Situação do cliente", tipo: "situacao" },
  { chave: "inicio_parceria_precisao", label: "Precisão do Início GCF", tipo: "precisao" },
  { chave: "codigo", label: "ID" },
  { chave: "tributacao", label: "Tributação" },
  { chave: "responsavel_fiscal", label: "Responsável Fiscal" },
  { chave: "responsavel_contabil", label: "Responsável Contábil" },
  { chave: "responsavel_dp", label: "Responsável DP" },
  { chave: "dados_extras", label: "Outras informações", tipo: "json" },
  { chave: "whatsapp", label: "WhatsApp", tipo: "whatsapp" },
  { chave: "nao_enviar", label: "Não deseja receber mensagens", tipo: "bool" },
  { chave: "nao_enviar_motivo", label: "Motivo de não receber mensagens" },
];

export type EntradaDataCliente = z.infer<typeof dataClienteSchema>;

/** Linha da planilha que originou o registro (importação). */
export interface OrigemImportacao {
  loteId: number;
  arquivo: string;
  aba: string;
  linha: number;
}

function valoresDataCliente(e: EntradaDataCliente): unknown[] {
  return [
    e.cliente_nome, e.cnpj, e.tipo_data, e.data_evento, e.inicio_parceria, e.recorrente, e.observacoes, e.situacao_cliente,
    e.inicio_parceria_precisao, e.codigo, e.tributacao, e.responsavel_fiscal, e.responsavel_contabil, e.responsavel_dp,
    JSON.stringify(e.dados_extras ?? {}), e.whatsapp, e.nao_enviar, e.nao_enviar_motivo,
  ];
}

function textoCampo(tipo: string | undefined, v: unknown): string {
  if (v == null || v === "") return "(vazio)";
  if (tipo === "data") return formatarData(String(v));
  if (tipo === "bool") return v ? "Sim" : "Não";
  if (tipo === "situacao") return v === "ATIVO" ? "Ativo" : "Inativo";
  if (tipo === "whatsapp") return formatarWhatsapp(String(v));
  if (tipo === "precisao") return v === "MES" ? "mês e ano" : "dia, mês e ano";
  if (tipo === "json") {
    const o = (typeof v === "string" ? JSON.parse(v) : v) as Record<string, string>;
    return Object.entries(o).map(([k, x]) => `${k}: ${x}`).join("; ") || "(vazio)";
  }
  return String(v);
}

/** Cadastra uma data de cliente e registra no histórico. Deve ser chamada dentro de uma transação. */
export async function inserirDataCliente(
  c: Executor,
  e: EntradaDataCliente,
  ator: Ator,
  usuarioId: number,
  opcoes: { ativo?: boolean; importacao?: OrigemImportacao } = {},
): Promise<number> {
  const r = await c.query<{ id: number }>(
    `INSERT INTO datas_cliente (cliente_nome, cnpj, tipo_data, data_evento, inicio_parceria, recorrente, observacoes, situacao_cliente,
       inicio_parceria_precisao, codigo, tributacao, responsavel_fiscal, responsavel_contabil, responsavel_dp, dados_extras, whatsapp,
       nao_enviar, nao_enviar_motivo, ativo, criado_por, atualizado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20) RETURNING id`,
    [...valoresDataCliente(e), opcoes.ativo ?? true, usuarioId],
  );
  const id = r.rows[0].id;
  const imp = opcoes.importacao;
  await registrar(c, ator, [
    {
      operacao: imp ? "IMPORTACAO" : "CRIACAO",
      entidade: "DATA_CLIENTE",
      entidadeId: id,
      registroNome: e.cliente_nome,
      loteId: imp?.loteId ?? null,
      descricao: imp
        ? `Data "${e.tipo_data}" do cliente ${e.cliente_nome} importada da planilha "${imp.arquivo}" (aba ${imp.aba}, linha ${imp.linha}).`
        : `${ator.nome} cadastrou a data "${e.tipo_data}" do cliente ${e.cliente_nome}.`,
    },
  ]);
  return id;
}

/**
 * Grava as diferenças entre o cadastro atual e a entrada, campo a campo, com histórico.
 * Deve ser chamada dentro de uma transação, com o registro travado (FOR UPDATE). Retorna o número de campos alterados.
 */
export async function atualizarDataClienteExistente(
  c: Executor,
  atual: DataCliente,
  e: EntradaDataCliente,
  ator: Ator,
  usuarioId: number,
  importacao?: OrigemImportacao,
): Promise<number> {
  const regs: NovoRegistro[] = [];
  for (const campo of CAMPOS_CLIENTE) {
    const a = (atual as unknown as Record<string, unknown>)[campo.chave];
    const n = e[campo.chave];
    const comoTexto = (v: unknown) => (v != null && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));
    if (comoTexto(a) === comoTexto(n)) continue;
    // Início GCF só com mês e ano aparece como "03/2025" (o dia guardado não é real)
    const legivel = (v: unknown, precisao: "DIA" | "MES") =>
      campo.tipo === "inicio" ? (v ? formatarInicioGcf(String(v), precisao) : "(vazio)") : textoCampo(campo.tipo, v);
    regs.push({
      operacao: "ALTERACAO",
      entidade: "DATA_CLIENTE",
      entidadeId: atual.id,
      registroNome: e.cliente_nome,
      campo: campo.chave,
      campoLabel: campo.label,
      valorAnterior: a == null ? null : comoTexto(a),
      valorNovo: n == null ? null : comoTexto(n),
      loteId: importacao?.loteId ?? null,
      descricao: importacao
        ? `Importação de "${importacao.arquivo}" (aba ${importacao.aba}, linha ${importacao.linha}) ${a == null || a === "" ? "preencheu" : "alterou"} o campo ${campo.label} de ${legivel(a, atual.inicio_parceria_precisao)} para ${legivel(n, e.inicio_parceria_precisao)}.`
        : `${ator.nome} alterou o campo ${campo.label} de ${legivel(a, atual.inicio_parceria_precisao)} para ${legivel(n, e.inicio_parceria_precisao)}.`,
    });
  }
  if (regs.length) {
    await c.query(
      `UPDATE datas_cliente SET cliente_nome=$2, cnpj=$3, tipo_data=$4, data_evento=$5, inicio_parceria=$6, recorrente=$7, observacoes=$8,
         situacao_cliente=$9, inicio_parceria_precisao=$10, codigo=$11, tributacao=$12, responsavel_fiscal=$13,
         responsavel_contabil=$14, responsavel_dp=$15, dados_extras=$16, whatsapp=$17, nao_enviar=$18, nao_enviar_motivo=$19,
         versao=versao+1, atualizado_em=now(), atualizado_por=$20 WHERE id=$1`,
      [atual.id, ...valoresDataCliente(e), usuarioId],
    );
    await registrar(c, ator, regs);
  }
  return regs.length;
}

export async function salvarDataCliente(
  id: number | null,
  e: EntradaDataCliente,
  versao: number | null,
  ator: Ator,
  usuarioId: number,
): Promise<DataCliente> {
  return transacao(async (c) => {
    if (id == null) {
      const novoId = await inserirDataCliente(c, e, ator, usuarioId);
      return (await c.query<DataCliente>(`${SELECT_CL} WHERE id = $1`, [novoId])).rows[0];
    }
    const atual = (await c.query<DataCliente>(`${SELECT_CL} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Data do cliente não encontrada.");
    if (versao != null && atual.versao !== versao) throw new ErroHttp(409, "Este registro foi alterado por outra pessoa. Recarregue a página.");
    await atualizarDataClienteExistente(c, atual, e, ator, usuarioId);
    return (await c.query<DataCliente>(`${SELECT_CL} WHERE id = $1`, [id])).rows[0];
  });
}

export async function alterarAtivoDataCliente(id: number, ativo: boolean, ator: Ator, usuarioId: number): Promise<void> {
  await transacao(async (c) => {
    const atual = (await c.query<DataCliente>(`${SELECT_CL} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Data do cliente não encontrada.");
    if (atual.ativo === ativo) return;
    await c.query("UPDATE datas_cliente SET ativo=$2, versao=versao+1, atualizado_em=now(), atualizado_por=$3 WHERE id=$1", [id, ativo, usuarioId]);
    await registrar(c, ator, [
      {
        operacao: ativo ? "ATIVACAO" : "DESATIVACAO",
        entidade: "DATA_CLIENTE",
        entidadeId: id,
        registroNome: atual.cliente_nome,
        descricao: `${ator.nome} ${ativo ? "reativou" : "desativou"} a data "${atual.tipo_data}" do cliente ${atual.cliente_nome}.`,
      },
    ]);
  });
}

/** Exclui uma data de cliente. O histórico guarda o que foi excluído (o histórico não é apagado). */
export async function excluirDataCliente(id: number, versao: number | null, ator: Ator): Promise<void> {
  await transacao(async (c) => {
    const atual = (await c.query<DataCliente>(`${SELECT_CL} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Data do cliente não encontrada.");
    if (versao != null && atual.versao !== versao) throw new ErroHttp(409, "Este registro foi alterado por outra pessoa. Recarregue a página.");
    await c.query("DELETE FROM datas_cliente WHERE id = $1", [id]);
    const datas = [atual.data_evento && `data ${formatarData(atual.data_evento)}`, atual.inicio_parceria && `parceria desde ${formatarData(atual.inicio_parceria)}`].filter(Boolean).join(", ");
    await registrar(c, ator, [
      {
        operacao: "EXCLUSAO",
        entidade: "DATA_CLIENTE",
        entidadeId: id,
        registroNome: atual.cliente_nome,
        descricao: `${ator.nome} excluiu a data "${atual.tipo_data}" do cliente ${atual.cliente_nome}${atual.cnpj ? ` (CNPJ ${atual.cnpj})` : ""}${datas ? ` — ${datas}` : ""}.`,
      },
    ]);
  });
}

export async function obterDataCliente(id: number): Promise<DataCliente | null> {
  return queryOne<DataCliente>(`${SELECT_CL} WHERE id = $1`, [id]);
}
