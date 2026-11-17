import { z } from "zod";
import { exigirUsuarioApi, idDaRota, json, lerCorpo, rota } from "@/lib/server/http";
import { alterarStatusVinculo } from "@/lib/server/funcionarios";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

// Desligar / reativar: somente administradores. Fica registrado no histórico.
export const POST = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const id = idDaRota((await ctx.params).id);
  const { status, versao } = await lerCorpo(req, z.object({ status: z.enum(["ATIVO", "DESLIGADO"]), versao: z.number().int() }));
  return json({ funcionario: await alterarStatusVinculo(id, status, versao, await atorDe(u), u.id) });
});
