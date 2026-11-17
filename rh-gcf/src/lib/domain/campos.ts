/**
 * Definição única dos 34 campos da aba "Base" da planilha RH GCF.
 * Formulário, importação, exportação, histórico e pendências usam esta lista.
 */

export type TipoCampo =
  | "texto"
  | "email"
  | "telefone"
  | "data" // data completa (DD/MM/AAAA)
  | "diames" // aniversário: só dia/mês importam (o ano é ignorado)
  | "lista" // valores pré-definidos, preservando valores originais
  | "controle"; // OK | Pendente | Não se aplica (preserva valor original)

export interface CampoDef {
  chave: CampoChave;
  /** Rótulo no formulário */
  label: string;
  /** Cabeçalho original na planilha */
  cabecalho: string;
  /** Coluna original na planilha */
  coluna: string;
  secao: 1 | 2 | 3 | 4;
  tipo: TipoCampo;
  opcoes?: readonly string[];
  obrigatorio?: boolean;
}

export const SITUACOES = ["Efetivo", "Estagiário", "Home office"] as const;
export const MODALIDADES = ["Presencial", "Home Office"] as const;
/** Opções dos cadastros internos. "—" é o valor usado na planilha para "não se aplica". */
export const ESTADOS_CONTROLE = [
  { valor: "OK", label: "OK" },
  { valor: "Pendente", label: "Pendente" },
  { valor: "—", label: "— (não se aplica)" },
] as const;

export const CAMPOS = [
  // Seção 1 — Dados do funcionário
  { chave: "nome", label: "Nome", cabecalho: "Nome", coluna: "A", secao: 1, tipo: "texto", obrigatorio: true },
  { chave: "situacao", label: "Situação", cabecalho: "Situação", coluna: "B", secao: 1, tipo: "lista", opcoes: SITUACOES, obrigatorio: true },
  { chave: "modalidade", label: "Modalidade", cabecalho: "Modalidade", coluna: "C", secao: 1, tipo: "lista", opcoes: MODALIDADES, obrigatorio: true },
  { chave: "admissao", label: "Admissão", cabecalho: "Admissão", coluna: "D", secao: 1, tipo: "data", obrigatorio: true },
  { chave: "nascimento", label: "Nascimento", cabecalho: "Nascimento", coluna: "E", secao: 1, tipo: "diames" },
  { chave: "email", label: "E-mail", cabecalho: "E-mail", coluna: "F", secao: 1, tipo: "email" },
  { chave: "telefone", label: "Telefone", cabecalho: "Telefone", coluna: "G", secao: 1, tipo: "telefone" },
  { chave: "armario", label: "Armário", cabecalho: "Armário", coluna: "H", secao: 1, tipo: "texto" },
  { chave: "contato_emergencia", label: "Contato de emergência", cabecalho: "Contato de emergência", coluna: "I", secao: 1, tipo: "texto" },
  // Seção 2 — Informações familiares
  { chave: "conjuge", label: "Cônjuge", cabecalho: "Cônjuge", coluna: "J", secao: 2, tipo: "texto" },
  { chave: "aniv_conjuge", label: "Aniv. Cônjuge", cabecalho: "Aniv. Cônjuge", coluna: "K", secao: 2, tipo: "diames" },
  { chave: "filho1", label: "Filho 1", cabecalho: "Filho 1", coluna: "L", secao: 2, tipo: "texto" },
  { chave: "aniv_filho1", label: "Aniv. Filho 1", cabecalho: "Aniv. Filho 1", coluna: "M", secao: 2, tipo: "diames" },
  { chave: "filho2", label: "Filho 2", cabecalho: "Filho 2", coluna: "N", secao: 2, tipo: "texto" },
  { chave: "aniv_filho2", label: "Aniv. Filho 2", cabecalho: "Aniv. Filho 2", coluna: "O", secao: 2, tipo: "diames" },
  { chave: "filho3", label: "Filho 3", cabecalho: "Filho 3", coluna: "P", secao: 2, tipo: "texto" },
  { chave: "aniv_filho3", label: "Aniv. Filho 3", cabecalho: "Aniv. Filho 3", coluna: "Q", secao: 2, tipo: "diames" },
  // Seção 3 — Controle de férias
  { chave: "ferias1_inicio", label: "Férias 1 Início", cabecalho: "Férias 1 Início", coluna: "R", secao: 3, tipo: "data" },
  { chave: "ferias1_fim", label: "Férias 1 Fim", cabecalho: "Férias 1 Fim", coluna: "S", secao: 3, tipo: "data" },
  { chave: "ferias2_inicio", label: "Férias 2 Início", cabecalho: "Férias 2 Início", coluna: "T", secao: 3, tipo: "data" },
  { chave: "ferias2_fim", label: "Férias 2 Fim", cabecalho: "Férias 2 Fim", coluna: "U", secao: 3, tipo: "data" },
  // Seção 4 — Controle interno e benefícios
  { chave: "zap_contabil", label: "Zap Contábil", cabecalho: "Zap Contábil", coluna: "V", secao: 4, tipo: "controle" },
  { chave: "cadastro_porta", label: "Cadastro porta", cabecalho: "Cadastro porta", coluna: "W", secao: 4, tipo: "controle" },
  { chave: "planilha_interna", label: "Planilha interna", cabecalho: "Planilha interna", coluna: "X", secao: 4, tipo: "controle" },
  { chave: "ifood", label: "iFood", cabecalho: "iFood", coluna: "Y", secao: 4, tipo: "controle" },
  { chave: "lojinha", label: "Lojinha", cabecalho: "Lojinha", coluna: "Z", secao: 4, tipo: "controle" },
  { chave: "plano_saude", label: "Plano de saúde", cabecalho: "Plano de saúde", coluna: "AA", secao: 4, tipo: "controle" },
  { chave: "farda", label: "Farda", cabecalho: "Farda", coluna: "AB", secao: 4, tipo: "controle" },
  { chave: "botom", label: "Botom", cabecalho: "Botom", coluna: "AC", secao: 4, tipo: "controle" },
  { chave: "aso", label: "ASO", cabecalho: "ASO", coluna: "AD", secao: 4, tipo: "controle" },
  { chave: "coalize", label: "Coalize", cabecalho: "Coalize", coluna: "AE", secao: 4, tipo: "controle" },
  { chave: "sittax", label: "SITTAX", cabecalho: "SITTAX", coluna: "AF", secao: 4, tipo: "controle" },
  { chave: "salvar_documentos", label: "Salvar documentos", cabecalho: "Salvar documentos", coluna: "AG", secao: 4, tipo: "controle" },
  { chave: "dominio", label: "Domínio", cabecalho: "Domínio", coluna: "AH", secao: 4, tipo: "controle" },
] as const;

export type CampoChave = (typeof CAMPOS)[number]["chave"];

export const CAMPOS_LISTA: readonly CampoDef[] = CAMPOS as unknown as readonly CampoDef[];

export const CAMPO_POR_CHAVE: Record<CampoChave, CampoDef> = Object.fromEntries(
  CAMPOS_LISTA.map((c) => [c.chave, c]),
) as Record<CampoChave, CampoDef>;

export const CHAVES_CAMPOS: CampoChave[] = CAMPOS_LISTA.map((c) => c.chave);

export const CAMPOS_OBRIGATORIOS: CampoChave[] = ["nome", "situacao", "modalidade", "admissao"];

export const CAMPOS_CONTROLE: CampoChave[] = CAMPOS_LISTA.filter((c) => c.tipo === "controle").map((c) => c.chave);

export const CAMPOS_DATA: CampoChave[] = CAMPOS_LISTA.filter((c) => c.tipo === "data" || c.tipo === "diames").map(
  (c) => c.chave,
);

export const SECOES: Record<1 | 2 | 3 | 4, { titulo: string; descricao: string }> = {
  1: { titulo: "Dados do funcionário", descricao: "Identificação, vínculo e contatos." },
  2: { titulo: "Informações familiares", descricao: "Nos aniversários, só o dia e o mês são usados." },
  3: { titulo: "Controle de férias", descricao: "Datas reais dos períodos programados." },
  4: { titulo: "Controle interno e benefícios", descricao: "OK, Pendente ou — (não se aplica), como na planilha." },
};

/** Normaliza um valor de controle para o estado exibido. "—" na planilha significa "Não se aplica". */
export function estadoControle(valor: string | null | undefined): "OK" | "Pendente" | "Não se aplica" | "Vazio" | "Outro" {
  if (valor == null) return "Vazio";
  const v = valor.trim();
  if (v === "") return "Vazio";
  const n = v.toLowerCase();
  if (n === "ok") return "OK";
  if (n === "pendente") return "Pendente";
  if (n === "não se aplica" || n === "nao se aplica" || n === "n/a" || n === "na" || /^[—–-]+$/.test(v)) return "Não se aplica";
  return "Outro";
}
