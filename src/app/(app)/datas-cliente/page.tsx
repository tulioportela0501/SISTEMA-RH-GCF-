import { CabecalhoPagina } from "@/components/ui";
import { DatasCliente } from "@/components/datas/datas-cliente";
import { exigirUsuarioPagina } from "@/lib/server/auth";
import { listarDatasCliente } from "@/lib/server/datas";
import { obterConfigFelicitacoes } from "@/lib/server/felicitacoes";
import { hojeFortaleza } from "@/lib/domain/datas";

export const metadata = { title: "Datas do Cliente" };

export default async function PaginaDatasCliente() {
  const u = await exigirUsuarioPagina();
  const [datas, config] = await Promise.all([listarDatasCliente(), obterConfigFelicitacoes()]);
  return (
    <>
      <CabecalhoPagina titulo="Datas do Cliente" descricao="Clientes, Início GCF, anos de parceria e datas importantes. Importe a planilha geral de clientes (Excel ou CSV)." />
      <DatasCliente datas={datas} hoje={hojeFortaleza()} perfil={u.perfil} diaFelicitacao={config.dia_padrao} />
    </>
  );
}
