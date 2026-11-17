import { ErroHttp, exigirUsuarioApi, json, rota } from "@/lib/server/http";
import { criarPreviaClientes } from "@/lib/server/importacao-clientes";

const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB

// Envia a relação de clientes e devolve a prévia para conferência (nada é gravado nos cadastros ainda).
export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!arquivo || typeof arquivo === "string") throw new ErroHttp(400, "Selecione o arquivo Excel (.xlsx) ou CSV.");
  if (!/\.(xlsx|csv)$/i.test(arquivo.name)) throw new ErroHttp(415, "Formato não suportado. Envie um arquivo .xlsx ou .csv (separado por ponto e vírgula).");
  if (arquivo.size > TAMANHO_MAXIMO) throw new ErroHttp(413, "Arquivo maior que 10 MB.");
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const previa = await criarPreviaClientes(buffer, arquivo.name.slice(0, 200), u.id);
  return json({ previa }, 201);
});
