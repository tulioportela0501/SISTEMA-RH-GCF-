import { z } from "zod";
import { exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { salvarConfigFelicitacoes } from "@/lib/server/felicitacoes";
import { atorDe } from "@/lib/server/ator";

// Dia padrão das felicitações (Início GCF só com mês e ano). Somente administradores.
export const PUT = rota(async (req) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const { dia_padrao, versao } = await lerCorpo(req, z.object({ dia_padrao: z.number().int().min(1, "Escolha um dia entre 1 e 28.").max(28, "Escolha um dia entre 1 e 28."), versao: z.number().int() }));
  return json({ config: await salvarConfigFelicitacoes(dia_padrao, versao, await atorDe(u), u.id) });
});
