/**
 * Regras das Datas do Cliente: filtros, cadastro incompleto, anos de parceria
 * e a análise da importação de clientes (duplicidades e conflitos), sem acesso ao banco.
 */
import { limparCnpj } from "./cnpj";
import { diasNoMes, diferencaDias, formatarData, montar, partes, type DataISO } from "./datas";
import { ehAniversarioParceria } from "./eventos";
import { TIPOS_DATA_CLIENTE, type DataCliente } from "./tipos";
import { normalizarNome } from "@/lib/excel/normalizar";

export const TIPO_PARCERIA = TIPOS_DATA_CLIENTE[0]; // "Aniversário de parceria"
export const TIPO_FUNDACAO = TIPOS_DATA_CLIENTE[1]; // "Aniversário de fundação da empresa"
export const TIPO_SOCIO = TIPOS_DATA_CLIENTE[2]; // "Aniversário do sócio ou responsável"
export const TIPO_SEGMENTO = TIPOS_DATA_CLIENTE[3]; // "Data comemorativa do segmento"
export const TIPO_OUTRO = TIPOS_DATA_CLIENTE[4]; // "Outro"

// ---------------------------------------------------------------------
// Filtros da aba (usados na tela e na exportação, para darem o mesmo resultado)
// ---------------------------------------------------------------------

export type FiltroSituacaoCliente = "ativos" | "inativos" | "todos";

export function clienteAtivo(d: Pick<DataCliente, "ativo" | "situacao_cliente">): boolean {
  return d.ativo && d.situacao_cliente === "ATIVO";
}

/** Mês do aniversário: o do Início GCF (parceria) ou o da data do evento. */
export function mesDoAniversario(d: Pick<DataCliente, "tipo_data" | "data_evento" | "inicio_parceria">): number | null {
  const ref = chaveTipo(d.tipo_data) === chaveTipo(TIPO_PARCERIA) || !d.data_evento ? d.inicio_parceria : d.data_evento;
  return ref ? partes(ref).mes : null;
}

export function filtrarDatasCliente<T extends DataCliente>(lista: T[], f: { filtro: FiltroSituacaoCliente; busca?: string | null; mes?: number | null }): T[] {
  const busca = f.busca ?? "";
  const termo = normalizarNome(busca);
  const digitos = busca.replace(/\D/g, "");
  return lista.filter((d) => {
    const ativo = clienteAtivo(d);
    if (f.filtro === "ativos" && !ativo) return false;
    if (f.filtro === "inativos" && ativo) return false;
    if (f.mes && mesDoAniversario(d) !== f.mes) return false;
    return (
      !termo ||
      normalizarNome(d.cliente_nome).includes(termo) ||
      (!!digitos && (d.cnpj ?? "").replace(/\D/g, "").includes(digitos)) ||
      (!!d.codigo && normalizarNome(d.codigo) === termo)
    );
  });
}

// ---------------------------------------------------------------------
// Cadastro incompleto e anos de parceria
// ---------------------------------------------------------------------

/** Informações que faltam no cadastro do cliente (vazio = completo). */
export function pendenciasDataCliente(d: Pick<DataCliente, "cnpj" | "tipo_data" | "data_evento" | "inicio_parceria">): string[] {
  const p: string[] = [];
  if (!d.cnpj) p.push("CNPJ");
  if (!d.inicio_parceria) p.push("Início GCF");
  if (!ehAniversarioParceria(d) && chaveTipo(d.tipo_data) !== chaveTipo(TIPO_PARCERIA) && !d.data_evento) p.push("Data do evento");
  return p;
}

export type PrecisaoInicio = "DIA" | "MES";

/** Início GCF para exibição: "03/2025" quando a planilha informa só mês e ano. */
export function formatarInicioGcf(inicio: DataISO | null | undefined, precisao: PrecisaoInicio | null | undefined): string {
  if (!inicio) return "";
  const p = partes(inicio);
  return precisao === "MES" ? `${String(p.mes).padStart(2, "0")}/${p.ano}` : formatarData(inicio);
}

/**
 * Anos completos de parceria na data informada (null sem Início GCF).
 * Com só mês e ano, o aniversário conta a partir do mês: início 03/2025 → 1 ano em março de 2026.
 */
export function anosDeParceria(inicio: DataISO | null | undefined, hoje: DataISO, precisao: PrecisaoInicio = "DIA"): number | null {
  if (!inicio) return null;
  const a = partes(inicio);
  const h = partes(hoje);
  let anos = h.ano - a.ano;
  if (h.mes < a.mes || (precisao === "DIA" && h.mes === a.mes && h.dia < a.dia)) anos--;
  return Math.max(0, anos);
}

/** Dia do aniversário de parceria no ano: o dia real ou, com só mês e ano, o dia padrão configurado. */
/**
 * Próximo aniversário de parceria (de 1 ano em diante) a partir de hoje.
 * O próprio mês de início não conta como aniversário: quem começou em 11/2026 faz 1 ano em 11/2027.
 */
export function proximoAniversarioParceria(
  d: Pick<DataCliente, "inicio_parceria" | "inicio_parceria_precisao">,
  hoje: DataISO,
  diaPadrao: number,
): { data: DataISO; dias: number; anos: number } | null {
  if (!d.inicio_parceria) return null;
  const precisao = d.inicio_parceria_precisao ?? "DIA";
  const anoInicio = partes(d.inicio_parceria).ano;
  const primeiro = Math.max(partes(hoje).ano, anoInicio + 1);
  for (const ano of [primeiro, primeiro + 1]) {
    const data = dataAniversarioParceria(d.inicio_parceria, precisao, ano, diaPadrao);
    if (data >= hoje) return { data, dias: diferencaDias(hoje, data), anos: ano - anoInicio };
  }
  return null;
}

export function dataAniversarioParceria(inicio: DataISO, precisao: PrecisaoInicio, ano: number, diaPadrao: number): DataISO {
  const p = partes(inicio);
  const dia = precisao === "MES" ? diaPadrao : p.dia;
  return montar(ano, p.mes, Math.min(dia, diasNoMes(ano, p.mes)));
}

// ---------------------------------------------------------------------
// Chaves para identificar o mesmo cliente / o mesmo evento
// ---------------------------------------------------------------------

const SUFIXOS_EMPRESA = /\b(ltda|me|epp|eireli|sa|s a|ss|mei|limitada|cia)\.?$/;

/** Nome para comparação: sem acentos, caixa, pontuação e sufixos como LTDA, ME, EPP, S/A. */
export function chaveNomeCliente(nome: string | null | undefined): string {
  let n = normalizarNome(nome).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const s = n.replace(SUFIXOS_EMPRESA, "").trim();
    if (s === n || s === "") break;
    n = s;
  }
  return n;
}

export function chaveCnpj(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const c = limparCnpj(cnpj);
  return c.length === 14 ? c : null;
}

export function chaveTipo(tipo: string | null | undefined): string {
  return normalizarNome(tipo).replace(/[^a-z0-9]+/g, "");
}

const CHAVE_PARCERIA = chaveTipo(TIPO_PARCERIA);
const CHAVE_FUNDACAO = chaveTipo(TIPO_FUNDACAO);

/** Tipos que só existem uma vez por cliente (parceria e fundação). */
export function tipoUnicoPorCliente(tipo: string): boolean {
  const t = chaveTipo(tipo);
  return t === CHAVE_PARCERIA || t === CHAVE_FUNDACAO;
}

/** "Contato: Fulano" gravado nas observações (formato usado pela importação). */
export function contatoDasObservacoes(obs: string | null | undefined): string | null {
  if (!obs) return null;
  const m = /(?:^|[·;\n|])\s*Contato:\s*([^·;\n|]+)/i.exec(obs);
  const c = m?.[1]?.trim();
  return c ? c : null;
}

// ---------------------------------------------------------------------
// Importação: o que foi lido da planilha
// ---------------------------------------------------------------------

export interface EventoClienteLido {
  tipo_data: string;
  /** false quando a planilha não informa o tipo e o sistema usou "Outro" */
  tipoInformado: boolean;
  data_evento: DataISO | null;
  inicio_parceria: DataISO | null;
  /** MES quando o Início GCF tem só mês e ano */
  inicio_parceria_precisao?: PrecisaoInicio;
  /** Erro só deste evento (ex.: data inválida) */
  erro: string | null;
}

export interface ClienteLido {
  aba: string;
  linha: number;
  cliente_nome: string | null;
  /** CNPJ válido e formatado */
  cnpj: string | null;
  /** Nome do contato/responsável (vai para o campo Responsável) */
  contato: string | null;
  /** Celular com WhatsApp já normalizado (+55…) */
  whatsapp?: string | null;
  codigo?: string | null;
  tributacao?: string | null;
  responsavel_fiscal?: string | null;
  responsavel_contabil?: string | null;
  responsavel_dp?: string | null;
  /** Demais colunas da planilha (cabeçalho → valor), só as preenchidas */
  dados_extras?: Record<string, string>;
  situacao_cliente: "ATIVO" | "INATIVO" | null;
  recorrente: boolean | null;
  /** "Situação do evento" (Ativo/Desativado), quando a planilha informa */
  ativo: boolean | null;
  observacoes: string | null;
  eventos: EventoClienteLido[];
  /** Impedem a importação da linha inteira */
  erros: string[];
  avisos: string[];
}

export interface ColunaCliente {
  papel: string;
  cabecalho: string;
  coluna: string;
}

export interface AbaClientes {
  nome: string;
  linhaCabecalho: number;
  colunas: ColunaCliente[];
  /** Colunas reconhecidas mas não importadas (calculadas pelo sistema ou sem uso) */
  ignoradas: string[];
  linhas: number;
}

// ---------------------------------------------------------------------
// Aba Calendário (gerada pela planilha RH GCF a partir da aba Base)
// ---------------------------------------------------------------------

/** Classificação pela coluna Evento (nunca pela Modalidade). */
export type TipoEventoCalendario = "EMPRESA" | "FUNCIONARIO" | "FILHO" | "CONJUGE" | "FERIAS_INICIO" | "FERIAS_FIM" | "OUTRO";

export const ROTULOS_EVENTO_CALENDARIO: Record<TipoEventoCalendario, string> = {
  EMPRESA: "Aniversário de Empresa",
  FUNCIONARIO: "Aniversário do Funcionário",
  FILHO: "Aniversário de Filho(a)",
  CONJUGE: "Aniversário do Cônjuge",
  FERIAS_INICIO: "Início de Férias",
  FERIAS_FIM: "Fim de Férias",
  OUTRO: "Outros",
};

/** Linha "Aniversário de Empresa" da aba Calendário, com os valores como estão na planilha. */
export interface EventoEmpresaLido {
  aba: string;
  linha: number;
  nome: string;
  data: DataISO | null;
  /** Anos informados na coluna Detalhe ("10 anos de empresa") */
  anos: number | null;
  detalhe: string | null;
  modalidade: string | null;
  evento: string;
}

export interface LeituraCalendario {
  aba: string;
  linhaCabecalho: number;
  totalEventos: number;
  porTipo: Partial<Record<TipoEventoCalendario, number>>;
  empresa: EventoEmpresaLido[];
}

/** Colaborador da aba Base (para conferir de quem é cada "Aniversário de Empresa"). */
export interface ColaboradorPlanilha {
  nome: string;
  situacao: string | null;
  admissao: DataISO | null;
}

export interface LeituraClientes {
  abas: AbaClientes[];
  clientes: ClienteLido[];
  avisos: string[];
  /** Aba Calendário, quando o arquivo é a planilha RH GCF */
  calendario?: LeituraCalendario | null;
  /** Aba Base de funcionários do mesmo arquivo (importada em Funcionários → Importar Excel) */
  base?: { aba: string; colaboradores: ColaboradorPlanilha[]; comemorar: number } | null;
}

export type SituacaoEventoEmpresa = "TEMPO_DE_CASA" | "NAO_ENCONTRADO";

export interface EventoEmpresaPrevia extends EventoEmpresaLido {
  situacao: SituacaoEventoEmpresa;
  /** Colaborador correspondente na aba Base */
  colaborador: ColaboradorPlanilha | null;
  /** Já cadastrado em Funcionários: o tempo de casa já aparece em Datas Comemorativas */
  noSistema: boolean;
  /** Repetido na própria aba (mesmo nome e data) */
  duplicadoDe: number | null;
}

export interface PreviaCalendario {
  aba: string;
  totalEventos: number;
  porTipo: Partial<Record<TipoEventoCalendario, number>>;
  eventosEmpresa: EventoEmpresaPrevia[];
  colaboradoresNaBase: number;
  /** Colaboradores da aba Base que ainda não estão em Funcionários */
  faltamNoSistema: number;
}

/**
 * "Aniversário de Empresa" da aba Calendário: a planilha calcula esse evento a partir da Admissão
 * de cada colaborador da aba Base (tempo de casa). Por isso ele é conferido com a Base e não vira cliente.
 */
export function analisarEventosEmpresa(cal: LeituraCalendario, base: LeituraClientes["base"], nomesNoSistema: string[]): PreviaCalendario {
  const colaboradores = new Map((base?.colaboradores ?? []).map((c) => [chaveNomeCliente(c.nome), c]));
  const sistema = new Set(nomesNoSistema.map((n) => chaveNomeCliente(n)));
  const vistos = new Map<string, number>();
  const eventosEmpresa = cal.empresa.map((e): EventoEmpresaPrevia => {
    const k = chaveNomeCliente(e.nome);
    const chave = `${k}|${e.data ?? ""}`;
    const duplicadoDe = vistos.get(chave) ?? null;
    if (duplicadoDe == null) vistos.set(chave, e.linha);
    const colaborador = colaboradores.get(k) ?? null;
    return { ...e, situacao: colaborador || sistema.has(k) ? "TEMPO_DE_CASA" : "NAO_ENCONTRADO", colaborador, noSistema: sistema.has(k), duplicadoDe };
  });
  return {
    aba: cal.aba,
    totalEventos: cal.totalEventos,
    porTipo: cal.porTipo,
    eventosEmpresa,
    colaboradoresNaBase: base?.colaboradores.length ?? 0,
    faltamNoSistema: (base?.colaboradores ?? []).filter((c) => !sistema.has(chaveNomeCliente(c.nome))).length,
  };
}

// ---------------------------------------------------------------------
// Importação: análise contra o que já está cadastrado
// ---------------------------------------------------------------------

export type AcaoImportacao = "NOVO" | "ATUALIZAR" | "IGNORAR" | "CORRIGIR";

export interface DadosDataCliente {
  cliente_nome: string;
  cnpj: string | null;
  tipo_data: string;
  data_evento: DataISO | null;
  inicio_parceria: DataISO | null;
  recorrente: boolean;
  observacoes: string | null;
  situacao_cliente: "ATIVO" | "INATIVO";
  inicio_parceria_precisao: PrecisaoInicio;
  codigo: string | null;
  tributacao: string | null;
  responsavel_fiscal: string | null;
  responsavel_contabil: string | null;
  responsavel_dp: string | null;
  dados_extras: Record<string, string>;
  whatsapp: string | null;
  nao_enviar: boolean;
  nao_enviar_motivo: string | null;
}

export type CampoCliente = keyof DadosDataCliente;

export const ROTULOS_CAMPO_CLIENTE: Record<CampoCliente, string> = {
  cliente_nome: "Cliente",
  cnpj: "CNPJ",
  tipo_data: "Tipo de data",
  data_evento: "Data do evento",
  inicio_parceria: "Início GCF",
  recorrente: "Repetir todo ano",
  observacoes: "Observações",
  situacao_cliente: "Situação do cliente",
  inicio_parceria_precisao: "Precisão do Início GCF",
  codigo: "ID",
  tributacao: "Tributação",
  responsavel_fiscal: "Responsável Fiscal",
  responsavel_contabil: "Responsável Contábil",
  responsavel_dp: "Responsável DP",
  dados_extras: "Outras informações",
  whatsapp: "WhatsApp",
  nao_enviar: "Não deseja receber mensagens",
  nao_enviar_motivo: "Motivo de não receber mensagens",
};

export interface CampoAlterado {
  campo: CampoCliente;
  label: string;
  atual: string | null;
  planilha: string | null;
  /** Texto para exibir na prévia, quando diferente do valor guardado (ex.: Início GCF "03/2025") */
  textoAtual?: string;
  textoPlanilha?: string;
}

export interface RegistroImportacaoCliente {
  /** Identificador estável: aba|linha|evento */
  id: string;
  aba: string;
  linha: number;
  acao: AcaoImportacao;
  motivo: string | null;
  dados: DadosDataCliente;
  ativo: boolean | null;
  existenteId: number | null;
  /** Campos vazios no sistema que a planilha completa */
  completar: CampoAlterado[];
  /** Valores diferentes do sistema: só são substituídos com confirmação */
  conflitos: CampoAlterado[];
  /** Informações que continuam faltando (cadastro incompleto) */
  pendencias: string[];
  avisos: string[];
  /** Registro duplicado: na própria planilha ou já cadastrado */
  duplicado: boolean;
}

export interface ResumoImportacaoClientes {
  linhas: number;
  registros: number;
  novos: number;
  atualizar: number;
  conflitos: number;
  ignorados: number;
  duplicados: number;
  corrigir: number;
  incompletos: number;
}

export interface PreviaClientes {
  abas: AbaClientes[];
  lidos: ClienteLido[];
  registros: RegistroImportacaoCliente[];
  resumo: ResumoImportacaoClientes;
  avisos: string[];
  /** Eventos da aba Calendário (planilha RH GCF): conferidos, mas não viram clientes */
  calendario?: PreviaCalendario | null;
  /** Aba Base de funcionários do mesmo arquivo */
  base?: { aba: string; colaboradores: number; comemorar: number; faltamNoSistema: number } | null;
}

export function textoCampoCliente(campo: CampoCliente, v: unknown): string {
  if (v == null || v === "") return "(vazio)";
  if (campo === "data_evento" || campo === "inicio_parceria") return formatarData(String(v));
  if (campo === "recorrente" || campo === "nao_enviar") return v === true || v === "true" ? "Sim" : "Não";
  if (campo === "situacao_cliente") return v === "ATIVO" ? "Ativo" : "Inativo";
  if (campo === "inicio_parceria_precisao") return v === "MES" ? "Mês e ano" : "Dia, mês e ano";
  if (campo === "dados_extras") {
    const o = typeof v === "string" ? (JSON.parse(v) as Record<string, string>) : (v as Record<string, string>);
    return Object.entries(o).map(([k, x]) => `${k}: ${x}`).join("; ") || "(vazio)";
  }
  return String(v);
}

function igual(campo: CampoCliente, a: unknown, b: unknown): boolean {
  if (campo === "cliente_nome") return chaveNomeCliente(String(a ?? "")) === chaveNomeCliente(String(b ?? "")) && normalizarNome(String(a ?? "")) === normalizarNome(String(b ?? ""));
  if (campo === "cnpj") return chaveCnpj(String(a ?? "")) === chaveCnpj(String(b ?? ""));
  if (campo === "dados_extras") return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  if (campo === "tipo_data") return String(a ?? "").replace(/\s+/g, " ").trim() === String(b ?? "").replace(/\s+/g, " ").trim();
  // Observação da planilha já contida na do cadastro (ex.: "Contato: Fulano") não é diferença
  if (campo === "observacoes") return normalizarNome(String(a ?? "")).includes(normalizarNome(String(b ?? "")));
  return String(a ?? "") === String(b ?? "");
}

function mesmoEvento(e: DataCliente, tipo: string, dataEvento: DataISO | null, contato: string | null): boolean {
  if (chaveTipo(e.tipo_data) !== chaveTipo(tipo)) return false;
  if (tipoUnicoPorCliente(tipo)) return true;
  const contatoExistente = contatoDasObservacoes(e.observacoes);
  if (contato && contatoExistente) return chaveNomeCliente(contato) === chaveNomeCliente(contatoExistente);
  return (e.data_evento ?? null) === (dataEvento ?? null);
}

/** Campos da planilha geral e de contato (o que a planilha não traz fica vazio, nada é inventado). */
function camposExtras(l: ClienteLido) {
  return {
    codigo: l.codigo ?? null,
    tributacao: l.tributacao ?? null,
    responsavel_fiscal: l.responsavel_fiscal ?? null,
    responsavel_contabil: l.responsavel_contabil ?? null,
    responsavel_dp: l.responsavel_dp ?? null,
    dados_extras: l.dados_extras ?? {},
    whatsapp: l.whatsapp ?? null,
    nao_enviar: false,
    nao_enviar_motivo: null,
  };
}

function vazioDados(l: ClienteLido, ev?: EventoClienteLido): DadosDataCliente {
  return {
    cliente_nome: l.cliente_nome ?? "",
    cnpj: l.cnpj,
    tipo_data: ev?.tipo_data ?? "",
    data_evento: ev?.data_evento ?? null,
    inicio_parceria: ev?.inicio_parceria ?? null,
    inicio_parceria_precisao: ev?.inicio_parceria_precisao ?? "DIA",
    recorrente: l.recorrente ?? true,
    observacoes: l.observacoes,
    situacao_cliente: l.situacao_cliente ?? "ATIVO",
    ...camposExtras(l),
  };
}

/**
 * Compara o que foi lido da planilha com o que já está cadastrado.
 *
 * - O mesmo cliente é reconhecido primeiro pelo CNPJ; sem CNPJ, pelo nome (sem acentos, caixa e LTDA/ME…).
 * - Parceria e fundação existem uma vez por cliente. Aniversários de sócios/contatos são separados por pessoa.
 * - Já cadastrado: só os campos vazios no sistema são completados. Valores diferentes ficam como
 *   conflito e só são substituídos se o usuário confirmar.
 * - Nada é inventado: o que falta continua vazio e aparece como pendência.
 */
export function analisarImportacaoClientes(lidos: ClienteLido[], existentes: DataCliente[]): { registros: RegistroImportacaoCliente[]; resumo: ResumoImportacaoClientes } {
  const porCnpj = new Map<string, DataCliente[]>();
  const porNome = new Map<string, DataCliente[]>();
  for (const e of existentes) {
    const c = chaveCnpj(e.cnpj);
    if (c) porCnpj.set(c, [...(porCnpj.get(c) ?? []), e]);
    const n = chaveNomeCliente(e.cliente_nome);
    if (n) porNome.set(n, [...(porNome.get(n) ?? []), e]);
  }

  // CNPJ informado em outra linha da planilha para o mesmo nome
  const cnpjDaPlanilha = new Map<string, string>();
  for (const l of lidos) {
    const n = chaveNomeCliente(l.cliente_nome);
    if (n && l.cnpj && !cnpjDaPlanilha.has(n)) cnpjDaPlanilha.set(n, l.cnpj);
  }

  const vistos = new Map<string, string>();
  const registros: RegistroImportacaoCliente[] = [];
  const base = (l: ClienteLido, i: number, dados: DadosDataCliente): RegistroImportacaoCliente => ({
    id: `${l.aba}|${l.linha}|${i}`,
    aba: l.aba,
    linha: l.linha,
    acao: "CORRIGIR",
    motivo: null,
    dados,
    ativo: l.ativo,
    existenteId: null,
    completar: [],
    conflitos: [],
    pendencias: [],
    avisos: [...l.avisos],
    duplicado: false,
  });

  for (const l of lidos) {
    const nomeChave = chaveNomeCliente(l.cliente_nome);
    if (l.erros.length || !nomeChave) {
      registros.push({ ...base(l, 0, vazioDados(l, l.eventos[0])), motivo: l.erros.join(" ") || "Nome ou razão social não informado." });
      continue;
    }
    if (l.eventos.length === 0) {
      registros.push({ ...base(l, 0, vazioDados(l)), motivo: "Nenhuma data na linha: informe a data do evento, o aniversário ou o início da parceria." });
      continue;
    }

    let cnpj = l.cnpj;
    const avisosLinha: string[] = [];
    if (!cnpj && cnpjDaPlanilha.has(nomeChave)) {
      cnpj = cnpjDaPlanilha.get(nomeChave)!;
      avisosLinha.push("CNPJ informado em outra linha da planilha para o mesmo cliente.");
    }
    const cnpjChave = chaveCnpj(cnpj);

    // Cadastro existente do mesmo cliente
    let grupo: DataCliente[] = [];
    let ambiguo = false;
    if (cnpjChave) {
      // Mesmo CNPJ + cadastros do mesmo nome ainda sem CNPJ (são do mesmo cliente)
      grupo = [...(porCnpj.get(cnpjChave) ?? []), ...(porNome.get(nomeChave) ?? []).filter((e) => !chaveCnpj(e.cnpj))];
    } else {
      const candidatos = porNome.get(nomeChave) ?? [];
      const cnpjs = new Set(candidatos.map((e) => chaveCnpj(e.cnpj)).filter(Boolean));
      if (cnpjs.size > 1) ambiguo = true;
      else grupo = candidatos;
    }
    const clienteChave = cnpjChave ? `c:${cnpjChave}` : `n:${nomeChave}`;

    l.eventos.forEach((ev, i) => {
      const nomeFinal = grupo[0]?.cliente_nome ?? l.cliente_nome!;
      const dados: DadosDataCliente = {
        cliente_nome: nomeFinal,
        cnpj: cnpj ?? grupo.find((e) => e.cnpj)?.cnpj ?? null,
        tipo_data: ev.tipo_data,
        data_evento: ev.data_evento,
        inicio_parceria: ev.inicio_parceria,
        inicio_parceria_precisao: ev.inicio_parceria_precisao ?? "DIA",
        recorrente: l.recorrente ?? true,
        observacoes: l.observacoes,
        situacao_cliente: l.situacao_cliente ?? grupo[0]?.situacao_cliente ?? "ATIVO",
        ...camposExtras(l),
      };
      const r = base(l, i, dados);
      r.avisos.push(...avisosLinha);
      if (grupo.length && chaveNomeCliente(l.cliente_nome) === chaveNomeCliente(nomeFinal) && normalizarNome(l.cliente_nome) !== normalizarNome(nomeFinal))
        r.avisos.push(`Nome na planilha: ${l.cliente_nome}. Mantido o nome já cadastrado.`);
      else if (grupo.length && chaveNomeCliente(l.cliente_nome) !== chaveNomeCliente(nomeFinal))
        r.avisos.push(`Nome na planilha: ${l.cliente_nome}. Mesmo CNPJ do cliente ${nomeFinal}, já cadastrado.`);
      if (!ev.tipoInformado) r.avisos.push(`Tipo de data não informado na planilha: registrado como "${ev.tipo_data}". Ajuste depois, se precisar.`);

      if (ev.erro) {
        r.motivo = ev.erro;
        registros.push(r);
        return;
      }
      if (ambiguo) {
        r.motivo = "Existe mais de um cliente com este nome e CNPJs diferentes no sistema. Informe o CNPJ na planilha.";
        registros.push(r);
        return;
      }

      const contato = l.contato ?? contatoDasObservacoes(l.observacoes);
      const eventoChave = tipoUnicoPorCliente(ev.tipo_data)
        ? chaveTipo(ev.tipo_data)
        : `${chaveTipo(ev.tipo_data)}|${contato ? chaveNomeCliente(contato) : ev.data_evento ?? ""}`;
      const chave = `${clienteChave}|${eventoChave}`;
      const anterior = vistos.get(chave);
      if (anterior) {
        r.acao = "IGNORAR";
        r.duplicado = true;
        r.motivo = `Duplicado na planilha: mesmo cliente e mesma data da ${anterior}.`;
        registros.push(r);
        return;
      }
      vistos.set(chave, `aba ${l.aba}, linha ${l.linha}`);

      const alvo = grupo.find((e) => mesmoEvento(e, ev.tipo_data, ev.data_evento, contato));
      if (!alvo && grupo.length && !ev.inicio_parceria && !ev.data_evento && chaveTipo(ev.tipo_data) === chaveTipo(TIPO_PARCERIA)) {
        // Cliente já cadastrado e a planilha não traz o Início GCF: não cria um aniversário de parceria vazio
        r.acao = "IGNORAR";
        r.existenteId = grupo[0].id;
        r.motivo = "Cliente já cadastrado; a planilha não informa o Início GCF.";
        registros.push(r);
        return;
      }
      if (!alvo) {
        r.acao = "NOVO";
        r.motivo = grupo.length ? `Nova data para o cliente ${nomeFinal}, já cadastrado.` : "Cliente novo.";
        r.pendencias = pendenciasDataCliente(dados);
        if (!ev.tipoInformado) r.pendencias.push("Tipo de data");
        registros.push(r);
        return;
      }

      r.existenteId = alvo.id;
      const comparar: CampoCliente[] = [
        "cliente_nome", "cnpj", "data_evento", "inicio_parceria", "observacoes", "codigo", "tributacao",
        "responsavel_fiscal", "responsavel_contabil", "responsavel_dp", "whatsapp",
      ];
      if (l.situacao_cliente) comparar.push("situacao_cliente");
      if (l.recorrente != null) comparar.push("recorrente");
      for (const campo of comparar) {
        const novo = campo === "cliente_nome" ? l.cliente_nome : dados[campo];
        if (novo == null || novo === "") continue;
        const atual = (alvo as unknown as Record<string, unknown>)[campo];
        if (campo === "inicio_parceria") {
          // Mesmo mês/ano: a planilha só com mês/ano não substitui um dia exato já cadastrado
          const precAtual = alvo.inicio_parceria_precisao ?? "DIA";
          const precNova = dados.inicio_parceria_precisao;
          const mesmoMes = typeof atual === "string" && atual.slice(0, 7) === String(novo).slice(0, 7);
          if (atual === novo && precAtual === precNova) continue;
          if (mesmoMes && precNova === "MES") continue;
          const item: CampoAlterado = {
            campo,
            label: ROTULOS_CAMPO_CLIENTE[campo],
            atual: atual == null ? null : String(atual),
            planilha: String(novo),
            textoAtual: atual ? formatarInicioGcf(String(atual), precAtual) : "(vazio)",
            textoPlanilha: formatarInicioGcf(String(novo), precNova),
          };
          if (atual == null) r.completar.push(item);
          else r.conflitos.push(item);
          continue;
        }
        if (igual(campo, atual, novo)) continue;
        const item: CampoAlterado = {
          campo,
          label: ROTULOS_CAMPO_CLIENTE[campo],
          atual: atual == null ? null : String(atual),
          planilha: String(novo),
        };
        if (atual == null || atual === "") r.completar.push(item);
        else r.conflitos.push(item);
      }
      // Demais colunas da planilha: junta com as já guardadas (as que não vieram no arquivo são mantidas)
      const extrasAtuais = alvo.dados_extras ?? {};
      const extrasNovos = Object.fromEntries(Object.entries(dados.dados_extras).filter(([k, v]) => extrasAtuais[k] !== v));
      if (Object.keys(extrasNovos).length) {
        dados.dados_extras = { ...extrasAtuais, ...dados.dados_extras };
        r.completar.push({
          campo: "dados_extras",
          label: ROTULOS_CAMPO_CLIENTE.dados_extras,
          atual: null,
          planilha: JSON.stringify(dados.dados_extras),
          textoPlanilha: Object.keys(extrasNovos).join(", "),
        });
      }
      // Diferenças de caixa/LTDA no nome não contam.
      r.conflitos = r.conflitos.filter((c) => c.campo !== "cliente_nome" || chaveNomeCliente(c.atual) !== chaveNomeCliente(c.planilha));
      const depois = { ...alvo, ...Object.fromEntries(r.completar.map((c) => [c.campo, dados[c.campo]])) } as DataCliente;
      r.pendencias = pendenciasDataCliente(depois);
      if (r.completar.length === 0 && r.conflitos.length === 0) {
        r.acao = "IGNORAR";
        r.duplicado = true;
        r.motivo = "Já cadastrado com os mesmos dados.";
      } else {
        r.acao = "ATUALIZAR";
        r.motivo = [
          r.completar.length ? `Completa ${r.completar.map((c) => c.label).join(", ")}` : null,
          r.conflitos.length ? `${r.conflitos.length} ${r.conflitos.length === 1 ? "valor diferente" : "valores diferentes"} do cadastro (a planilha atualiza o cadastro; desmarque na prévia para manter o valor atual)` : null,
        ]
          .filter(Boolean)
          .join(". ")
          .concat(".");
      }
      registros.push(r);
    });
  }

  return { registros, resumo: resumirImportacaoClientes(registros, lidos.length) };
}

export function resumirImportacaoClientes(registros: RegistroImportacaoCliente[], linhas: number): ResumoImportacaoClientes {
  return {
    linhas,
    registros: registros.length,
    novos: registros.filter((r) => r.acao === "NOVO").length,
    atualizar: registros.filter((r) => r.acao === "ATUALIZAR").length,
    conflitos: registros.filter((r) => r.acao === "ATUALIZAR" && r.conflitos.length > 0).length,
    ignorados: registros.filter((r) => r.acao === "IGNORAR").length,
    duplicados: registros.filter((r) => r.duplicado).length,
    corrigir: registros.filter((r) => r.acao === "CORRIGIR").length,
    incompletos: registros.filter((r) => (r.acao === "NOVO" || r.acao === "ATUALIZAR") && r.pendencias.length > 0).length,
  };
}
