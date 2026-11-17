/**
 * Backup do banco com pg_dump (formato custom, compactado) e rotação dos arquivos antigos.
 * Uso: npm run db:backup
 * Variáveis: DATABASE_URL, BACKUP_DIR (padrão ./backups), BACKUP_RETENCAO_DIAS (padrão 30), PG_DUMP (caminho do pg_dump)
 * Agende diariamente (Agendador de Tarefas do Windows, cron ou o serviço "backup" do docker-compose).
 * Para restaurar: pg_restore --clean --if-exists -d "<DATABASE_URL>" arquivo.dump
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { carregarEnv } from "./env";

carregarEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL.");
  process.exit(1);
}
const pasta = path.resolve(process.env.BACKUP_DIR || "backups");
const retencao = Number(process.env.BACKUP_RETENCAO_DIAS || 30);
mkdirSync(pasta, { recursive: true });

const carimbo = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const arquivo = path.join(pasta, `rh_gcf_${carimbo}.dump`);
const r = spawnSync(process.env.PG_DUMP || "pg_dump", ["--format=custom", "--no-owner", "--file", arquivo, url], { stdio: "inherit" });
if (r.status !== 0) {
  console.error("pg_dump falhou. Verifique se o PostgreSQL client está instalado e no PATH (ou defina PG_DUMP).");
  process.exit(1);
}
console.log(`Backup salvo em ${arquivo}`);

const limite = Date.now() - retencao * 86_400_000;
for (const f of readdirSync(pasta)) {
  if (!/^rh_gcf_.*\.dump$/.test(f)) continue;
  const p = path.join(pasta, f);
  if (statSync(p).mtimeMs < limite) {
    unlinkSync(p);
    console.log(`Removido backup antigo: ${f}`);
  }
}
