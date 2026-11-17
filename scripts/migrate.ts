/**
 * Aplica as migrações SQL de db/migrations em ordem, uma única vez cada.
 * Uso: npm run db:migrate   (lê DATABASE_URL do ambiente ou do arquivo .env)
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { carregarEnv } from "./env";

async function main() {
  carregarEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DATABASE_URL (veja .env.example).");
  const client = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const pasta = path.join(process.cwd(), "db", "migrations");
    const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();
    const aplicadas = new Set((await client.query<{ nome: string }>("SELECT nome FROM schema_migrations")).rows.map((r) => r.nome));
    let novas = 0;
    for (const arq of arquivos) {
      if (aplicadas.has(arq)) continue;
      const sql = readFileSync(path.join(pasta, arq), "utf8");
      process.stdout.write(`Aplicando ${arq}... `);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (nome) VALUES ($1)", [arq]);
        await client.query("COMMIT");
        novas++;
        console.log("ok");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    console.log(novas ? `${novas} migração(ões) aplicada(s).` : "Banco de dados já está atualizado.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Falha na migração:", e.message);
  process.exit(1);
});
