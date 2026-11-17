import { Etiqueta } from "@/components/ui";
import type { AnaliseCadastro } from "@/lib/domain/pendencias";

export function SeloCadastro({ analise }: { analise: AnaliseCadastro }) {
  if (analise.nivel === "COMPLETO") return <Etiqueta tom="verde">Completo</Etiqueta>;
  const faltando = analise.pendencias.map((p) => p.label).join(", ");
  return (
    <Etiqueta tom={analise.nivel === "BASICO_INCOMPLETO" ? "vermelho" : "ambar"} titulo={`Falta: ${faltando}`}>
      Incompleto
    </Etiqueta>
  );
}

export function SeloVinculo({ status }: { status: "ATIVO" | "DESLIGADO" }) {
  return status === "DESLIGADO" ? <Etiqueta tom="vermelho">Desligado</Etiqueta> : <Etiqueta tom="azul">Ativo</Etiqueta>;
}
