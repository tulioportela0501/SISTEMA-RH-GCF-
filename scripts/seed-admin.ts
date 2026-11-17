/**
 * Cria (ou redefine) o primeiro administrador.
 * Uso: npm run db:seed-admin
 * Lê ADMIN_NOME, ADMIN_LOGIN e ADMIN_SENHA do ambiente/.env; se faltar algo, pergunta no terminal.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import mysql from "mysql2/promise";
import { hash } from "@node-rs/argon2";
import { carregarEnv } from "./env";

async function perguntar(
  rl: ReturnType<typeof createInterface>,
  texto: string,
  padrao?: string,
) {
  const r = (await rl.question(`${texto}${padrao ? ` [${padrao}]` : ""}: `)).trim();
  return r || padrao || "";
}

async function main() {
  carregarEnv();
  const rl = createInterface({ input: stdin, output: stdout });
  const nome =
    process.env.ADMIN_NOME ||
    (await perguntar(rl, "Nome do administrador", "Administrador RH"));
  const login = (
    process.env.ADMIN_LOGIN || (await perguntar(rl, "Login", "admin"))
  ).toLowerCase();
  const senha =
    process.env.ADMIN_SENHA ||
    (await perguntar(rl, "Senha (mín. 10 caracteres, letras e números)"));
  rl.close();

  if (
    senha.length < 10 ||
    !/[A-Za-z]/.test(senha) ||
    !/\d/.test(senha)
  ) {
    throw new Error(
      "Senha fraca: use pelo menos 10 caracteres com letras e números.",
    );
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME,
    charset: "utf8mb4",
    timezone: "+00:00",
  });

  try {
    const senhaHash = await hash(senha, {
      algorithm: 2 /* Argon2id */,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // Verifica se já existe
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM usuarios WHERE login = ?",
      [login],
    );

    if (rows.length === 0) {
      await conn.execute(
        `INSERT INTO usuarios (nome, login, senha_hash, perfil)
         VALUES (?, ?, ?, 'ADMIN')`,
        [nome, login, senhaHash],
      );
      console.log(`Administrador "${login}" criado.`);
    } else {
      await conn.execute(
        `UPDATE usuarios SET senha_hash = ?, perfil = 'ADMIN', ativo = 1,
         tentativas_falhas = 0, bloqueado_ate = NULL, atualizado_em = NOW()
         WHERE login = ?`,
        [senhaHash, login],
      );
      console.log(`Senha do administrador "${login}" redefinida.`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("Erro:", (e as Error).message);
  process.exit(1);
});
