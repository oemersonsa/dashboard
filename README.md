# 📊 Dashboard de Vendas

Dashboard completo para gestão de vendas em marketplaces (Mercado Livre, Shopee, Magalu, TikTok Shop, etc.). Roda tanto como **app desktop** (Electron) quanto como **aplicação web** (Node.js + Turso).

![Status](https://img.shields.io/badge/status-ativo-success)
![Tests](https://img.shields.io/badge/tests-112%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 🎯 O que é

Um painel para consolidar vendas, devoluções e projeções de múltiplas plataformas de e-commerce. Substitui planilhas por uma interface única com:

- **Visão geral** — KPIs de vendas, pedidos, devoluções, ticket médio e mix por plataforma
- **Vendas diárias** — gráfico consolidado e tabela editável inline
- **Semanas** — agrupamento por semana do mês com comparativo
- **Plataformas** — resumo por canal com variação mês a mês
- **Projeção** — estimativa de fechamento do mês baseada na média diária
- **Calculadora de preço** — preço ideal por plataforma considerando comissão, taxa fixa, frete, margem/lucro
- **Fechamento diário** — soma valores colados e gera relatório TXT formatado para envio
- **Relatório** — resumo exportável em PNG
- **Backup** — exportar/importar JSON para migrar dados entre ambientes
- **Multi-plataforma** — cadastro dinâmico de canais com ícone, cor e sigla
- **Multi-usuário** — autenticação local com sessões persistentes

---

## 🛠 Tecnologias

### Backend
| Tecnologia | Uso |
|------------|-----|
| **Node.js 22+** | Runtime do servidor |
| **HTTP nativo** | Servidor sem framework (zero deps) |
| **@libsql/client** | Cliente do banco Turso (SQLite remoto) |
| **crypto (nativo)** | Hash de senhas (scrypt) e tokens de sessão |
| **@electron** | Wrapper para versão desktop |

### Frontend
| Tecnologia | Uso |
|------------|-----|
| **JavaScript ES Modules** | Sem bundler, imports nativos |
| **CSS moderno** | Design tokens, container queries, backdrop-filter |
| **Chart.js 4** | Gráficos de vendas diárias |
| **html2canvas** | Exportação de relatório em PNG |

### Testes
| Ferramenta | Cobertura |
|------------|-----------|
| **Vitest** | 88 testes unitários + API |
| **Playwright** | 9 testes E2E |
| **V8 Coverage** | Cobertura de 90%+ nos cálculos |

### Banco de dados
| Camada | Tecnologia |
|--------|------------|
| **Produção (web)** | Turso (SQLite distribuído) |
| **Dev local** | Turso (mesmo banco) |
| **Antigo (desktop)** | SQLite local via `node:sqlite` |

---

## 🏗 Arquitetura

O projeto tem **duas formas de rodar** o mesmo código:

```
┌─────────────────────────────────────────────────────────────┐
│                     CÓDIGO COMPARTILHADO                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  src/server/   →  Servidor HTTP (rotas, static)     │    │
│  │  src/db/       →  Banco Turso (repos, migrations)   │    │
│  │  src/services/ →  Regras de negócio (auth, state)   │    │
│  │  public/       →  Frontend (HTML, CSS, JS, assets)  │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
     ┌──────────────────┐          ┌──────────────────┐
     │  MODO DESKTOP    │          │   MODO WEB       │
     │  (Electron)      │          │   (Render)       │
     ├──────────────────┤          ├──────────────────┤
     │ electron-main.js │          │ startServer()    │
     │   ↓              │          │   ↓              │
     │ startServer()    │          │ HTTP nativo      │
     │   ↓              │          │   ↓              │
     │ HTTP nativo      │          │ Turso (nuvem)    │
     │   ↓              │          └──────────────────┘
     │ Turso (nuvem)    │
     └──────────────────┘
```

**O mesmo `startServer()` do backend é usado nos dois modos.** O Electron só adiciona uma janela nativa por cima.

### Primeiro plano vs. segundo plano

**Frontend (public/)**
- Roda **no navegador** (modo web) ou **dentro do Electron** (modo desktop)
- Usa ES Modules nativos (`<script type="module">`)
- Estado local em memória + `localStorage`
- Requisições HTTP para o backend via `fetch`

**Backend (src/)**
- Roda **em Node.js** (modo web) ou **no processo principal do Electron** (modo desktop)
- Servidor HTTP puro (sem Express)
- Persiste tudo no **Turso** (banco SQLite remoto)
- Autenticação via tokens Bearer (sessões salvas em arquivo local)

---

## 🚀 Como rodar

### Pré-requisitos

- **Node.js 22.5+** (`node --version`)
- **Conta no Turso** ([turso.tech](https://turso.tech)) — plano gratuito

### 1. Clonar e instalar

```bash
git clone https://github.com/seu-usuario/dashboard.git
cd dashboard
npm install
```

### 2. Configurar o banco Turso

```bash
# Instalar CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login (abre navegador)
turso auth login

# Criar banco
turso db create dashboard-vendas

# Pegar URL
turso db show dashboard-vendas --url
# → libsql://dashboard-vendas-xxx.turso.io

# Criar token
turso db tokens create dashboard-vendas
# → eyJhbGciOi...
```

### 3. Criar o `.env`

Na raiz do projeto:

```env
PORT=3000
HOST=0.0.0.0
APP_ORIGIN=http://localhost:3000

TURSO_DATABASE_URL=libsql://dashboard-vendas-xxx.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOi...
```

### 4. Rodar

#### Modo web (navegador)

```bash
npm run dev
# Abre em http://localhost:3000
```

#### Modo desktop (Electron)

```bash
npm start
# Abre janela nativa do Electron
```

#### Modo com auto-reload

```bash
npm run dev:watch
```

---

## 🌐 Deploy em produção

### Frontend + Backend → **Render**

O app roda **como um único serviço web** no Render:

| Item | Valor |
|------|-------|
| **Serviço** | Web Service |
| **Ambiente** | Node |
| **Plano** | Free (750h/mês) |
| **Build Command** | `npm install` |
| **Start Command** | `node src/server.js` |
| **URL** | https://dashboard-ldb7.onrender.com |

**Variáveis de ambiente (no painel do Render):**

```
TURSO_DATABASE_URL = libsql://dashboard-vendas-xxx.turso.io
TURSO_AUTH_TOKEN   = eyJhbGciOi...
HOST               = 0.0.0.0
NODE_ENV           = production
```

O Render injeta `PORT` automaticamente. **Não configure manualmente.**

### Banco de dados → **Turso**

O banco **não fica no Render** — fica no Turso (SQLite distribuído, plano gratuito com 8GB).

```
┌──────────────────┐         ┌──────────────────┐
│   RENDER         │         │   TURSO          │
│                  │         │                  │
│  ┌────────────┐  │ HTTPS   │  ┌────────────┐  │
│  │ Node.js    │──┼────────▶│  │  SQLite    │  │
│  │ HTTP       │  │  libsql │  │  remoto    │  │
│  │ :10000     │  │         │  │            │  │
│  └────────────┘  │         │  └────────────┘  │
│                  │         │                  │
│  Serve HTML/CSS/ │         │  Persiste tudo   │
│  JS do public/   │         │  entre deploys   │
└──────────────────┘         └──────────────────┘
       ▲
       │ HTTPS
       │
   ┌───┴────┐
   │Usuário │
   └────────┘
```

**Por que não SQLite local no Render?**
O plano gratuito do Render **não tem disco persistente**. Cada deploy apagaria o banco. O Turso resolve isso mantendo os dados fora do container.

---

## 📁 Estrutura

```
dashboard/
├── src/                       # Backend (CommonJS)
│   ├── config/
│   │   ├── env.js             # Variáveis de ambiente
│   │   └── paths.js           # Caminhos do projeto
│   ├── db/
│   │   ├── index.js           # Client Turso + migrations
│   │   ├── migrations/
│   │   │   └── 001_initial.js # Schema versionado
│   │   └── repositories/      # Acesso a dados por entidade
│   │       ├── users.repo.js
│   │       ├── platforms.repo.js
│   │       ├── sales.repo.js
│   │       ├── returns.repo.js
│   │       └── settings.repo.js
│   ├── middleware/
│   │   ├── auth.js            # Validação de sessão
│   │   ├── body-parser.js     # Leitura de JSON
│   │   ├── cors.js            # Headers CORS
│   │   └── rate-limit.js      # Rate limiting
│   ├── routes/
│   │   ├── auth.routes.js     # /api/auth/*
│   │   ├── state.routes.js    # /api/state
│   │   ├── platforms.routes.js
│   │   ├── sales.routes.js
│   │   └── returns.routes.js
│   ├── services/
│   │   ├── auth.service.js    # Hash de senhas
│   │   ├── sessions.service.js
│   │   └── state.service.js   # Persistência de estado
│   ├── server/
│   │   ├── index.js           # Bootstrap HTTP
│   │   ├── router.js          # Roteamento
│   │   └── static.js          # Servidor de arquivos
│   ├── utils/
│   │   ├── logger.js
│   │   ├── errors.js
│   │   └── dates.js
│   ├── main/
│   │   └── electron-main.js   # Entry point do Electron
│   └── server.js              # Entry point web
│
├── public/                    # Frontend (ES Modules)
│   ├── index.html
│   ├── assets/
│   │   └── favicon.svg
│   ├── styles/
│   │   ├── main.css
│   │   ├── tokens.css         # Design tokens
│   │   ├── base.css
│   │   ├── utilities.css
│   │   ├── responsive.css
│   │   ├── components/        # Botões, cards, forms, tabelas...
│   │   └── layouts/           # Auth, hub, dashboard, calculator...
│   └── scripts/
│       ├── main.js            # Entry point + roteador
│       ├── core/
│       │   ├── state.js       # Estado global + normalização
│       │   ├── api.js         # Fetch wrapper com auth
│       │   ├── format.js      # Formatação (R$, datas, slug)
│       │   └── constants.js   # Constantes globais
│       ├── ui/
│       │   ├── toast.js       # Notificações
│       │   ├── modal.js       # Modais
│       │   ├── icons.js       # Ícones de plataforma
│       │   ├── charts.js      # Cores e helpers de gráfico
│       │   └── save-indicator.js
│       └── features/          # Módulos por domínio
│           ├── auth/
│           ├── hub/
│           ├── platforms/
│           ├── sales/
│           ├── returns/
│           ├── weekly/
│           ├── projection/
│           ├── calculator/
│           ├── daily-close/
│           ├── reports/
│           └── backup/
│
├── tests/
│   ├── setup/
│   ├── unit/                  # Testes de funções puras
│   ├── api/                   # Testes de rotas HTTP
│   └── e2e/                   # Testes Playwright
│
├── .env                       # Variáveis locais (não versionado)
├── .env.example               # Modelo
├── package.json
├── playwright.config.js
├── vitest.config.js
└── README.md
```

---

## 🧪 Testes

```bash
# Testes unitários + API
npm test

# Só unitários
npm run test:unit

# Só API
npm run test:api

# Com cobertura
npm run test:coverage

# E2E (Playwright)
npm run test:e2e

# E2E com navegador visível
npm run test:e2e:headed

# E2E interativo
npm run test:e2e:ui

# Tudo (cobertura + E2E)
npm run test:all
```

**Cobertura atual:**

| Camada | Testes |
|--------|--------|
| Unitários | 73 ✅ |
| API | 15 ✅ |
| E2E | 9 ✅ |
| **Total** | **97+** |

---

## 🔐 Autenticação

- Senhas hasheadas com **scrypt** (nativo do Node)
- Tokens de sessão com **256 bits** de entropia
- Sessões persistentes por **365 dias** (arquivo JSON local)
- Rate limiting: **30 req/min por IP** em rotas `/api/*`
- Modo local (loopback) isento de rate limit

**Fluxo:**

```
1. POST /api/auth/register  → cria usuário + retorna token
2. POST /api/auth/login     → valida credenciais + retorna token
3. GET  /api/auth/session   → valida token atual
4. POST /api/auth/logout    → invalida token
5. POST /api/auth/change-password → atualiza senha
```

Todas as rotas protegidas exigem header:

```
Authorization: Bearer <token>
```

---

## 🔌 API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Healthcheck |
| `POST` | `/api/auth/register` | Criar acesso |
| `POST` | `/api/auth/login` | Fazer login |
| `GET` | `/api/auth/session` | Validar sessão |
| `POST` | `/api/auth/logout` | Encerrar sessão |
| `POST` | `/api/auth/change-password` | Trocar senha |
| `GET` | `/api/state` | Carregar estado completo |
| `POST` | `/api/state` | Salvar estado completo |
| `GET` | `/api/platforms` | Listar plataformas |
| `POST` | `/api/platforms` | Salvar plataformas |
| `GET` | `/api/sales` | Listar vendas |
| `POST` | `/api/sales` | Salvar vendas |
| `GET` | `/api/returns` | Listar devoluções |
| `POST` | `/api/returns` | Salvar devoluções |
| `GET` | `/api/dashboard/:month` | Dados de um mês específico |

---

## 📦 Build do app desktop

```bash
# Instalar electron-builder
npm install --save-dev electron-builder

# Gerar instalador NSIS (Windows)
npm run build:win

# Gerar portable (exe único)
npm run build:portable
```

O executável fica em `dist/`.

---

## 🚢 Deploy

### Fluxo de deploy no Render

1. `git push` para o `main`
2. Render detecta e roda `npm install`
3. Render inicia `node src/server.js`
4. Servidor conecta no Turso e roda migrations
5. App disponível em `https://dashboard-ldb7.onrender.com`

### Variáveis obrigatórias

| Variável | Origem |
|----------|--------|
| `TURSO_DATABASE_URL` | `turso db show <nome> --url` |
| `TURSO_AUTH_TOKEN` | `turso db tokens create <nome>` |
| `HOST` | `0.0.0.0` |

### Free tier

- **Render**: 750h/mês, cold start de ~30s após 15 min inativo
- **Turso**: 8GB de banco, 500M rows lidos/mês

---

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit (`git commit -m "Adiciona X"`)
4. Push (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

---

## 📄 Licença

MIT © 2026

---

## 👤 Autor

**Emerson Sá**
- GitHub: [@oemersonsa](https://github.com/oemersonsa)

---

## 🔗 Links úteis

- [Turso Docs](https://docs.turso.tech)
- [Render Docs](https://render.com/docs)
- [Electron Docs](https://www.electronjs.org/docs)
- [Playwright Docs](https://playwright.dev/docs)
- [Vitest Docs](https://vitest.dev/guide)

---

**Feito com ❤️ para simplificar a gestão de vendas em marketplaces.**