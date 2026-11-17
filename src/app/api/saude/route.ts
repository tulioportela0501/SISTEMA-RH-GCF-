import { query } from "@/lib/server/db";

export async function GET() {
  const t0 = Date.now();
  try {
    await query("SELECT 1");
    return Response.json({ status: "ok", ms: Date.now() - t0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[rh-gcf] saude: banco indisponível —", msg);
    return Response.json({ status: "erro", detalhe: "banco de dados indisponível", ms: Date.now() - t0 }, { status: 503 });
  }
}
