"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, CheckCircle2, FileSpreadsheet, RefreshCw, Upload, UserX } from "lucide-react";
import { Aviso, Botao, Cartao, Etiqueta, cx } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { PreviaClientesTabela, quandoImportado } from "@/components/datas/previa-clientes";
import { api } from "@/lib/cliente/api";
import { formatarData, formatarDiaMes } from "@/lib/domain/datas";
import type { Previa } from "@/lib/server/importacao";

function Amostra({ hex }: { hex: string | null }) {
  return <span className="inline-block size-3.5 shrink-0 rounded-sm border border-borda-forte" style={{ background: hex ? `#${hex}` : "transparent" }} title={hex ? `Cor da linha: #${hex}` : "Sem cor"} aria-hidden />;
}

export function Importador() {
  const router = useRouter();
  const avisar = useAvisos();
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<Record<string, number> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [substituirClientes, setSubstituirClientes] = useState<Set<string>>(new Set());
  // Funcionários já cadastrados com informações diferentes: só são atualizados se marcados (padrão: manter o sistema)
  const [atualizarFuncionarios, setAtualizarFuncionarios] = useState<Set<number>>(new Set());

  async function enviar(arquivo: File) {
    setErro(null);
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const r = await api<{ previa: Previa }>("/api/importacao", { formData: fd });
      setSubstituirClientes(new Set(r.previa.clientes.registros.filter((x) => x.acao === "ATUALIZAR" && x.conflitos.length).map((x) => x.id)));
      setAtualizarFuncionarios(new Set());
      setPrevia(r.previa);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler a planilha.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar() {
    if (!previa) return;
    setGravando(true);
    try {
      const r = await api<{ resultado: Record<string, number> }>(`/api/importacao/${previa.loteId}`, { metodo: "POST", corpo: { substituirClientes: [...substituirClientes], atualizarFuncionarios: [...atualizarFuncionarios] } });
      setResultado(r.resultado);
      avisar("sucesso", "Importação concluída com sucesso!");
      router.refresh();
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : "Falha ao gravar a importação.");
    } finally {
      setGravando(false);
    }
  }

  async function cancelar() {
    if (previa) await api(`/api/importacao/${previa.loteId}`, { metodo: "DELETE" }).catch(() => {});
    setPrevia(null);
  }

  if (resultado) {
    return (
      <Cartao>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="size-10 text-verde-600" />
          <h2 className="text-lg font-semibold">Importação concluída</h2>
          <p className="max-w-lg text-sm text-texto-suave">
            {resultado.criados} funcionários cadastrados, {resultado.atualizados} já existentes atualizados ({resultado.camposCompletados ?? 0} campos completados
            {resultado.camposAtualizados ? ` e ${resultado.camposAtualizados} substituídos pelos valores da planilha` : ""}), {resultado.desligados} identificados como desligados e {resultado.datasCriadas} datas
            comemorativas.
            {resultado.clientesCriados !== undefined &&
              ` Clientes: ${resultado.clientesCriados} datas cadastradas, ${resultado.clientesAtualizados} atualizadas e ${resultado.clientesIgnorados} ignoradas.`}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href="/funcionarios?filtro=todos" className="inline-flex h-10 items-center rounded-lg bg-azul-600 px-4 text-sm font-medium text-white hover:bg-azul-700">
              Ver funcionários
            </Link>
            <Link href="/funcionarios?filtro=desligados" className="inline-flex h-10 items-center rounded-lg border border-borda px-4 text-sm font-medium hover:bg-fundo">
              Ver desligados
            </Link>
            <Link href="/datas-comemorativas" className="inline-flex h-10 items-center rounded-lg border border-borda px-4 text-sm font-medium hover:bg-fundo">
              Ver datas comemorativas
            </Link>
            {resultado.clientesCriados !== undefined && (
              <Link href="/datas-cliente" className="inline-flex h-10 items-center rounded-lg border border-borda px-4 text-sm font-medium hover:bg-fundo">
                Ver clientes
              </Link>
            )}
          </div>
        </div>
      </Cartao>
    );
  }

  if (!previa) {
    return (
      <Cartao titulo="Enviar planilha" descricao="Arquivo .xlsx no formato da planilha RH GCF (aba Base).">
        {erro && (
          <div className="mb-4">
            <Aviso tom="vermelho">{erro}</Aviso>
          </div>
        )}
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-borda-forte px-6 py-12 text-center transition-colors hover:border-azul-400 hover:bg-azul-50/50">
          <FileSpreadsheet className="size-10 text-azul-500" />
          <span className="text-sm font-medium text-texto">{enviando ? "Lendo a planilha…" : "Clique para escolher o arquivo Excel"}</span>
          <span className="max-w-md text-xs text-texto-suave">
            As 34 colunas da aba Base são lidas. Linhas com preenchimento vermelho entram como Desligado. Linhas “COMEMORAR” viram datas comemorativas. Uma aba com relação de clientes (Cliente/Razão social, CNPJ, datas) vai para Datas do Cliente. Nada é gravado antes da sua confirmação.
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={enviando}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) enviar(f);
              e.target.value = "";
            }}
          />
        </label>
      </Cartao>
    );
  }

  const r = previa.resumo;
  const desligados = previa.linhas.filter((l) => l.desligado);
  const clientes = previa.clientes;
  const datasRepetidas = r.datasComemorativas - r.datasNovas;
  const comAvisos = (r.linhasComAvisos ?? 0) > 0 || previa.datas.some((d) => d.avisos.length > 0);
  const comDiferencas = previa.linhas.filter((l) => (l.existente?.diferencas ?? []).length > 0);
  const alternar = (linha: number) =>
    setAtualizarFuncionarios((atual) => {
      const novo = new Set(atual);
      if (novo.has(linha)) novo.delete(linha);
      else novo.add(linha);
      return novo;
    });

  return (
    <div className="flex flex-col gap-5 pb-24">
      <Aviso tom="azul" titulo={`Conferência de “${previa.arquivo}”`}>
        {previa.leitura.colunasEncontradas.length} de 34 colunas encontradas na aba {previa.leitura.abaBase}.
        {previa.leitura.colunasAusentes.length > 0 && ` Ausentes: ${previa.leitura.colunasAusentes.join(", ")}.`} As abas aux e Calendário não são importadas: as datas são recalculadas pelo sistema.
        {r.existentes > 0 &&
          ` ${r.existentes} funcionários já existem no sistema: os campos vazios serão completados.${
            comDiferencas.length ? ` ${comDiferencas.length} têm informações diferentes da planilha: marque abaixo quais devem ser atualizados (os demais mantêm o que está no sistema).` : " Nenhuma informação diferente."
          } Célula vazia na planilha nunca apaga um dado.`}
        {clientes.abas.length > 0
          ? ` Relação de clientes encontrada (aba ${clientes.abas.map((a) => a.nome).join(", ")}): vai para Datas do Cliente.`
          : " Nenhuma aba com relação de clientes neste arquivo (as linhas COMEMORAR, como “CLIENTES DO MÊS”, são datas do escritório)."}
      </Aviso>

      {previa.arquivoJaImportado && (
        <Aviso tom="azul" titulo="Este arquivo já foi importado.">
          Mesmo conteúdo importado em {quandoImportado(previa.arquivoJaImportado)}. Nada será duplicado: os funcionários já cadastrados são reconhecidos pelo nome ou e-mail.
        </Aviso>
      )}
      {(previa.nomesRepetidos.length > 0 || datasRepetidas > 0) && (
        <Aviso tom="ambar" titulo="Foram encontrados registros duplicados.">
          {previa.nomesRepetidos.length > 0 &&
            `Nomes repetidos na aba Base: ${previa.nomesRepetidos.map((n) => `${n.nome} (linhas ${n.linhas.join(", ")})`).join("; ")}. Confira antes de confirmar. `}
          {datasRepetidas > 0 && `${datasRepetidas} ${datasRepetidas === 1 ? "data comemorativa já está cadastrada e será ignorada" : "datas comemorativas já estão cadastradas e serão ignoradas"}.`}
        </Aviso>
      )}
      {comAvisos && (
        <Aviso tom="ambar" titulo="Algumas informações não puderam ser importadas. Confira a prévia.">
          Valores que não puderam ser lidos (ex.: data inválida) aparecem em amarelo na coluna “Informações faltando” e ficam vazios para corrigir depois da importação.
        </Aviso>
      )}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { r: "Funcionários na planilha", v: r.funcionarios, cor: "text-texto" },
          { r: "Ativos", v: r.ativos, cor: "text-azul-600" },
          { r: "Desligados (vermelho)", v: r.desligados, cor: "text-vermelho-600" },
          { r: "Cadastros incompletos", v: r.incompletos, cor: "text-ambar-600" },
          { r: "Datas comemorativas", v: r.datasComemorativas, cor: "text-texto" },
        ].map((x) => (
          <div key={x.r} className="rounded-xl border border-borda bg-white p-4">
            <p className="text-[13px] text-texto-suave">{x.r}</p>
            <p className={cx("numeros mt-1 text-2xl font-bold", x.cor)}>{x.v}</p>
          </div>
        ))}
      </section>

      {comDiferencas.length > 0 && (
        <Cartao
          titulo="Já cadastrados com informações diferentes"
          icone={<RefreshCw className="size-5 text-azul-600" />}
          descricao="Marque os funcionários que devem receber os valores da planilha. Desmarcados mantêm o que está no sistema (os campos vazios são completados de qualquer forma)."
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <Botao tamanho="sm" onClick={() => setAtualizarFuncionarios(new Set(comDiferencas.map((l) => l.linha)))}>
              Marcar todos ({comDiferencas.length})
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setAtualizarFuncionarios(new Set())}>
              Desmarcar todos
            </Botao>
          </div>
          <ul className="flex flex-col gap-3">
            {comDiferencas.map((l) => {
              const marcado = atualizarFuncionarios.has(l.linha);
              return (
                <li key={l.linha} className={cx("rounded-lg border p-3", marcado ? "border-azul-300 bg-azul-50/50" : "border-borda")}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" className="mt-0.5 size-4 accent-azul-600" checked={marcado} onChange={() => alternar(l.linha)} aria-label={`Atualizar ${l.valores.nome ?? ""} com os valores da planilha`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-texto">
                        {l.existente!.nomeAtual ?? l.valores.nome} <span className="font-normal text-texto-suave">· linha {l.linha}</span>
                      </span>
                      <span className="text-xs text-texto-suave">{marcado ? "Será atualizado com os valores da planilha." : "Mantém os valores do sistema."}</span>
                    </span>
                  </label>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-[13px]">
                      <thead>
                        <tr className="text-left text-xs text-texto-suave">
                          <th className="py-1 pr-3 font-medium">Campo</th>
                          <th className="py-1 pr-3 font-medium">No sistema</th>
                          <th className="py-1 font-medium">Na planilha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.existente!.diferencas.map((d) => (
                          <tr key={d.campo} className="border-t border-borda">
                            <td className="py-1.5 pr-3 font-medium text-texto">{d.label}</td>
                            <td className={cx("py-1.5 pr-3", marcado ? "text-texto-fraco line-through" : "text-texto")}>{d.textoAtual}</td>
                            <td className={cx("py-1.5", marcado ? "font-medium text-azul-700" : "text-texto-suave")}>{d.textoPlanilha}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      <Cartao titulo="Identificados como desligados" icone={<UserX className="size-5 text-vermelho-600" />} descricao="Linhas com preenchimento vermelho na planilha. Destaques amarelos ou azuis não contam.">
        {desligados.length === 0 ? (
          <p className="text-[13px] text-texto-suave">Nenhuma linha em vermelho.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {desligados.map((l) => (
              <li key={l.linha} className="flex items-center justify-between gap-3 rounded-lg border border-vermelho-200 bg-vermelho-50 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{l.valores.nome}</span>
                  <span className="text-xs text-texto-suave">
                    Linha {l.linha}, {l.valores.situacao}
                  </span>
                </span>
                <Amostra hex={l.cor.hex} />
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Funcionários da aba Base" corpoClassName="p-0 pt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-y border-borda bg-fundo/60 text-left text-xs font-semibold text-texto-suave">
                <th className="px-4 py-2.5">Linha</th>
                <th className="px-3 py-2.5">Nome</th>
                <th className="px-3 py-2.5">Situação</th>
                <th className="px-3 py-2.5">Modalidade</th>
                <th className="px-3 py-2.5">Admissão</th>
                <th className="px-3 py-2.5">Status do vínculo</th>
                <th className="px-3 py-2.5">Informações faltando</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {previa.linhas.map((l) => (
                <tr key={l.linha} className={l.desligado ? "bg-vermelho-50/70" : undefined}>
                  <td className="numeros px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <Amostra hex={l.cor.hex} /> {l.linha}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    {l.valores.nome || <span className="italic text-vermelho-600">sem nome</span>}
                    {l.existente && <Etiqueta className="ml-2">Já cadastrado</Etiqueta>}
                    {(l.existente?.diferencas ?? []).length > 0 && (
                      <Etiqueta tom={atualizarFuncionarios.has(l.linha) ? "azul" : "ambar"} className="ml-1">
                        {atualizarFuncionarios.has(l.linha) ? "Será atualizado" : `${l.existente!.diferencas.length} diferença${l.existente!.diferencas.length === 1 ? "" : "s"}`}
                      </Etiqueta>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{l.valores.situacao || "—"}</td>
                  <td className="px-3 py-2.5">{l.valores.modalidade || "—"}</td>
                  <td className="numeros px-3 py-2.5">{formatarData(l.valores.admissao) || "—"}</td>
                  <td className="px-3 py-2.5">{l.desligado ? <Etiqueta tom="vermelho">Desligado</Etiqueta> : <Etiqueta tom="azul">Ativo</Etiqueta>}</td>
                  <td className="px-3 py-2.5 text-texto-suave">
                    {l.analise.pendencias.length ? l.analise.pendencias.map((p) => p.label).join(", ") : <span className="text-verde-600">Completo</span>}
                    {l.avisos.map((a) => (
                      <span key={a} className="block text-ambar-600">
                        {a}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      {clientes.registros.length > 0 && (
        <Cartao titulo="Clientes → Datas do Cliente" icone={<Building2 className="size-5 text-azul-600" />} descricao="Relação de clientes encontrada em outra aba do arquivo. A duplicidade é verificada pelo CNPJ e, sem CNPJ, pelo nome.">
          <PreviaClientesTabela previa={clientes} substituir={substituirClientes} setSubstituir={setSubstituirClientes} />
        </Cartao>
      )}

      <Cartao titulo="Datas comemorativas" descricao="Linhas com Modalidade “COMEMORAR”. Repetem todo ano.">
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2 xl:grid-cols-3">
          {previa.datas.map((d) => (
            <li key={d.linha} className={cx("flex items-center justify-between gap-3", d.existenteId && "text-texto-fraco")}>
              <span className="truncate">{d.titulo}</span>
              <span className="numeros shrink-0">
                {formatarDiaMes(d.data)}
                {d.existenteId ? " (já cadastrada)" : ""}
              </span>
            </li>
          ))}
        </ul>
      </Cartao>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-white/95 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <Botao variante="fantasma" onClick={cancelar}>
            Cancelar
          </Botao>
          <Botao variante="primario" carregando={gravando} icone={<Upload className="size-4" />} onClick={confirmar}>
            Confirmar importação
          </Botao>
        </div>
      </div>
    </div>
  );
}
