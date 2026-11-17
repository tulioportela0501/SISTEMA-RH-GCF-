import { z } from "zod";
import { exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { criarFuncionario } from "@/lib/server/funcionarios";
import { funcionariosComAnalise } from "@/lib/server/consultas";
import { funcionarioSchema } from "@/lib/domain/validacao";
import { atorDe } from "@/lib/server/ator";

export const GET = rota(async (req) => {
  await exigirUsuarioApi(req);
  return json({ funcionarios: await funcionariosComAnalise() });
});

export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const { dados, status_vinculo } = await lerCorpo(req, z.object({ dados: funcionarioSchema, status_vinculo: z.enum(["ATIVO", "DESLIGADO"]).default("ATIVO") }));
  const f = await criarFuncionario(dados, status_vinculo, u, await atorDe(u));
  return json({ funcionario: f }, 201);
});
