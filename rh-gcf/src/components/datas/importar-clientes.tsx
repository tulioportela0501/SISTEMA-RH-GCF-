"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload } from "lucide-react";
import { Botao, Modal, cx } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { PreviaClientesTabela } from "./previa-clientes";
import { api } from "@/lib/cliente/api";
import type { PreviaImportacaoClientes, ResultadoClientes } from "@/lib/server/importacao-clientes";

/**
 * Botão "Importar Excel" da aba Datas do Cliente: lê a planilha, mostra a prévia
 * (cadastrar, atualizar, ignorar ou corrigir), pede confirmação e grava no banco.
 */
export function ImportarClientes({ className }: { className?: string }) {
  const router = useRouter();
  const avisar = useAvisos();
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<PreviaImportacaoClientes | null>(null);
  const [substituir, setSubstituir] = useState<Set<string>>(new Set());
  const [gravando, setGravando] = useState(false);

  async function enviar(arquivo: File) {
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const r = await api<{ previa: PreviaImportacaoClientes }>("/api/importacao/clientes", { formData: fd });
      // A planilha geral é a fonte dos dados que ela traz: as diferenças já vêm marcadas para atualizar (dá para desmarcar)
      setSubstituir(new Set(r.previa.clientes.registros.filter((x) => x.acao === "ATUALIZAR" && x.conflitos.length).map((x) => x.id)));
      setPrevia(r.previa);
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : "Falha ao ler a planilha.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar() {
    if (!previa) return;
    setGravando(true);
    try {
      const { resultado: r } = await api<{ resultado: ResultadoClientes }>(`/api/importacao/clientes/${previa.loteId}`, { metodo: "POST", corpo: { substituir: [...substituir] } });
      avisar(
        "sucesso",
        `Importação concluída com sucesso! ${r.clientesCriados} ${r.clientesCriados === 1 ? "data cadastrada" : "datas cadastradas"}, ${r.clientesAtualizados} ${r.clientesAtualizados === 1 ? "atualizada" : "atualizadas"} e ${r.clientesIgnorados} ${r.clientesIgnorados === 1 ? "ignorada" : "ignoradas"}.`,
      );
      if (r.clientesCorrigir > 0) avisar("alerta", "Algumas informações não puderam ser importadas. Confira a prévia.");
      setPrevia(null);
      router.refresh();
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : "Falha ao gravar a importação.");
    } finally {
      setGravando(false);
    }
  }

  async function cancelar() {
    if (previa) await api(`/api/importacao/clientes/${previa.loteId}`, { metodo: "DELETE" }).catch(() => {});
    setPrevia(null);
  }

  const r = previa?.clientes.resumo;
  const nadaAFazer = !!r && r.novos === 0 && r.atualizar === 0;

  return (
    <>
      <label
        className={cx(
          "inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-borda bg-white px-4 text-sm font-medium text-texto transition-colors hover:bg-fundo focus-within:ring-2 focus-within:ring-azul-100",
          enviando && "pointer-events-none opacity-60",
          className,
        )}
        title="Importar a planilha geral de clientes (.xlsx ou .csv)"
      >
        <Upload className="size-4" aria-hidden />
        {enviando ? "Lendo a planilha…" : "Importar Excel"}
        <input
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          disabled={enviando}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) enviar(f);
            e.target.value = "";
          }}
        />
      </label>

      <Modal
        aberto={previa !== null}
        aoFechar={cancelar}
        largura="xl"
        titulo={previa ? `Conferência de “${previa.arquivo}”` : ""}
        descricao="Nada é gravado antes da sua confirmação. Clientes já cadastrados só têm os campos vazios completados."
        rodape={
          <>
            <Botao variante="fantasma" onClick={cancelar}>
              {nadaAFazer ? "Fechar" : "Cancelar"}
            </Botao>
            <Botao variante="primario" carregando={gravando} disabled={nadaAFazer} icone={<Upload className="size-4" />} onClick={confirmar} title={nadaAFazer ? "Nada novo para cadastrar ou atualizar" : undefined}>
              Confirmar importação
            </Botao>
          </>
        }
      >
        {previa && <PreviaClientesTabela previa={previa.clientes} substituir={substituir} setSubstituir={setSubstituir} arquivoJaImportado={previa.arquivoJaImportado} />}
      </Modal>
    </>
  );
}
