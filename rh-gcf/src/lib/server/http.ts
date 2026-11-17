import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAtual } from "./auth";
import type { UsuarioSessao, Perfil } from "@/lib/domain/tipos";

/** Extrai a origem (scheme + host) de uma URL sem lançar exceção para URLs inválidas. */
function origemSegura(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

export class ErroHttp extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Envolve o handler com tratamento padronizado de erros. */
export function rota<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ErroHttp) return json({ erro: e.message, ...e.extra }, e.status);
      if (e instanceof z.ZodError) {
        const primeiro = e.issues[0];
        return json({ erro: primeiro?.message ?? "Dados inválidos.", campos: e.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })) }, 400);
      }
      // Extrai o caminho de forma segura: req.url pode ser relativo em certos ambientes de proxy.
      let caminhoDaRota = req.url;
      try { caminhoDaRota = new URL(req.url).pathname; } catch { /* usa req.url */ }
      console.error("[rh-gcf] erro na rota", req.method, caminhoDaRota, e);
      return json({ erro: "Não foi possível concluir a operação. Tente novamente." }, 500);
    }
  };
}

/** Bloqueia requisições de alteração vindas de outro site (proteção CSRF). */
export function verificarOrigem(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD") return;

  // Monta o conjunto de origens permitidas para esta aplicação.
  const permitidas = new Set<string>();
  if (process.env.APP_URL) {
    // Envolto em try/catch: APP_URL inválida não deve derrubar a aplicação.
    const o = origemSegura(process.env.APP_URL);
    if (o) permitidas.add(o);
  }
  const host =
    (process.env.TRUST_PROXY === "true" && req.headers.get("x-forwarded-host")) ||
    req.headers.get("host");
  if (host) {
    permitidas.add(`https://${host}`);
    permitidas.add(`http://${host}`);
  }

  // Determina a origem da requisição a partir do cabeçalho Origin ou Referer.
  // origemSegura() trata Referers relativos (ex: "/login") sem lançar TypeError.
  const originHeader = req.headers.get("origin");
  const refererHeader = req.headers.get("referer");
  const origem = originHeader ?? (refererHeader ? origemSegura(refererHeader) : null);

  if (!origem) {
    // Proxy reverso (Hostinger, Caddy, Nginx) pode remover o cabeçalho Origin/Referer
    // em determinadas configurações. Quando não há como determinar a origem e há origens
    // configuradas, permite a requisição (browser legítimo usará fetch com Origin presente).
    if (permitidas.size > 0) return;
    throw new ErroHttp(403, "Origem da requisição não identificada.");
  }

  if (!permitidas.has(origem)) throw new ErroHttp(403, "Origem da requisição não autorizada.");
}

export async function exigirUsuarioApi(req: Request, opcoes: { perfil?: Perfil } = {}): Promise<UsuarioSessao> {
  verificarOrigem(req);
  const u = await usuarioAtual();
  if (!u) throw new ErroHttp(401, "Sessão expirada. Entre novamente.");
  if (opcoes.perfil === "ADMIN" && u.perfil !== "ADMIN") throw new ErroHttp(403, "Somente administradores podem fazer isso.");
  return u;
}

export async function lerCorpo<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let dados: unknown;
  try {
    dados = await req.json();
  } catch {
    throw new ErroHttp(400, "Corpo da requisição inválido.");
  }
  return schema.parse(dados);
}

/** Corpo JSON opcional: sem corpo, valida um objeto vazio (os valores padrão do schema valem). */
export async function lerCorpoOpcional<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const texto = await req.text().catch(() => "");
  let dados: unknown = {};
  if (texto.trim()) {
    try {
      dados = JSON.parse(texto);
    } catch {
      throw new ErroHttp(400, "Corpo da requisição inválido.");
    }
  }
  return schema.parse(dados);
}

export function idDaRota(valor: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(404, "Registro não encontrado.");
  return n;
}
