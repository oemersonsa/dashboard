# Kanri

Painel de gestão de vendas para marketplaces, com lançamentos por plataforma, pedidos, devoluções, metas, projeções, análises e ferramentas de precificação. A mesma aplicação funciona no navegador e em uma janela desktop com Electron.

O nome do pacote permanece `dashboard-vendas`, atualmente na versão `5.0.0`.

[Aplicação web](https://dashboard-ldb7.onrender.com) · [Reportar problema](https://github.com/oemersonsa/dashboard/issues)

## Funcionalidades

### Hub e navegação

- Tela inicial com resumo do mês, vendas, pedidos, devoluções, progresso da meta e dias lançados.
- Menu lateral com áreas de vendas, análises, gestão e ferramentas.
- Seleção de mês e ano, criação e exclusão de períodos e persistência da aba selecionada.
- Atalhos para registrar vendas e importar planilhas no hub; URLs por área, com suporte ao botão Voltar do navegador.
- Interface responsiva, navegação por teclado, indicadores de carregamento e mensagens de resultado.
- Identidade visual com fundo azul escuro, cartões de indicadores e ações em ciano; menu compartilhado entre painel, início, conta e fechamento diário.
- Tema escuro por padrão, com opções claro e automático em Minha conta → Aparência. A escolha fica salva no navegador.

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
- Prévia do total antes de registrar, escolha explícita entre adicionar e substituir os campos preenchidos, e opção de desfazer a última alteração. Campos vazios preservam os valores existentes.
- Entradas monetárias brasileiras, incluindo `1.234,56`, com validação; edição da tabela com Enter para confirmar e Escape para cancelar.
- Rascunhos de lançamentos e fechamento diário mantidos por usuário durante a sessão do navegador.
- Registro de devoluções por plataforma no período selecionado.
- Visão geral com vendas brutas, vendas após devoluções, pedidos, ticket médio, participação das plataformas e acompanhamento da meta.
- Tendência na visão geral por mês selecionado ou 30 dias corridos, com agrupamento diário, semanal, quinzenal ou mensal.
- Gráfico de vendas diárias com filtro por plataforma e comparação com outro período.
- Visão semanal com participação no mês, detalhamento por plataforma e comparação com o período anterior.

**Vendas após devoluções** correspondem às vendas descontadas das devoluções. Esse indicador não desconta todos os custos, impostos e tarifas do negócio e não representa lucro.

### Análises e tendências

- Análise por plataforma ou consolidada no mês selecionado, nos últimos 30, 90, 180 ou 365 dias, ou em intervalo personalizado.
- Indicadores de vendas, pedidos, médias diárias e variação contra o intervalo anterior equivalente.
- Gráfico diário, participação das plataformas e tabela de desempenho.
- Comparativo de até 12 meses com vendas, vendas após devoluções, pedidos ou ticket médio.
- Linha de meta e identificação de períodos parciais ou sem lançamentos no comparativo multi-mês.

### Metas e projeções

- Meta mensal configurável, acompanhada no hub, na visão geral e na área de projeção.
- Progresso, alertas de risco, projeção de fechamento e média diária necessária para atingir a meta.
- Gráfico acumulado de vendas após devoluções, comparado com a meta e a projeção. As devoluções mensais são distribuídas proporcionalmente às vendas para essa visualização.

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
- Leitura e consolidação da planilha em Web Worker, com indicação de progresso e cancelamento ao fechar a janela. Datas textuais do CSV são preservadas sem conversão automática para o formato americano.
- Prévia dos dados e conflitos antes de confirmar a importação.
- Opção de ignorar ou substituir valores já existentes por plataforma e data.
- Reconhecimento de exportações da Shein e do Mercado Livre, agrupando os dados para os lançamentos do painel.
- Shein: cálculo bruto por preço × quantidade, contagem de pedidos por número e identificação de devoluções/cancelamentos pelo status.
- Mercado Livre: receita por produtos ou preço × unidades quando necessário; exclusão de resumos de pacotes e linhas sem produto; reembolsos a partir da coluna de cancelamentos e reembolsos.

O fluxo de planilhas usa arquivos fornecidos pelo usuário. Para exportações reconhecidas, a plataforma correspondente deve estar cadastrada e ativa; confira a prévia e as regras exibidas antes de aplicar. A conexão pela API do Mercado Livre está disponível separadamente em Minha conta.

### API do Mercado Livre

- Minha conta → Mercado Livre: conexão por OAuth Authorization Code com PKCE S256, estado de uso único e cookie HttpOnly para vincular o retorno ao navegador.
- Tokens criptografados com AES-256-GCM no banco, separados por usuário. Access tokens e refresh tokens não são enviados ao frontend nem incluídos nos backups de negócio.
- Renovação de tokens com bloqueio compartilhado no banco para evitar o uso simultâneo do mesmo refresh token entre instâncias.
- Sincronização manual de pedidos/vendas e de reclamações/devoluções, em consultas separadas por data de criação. Intervalos de até 31 dias, em UTC−03:00; páginas de 50 registros e até 9.950 resultados por consulta. Reduza o intervalo para volumes maiores.
- Atualização pelo identificador do recurso: repetir a sincronização atualiza o registro existente. A atualização diária opcional revisa os últimos 31 dias. Para acompanhar mudanças em pedidos mais antigos, sincronize novamente seu intervalo de criação. Não há processamento de notificações/webhooks.
- Lista paginada com status, itens, SKU, valor dos produtos e reembolsos informados pelos pagamentos. Os totais consolidados somam somente BRL; valores individuais preservam a moeda do pedido. O total de produtos pagos considera apenas o status `paid` atual, sem descontar tarifas, custos ou impostos. Reembolsos podem incluir frete e não representam o valor exato de produtos devolvidos.
- Reclamações mostram referência e motivo; devoluções associadas permitem consultar status e rastreamento pelo endpoint v2 de pós-venda. Reclamações não são tratadas automaticamente como reembolsos.
- Após sincronizar todos os pedidos do intervalo, escolha a plataforma de destino e confira a prévia para atualizar o dashboard. São agrupados por dia de criação, no horário de Brasília, apenas pedidos com status `paid` e moeda BRL; cada ID de pedido conta uma vez, independentemente da quantidade de itens ou pacote. O valor corresponde aos produtos, sem frete ou tarifas.
- A confirmação substitui vendas e quantidades da plataforma escolhida nas datas selecionadas, inclusive por zero em dias sem pedidos pagos. Isso evita duplicar valores já lançados manualmente ou por planilha. A prévia mostra os valores atuais e propostos; outras plataformas, datas fora do intervalo e devoluções existentes são preservadas. Reembolsos da API não são aplicados automaticamente aos totais de devoluções.
- Apenas sincronizações completas podem ser aplicadas. Se os pedidos, a plataforma ou os lançamentos mudarem após a prévia, a gravação é rejeitada e uma nova prévia deve ser preparada. A atualização ocorre numa transação e altera a versão do estado para proteger outras sessões. Esta integração não executa cancelamentos, reembolsos ou revisões de devoluções no marketplace.

Para ativar a conexão:

1. Cadastre uma aplicação no [portal de desenvolvedores do Mercado Livre](https://developers.mercadolivre.com.br/), habilite PKCE e conceda os acessos de leitura a pedidos e pós-venda, com acesso offline para renovação.
2. Defina `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` e `ML_TOKEN_ENCRYPTION_KEY` no ambiente do servidor (veja `.env.example`). A chave deve conter 32 bytes em base64; gere uma vez com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` e preserve-a entre deploys. Alterar a chave exige reconectar as contas.
3. Cadastre exatamente a mesma redirect URI no portal: `https://seu-dominio.com/api/integrations/mercado-livre/callback`. `APP_ORIGIN` deve apontar para essa mesma origem. Use um domínio HTTPS estável para conectar contas reais; o backend também aceita HTTP em localhost para testes, sujeito às regras do portal. O fluxo começa e termina no mesmo navegador e origem. No Electron, use o modo web no domínio configurado para autorizar a conta.
4. Execute as migrations (`npm run db:migrate`; no servidor web também rodam ao iniciar), reinicie o servidor e abra Minha conta → Mercado Livre → Conectar.
   O botão permanece visível e desabilitado enquanto houver pendências. A tela informa as variáveis ausentes ou inválidas e as divergências entre a origem do app, o retorno OAuth e o endereço aberto no navegador, sem exibir segredos.
5. Selecione o intervalo e o tipo de consulta e clique em Sincronizar. Páginas concluídas permanecem salvas se uma consulta falhar. Se houver limite de requisições, aguarde um minuto e use Continuar sincronização na mesma tela; após recarregar a página, inicie novamente (os registros não duplicam).
6. Para atualizar os totais, selecione **Pedidos e vendas** e a **Plataforma de destino no dashboard**. Ao concluir a sincronização, a prévia aparece automaticamente se uma plataforma estiver selecionada. Também é possível usar **Prévia para o dashboard** para consultar o intervalo já sincronizado. Confira as substituições e clique em **Confirmar substituição no dashboard**; o app abre o mês correspondente com os novos totais. Apenas conectar a conta não importa vendas. Intervalos consultados em versões anteriores à migration 009 precisam ser sincronizados novamente para confirmar sua conclusão.

Desconectar remove credenciais, autorizações pendentes, configuração diária e histórico da API, preservando vendas já aplicadas ao dashboard. Para revogar a autorização no provedor, remova também a aplicação na conta do Mercado Livre. Dados de compradores e endereços não são persistidos nessa integração. A validação automatizada usa respostas simuladas: a autorização real exige credenciais e uma conta de vendedor.

#### Atualização diária automática

1. Na Vercel, configure `CRON_SECRET` em **Production** com um segredo aleatório de pelo menos 16 caracteres. Gere, por exemplo, com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Não reutilize o Client Secret do Mercado Livre. Faça um novo deploy.
2. Em **Minha conta → Mercado Livre**, selecione a plataforma de destino e clique em **Ativar atualização diária**. A ativação inicia uma consulta imediatamente. Depois, a rotina da Vercel funciona mesmo com o navegador fechado.
3. O cron de produção chama `GET /api/cron/mercado-livre` diariamente às 09:00 UTC (6h de Brasília). No plano Hobby, a execução pode acontecer entre 6h e 6h59. Confira o agendamento habilitado em **Settings → Cron Jobs** na Vercel. A presença da variável no app confirma a configuração do segredo, mas não verifica o estado do agendador na Vercel.

O cron exige o `Authorization: Bearer` enviado automaticamente pela Vercel com o valor de `CRON_SECRET`; sessões do Kanri não autorizam essa rota. O segredo não é exposto na interface nem nos resultados do cron. Outros ambientes precisam de um agendador externo chamando a mesma rota; abrir o app localmente não agenda tarefas.

Cada execução consulta pedidos criados nos últimos 31 dias (incluindo hoje, pelo horário de Brasília) e substitui automaticamente vendas e quantidades da plataforma salva, inclusive lançamentos manuais nessas datas. Entram apenas pedidos pagos em reais, pelo valor dos produtos; os IDs não são somados novamente. Pedidos cancelados deixam de compor o total quando o período é revisado. Outras plataformas, datas fora do intervalo, devoluções registradas e custos manuais dos pedidos são preservados. Não há atualização automática dos detalhes de faturamento/frete nem importação automática de reembolsos como devoluções.

Uma trava no banco impede dois trabalhadores automáticos para o mesmo usuário; a aplicação dos totais e o registro de sucesso ocorrem na mesma transação. Se o destino for arquivado, a conta mudar ou a rotina for pausada/desconectada durante a consulta, os totais não são aplicados. A rotina não retoma a autorização de uma loja diferente automaticamente.

Paginação e falhas são salvas por usuário. O dashboard só muda depois da consulta completa. Ao se aproximar do limite de duração da função, a execução deixa páginas pendentes para a próxima chamada; use **Atualizar vendas agora** para antecipar a continuação. Em alto volume ou com muitas contas, a conclusão pode exigir mais de uma chamada. Erros de credenciais exigem reconexão; falhas transitórias são tentadas na próxima execução diária. A Vercel não repete automaticamente um cron que falhou. A interface mostra a última conclusão e a falha mais recente. Pausar preserva as vendas já importadas. Esta configuração não faz parte do backup JSON do dashboard.

Referências: [autenticação e autorização](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao), [pedidos](https://developers.mercadolivre.com.br/pt_br/mercadolideres-lojas-oficiais/pedidos-e-opinioes), [reclamações](https://developers.mercadolivre.com.br/pt_br/atributos/gerenciar-reclamacoes) e [devoluções](https://developers.mercadolivre.com.br/pt_br/relatorios-de-faturamento/gerenciar-devolucoes).

### Pedidos e margens

Em **Análises → Pedidos e margens**, consulte o resultado de cada pedido do Mercado Livre por data de criação, em intervalos de até 31 dias. A página usa os pedidos sincronizados e também oferece **Sincronizar pedidos**. Essa consulta não altera os lançamentos de vendas do dashboard; para isso, use a prévia da integração em Minha conta.

- Lista com pedido, produtos/SKU, venda de produtos, tarifa, frete, custo de produto, resultado e margem. Filtros por identificação/produto/SKU, status, custos pendentes, resultado positivo ou prejuízo. Os indicadores consideram todo o filtro, não apenas a página visível; acima de 10.000 pedidos, reduza o intervalo.
- **Analisar → Consultar taxas e frete** consulta o pedido atualizado, o custo de envio do vendedor e as cobranças de faturamento. A tarifa de `order_items.sale_fee` é multiplicada pela quantidade; `payments.marketplace_fee` é apenas alternativa quando a tarifa por item está ausente. Quando disponível, `sale_fee.net` do faturamento substitui a tarifa operacional, sem somá-las.
- O frete usa a parcela final do vendedor em `/shipments/{id}/costs`, sem cobrar dele o valor pago pelo comprador. A associação de pedidos é conferida em `/shipments/{id}/items`. Em envios compartilhados, o custo é rateado pelo valor dos produtos, com ajuste de centavos para preservar o total do envio; o resultado recebe indicação de estimativa. Se algum pedido relacionado não estiver sincronizado, o frete fica pendente ou pode ser informado manualmente.
- O relatório `/billing/integration/group/ML/order/details` é consultado individualmente por pedido, com cache de 24 horas e sem consultas paralelas massivas. Cobranças e créditos ficam disponíveis para conferência. Somente cobranças adicionais selecionadas explicitamente entram no resultado; tarifa de venda (`CV`) e frete (`CXD`) já contemplados não podem ser incluídos novamente. Linhas compartilhadas, moeda diferente de BRL, associação não confirmada ou relatório parcial não são incluídas automaticamente. Cobranças compartilhadas exigem rateio manual em outros custos.
- Produto e embalagem aproveitam o custo **atual** do cadastro da calculadora quando cada item tem um SKU com correspondência única. Quantidades são consideradas. SKU vazio, duplicado ou sem produto correspondente exige custo manual; é possível fixar o total do pedido manualmente para não acompanhar futuras mudanças no cadastro.
- Custos de produto, embalagem, impostos, outros custos, ajustes de taxa/frete e reembolso dos produtos são informados em reais, como **totais do pedido**, separados dos dados da API. Zero deve ser informado explicitamente quando não houver custo e não existir uma origem conhecida. A parcela dos reembolsos referente a produtos precisa ser confirmada quando a API indicar reembolso, pois o valor informado pelos pagamentos pode incluir frete.
- O cálculo exige custos conhecidos e a confirmação de conferência. Dados ausentes aparecem como pendentes, e faturamento indisponível ou rateio de frete produz indicação de estimativa. Pedidos cancelados, ainda não pagos ou em moeda diferente de BRL não entram no consolidado. Resultado negativo é preservado; a margem consolidada usa resultado total dividido pela receita total dos pedidos calculados.

`Resultado = venda de produtos − reembolso dos produtos − tarifa − frete do vendedor − produto − embalagem − impostos − outros custos − cobranças adicionais selecionadas + créditos selecionados`.

`Margem (%) = resultado ÷ venda de produtos × 100`. Despesas fixas, publicidade e custos fora da API só entram se forem incluídos pelo usuário nos custos do pedido; o resultado não representa lucro contábil completo. Os dados financeiros são uma consulta salva e devem ser atualizados quando necessário; isso não altera cobranças, pedidos ou pagamentos no Mercado Livre.

Os ajustes e observações são salvos por usuário, vendedor e pedido, com proteção contra sobrescrita entre abas. Desconectar remove credenciais e consultas da API, preservando os custos manuais para uma futura conexão da mesma conta. Esses custos e consultas não fazem parte do backup JSON de lançamentos do dashboard. As permissões da aplicação devem permitir consultar pedidos, envios e faturamento; indisponibilidade de faturamento mantém a tarifa operacional e permite informar os custos manualmente. Depois do deploy, execute a migration 010 (automática no início do servidor e no build configurado da Vercel). Pedidos antigos podem precisar de nova sincronização ou consulta individual para obter as tarifas.

Referências: [campos de pedidos](https://developers.mercadolivre.com.br/pt_br/imovel-consulta-de-usuarios/gerenciamento-de-vendas), [custos de envio](https://developers.mercadolivre.com.br/en_us/shipment-handling), [faturamento por pedido](https://developers.mercadolivre.com.br/pt_ar/provisoes) e [boas práticas de faturamento](https://developers.mercadolivre.com.br/pt_br/boas-praticas-para-o-consumo-das-apis-de-relatorios-de-faturamento).

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
- Salvamento incremental: vendas alteradas por data e plataforma, devoluções por período, metas e configurações de preço. A navegação é guardada localmente por usuário e não dispara gravações de negócio.
- Consulta inicial limitada aos períodos necessários. Análises históricas e backups carregam o restante sob demanda, preservando a exportação completa.
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
| Deploy | Vercel, Render e Railway |

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
- Chart.js e html2canvas são copiados de `node_modules` para `public/vendor/` pelo `postinstall`. O leitor XLSX também está em `public/vendor/`.
- Chart.js, html2canvas e XLSX são carregados conforme a funcionalidade utilizada; exportações Excel usam o arquivo local de XLSX.
- Apenas o painel ativo é renderizado; gráficos existentes são atualizados e os totais são reutilizados durante cada renderização.
- `npm run build` consolida o CSS em arquivo com hash e prepara versões Brotli/gzip dos recursos. Com `NODE_ENV=production`, o servidor usa o HTML preparado e o CSS com cache prolongado; os demais recursos mantêm revalidação por ETag. O build também roda no `postinstall`.

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

Após editar os arquivos da interface, execute `npm run build` antes de iniciar com `NODE_ENV=production`. No desenvolvimento, o servidor usa os fontes diretamente e ignora versões comprimidas que ficaram mais antigas que o arquivo original.

Se aparecer uma mensagem de porta em uso (`EADDRINUSE`), confira se o Kanri já está aberto em `http://localhost:3000`. Para reiniciá-lo, use Ctrl+C no terminal do servidor anterior e execute `npm run dev` novamente. O modo web fecha a conexão com o banco antes de encerrar, inclusive quando a inicialização falha.

O Electron usa a porta já definida no ambiente ou seu padrão `37171`, ajustando a origem para o servidor interno. Não há script `dev:watch` nem empacotamento de instalador desktop no `package.json` atual.

No primeiro acesso, crie um usuário, cadastre as plataformas e comece os lançamentos ou importe um backup/planilha.

## Deploy na Vercel

1. Envie este código ao repositório Git e importe-o em **Add New → Project** na Vercel.
2. Use a raiz do repositório como **Root Directory** e **Other** como framework. O `vercel.json` já define instalação, build, saída estática e rotas da função Node.js. Selecione **Node.js 22.x** nas configurações do projeto.
3. Em **Environment Variables**, cadastre `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` com os valores do banco remoto. Para manter os dados atuais, use o mesmo banco da aplicação existente. Não envie o arquivo `.env` ao repositório.
4. `APP_ORIGIN` é opcional: sem ela, o backend usa a URL automática do deploy. Para um domínio próprio, informe sua origem HTTPS, por exemplo `https://kanri.exemplo.com`. `PORT` e `HOST` não precisam ser configurados na Vercel.
5. Faça o deploy e confira `/health`, `/health/database`, cadastro/login e salvamento de um lançamento.

A instalação usa `npm ci --omit=dev`, dispensando o Electron e as ferramentas de teste no deploy. `npm run build:vercel` gera a interface otimizada em `dist/`, servida pela CDN. `/api/*` e os healthchecks usam a função `api/index.js`, que reaproveita o roteador existente sem abrir uma porta HTTP.

O build executa `npm run db:migrate` antes da publicação. Falhas na conexão ou nas migrations interrompem o deploy. Configure as credenciais também no ambiente de build. Use um banco separado para **Preview**, pois esses deploys também executam migrations e permitem alterar dados. Evite deploys simultâneos contra um banco com migrations pendentes.

O banco deve ser remoto: arquivos SQLite locais não persistem entre instâncias da Vercel. O limite de corpo da Vercel Functions é **4,5 MB**, inferior aos 10 MB aceitos pelo servidor local; backups/importações enviados à API devem ficar abaixo desse limite. O rate limit atual fica na memória de cada instância e não é um limite global compartilhado.

Para validar a geração da interface localmente, execute `npm run build:vercel`. Esse comando não conecta ao banco. `npm run db:migrate` altera o banco indicado pelas variáveis de ambiente; execute-o apenas para o banco que deseja atualizar.

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
| `PATCH` | `/api/state` | Aplica apenas as alterações informadas em `changes`; exige `expectedUpdatedAt` e retorna `{ ok, updatedAt }` |
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

`GET /api/state?initial=1&month=2026-Outubro` retorna os períodos necessários para a tela inicial, a lista `periods` e os `loadedPeriods`. `GET /api/state?periods=2026-Janeiro,2026-Fevereiro&version=...` busca períodos específicos e rejeita uma versão desatualizada. Sem parâmetros, a resposta continua contendo o histórico completo para compatibilidade.

O PATCH aceita `platforms` (cadastro completo), `pricing`, `goals` (mapa de período para meta ou `null`) e `months`. Cada mês contém `days` (estado dos dias alterados), `deletedDays` e `returns` (apenas plataformas alteradas); um mês com valor `null` é excluído. As gravações permanecem numa única transação, com validação e controle de versão. A migration 007 preserva também períodos vazios e dias explicitamente zerados.

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
