import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { query, queryOne } from "./db";
import type { UsuarioSessao, Perfil } from "@/lib/domain/tipos";

export const COOKIE_SESSAO = "rhgcf_sessao";
const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000; // 8 horas de inatividade
const RENOVAR_APOS_MS = 15 * 60 * 1000;
export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MS = 15 * 60 * 1000;

// Argon2id com parâmetros recomendados pela OWASP (m=19 MiB, t=2, p=1).
// algorithm 2 = Argon2id (enum constante da biblioteca)
const OPCOES_ARGON = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function gerarHashSenha(senha: string): Promise<string> {
  return argonHash(senha, OPCOES_ARGON);
}

export async function conferirSenha(hash: string, senha: string): Promise<boolean> {
  try {
    return await argonVerify(hash, senha);
  } catch {
    return false;
  }
}

// Hash fixo usado quando o login não existe, para o tempo de resposta não revelar contas.
let hashFicticio: Promise<string> | null = null;
export function hashParaComparacaoFalsa(): Promise<string> {
  if (!hashFicticio) hashFicticio = gerarHashSenha(randomBytes(16).toString("hex"));
  return hashFicticio;
}

export function validarForcaSenha(senha: string): string | null {
  if (senha.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (senha.length > 200) return "A senha pode ter no máximo 200 caracteres.";
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return "A senha precisa ter letras e números.";
  return null;
}

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export function cookieSeguro(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function ipDaRequisicao(): Promise<string | null> {
  const h = await headers();
  if (process.env.TRUST_PROXY === "true") {
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const real = h.get("x-real-ip");
    if (real) return real;
  }
  return h.get("x-real-ip") ?? null;
}

export async function criarSessao(usuarioId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expira = new Date(Date.now() + DURACAO_SESSAO_MS);
  await query(
    "INSERT INTO sessoes (usuario_id, token_hash, expira_em, ip, user_agent) VALUES ($1, $2, $3, $4, $5)",
    [usuarioId, sha256(token), expira, await ipDaRequisicao(), (h.get("user-agent") ?? "").slice(0, 300)],
  );
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(DURACAO_SESSAO_MS / 1000),
  });
}

export async function encerrarSessao(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await query("DELETE FROM sessoes WHERE token_hash = $1", [sha256(token)]);
  jar.delete(COOKIE_SESSAO);
}

/** Encerra as demais sessões do usuário, mantendo a sessão atual. */
export async function encerrarOutrasSessoes(usuarioId: number): Promise<void> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value ?? "";
  await query("DELETE FROM sessoes WHERE usuario_id = $1 AND token_hash <> $2", [usuarioId, sha256(token)]);
}

export async function encerrarSessoesDoUsuario(usuarioId: number): Promise<void> {
  await query("DELETE FROM sessoes WHERE usuario_id = $1", [usuarioId]);
}

/** Usuário da sessão atual ou null. */
export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token || token.length > 100) return null;
  const linha = await queryOne<UsuarioSessao & { sessao_id: string; ultimo_uso_em: Date }>(
    `SELECT u.id, u.nome, u.login, u.perfil, s.id AS sessao_id, s.ultimo_uso_em
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.expira_em > now() AND u.ativo`,
    [sha256(token)],
  );
  if (!linha) return null;
  if (Date.now() - new Date(linha.ultimo_uso_em).getTime() > RENOVAR_APOS_MS) {
    await query("UPDATE sessoes SET ultimo_uso_em = now(), expira_em = $2 WHERE id = $1", [
      linha.sessao_id,
      new Date(Date.now() + DURACAO_SESSAO_MS),
    ]);
  }
  return { id: linha.id, nome: linha.nome, login: linha.login, perfil: linha.perfil };
}

/** Para páginas: redireciona ao login se não houver sessão. */
export async function exigirUsuarioPagina(perfil?: Perfil): Promise<UsuarioSessao> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (perfil === "ADMIN" && u.perfil !== "ADMIN") redirect("/");
  return u;
}
