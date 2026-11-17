import { z } from "zod";
import { ErroHttp, exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { obterImagem, removerImagem, salvarImagem } from "@/lib/server/imagem-felicitacao";
import { atorDe } from "@/lib/server/ator";
import { LIMITE_IMAGEM } from "@/lib/domain/imagem";

// Imagem padrão de felicitação, guardada no banco de dados.

/** O arquivo da imagem (qualquer usuário logado). ?download=1 baixa com o nome original. */
export const GET = rota(async (req) => {
  await exigirUsuarioApi(req);
  const img = await obterImagem();
  if (!img) throw new ErroHttp(404, "Nenhuma imagem de felicitação cadastrada.");
  const etag = `"${img.sha256}"`;
  const download = new URL(req.url).searchParams.get("download") === "1";
  if (!download && req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  const nome = encodeURIComponent(img.nome);
  return new Response(new Uint8Array(img.dados), {
    status: 200,
    headers: {
      "Content-Type": img.tipo,
      "Content-Length": String(img.dados.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${img.nome.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${nome}`,
      "Cache-Control": "private, no-cache",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

/** Cadastra ou substitui a imagem (somente administrador). Campo "arquivo": PNG ou JPG até 5 MB. */
export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!arquivo || typeof arquivo === "string") throw new ErroHttp(400, "Selecione uma imagem PNG ou JPG.");
  if (arquivo.size > LIMITE_IMAGEM) throw new ErroHttp(413, "Imagem maior que 5 MB. Reduza o tamanho e envie de novo.");
  const dados = Buffer.from(await arquivo.arrayBuffer());
  return json({ imagem: await salvarImagem(dados, arquivo.name || "felicitacao", await atorDe(u), u) }, 201);
});

/** Remove a imagem (somente administrador). */
export const DELETE = rota(async (req) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const { versao } = await lerCorpo(req, z.object({ versao: z.number().int() }));
  await removerImagem(versao, await atorDe(u));
  return json({ ok: true });
});
