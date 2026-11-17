import { exigirUsuarioApi, json, lerCorpo, rota } from "@/lib/server/http";
import { acaoSchema, executarAcao } from "@/lib/server/felicitacoes";
import { atorDe } from "@/lib/server/ator";

// Preparar WhatsApp, marcar como enviado, "Não enviar" ou voltar para pendente.
// Nenhuma mensagem é enviada pelo servidor: o WhatsApp é aberto no aparelho do funcionário (link wa.me).
export const POST = rota(async (req) => {
  const u = await exigirUsuarioApi(req);
  const acao = await lerCorpo(req, acaoSchema);
  return json({ registro: await executarAcao(acao, u, await atorDe(u)) });
});
