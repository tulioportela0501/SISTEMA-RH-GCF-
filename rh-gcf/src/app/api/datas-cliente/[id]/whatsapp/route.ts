import { z } from "zod";
import { exigirUsuarioApi, idDaRota, json, lerCorpo, rota } from "@/lib/server/http";
import { salvarWhatsappCliente } from "@/lib/server/felicitacoes";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

// Edição rápida do WhatsApp do cliente (Central de Felicitações).
export const PATCH = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req);
  const id = idDaRota((await ctx.params).id);
  const { whatsapp, versao } = await lerCorpo(req, z.object({ whatsapp: z.string().trim().max(40).nullable(), versao: z.number().int() }));
  return json({ data: await salvarWhatsappCliente(id, whatsapp || null, versao, await atorDe(u), u.id) });
});
