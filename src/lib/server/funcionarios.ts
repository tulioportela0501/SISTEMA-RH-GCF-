import "server-only";
import type { PoolClient } from "pg";
import { query, queryOne, transacao, type Executor } from "./db";
import { ErroHttp } from "./http";
import { diferencasFuncionario, registrar, type Ator, type NovoRegistro } from "./historico";
import { CAMPO_POR_CHAVE, CAMPOS_OBRIGATORIOS, CHAVES_CAMPOS, type CampoChave } from "@/lib/domain/campos";
import { conferirObrigatorios, validarCampo, type FuncionarioEntrada } from "@/lib/domain/validacao";
import { mesmoValorCampo } from "@/lib/domain/comparacao";
import { CAMPOS_EDICAO_LOTE } from "@/lib/domain/planilha";
import { valorLegivel } from "./historico";
import { hojeFortaleza } from "@/lib/domain/datas";
import type { Funcionario, StatusVinculo, UsuarioSessao, ValoresCampos } from "@/lib/domain/tipos";

const SELECT_FUNCIONARIO = `SELECT id, ${CHAVES_CAMPOS.join(", ")}, status_vinculo, desligado_em, origem,
  linha_planilha, cor_planilha, versao, criado_em, atualizado_em FROM funcionarios`;

export async function listarFuncionarios(ex?: Executor): Promise<Funcionario[]> {
  return query<Funcionario>(`${SELECT_FUNCIONARIO} ORDER BY lower(coalesce(nome, '')), id`, [], ex);
}

export async function obterFuncionario(id: number, ex?: Executor): Promise<Funcionario | null> {
  return queryOne<Funcionario>(`${SELECT_FUNCIONARIO} WHERE id = $1`, [id], ex);
}

function nomeRegistro(f: Partial<ValoresCampos> & { id?: number }): string {
  return f.nome?.trim() || `Registro #${f.id ?? "?"}`;
}

/** Registro de histórico para a troca do Status do vínculo. */
function registroStatus(id: number, nome: string, de: StatusVinculo, para: StatusVinculo, ator: Ator): NovoRegistro {
  const rotulo = (s: StatusVinculo) => (s === "ATIVO" ? "Ativo" : "Desligado");
  return {
    operacao: para === "ATIVO" ? "REATIVACAO" : "DESLIGAMENTO",
    entidade: "FUNCIONARIO",
    entidadeId: id,
    registroNome: nome,
    campo: "status_vinculo",
    campoLabel: "Status do vínculo",
    valorAnterior: rotulo(de),
    valorNovo: rotulo(para),
    descricao:
      para === "ATIVO"
        ? `${ator.nome} reativou ${nome} (Status do vínculo de Desligado para Ativo).`
        : `${ator.nome} desligou ${nome} (Status do vínculo de Ativo para Desligado).`,
  };
}

export async function criarFuncionario(dados: FuncionarioEntrada, status: StatusVinculo, u: UsuarioSessao, ator: Ator): Promise<Funcionario> {
  const faltando = conferirObrigatorios(dados, "criacao");
  if (faltando) throw new ErroHttp(422, faltando.mensagem, { campo: faltando.campo });
  if (status === "DESLIGADO" && u.perfil !== "ADMIN") throw new ErroHttp(403, "Somente administradores alteram o Status do vínculo.");
  return transacao(async (c) => {
    const valores = CHAVES_CAMPOS.map((k) => dados[k] ?? null);
    const n = CHAVES_CAMPOS.length;
    const r = await c.query<{ id: number }>(
      `INSERT INTO funcionarios (${CHAVES_CAMPOS.join(", ")}, status_vinculo, desligado_em, origem, criado_por, atualizado_por)
       VALUES (${CHAVES_CAMPOS.map((_, i) => `$${i + 1}`).join(", ")}, $${n + 1}, $${n + 2}, 'MANUAL', $${n + 3}, $${n + 3}) RETURNING id`,
      [...valores, status, status === "DESLIGADO" ? hojeFortaleza() : null, u.id],
    );
    const id = r.rows[0].id;
    const preenchidos = CHAVES_CAMPOS.filter((k) => dados[k]).length;
    await registrar(c, ator, [
      {
        operacao: "CRIACAO",
        entidade: "FUNCIONARIO",
        entidadeId: id,
        registroNome: nomeRegistro(dados),
        descricao: `${ator.nome} cadastrou ${nomeRegistro(dados)} (${preenchidos} de 34 campos preenchidos, Status do vínculo ${status === "ATIVO" ? "Ativo" : "Desligado"}).`,
      },
    ]);
    return (await obterFuncionario(id, c))!;
  });
}

export async function atualizarFuncionario(
  id: number,
  dados: FuncionarioEntrada,
  status: StatusVinculo | undefined,
  versao: number,
  u: UsuarioSessao,
  ator: Ator,
): Promise<{ funcionario: Funcionario; alteracoes: number; aviso: string | null }> {
  return transacao(async (c) => {
    const atual = (await c.query<Funcionario>(`${SELECT_FUNCIONARIO} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Funcionário não encontrado.");
    if (atual.versao !== versao)
      throw new ErroHttp(409, "Este cadastro foi alterado por outra pessoa enquanto você editava. Recarregue a página para ver a versão atual.");

    const novos: Record<string, string | null> = Object.fromEntries(CHAVES_CAMPOS.map((k) => [k, atual[k]]));
    for (const k of Object.keys(dados) as CampoChave[]) if (CHAVES_CAMPOS.includes(k)) novos[k] = dados[k] ?? null;

    const faltando = conferirObrigatorios(novos as Partial<ValoresCampos>, "edicao", atual);
    if (faltando) throw new ErroHttp(422, faltando.mensagem, { campo: faltando.campo });

    const nome = nomeRegistro({ ...novos, id });
    const regs = diferencasFuncionario(atual as unknown as Record<string, string | null>, novos, CHAVES_CAMPOS, { ator: ator.nome, funcionarioId: id, nome });
    const alterados = regs.map((r) => r.campo as CampoChave);

    const mudaStatus = status !== undefined && status !== atual.status_vinculo;
    if (mudaStatus && u.perfil !== "ADMIN") throw new ErroHttp(403, "Somente administradores alteram o Status do vínculo.");
    if (alterados.length === 0 && !mudaStatus) return { funcionario: atual, alteracoes: 0, aviso: null };

    const sets = alterados.map((k, i) => `${k} = $${i + 2}`);
    const params: unknown[] = [id, ...alterados.map((k) => novos[k])];
    if (mudaStatus) {
      params.push(status, status === "DESLIGADO" ? hojeFortaleza() : null);
      sets.push(`status_vinculo = $${params.length - 1}`, `desligado_em = $${params.length}`);
      regs.push(registroStatus(id, nome, atual.status_vinculo, status!, ator));
    }
    params.push(u.id);
    await c.query(`UPDATE funcionarios SET ${sets.join(", ")}, versao = versao + 1, atualizado_em = now(), atualizado_por = $${params.length} WHERE id = $1`, params);
    await registrar(c, ator, regs);

    const funcionario = (await obterFuncionario(id, c))!;
    const aindaIncompleto = CAMPOS_OBRIGATORIOS.filter((k) => !funcionario[k]);
    const aviso = aindaIncompleto.length
      ? `Alterações salvas. O cadastro continua incompleto: falta ${aindaIncompleto.map((k) => CAMPO_POR_CHAVE[k].label).join(", ")}.`
      : null;
    return { funcionario, alteracoes: regs.length, aviso };
  });
}

/** Reativar (ou desligar) direto pela ficha — somente administrador. */
export async function alterarStatusVinculo(id: number, status: StatusVinculo, versao: number, ator: Ator, usuarioId: number): Promise<Funcionario> {
  return transacao(async (c: PoolClient) => {
    const atual = (await c.query<Funcionario>(`${SELECT_FUNCIONARIO} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Funcionário não encontrado.");
    if (atual.versao !== versao) throw new ErroHttp(409, "Este cadastro foi alterado por outra pessoa. Recarregue a página.");
    if (atual.status_vinculo === status) return atual;
    await c.query(
      "UPDATE funcionarios SET status_vinculo = $2, desligado_em = $3, versao = versao + 1, atualizado_em = now(), atualizado_por = $4 WHERE id = $1",
      [id, status, status === "DESLIGADO" ? hojeFortaleza() : null, usuarioId],
    );
    await registrar(c, ator, [registroStatus(id, nomeRegistro(atual), atual.status_vinculo, status, ator)]);
    return (await obterFuncionario(id, c))!;
  });
}

// ---------------------------------------------------------------------
// Planilha Geral: edição de uma célula e edição em lote
// ---------------------------------------------------------------------

/**
 * Altera um único campo (edição direto na célula da planilha).
 * "anterior" é o valor que o usuário via na tela: se outra pessoa mudou este campo nesse meio-tempo,
 * nada é gravado (409). Alterações de outros campos não atrapalham.
 */
export async function atualizarCampoFuncionario(
  id: number,
  campo: CampoChave,
  valor: unknown,
  anterior: string | null,
  u: UsuarioSessao,
  ator: Ator,
): Promise<{ funcionario: Funcionario; alterado: boolean }> {
  const novo = validarCampo(campo, valor);
  return transacao(async (c) => {
    const atual = (await c.query<Funcionario>(`${SELECT_FUNCIONARIO} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!atual) throw new ErroHttp(404, "Funcionário não encontrado.");
    if ((atual[campo] ?? null) !== (anterior ?? null) && !mesmoValorCampo(campo, atual[campo], anterior))
      throw new ErroHttp(409, `${CAMPO_POR_CHAVE[campo].label} foi alterado por outra pessoa (agora: ${valorLegivel(campo, atual[campo])}). A planilha foi atualizada; confira e edite de novo.`, {
        funcionario: atual,
      });
    if ((atual[campo] ?? null) === novo) return { funcionario: atual, alterado: false };
    const faltando = conferirObrigatorios({ ...atual, [campo]: novo } as Partial<ValoresCampos>, "edicao", atual);
    if (faltando?.campo === campo) throw new ErroHttp(422, faltando.mensagem, { campo });
    const nome = nomeRegistro({ ...atual, [campo]: novo, id });
    const regs = diferencasFuncionario(atual as unknown as Record<string, string | null>, { ...(atual as unknown as Record<string, string | null>), [campo]: novo }, [campo], {
      ator: ator.nome,
      funcionarioId: id,
      nome,
    }).map((r) => ({ ...r, descricao: `${r.descricao} (na Planilha Geral)` }));
    await c.query(`UPDATE funcionarios SET ${campo} = $2, versao = versao + 1, atualizado_em = now(), atualizado_por = $3 WHERE id = $1`, [id, novo, u.id]);
    await registrar(c, ator, regs);
    return { funcionario: (await obterFuncionario(id, c))!, alterado: true };
  });
}


/** Aplica o mesmo valor em um campo de vários funcionários (somente administrador). */
export async function editarEmLote(ids: number[], campo: CampoChave, valor: unknown, u: UsuarioSessao, ator: Ator): Promise<{ funcionarios: Funcionario[]; alterados: number }> {
  if (u.perfil !== "ADMIN") throw new ErroHttp(403, "Somente administradores editam em lote.");
  if (!CAMPOS_EDICAO_LOTE.includes(campo)) throw new ErroHttp(422, `${CAMPO_POR_CHAVE[campo].label} não pode ser alterado em lote.`);
  const novo = validarCampo(campo, valor);
  if (novo == null && CAMPOS_OBRIGATORIOS.includes(campo)) throw new ErroHttp(422, `${CAMPO_POR_CHAVE[campo].label} é obrigatório e não pode ficar vazio.`);
  const unicos = [...new Set(ids)];
  return transacao(async (c) => {
    const atuais = (await c.query<Funcionario>(`${SELECT_FUNCIONARIO} WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [unicos])).rows;
    if (atuais.length !== unicos.length) throw new ErroHttp(404, "Algum funcionário selecionado não existe mais. Recarregue a página.");
    const regs: NovoRegistro[] = [];
    const mudar = atuais.filter((f) => (f[campo] ?? null) !== novo);
    for (const f of mudar) {
      const nome = nomeRegistro(f);
      regs.push(
        ...diferencasFuncionario(f as unknown as Record<string, string | null>, { ...(f as unknown as Record<string, string | null>), [campo]: novo }, [campo], { ator: ator.nome, funcionarioId: f.id, nome }).map(
          (r) => ({ ...r, descricao: `${r.descricao} (edição em lote)` }),
        ),
      );
    }
    if (mudar.length) {
      await c.query(`UPDATE funcionarios SET ${campo} = $2, versao = versao + 1, atualizado_em = now(), atualizado_por = $3 WHERE id = ANY($1::int[])`, [mudar.map((f) => f.id), novo, u.id]);
      regs.unshift({
        operacao: "ALTERACAO",
        entidade: "FUNCIONARIO",
        registroNome: `${mudar.length} funcionários`,
        descricao: `${ator.nome} editou em lote ${CAMPO_POR_CHAVE[campo].label} = ${valorLegivel(campo, novo)} em ${mudar.length} de ${atuais.length} funcionários selecionados.`,
      });
      await registrar(c, ator, regs);
    }
    const funcionarios = (await c.query<Funcionario>(`${SELECT_FUNCIONARIO} WHERE id = ANY($1::int[])`, [unicos])).rows;
    return { funcionarios, alterados: mudar.length };
  });
}
