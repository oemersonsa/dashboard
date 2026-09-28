<div align="center">

<img src="docs/banner.png" alt="Dashboard de Vendas" width="100%">

# 📊 Dashboard de Vendas

**Gestão completa de vendas em marketplaces** — projeções, metas, comparativos multi-mês e fechamento diário em uma interface única.

[![Status](https://img.shields.io/badge/status-ativo-success)](https://dashboard-ldb7.onrender.com)
[![Deploy](https://img.shields.io/badge/deploy-render-blue)](https://dashboard-ldb7.onrender.com)
[![Database](https://img.shields.io/badge/database-turso-green)](https://turso.tech)
[![Tests](https://img.shields.io/badge/tests-144%20passing-brightgreen)](#-testes)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[🌐 **Acessar o app**](https://dashboard-ldb7.onrender.com) · [📖 **Documentação**](#-como-rodar) · [🐛 **Reportar bug**](https://github.com/oemersonsa/dashboard/issues)

</div>

---

## 🎯 O que é

Um painel para consolidar vendas, devoluções, metas e projeções de múltiplas plataformas de e-commerce (Mercado Livre, Shopee, Magalu, TikTok Shop, etc.). Roda como **app desktop** (Electron) e como **aplicação web** (Node.js + Turso).

---

## ✨ Funcionalidades

### 🏠 Hub central
Acesso rápido a todas as áreas em um só lugar, com resumo do mês.

![Hub](docs/01-hub.png)

### 🔐 Autenticação local
Login/cadastro com senha hasheada (scrypt) e sessões persistentes.

![Login](docs/02-auth.png)

### ⚙️ Cadastro de plataformas
Adicione marketplaces com nome, sigla e cor — a paleta é sugerida automaticamente.

![Setup](docs/03-setup.png)

### 📈 Visão Geral
KPIs de vendas, pedidos, devoluções e ticket médio. Mix de plataformas e alertas de meta.

![Visão Geral](docs/04-overview.png)

### 📅 Vendas Diárias
Gráfico consolidado do mês com filtro por plataforma, comparação com outro mês e destaque do topo de cada stack.

![Vendas Diárias](docs/05-daily.png)

### 📊 Tendência multi-mês
Comparativo de até 12 meses por plataforma, com 4 métricas (vendas, líquido, pedidos, ticket) e linha de meta.

![Tendência](docs/06-trends.png)

### 🎯 Projeção e Metas
Meta mensal configurável, progresso visual, projeção de fechamento e média diária necessária.

![Projeção](docs/07-projection.png)

### 🧮 Calculadora de preço
Preço ideal por plataforma considerando comissão, taxa fixa, frete e margem/lucro desejado.

![Calculadora](docs/08-calculator.png)

### 📋 Fechamento Diário
Soma valores colados (`1000 + 500,50`), gera relatório TXT formatado para envio e calcula totais.

![Fechamento](docs/09-daily-close.png)

### 📄 Relatório completo
Resumo do mês, comparativo com o anterior e exportação em **PNG**, **CSV** e **Excel**.

![Relatório](docs/10-report.png)

### 💾 Backup
Exportar e importar dados em JSON (mesclar ou substituir).

### 🎨 Temas
Claro, escuro e automático (segue o sistema).

---

## 🛠 Tecnologias

### Backend
| Tecnologia | Uso |
|------------|-----|
| **Node.js 22+** | Runtime do servidor |
| **HTTP nativo** | Servidor sem framework |
| **@libsql/client** | Cliente Turso (SQLite remoto) |
| **crypto** | Hash de senhas (scrypt) |
| **Electron** | Wrapper desktop (opcional) |

### Frontend
| Tecnologia | Uso |
|------------|-----|
| **ES Modules puros** | Sem bundler |
| **CSS moderno** | Design tokens + temas |
| **Chart.js 4** | Gráficos |
| **html2canvas** | Exportar relatório em PNG |

### Infraestrutura
| Tecnologia | Uso |
|------------|-----|
| **Render** | Hospedagem do app web |
| **Turso** | Banco SQLite distribuído |
| **GitHub** | Versionamento |

### Testes
| Ferramenta | Cobertura |
|------------|-----------|
| **Vitest** | 108 testes unitários + API |
| **Playwright** | 9 testes E2E |

---

## 🏗 Arquitetura

O mesmo código roda em **dois modos**:

```
┌─────────────────────────────────────────────────────────────┐
│                     CÓDIGO COMPARTILHADO                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  src/       →  Servidor HTTP (rotas, static)        │    │
│  │  src/db/    →  Turso (repos, migrations)            │    │
│  │  src/...    →  Serviços de negócio                  │    │
│  │  public/    →  Frontend (HTML, CSS, JS)             │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
     ┌──────────────────┐          ┌──────────────────┐
     │  MODO DESKTOP    │          │   MODO WEB       │
     │  (Electron)      │          │   (Render)       │
     ├──────────────────┤          ├──────────────────┤
     │  Janela nativa   │          │  HTTP :10000     │
     │  startServer()   │          │  startServer()   │
     │  ↓               │          │  ↓               │
     │  Turso (nuvem)   │          │  Turso (nuvem)   │
     └──────────────────┘          └──────────────────┘
```

- **Desktop** → `electron-main.js` abre uma janela nativa e sobe o servidor interno
- **Web** → `server.js` expõe o HTTP público, servindo o mesmo `public/`
- **Banco** → em ambos, o Turso é acessado via HTTP (não depende de disco local)

---

## 🚀 Como rodar

### Pré-requisitos
- **Node.js 22.5+**
- **Conta no Turso** ([turso.tech](https://turso.tech)) — gratuito

### 1. Clonar e instalar

```bash
git clone https://github.com/oemersonsa/dashboard.git
cd dashboard
npm install
```

### 2. Configurar o Turso

```bash
# Instalar CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Criar banco
turso db create dashboard-vendas

# Pegar URL
turso db show dashboard-vendas --url

# Criar token
turso db tokens create dashboard-vendas
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

```bash
# Modo web (navegador)
npm run dev
# → http://localhost:3000

# Modo desktop (Electron)
npm start

# Com auto-reload
npm run dev:watch
```

---

## 🧪 Testes

```bash
npm test                 # Unit + API (Vitest)
npm run test:coverage    # Com cobertura
npm run test:e2e         # Playwright (headless)
npm run test:e2e:ui      # Playwright (interativo)
npm run test:all         # Tudo
```

**Cobertura atual:**

| Camada | Testes |
|--------|--------|
| Unitários | 108 ✅ |
| E2E | 9 ✅ |
| **Total** | **117+** |

---

## 🌐 Deploy

### Fluxo no Render

1. `git push` para o `main`
2. Render detecta e roda `npm install`
3. Inicia `node src/server.js`
4. Servidor conecta no Turso e roda migrations
5. App disponível em [dashboard-ldb7.onrender.com](https://dashboard-ldb7.onrender.com)

### Variáveis obrigatórias (Render)

| Variável | Origem |
|----------|--------|
| `TURSO_DATABASE_URL` | `turso db show <nome> --url` |
| `TURSO_AUTH_TOKEN` | `turso db tokens create <nome>` |
| `HOST` | `0.0.0.0` |

### Free tier

- **Render**: 750h/mês, cold start de ~30s após 15 min inativo
- **Turso**: 8GB de banco, 500M rows lidos/mês

---

## 🔌 API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Healthcheck |
| `POST` | `/api/auth/register` | Criar acesso |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/auth/session` | Validar sessão |
| `POST` | `/api/auth/logout` | Logout |
| `POST` | `/api/auth/change-password` | Trocar senha |
| `GET` | `/api/state` | Carregar estado completo |
| `POST` | `/api/state` | Salvar estado completo |
| `GET` | `/api/platforms` | Listar plataformas |
| `POST` | `/api/platforms` | Salvar plataformas |
| `GET` | `/api/sales` | Listar vendas |
| `POST` | `/api/sales` | Salvar vendas |
| `GET` | `/api/returns` | Listar devoluções |
| `POST` | `/api/returns` | Salvar devoluções |
| `GET` | `/api/dashboard/:month` | Dados de um mês |

Todas as rotas protegidas exigem:
```
Authorization: Bearer <sessionToken>
```

---

## 📁 Estrutura

```
dashboard/
├── docs/                     # Screenshots e banner
├── src/                      # Backend (CommonJS)
│   ├── config/               # env, paths
│   ├── db/
│   │   ├── index.js          # Cliente Turso + migrations
│   │   ├── migrations/       # Schemas versionados
│   │   └── repositories/     # Acesso a dados
│   ├── middleware/           # CORS, auth, rate-limit
│   ├── routes/               # Endpoints
│   ├── services/             # Regras de negócio
│   ├── server/               # HTTP + static
│   ├── utils/                # Logger, errors
│   ├── main/
│   │   └── electron-main.js  # Entry point desktop
│   └── server.js             # Entry point web
│
├── public/                   # Frontend (ES Modules)
│   ├── index.html
│   ├── assets/
│   ├── styles/               # CSS em camadas
│   └── scripts/
│       ├── main.js           # Roteador + boot
│       ├── core/             # state, api, format
│       ├── ui/               # toast, modal, theme, skeleton
│       └── features/         # Um módulo por domínio
│
├── tests/
│   ├── unit/                 # Cálculos puros
│   ├── api/                  # Rotas HTTP
│   └── e2e/                  # Playwright
│
├── .env.example
├── package.json
└── README.md
```

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

<div align="center">

**Feito com ❤️ para simplificar a gestão de vendas em marketplaces**

[⬆ Voltar ao topo](#-dashboard-de-vendas)

</div>