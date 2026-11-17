import "server-only";
import type ExcelJS from "exceljs";
import { transacao } from "./db";
import { ErroHttp } from "./http";
import { ENTIDADES, OPERACOES, registrar, valorLegivel, type Ator, type Entidade } from "./historico";
import { funcionariosComAnalise, eventosDoPeriodo } from "./consultas";
import { listarDatasCliente, listarDatasComemorativas } from "./datas";
import { listarFuncionarios } from "./funcionarios";
import { listarRegistros, obterConfigFelicitacoes } from "./felicitacoes";
import { STATUS_FELICITACAO, aniversariosNoPeriodo, filtrarFelicitacoes, nomeDoMes, pendente, type FiltroStatusFelicitacao } from "@/lib/domain/felicitacoes";
import { descreverFiltrosHistorico, listarHistoricoParaExportacao, type FiltrosHistorico } from "./historico-consulta";
import { filtrarDatasCliente, type FiltroSituacaoCliente } from "@/lib/domain/clientes";
import { type FiltrosFuncionarios } from "@/lib/domain/filtros";
import { aplicarPlanilha, descreverConsulta, type ConsultaPlanilha, type FiltrosColunas, type Ordenacao } from "@/lib/domain/planilha";
import type { CampoChave } from "@/lib/domain/campos";
import { GRUPOS, type GrupoEvento } from "@/lib/domain/eventos";
import { MESES, deslocarMes, fimDoMes, hojeFortaleza, inicioDoMes } from "@/lib/domain/datas";
import {
  MIME_XLSX,
  gerarArquivo,
  planilhaCalendario,
  planilhaClientes,
  planilhaDatasEscritorio,
  planilhaFelicitacoes,
  planilhaFuncionarios,
  planilhaHistorico,
  planilhaModeloBase,
  type ContextoExportacao,
  type LinhaFelicitacaoExportacao,
} from "@/lib/excel/exportar";
import type { UsuarioSessao } from "@/lib/domain/tipos";

/**
 * Exportações para Excel. Somente leitura: nenhum cadastro é alterado ou excluído.
 * Cada exportação fica registrada no Histórico (quem exportou, o quê e quantos registros),
 * porque as planilhas contêm dados pessoais (LGPD).
 */

export const MENSAGEM_SEM_REGISTROS = "Nenhum registro encontrado para exportação.";
const LIMITE_HISTORICO = 50_000;

function contexto(u: UsuarioSessao): ContextoExportacao {
  return { geradoEm: new Date(), usuario: u.nome, hoje: hojeFortaleza() };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const REGISTRO_EXPORTACAO: Partial<Record<Entidade, string>> = {
  FUNCIONARIO: "Planilha de funcionários",
  FELICITACAO: "Planilha de felicitações",
  DATA_CLIENTE: "Planilha de datas do cliente",
  DATA_COMEMORATIVA: "Planilha de datas comemorativas",
  HISTORICO: "Planilha do histórico",
};

async function responder(wb: ExcelJS.Workbook, base: string, ator: Ator, entidade: Entidade, descricao: string): Promise<Response> {
  const arquivo = await gerarArquivo(wb);
  const nome = `rh-gcf_${base}_${hojeFortaleza()}.xlsx`;
  await transacao((c) =>
    registrar(c, ator, [
      { operacao: "EXPORTACAO", entidade, registroNome: REGISTRO_EXPORTACAO[entidade] ?? "Planilha", descricao: `${ator.nome} ${descricao} (arquivo ${nome}).` },
    ]),
  );
  return new Response(arquivo as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": MIME_XLSX,
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Content-Length": String(arquivo.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

// ---------------------------------------------------------------------
// Funcionários
// ---------------------------------------------------------------------

export interface ParametrosFuncionarios extends FiltrosFuncionarios {
  /** filtrados = exatamente o que aparece na lista; todos, ativos ou desligados ignoram os outros filtros */
  escopo: "filtrados" | "todos" | "ativos" | "desligados";
  formato: "completo" | "modelo";
  /** Filtros das colunas e ordenação da Planilha Geral */
  colunas?: FiltrosColunas;
  ordem?: Ordenacao;
  /** Somente estas colunas (na ordem da tela); sem isso, as 34 colunas */
  visiveis?: CampoChave[];
}

const DESCRICAO_ESCOPO_FUNCIONARIOS = { todos: "Todos os funcionários (ativos e desligados)", ativos: "Somente funcionários ativos", desligados: "Somente funcionários desligados" } as const;

export async function exportarFuncionarios(p: ParametrosFuncionarios, u: UsuarioSessao, ator: Ator): Promise<Response> {
  const ctx = contexto(u);
  if (p.formato === "modelo") {
    // Modelo de importação (34 colunas): mesma permissão da importação
    if (u.perfil !== "ADMIN") throw new ErroHttp(403, "Somente administradores exportam o modelo de importação.");
    const [funcionarios, datas] = await Promise.all([listarFuncionarios(), listarDatasComemorativas()]);
    if (funcionarios.length === 0 && datas.length === 0) throw new ErroHttp(404, MENSAGEM_SEM_REGISTROS);
    const wb = planilhaModeloBase(funcionarios, datas, ctx);
    return responder(wb, "funcionarios_modelo-34-colunas", ator, "FUNCIONARIO", `exportou ${plural(funcionarios.length, "funcionário", "funcionários")} no formato da planilha original (34 colunas)`);
  }
  const todos = await funcionariosComAnalise();
  const consulta: ConsultaPlanilha =
    p.escopo === "filtrados"
      ? { vinculo: p.filtro, cadastro: p.cadastro, busca: p.busca, situacao: p.situacao, modalidade: p.modalidade, colunas: p.colunas, ordem: p.ordem }
      : { vinculo: p.escopo };
  const lista = aplicarPlanilha(todos, consulta);
  if (lista.length === 0) throw new ErroHttp(404, MENSAGEM_SEM_REGISTROS);
  const colunas = p.visiveis?.length ? p.visiveis : undefined;
  const texto = (p.escopo === "filtrados" ? `Resultados filtrados — ${descreverConsulta(consulta)}` : DESCRICAO_ESCOPO_FUNCIONARIOS[p.escopo]) + (colunas ? ` · Somente as ${colunas.length} colunas visíveis` : "");
  const wb = planilhaFuncionarios(lista, ctx, texto, colunas);
  const base = colunas ? "funcionarios_colunas-visiveis" : { filtrados: "funcionarios_filtrados", todos: "funcionarios", ativos: "funcionarios_ativos", desligados: "funcionarios_desligados" }[p.escopo];
  return responder(wb, base, ator, "FUNCIONARIO", `exportou ${plural(lista.length, "funcionário", "funcionários")} para Excel (aba Base, ${colunas ? `${colunas.length} colunas` : "34 colunas"}) — ${texto}`);
}

// ---------------------------------------------------------------------
// Datas do cliente
// ---------------------------------------------------------------------

export interface ParametrosClientes {
  escopo: "todos" | "ativos" | "inativos" | "pesquisa";
  filtro: FiltroSituacaoCliente;
  busca: string | null;
  mes: number | null;
}

export async function exportarClientes(p: ParametrosClientes, u: UsuarioSessao, ator: Ator): Promise<Response> {
  const todos = await listarDatasCliente();
  const filtro = p.escopo === "pesquisa" ? { filtro: p.filtro, busca: p.busca, mes: p.mes } : { filtro: (p.escopo === "todos" ? "todos" : p.escopo) as FiltroSituacaoCliente };
  const lista = filtrarDatasCliente(todos, filtro);
  if (lista.length === 0) throw new ErroHttp(404, MENSAGEM_SEM_REGISTROS);
  const rotulo = { todos: "Todos os clientes", ativos: "Somente clientes ativos", inativos: "Somente clientes inativos", pesquisa: "Resultados da pesquisa" }[p.escopo];
  const detalhe =
    p.escopo === "pesquisa"
      ? ` — situação: ${p.filtro === "ativos" ? "Ativos" : p.filtro === "inativos" ? "Inativos" : "Todos"}${p.mes ? `; mês de aniversário: ${nomeDoMes(p.mes)}` : ""}${p.busca?.trim() ? `; pesquisa: "${p.busca.trim()}"` : ""}`
      : "";
  const config = await obterConfigFelicitacoes();
  const wb = planilhaClientes(lista, contexto(u), `${rotulo}${detalhe}`, config.dia_padrao);
  return responder(wb, `datas-do-cliente_${p.escopo}`, ator, "DATA_CLIENTE", `exportou ${plural(lista.length, "data de cliente", "datas de clientes")} para Excel — ${rotulo}${detalhe}`);
}

// ---------------------------------------------------------------------
// Felicitações
// ---------------------------------------------------------------------

export interface ParametrosFelicitacoes {
  /** lista = exatamente o que aparece na Central (mês, status e pesquisa) */
  escopo: "lista" | "mes" | "pendentes" | "enviadas" | "historico";
  ano: number;
  mes: number;
  status?: FiltroStatusFelicitacao;
  busca?: string;
}

const ROTULO_FILTRO_STATUS: Record<FiltroStatusFelicitacao, string> = { todos: "Todos", pendentes: "Pendentes (ainda não confirmadas)", ...STATUS_FELICITACAO };

export async function exportarFelicitacoes(p: ParametrosFelicitacoes, u: UsuarioSessao, ator: Ator): Promise<Response> {
  const ctx = contexto(u);
  let linhas: LinhaFelicitacaoExportacao[];
  let titulo: string;
  let filtros: string;
  if (p.escopo === "lista" || p.escopo === "mes" || p.escopo === "pendentes") {
    const [datas, config] = await Promise.all([listarDatasCliente(), obterConfigFelicitacoes()]);
    const registros = await listarRegistros({ anos: [p.ano] });
    let lista = aniversariosNoPeriodo(datas, registros, inicioDoMes(p.ano, p.mes), fimDoMes(p.ano, p.mes), ctx.hoje, config.dia_padrao);
    if (p.escopo === "pendentes") lista = lista.filter(pendente);
    if (p.escopo === "lista") lista = filtrarFelicitacoes(lista, { status: p.status ?? "todos", busca: p.busca ?? "" });
    linhas = lista.map((a) => ({
      empresa: a.dataCliente.cliente_nome,
      cnpj: a.dataCliente.cnpj,
      inicioGcf: a.inicioGcf,
      anos: a.anos,
      mes: nomeDoMes(p.mes),
      dataFelicitacao: a.data,
      whatsapp: a.whatsapp ?? a.dataCliente.whatsapp,
      status: STATUS_FELICITACAO[a.status],
      enviadoEm: a.registro?.enviado_em ?? null,
      enviadoPor: a.registro?.enviado_por_nome ?? null,
      preparadoEm: a.registro?.preparado_em ?? null,
      preparadoPor: a.registro?.preparado_por_nome ?? null,
      abertoEm: a.registro?.whatsapp_aberto_em ?? null,
      abertoPor: a.registro?.whatsapp_aberto_por_nome ?? null,
      comImagem: a.registro ? a.registro.com_imagem : null,
      mensagem: a.registro?.mensagem ?? null,
      motivo: a.registro?.motivo ?? (a.status === "NAO_ENVIAR" ? a.dataCliente.nao_enviar_motivo ?? "O cliente não deseja receber mensagens" : null),
    }));
    titulo = p.escopo === "pendentes" ? "Felicitações pendentes" : p.escopo === "lista" ? "Felicitações do mês (lista exibida)" : "Aniversariantes do mês";
    filtros = `Mês: ${nomeDoMes(p.mes)} de ${p.ano}`;
    if (p.escopo === "pendentes") filtros += " · Status: Pendente, Felicitação preparada e WhatsApp aberto";
    if (p.escopo === "lista") filtros += ` · Status: ${ROTULO_FILTRO_STATUS[p.status ?? "todos"]}${p.busca ? ` · Pesquisa: “${p.busca}”` : ""}`;
  } else {
    const registros = await listarRegistros(p.escopo === "enviadas" ? { status: ["ENVIADO"] } : {});
    linhas = registros.map((r) => ({
      empresa: r.cliente_nome,
      cnpj: r.cnpj,
      inicioGcf: r.inicio_gcf,
      anos: r.anos_parceria,
      mes: nomeDoMes(Number(String(r.data_felicitacao).slice(5, 7))),
      dataFelicitacao: r.data_felicitacao,
      whatsapp: r.whatsapp,
      status: STATUS_FELICITACAO[r.status],
      enviadoEm: r.enviado_em,
      enviadoPor: r.enviado_por_nome,
      preparadoEm: r.preparado_em,
      preparadoPor: r.preparado_por_nome,
      abertoEm: r.whatsapp_aberto_em,
      abertoPor: r.whatsapp_aberto_por_nome,
      comImagem: r.com_imagem,
      mensagem: r.mensagem,
      motivo: r.motivo,
    }));
    titulo = p.escopo === "enviadas" ? "Felicitações enviadas" : "Histórico de felicitações";
    filtros = p.escopo === "enviadas" ? "Todas as felicitações confirmadas como enviadas" : "Todas as felicitações preparadas, com WhatsApp aberto, enviadas ou marcadas como Não enviar";
  }
  if (linhas.length === 0) throw new ErroHttp(404, MENSAGEM_SEM_REGISTROS);
  const wb = planilhaFelicitacoes(linhas, ctx, titulo, filtros);
  const base = p.escopo === "lista" || p.escopo === "mes" || p.escopo === "pendentes" ? `felicitacoes_${p.escopo}_${p.ano}-${String(p.mes).padStart(2, "0")}` : `felicitacoes_${p.escopo}`;
  return responder(wb, base, ator, "FELICITACAO", `exportou ${plural(linhas.length, "felicitação", "felicitações")} para Excel — ${titulo} (${filtros})`);
}

// ---------------------------------------------------------------------
// Datas comemorativas
// ---------------------------------------------------------------------

export interface ParametrosComemorativas {
  conteudo: "mes" | "ano" | "escritorio";
  ano: number;
  mes: number;
  grupo: GrupoEvento | "todos";
}

export async function exportarDatasComemorativas(p: ParametrosComemorativas, u: UsuarioSessao, ator: Ator): Promise<Response> {
  const ctx = contexto(u);
  if (p.conteudo === "escritorio") {
    const datas = await listarDatasComemorativas();
    if (datas.length === 0) throw new ErroHttp(404, MENSAGEM_SEM_REGISTROS);
    return responder(planilhaDatasEscritorio(datas, ctx), "datas-do-escritorio", ator, "DATA_COMEMORATIVA", `exportou ${plural(datas.length, "data comemorativa", "datas comemorativas")} do escritório para Excel`);
  }
  const inicio = inicioDoMes(p.ano, p.mes);
  const ultimo = p.conteudo === "ano" ? deslocarMes(p.ano, p.mes, 11) : { ano: p.ano, mes: p.mes };
  const fim = fimDoMes(ultimo.ano, ultimo.mes);
  const todos = await eventosDoPeriodo(inicio, fim, ctx.hoje);
  const eventos = p.grupo === "todos" ? todos : todos.filter((e) => e.grupo === p.grupo);
  if (eventos.length === 0) throw new ErroHttp(404, MENSAGEM_SEM_REGISTROS);
  const nomeMes = (a: number, m: number) => `${MESES[m - 1]} de ${a}`;
  const periodo = p.conteudo === "ano" ? `${nomeMes(p.ano, p.mes)} a ${nomeMes(ultimo.ano, ultimo.mes)}` : nomeMes(p.ano, p.mes);
  const filtros = `Tipo de data: ${p.grupo === "todos" ? "Todas" : GRUPOS[p.grupo]} · Período: ${periodo} (${inicio.split("-").reverse().join("/")} a ${fim.split("-").reverse().join("/")})`;
  const wb = planilhaCalendario(eventos, ctx, periodo, filtros);
  const base = p.conteudo === "ano" ? `datas-comemorativas_12-meses_${inicio.slice(0, 7)}` : `datas-comemorativas_${inicio.slice(0, 7)}`;
  return responder(wb, base, ator, "DATA_COMEMORATIVA", `exportou ${plural(eventos.length, "data comemorativa", "datas comemorativas")} para Excel — ${filtros}`);
}

// ---------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------

export async function exportarHistorico(filtros: FiltrosHistorico, escopo: "filtrados" | "todos", u: UsuarioSessao, ator: Ator): Promise<Response> {
  const f: FiltrosHistorico = escopo === "todos" ? {} : filtros;
  const { itens, limitado } = await listarHistoricoParaExportacao(f, LIMITE_HISTORICO);
  if (itens.length === 0) throw new ErroHttp(404, MENSAGEM_SEM_REGISTROS);
  // Endereço IP e a cadeia de hashes são informações internas de auditoria: não são exportados.
  const linhas = itens.map((h) => ({
    ocorridoEm: h.ocorrido_em,
    usuario: h.usuario_nome,
    operacao: OPERACOES[h.operacao] ?? h.operacao,
    entidade: ENTIDADES[h.entidade] ?? h.entidade,
    registro: h.registro_nome,
    campo: h.campo_label,
    anterior: h.campo ? (h.sensivel ? "(informação protegida)" : valorLegivel(h.campo, h.valor_anterior)) : null,
    novo: h.campo ? (h.sensivel ? "(informação protegida)" : valorLegivel(h.campo, h.valor_novo)) : null,
    descricao: h.descricao,
    lote: h.lote_id,
  }));
  const texto = descreverFiltrosHistorico(f, OPERACOES);
  const wb = planilhaHistorico(linhas, contexto(u), texto, limitado);
  return responder(wb, escopo === "todos" ? "historico" : "historico_filtrado", ator, "HISTORICO", `exportou ${plural(linhas.length, "registro", "registros")} do histórico para Excel — ${texto}`);
}
