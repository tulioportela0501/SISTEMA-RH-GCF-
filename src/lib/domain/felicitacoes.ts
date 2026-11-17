/**
 * Central de Felicitações: aniversários de parceria dos clientes (Início GCF).
 *
 * - Envio MANUAL: o sistema prepara a mensagem e abre o WhatsApp (link oficial wa.me); o funcionário envia.
 * - Etapas: Pendente (sem registro) → Felicitação preparada (mensagem e imagem prontas) → WhatsApp aberto →
 *   Enviado (só quando o funcionário confirma). Também há "Não enviar".
 * - Uma felicitação por cliente e aniversário (ano).
 * - Clientes inativos não aparecem; quem não deseja receber mensagens fica como "Não enviar".
 * - Nada é inventado: sem Início GCF não há aniversário; sem WhatsApp válido a mensagem não é preparada.
 */
import { formatarData, partes, diferencaDias, MESES, type DataISO } from "./datas";
import { chaveTipo, clienteAtivo, formatarInicioGcf, TIPO_PARCERIA } from "./clientes";
import { referenciaParceria } from "./eventos";
import { normalizarWhatsapp } from "./whatsapp";
import type { DataCliente } from "./tipos";
import { normalizarNome } from "@/lib/excel/normalizar";

export type StatusFelicitacao = "PENDENTE" | "PREPARADO" | "ABERTO" | "ENVIADO" | "NAO_ENVIAR";

export const STATUS_FELICITACAO: Record<StatusFelicitacao, string> = {
  PENDENTE: "Pendente",
  PREPARADO: "Felicitação preparada",
  ABERTO: "WhatsApp aberto",
  ENVIADO: "Enviado",
  NAO_ENVIAR: "Não enviar",
};

/** Etapas que ainda aguardam a confirmação do envio. */
export const STATUS_PENDENTES: readonly StatusFelicitacao[] = ["PENDENTE", "PREPARADO", "ABERTO"];

export interface RegistroFelicitacao {
  id: number;
  data_cliente_id: number | null;
  cliente_nome: string;
  cnpj: string | null;
  ano: number;
  anos_parceria: number;
  inicio_gcf: string;
  data_felicitacao: DataISO;
  status: Exclude<StatusFelicitacao, "PENDENTE">;
  canal: string;
  whatsapp: string | null;
  mensagem: string | null;
  modelo_id: number | null;
  motivo: string | null;
  preparado_em: string | null;
  preparado_por_nome: string | null;
  whatsapp_aberto_em: string | null;
  whatsapp_aberto_por_nome: string | null;
  com_imagem: boolean;
  enviado_em: string | null;
  enviado_por_nome: string | null;
  versao: number;
}

export interface ModeloFelicitacao {
  id: number;
  nome: string;
  texto: string;
  padrao: boolean;
  ativo: boolean;
  versao: number;
}

export interface AniversarioParceria {
  chave: string;
  dataCliente: DataCliente;
  ano: number;
  /** Anos de parceria completados neste aniversário */
  anos: number;
  /** Dia da felicitação (dia real ou o dia padrão configurado) */
  data: DataISO;
  dias: number;
  inicioGcf: string;
  status: StatusFelicitacao;
  registro: RegistroFelicitacao | null;
  /** WhatsApp válido (+55…) ou null */
  whatsapp: string | null;
  /** O que impede preparar a mensagem (null = pode preparar) */
  bloqueio: string | null;
}

/** Cliente com aniversário de parceria (tipo "Aniversário de parceria" e Início GCF informado). */
export function ehClienteParceria(d: Pick<DataCliente, "tipo_data" | "inicio_parceria">): boolean {
  return !!d.inicio_parceria && chaveTipo(d.tipo_data) === chaveTipo(TIPO_PARCERIA);
}

export function chaveFelicitacao(dataClienteId: number, ano: number): string {
  return `${dataClienteId}-${ano}`;
}

/** Aniversário de parceria do cliente no ano (null antes de completar 1 ano). */
export function aniversarioNoAno(d: DataCliente, ano: number, diaPadrao: number): { data: DataISO; anos: number } | null {
  const ref = referenciaParceria(d, diaPadrao);
  if (!ref) return null;
  const inicio = partes(ref);
  const anos = ano - inicio.ano;
  if (anos < 1) return null;
  return { data: `${ano}-${ref.slice(5, 7)}-${ref.slice(8, 10)}`, anos };
}

function bloqueioDe(d: DataCliente, whatsapp: string | null): string | null {
  if (d.nao_enviar) return `O cliente não deseja receber mensagens${d.nao_enviar_motivo ? ` (${d.nao_enviar_motivo})` : ""}`;
  if (!d.whatsapp) return "Sem WhatsApp cadastrado";
  if (!whatsapp) return "WhatsApp inválido";
  return null;
}

/**
 * Aniversários de parceria entre duas datas (inclusive), com o status de cada felicitação.
 * Clientes inativos e eventos desativados não entram.
 */
export function aniversariosNoPeriodo(
  datas: DataCliente[],
  registros: RegistroFelicitacao[],
  inicio: DataISO,
  fim: DataISO,
  hoje: DataISO,
  diaPadrao: number,
): AniversarioParceria[] {
  const porChave = new Map(registros.filter((r) => r.data_cliente_id != null).map((r) => [chaveFelicitacao(r.data_cliente_id!, r.ano), r]));
  const lista: AniversarioParceria[] = [];
  for (const d of datas) {
    if (!ehClienteParceria(d) || !clienteAtivo(d)) continue;
    for (let ano = partes(inicio).ano; ano <= partes(fim).ano; ano++) {
      const a = aniversarioNoAno(d, ano, diaPadrao);
      if (!a || a.data < inicio || a.data > fim) continue;
      const registro = porChave.get(chaveFelicitacao(d.id, ano)) ?? null;
      const whatsapp = normalizarWhatsapp(d.whatsapp);
      const status: StatusFelicitacao = registro?.status ?? (d.nao_enviar ? "NAO_ENVIAR" : "PENDENTE");
      lista.push({
        chave: chaveFelicitacao(d.id, ano),
        dataCliente: d,
        ano,
        anos: a.anos,
        data: a.data,
        dias: diferencaDias(hoje, a.data),
        inicioGcf: formatarInicioGcf(d.inicio_parceria, d.inicio_parceria_precisao),
        status,
        registro,
        whatsapp,
        bloqueio: bloqueioDe(d, whatsapp),
      });
    }
  }
  return lista.sort((x, y) => (x.data === y.data ? x.dataCliente.cliente_nome.localeCompare(y.dataCliente.cliente_nome, "pt-BR") : x.data < y.data ? -1 : 1));
}

export function pendente(a: Pick<AniversarioParceria, "status">): boolean {
  return STATUS_PENDENTES.includes(a.status);
}

export interface ResumoFelicitacoes {
  aniversariantes: number;
  pendentes: number;
  enviadas: number;
  naoEnviar: number;
  /** Aniversariantes pendentes sem WhatsApp válido */
  semWhatsapp: number;
}

export function resumirFelicitacoes(lista: AniversarioParceria[]): ResumoFelicitacoes {
  return {
    aniversariantes: lista.length,
    pendentes: lista.filter(pendente).length,
    enviadas: lista.filter((a) => a.status === "ENVIADO").length,
    naoEnviar: lista.filter((a) => a.status === "NAO_ENVIAR").length,
    semWhatsapp: lista.filter((a) => pendente(a) && !a.whatsapp).length,
  };
}

/** Filtro de status da Central: um status, "pendentes" (tudo que ainda não foi confirmado) ou "todos". */
export type FiltroStatusFelicitacao = StatusFelicitacao | "pendentes" | "todos";

export function filtrarFelicitacoes(lista: AniversarioParceria[], f: { status?: FiltroStatusFelicitacao | null; busca?: string | null }): AniversarioParceria[] {
  const termo = normalizarNome(f.busca);
  const digitos = (f.busca ?? "").replace(/\D/g, "");
  return lista.filter((a) => {
    if (f.status === "pendentes" && !pendente(a)) return false;
    if (f.status && f.status !== "todos" && f.status !== "pendentes" && a.status !== f.status) return false;
    if (!termo) return true;
    return normalizarNome(a.dataCliente.cliente_nome).includes(termo) || (!!digitos && (a.dataCliente.cnpj ?? "").replace(/\D/g, "").includes(digitos));
  });
}

// ---------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------

export const VARIAVEIS_FELICITACAO = {
  empresa: "Nome ou razão social do cliente",
  anos: "Anos de parceria completados",
  data: "Data da felicitação (DD/MM/AAAA)",
  inicio: "Início GCF (MM/AAAA)",
} as const;
export type VariavelFelicitacao = keyof typeof VARIAVEIS_FELICITACAO;

export function valoresMensagem(a: Pick<AniversarioParceria, "anos" | "data" | "inicioGcf"> & { empresa: string }): Record<VariavelFelicitacao, string | null> {
  return { empresa: a.empresa.trim() || null, anos: a.anos >= 1 ? String(a.anos) : null, data: formatarData(a.data), inicio: a.inicioGcf || null };
}

/**
 * Substitui as variáveis do modelo. "{anos} anos" com 1 ano vira "1 ano".
 * Variáveis sem valor ou desconhecidas ficam listadas e impedem o uso da mensagem.
 */
export function montarMensagem(texto: string, valores: Record<VariavelFelicitacao, string | null>): { texto: string; faltando: string[] } {
  const faltando: string[] = [];
  let final = texto.replace(/\{anos\}(\s+)anos\b/gi, (todo, espaco: string) => (valores.anos ? `${valores.anos}${espaco}${valores.anos === "1" ? "ano" : "anos"}` : todo));
  final = final.replace(/\{([^{}\s]{1,30})\}/g, (todo, nome: string) => {
    const v = nome.toLowerCase();
    const valor = v in VARIAVEIS_FELICITACAO ? valores[v as VariavelFelicitacao] : null;
    if (valor) return valor;
    if (!faltando.includes(todo)) faltando.push(todo);
    return todo;
  });
  return { texto: final, faltando };
}

/** Variáveis ainda sem substituir na mensagem (ex.: o funcionário apagou um valor e deixou "{empresa}"). */
export function variaveisPendentes(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{[^{}\s]{1,30}\}/g)].map((m) => m[0]))];
}

export function nomeDoMes(mes: number): string {
  const n = MESES[mes - 1];
  return n.charAt(0).toUpperCase() + n.slice(1);
}
