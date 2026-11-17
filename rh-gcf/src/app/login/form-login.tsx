"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { api } from "@/lib/cliente/api";

export function FormLogin({ expirada }: { expirada: boolean }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api("/api/auth/entrar", { corpo: { login, senha } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="mt-6 flex flex-col gap-4" noValidate>
      {expirada && !erro && <Aviso tom="azul">Sua sessão terminou. Entre novamente.</Aviso>}
      {erro && <Aviso tom="vermelho">{erro}</Aviso>}
      <Campo label="Usuário" htmlFor="login">
        <Entrada id="login" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} required />
      </Campo>
      <Campo label="Senha" htmlFor="senha">
        <Entrada id="senha" name="password" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
      </Campo>
      <Botao type="submit" variante="primario" carregando={enviando} className="mt-1 w-full">
        Entrar
      </Botao>
    </form>
  );
}
