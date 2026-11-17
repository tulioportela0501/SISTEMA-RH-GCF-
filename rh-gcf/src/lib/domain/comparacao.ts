/**
 * Comparação dos 34 campos entre o cadastro do sistema e uma linha da planilha (importação).
 * Diferenças só de formatação não contam (maiúsculas, acentos, espaços, formato do telefone, ano do aniversário).
 * Célula vazia na planilha nunca conta como diferença: a importação não apaga dados.
 */
import { CAMPO_POR_CHAVE, CHAVES_CAMPOS, estadoControle, type CampoChave } from "./campos";
import { normalizarNome } from "@/lib/excel/normalizar";

export type ValoresCampos = Partial<Record<CampoChave, string | null | undefined>>;

const vazio = (v: string | null | undefined) => v == null || String(v).trim() === "";

function digitos(v: string): string {
  return v.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
}

/** Dois valores do mesmo campo representam a mesma informação? */
export function mesmoValorCampo(chave: CampoChave, a: string | null | undefined, b: string | null | undefined): boolean {
  if (vazio(a) || vazio(b)) return vazio(a) && vazio(b);
  const va = String(a).trim();
  const vb = String(b).trim();
  switch (CAMPO_POR_CHAVE[chave].tipo) {
    case "data":
      return va.slice(0, 10) === vb.slice(0, 10);
    case "diames":
      // Aniversários: só o dia e o mês contam
      return va.slice(5, 10) === vb.slice(5, 10);
    case "email":
      return va.toLowerCase() === vb.toLowerCase();
    case "telefone": {
      const da = digitos(va);
      const db = digitos(vb);
      return da && db ? da === db : normalizarNome(va) === normalizarNome(vb);
    }
    case "controle": {
      const ea = estadoControle(va);
      const eb = estadoControle(vb);
      return ea === "Outro" || eb === "Outro" ? normalizarNome(va) === normalizarNome(vb) : ea === eb;
    }
    default:
      return normalizarNome(va) === normalizarNome(vb);
  }
}

/** Campos vazios no sistema que a planilha preenche. */
export function camposACompletar(atual: ValoresCampos, planilha: ValoresCampos): CampoChave[] {
  return CHAVES_CAMPOS.filter((k) => !vazio(planilha[k]) && vazio(atual[k]));
}

/** Campos preenchidos nos dois lados com informações diferentes (só são atualizados com confirmação). */
export function camposDiferentes(atual: ValoresCampos, planilha: ValoresCampos): CampoChave[] {
  return CHAVES_CAMPOS.filter((k) => !vazio(planilha[k]) && !vazio(atual[k]) && !mesmoValorCampo(k, atual[k], planilha[k]));
}
