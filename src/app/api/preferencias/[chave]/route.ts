import { exigirUsuarioApi, json, rota } from "@/lib/server/http";
import { apagarPreferencia, salvarPreferencia } from "@/lib/server/preferencias";

type Ctx = { params: Promise<{ chave: string }> };

// Preferências de visualização do próprio usuário (ex.: colunas da Planilha Geral de Funcionários).
export const PUT = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req);
  const corpo = await req.json().catch(() => null);
  return json({ valor: await salvarPreferencia(u.id, (await ctx.params).chave, corpo?.valor) });
});

export const DELETE = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req);
  await apagarPreferencia(u.id, (await ctx.params).chave);
  return json({ ok: true });
});
