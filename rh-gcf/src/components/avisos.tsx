"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";
import { cx } from "./ui";

type TipoAviso = "sucesso" | "erro" | "alerta";
interface ItemAviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

const Contexto = createContext<(tipo: TipoAviso, texto: string) => void>(() => {});

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemAviso[]>([]);
  const mostrar = useCallback((tipo: TipoAviso, texto: string) => {
    const id = Date.now() + Math.random();
    setItens((l) => [...l, { id, tipo, texto }]);
    setTimeout(() => setItens((l) => l.filter((i) => i.id !== id)), tipo === "erro" ? 9000 : 5000);
  }, []);
  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6">
        {itens.map((i) => (
          <div
            key={i.id}
            role={i.tipo === "erro" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg",
              i.tipo === "sucesso" && "border-verde-200",
              i.tipo === "erro" && "border-vermelho-200",
              i.tipo === "alerta" && "border-ambar-200",
            )}
          >
            {i.tipo === "sucesso" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verde-600" />}
            {i.tipo === "erro" && <XCircle className="mt-0.5 size-4 shrink-0 text-vermelho-600" />}
            {i.tipo === "alerta" && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ambar-600" />}
            <p className="flex-1 text-texto">{i.texto}</p>
            <button onClick={() => setItens((l) => l.filter((x) => x.id !== i.id))} className="text-texto-fraco hover:text-texto" aria-label="Fechar aviso">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos() {
  return useContext(Contexto);
}
