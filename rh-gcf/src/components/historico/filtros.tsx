"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Botao, Entrada, Selecao } from "@/components/ui";

export function FiltrosHistorico({ busca, operacao, de, ate, operacoes }: { busca: string; operacao: string; de: string; ate: string; operacoes: Record<string, string> }) {
  const router = useRouter();
  const [f, setF] = useState({ busca, operacao, de, ate });
  function aplicar(e: React.FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
    router.push(`/historico?${q.toString()}`);
  }
  return (
    <form onSubmit={aplicar} className="grid grid-cols-1 gap-2 border-b border-borda p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_160px_160px_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-fraco" aria-hidden />
        <Entrada aria-label="Pesquisar" placeholder="Funcionário, usuário ou descrição" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} className="pl-9" type="search" />
      </div>
      <Selecao aria-label="Operação" value={f.operacao} onChange={(e) => setF({ ...f, operacao: e.target.value })}>
        <option value="">Todas as operações</option>
        {Object.entries(operacoes).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Selecao>
      <Entrada aria-label="De" type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} />
      <Entrada aria-label="Até" type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} />
      <Botao type="submit" variante="primario">
        Filtrar
      </Botao>
    </form>
  );
}
