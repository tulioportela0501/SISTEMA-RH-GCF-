"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Botao, Campo, Modal, Selecao } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api } from "@/lib/cliente/api";

/** Dia do mês usado nas felicitações quando o Início GCF tem só mês e ano (somente administrador). */
export function ConfigDiaPadrao({ dia, versao }: { dia: number; versao: number }) {
  const router = useRouter();
  const avisar = useAvisos();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(dia);
  const [salvando, setSalvando] = useState(false);
  return (
    <>
      <Botao icone={<Settings2 className="size-4" />} onClick={() => (setValor(dia), setAberto(true))}>
        Dia das felicitações: {dia}
      </Botao>
      <Modal
        aberto={aberto}
        largura="sm"
        aoFechar={() => setAberto(false)}
        titulo="Dia padrão das felicitações"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={salvando}
              onClick={async () => {
                setSalvando(true);
                try {
                  await api("/api/felicitacoes/config", { metodo: "PUT", corpo: { dia_padrao: valor, versao } });
                  avisar("sucesso", "Dia padrão das felicitações salvo.");
                  setAberto(false);
                  router.refresh();
                } catch (e) {
                  avisar("erro", e instanceof Error ? e.message : "Não foi possível salvar.");
                } finally {
                  setSalvando(false);
                }
              }}
            >
              Salvar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-texto-suave">
            A planilha geral informa só o mês e o ano do Início GCF. O sistema não inventa o dia: a felicitação fica marcada para este dia do mês de aniversário. Clientes com a data exata usam o dia real.
          </p>
          <Campo label="Dia do mês" htmlFor="dia-padrao">
            <Selecao id="dia-padrao" value={valor} onChange={(e) => setValor(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Dia {d}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
      </Modal>
    </>
  );
}
