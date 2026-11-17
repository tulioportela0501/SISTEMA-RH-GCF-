"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { Botao, CaixaMarcacao, Campo, Cartao, Entrada, Etiqueta, Modal, Selecao } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api } from "@/lib/cliente/api";

interface Usuario {
  id: number;
  nome: string;
  login: string;
  perfil: "ADMIN" | "USUARIO";
  ativo: boolean;
  ultimo_login_em: string | null;
}

type Acao = { tipo: "novo" } | { tipo: "editar"; u: Usuario } | { tipo: "senha"; u: Usuario } | null;

export function GestaoUsuarios({ usuarios, euId }: { usuarios: Usuario[]; euId: number }) {
  const router = useRouter();
  const avisar = useAvisos();
  const [acao, setAcao] = useState<Acao>(null);
  const [form, setForm] = useState({ nome: "", login: "", perfil: "USUARIO" as "ADMIN" | "USUARIO", senha: "", ativo: true });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrir(a: Acao) {
    setErro(null);
    setAcao(a);
    if (a?.tipo === "editar") setForm({ nome: a.u.nome, login: a.u.login, perfil: a.u.perfil, senha: "", ativo: a.u.ativo });
    else setForm({ nome: "", login: "", perfil: "USUARIO", senha: "", ativo: true });
  }

  async function salvar() {
    if (!acao) return;
    setSalvando(true);
    setErro(null);
    try {
      if (acao.tipo === "novo") await api("/api/usuarios", { corpo: { nome: form.nome, login: form.login, perfil: form.perfil, senha: form.senha } });
      if (acao.tipo === "editar") await api(`/api/usuarios/${acao.u.id}`, { metodo: "PUT", corpo: { nome: form.nome, perfil: form.perfil, ativo: form.ativo } });
      if (acao.tipo === "senha") await api(`/api/usuarios/${acao.u.id}/senha`, { corpo: { senha: form.senha } });
      avisar("sucesso", acao.tipo === "senha" ? "Senha redefinida." : "Usuário salvo.");
      setAcao(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao
      titulo="Usuários"
      acoes={
        <Botao variante="primario" tamanho="sm" icone={<Plus className="size-4" />} onClick={() => abrir({ tipo: "novo" })}>
          Novo usuário
        </Botao>
      }
      corpoClassName="p-0 pt-4"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-borda bg-fundo/60 text-left text-xs font-semibold text-texto-suave">
              <th className="px-5 py-2.5">Nome</th>
              <th className="px-3 py-2.5">Usuário</th>
              <th className="px-3 py-2.5">Perfil</th>
              <th className="px-3 py-2.5">Acesso</th>
              <th className="px-3 py-2.5">Último acesso</th>
              <th className="px-5 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-2.5 font-medium">{u.nome}</td>
                <td className="px-3 py-2.5 text-texto-suave">{u.login}</td>
                <td className="px-3 py-2.5">{u.perfil === "ADMIN" ? <Etiqueta tom="azul">Administrador</Etiqueta> : <Etiqueta>Usuário</Etiqueta>}</td>
                <td className="px-3 py-2.5">{u.ativo ? <Etiqueta tom="verde">Liberado</Etiqueta> : <Etiqueta tom="vermelho">Bloqueado</Etiqueta>}</td>
                <td className="numeros px-3 py-2.5 text-texto-suave">{u.ultimo_login_em ? new Date(u.ultimo_login_em).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                <td className="px-5 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => abrir({ tipo: "editar", u })} className="rounded-md p-1.5 text-texto-suave hover:bg-azul-50 hover:text-azul-600" aria-label={`Editar ${u.nome}`} title="Editar">
                      <Pencil className="size-4" />
                    </button>
                    <button onClick={() => abrir({ tipo: "senha", u })} className="rounded-md p-1.5 text-texto-suave hover:bg-azul-50 hover:text-azul-600" aria-label={`Redefinir senha de ${u.nome}`} title="Redefinir senha">
                      <KeyRound className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        aberto={acao !== null}
        aoFechar={() => setAcao(null)}
        largura="sm"
        titulo={acao?.tipo === "novo" ? "Novo usuário" : acao?.tipo === "senha" ? `Redefinir senha de ${acao.u.nome}` : "Editar usuário"}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setAcao(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvando} onClick={salvar}>
              Salvar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <p className="rounded-lg bg-vermelho-50 px-3 py-2 text-[13px] text-vermelho-600">{erro}</p>}
          {acao?.tipo !== "senha" && (
            <>
              <Campo label="Nome" htmlFor="us-nome" obrigatorio>
                <Entrada id="us-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </Campo>
              {acao?.tipo === "novo" && (
                <Campo label="Usuário (login)" htmlFor="us-login" obrigatorio ajuda="Letras minúsculas, números, ponto ou @.">
                  <Entrada id="us-login" autoCapitalize="none" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value.toLowerCase() })} />
                </Campo>
              )}
              <Campo label="Perfil" htmlFor="us-perfil">
                <Selecao id="us-perfil" value={form.perfil} disabled={acao?.tipo === "editar" && acao.u.id === euId} onChange={(e) => setForm({ ...form, perfil: e.target.value as "ADMIN" | "USUARIO" })}>
                  <option value="USUARIO">Usuário</option>
                  <option value="ADMIN">Administrador</option>
                </Selecao>
              </Campo>
              {acao?.tipo === "editar" && acao.u.id !== euId && <CaixaMarcacao label="Acesso liberado" checked={form.ativo} onChange={(v) => setForm({ ...form, ativo: v })} />}
            </>
          )}
          {acao?.tipo !== "editar" && (
            <Campo label="Senha" htmlFor="us-senha" obrigatorio ajuda="Pelo menos 10 caracteres, com letras e números.">
              <Entrada id="us-senha" type="password" autoComplete="new-password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
            </Campo>
          )}
        </div>
      </Modal>
    </Cartao>
  );
}
