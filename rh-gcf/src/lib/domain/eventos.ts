/**
 * Geração automática de eventos (substitui as abas "aux" e "Calendário" da planilha).
 *
 * - Aniversários (empresa, funcionário, cônjuge, filhos) se repetem todo ano pelo dia/mês.
 * - Férias usam as datas reais, sem repetição anual.
 * - Funcionários desligados não geram eventos (salvo quando pedido explicitamente).
 */
import {
  dataNormalizada,
  diasNoMes,
  diferencaDias,
  formatarData,
  montar,
  partes,
  type DataISO,
} from "./datas";
import type { DataCliente, DataComemorativa, StatusVinculo } from "./tipos";

export type TipoEvento =
  | "ANIV_EMPRESA"
  | "ADMISSAO"
  | "ANIV_FUNCIONARIO"
  | "ANIV_CONJUGE"
  | "ANIV_FILHO"
  | "FERIAS_INICIO"
  | "FERIAS_FIM"
  | "DATA_COMEMORATIVA"
  | "DATA_CLIENTE"
  | "ANIV_PARCERIA";

export type GrupoEvento = "aniversario" | "empresa" | "familia" | "ferias" | "escritorio" | "cliente";

export const GRUPOS: Record<GrupoEvento, string> = {
  aniversario: "Aniversários",
  empresa: "Tempo de casa",
  familia: "Familiares",
  ferias: "Férias",
  escritorio: "Escritório",
  cliente: "Clientes",
};

export interface Evento {
  chave: string;
  tipo: TipoEvento;
  tipoLabel: string;
  grupo: GrupoEvento;
  data: DataISO;
  dias: number;
  titulo: string;
  detalhe: string | null;
  origem: { tipo: "funcionario" | "data_comemorativa" | "data_cliente"; id: number };
  modalidade?: string | null;
  situacao?: string | null;
}

/** Subconjunto do funcionário necessário para gerar eventos. */
export interface FuncionarioEventos {
  id: number;
  nome: string | null;
  situacao: string | null;
  modalidade: string | null;
  status_vinculo: StatusVinculo;
  admissao: string | null;
  nascimento: string | null;
  conjuge?: string | null;
  aniv_conjuge?: string | null;
  filho1?: string | null;
  aniv_filho1?: string | null;
  filho2?: string | null;
  aniv_filho2?: string | null;
  filho3?: string | null;
  aniv_filho3?: string | null;
  ferias1_inicio: string | null;
  ferias1_fim: string | null;
  ferias2_inicio: string | null;
  ferias2_fim: string | null;
}

export interface FontesEventos {
  funcionarios: FuncionarioEventos[];
  datasComemorativas: DataComemorativa[];
  datasCliente: DataCliente[];
  /** Dia do mês das felicitações quando o Início GCF tem só mês e ano (padrão 1) */
  diaFelicitacao?: number;
}

/** Data de referência do aniversário de parceria: o dia real ou, com só mês e ano, o dia padrão. */
export function referenciaParceria(d: Pick<DataCliente, "inicio_parceria" | "inicio_parceria_precisao">, diaPadrao = 1): DataISO | null {
  if (!d.inicio_parceria) return null;
  if (d.inicio_parceria_precisao !== "MES") return d.inicio_parceria;
  const { ano, mes } = partes(d.inicio_parceria);
  return montar(ano, mes, Math.min(Math.max(1, diaPadrao), diasNoMes(ano, mes)));
}

export interface OpcoesEventos {
  /** Incluir funcionários desligados (usado só na conferência com a planilha). */
  incluirDesligados?: boolean;
}

interface Base {
  tipo: TipoEvento;
  tipoLabel: string;
  grupo: GrupoEvento;
  titulo: string;
  detalhe: string | null;
  origem: Evento["origem"];
  modalidade?: string | null;
  situacao?: string | null;
  sufixo: string;
}

/** Uma regra de ocorrência: anual (dia/mês de uma data de referência) ou data única. */
type Regra =
  | { tipo: "anual"; referencia: DataISO; base: Base; detalheAnual?: (anos: number, ano: number) => { detalhe: string | null; tipo?: TipoEvento; tipoLabel?: string } | null }
  | { tipo: "unica"; data: DataISO; base: Base };

function anosLabel(n: number, sufixo: string): string {
  return `${n} ${n === 1 ? "ano" : "anos"} ${sufixo}`;
}

function regrasFuncionario(f: FuncionarioEventos): Regra[] {
  const nome = (f.nome ?? "").trim() || "(sem nome)";
  const comum = {
    titulo: nome,
    origem: { tipo: "funcionario" as const, id: f.id },
    modalidade: f.modalidade,
    situacao: f.situacao,
  };
  const regras: Regra[] = [];

  if (f.admissao) {
    const admissao = f.admissao;
    regras.push({
      tipo: "anual",
      referencia: admissao,
      base: { ...comum, tipo: "ANIV_EMPRESA", tipoLabel: "Aniversário de empresa", grupo: "empresa", detalhe: null, sufixo: "" },
      detalheAnual: (anos) => {
        if (anos < 0) return null;
        if (anos === 0) return { detalhe: "Início na empresa", tipo: "ADMISSAO", tipoLabel: "Admissão" };
        return { detalhe: `${anos} ${anos === 1 ? "ano" : "anos"}` };
      },
    });
  }
  if (f.nascimento) {
    regras.push({
      tipo: "anual",
      referencia: f.nascimento,
      base: { ...comum, tipo: "ANIV_FUNCIONARIO", tipoLabel: "Aniversário do funcionário", grupo: "aniversario", detalhe: null, sufixo: "" },
    });
  }
  {
    if (f.aniv_conjuge) {
      regras.push({
        tipo: "anual",
        referencia: f.aniv_conjuge,
        base: { ...comum, tipo: "ANIV_CONJUGE", tipoLabel: "Aniversário do cônjuge", grupo: "familia", detalhe: f.conjuge?.trim() || null, sufixo: "" },
      });
    }
    const filhos: [string | null | undefined, string | null | undefined, number][] = [
      [f.filho1, f.aniv_filho1, 1],
      [f.filho2, f.aniv_filho2, 2],
      [f.filho3, f.aniv_filho3, 3],
    ];
    for (const [nomeFilho, aniv, n] of filhos) {
      if (!aniv) continue;
      regras.push({
        tipo: "anual",
        referencia: aniv,
        base: { ...comum, tipo: "ANIV_FILHO", tipoLabel: "Aniversário de filho(a)", grupo: "familia", detalhe: nomeFilho?.trim() || null, sufixo: String(n) },
      });
    }
  }
  const periodos: [string | null, string | null, number][] = [
    [f.ferias1_inicio, f.ferias1_fim, 1],
    [f.ferias2_inicio, f.ferias2_fim, 2],
  ];
  for (const [ini, fim, n] of periodos) {
    if (ini) {
      regras.push({
        tipo: "unica",
        data: ini,
        base: { ...comum, tipo: "FERIAS_INICIO", tipoLabel: "Início de férias", grupo: "ferias", detalhe: `${n}º período${fim ? `, até ${formatarData(fim)}` : ""}`, sufixo: String(n) },
      });
    }
    if (fim) {
      regras.push({
        tipo: "unica",
        data: fim,
        base: { ...comum, tipo: "FERIAS_FIM", tipoLabel: "Fim de férias", grupo: "ferias", detalhe: `${n}º período${ini ? `, desde ${formatarData(ini)}` : ""}`, sufixo: String(n) },
      });
    }
  }
  return regras;
}

function regraDataComemorativa(d: DataComemorativa): Regra {
  const base: Base = {
    tipo: "DATA_COMEMORATIVA",
    tipoLabel: d.categoria || "Data comemorativa",
    grupo: "escritorio",
    titulo: d.titulo,
    detalhe: d.descricao,
    origem: { tipo: "data_comemorativa", id: d.id },
    sufixo: "",
  };
  return d.recorrente ? { tipo: "anual", referencia: d.data, base } : { tipo: "unica", data: d.data, base };
}

export function ehAniversarioParceria(d: Pick<DataCliente, "tipo_data" | "data_evento" | "inicio_parceria">): boolean {
  return !!d.inicio_parceria && (d.tipo_data.trim().toLowerCase() === "aniversário de parceria" || !d.data_evento);
}

function regraDataCliente(d: DataCliente, diaPadrao: number): Regra {
  const base: Base = {
    tipo: "DATA_CLIENTE",
    tipoLabel: d.tipo_data,
    grupo: "cliente",
    titulo: d.cliente_nome,
    detalhe: d.observacoes,
    origem: { tipo: "data_cliente", id: d.id },
    sufixo: "",
  };
  if (ehAniversarioParceria(d)) {
    return {
      tipo: "anual",
      referencia: referenciaParceria(d, diaPadrao)!,
      base: { ...base, tipo: "ANIV_PARCERIA", tipoLabel: "Aniversário de parceria" },
      detalheAnual: (anos) => {
        if (anos < 0) return null;
        if (anos === 0) return { detalhe: "Início da parceria com o Grupo Conceito Fiscal" };
        return { detalhe: anosLabel(anos, "com o Grupo Conceito Fiscal") };
      },
    };
  }
  // Quando há data de início da parceria, o detalhe informa há quanto tempo é cliente.
  const detalheParceria = (ano: number): string | null => {
    if (!d.inicio_parceria) return d.observacoes;
    const anos = ano - partes(d.inicio_parceria).ano;
    const txt = anos >= 1 ? `Cliente do GCF há ${anos} ${anos === 1 ? "ano" : "anos"}` : null;
    return [txt, d.observacoes].filter(Boolean).join(". ") || null;
  };
  if (d.recorrente) {
    return {
      tipo: "anual",
      referencia: d.data_evento!,
      base,
      detalheAnual: (anos, ano) => (anos < 0 ? null : { detalhe: detalheParceria(ano) }),
    };
  }
  return { tipo: "unica", data: d.data_evento!, base: { ...base, detalhe: detalheParceria(partes(d.data_evento!).ano) } };
}

function coletarRegras(fontes: FontesEventos, opcoes: OpcoesEventos): Regra[] {
  const regras: Regra[] = [];
  for (const f of fontes.funcionarios) {
    if (f.status_vinculo === "DESLIGADO" && !opcoes.incluirDesligados) continue;
    regras.push(...regrasFuncionario(f));
  }
  for (const d of fontes.datasComemorativas) {
    if (!d.ativo) continue;
    regras.push(regraDataComemorativa(d));
  }
  for (const d of fontes.datasCliente) {
    if (!d.ativo || d.situacao_cliente !== "ATIVO") continue;
    if (!d.data_evento && !d.inicio_parceria) continue;
    regras.push(regraDataCliente(d, fontes.diaFelicitacao ?? 1));
  }
  return regras;
}

function montarEvento(r: Regra, data: DataISO, hoje: DataISO, extra?: { detalhe: string | null; tipo?: TipoEvento; tipoLabel?: string }): Evento {
  const b = r.base;
  const tipo = extra?.tipo ?? b.tipo;
  const detalhe = extra ? extra.detalhe : b.detalhe;
  return {
    chave: `${b.origem.tipo}:${b.origem.id}:${b.tipo}${b.sufixo}:${data}`,
    tipo,
    tipoLabel: extra?.tipoLabel ?? b.tipoLabel,
    grupo: b.grupo,
    data,
    dias: diferencaDias(hoje, data),
    titulo: b.titulo,
    detalhe,
    origem: b.origem,
    modalidade: b.modalidade,
    situacao: b.situacao,
  };
}

function ordenar(eventos: Evento[]): Evento[] {
  return eventos.sort((a, b) => (a.data === b.data ? a.titulo.localeCompare(b.titulo, "pt-BR") : a.data < b.data ? -1 : 1));
}

/** Todos os eventos que caem entre inicio e fim (inclusive). Usado no dashboard e no calendário. */
export function eventosNoPeriodo(fontes: FontesEventos, inicio: DataISO, fim: DataISO, hoje: DataISO, opcoes: OpcoesEventos = {}): Evento[] {
  const eventos: Evento[] = [];
  const anoIni = partes(inicio).ano;
  const anoFim = partes(fim).ano;
  for (const r of coletarRegras(fontes, opcoes)) {
    if (r.tipo === "unica") {
      if (r.data >= inicio && r.data <= fim) eventos.push(montarEvento(r, r.data, hoje));
      continue;
    }
    const ref = partes(r.referencia);
    for (let ano = anoIni; ano <= anoFim; ano++) {
      const data = dataNormalizada(ano, ref.mes, ref.dia);
      if (data < inicio || data > fim) continue;
      if (r.detalheAnual) {
        const extra = r.detalheAnual(ano - ref.ano, ano);
        if (!extra) continue;
        eventos.push(montarEvento(r, data, hoje, extra));
      } else {
        eventos.push(montarEvento(r, data, hoje));
      }
    }
  }
  return ordenar(eventos);
}

/**
 * Próxima ocorrência de cada evento a partir de hoje (mesma regra da aba Calendário):
 * aniversários → este ano se ainda não passou, senão o próximo; férias → só se a data ainda não passou.
 */
export function proximasOcorrencias(fontes: FontesEventos, hoje: DataISO, opcoes: OpcoesEventos = {}): Evento[] {
  const eventos: Evento[] = [];
  const anoHoje = partes(hoje).ano;
  for (const r of coletarRegras(fontes, opcoes)) {
    if (r.tipo === "unica") {
      if (r.data >= hoje) eventos.push(montarEvento(r, r.data, hoje));
      continue;
    }
    const ref = partes(r.referencia);
    let data = dataNormalizada(anoHoje, ref.mes, ref.dia);
    if (data < hoje) data = dataNormalizada(anoHoje + 1, ref.mes, ref.dia);
    if (r.detalheAnual) {
      const extra = r.detalheAnual(partes(data).ano - ref.ano, partes(data).ano);
      if (!extra) continue;
      eventos.push(montarEvento(r, data, hoje, extra));
    } else {
      eventos.push(montarEvento(r, data, hoje));
    }
  }
  return ordenar(eventos);
}
