import { z } from "zod";
import { ErroHttp, exigirUsuarioApi, idDaRota, json, lerCorpo, rota } from "@/lib/server/http";
import { atualizarFuncionario, obterFuncionario } from "@/lib/server/funcionarios";
import { funcionarioSchema } from "@/lib/domain/validacao";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

export const GET = rota<Ctx>(async (req, ctx) => {
  await exigirUsuarioApi(req);
  const f = await obterFuncionario(idDaRota((await ctx.params).id));
  if (!f) throw new ErroHttp(404, "Funcionário não encontrado.");
  return json({ funcionario: f });
});

export const PUT = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req);
  const id = idDaRota((await ctx.params).id);
  const { dados, status_vinculo, versao } = await lerCorpo(
    req,
    z.object({ dados: funcionarioSchema, status_vinculo: z.enum(["ATIVO", "DESLIGADO"]).optional(), versao: z.number().int() }),
  );
  const r = await atualizarFuncionario(id, dados, status_vinculo, versao, u, await atorDe(u));
  return json(r);
});
