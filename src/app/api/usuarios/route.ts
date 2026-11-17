import { exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { criarUsuario, listarUsuarios, novoUsuarioSchema } from "@/lib/server/usuarios";
import { atorDe } from "@/lib/server/ator";

export const GET = rota(async (req) => {
  await exigirUsuarioApi(req, { perfil: "ADMIN" });
  return json({ usuarios: await listarUsuarios() });
});

export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const dados = await lerCorpo(req, novoUsuarioSchema);
  const id = await criarUsuario(dados, await atorDe(u));
  return json({ id }, 201);
});
