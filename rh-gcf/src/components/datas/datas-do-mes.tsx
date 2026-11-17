"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Botao, Cartao, Segmentos } from "@/components/ui";
import { ListaCartoes, estiloPorDias } from "@/components/eventos";
import { MenuExportar } from "@/components/exportar";
import { api } from "@/lib/cliente/api";
import { GRUPOS, type Evento, type GrupoEvento } from "@/lib/domain/eventos";
import { MESES, deslocarMes, fimDoMes, inicioDoMes, partes } from "@/lib/domain/datas";

type Filtro = "todos" | GrupoEvento;

export function DatasDoMes({ hoje, eventosIniciais }: { hoje: string; eventosIniciais: Evento[] }) {
  const inicial = partes(hoje);
  const [mesAno, setMesAno] = useState({ ano: inicial.ano, mes: inicial.mes });
  const [eventos, setEventos] = useState<Evento[]>(eventosIniciais);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");

  async function irPara(n: number) {
    const m = n === 0 ? { ano: inicial.ano, mes: inicial.mes } : deslocarMes(mesAno.ano, mesAno.mes, n);
    setMesAno(m);
    setCarregando(true);
    try {
      const r = await api<{ eventos: Evento[] }>(`/api/eventos?inicio=${inicioDoMes(m.ano, m.mes)}&fim=${fimDoMes(m.ano, m.mes)}`);
      setEventos(r.eventos);
    } finally {
      setCarregando(false);
    }
  }

  const lista = filtro === "todos" ? eventos : eventos.filter((e) => e.grupo === filtro);
  const grupos = (Object.keys(GRUPOS) as GrupoEvento[]).filter((g) => g !== "cliente");
  const rotuloFiltro = filtro === "todos" ? "todas as datas" : GRUPOS[filtro].toLowerCase();
  const fim12 = deslocarMes(mesAno.ano, mesAno.mes, 11);
  const exportar = (conteudo: "mes" | "ano") => `/api/exportar/datas-comemorativas?${new URLSearchParams({ conteudo, ano: String(mesAno.ano), mes: String(mesAno.mes), grupo: filtro })}`;

  return (
    <Cartao
      titulo={<span className="first-letter:uppercase">{`${MESES[mesAno.mes - 1]} de ${mesAno.ano}`}</span>}
      descricao={`${lista.length} ${lista.length === 1 ? "data" : "datas"}`}
      acoes={
        <div className="flex flex-wrap items-center gap-1">
          <MenuExportar
            tamanho="sm"
            className="mr-1"
            opcoes={[
              { rotulo: `${MESES[mesAno.mes - 1][0].toUpperCase()}${MESES[mesAno.mes - 1].slice(1)} de ${mesAno.ano} (${lista.length})`, descricao: `Mês exibido, com ${rotuloFiltro}.`, url: exportar("mes") },
              { rotulo: "12 meses", descricao: `De ${MESES[mesAno.mes - 1]}/${mesAno.ano} a ${MESES[fim12.mes - 1]}/${fim12.ano}, com ${rotuloFiltro}.`, url: exportar("ano") },
            ]}
          />
          <Botao tamanho="sm" variante="fantasma" onClick={() => irPara(-1)} aria-label="Mês anterior">
            <ChevronLeft className="size-4" />
          </Botao>
          <Botao tamanho="sm" onClick={() => irPara(0)}>
            Mês atual
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => irPara(1)} aria-label="Próximo mês">
            <ChevronRight className="size-4" />
          </Botao>
        </div>
      }
    >
      <div className="mb-4">
        <Segmentos
          rotulo="Tipo de data"
          valor={filtro}
          onChange={setFiltro}
          opcoes={[
            { valor: "todos" as Filtro, label: "Todas", contagem: eventos.length },
            ...grupos.map((g) => ({ valor: g as Filtro, label: GRUPOS[g], contagem: eventos.filter((e) => e.grupo === g).length })),
            { valor: "cliente" as Filtro, label: GRUPOS.cliente, contagem: eventos.filter((e) => e.grupo === "cliente").length },
          ]}
        />
      </div>
      <div className={carregando ? "opacity-50" : undefined}>
        <ListaCartoes eventos={lista} estilo={estiloPorDias} vazio="Nenhuma data neste mês." duasColunas />
      </div>
    </Cartao>
  );
}
