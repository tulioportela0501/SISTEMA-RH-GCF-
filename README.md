# Sistema RH GCF — Controle de funcionários e datas comemorativas

Sistema web do RH do **Grupo Conceito Fiscal** para substituir a planilha *RH GCF Datas comemorativas* no dia a dia.

**Tecnologia:** Next.js 16 (TypeScript), Tailwind CSS 4, PostgreSQL 14 ou mais novo. Senhas protegidas com Argon2id.

## As abas

| Aba | O que faz |
|---|---|
| **Dashboard** | Funcionários e estagiários ativos, desligados, cadastros completos e incompletos. O cartão **Felicitações de Clientes** avisa quantos clientes fazem aniversário de parceria no mês, quantas felicitações estão pendentes e quantos aniversariantes estão sem WhatsApp (cada aviso abre a Central). Também mostra alertas em cartões (próximos 7, 8 a 15 e 16 a 30 dias) e os aniversários e datas do mês atual e do próximo. |
| **Funcionários** | **Planilha Geral** com as **34 colunas** da aba Base, na mesma ordem: cabeçalho e coluna Nome fixos, rolagem horizontal e vertical, **filtro em cada coluna** (valores, “contém”, período, dia/mês e vazios/preenchidos), **ordenação** crescente/decrescente, botão **Colunas** (mostrar/ocultar, restaurar padrão) e largura ajustável arrastando a borda do cabeçalho; as colunas e larguras ficam salvas para cada usuário. **Edição direto na célula** (Enter ou Tab salva, Esc cancela, Desfazer logo depois), listas suspensas para Situação, Modalidade e controles internos, seletor de data nas datas. **Editar em lote** (administrador) para Situação, Modalidade, férias, Armário e controles internos. Pesquisa geral por nome, e-mail ou telefone, filtros Ativos/Desligados/Todos e de cadastro completo/incompleto, contador de registros. Desligados em vermelho. O olho abre o cadastro completo em 4 seções. **Importar Excel** (administrador) e **Exportar Excel**: somente os filtrados, somente as colunas visíveis, todos, ativos, desligados e a planilha completa para reimportar. |
| **Datas Comemorativas** | Aniversários dos funcionários e familiares, tempo de empresa, férias, outras datas importantes do escritório (incluindo as linhas “COMEMORAR” da planilha) e datas de clientes, mês a mês. Tudo é calculado pelo sistema a partir dos cadastros (as fórmulas da aba Calendário não são importadas). **Exportar Excel** do mês exibido, de 12 meses ou das datas do escritório, com as colunas da aba Calendário: Próxima Data, Dias Restantes, Colaborador, Modalidade, Evento e Detalhe. |
| **Datas do Cliente** | Clientes do GCF: **Empresa, CNPJ, Início GCF, Anos de parceria, Próximo aniversário, WhatsApp, Situação e Ações**, com filtros por situação (Ativos/Inativos/Todos), por **mês de aniversário** e pesquisa por nome, CNPJ ou ID. No cadastro: ID, tributação, responsáveis (Fiscal, Contábil, DP), WhatsApp, “O cliente não deseja receber mensagens” e as demais colunas da planilha geral. Botões **Importar Excel** (administrador; Excel ou CSV) e **Exportar Excel**. Cadastros sem CNPJ ou sem Início GCF aparecem como *Incompleto*. |
| **Felicitações** | Central dos aniversários de parceria: indicadores (aniversariantes do mês, pendentes, enviadas, próximos 30 dias, sem WhatsApp), filtros por mês, cliente e status, botão verde **Preparar felicitação com imagem**, **Marcar como enviado**, **Não enviar**, imagem padrão, modelos de mensagem e **Exportar Excel**. Veja abaixo. |
| **Histórico** | Registra cada cadastro, edição, desligamento, reativação, importação e exportação: usuário, data e horário, informação alterada, valor anterior e novo valor. É **somente consulta**, e o banco bloqueia alterações e exclusões. **Exportar Excel** com os filtros da consulta ou de todo o histórico. |

No menu do usuário (canto inferior da barra lateral) ficam **Alterar senha**, **Usuários e acessos** (administrador) e **Sair**.

## Regras principais

- **Formulário:** tem as 34 colunas da aba Base, com os mesmos nomes da planilha, divididas em 4 seções. Há ainda o campo separado **Status do vínculo** (Ativo / Desligado). Situação e Modalidade mantêm os valores originais.
- **Obrigatórios:** Nome, Situação, Modalidade e Admissão. Sem eles o cadastro não é concluído e aparece o aviso: *“Cadastro incompleto! É necessário preencher o campo Admissão.”*
- **Desligados:** na importação, a **cor de preenchimento** de cada linha é lida (inclusive cores do tema do Excel). As linhas em vermelho entram como *Desligado*. O amarelo, o azul e a cor da fonte não contam. Os desligados não aparecem nos indicadores de ativos nem geram alertas, mas continuam salvos e podem ser consultados, editados e reativados (pelo administrador).
- **Cadastro incompleto:** falta algum obrigatório, ou Nascimento, E-mail, Telefone ou Contato de emergência. Também conta como incompleto um familiar sem aniversário ou um período de férias com só uma das datas. Não ter cônjuge, filhos, segundo período de férias ou armário **não** deixa o cadastro incompleto.
- **Datas:** aniversários repetem todo ano (só o dia e o mês contam). Férias usam a data real. O “hoje” segue o fuso **America/Fortaleza**, e os meses do dashboard mudam sozinhos, inclusive na virada do ano.
- **Importação:** a aba Base é reconhecida pelo cabeçalho (na planilha original, linha 2; funcionários a partir da linha 3). Nada é inventado nem apagado. Antes de gravar, aparece uma tela de conferência. Funcionário já cadastrado (mesmo nome ou e-mail) tem os campos vazios completados; se a planilha trouxer um valor **diferente** do sistema, a prévia mostra “No sistema × Na planilha” e o funcionário só é atualizado se você **marcar** (padrão: manter o que está no sistema). Diferenças só de formatação (maiúsculas, acentos, formato do telefone) não contam, e célula vazia na planilha nunca apaga um dado. As abas *aux* e *Calendário* não são importadas, porque o sistema recalcula as datas.

### Importação de clientes (aba Datas do Cliente)

- **Onde:** botão **Importar Excel** na aba Datas do Cliente (aceita **.xlsx e .csv**), ou uma aba de clientes dentro do mesmo arquivo enviado em Funcionários → Importar Excel.
- **Planilha geral de clientes** (*Grupo; ID; Empresa; CNPJ; Tributação; …; Res. Fiscal; Res. Contábil; Res. DP; …; Início GCF; …*): o CSV com ponto e vírgula é lido em UTF-8 ou Windows-1252. Cada empresa vira um **aniversário de parceria** pelo **Início GCF**. “03/2025” é guardado como **mês e ano** (o dia não é inventado); uma data completa (“15/08/2019”) é guardada como data exata. ID, tributação e responsáveis têm campos próprios; as demais colunas (Inscrição Estadual, Prefeitura, Movimento, Sistema Veri…) ficam guardadas em *Outras informações da planilha geral* e voltam na exportação.
- **Reimportar a planilha geral:** atualiza os clientes que mudaram (inclusive o Início GCF, e os anos são recalculados), inclui os novos e **não exclui** quem não aparece no arquivo. O WhatsApp digitado no sistema, a preferência “não deseja receber mensagens” e o histórico de felicitações são preservados. Cliente já cadastrado sem Início GCF na planilha não ganha um aniversário de parceria vazio.
- **Como a aba é reconhecida:** pelo cabeçalho, nunca pela posição. Precisa de uma coluna que identifique o cliente (*Cliente*, *Razão social*, *Empresa*, *Nome ou razão social*… ou *Nome* + *CNPJ*) e de um dado de cliente (CNPJ ou uma data). A aba Base de funcionários nunca é lida como clientes, e as linhas “COMEMORAR” (como *CLIENTES DO MÊS*) continuam sendo datas do escritório. Se o arquivo do RH for enviado aqui, ele não é recusado: a prévia mostra o que há na Base e na aba *Calendário* (os “Aniversário de Empresa” são o tempo de casa dos funcionários) sem criar clientes. As abas *aux*, *Instruções*, *Resumo* e *Pendências* são ignoradas.
- **Formatos conhecidos:** a exportação do próprio sistema; a lista de aniversários de clientes do GCF (*Cód. | Empresa | Contato | Nascimento | … | Status | WhatsApp | Observação*), em que o aniversário é do contato; e a lista simples *Nome | Nascimento | Empresa* com “30 - RAZÃO SOCIAL”.
- **Campos:** nome ou razão social, CNPJ, ID/código, situação (Ativo/Inativo), tipo de data, data do evento, Início GCF (*Início GCF*, *Início da parceria*, *Cliente desde*, *Início do contrato*), fundação, aniversário do sócio/contato, WhatsApp (celular com DDD; número inválido não é gravado e fica avisado), tributação, responsáveis, “não deseja receber mensagens” e observações. Contato e nome fantasia vão para as observações; telefone, e-mail e outras colunas vão para *Outras informações*. Colunas calculadas (anos de parceria, próximo aniversário, dias restantes, idade, dia, mês) são ignoradas. Sem a coluna de situação, o cliente entra como **Ativo**.
- **Nada é inventado:** na planilha geral, empresa sem Início GCF entra como *Incompleto* (para completar depois); nas outras listas, sem data a linha precisa de correção e não é importada; data sem ano (“15/03”) também. Sem tipo informado, a data entra como “Outro” e fica marcada. CNPJ com dígito errado bloqueia a linha; CNPJ que virou número no Excel (sem o zero à esquerda) é completado; CPF não é gravado no campo CNPJ.
- **Duplicidades:** o cliente é reconhecido pelo **CNPJ** e, sem CNPJ, pelo nome (sem acentos, caixa e LTDA/ME/EPP). Parceria e fundação existem uma vez por cliente; aniversários de sócios são separados por pessoa. Repetidos na planilha ou já cadastrados com os mesmos dados são ignorados. O mesmo arquivo enviado de novo é avisado.
- **Já cadastrado:** os campos vazios são completados. Valores diferentes aparecem na prévia em *Atualizar com os valores da planilha*, já marcados (a planilha geral é a fonte oficial); **desmarque** o registro para manter o valor do sistema. Início GCF só com mês e ano não substitui uma data exata do mesmo mês.
- **Prévia:** mostra quantos serão cadastrados, atualizados, ignorados e quantos precisam de correção, antes de gravar. Tudo é validado de novo no servidor ao confirmar.

### Felicitações de clientes (aniversário de parceria)

- **Anos de parceria** pelo Início GCF: início em 03/2025 → 1 ano em março/2026, 2 anos em março/2027, e assim por diante, recalculados todo dia. O mês de início não conta como aniversário.
- **Dia da felicitação:** quando a planilha só tem mês e ano, a felicitação fica no **dia padrão** configurado pelo administrador na Central (botão *Dia das felicitações*, de 1 a 28). Com data exata, vale o dia real.
- **Quem aparece:** só clientes **ativos** que completam pelo menos 1 ano no mês. Cliente marcado como “não deseja receber mensagens” aparece como *Não enviar* e não tem botão de WhatsApp.
- **Imagem de felicitação** (cartão no alto da Central, ao lado dos modelos de mensagem): o administrador **arrasta a imagem para o cartão** ou clica para escolher. Fica guardada como **PNG ou JPG de até 5 MB** e pode ser vista, baixada, substituída (arrastando outra) e removida. Imagens em outros formatos que o navegador abre (WebP, GIF, BMP, AVIF), inclusive com o nome errado (ex.: WebP salvo como “.png”, comum em imagens baixadas da internet), são **convertidas para PNG** no navegador; imagens acima de 5 MB são reduzidas. HEIC (foto de iPhone), SVG e PDF precisam ser salvos como PNG/JPG antes. A imagem fica **guardada no banco de dados** (não se perde ao reiniciar e entra no backup). O servidor confere o tipo pelo conteúdo do arquivo, não pela extensão, e explica o formato real quando recusa.
- **Preparar felicitação com imagem** (botão verde): mostra empresa, anos e Início GCF, a **prévia da imagem**, o número (pode ser corrigido ali, e o número válido é salvo no cadastro), o modelo e a **mensagem editável**. Botões:
  - **Copiar imagem e abrir WhatsApp** (um clique): copia a imagem e abre `https://wa.me/55DDDNUMERO?text=MENSAGEM` em nova aba. Na conversa, **Ctrl+V** anexa a imagem; depois é só enviar.
  - **Copiar imagem**: copia a imagem de verdade (PNG) para a área de transferência pela Clipboard API. JPG é convertido para PNG no navegador. Mostra “Imagem copiada! Abra o WhatsApp e pressione Ctrl+V para anexar.”
  - **Copiar mensagem**: copia o texto de novo, caso a imagem tenha substituído o que estava copiado. A mensagem também fica salva na felicitação.
  - **Abrir WhatsApp** e **Baixar imagem** (alternativa: anexar pelo clipe 📎 do WhatsApp).
  - **Confirmar envio**: registra o envio sem precisar voltar à lista.
- **Quando a cópia de imagem não funciona:** só funciona em **HTTPS ou http://localhost** e em navegadores que aceitam imagens na área de transferência (Chrome e Edge). Acessando por IP sem HTTPS (ex.: `http://192.168.0.10:3000`) ou se o navegador recusar a permissão, o sistema avisa o motivo e destaca **Baixar imagem**. O link wa.me **não anexa arquivos**: o sistema nunca diz que a imagem foi anexada.
- **Etapas e status:** *Pendente* → *Felicitação preparada* (copiou a imagem/mensagem ou baixou a imagem) → *WhatsApp aberto* → *Enviado* (somente quando o funcionário clica em **Confirmar envio** ou **Marcar como enviado**, que grava data e hora, usuário, anos de parceria, a mensagem e se a imagem foi usada). Abrir o WhatsApp **não** marca como enviada. Também há *Não enviar* (com motivo, só para aquele aniversário) e *Voltar para pendente*. Uma felicitação enviada é definitiva: o mesmo aniversário do mesmo cliente não é registrado duas vezes.
- **Modelos:** o modelo padrão vem com o texto do GCF. Qualquer usuário pode criar e editar modelos com as variáveis `{empresa}`, `{anos}`, `{data}` e `{inicio}` (“{anos} anos” vira “1 ano” no primeiro aniversário). Variáveis desconhecidas são recusadas.
- **Exportar Excel** (ao lado da lista): **Esta lista** (exatamente o que aparece: mês, status e pesquisa), aniversariantes do mês, pendentes, enviadas ou histórico completo, com Empresa, CNPJ, Início GCF, Anos de parceria, Mês de aniversário, WhatsApp, Status, Data do envio e Responsável pelo envio (mais a data da felicitação, quando foi preparada e por quem, quando o WhatsApp foi aberto e por quem, se a imagem foi usada, a mensagem e o motivo).
- **Integrações futuras:** cada felicitação guarda o canal (`WHATSAPP_MANUAL` hoje; `WHATSAPP_API` e `N8N` já previstos no banco), para uma futura automação pelo n8n ou pela API oficial do WhatsApp sem mudar a estrutura.
- Tudo fica no Histórico: felicitação preparada, WhatsApp aberto, envio confirmado manualmente, não enviar, troca de número, imagem cadastrada/substituída/removida, dia padrão e modelos.

### Exportação para Excel

- Planilhas .xlsx com título, data e usuário da exportação, filtros aplicados, cabeçalho com filtro automático, painéis congelados, larguras ajustadas e datas reais do Excel (DD/MM/AAAA; aniversários em DD/MM, com o valor original preservado).
- Funcionários desligados em **vermelho**; coluna *Cadastro* em amarelo quando incompleto, com as informações que faltam.
- **Planilha Geral:** a exportação “somente os filtrados” respeita a pesquisa, os filtros de cada coluna e a ordenação da tela; “somente as colunas visíveis” traz só as colunas que estão aparecendo (com os cabeçalhos originais). Os dois arquivos podem ser reimportados: colunas que não vieram não apagam nada.
- **Funcionários no formato da aba Base:** todas as exportações de funcionários (resultados filtrados, todos, somente ativos, somente desligados) têm a aba **Base** igual à planilha original: título na linha 1, os 34 cabeçalhos (A a AH) na linha 2 e os funcionários a partir da linha 3, desligados em vermelho. Uma segunda aba, **Controle**, traz quem exportou, os filtros, o status do vínculo e o que falta em cada cadastro. Reimportar não duplica nada. O administrador também exporta a **planilha completa para reimportar**, com as datas do escritório como linhas COMEMORAR.
- A exportação é somente leitura: nenhum cadastro é alterado. Cada exportação fica registrada no Histórico (LGPD). IP e hashes do histórico não são exportados.

> A aba *aux* da planilha só calculava as **60 primeiras linhas** da Base. Por isso o Calendário do Excel deixava de fora “CLIENTES DO MÊS” de 01/11 e 01/12 (linhas 63 e 64). O sistema não tem esse limite.

## Perfis de acesso

- **Administrador:** tudo, mais importar o Excel (funcionários e clientes), exportar o formato da planilha original (modelo de importação), alterar o Status do vínculo (desligar/reativar) e gerenciar usuários.
- **Usuário:** consulta, cadastra e edita funcionários (inclusive na célula da Planilha Geral), datas comemorativas e datas de clientes, usa a Central de Felicitações (preparar com imagem, abrir WhatsApp, confirmar envio, modelos), consulta o histórico e exporta para Excel o que já pode consultar. O dia padrão das felicitações, a imagem de felicitação, a edição em lote de funcionários e a exclusão de clientes são só do administrador.
- Sem login, nenhuma exportação é possível (as rotas exigem sessão válida).

---

## Instalação no computador (teste local)

Requisitos: **Node.js 20.9+** (recomendado 22 LTS) e **PostgreSQL 14+**.

```powershell
# 1. Banco de dados (no psql ou pgAdmin)
CREATE ROLE rh_gcf LOGIN PASSWORD 'uma-senha-forte';
CREATE DATABASE rh_gcf OWNER rh_gcf;

# 2. Projeto
cd rh-gcf
copy .env.example .env        # Linux/macOS: cp .env.example .env
# edite o .env: DATABASE_URL, APP_URL=http://localhost:3000 e COOKIE_SECURE=false (só para teste local)

npm install
npm run db:migrate            # cria as tabelas
npm run db:seed-admin         # cria o primeiro administrador (pergunta nome, login e senha)
npm run build
npm run start                 # abre em http://localhost:3000
```

Depois de entrar como administrador, vá em **Funcionários → Importar Excel**, envie a planilha, confira a prévia e clique em **Confirmar importação**.

Para desenvolvimento use `npm run dev`.

### Atualizar uma instalação que já está rodando

Os dados existentes são mantidos; a migração só acrescenta colunas e tabelas.

```bash
npm install
npm run db:migrate            # aplica as migrações novas (002: planilha geral e felicitações; 003: imagem de felicitação; 004: preferências de colunas)
npm run build                 # ou reinicie o npm run dev
npm run start
```

Depois, em **Datas do Cliente → Importar Excel**, envie a planilha geral (CSV ou Excel), confira a prévia e confirme. A planilha geral não tem WhatsApp: cadastre os números na aba Datas do Cliente ou direto no botão Preparar WhatsApp.

### Usando o VS Code

O projeto já vem com tarefas e depuração configuradas (pasta `.vscode`).

1. **Arquivo → Abrir Pasta…** e escolha a pasta do projeto. Confirme “Sim, confio nos autores”.
2. Crie o `.env` a partir do `.env.example` e ajuste o `DATABASE_URL`.
3. **Terminal → Executar Tarefa…** e rode, na ordem: **1. Instalar dependências**, **2. Criar tabelas no banco** e **3. Criar administrador**.
4. Para usar o sistema, rode a tarefa **Rodar sistema (desenvolvimento)** (ou `Ctrl+Shift+B`) e abra http://localhost:3000. A página atualiza sozinha quando você salva um arquivo.
5. Para depurar com pontos de parada, abra **Executar e Depurar** (`Ctrl+Shift+D`), escolha **Depurar sistema** e aperte `F5`.

As extensões recomendadas (Tailwind CSS IntelliSense e Vitest) aparecem para instalar ao abrir a pasta.

## Publicação

O cookie de sessão só funciona por **HTTPS** em produção. Escolha uma das opções.

### Opção A — Servidor com Docker (HTTPS automático)

Requer Docker e um domínio apontando para o servidor (ex.: `rh.grupoconceitofiscal.com.br`).

```bash
cp .env.example .env    # preencha POSTGRES_PASSWORD e DOMINIO
docker compose up -d --build
docker compose exec app npm run db:seed-admin
```

O `docker-compose.yml` sobe o PostgreSQL, o sistema (aplica as migrações sozinho), o **Caddy** (certificado HTTPS automático) e um **backup diário** em `./backups` (mantém 30 dias).

### Opção B — Máquina virtual Windows com PM2

1. Instale Node.js 22 LTS e PostgreSQL 16, e faça os passos da instalação local com `COOKIE_SECURE` vazio.
2. `npm install -g pm2`, depois `pm2 start ecosystem.config.cjs` e `pm2 save`.
3. HTTPS: na rede Tailscale, `tailscale serve --bg --https=443 http://localhost:3000` (ajuste `APP_URL` para o endereço `https://<maquina>.<tailnet>.ts.net` e `TRUST_PROXY=true`). Outra opção é o Caddy para Windows na frente da porta 3000.
4. Backup: no Agendador de Tarefas, crie uma tarefa diária que rode `npm run db:backup` na pasta do projeto. Se o `pg_dump` não estiver no PATH, defina `PG_DUMP` no `.env`.

### Opção C — Vercel + PostgreSQL na nuvem (Neon, Supabase)

Configure `DATABASE_URL`, `DATABASE_SSL=true` e `APP_URL` nas variáveis do projeto. Rode `npm run db:migrate` e `npm run db:seed-admin` uma vez, do seu computador, apontando para esse banco.

## Backup e restauração

- Backup manual: `npm run db:backup`. Gera `backups/rh_gcf_AAAA-MM-DD-HH-MM-SS.dump` e apaga os que têm mais de `BACKUP_RETENCAO_DIAS`.
- Restaurar: `pg_restore --clean --if-exists -d "<DATABASE_URL>" backups/arquivo.dump`
- Guarde cópias fora do servidor (OneDrive/Drive da empresa), pois os arquivos contêm dados pessoais.

## Segurança e LGPD

- Senhas com hash **Argon2id** (parâmetros OWASP). O acesso é bloqueado por 15 minutos após 5 senhas erradas, e há limite de tentativas por IP.
- A sessão usa cookie `HttpOnly` + `SameSite=Lax` + `Secure`, guardado no banco apenas como hash. Expira após 8 horas sem uso.
- Toda alteração exige login. As permissões são conferidas no servidor, e os formulários são validados no servidor.
- Há proteção contra requisições de outros sites (verificação de origem) e cabeçalhos de segurança (CSP, HSTS, X-Frame-Options).
- No histórico, *triggers* do PostgreSQL bloqueiam `UPDATE`, `DELETE` e `TRUNCATE`, e cada registro é encadeado por hash SHA-256.
- A prévia da importação (que contém dados pessoais) é descartada depois de confirmada ou cancelada.
- A planilha com dados reais **não** acompanha o código. Mantenha o `.env` e os backups fora de pastas compartilhadas.

## Testes

```bash
npm test                                                  # regras, importação de clientes e exportação (ida e volta)
PLANILHA_TESTE="caminho/RH_GCF_Datas_comemorativas.xlsx" npm test   # inclui testes com a planilha real
PLANILHA_GERAL="caminho/planilha_geral.csv" npm test                # inclui a planilha geral de clientes
```

Os testes com a planilha real conferem estes pontos: as 34 colunas, os 34 funcionários, as 28 datas “COMEMORAR” e os 5 desligados em vermelho (linhas 16, 21, 29, 31 e 35). Conferem também a preservação dos valores originais e que as datas calculadas batem com a aba Calendário do Excel.

## Estrutura

```
db/migrations/        Estrutura do banco (SQL)
scripts/              migrate, seed-admin, backup
src/app/              Telas (App Router) e API (src/app/api)
src/components/       Componentes de interface
src/lib/domain/       Regras: campos, datas, eventos, cadastro incompleto, CNPJ, filtros, clientes, WhatsApp, felicitações
src/lib/excel/        Leitura da planilha (Excel e CSV), das cores e de clientes; geração das planilhas exportadas
src/lib/server/       Banco, login, histórico, importação (funcionários e clientes), felicitações, exportação
public/brand/         Logomarca (logo-gcf.png e logo-marca.png)
tests/                Testes automatizados
```

Para trocar a logomarca, substitua os arquivos em `public/brand/` mantendo os nomes. As cores ficam em `src/app/globals.css`.
