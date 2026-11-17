import { z } from "zod";
import { exigirUsuarioApi, idDaRota, json, lerCorpoOpcional, rota } from "@/lib/server/http";
import { cancelarImportacao, confirmarImportacao } from "@/lib/server/importacao";
import { atorDe } from "@/lib/server/ator";

type Ctx = { params: Promise<{ id: string }> };

const corpoSchema = z.object({
  substituirClientes: z.array(z.string().max(300)).max(5000).default([]),
  /** Linhas da aba Base (funcionários já cadastrados) em que o usuário confirmou atualizar com os valores da planilha */
  atualizarFuncionarios: z.array(z.number().int().positive()).max(5000).default([]),
});

// Confirma e grava os dados conferidos na prévia.
// "substituirClientes" (opcional): clientes em que o usuário confirmou trocar os valores do sistema pelos da planilha.
export const POST = rota<Ctx>(async (req, ctx) => {
  const u = await exigirUsuarioApi(req, { perfil: "ADMIN" });
  const { substituirClientes, atualizarFuncionarios } = await lerCorpoOpcional(req, corpoSchema);
  const resultado = await confirmarImportacao(idDaRota((await ctx.params).id), await atorDe(u), u.id, substituirClientes, atualizarFuncionarios);
  return json({ resultado });
});

export const DELETE = rota<Ctx>(async (req, ctx) => {
  await exigirUsuarioApi(req, { perfil: "ADMIN" });
  await cancelarImportacao(idDaRota((await ctx.params).id));
  return json({ ok: true });
});
