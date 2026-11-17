import { z } from "zod";
import { exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { editarEmLote } from "@/lib/server/funcionarios";
import { atorDe } from "@/lib/server/ator";
import { CHAVES_CAMPOS, type CampoChave } from "@/lib/domain/campos";
import { analisarCadastro } from "@/lib/domain/pendencias";

const corpo = z.object({
  ids: z.array(z.number().int().positive()).min(1, "Selecione ao menos um funcionário.").max(2000),
  campo: z.enum(CHAVES_CAMPOS as [CampoChave, ...CampoChave[]]),
  valor: z.string().max(300).nullable(),
});

// Edição em lote: o mesmo valor em um campo de vários funcionários (somente administrador).
export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const { ids, campo, valor } = await lerCorpo(req, corpo);
  const r = await editarEmLote(ids, campo, valor, u, await atorDe(u));
  return json({ funcionarios: r.funcionarios.map((f) => ({ ...f, analise: analisarCadastro(f) })), alterados: r.alterados });
});
