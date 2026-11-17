import { encerrarSessao } from "@/lib/server/auth";
import { json, rota, verificarOrigem } from "@/lib/server/http";

export const POST = rota(async (req) => {
  verificarOrigem(req);
  await encerrarSessao();
  return json({ ok: true });
});
