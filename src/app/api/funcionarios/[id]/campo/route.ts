import { z } from "zod";
import { exigirUsuarioApi, idDaRota, json, lerCorpo, rota } from "@/lib/server/http";
import { atualizarCampoFuncionario } from "@/lib/server/funcionarios";
import { atorDe } from "@/lib/server/ator";
import { CHAVES_CAMPOS, type CampoChave } from "@/lib/domain/campos";
import { analisarCadastro } from "@/lib/domain/pendencias";

type Ctx = { params: Promise<{ id: string }> };

const corpo = z.object({
  campo: z.enum(CHAVES_CAMPOS as [CampoChave, ...CampoChave[]]),
  valor: z.string().max(1000).nullable(),
  /** Valor que estava na tela antes da edição */
  anterior: z.string().max(1000).nullable(),
});

// Edição de uma célula da Planilha Geral de Funcionários (mesma permissão de editar o cadastro).
export const PATCH = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req);
  const id = idDaRota((await ctx.params).id);
  const { campo, valor, anterior } = await lerCorpo(req, corpo);
  const r = await atualizarCampoFuncionario(id, campo, valor, anterior, u, await atorDe(u));
  return json({ funcionario: { ...r.funcionario, analise: analisarCadastro(r.funcionario) }, alterado: r.alterado });
});
