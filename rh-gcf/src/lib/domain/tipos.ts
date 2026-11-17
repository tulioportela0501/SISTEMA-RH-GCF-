import type { CampoChave } from "./campos";
import type { DataISO } from "./datas";

export type Perfil = "ADMIN" | "USUARIO";
export type StatusVinculo = "ATIVO" | "DESLIGADO";

export type ValoresCampos = { [K in CampoChave]: string | null };

export interface Funcionario extends ValoresCampos {
  id: number;
  status_vinculo: StatusVinculo;
  desligado_em: DataISO | null;
  origem: "MANUAL" | "IMPORTACAO";
  linha_planilha: number | null;
  cor_planilha: string | null;
  versao: number;
  criado_em: string;
  atualizado_em: string;
}

export interface DataComemorativa {
  id: number;
  titulo: string;
  data: DataISO;
  recorrente: boolean;
  categoria: string;
  descricao: string | null;
  ativo: boolean;
  origem: "MANUAL" | "IMPORTACAO";
  linha_planilha: number | null;
  versao: number;
}

export interface DataCliente {
  id: number;
  cliente_nome: string;
  cnpj: string | null;
  tipo_data: string;
  data_evento: DataISO | null;
  inicio_parceria: DataISO | null;
  recorrente: boolean;
  observacoes: string | null;
  situacao_cliente: "ATIVO" | "INATIVO";
  ativo: boolean;
  versao: number;
  /** ID da empresa na planilha geral */
  codigo: string | null;
  tributacao: string | null;
  responsavel_fiscal: string | null;
  responsavel_contabil: string | null;
  responsavel_dp: string | null;
  /** Demais colunas da planilha geral (Grupo, Inscrição Estadual, Prefeitura…) */
  dados_extras: Record<string, string>;
  /** MES = a planilha informa só mês/ano (o dia guardado é 01 e não é exibido) */
  inicio_parceria_precisao: "DIA" | "MES";
  /** Celular com WhatsApp no formato +55DDD9XXXXXXXX */
  whatsapp: string | null;
  /** O cliente não deseja receber mensagens */
  nao_enviar: boolean;
  nao_enviar_motivo: string | null;
}

export interface UsuarioSessao {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
}

export const CATEGORIAS_DATA_COMEMORATIVA = [
  "Data comemorativa",
  "Data profissional",
  "Evento interno",
] as const;

export const TIPOS_DATA_CLIENTE = [
  "Aniversário de parceria",
  "Aniversário de fundação da empresa",
  "Aniversário do sócio ou responsável",
  "Data comemorativa do segmento",
  "Outro",
] as const;
