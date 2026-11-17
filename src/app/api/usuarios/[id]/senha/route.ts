import { exigirUsuarioApi, idDaRota, json, lerCorpo, rota } from "@/lib/server/http";
import { novaSenhaSchema, redefinirSenha } from "@/lib/server/usuarios";
import { encerrarSessoesDoUsuario } from "@/lib/server/auth";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

// Administrador redefine a senha de um usuário.
export const POST = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const id = idDaRota((await ctx.params).id);
  const { senha } = await lerCorpo(req, novaSenhaSchema);
  await redefinirSenha(id, senha, await atorDe(u), true);
  if (id !== u.id) await encerrarSessoesDoUsuario(id);
  return json({ ok: true });
});
