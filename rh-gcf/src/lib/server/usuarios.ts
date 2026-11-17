import "server-only";
import { z } from "zod";
import { query, queryOne, transacao } from "./db";
import { ErroHttp } from "./http";
import { registrar, type Ator } from "./historico";
import { encerrarSessoesDoUsuario, gerarHashSenha, validarForcaSenha } from "./auth";
import type { Perfil } from "@/lib/domain/tipos";

export interface UsuarioLista {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
  ativo: boolean;
  ultimo_login_em: Date | null;
  bloqueado_ate: Date | null;
}

const senhaSchema = z.string().superRefine((v, ctx) => {
  const erro = validarForcaSenha(v);
  if (erro) ctx.addIssue({ code: "custom", message: erro });
});

export const novoUsuarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "O login precisa ter pelo menos 3 caracteres.")
    .max(120)
    .regex(/^[a-z0-9._@-]+$/, "Use apenas letras, números, ponto, hífen, sublinhado ou @."),
  perfil: z.enum(["ADMIN", "USUARIO"]),
  senha: senhaSchema,
});

export const edicaoUsuarioSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  perfil: z.enum(["ADMIN", "USUARIO"]),
  ativo: z.boolean(),
});

export const novaSenhaSchema = z.object({ senha: senhaSchema });

export async function listarUsuarios(): Promise<UsuarioLista[]> {
  return query<UsuarioLista>(
    "SELECT id, nome, login, perfil, ativo, ultimo_login_em, bloqueado_ate FROM usuarios ORDER BY lower(nome)",
  );
}

export async function criarUsuario(e: z.infer<typeof novoUsuarioSchema>, ator: Ator): Promise<number> {
  const existe = await queryOne("SELECT 1 FROM usuarios WHERE login = $1", [e.login]);
  if (existe) throw new ErroHttp(409, "Já existe um usuário com este login.");
  const hash = await gerarHashSenha(e.senha);
  return transacao(async (c) => {
    const r = await c.query<{ id: number }>(
      `INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES ($1,$2,$3,$4) RETURNING id`,
      [e.nome, e.login, hash, e.perfil],
    );
    await registrar(c, ator, [
      {
        operacao: "USUARIO",
        entidade: "USUARIO",
        entidadeId: r.rows[0].id,
        registroNome: e.nome,
        descricao: `${ator.nome} criou o usuário ${e.login} com perfil ${e.perfil === "ADMIN" ? "Administrador" : "Usuário"}.`,
      },
    ]);
    return r.rows[0].id;
  });
}

export async function editarUsuario(id: number, e: z.infer<typeof edicaoUsuarioSchema>, atorId: number, ator: Ator): Promise<void> {
  await transacao(async (c) => {
    const atual = (await c.query<UsuarioLista>("SELECT * FROM usuarios WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Usuário não encontrado.");
    if (id === atorId && (e.perfil !== "ADMIN" || !e.ativo)) throw new ErroHttp(422, "Você não pode remover seu próprio acesso de administrador.");
    if (atual.perfil === "ADMIN" && (e.perfil !== "ADMIN" || !e.ativo)) {
      const outros = await c.query("SELECT 1 FROM usuarios WHERE perfil = 'ADMIN' AND ativo AND id <> $1", [id]);
      if (outros.rowCount === 0) throw new ErroHttp(422, "O sistema precisa de pelo menos um administrador ativo.");
    }
    await c.query("UPDATE usuarios SET nome=$2, perfil=$3, ativo=$4, atualizado_em=now() WHERE id=$1", [id, e.nome, e.perfil, e.ativo]);
    const mudancas: string[] = [];
    if (atual.nome !== e.nome) mudancas.push(`nome de ${atual.nome} para ${e.nome}`);
    if (atual.perfil !== e.perfil) mudancas.push(`perfil de ${atual.perfil === "ADMIN" ? "Administrador" : "Usuário"} para ${e.perfil === "ADMIN" ? "Administrador" : "Usuário"}`);
    if (atual.ativo !== e.ativo) mudancas.push(e.ativo ? "reativou o acesso" : "desativou o acesso");
    if (mudancas.length) {
      await registrar(c, ator, [
        { operacao: "USUARIO", entidade: "USUARIO", entidadeId: id, registroNome: e.nome, descricao: `${ator.nome} alterou o usuário ${atual.login}: ${mudancas.join("; ")}.` },
      ]);
    }
  });
  if (!e.ativo) await encerrarSessoesDoUsuario(id);
}

export async function redefinirSenha(id: number, senha: string, ator: Ator, peloAdministrador: boolean): Promise<void> {
  const hash = await gerarHashSenha(senha);
  await transacao(async (c) => {
    const atual = (await c.query<{ login: string; nome: string }>("SELECT login, nome FROM usuarios WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Usuário não encontrado.");
    await c.query(
      "UPDATE usuarios SET senha_hash=$2, tentativas_falhas=0, bloqueado_ate=NULL, atualizado_em=now() WHERE id=$1",
      [id, hash],
    );
    await registrar(c, ator, [
      {
        operacao: "SENHA",
        entidade: "USUARIO",
        entidadeId: id,
        registroNome: atual.nome,
        descricao: peloAdministrador ? `${ator.nome} redefiniu a senha do usuário ${atual.login}.` : `${atual.nome} alterou a própria senha.`,
      },
    ]);
  });
}
