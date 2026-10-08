# Kanri

Painel de gestão de vendas para marketplaces, com lançamentos por plataforma, pedidos, devoluções, metas, projeções, análises e ferramentas de precificação. A mesma aplicação funciona no navegador e em uma janela desktop com Electron.

O nome do pacote permanece `dashboard-vendas`, atualmente na versão `5.0.0`.

[Aplicação web](https://dashboard-ldb7.onrender.com) · [Reportar problema](https://github.com/oemersonsa/dashboard/issues)

## Funcionalidades

### Hub e navegação

- Tela inicial com resumo do mês, vendas, pedidos, devoluções, progresso da meta e dias lançados.
- Menu lateral com áreas de vendas, análises, gestão e ferramentas.
- Seleção de mês e ano, criação e exclusão de períodos e persistência da aba selecionada.
- Interface responsiva, navegação por teclado, indicadores de carregamento e mensagens de resultado.
- Temas claro, escuro e automático, acompanhando o sistema.

### Conta e autenticação

- Cadastro e login por usuário e senha, com senha mínima de 12 caracteres.
- Senhas armazenadas com hash `scrypt` e salt; usuários e sessões persistidos no banco.
- Sessões com validade de um ano e token guardado no navegador para manter o acesso.
- Perfil com nome de exibição e foto em PNG, JPEG ou WebP, redimensionada pela interface.
- Troca de senha com verificação da senha atual e invalidação das sessões anteriores.
- Dados de negócio separados por usuário e rota de compatibilidade para migração de acesso local.

### Plataformas

- Cadastro e edição de nome, sigla e cor, com sugestão de paleta.
- Ícones para marketplaces conhecidos, como Mercado Livre, Shopee, Shein, Magalu, Nuvem Shop, TikTok, Kwai e Amazon.
- Arquivamento e reativação de plataformas, preservando o histórico.
- Plataformas personalizadas para outros canais de venda.

### Vendas, pedidos e devoluções

- Lançamento diário de valores e quantidade de pedidos por plataforma.
- Registro de devoluções por plataforma no período selecionado.
- Visão geral com vendas brutas, vendas após devoluções, pedidos, ticket médio, participação das plataformas e acompanhamento da meta.
- Tendência na visão geral por mês selecionado ou 30 dias corridos, com agrupamento diário, semanal, quinzenal ou mensal.
- Gráfico de vendas diárias com filtro por plataforma e comparação com outro período.
- Visão semanal com participação no mês, detalhamento por plataforma e comparação com o período anterior.

**Vendas após devoluções** correspondem às vendas descontadas das devoluções. Esse indicador não desconta todos os custos, impostos e tarifas do negócio e não representa lucro.

### Análises e tendências

- Análise por plataforma ou consolidada nos últimos 30, 90, 180 ou 365 dias, ou em intervalo personalizado.
- Indicadores de vendas, pedidos, médias diárias e variação contra o intervalo anterior equivalente.
- Gráfico diário, participação das plataformas e tabela de desempenho.
- Comparativo de até 12 meses com vendas, vendas após devoluções, pedidos ou ticket médio.
- Linha de meta e identificação de períodos parciais ou sem lançamentos no comparativo multi-mês.

### Metas e projeções

- Meta mensal configurável, acompanhada no hub, na visão geral e na área de projeção.
- Progresso, alertas de risco, projeção de fechamento e média diária necessária para atingir a meta.

### Calculadora de preço

- Simulação por margem percentual ou lucro desejado em reais.
- Custos de produto, embalagem, extras e subsídio de frete; impostos e reserva para devoluções.
- Perfis de tarifas por plataforma, incluindo comissão, transação, taxa fixa e frete adicional.
- Cadastro de produtos com nome, SKU e custo, para reutilizar nas simulações.
- Comparação de preço ideal e preço informado manualmente.

Os perfis iniciais de tarifas são estimativas editáveis. Ajuste os valores às condições da sua conta antes de usar os resultados.

### Calculadora de ROAS

- Simulação por pedido considerando preço, custo, comissão, tarifa fixa, impostos, outros custos e margem desejada.
- Contribuição antes de anúncios, verba máxima por pedido, ROAS mínimo e ROAS de equilíbrio.
- Aproveitamento das tarifas da plataforma selecionada, com opção de informar taxas manualmente.
- Tratamento de faixas de preço e indicação de margem inviável.

### Importação de planilhas

- Leitura de arquivos `.csv`, `.xlsx` e `.xls`, com seleção de aba, período de destino e mapeamento de colunas.
- Prévia dos dados e conflitos antes de confirmar a importação.
- Opção de ignorar ou substituir valores já existentes por plataforma e data.
- Reconhecimento de exportações da Shein e do Mercado Livre, agrupando os dados para os lançamentos do painel.
- Shein: cálculo bruto por preço × quantidade, contagem de pedidos por número e identificação de devoluções/cancelamentos pelo status.
- Mercado Livre: receita por produtos ou preço × unidades quando necessário; exclusão de resumos de pacotes e linhas sem produto; reembolsos a partir da coluna de cancelamentos e reembolsos.

O fluxo usa arquivos fornecidos pelo usuário. O projeto não implementa conexão automática com as APIs dos marketplaces. Para exportações reconhecidas, a plataforma correspondente deve estar cadastrada e ativa; confira a prévia e as regras exibidas antes de aplicar.

### Fechamento diário

- Soma de valores colados, como `1000 + 500,50`.
- Consolidação por plataforma e geração de texto no formato de envio diário.
- Cópia do relatório e download em TXT.

### Relatórios e backups

- Relatório do mês com vendas, pedidos, devoluções, valores após devoluções e detalhamento por plataforma.
- Comparativo numérico e visual com o período anterior.
- Exportação em PNG, CSV e Excel (`.xlsx`).
- Exportação de backup JSON e importação por mesclagem ou substituição, com validação e prévia.
- Backups de negócio sem credenciais de sessão; a importação preserva o acesso atual.

### Salvamento e recuperação

- Salvamento do estado no servidor, com indicador de andamento e último salvamento.
- Cópia local das alterações pendentes por usuário e recuperação após falhas ou recarregamento.
- Controle de versão do estado para detectar conflitos entre abas e evitar sobrescrita silenciosa.
- Validação de dados de negócio e proteção contra substituição acidental por um estado sem plataformas.

## Tecnologias e arquitetura

| Camada | Tecnologias |
|--------|-------------|
| Backend | Node.js 22.5+, CommonJS, servidor HTTP nativo, `crypto` |
| Banco | `@libsql/client`, Turso/libSQL, migrations e repositórios |
| Frontend | HTML, CSS e JavaScript com ES Modules, sem bundler |
| Gráficos | Chart.js 4 |
| Exportação de imagem | html2canvas |
| Planilhas | SheetJS/XLSX |
| Desktop | Electron 33 |
| Testes | Vitest, cobertura V8 e Playwright |
| Automação | GitHub Actions em Windows e Linux |
| Deploy | Configuração Render e arquivo de deploy Railway |

```text
Navegador                         Electron
    |                                 |
    | HTTP                            | servidor HTTP interno
    +----------------+----------------+
                     |
            src/server + src/routes
                     |
               src/services
                     |
             src/db/repositories
                     |
                Turso/libSQL

public/ contém a interface compartilhada entre os dois modos.
```

- `src/server.js` inicia o modo web.
- `src/main/electron-main.js` inicia o servidor em `127.0.0.1` e abre a janela Kanri; a porta padrão é `37171` quando `PORT` não está definida.
- As migrations em `src/db/migrations/` são executadas antes de o servidor começar a receber requisições.
- Ambos os modos usam o banco configurado em `TURSO_DATABASE_URL`. Com Turso remoto, o desktop também precisa de conexão para carregar e salvar dados.
- Os testes usam bancos libSQL locais isolados; não dependem das credenciais do banco de produção.
- Chart.js e html2canvas são copiados de `node_modules` para `public/vendor/` pelo `postinstall`. O leitor XLSX também está em `public/vendor/`; a exportação Excel possui carregamento de fallback via CDN.

## Como rodar

### Pré-requisitos

- Node.js **22.5 ou superior** e npm.
- Banco Turso e token de acesso para usar a configuração remota.
- Ambiente gráfico para executar o Electron.

### Instalação

```bash
git clone https://github.com/oemersonsa/dashboard.git
cd dashboard
npm ci
```

`npm ci` usa as versões do `package-lock.json` e prepara os arquivos locais de Chart.js e html2canvas. Para atualizar dependências durante o desenvolvimento, use `npm install`.

### Configuração

Copie `.env.example` para `.env` na raiz do projeto. No PowerShell:

```powershell
Copy-Item .env.example .env
```

Preencha a URL e o token do seu banco:

```env
PORT=3000
HOST=0.0.0.0
APP_ORIGIN=http://localhost:3000
TURSO_DATABASE_URL=libsql://seu-banco.turso.io
TURSO_AUTH_TOKEN=seu-token
```

Se já tiver a CLI do Turso configurada, consulte a URL e gere um token com:

```bash
turso db show <nome-do-banco> --url
turso db tokens create <nome-do-banco>
```

| Variável | Uso |
|----------|-----|
| `PORT` | Porta HTTP; padrão `3000` no modo web |
| `HOST` | Endereço de escuta; padrão `0.0.0.0` no modo web e fixado em `127.0.0.1` pelo desktop |
| `APP_ORIGIN` | Origem usada na construção das URLs; padrão `http://localhost:<PORT>` no modo web |
| `TURSO_DATABASE_URL` | URL do banco; obrigatória para iniciar o backend |
| `TURSO_AUTH_TOKEN` | Token de acesso ao banco remoto; dispensado pelos bancos locais de teste |

O backend aceita URLs locais `file:` via libSQL, como as usadas nos testes. O nome da variável permanece `TURSO_DATABASE_URL`. A variável `TURSO_SYNC_URL` é lida pela configuração, mas não é usada para configurar sincronização de réplicas no cliente atual.

### Execução

```bash
# Web: http://localhost:3000 com o exemplo de .env
npm run dev

# Alternativa para o modo web
npm run start:web

# Desktop
npm start

# Alternativa explícita para o desktop
npm run start:electron
```

O Electron usa a porta já definida no ambiente ou seu padrão `37171`, ajustando a origem para o servidor interno. Não há script `dev:watch` nem empacotamento de instalador desktop no `package.json` atual.

No primeiro acesso, crie um usuário, cadastre as plataformas e comece os lançamentos ou importe um backup/planilha.

## Testes

```bash
npm test                   # Unitários e API
npm run test:watch         # Vitest em modo interativo
npm run test:unit          # Somente unitários
npm run test:api           # Somente API
npm run test:coverage      # Vitest com cobertura V8
npx playwright install chromium
npm run test:e2e           # Interface no Chromium
npm run test:e2e:ui        # Interface interativa do Playwright
npm run test:e2e:headed    # Navegador visível
npm run test:all           # Cobertura e E2E em sequência
```

Para listar os cenários E2E sem executá-los:

```bash
npx playwright test --list
```

As suítes verificam cálculos, validação, importação, exportação, autenticação, perfil, persistência, isolamento entre usuários, recuperação de alterações, conflitos e fluxos da interface. A quantidade e o resultado dos testes devem ser consultados na execução atual.

Os testes de API usam banco em memória. O Playwright inicia um servidor próprio na porta `37171` e cria um banco em `.data-e2e/`. Deixe essa porta livre ao executar os E2E.

Os limites de cobertura são 80% de linhas e instruções, 75% de funções e 65% de ramificações. Aplicam-se aos módulos de cálculos, sincronização e validação de backup selecionados em `vitest.config.js`, e não ao aplicativo inteiro.

O workflow `.github/workflows/tests.yml` executa cobertura e E2E em Windows e Linux a cada push ou pull request, disponibilizando `coverage/` e `test-results/` como artefatos por sete dias.

Mais detalhes em [tests/README.md](tests/README.md).

## API

As requisições com corpo usam JSON. Para acessar dados do usuário, envie o token retornado no cadastro ou login:

```http
Authorization: Bearer <sessionToken>
Content-Type: application/json
```

### Saúde e autenticação

| Método | Rota | Uso |
|--------|------|-----|
| `GET` | `/health` | Saúde do servidor HTTP |
| `GET` | `/health/database` | Consulta ao banco; retorna `503` se indisponível |
| `POST` | `/api/auth/register` | Cadastro com `username` e `password`; retorna `sessionToken` |
| `POST` | `/api/auth/login` | Login com `username` e `password`; retorna `sessionToken` |
| `POST` | `/api/auth/migrate-local` | Compatibilidade de migração de usuário local, com usuário e senha |
| `GET` | `/api/auth/session` | Valida o token e retorna o usuário; exige sessão válida |
| `POST` | `/api/auth/logout` | Remove a sessão identificada pelo token enviado |

### Rotas protegidas

| Método | Rota | Uso |
|--------|------|-----|
| `GET` | `/api/auth/profile` | Consulta nome e foto do perfil |
| `PATCH` | `/api/auth/profile` | Atualiza `displayName` e `avatarData` |
| `POST` | `/api/auth/change-password` | Altera senha com `username`, `currentPassword` e `newPassword` |
| `GET` | `/api/state` | Retorna o estado de negócio em `{ state }` |
| `POST` | `/api/state` | Substitui o estado validado; aceita `expectedUpdatedAt` para verificar a versão |
| `GET` | `/api/platforms` | Lista plataformas do usuário |
| `POST` | `/api/platforms` | Salva plataformas |
| `GET` | `/api/sales` | Lista vendas |
| `POST` | `/api/sales` | Salva vendas |
| `GET` | `/api/returns` | Lista devoluções |
| `POST` | `/api/returns` | Salva devoluções |
| `POST` | `/api/settings` | Salva período, tela e configuração de precificação |
| `POST` | `/api/month/:month` | Substitui os dias e as devoluções do período |
| `DELETE` | `/api/month/:month` | Exclui o período |
| `GET` | `/api/dashboard/:month` | Retorna os dados do dashboard para o período |

As chaves atuais de período combinam ano e nome do mês, por exemplo `2026-Outubro`. Codifique o parâmetro de caminho quando necessário. O estado de negócio reúne `platforms`, `db`, `goals`, `currentMonth`, `currentScreen`, `activeTab`, `pricing` e `updatedAt`.

A substituição do estado verifica `expectedUpdatedAt` quando enviado e retorna `409` com `state_conflict` se outra gravação alterou a versão. As rotas `/api/` possuem limite de 30 requisições por minuto por IP, com exceção dos endereços de loopback locais; o corpo das requisições é limitado a 10 MiB. Erros são retornados em JSON com o campo `error`.

## Deploy

### Render

O arquivo `render.yaml` declara um serviço web Node com:

- Build: `npm install`.
- Inicialização: `node src/server.js`.
- Healthcheck: `/health`.
- `NODE_ENV=production` e `HOST=0.0.0.0`.
- `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` fornecidos no ambiente do serviço.
- Deploy automático habilitado no blueprint.

Configure a URL e o token do banco no serviço e ajuste `APP_ORIGIN` para a URL pública quando necessário. O servidor executa as migrations ao iniciar. A branch e a integração que acionam o deploy dependem das configurações do serviço no Render.

### Railway

O arquivo `railway.json` define healthcheck em `/health`, timeout de 30 segundos e reinício em caso de falha. Para executar o app, configure o comando `npm run start:web` e as variáveis do banco no serviço. O script padrão `npm start` inicia o Electron.

Os limites e preços dos provedores devem ser consultados nos próprios serviços; não são definidos pelo projeto.

## Estrutura do projeto

```text
dashboard/
├── .github/workflows/tests.yml   # CI em Windows e Linux
├── public/
│   ├── index.html               # Telas, painéis e modais
│   ├── assets/                  # Identidade Kanri e ícones de marketplaces
│   ├── vendor/                  # Bibliotecas do navegador e suas licenças
│   ├── styles/                  # Tokens, componentes e layouts
│   └── scripts/
│       ├── main.js              # Inicialização e navegação
│       ├── core/                # Estado, API, sincronização e formatação
│       ├── ui/                  # Gráficos, temas, ícones, modais e indicadores
│       └── features/
│           ├── account/         # Perfil e senha
│           ├── auth/            # Cadastro e login
│           ├── backup/          # Exportação, importação e validação de JSON
│           ├── calculator/      # Precificação e ROAS
│           ├── daily-close/     # Fechamento e TXT
│           ├── goals/           # Cálculos de metas
│           ├── hub/             # Tela inicial
│           ├── platforms/       # Cadastro e análise de plataformas
│           ├── projection/      # Projeção mensal
│           ├── reports/         # Relatório e exportações
│           ├── returns/         # Devoluções
│           ├── sales/           # Vendas e importadores de planilhas
│           ├── trends/          # Comparativo multi-mês
│           └── weekly/          # Visão semanal
├── src/
│   ├── config/                  # Ambiente e caminhos
│   ├── db/
│   │   ├── index.js             # Cliente libSQL e execução de migrations
│   │   ├── migrations/          # Esquema, sessões, metas, perfil e preferências
│   │   └── repositories/        # Acesso aos dados
│   ├── main/electron-main.js    # Inicialização desktop
│   ├── middleware/              # Autenticação, CORS, JSON e rate limit
│   ├── routes/                  # Endpoints HTTP
│   ├── server/                  # Servidor, roteamento e arquivos estáticos
│   ├── services/                # Autenticação, sessões, estado e validação
│   ├── utils/                   # Datas, erros e logs
│   └── server.js                # Inicialização web
├── scripts/vendor.cjs           # Preparo de Chart.js e html2canvas
├── tests/
│   ├── unit/                    # Cálculos, importação, estado e validações
│   ├── api/                     # Autenticação e recursos HTTP
│   ├── e2e/                     # Fluxos de interface
│   └── setup/                   # Banco isolado para testes de API
├── .env.example
├── package.json
├── package-lock.json
├── playwright.config.js
├── vitest.config.js
├── render.yaml
├── railway.json
└── README.md
```

## Contribuição

1. Crie uma branch para a alteração.
2. Mantenha os módulos organizados por domínio e atualize a documentação quando mudar funcionalidades, comandos ou API.
3. Execute os testes relevantes; para alterações que afetem o fluxo completo, execute `npm run test:all`.
4. Abra um pull request descrevendo o comportamento alterado e a validação realizada.

## Licença

O `package.json` declara licença MIT. Este checkout não contém um arquivo `LICENSE` com o texto da licença. As bibliotecas distribuídas em `public/vendor/` incluem seus respectivos arquivos de licença.
