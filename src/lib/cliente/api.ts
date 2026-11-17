"use client";

export class ErroApi extends Error {
  constructor(
    message: string,
    public status: number,
    public dados: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Chamada à API do próprio sistema (JSON). Redireciona ao login quando a sessão expira. */
export async function api<T = unknown>(caminho: string, opcoes: { metodo?: string; corpo?: unknown; formData?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method: opcoes.metodo ?? (opcoes.corpo || opcoes.formData ? "POST" : "GET"), credentials: "same-origin" };
  if (opcoes.formData) init.body = opcoes.formData;
  else if (opcoes.corpo !== undefined) {
    init.body = JSON.stringify(opcoes.corpo);
    init.headers = { "Content-Type": "application/json" };
  }
  const r = await fetch(caminho, init);
  const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (r.status === 401 && !caminho.includes("/api/auth/")) {
    window.location.href = "/login?expirada=1";
    throw new ErroApi("Sessão expirada.", 401, dados);
  }
  if (!r.ok) throw new ErroApi(typeof dados.erro === "string" ? dados.erro : "Não foi possível concluir a operação.", r.status, dados);
  return dados as T;
}

function nomeDoArquivo(disposicao: string | null): string | null {
  if (!disposicao) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposicao);
  if (utf8) return decodeURIComponent(utf8[1]);
  return /filename="?([^";]+)"?/i.exec(disposicao)?.[1] ?? null;
}

/**
 * Baixa um arquivo gerado pela API (ex.: planilha Excel), mantendo a sessão.
 * Erros da API (JSON com "erro") viram ErroApi, com o status (404 = nada para exportar).
 */
export async function baixar(caminho: string): Promise<string> {
  const r = await fetch(caminho, { credentials: "same-origin" });
  if (r.status === 401) {
    window.location.href = "/login?expirada=1";
    throw new ErroApi("Sessão expirada.", 401);
  }
  const tipo = r.headers.get("content-type") ?? "";
  if (!r.ok || tipo.includes("application/json")) {
    const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ErroApi(typeof dados.erro === "string" ? dados.erro : "Não foi possível gerar a planilha.", r.status, dados);
  }
  const blob = await r.blob();
  const nome = nomeDoArquivo(r.headers.get("content-disposition")) ?? "rh-gcf.xlsx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return nome;
}
