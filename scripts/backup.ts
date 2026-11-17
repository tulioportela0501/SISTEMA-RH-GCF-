/**
 * Backup do banco com mysqldump e rotação dos arquivos antigos.
 * Uso: npm run db:backup
 * Variáveis: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
 *            BACKUP_DIR (padrão ./backups), BACKUP_RETENCAO_DIAS (padrão 30),
 *            MYSQLDUMP (caminho do mysqldump, opcional)
 * Para restaurar: mysql -h HOST -u USER -p DBNAME < arquivo.sql
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { carregarEnv } from "./env";

carregarEnv();

const host = process.env.DB_HOST;
const port = process.env.DB_PORT ?? "3306";
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD ?? "";
const database = process.env.DB_NAME;

if (!host || !user || !database) {
  console.error("Defina DB_HOST, DB_USER e DB_NAME.");
  process.exit(1);
}

const pasta = path.resolve(process.env.BACKUP_DIR || "backups");
const retencao = Number(process.env.BACKUP_RETENCAO_DIAS || 30);
mkdirSync(pasta, { recursive: true });

const carimbo = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const arquivo = path.join(pasta, `rh_gcf_${carimbo}.sql`);

const mysqldump = process.env.MYSQLDUMP || "mysqldump";
const args = [
  `-h${host}`,
  `-P${port}`,
  `-u${user}`,
  `--single-transaction`,
  `--routines`,
  `--triggers`,
  `--result-file=${arquivo}`,
  database,
];
// Senha via variável de ambiente — evita exposição no histórico do shell
const env = { ...process.env, MYSQL_PWD: password };

const r = spawnSync(mysqldump, args, { stdio: "inherit", env });
if (r.status !== 0) {
  console.error(
    "mysqldump falhou. Verifique se o MySQL client está instalado e no PATH (ou defina MYSQLDUMP).",
  );
  process.exit(1);
}
console.log(`Backup salvo em ${arquivo}`);

const limite = Date.now() - retencao * 86_400_000;
for (const f of readdirSync(pasta)) {
  if (!/^rh_gcf_.*\.sql$/.test(f)) continue;
  const p = path.join(pasta, f);
  if (statSync(p).mtimeMs < limite) {
    unlinkSync(p);
    console.log(`Removido backup antigo: ${f}`);
  }
}
