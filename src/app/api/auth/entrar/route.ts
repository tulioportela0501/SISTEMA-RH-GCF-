import { z } from "zod";
import { query, queryOne } from "@/lib/server/db";
import { BLOQUEIO_MS, MAX_TENTATIVAS, conferirSenha, criarSessao, hashParaComparacaoFalsa, ipDaRequisicao } from "@/lib/server/auth";
import { ErroHttp, json, lerCorpo, rota, verificarOrigem } from "@/lib/server/http";

const schema = z.object({
  login: z.string().trim().toLowerCase().min(1, "Informe o login.").max(120),
  senha: z.string().min(1, "Informe a senha.").max(200),
});

const LIMITE_IP = 20;
const MSG_INVALIDO = "Login ou senha incorretos.";

export const POST = rota(async (req) => {
  const t0 = Date.now();
  console.log("[rh-gcf] login: início da tentativa");

  verificarOrigem(req);
  const { login, senha } = await lerCorpo(req, schema);
  const ip = await ipDaRequisicao();
  console.log("[rh-gcf] login: origem ok, login recebido, ip obtido");

  try {
    if (ip) {
      const r = await queryOne<{ n: string }>(
        "SELECT count(*) AS n FROM tentativas_login WHERE ip = $1 AND NOT sucesso AND ocorrido_em > now() - interval '15 minutes'",
        [ip],
      );
      console.log("[rh-gcf] login: consulta rate-limit ok (%dms)", Date.now() - t0);
      if (Number(r?.n ?? 0) >= LIMITE_IP) throw new ErroHttp(429, "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.");
    }

    const u = await queryOne<{ id: number; nome: string; senha_hash: string; ativo: boolean; bloqueado_ate: Date | null; tentativas_falhas: number }>(
      "SELECT id, nome, senha_hash, ativo, bloqueado_ate, tentativas_falhas FROM usuarios WHERE login = $1",
      [login],
    );
    console.log("[rh-gcf] login: consulta usuário ok, encontrado=%s (%dms)", !!u, Date.now() - t0);

    if (!u) {
      await conferirSenha(await hashParaComparacaoFalsa(), senha);
      await query("INSERT INTO tentativas_login (login, ip, sucesso) VALUES (NULL, $1, FALSE)", [ip]);
      throw new ErroHttp(401, MSG_INVALIDO);
    }

    if (u.bloqueado_ate && new Date(u.bloqueado_ate).getTime() > Date.now()) {
      const min = Math.ceil((new Date(u.bloqueado_ate).getTime() - Date.now()) / 60000);
      throw new ErroHttp(423, `Acesso bloqueado por excesso de tentativas. Tente novamente em ${min} ${min === 1 ? "minuto" : "minutos"}.`);
    }

    const ok = u.ativo && (await conferirSenha(u.senha_hash, senha));
    console.log("[rh-gcf] login: senha conferida, válida=%s (%dms)", ok, Date.now() - t0);
    await query("INSERT INTO tentativas_login (login, ip, sucesso) VALUES ($1, $2, $3)", [login, ip, ok]);

    if (!ok) {
      const falhas = u.tentativas_falhas + 1;
      const bloquear = falhas >= MAX_TENTATIVAS;
      await query("UPDATE usuarios SET tentativas_falhas = $2, bloqueado_ate = $3 WHERE id = $1", [
        u.id,
        bloquear ? 0 : falhas,
        bloquear ? new Date(Date.now() + BLOQUEIO_MS) : null,
      ]);
      throw new ErroHttp(401, MSG_INVALIDO);
    }

    await query("UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL, ultimo_login_em = now() WHERE id = $1", [u.id]);
    await criarSessao(u.id);
    console.log("[rh-gcf] login: sessão criada, sucesso (%dms)", Date.now() - t0);
    return json({ ok: true });
  } catch (e) {
    // ErroHttp é esperado (401, 423, 429) — relança para o wrapper `rota` tratar.
    if (e instanceof ErroHttp) throw e;
    // Erro inesperado (banco inacessível, timeout, etc.) — log sanitizado.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[rh-gcf] login: erro inesperado (%dms) —", msg);
    throw e;
  }
});
