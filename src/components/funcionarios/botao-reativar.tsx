"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserCheck } from "lucide-react";
import { Botao } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api } from "@/lib/cliente/api";

/** Reativa um funcionário desligado (somente administrador). */
export function BotaoReativar({ id, nome, versao }: { id: number; nome: string; versao: number }) {
  const router = useRouter();
  const avisar = useAvisos();
  const [enviando, setEnviando] = useState(false);
  async function reativar() {
    if (!window.confirm(`Reativar ${nome}? O funcionário volta para o dashboard e os alertas.`)) return;
    setEnviando(true);
    try {
      await api(`/api/funcionarios/${id}/status`, { corpo: { status: "ATIVO", versao } });
      avisar("sucesso", `${nome} reativado.`);
      router.refresh();
    } catch (e) {
      avisar("erro", e instanceof Error ? e.message : "Não foi possível reativar.");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Botao onClick={reativar} carregando={enviando} icone={<UserCheck className="size-4" />}>
      Reativar
    </Botao>
  );
}
