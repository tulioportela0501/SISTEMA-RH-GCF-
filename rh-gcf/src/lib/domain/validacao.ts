import { z } from "zod";
import { CAMPOS_LISTA, CAMPOS_OBRIGATORIOS, type CampoChave } from "./campos";
import { isDataISO } from "./datas";
import { mensagemCadastroIncompleto } from "./pendencias";
import type { ValoresCampos } from "./tipos";

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(max: number, label: string) {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null ? null : v.trim() === "" ? null : v.trim()))
    .refine((v) => v == null || v.length <= max, { message: `${label}: máximo de ${max} caracteres.` });
}

function campoSchema(chave: CampoChave) {
  const def = CAMPOS_LISTA.find((c) => c.chave === chave)!;
  switch (def.tipo) {
    case "data":
    case "diames":
      return texto(10, def.label).refine((v) => v == null || isDataISO(v), { message: `${def.label}: data inválida.` });
    case "email":
      return texto(200, def.label).refine((v) => v == null || RE_EMAIL.test(v), { message: "E-mail inválido. Use o formato nome@dominio.com." });
    case "lista":
      return texto(60, def.label);
    case "controle":
      return texto(100, def.label);
    case "telefone":
      return texto(120, def.label);
    default:
      return texto(chave === "contato_emergencia" ? 1000 : 300, def.label);
  }
}

const formato = Object.fromEntries(CAMPOS_LISTA.map((c) => [c.chave, campoSchema(c.chave)])) as {
  [K in CampoChave]: ReturnType<typeof campoSchema>;
};

/** Valida e normaliza um único campo (edição na célula ou em lote). Valor vazio vira null. */
export function validarCampo(chave: CampoChave, valor: unknown): string | null {
  return formato[chave].parse(valor) as string | null;
}

/** Todos os 34 campos opcionais; valores vazios viram null. */
export const funcionarioSchema = z.object(formato).partial().strict();

export type FuncionarioEntrada = Partial<ValoresCampos>;

/**
 * Regras dos campos obrigatórios.
 * - Novo cadastro: exige Nome, Situação, Modalidade e Data de admissão.
 * - Edição: não deixa apagar um obrigatório que já estava preenchido; registros antigos
 *   importados incompletos podem ser salvos, mas continuam sinalizados como incompletos.
 */
export function conferirObrigatorios(
  valores: Partial<ValoresCampos>,
  modo: "criacao" | "edicao",
  anterior?: Partial<ValoresCampos>,
): { campo: CampoChave; mensagem: string } | null {
  for (const campo of CAMPOS_OBRIGATORIOS) {
    const vazio = valores[campo] == null || String(valores[campo]).trim() === "";
    if (!vazio) continue;
    if (modo === "criacao") return { campo, mensagem: mensagemCadastroIncompleto(campo) };
    const antes = anterior?.[campo];
    const estavaPreenchido = antes != null && String(antes).trim() !== "";
    if (estavaPreenchido || campo === "nome") return { campo, mensagem: mensagemCadastroIncompleto(campo) };
  }
  return null;
}
