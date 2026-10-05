# Testes

## Execução

- `npm test`: testes unitários e de API.
- `npm run test:e2e`: fluxos de interface no Chromium do Playwright.
- `npm run test:unit`: somente cálculos e utilitários.

Os testes de API e de navegador usam bancos SQLite locais isolados, independentes do banco
configurado no `.env`. Cada arquivo de API roda em um processo isolado. O servidor
do Playwright usa a porta 37171 e um banco novo a cada execução.

## Cenários cobertos

- Cálculos de vendas, precificação, metas, tendências e fechamento diário.
- Formatação, períodos e exportação de relatórios.
- Cadastro, login, sessão, logout, alteração de senha e perfil.
- Persistência de plataformas, vendas, devoluções, meses, configurações e metas.
- Navegação, lançamento de vendas, devoluções e criação de mês pela interface.
- Indicador contínuo de meta e seleção do período da tendência.
- Digitação de valores na calculadora e troca de plataforma no ROAS, incluindo
  resultado numérico e margem impossível.
- Relatório, exportação de backup, importação por mesclagem ou substituição e
  preservação da sessão durante a importação.
- Persistência do nome de exibição após recarregar a página.
- Recuperação de alterações após falhas, reenviando a cópia correta quando há
  uma nova edição durante uma requisição.
- Conflito de versões no servidor, sessão expirada e isolamento entre usuários.
- Rejeição de backups inválidos e ausência de sessão nos arquivos exportados.
- Atualização das faixas do ROAS e preservação de taxas manuais.

## Execução automática

O arquivo `.github/workflows/tests.yml` executa cobertura e interface em Windows e
Linux a cada push ou pull request. Os relatórios ficam disponíveis como artefatos.
Os limites mínimos abrangem os módulos de cálculos, sincronização e validação de
backup: 80% de linhas e instruções, 75% de funções e 65% de ramificações. Esse
percentual não representa cobertura de todas as telas e APIs do aplicativo.

`npm ci` também prepara as cópias locais de Chart.js e html2canvas, com versões
fixas e suas licenças. Gráficos e exportação de imagens não dependem de um CDN.

Esses cenários não equivalem a cobertura total do aplicativo. A suíte de interface
executa um navegador; variações de dispositivos, outros navegadores e falhas de
rede ainda exigem cenários específicos.
