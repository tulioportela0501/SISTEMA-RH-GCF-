"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { AreaTexto, Botao, CaixaMarcacao, Campo, Cartao, Entrada, Etiqueta, Modal, Selecao, cx } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { MenuExportar } from "@/components/exportar";
import { api } from "@/lib/cliente/api";
import { formatarData, formatarDiaMes } from "@/lib/domain/datas";
import { CATEGORIAS_DATA_COMEMORATIVA, type DataComemorativa } from "@/lib/domain/tipos";

type Form = { titulo: string; data: string; recorrente: boolean; categoria: string; descricao: string };
const VAZIO: Form = { titulo: "", data: "", recorrente: true, categoria: "Data comemorativa", descricao: "" };

/** Datas do escritório (as linhas "COMEMORAR" da planilha e outras cadastradas pelo RH). */
export function GestaoDatasComemorativas({ datas }: { datas: DataComemorativa[] }) {
  const router = useRouter();
  const avisar = useAvisos();
  const [editando, setEditando] = useState<DataComemorativa | "nova" | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrir(d: DataComemorativa | "nova") {
    setErro(null);
    setEditando(d);
    setForm(d === "nova" ? VAZIO : { titulo: d.titulo, data: d.data, recorrente: d.recorrente, categoria: d.categoria, descricao: d.descricao ?? "" });
  }

  async function salvar() {
    if (!form.titulo.trim()) return setErro("Informe o nome da data.");
    if (!form.data) return setErro("Informe a data.");
    setSalvando(true);
    setErro(null);
    try {
      const dados = { ...form, descricao: form.descricao || null };
      if (editando === "nova") await api("/api/datas-comemorativas", { corpo: { dados } });
      else if (editando) await api(`/api/datas-comemorativas/${editando.id}`, { metodo: "PUT", corpo: { dados, versao: editando.versao } });
      avisar("sucesso", "Data salva.");
      setEditando(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(d: DataComemorativa) {
    try {
      await api(`/api/datas-comemorativas/${d.id}/ativo`, { corpo: { ativo: !d.ativo } });
      avisar("sucesso", d.ativo ? "Data desativada." : "Data reativada.");
      setEditando(null);
      router.refresh();
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : "Não foi possível alterar.");
    }
  }

  return (
    <Cartao
      titulo="Outras datas importantes"
      descricao="Datas do escritório. As linhas “COMEMORAR” da planilha estão aqui."
      acoes={
        <>
          <MenuExportar tamanho="sm" opcoes={[{ rotulo: "Datas do escritório", descricao: "Exporta as datas cadastradas nesta tabela.", url: "/api/exportar/datas-comemorativas?conteudo=escritorio" }]} />
          <Botao variante="primario" tamanho="sm" icone={<Plus className="size-4" />} onClick={() => abrir("nova")}>
            Nova data
          </Botao>
        </>
      }
      corpoClassName="p-0 pt-4"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-y border-borda bg-fundo/60 text-left text-xs font-semibold text-texto-suave">
              <th className="px-5 py-2.5">Data</th>
              <th className="px-3 py-2.5">Nome</th>
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">Situação</th>
              <th className="px-5 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {datas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-[13px] text-texto-fraco">
                  Nenhuma data cadastrada. Importe a planilha ou clique em Nova data.
                </td>
              </tr>
            )}
            {datas.map((d) => (
              <tr key={d.id} className={cx(!d.ativo && "text-texto-fraco")}>
                <td className="numeros px-5 py-2.5">{d.recorrente ? `${formatarDiaMes(d.data)} (todo ano)` : formatarData(d.data)}</td>
                <td className="px-3 py-2.5 font-medium">{d.titulo}</td>
                <td className="px-3 py-2.5 text-texto-suave">{d.categoria}</td>
                <td className="px-3 py-2.5">{d.ativo ? <Etiqueta tom="azul">Ativa</Etiqueta> : <Etiqueta>Desativada</Etiqueta>}</td>
                <td className="px-5 py-2.5 text-right">
                  <button onClick={() => abrir(d)} className="rounded-md p-1.5 text-texto-suave hover:bg-azul-50 hover:text-azul-600" aria-label={`Editar ${d.titulo}`}>
                    <Pencil className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={editando === "nova" ? "Nova data" : "Editar data"}
        rodape={
          <>
            {editando && editando !== "nova" && (
              <Botao variante="fantasma" className="mr-auto" onClick={() => alternarAtivo(editando)}>
                {editando.ativo ? "Desativar" : "Reativar"}
              </Botao>
            )}
            <Botao variante="fantasma" onClick={() => setEditando(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvando} onClick={salvar}>
              Salvar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <p className="rounded-lg bg-vermelho-50 px-3 py-2 text-[13px] text-vermelho-600">{erro}</p>}
          <Campo label="Nome" htmlFor="dc-titulo" obrigatorio>
            <Entrada id="dc-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Data" htmlFor="dc-data" obrigatorio>
              <Entrada id="dc-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </Campo>
            <Campo label="Tipo" htmlFor="dc-cat">
              <Selecao id="dc-cat" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {[...new Set([...CATEGORIAS_DATA_COMEMORATIVA, form.categoria])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Selecao>
            </Campo>
          </div>
          <CaixaMarcacao label="Repetir todo ano (usa só dia e mês)" checked={form.recorrente} onChange={(v) => setForm({ ...form, recorrente: v })} />
          <Campo label="Observação" htmlFor="dc-desc">
            <AreaTexto id="dc-desc" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </Campo>
        </div>
      </Modal>
    </Cartao>
  );
}
