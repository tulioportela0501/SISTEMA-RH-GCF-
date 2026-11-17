import { redirect } from "next/navigation";
import Image from "next/image";
import { usuarioAtual } from "@/lib/server/auth";
import { FormLogin } from "./form-login";

export const metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ expirada?: string }> }) {
  if (await usuarioAtual()) redirect("/");
  const { expirada } = await searchParams;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-marinho-900 to-marinho-800 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <Image src="/brand/logo-gcf.png" alt="Grupo Conceito Fiscal" width={309} height={162} className="mx-auto h-auto w-56" priority />
        <h1 className="mt-6 text-center text-lg font-bold text-texto">Sistema RH</h1>
        <p className="mt-1 text-center text-sm text-texto-suave">Entre com seu usuário e senha.</p>
        <FormLogin expirada={expirada === "1"} />
      </div>
    </div>
  );
}
