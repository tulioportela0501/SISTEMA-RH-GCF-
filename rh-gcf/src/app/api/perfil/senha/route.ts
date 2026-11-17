import { z } from "zod";
import { ErroHttp, exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { conferirSenha, encerrarOutrasSessoes, validarForcaSenha } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import { redefinirSenha } from "@/lib/server/usuarios";
import { atorDe } from "@/lib/server/ator";

const schema = z.object({ senhaAtual: z.string().min(1, "Informe a senha atual.").max(200), novaSenha: z.string().max(200) });

export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const { senhaAtual, novaSenha } = await lerCorpo(req, schema);
  const atual = await queryOne<{ senha_hash: string }>("SELECT senha_hash FROM usuarios WHERE id = $1", [u.id]);
  if (!atual || !(await conferirSenha(atual.senha_hash, senhaAtual))) throw new ErroHttp(422, "A senha atual não confere.");
  const erro = validarForcaSenha(novaSenha);
  if (erro) throw new ErroHttp(422, erro);
  if (senhaAtual === novaSenha) throw new ErroHttp(422, "A nova senha precisa ser diferente da atual.");
  await redefinirSenha(u.id, novaSenha, await atorDe(u), false);
  // Encerra outras sessões abertas do usuário, mantendo a atual
  await encerrarOutrasSessoes(u.id);
  return json({ ok: true });
});
