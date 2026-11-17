import { CAMPO_POR_CHAVE, CAMPOS_OBRIGATORIOS, SITUACOES, MODALIDADES, type CampoChave } from "./campos";
import type { ValoresCampos } from "./tipos";

export interface Pendencia {
  campo: CampoChave;
  label: string;
  motivo: string;
}

export interface AnaliseCadastro {
  basicoCompleto: boolean;
  faltandoBasico: CampoChave[];
  pendencias: Pendencia[];
  /** COMPLETO, INCOMPLETO (falta informação) ou BASICO_INCOMPLETO (falta campo obrigatório) */
  nivel: "COMPLETO" | "INCOMPLETO" | "BASICO_INCOMPLETO";
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function vazio(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

/**
 * Situação do cadastro.
 *
 * Incompleto quando falta:
 * - um dos obrigatórios (Nome, Situação, Modalidade, Admissão) → "cadastro básico incompleto";
 * - Nascimento, E-mail, Telefone ou Contato de emergência;
 * - o aniversário de um cônjuge/filho informado (ou o nome de um aniversário informado);
 * - a data de início ou de fim de um período de férias já começado a preencher.
 * Não contam: cônjuge, filhos, segundo período de férias e armário vazios (nem todos têm),
 * nem os cadastros internos (OK / Pendente / —), que têm situação própria.
 */
export function analisarCadastro(f: Partial<ValoresCampos>): AnaliseCadastro {
  const faltandoBasico = CAMPOS_OBRIGATORIOS.filter((c) => vazio(f[c]));
  const pendencias: Pendencia[] = [];
  const add = (campo: CampoChave, motivo: string) => pendencias.push({ campo, label: CAMPO_POR_CHAVE[campo].label, motivo });

  for (const c of faltandoBasico) add(c, "Campo obrigatório");

  if (!vazio(f.situacao) && !(SITUACOES as readonly string[]).includes(f.situacao!.trim())) add("situacao", `Valor "${f.situacao}" fora das opções da planilha`);
  if (!vazio(f.modalidade) && !(MODALIDADES as readonly string[]).includes(f.modalidade!.trim())) add("modalidade", `Valor "${f.modalidade}" fora das opções da planilha`);

  if (vazio(f.nascimento)) add("nascimento", "Não preenchido");
  if (vazio(f.email)) add("email", "Não preenchido");
  else if (!RE_EMAIL.test(f.email!.trim())) add("email", "Formato inválido");
  if (vazio(f.telefone)) add("telefone", "Não preenchido");
  if (vazio(f.contato_emergencia)) add("contato_emergencia", "Não preenchido");

  const familia: [CampoChave, CampoChave][] = [
    ["conjuge", "aniv_conjuge"],
    ["filho1", "aniv_filho1"],
    ["filho2", "aniv_filho2"],
    ["filho3", "aniv_filho3"],
  ];
  for (const [nome, aniv] of familia) {
    if (!vazio(f[nome]) && vazio(f[aniv])) add(aniv, `Falta o aniversário de ${f[nome]}`);
    if (vazio(f[nome]) && !vazio(f[aniv])) add(nome, "Aniversário preenchido sem o nome");
  }

  const ferias: [CampoChave, CampoChave][] = [
    ["ferias1_inicio", "ferias1_fim"],
    ["ferias2_inicio", "ferias2_fim"],
  ];
  for (const [ini, fim] of ferias) {
    if (!vazio(f[ini]) && vazio(f[fim])) add(fim, "Período sem data de fim");
    if (vazio(f[ini]) && !vazio(f[fim])) add(ini, "Período sem data de início");
    if (!vazio(f[ini]) && !vazio(f[fim]) && f[fim]! < f[ini]!) add(fim, "Fim anterior ao início");
  }

  const basicoCompleto = faltandoBasico.length === 0;
  return {
    basicoCompleto,
    faltandoBasico,
    pendencias,
    nivel: !basicoCompleto ? "BASICO_INCOMPLETO" : pendencias.length > 0 ? "INCOMPLETO" : "COMPLETO",
  };
}

/** Aviso exibido quando falta um campo obrigatório. */
export function mensagemCadastroIncompleto(campo: CampoChave): string {
  return `Cadastro incompleto! É necessário preencher o campo ${CAMPO_POR_CHAVE[campo].label}.`;
}
