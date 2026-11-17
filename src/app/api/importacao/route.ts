import { ErroHttp, exigirUsuarioApi, json, rota } from "@/lib/server/http";
import { criarPrevia } from "@/lib/server/importacao";

const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB

// Envia a planilha e devolve a prévia para conferência (nada é gravado nos cadastros ainda).
export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!arquivo || typeof arquivo === "string") throw new ErroHttp(400, "Selecione o arquivo Excel (.xlsx).");
  if (!/\.xlsx$/i.test(arquivo.name)) throw new ErroHttp(415, "Formato não suportado. Envie um arquivo .xlsx.");
  if (arquivo.size > TAMANHO_MAXIMO) throw new ErroHttp(413, "Arquivo maior que 10 MB.");
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const previa = await criarPrevia(buffer, arquivo.name.slice(0, 200), u.id);
  return json({ previa }, 201);
});
