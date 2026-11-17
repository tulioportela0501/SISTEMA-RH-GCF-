import "server-only";
import { createHash } from "node:crypto";
import { query, queryOne, transacao } from "./db";
import { ErroHttp } from "./http";
import { registrar, valorLegivel, type Ator, type NovoRegistro } from "./historico";
import { listarFuncionarios } from "./funcionarios";
import { listarDatasCliente } from "./datas";
import { arquivoJaImportado, limparPreviasAntigas, type ImportacaoAnterior } from "./lotes";
import { descreverResultadoClientes, gravarClientes, montarPreviaClientes, type ResultadoClientes } from "./importacao-clientes";
import { CAMPO_POR_CHAVE, CHAVES_CAMPOS, type CampoChave } from "@/lib/domain/campos";
import { analisarCadastro, type AnaliseCadastro } from "@/lib/domain/pendencias";
import { camposACompletar, camposDiferentes } from "@/lib/domain/comparacao";
import { formatarDiaMes } from "@/lib/domain/datas";
import { lerPlanilha, normalizarNome, type LeituraPlanilha, type LinhaDataComemorativa, type LinhaFuncionario } from "@/lib/excel/importar";
import { NOMES_CLASSE } from "@/lib/excel/cores";
import type { PreviaClientes } from "@/lib/domain/clientes";
import type { Funcionario } from "@/lib/domain/tipos";

export interface DiferencaFuncionario {
  campo: CampoChave;
  label: string;
  textoAtual: string;
  textoPlanilha: string;
}

export interface LinhaPrevia extends LinhaFuncionario {
  analise: AnaliseCadastro;
  /**
   * Registro já existente no sistema (mesmo nome ou e-mail): os campos vazios são completados;
   * as informações diferentes só são atualizadas se o usuário marcar o funcionário na prévia.
   */
  existente: { id: number; nomeAtual: string | null; camposACompletar: CampoChave[]; diferencas: DiferencaFuncionario[] } | null;
  desligado: boolean;
}

export interface DataPrevia extends LinhaDataComemorativa {
  existenteId: number | null;
}

export interface Previa {
  loteId: number;
  arquivo: string;
  leitura: Omit<LeituraPlanilha, "funcionarios" | "datasComemorativas" | "clientes">;
  linhas: LinhaPrevia[];
  datas: DataPrevia[];
  /** Relação de clientes encontrada em outras abas do arquivo → aba Datas do Cliente */
  clientes: PreviaClientes;
  /** O mesmo arquivo já foi importado antes (nada será duplicado) */
  arquivoJaImportado: ImportacaoAnterior | null;
  /** Nomes que aparecem em mais de uma linha da aba Base (conferir) */
  nomesRepetidos: { nome: string; linhas: number[] }[];
  resumo: {
    funcionarios: number;
    desligados: number;
    ativos: number;
    outrasCores: number;
    novos: number;
    existentes: number;
    /** Já cadastrados com alguma informação diferente da planilha */
    comDiferencas: number;
    incompletos: number;
    datasComemorativas: number;
    datasNovas: number;
    /** Linhas com algum valor que não pôde ser lido (ex.: data inválida) */
    linhasComAvisos: number;
  };
}

const chave = (v: string | null) => normalizarNome(v);

/** Lê a planilha e guarda uma prévia para conferência. Nada é gravado nos cadastros ainda. */
export async function criarPrevia(buffer: Buffer, nomeArquivo: string, usuarioId: number): Promise<Previa> {
  await limparPreviasAntigas();
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  let leitura: LeituraPlanilha;
  try {
    leitura = await lerPlanilha(buffer);
  } catch (e) {
    throw new ErroHttp(422, e instanceof Error ? e.message : "Não foi possível ler a planilha.");
  }

  const existentes = await listarFuncionarios();
  const porNome = new Map<string, Funcionario>();
  const porEmail = new Map<string, Funcionario>();
  for (const f of existentes) {
    if (f.nome) porNome.set(chave(f.nome), f);
    if (f.email) porEmail.set(f.email.trim().toLowerCase(), f);
  }

  const linhas: LinhaPrevia[] = leitura.funcionarios.map((l) => {
    const ex =
      (l.valores.nome ? porNome.get(chave(l.valores.nome)) : undefined) ??
      (l.valores.email ? porEmail.get(l.valores.email.trim().toLowerCase()) : undefined) ??
      null;
    return {
      ...l,
      analise: analisarCadastro(l.valores),
      existente: ex
        ? {
            id: ex.id,
            nomeAtual: ex.nome,
            camposACompletar: camposACompletar(ex, l.valores),
            diferencas: camposDiferentes(ex, l.valores).map((k) => ({
              campo: k,
              label: CAMPO_POR_CHAVE[k].label,
              textoAtual: valorLegivel(k, ex[k]) ?? "",
              textoPlanilha: valorLegivel(k, l.valores[k] ?? null) ?? "",
            })),
          }
        : null,
      desligado: l.desligadoPelaCor || l.statusPlanilha === "DESLIGADO",
    };
  });

  const datasExistentes = await query<{ id: number; titulo: string; data: string }>("SELECT id, titulo, data FROM datas_comemorativas");
  const chaveData = (titulo: string, data: string) => `${normalizarNome(titulo)}|${formatarDiaMes(data)}`;
  const mapaDatas = new Map(datasExistentes.map((d) => [chaveData(d.titulo, d.data), d.id]));
  const datas: DataPrevia[] = leitura.datasComemorativas.map((d) => ({ ...d, existenteId: mapaDatas.get(chaveData(d.titulo, d.data)) ?? null }));

  const repetidos = new Map<string, { nome: string; linhas: number[] }>();
  for (const l of leitura.funcionarios) {
    const k = chave(l.valores.nome);
    if (!k) continue;
    const item = repetidos.get(k) ?? { nome: l.valores.nome!, linhas: [] };
    item.linhas.push(l.linha);
    repetidos.set(k, item);
  }

  const clientes = montarPreviaClientes(leitura.clientes, await listarDatasCliente());

  const { funcionarios: _f, datasComemorativas: _d, clientes: _c, ...resto } = leitura;
  const previa: Omit<Previa, "loteId"> = {
    arquivo: nomeArquivo,
    leitura: resto,
    linhas,
    datas,
    clientes,
    arquivoJaImportado: await arquivoJaImportado(sha256),
    nomesRepetidos: [...repetidos.values()].filter((r) => r.linhas.length > 1),
    resumo: {
      funcionarios: linhas.length,
      desligados: linhas.filter((l) => l.desligado).length,
      ativos: linhas.filter((l) => !l.desligado).length,
      outrasCores: linhas.filter((l) => !l.desligado && l.cor.classe !== "NENHUMA").length,
      novos: linhas.filter((l) => !l.existente).length,
      existentes: linhas.filter((l) => l.existente).length,
      comDiferencas: linhas.filter((l) => l.existente?.diferencas.length).length,
      incompletos: linhas.filter((l) => l.analise.nivel !== "COMPLETO").length,
      datasComemorativas: datas.length,
      datasNovas: datas.filter((d) => !d.existenteId).length,
      linhasComAvisos: linhas.filter((l) => l.avisos.length > 0).length,
    },
  };

  const lote = await queryOne<{ id: number }>(
    "INSERT INTO lotes_importacao (arquivo_nome, arquivo_sha256, previa, criado_por) VALUES ($1, $2, $3, $4) RETURNING id",
    [nomeArquivo, sha256, JSON.stringify(previa), usuarioId],
  );
  return { loteId: lote!.id, ...previa };
}

/**
 * Grava a importação conferida.
 * - Funcionário novo: criado com todos os valores da planilha (originais preservados).
 * - Já existente: os campos vazios no sistema são completados. Valores diferentes só são substituídos
 *   nos funcionários marcados na prévia (atualizarLinhas). Célula vazia na planilha nunca apaga um dado.
 * - Linha em vermelho: Status do vínculo = Desligado.
 * - Linhas "COMEMORAR": viram datas comemorativas do escritório.
 */
export async function confirmarImportacao(loteId: number, ator: Ator, usuarioId: number, substituirClientes: string[] = [], atualizarLinhas: number[] = []) {
  const atualizar = new Set(atualizarLinhas);
  return transacao(async (c) => {
    const lote = (
      await c.query<{ status: string; previa: Omit<Previa, "loteId">; criado_em: Date }>("SELECT status, previa, criado_em FROM lotes_importacao WHERE id = $1 FOR UPDATE", [loteId])
    ).rows[0];
    if (!lote) throw new ErroHttp(404, "Importação não encontrada.");
    if (lote.status !== "PREVIA") throw new ErroHttp(409, "Esta importação já foi concluída ou cancelada.");
    if ((lote.previa as { tipo?: string }).tipo === "CLIENTES") throw new ErroHttp(409, "Esta prévia é de clientes: confirme pela aba Datas do Cliente.");
    if (Date.now() - new Date(lote.criado_em).getTime() > 24 * 60 * 60 * 1000) throw new ErroHttp(409, "A prévia expirou. Envie a planilha novamente.");
    const previa = lote.previa;
    const r: { criados: number; atualizados: number; camposCompletados: number; camposAtualizados: number; desligados: number; datasCriadas: number } & Partial<ResultadoClientes> = {
      criados: 0,
      atualizados: 0,
      camposCompletados: 0,
      camposAtualizados: 0,
      desligados: 0,
      datasCriadas: 0,
    };
    const regs: NovoRegistro[] = [];

    for (const l of previa.linhas) {
      const nome = l.valores.nome?.trim() || `Linha ${l.linha}`;
      const cor = l.cor.hex ? `${NOMES_CLASSE[l.cor.classe]} (#${l.cor.hex})` : null;

      if (!l.existente) {
        const cols = [...CHAVES_CAMPOS, "status_vinculo", "origem", "lote_importacao_id", "linha_planilha", "cor_planilha", "criado_por", "atualizado_por"];
        const vals = [...CHAVES_CAMPOS.map((k) => l.valores[k] ?? null), l.desligado ? "DESLIGADO" : "ATIVO", "IMPORTACAO", loteId, l.linha, cor, usuarioId, usuarioId];
        const ins = await c.query<{ id: number }>(`INSERT INTO funcionarios (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`, vals);
        const id = ins.rows[0].id;
        r.criados++;
        regs.push({
          operacao: "IMPORTACAO",
          entidade: "FUNCIONARIO",
          entidadeId: id,
          registroNome: nome,
          loteId,
          descricao: `${nome} importado da planilha "${previa.arquivo}" (linha ${l.linha}, ${CHAVES_CAMPOS.filter((k) => l.valores[k]).length} de 34 campos preenchidos).`,
        });
        if (l.desligado) {
          r.desligados++;
          regs.push({
            operacao: "DESLIGAMENTO",
            entidade: "FUNCIONARIO",
            entidadeId: id,
            registroNome: nome,
            campo: "status_vinculo",
            campoLabel: "Status do vínculo",
            valorAnterior: null,
            valorNovo: "Desligado",
            loteId,
            descricao: l.desligadoPelaCor
              ? `${nome} identificado como desligado: linha ${l.linha} da planilha com preenchimento vermelho.`
              : `${nome} importado como desligado (coluna Status do vínculo).`,
          });
        }
        continue;
      }

      const atual = (await c.query<Funcionario>("SELECT * FROM funcionarios WHERE id = $1 FOR UPDATE", [l.existente.id])).rows[0];
      if (!atual) continue;
      const completar = camposACompletar(atual, l.valores);
      // Diferenças recalculadas na hora de gravar (o cadastro pode ter mudado depois da prévia)
      const substituir = atualizar.has(l.linha) ? camposDiferentes(atual, l.valores) : [];
      const desligar = l.desligado && atual.status_vinculo === "ATIVO";
      if (completar.length === 0 && substituir.length === 0 && !desligar) continue;
      const alterar = [...completar, ...substituir];
      const sets = alterar.map((k, i) => `${k} = $${i + 2}`);
      const params: unknown[] = [atual.id, ...alterar.map((k) => l.valores[k])];
      if (desligar) sets.push("status_vinculo = 'DESLIGADO'");
      params.push(usuarioId);
      await c.query(`UPDATE funcionarios SET ${sets.join(", ")}, versao = versao + 1, atualizado_em = now(), atualizado_por = $${params.length} WHERE id = $1`, params);
      r.atualizados++;
      r.camposCompletados += completar.length;
      r.camposAtualizados += substituir.length;
      for (const k of substituir) {
        regs.push({
          operacao: "ALTERACAO",
          entidade: "FUNCIONARIO",
          entidadeId: atual.id,
          registroNome: nome,
          campo: k,
          campoLabel: CAMPO_POR_CHAVE[k].label,
          valorAnterior: atual[k],
          valorNovo: l.valores[k],
          loteId,
          descricao: `Importação atualizou ${CAMPO_POR_CHAVE[k].label}: ${valorLegivel(k, atual[k])} → ${valorLegivel(k, l.valores[k])} (linha ${l.linha} de "${previa.arquivo}", confirmado na prévia).`,
        });
      }
      for (const k of completar) {
        regs.push({
          operacao: "ALTERACAO",
          entidade: "FUNCIONARIO",
          entidadeId: atual.id,
          registroNome: nome,
          campo: k,
          campoLabel: CAMPO_POR_CHAVE[k].label,
          valorAnterior: null,
          valorNovo: l.valores[k],
          loteId,
          descricao: `Importação preencheu o campo ${CAMPO_POR_CHAVE[k].label} com ${valorLegivel(k, l.valores[k])}.`,
        });
      }
      if (desligar) {
        r.desligados++;
        regs.push({
          operacao: "DESLIGAMENTO",
          entidade: "FUNCIONARIO",
          entidadeId: atual.id,
          registroNome: nome,
          campo: "status_vinculo",
          campoLabel: "Status do vínculo",
          valorAnterior: "Ativo",
          valorNovo: "Desligado",
          loteId,
          descricao: `${nome} identificado como desligado: linha ${l.linha} da planilha com preenchimento vermelho.`,
        });
      }
    }

    for (const d of previa.datas) {
      if (d.existenteId) continue;
      const ins = await c.query<{ id: number }>(
        `INSERT INTO datas_comemorativas (titulo, data, recorrente, categoria, origem, lote_importacao_id, linha_planilha, criado_por, atualizado_por)
         VALUES ($1, $2, TRUE, $3, 'IMPORTACAO', $4, $5, $6, $6) RETURNING id`,
        [d.titulo, d.data, d.categoria, loteId, d.linha, usuarioId],
      );
      r.datasCriadas++;
      regs.push({
        operacao: "IMPORTACAO",
        entidade: "DATA_COMEMORATIVA",
        entidadeId: ins.rows[0].id,
        registroNome: d.titulo,
        loteId,
        descricao: `Data comemorativa ${d.titulo} (${formatarDiaMes(d.data)}, todo ano) importada da linha ${d.linha}.`,
      });
    }

    // Clientes de outras abas do mesmo arquivo → Datas do Cliente
    const lidosClientes = previa.clientes?.lidos ?? [];
    if (lidosClientes.length) Object.assign(r, await gravarClientes(c, lidosClientes, new Set(substituirClientes), { loteId, arquivo: previa.arquivo, ator, usuarioId }));

    regs.unshift({
      operacao: "IMPORTACAO",
      entidade: "IMPORTACAO",
      entidadeId: loteId,
      registroNome: previa.arquivo,
      loteId,
      descricao: `${ator.nome} importou "${previa.arquivo}": ${r.criados} funcionários criados, ${r.atualizados} atualizados (${r.camposCompletados} campos completados e ${r.camposAtualizados} substituídos), ${r.desligados} desligados identificados em vermelho e ${r.datasCriadas} datas comemorativas${
        lidosClientes.length ? `; clientes: ${descreverResultadoClientes(r as ResultadoClientes)}` : ""
      }.`,
    });
    await registrar(c, ator, regs);
    // A prévia com dados pessoais é descartada depois de gravada.
    await c.query(
      `UPDATE lotes_importacao SET status = 'CONFIRMADA', resumo = $2, confirmado_por = $3, confirmado_em = now(),
         previa = jsonb_build_object('arquivo', previa->'arquivo', 'resumo', previa->'resumo') WHERE id = $1`,
      [loteId, JSON.stringify(r), usuarioId],
    );
    return r;
  });
}

export async function cancelarImportacao(loteId: number): Promise<void> {
  await query(
    `UPDATE lotes_importacao SET status = 'CANCELADA', previa = jsonb_build_object('arquivo', previa->'arquivo', 'resumo', previa->'resumo')
      WHERE id = $1 AND status = 'PREVIA'`,
    [loteId],
  );
}
