# Contribuindo com o Elysium Launcher

Obrigado pelo interesse em contribuir. Antes de abrir um Pull Request, leia
a seção abaixo — ela existe para manter o projeto como um cliente neutro,
sem conteúdo ou integrações que criem responsabilidade para os mantenedores.

## O que este projeto NÃO aceita em Pull Requests

* **Nenhuma fonte de catálogo padrão.** O app não deve, em nenhuma versão,
  vir com uma URL de catálogo pré-configurada, sugerida ou selecionada por
  padrão. A escolha da fonte é sempre 100% da pessoa que usa o app.

* **Nenhum link direto para conteúdo específico.** Não envie PRs com
  magnet links, URLs de download diretas, IDs de torrent ou qualquer
  referência a um item de conteúdo específico embutida no código, testes ou
  documentação.

* **Nenhuma chave de API, token ou credencial**, própria ou de terceiros,
  hardcoded ou de exemplo funcional.

* **Nenhuma integração automática com serviços de terceiros** (agregadores,
  índices, APIs de busca de conteúdo) que rode sem a pessoa que usa o app
  configurar explicitamente essa integração antes.

* **Nenhuma telemetria, analytics ou coleta de dados**, mesmo que
  opcional/opt-in, sem discussão prévia numa issue. Ver
  [`PRIVACY.md`](PRIVACY.md) para o que já está garantido hoje.

PRs que incluam qualquer um dos itens acima serão fechados ou terão a
alteração removida antes do merge.

## O que É bem-vindo

* Correções de bugs, melhorias de performance, acessibilidade.
* Mudanças na lógica de leitura/validação do catálogo (`src/main/catalog.js`,
  `docs/CATALOG_SCHEMA.md`), desde que continuem tratando o catálogo como
  dado externo e não confiável por padrão.
* Testes novos ou melhorados (`npm test`).
* Melhorias de segurança e correções de vulnerabilidades — para relatos
  sensíveis, prefira abrir uma issue descrevendo o cenário sem detalhes de
  exploração públicos, se o problema for sério.

## Antes de abrir o PR

```bash
npm install
npm test
```

Garanta que a suíte de testes passa. Se sua mudança envolve dado vindo do
catálogo externo (nomes, descrições, IDs, URLs), garanta que qualquer texto
renderizado na interface passa por escaping (`escapeHtml`, já usado em todo
o projeto) e que qualquer valor usado como caminho de arquivo é validado
antes de chegar ao sistema de arquivos.
