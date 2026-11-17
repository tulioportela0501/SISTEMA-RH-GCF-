/**
 * Cria (ou redefine) o primeiro administrador.
 * Uso:
 *   npm run db:seed-admin
 * Lê ADMIN_NOME, ADMIN_LOGIN e ADMIN_SENHA do ambiente/.env; se faltar algo, pergunta no terminal.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Client } from "pg";
import { hash } from "@node-rs/argon2";
import { carregarEnv } from "./env";

async function perguntar(rl: ReturnType<typeof createInterface>, texto: string, padrao?: string) {
  const r = (await rl.question(`${texto}${padrao ? ` [${padrao}]` : ""}: `)).trim();
  return r || padrao || "";
}

async function main() {
  carregarEnv();
  const rl = createInterface({ input: stdin, output: stdout });
  const nome = process.env.ADMIN_NOME || (await perguntar(rl, "Nome do administrador", "Administrador RH"));
  const login = (process.env.ADMIN_LOGIN || (await perguntar(rl, "Login", "admin"))).toLowerCase();
  const senha = process.env.ADMIN_SENHA || (await perguntar(rl, "Senha (mín. 10 caracteres, letras e números)"));
  rl.close();
  if (senha.length < 10 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) throw new Error("Senha fraca: use pelo menos 10 caracteres com letras e números.");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });
  await client.connect();
  try {
    const senhaHash = await hash(senha, { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const r = await client.query(
      `INSERT INTO usuarios (nome, login, senha_hash, perfil)
       VALUES ($1, $2, $3, 'ADMIN')
       ON CONFLICT (login) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, perfil = 'ADMIN', ativo = TRUE,
         tentativas_falhas = 0, bloqueado_ate = NULL, atualizado_em = now()
       RETURNING id, (xmax = 0) AS criado`,
      [nome, login, senhaHash],
    );
    console.log(r.rows[0].criado ? `Administrador "${login}" criado.` : `Senha do administrador "${login}" redefinida.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
