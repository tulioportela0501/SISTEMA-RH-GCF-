import { Shell } from "@/components/shell";
import { exigirUsuarioPagina } from "@/lib/server/auth";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuarioPagina();
  return <Shell usuario={usuario}>{children}</Shell>;
}
