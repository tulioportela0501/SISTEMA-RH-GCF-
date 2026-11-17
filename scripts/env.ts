import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Carrega variáveis do arquivo .env (sem sobrescrever as já definidas). */
export function carregarEnv(): void {
  for (const nome of [".env", ".env.local"]) {
    const arq = path.join(process.cwd(), nome);
    if (!existsSync(arq)) continue;
    for (const linha of readFileSync(arq, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha);
      if (!m || linha.trim().startsWith("#")) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
