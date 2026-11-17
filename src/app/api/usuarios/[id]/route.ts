import { exigirUsuarioApi, idDaRota, json, lerCorpo, rota } from "@/lib/server/http";
import { edicaoUsuarioSchema, editarUsuario } from "@/lib/server/usuarios";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const id = idDaRota((await ctx.params).id);
  await editarUsuario(id, await lerCorpo(req, edicaoUsuarioSchema), u.id, await atorDe(u));
  return json({ ok: true });
});
