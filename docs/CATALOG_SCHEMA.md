# Formato do Catálogo — Elysium Launcher

O Elysium Launcher não embute nenhum catálogo. Em **Configurações → Fonte do Catálogo**, você informa a URL de um arquivo JSON público que segue o formato abaixo.

## Estrutura geral

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-08-01T12:00:00Z",
  "games": []
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `schemaVersion` | number | não | Versão do formato. O app assume `1` se omitido. |
| `updatedAt` | string (ISO 8601) | não | Quando o catálogo foi gerado/atualizado pela última vez. |
| `games` | array | sim | Lista de itens do catálogo (pode ser vazia). |

## Campos de cada item em `games`

### Obrigatórios

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | Identificador único e estável do item dentro do catálogo. |
| `name` | string | Nome de exibição. |
| `license` | string | Licença do software (ex.: `GPL-3.0`, `MIT`, `CC-BY-SA-4.0`). |
| `officialWebsite` | string (URL) | Site oficial do projeto/jogo. |
| `repository` | string (URL) | Repositório de código-fonte, ou canal de distribuição oficial. |

`download.direct`/`download.torrent` **não** são obrigatórios (veja "Opcionais" abaixo) — um item sem nenhum dos dois é válido do mesmo jeito: o Elysium Launcher cai para um fluxo manual, abrindo `downloadPage` (ou `officialWebsite`, que já é obrigatório) no navegador e marcando a biblioteca como "manual".

### Opcionais

| Campo | Tipo | Descrição |
|---|---|---|
| `tagline` | string | Frase curta de efeito, usada no destaque da Home. |
| `shortDescription` | string | Descrição curta; usada como alternativa à `tagline` no destaque da Home quando ela não existir. |
| `description` | string | Descrição mais longa, usada na página do jogo. |
| `genres` | string[] | Gêneros (ex.: `["estratégia", "aventura"]`). Alimenta os filtros por categoria da Loja e da Home. |
| `tags` | string[] | Tags livres. |
| `os` | string[] | Sistemas suportados (ex.: `["windows", "linux", "mac"]`). |
| `featured` | boolean | Se `true`, o item entra no destaque (hero) da Home. Sem nenhum item `featured`, a Home usa os primeiros itens do catálogo como fallback. |
| `dateAdded` | string (ISO 8601) | Usado para ordenar "Adicionados recentemente" na Home e na Loja. Sem esse campo, o item fica no fim dessa ordenação. |
| `coverImageUrl` | string (URL https) | Opcional. Link direto para uma imagem de capa do jogo. Quem monta o catálogo é responsável por ter os direitos sobre essa imagem — o app só exibe o que a URL apontar, do mesmo jeito que faz com `officialWebsite`/`repository`. Só URLs `https://` são aceitas. |
| `coverPalette` | string[2] | Duas cores hex (ex.: `["#223245", "#17222e"]`) usadas num gradiente como capa do jogo, quando não há `coverImageUrl` (nem uma capa resolvida automaticamente — ver seção abaixo). O Elysium Launcher gera esse gradiente a partir dessas cores + o nome do jogo, de propósito, para sempre ter uma capa que não depende de nenhuma arte licenciada/proprietária. Sem esse campo, usa um par de cores padrão. |
| `download.direct` | string (URL) | Link de download HTTP direto. |
| `download.torrent` | string (URL ou magnet URI) | Link `.torrent` ou magnet oficial. |
| `downloadPage` | string (URL) | Página para download manual, usada quando não há `download.direct` nem `download.torrent`. Sem esse campo, o fallback manual usa `officialWebsite`. |

## Capa do jogo: de onde ela vem

Em ordem de prioridade:

1. **`coverImageUrl`**, se o item do catálogo trouxer esse campo.
2. **Resolução automática** (opcional, ligada por padrão em Configurações →
   "Buscar capas automaticamente"): sem `coverImageUrl`, o app busca a
   própria página de `officialWebsite` do jogo e procura a imagem que
   aquele site já declara para preview de link (`<meta property="og:image">`
   ou `<meta name="twitter:image">`) — o mesmo mecanismo que WhatsApp,
   Discord ou Slack usam pra gerar preview ao colar um link. O app nunca
   baixa nem guarda esse arquivo de imagem; só resolve a URL (sempre
   exigindo `https://`) e deixa a própria interface carregá-la direto da
   fonte original. O resultado fica em cache local por jogo, então cada
   site só é consultado uma vez.
3. **Gradiente gerado localmente** a partir de `coverPalette` (ou de um par
   de cores padrão), se nenhuma das opções acima resolver nada. Essa opção
   nunca depende de rede e nunca falha.

## Instalação: automática vs. manual

Ao instalar um item, o Elysium Launcher escolhe nesta ordem:

1. `download.torrent`, se presente — baixa via WebTorrent.
2. senão `download.direct`, se presente — baixa via HTTP.
3. senão abre `downloadPage` (ou `officialWebsite`) no navegador e marca a biblioteca como "instalação manual" — o usuário baixa e configura o executável por conta própria em Configurações do jogo.

## Validação e itens inválidos

O Elysium Launcher valida cada item ao sincronizar o catálogo:

- Item sem `id`, `name`, `license`, `officialWebsite` ou `repository` → **descartado silenciosamente**.
- Um item inválido nunca interrompe o carregamento dos demais, nem quebra o app.

## Exemplo completo (100% fictício)

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-08-01T12:00:00Z",
  "games": [
    {
      "id": "exemplo-jogo-001",
      "name": "Jogo Exemplo",
      "tagline": "Uma aventura de exemplo, criada só para ilustrar o schema",
      "shortDescription": "Versão curta da descrição, usada como alternativa à tagline.",
      "description": "Este item não existe de verdade — serve apenas para mostrar o formato esperado pelo Elysium Launcher. Substitua por itens reais do seu próprio catálogo.",
      "genres": ["aventura", "estratégia"],
      "tags": ["exemplo", "código-aberto"],
      "os": ["windows", "linux", "mac"],
      "featured": false,
      "dateAdded": "2026-07-15T00:00:00Z",
      "license": "GPL-3.0",
      "officialWebsite": "https://exemplo.invalid/jogo-exemplo",
      "repository": "https://github.com/exemplo-invalido/jogo-exemplo",
      "download": {
        "direct": "https://exemplo.invalid/downloads/jogo-exemplo-v1.0.zip",
        "torrent": "https://exemplo.invalid/downloads/jogo-exemplo-v1.0.torrent"
      }
    }
  ]
}
```

> Os domínios acima usam o TLD reservado `.invalid` ([RFC 2606](https://www.rfc-editor.org/rfc/rfc2606)) de propósito — não apontam para nenhum recurso real.

## Hospedando seu próprio catálogo

Qualquer JSON público acessível por HTTP(S) que siga este formato funciona — um gist, um arquivo em um repositório Git, um objeto em um bucket público, um endpoint gerado dinamicamente, etc. O Elysium Launcher não recomenda, prioriza nem lista nenhum host específico; a URL é sempre escolhida por quem usa o app.
