import "server-only";
import { createHash } from "node:crypto";
import { query, queryOne, transacao } from "./db";
import { ErroHttp } from "./http";
import { registrar, type Ator } from "./historico";
import { LIMITE_IMAGEM, analisarImagem, formatarTamanho, motivoImagemRecusada } from "@/lib/domain/imagem";
import type { UsuarioSessao } from "@/lib/domain/tipos";

/** Dados da imagem padrão sem o arquivo (para a tela). */
export interface ImagemFelicitacaoInfo {
  nome: string;
  tipo: "image/png" | "image/jpeg";
  tamanho: number;
  largura: number;
  altura: number;
  sha256: string;
  versao: number;
  atualizado_em: string;
  atualizado_por_nome: string | null;
}

const CAMPOS = "nome, tipo, tamanho, largura, altura, sha256, versao, atualizado_em, atualizado_por_nome";

export async function obterInfoImagem(): Promise<ImagemFelicitacaoInfo | null> {
  return queryOne<ImagemFelicitacaoInfo>(`SELECT ${CAMPOS} FROM felicitacoes_imagem WHERE id = 1`);
}

export async function obterImagem(): Promise<(ImagemFelicitacaoInfo & { dados: Buffer }) | null> {
  return queryOne<ImagemFelicitacaoInfo & { dados: Buffer }>(`SELECT ${CAMPOS}, dados FROM felicitacoes_imagem WHERE id = 1`);
}

/** Nome seguro para exibir e para o download (sem caminho nem caracteres de controle). */
function nomeSeguro(nome: string, extensao: string): string {
  const base = nome
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]*$/, "")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "")
    .trim()
    .slice(0, 80);
  return `${base || "felicitacao"}.${extensao}`;
}

/** Cadastra ou substitui a imagem padrão (somente administrador). */
export async function salvarImagem(dados: Buffer, nomeArquivo: string, ator: Ator, u: UsuarioSessao): Promise<ImagemFelicitacaoInfo> {
  if (dados.length === 0) throw new ErroHttp(400, "O arquivo está vazio.");
  if (dados.length > LIMITE_IMAGEM) throw new ErroHttp(413, `Imagem maior que ${formatarTamanho(LIMITE_IMAGEM)}. Reduza o tamanho e envie de novo.`);
  const info = analisarImagem(dados);
  if (!info) throw new ErroHttp(415, `${motivoImagemRecusada(dados, nomeArquivo)} Envie uma imagem PNG ou JPG.`);
  const nome = nomeSeguro(nomeArquivo, info.extensao);
  const sha256 = createHash("sha256").update(dados).digest("hex");
  return transacao(async (c) => {
    const anterior = (await c.query<ImagemFelicitacaoInfo>(`SELECT ${CAMPOS} FROM felicitacoes_imagem WHERE id = 1 FOR UPDATE`)).rows[0] ?? null;
    if (anterior?.sha256 === sha256) return anterior;
    await c.query(
      `INSERT INTO felicitacoes_imagem (id, nome, tipo, tamanho, largura, altura, sha256, dados, versao, atualizado_em, atualizado_por, atualizado_por_nome)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, 1, now(), $8, $9)
       ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, tipo = EXCLUDED.tipo, tamanho = EXCLUDED.tamanho, largura = EXCLUDED.largura,
         altura = EXCLUDED.altura, sha256 = EXCLUDED.sha256, dados = EXCLUDED.dados, versao = felicitacoes_imagem.versao + 1,
         atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por, atualizado_por_nome = EXCLUDED.atualizado_por_nome`,
      [nome, info.tipo, dados.length, info.largura, info.altura, sha256, dados, u.id, u.nome],
    );
    const descricaoNova = `${nome} (${info.largura} × ${info.altura}, ${formatarTamanho(dados.length)})`;
    await registrar(c, ator, [
      {
        operacao: anterior ? "ALTERACAO" : "CRIACAO",
        entidade: "FELICITACAO",
        registroNome: "Imagem de felicitação",
        campo: "imagem_padrao",
        campoLabel: "Imagem de felicitação",
        valorAnterior: anterior ? anterior.nome : null,
        valorNovo: descricaoNova,
        descricao: anterior ? `${ator.nome} substituiu a imagem de felicitação (${anterior.nome} → ${nome}).` : `${ator.nome} cadastrou a imagem de felicitação ${nome}.`,
      },
    ]);
    return (await c.query<ImagemFelicitacaoInfo>(`SELECT ${CAMPOS} FROM felicitacoes_imagem WHERE id = 1`)).rows[0];
  });
}

/** Remove a imagem padrão (somente administrador). As felicitações já registradas não são alteradas. */
export async function removerImagem(versao: number, ator: Ator): Promise<void> {
  await transacao(async (c) => {
    const atual = (await c.query<ImagemFelicitacaoInfo>(`SELECT ${CAMPOS} FROM felicitacoes_imagem WHERE id = 1 FOR UPDATE`)).rows[0];
    if (!atual) throw new ErroHttp(404, "Nenhuma imagem cadastrada.");
    if (atual.versao !== versao) throw new ErroHttp(409, "A imagem foi alterada por outra pessoa. Recarregue a página.");
    await c.query("DELETE FROM felicitacoes_imagem WHERE id = 1");
    await registrar(c, ator, [
      {
        operacao: "EXCLUSAO",
        entidade: "FELICITACAO",
        registroNome: "Imagem de felicitação",
        campo: "imagem_padrao",
        campoLabel: "Imagem de felicitação",
        valorAnterior: atual.nome,
        valorNovo: null,
        descricao: `${ator.nome} removeu a imagem de felicitação ${atual.nome}.`,
      },
    ]);
  });
}

/** sha256 da imagem atual (registrado na felicitação quando a imagem é usada). */
export async function shaImagemAtual(): Promise<string | null> {
  const r = await query<{ sha256: string }>("SELECT sha256 FROM felicitacoes_imagem WHERE id = 1");
  return r[0]?.sha256 ?? null;
}
