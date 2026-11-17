import "server-only";
import { z } from "zod";
import type { PoolClient } from "pg";
import { query, queryOne, transacao } from "./db";
import { ErroHttp } from "./http";
import { registrar, type Ator } from "./historico";
import { SELECT_DATAS_CLIENTE, listarDatasCliente } from "./datas";
import { TIPO_PARCERIA, chaveTipo, clienteAtivo, formatarInicioGcf } from "@/lib/domain/clientes";
import { deslocarMes, fimDoMes, inicioDoMes, partes, somarDias, type DataISO } from "@/lib/domain/datas";
import {
  STATUS_FELICITACAO,
  VARIAVEIS_FELICITACAO,
  aniversarioNoAno,
  aniversariosNoPeriodo,
  ehClienteParceria,
  pendente,
  variaveisPendentes,
  type StatusFelicitacao,
  type AniversarioParceria,
  type ModeloFelicitacao,
  type RegistroFelicitacao,
} from "@/lib/domain/felicitacoes";
import { normalizarWhatsapp } from "@/lib/domain/whatsapp";
import { obterInfoImagem, shaImagemAtual, type ImagemFelicitacaoInfo } from "./imagem-felicitacao";
import type { DataCliente, UsuarioSessao } from "@/lib/domain/tipos";

/**
 * Central de Felicitações. Nenhuma mensagem é enviada pelo servidor:
 * "preparar" registra que o WhatsApp foi aberto; "enviado" só é registrado quando o funcionário confirma.
 * A tabela felicitacoes já tem o campo "canal" para uma futura integração (n8n ou API oficial do WhatsApp).
 */

// ---------------------------------------------------------------------
// Configuração (dia padrão das felicitações)
// ---------------------------------------------------------------------

export interface ConfigFelicitacoes {
  dia_padrao: number;
  versao: number;
}

export async function obterConfigFelicitacoes(): Promise<ConfigFelicitacoes> {
  const c = await queryOne<ConfigFelicitacoes>("SELECT dia_padrao, versao FROM felicitacoes_config WHERE id = 1");
  return c ?? { dia_padrao: 1, versao: 0 };
}

export async function salvarConfigFelicitacoes(dia: number, versao: number, ator: Ator, usuarioId: number): Promise<ConfigFelicitacoes> {
  return transacao(async (c) => {
    const atual = (await c.query<ConfigFelicitacoes>("SELECT dia_padrao, versao FROM felicitacoes_config WHERE id = 1 FOR UPDATE")).rows[0];
    if (!atual) throw new ErroHttp(500, "Configuração das felicitações não encontrada. Rode npm run db:migrate.");
    if (atual.versao !== versao) throw new ErroHttp(409, "A configuração foi alterada por outra pessoa. Recarregue a página.");
    if (atual.dia_padrao === dia) return atual;
    const r = await c.query<ConfigFelicitacoes>(
      "UPDATE felicitacoes_config SET dia_padrao = $1, versao = versao + 1, atualizado_em = now(), atualizado_por = $2 WHERE id = 1 RETURNING dia_padrao, versao",
      [dia, usuarioId],
    );
    await registrar(c, ator, [
      {
        operacao: "ALTERACAO",
        entidade: "FELICITACAO",
        registroNome: "Configuração das felicitações",
        campo: "dia_padrao",
        campoLabel: "Dia padrão das felicitações",
        valorAnterior: String(atual.dia_padrao),
        valorNovo: String(dia),
        descricao: `${ator.nome} alterou o dia padrão das felicitações (Início GCF só com mês e ano) de ${atual.dia_padrao} para ${dia}.`,
      },
    ]);
    return r.rows[0];
  });
}

// ---------------------------------------------------------------------
// Modelos de mensagem
// ---------------------------------------------------------------------

/** Variáveis entre chaves que o sistema não sabe preencher (ex.: {cliente}). */
function desconhecidas(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{([^{}\s]{1,30})\}/g)].filter((m) => !(m[1].toLowerCase() in VARIAVEIS_FELICITACAO)).map((m) => m[0]))];
}

export const modeloSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do modelo.").max(120),
  texto: z
    .string()
    .trim()
    .min(1, "Escreva o texto da mensagem.")
    .max(3000, "Máximo de 3.000 caracteres.")
    .superRefine((t, ctx) => {
      const v = desconhecidas(t);
      if (v.length) ctx.addIssue({ code: "custom", message: `Variável desconhecida no texto: ${v.join(", ")}. Use {empresa}, {anos}, {data} ou {inicio}.` });
    }),
  padrao: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

const SELECT_MODELO = "SELECT id, nome, texto, padrao, ativo, versao FROM felicitacoes_modelos";

export async function listarModelos(): Promise<ModeloFelicitacao[]> {
  return query<ModeloFelicitacao>(`${SELECT_MODELO} ORDER BY padrao DESC, lower(nome)`);
}

export async function salvarModelo(id: number | null, e: z.infer<typeof modeloSchema>, versao: number | null, ator: Ator, usuarioId: number): Promise<ModeloFelicitacao> {
  return transacao(async (c) => {
    if (e.padrao && !e.ativo) throw new ErroHttp(422, "O modelo padrão precisa estar ativo.");
    if (e.padrao) await c.query("UPDATE felicitacoes_modelos SET padrao = FALSE, versao = versao + 1, atualizado_em = now() WHERE padrao AND id IS DISTINCT FROM $1", [id]);
    if (id == null) {
      const r = await c.query<{ id: number }>(
        "INSERT INTO felicitacoes_modelos (nome, texto, padrao, ativo, criado_por, atualizado_por) VALUES ($1,$2,$3,$4,$5,$5) RETURNING id",
        [e.nome, e.texto, e.padrao, e.ativo, usuarioId],
      );
      await registrar(c, ator, [
        { operacao: "CRIACAO", entidade: "FELICITACAO", entidadeId: r.rows[0].id, registroNome: `Modelo: ${e.nome}`, descricao: `${ator.nome} criou o modelo de felicitação "${e.nome}".` },
      ]);
      return (await c.query<ModeloFelicitacao>(`${SELECT_MODELO} WHERE id = $1`, [r.rows[0].id])).rows[0];
    }
    const atual = (await c.query<ModeloFelicitacao>(`${SELECT_MODELO} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Modelo não encontrado.");
    if (versao != null && atual.versao !== versao) throw new ErroHttp(409, "Este modelo foi alterado por outra pessoa. Recarregue a página.");
    if (atual.padrao && !e.padrao) {
      const outro = await c.query("SELECT 1 FROM felicitacoes_modelos WHERE padrao AND id <> $1", [id]);
      if (outro.rowCount === 0) throw new ErroHttp(422, "Escolha outro modelo como padrão antes de desmarcar este.");
    }
    await c.query("UPDATE felicitacoes_modelos SET nome=$2, texto=$3, padrao=$4, ativo=$5, versao=versao+1, atualizado_em=now(), atualizado_por=$6 WHERE id=$1", [
      id, e.nome, e.texto, e.padrao, e.ativo, usuarioId,
    ]);
    const mudou = [atual.nome !== e.nome && "nome", atual.texto !== e.texto && "texto", atual.padrao !== e.padrao && "padrão", atual.ativo !== e.ativo && "situação"].filter(Boolean);
    if (mudou.length)
      await registrar(c, ator, [
        { operacao: "ALTERACAO", entidade: "FELICITACAO", entidadeId: id, registroNome: `Modelo: ${e.nome}`, descricao: `${ator.nome} alterou o modelo de felicitação "${e.nome}" (${mudou.join(", ")}).` },
      ]);
    return (await c.query<ModeloFelicitacao>(`${SELECT_MODELO} WHERE id = $1`, [id])).rows[0];
  });
}

// ---------------------------------------------------------------------
// Felicitações
// ---------------------------------------------------------------------

const SELECT_FEL = `SELECT id, data_cliente_id, cliente_nome, cnpj, ano, anos_parceria, inicio_gcf, data_felicitacao, status, canal, whatsapp,
  mensagem, modelo_id, motivo, preparado_em, preparado_por_nome, whatsapp_aberto_em, whatsapp_aberto_por_nome, com_imagem,
  enviado_em, enviado_por_nome, versao FROM felicitacoes`;

export async function listarRegistros(filtro: { anos?: number[]; status?: string[] } = {}): Promise<RegistroFelicitacao[]> {
  const cond: string[] = [];
  const params: unknown[] = [];
  if (filtro.anos?.length) {
    params.push(filtro.anos);
    cond.push(`ano = ANY($${params.length}::int[])`);
  }
  if (filtro.status?.length) {
    params.push(filtro.status);
    cond.push(`status = ANY($${params.length}::text[])`);
  }
  return query<RegistroFelicitacao>(`${SELECT_FEL} ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""} ORDER BY coalesce(enviado_em, whatsapp_aberto_em, preparado_em, criado_em) DESC, id DESC`, params);
}

export interface DadosCentral {
  ano: number;
  mes: number;
  hoje: DataISO;
  diaPadrao: number;
  configVersao: number;
  doMes: AniversarioParceria[];
  proximos: AniversarioParceria[];
  clientesParceria: number;
  semWhatsappTotal: number;
  semInicio: number;
  modelos: ModeloFelicitacao[];
  imagem: ImagemFelicitacaoInfo | null;
}

/** Dados da Central para um mês (e os próximos 30 dias a partir de hoje). */
export async function dadosCentral(ano: number, mes: number, hoje: DataISO): Promise<DadosCentral> {
  const [datas, config, modelos, imagem] = await Promise.all([listarDatasCliente(), obterConfigFelicitacoes(), listarModelos(), obterInfoImagem()]);
  const ateProximos = somarDias(hoje, 30);
  const anos = [...new Set([ano, partes(hoje).ano, partes(ateProximos).ano])];
  const registros = await listarRegistros({ anos });
  const doMes = aniversariosNoPeriodo(datas, registros, inicioDoMes(ano, mes), fimDoMes(ano, mes), hoje, config.dia_padrao);
  const proximos = aniversariosNoPeriodo(datas, registros, hoje, ateProximos, hoje, config.dia_padrao);
  const parceria = datas.filter((d) => clienteAtivo(d) && chaveTipo(d.tipo_data) === chaveTipo(TIPO_PARCERIA));
  return {
    ano,
    mes,
    hoje,
    diaPadrao: config.dia_padrao,
    configVersao: config.versao,
    doMes,
    proximos,
    clientesParceria: parceria.length,
    semWhatsappTotal: parceria.filter((d) => !d.nao_enviar && !normalizarWhatsapp(d.whatsapp)).length,
    semInicio: parceria.filter((d) => !d.inicio_parceria).length,
    modelos,
    imagem,
  };
}

/** Resumo para o dashboard (mês atual). */
export async function alertasFelicitacoes(hoje: DataISO) {
  const { ano, mes } = partes(hoje);
  const [datas, config] = await Promise.all([listarDatasCliente(), obterConfigFelicitacoes()]);
  const registros = await listarRegistros({ anos: [ano] });
  const lista = aniversariosNoPeriodo(datas, registros, inicioDoMes(ano, mes), fimDoMes(ano, mes), hoje, config.dia_padrao);
  const pendentes = lista.filter(pendente);
  return { ano, mes, aniversariantes: lista.length, pendentes: pendentes.length, semWhatsapp: pendentes.filter((a) => !a.whatsapp).length };
}

/** Mês anterior e seguinte (para navegar na Central). */
export function mesesVizinhos(ano: number, mes: number) {
  return { anterior: deslocarMes(ano, mes, -1), proximo: deslocarMes(ano, mes, 1) };
}

// ---------------------------------------------------------------------
// Ações: preparar, abrir WhatsApp, confirmar envio, não enviar, reabrir
// Nada é enviado pelo servidor: o funcionário envia pelo WhatsApp e confirma depois.
// ---------------------------------------------------------------------

const idCliente = z.number().int().positive();
const anoAcao = z.number().int().min(2000).max(2200);
const mensagemAcao = z.string().trim().min(1, "Escreva a mensagem.").max(4000);
const etapaComMensagem = {
  dataClienteId: idCliente,
  ano: anoAcao,
  mensagem: mensagemAcao,
  modeloId: z.number().int().positive().nullable().default(null),
  /** Número corrigido na hora (é validado e salvo no cadastro do cliente) */
  whatsapp: z.string().trim().max(40).nullable().optional(),
  /** A imagem padrão foi copiada ou baixada nesta preparação */
  comImagem: z.boolean().optional(),
};

export const acaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("preparar"), ...etapaComMensagem }),
  z.object({ acao: z.literal("abrir"), ...etapaComMensagem }),
  z.object({ acao: z.literal("enviado"), dataClienteId: idCliente, ano: anoAcao, mensagem: z.string().trim().min(1, "Informe a mensagem utilizada.").max(4000), comImagem: z.boolean().optional() }),
  z.object({ acao: z.literal("nao_enviar"), dataClienteId: idCliente, ano: anoAcao, motivo: z.string().trim().max(300).nullable().default(null) }),
  z.object({ acao: z.literal("reabrir"), dataClienteId: idCliente, ano: anoAcao }),
]);
export type AcaoFelicitacao = z.infer<typeof acaoSchema>;

function quando(d: string | Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(d)).replace(",", " às");
}

export async function executarAcao(a: AcaoFelicitacao, u: UsuarioSessao, ator: Ator): Promise<RegistroFelicitacao | null> {
  return transacao(async (c: PoolClient) => {
    const d = (await c.query<DataCliente>(`${SELECT_DATAS_CLIENTE} WHERE id = $1 FOR UPDATE`, [a.dataClienteId])).rows[0];
    if (!d) throw new ErroHttp(404, "Cliente não encontrado.");
    if (!ehClienteParceria(d)) throw new ErroHttp(422, "Este cadastro não tem aniversário de parceria (Início GCF).");
    const config = (await c.query<{ dia_padrao: number }>("SELECT dia_padrao FROM felicitacoes_config WHERE id = 1")).rows[0] ?? { dia_padrao: 1 };
    const aniv = aniversarioNoAno(d, a.ano, config.dia_padrao);
    if (!aniv) throw new ErroHttp(422, `Em ${a.ano} o cliente ainda não completa 1 ano de parceria.`);
    const atual = (await c.query<RegistroFelicitacao>(`${SELECT_FEL} WHERE data_cliente_id = $1 AND ano = $2 FOR UPDATE`, [d.id, a.ano])).rows[0] ?? null;
    const inicioGcf = formatarInicioGcf(d.inicio_parceria, d.inicio_parceria_precisao);
    const rotulo = `${d.cliente_nome} — ${aniv.anos} ${aniv.anos === 1 ? "ano" : "anos"} de parceria (${a.ano})`;
    const base = { d, ano: a.ano, anos: aniv.anos, data: aniv.data, inicioGcf };
    const historico = (de: StatusFelicitacao, para: StatusFelicitacao, descricao: string) => ({
      operacao: "ALTERACAO" as const,
      entidade: "FELICITACAO" as const,
      entidadeId: d.id,
      registroNome: d.cliente_nome,
      campo: "status_felicitacao",
      campoLabel: "Felicitação",
      valorAnterior: STATUS_FELICITACAO[de],
      valorNovo: STATUS_FELICITACAO[para],
      descricao,
    });
    const statusAtual: StatusFelicitacao = atual?.status ?? "PENDENTE";

    // Enviada é definitivo: impede registro duplicado para o mesmo cliente e aniversário
    if (atual?.status === "ENVIADO") throw new ErroHttp(409, `Esta felicitação já foi registrada como enviada em ${quando(atual.enviado_em)} por ${atual.enviado_por_nome ?? "—"}.`);

    if (a.acao === "reabrir") {
      if (!atual) return null;
      await c.query("DELETE FROM felicitacoes WHERE id = $1", [atual.id]);
      await registrar(c, ator, [historico(statusAtual, "PENDENTE", `${ator.nome} voltou a felicitação de ${rotulo} para Pendente.`)]);
      return null;
    }

    if (a.acao === "nao_enviar") {
      const r = await gravar(c, atual, { ...base, etapa: "NAO_ENVIAR", motivo: a.motivo });
      await registrar(c, ator, [historico(statusAtual, "NAO_ENVIAR", `${ator.nome} marcou "Não enviar" na felicitação de ${rotulo}${a.motivo ? `: ${a.motivo}` : ""}.`)]);
      return r;
    }

    // Preparar, abrir e confirmar: cliente ativo, que aceita mensagens, e mensagem sem variáveis pendentes
    if (!clienteAtivo(d)) throw new ErroHttp(422, "Cliente inativo: felicitações não são enviadas para clientes inativos.");
    if (d.nao_enviar) throw new ErroHttp(422, "Este cliente não deseja receber mensagens.");
    if (atual?.status === "NAO_ENVIAR") throw new ErroHttp(409, 'Esta felicitação está marcada como "Não enviar". Volte para pendente antes de preparar ou registrar o envio.');
    const pendentes = variaveisPendentes(a.mensagem);
    if (pendentes.length) throw new ErroHttp(422, `A mensagem ainda tem campos sem preencher: ${pendentes.join(", ")}.`);
    const imagemSha = a.comImagem ? await shaImagemAtual() : null;
    const comImagem = a.comImagem ? !!imagemSha : undefined;
    let whatsapp = normalizarWhatsapp(d.whatsapp);

    if (a.acao === "preparar" || a.acao === "abrir") {
      if (a.whatsapp) {
        const informado = normalizarWhatsapp(a.whatsapp);
        if (!informado) throw new ErroHttp(422, "WhatsApp inválido. Informe DDD + celular, ex.: (98) 99999-0000.");
        if (informado !== d.whatsapp) {
          await c.query("UPDATE datas_cliente SET whatsapp = $2, versao = versao + 1, atualizado_em = now(), atualizado_por = $3 WHERE id = $1", [d.id, informado, u.id]);
          await registrar(c, ator, [
            { operacao: "ALTERACAO", entidade: "DATA_CLIENTE", entidadeId: d.id, registroNome: d.cliente_nome, campo: "whatsapp", campoLabel: "WhatsApp", valorAnterior: d.whatsapp, valorNovo: informado, descricao: `${ator.nome} alterou o WhatsApp de ${d.cliente_nome} ao preparar a felicitação.` },
          ]);
        }
        whatsapp = informado;
      }
      if (!whatsapp) throw new ErroHttp(422, d.whatsapp ? "WhatsApp do cliente inválido. Corrija o número antes de preparar a mensagem." : "Cliente sem WhatsApp cadastrado.");
      const detalhe = (comImagem ?? atual?.com_imagem) ? "mensagem e imagem" : "mensagem";
      const entradas = [];
      const jaPreparada = statusAtual === "PREPARADO" || statusAtual === "ABERTO";
      if (!jaPreparada || atual?.mensagem !== a.mensagem || (comImagem && !atual?.com_imagem)) {
        entradas.push(historico(statusAtual, statusAtual === "ABERTO" ? "ABERTO" : "PREPARADO", `${ator.nome} preparou a felicitação de ${rotulo} (${detalhe}).`));
      }
      if (a.acao === "abrir") {
        entradas.push(historico(jaPreparada ? statusAtual : "PREPARADO", "ABERTO", `${ator.nome} abriu o WhatsApp com a felicitação de ${rotulo}. O envio ainda não foi confirmado.`));
      }
      const r = await gravar(c, atual, { ...base, etapa: a.acao === "abrir" ? "ABERTO" : "PREPARADO", whatsapp, mensagem: a.mensagem, modeloId: a.modeloId, comImagem, imagemSha, u });
      if (entradas.length) await registrar(c, ator, entradas);
      return r;
    }

    // Envio confirmado manualmente pelo funcionário
    const r = await gravar(c, atual, { ...base, etapa: "ENVIADO", whatsapp: whatsapp ?? atual?.whatsapp ?? null, mensagem: a.mensagem, comImagem, imagemSha, u });
    await registrar(c, ator, [historico(statusAtual, "ENVIADO", `${ator.nome} confirmou manualmente o envio da felicitação de ${rotulo}.`)]);
    return r;
  });
}

type Etapa = "PREPARADO" | "ABERTO" | "ENVIADO" | "NAO_ENVIAR";

async function gravar(
  c: PoolClient,
  atual: RegistroFelicitacao | null,
  x: {
    d: DataCliente;
    ano: number;
    anos: number;
    data: DataISO;
    inicioGcf: string;
    etapa: Etapa;
    whatsapp?: string | null;
    mensagem?: string;
    modeloId?: number | null;
    motivo?: string | null;
    comImagem?: boolean;
    imagemSha?: string | null;
    u?: UsuarioSessao;
  },
): Promise<RegistroFelicitacao> {
  // Preparar de novo depois de abrir o WhatsApp não volta a etapa
  const status: Etapa = x.etapa === "PREPARADO" && atual?.status === "ABERTO" ? "ABERTO" : x.etapa;
  const marcaPreparo = x.etapa === "PREPARADO" || (x.etapa === "ABERTO" && !atual?.preparado_em);
  const marcaAbertura = x.etapa === "ABERTO";
  const marcaEnvio = x.etapa === "ENVIADO";
  const comImagem = x.comImagem ?? atual?.com_imagem ?? false;
  const valores = [
    x.d.cliente_nome, x.d.cnpj, x.anos, x.inicioGcf, x.data, status, x.whatsapp ?? atual?.whatsapp ?? null, x.mensagem ?? atual?.mensagem ?? null,
    x.modeloId ?? atual?.modelo_id ?? null, x.etapa === "NAO_ENVIAR" ? (x.motivo ?? null) : null, comImagem, x.imagemSha ?? null,
    marcaPreparo, marcaAbertura, marcaEnvio, x.u?.id ?? null, x.u?.nome ?? null,
  ];
  if (!atual) {
    const r = await c.query<{ id: number }>(
      `INSERT INTO felicitacoes (cliente_nome, cnpj, anos_parceria, inicio_gcf, data_felicitacao, status, whatsapp, mensagem, modelo_id, motivo,
         com_imagem, imagem_sha256, preparado_em, preparado_por, preparado_por_nome, whatsapp_aberto_em, whatsapp_aberto_por, whatsapp_aberto_por_nome,
         enviado_em, enviado_por, enviado_por_nome, data_cliente_id, ano)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
         CASE WHEN $13::boolean THEN now() END, CASE WHEN $13::boolean THEN $16::int END, CASE WHEN $13::boolean THEN $17::text END,
         CASE WHEN $14::boolean THEN now() END, CASE WHEN $14::boolean THEN $16::int END, CASE WHEN $14::boolean THEN $17::text END,
         CASE WHEN $15::boolean THEN now() END, CASE WHEN $15::boolean THEN $16::int END, CASE WHEN $15::boolean THEN $17::text END,
         $18, $19) RETURNING id`,
      [...valores, x.d.id, x.ano],
    );
    return (await c.query<RegistroFelicitacao>(`${SELECT_FEL} WHERE id = $1`, [r.rows[0].id])).rows[0];
  }
  await c.query(
    `UPDATE felicitacoes SET cliente_nome=$1, cnpj=$2, anos_parceria=$3, inicio_gcf=$4, data_felicitacao=$5, status=$6, whatsapp=$7, mensagem=$8,
       modelo_id=$9, motivo=$10, com_imagem=$11, imagem_sha256=coalesce($12, imagem_sha256),
       preparado_em = CASE WHEN $13::boolean THEN now() ELSE preparado_em END,
       preparado_por = CASE WHEN $13::boolean THEN $16::int ELSE preparado_por END,
       preparado_por_nome = CASE WHEN $13::boolean THEN $17::text ELSE preparado_por_nome END,
       whatsapp_aberto_em = CASE WHEN $14::boolean THEN now() ELSE whatsapp_aberto_em END,
       whatsapp_aberto_por = CASE WHEN $14::boolean THEN $16::int ELSE whatsapp_aberto_por END,
       whatsapp_aberto_por_nome = CASE WHEN $14::boolean THEN $17::text ELSE whatsapp_aberto_por_nome END,
       enviado_em = CASE WHEN $15::boolean THEN now() END,
       enviado_por = CASE WHEN $15::boolean THEN $16::int END,
       enviado_por_nome = CASE WHEN $15::boolean THEN $17::text END,
       versao = versao + 1, atualizado_em = now()
     WHERE id = $18`,
    [...valores, atual.id],
  );
  return (await c.query<RegistroFelicitacao>(`${SELECT_FEL} WHERE id = $1`, [atual.id])).rows[0];
}

// ---------------------------------------------------------------------
// WhatsApp do cliente (edição rápida pela Central)
// ---------------------------------------------------------------------

export async function salvarWhatsappCliente(id: number, whatsapp: string | null, versao: number, ator: Ator, usuarioId: number): Promise<DataCliente> {
  return transacao(async (c) => {
    const d = (await c.query<DataCliente>(`${SELECT_DATAS_CLIENTE} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!d) throw new ErroHttp(404, "Cliente não encontrado.");
    if (d.versao !== versao) throw new ErroHttp(409, "Este cadastro foi alterado por outra pessoa. Recarregue a página.");
    const novo = whatsapp ? normalizarWhatsapp(whatsapp) : null;
    if (whatsapp && !novo) throw new ErroHttp(422, "WhatsApp inválido. Informe DDD + celular, ex.: (98) 99999-0000.");
    if ((d.whatsapp ?? null) !== novo) {
      await c.query("UPDATE datas_cliente SET whatsapp = $2, versao = versao + 1, atualizado_em = now(), atualizado_por = $3 WHERE id = $1", [id, novo, usuarioId]);
      await registrar(c, ator, [
        { operacao: "ALTERACAO", entidade: "DATA_CLIENTE", entidadeId: id, registroNome: d.cliente_nome, campo: "whatsapp", campoLabel: "WhatsApp", valorAnterior: d.whatsapp, valorNovo: novo, descricao: `${ator.nome} alterou o WhatsApp de ${d.cliente_nome}.` },
      ]);
    }
    return (await c.query<DataCliente>(`${SELECT_DATAS_CLIENTE} WHERE id = $1`, [id])).rows[0];
  });
}
