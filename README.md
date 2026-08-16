# Elysium Launcher

Launcher de jogos multiplataforma (Windows, macOS e Linux), construído com
Electron. O Elysium Launcher **não embute, não hospeda e não indexa nenhum
jogo**. Ele é um cliente neutro: lê um catálogo em JSON a partir de uma URL
que a própria pessoa que usa o app escolhe e configura, e oferece três
formas de instalar o que estiver listado nesse catálogo — torrent, download
HTTP direto, ou abrir a página oficial para instalação manual.

Sem uma fonte de catálogo configurada, a biblioteca fica vazia e o app não
faz nenhuma requisição de rede relacionada a catálogo.

## O que o app faz, tecnicamente

- **Catálogo**: busca um JSON de uma URL configurada em Configurações →
  Fonte do Catálogo. Formato completo em
  [`docs/CATALOG_SCHEMA.md`](docs/CATALOG_SCHEMA.md). O app nunca traz uma
  URL padrão pré-configurada.
- **Download via torrent**: usa a biblioteca [WebTorrent](https://webtorrent.io/)
  (pacote `webtorrent` no npm) para baixar magnet links/arquivos `.torrent`
  apontados pelo catálogo. Isso significa protocolo **BitTorrent**
  real — o cliente participa de uma rede par-a-par (P2P), o que inclui
  reenviar pedaços do arquivo para outros participantes durante o
  download, como qualquer cliente BitTorrent.
- **Download via HTTP direto**: quando o item do catálogo tem um link de
  download HTTP(S) direto em vez de torrent.
- **Instalação manual**: quando o item não tem nem torrent nem link direto,
  o app abre a página oficial do projeto no navegador padrão, e a pessoa
  configura o executável manualmente depois.
- **Biblioteca**: o que já foi instalado fica registrado localmente (status,
  caminho, executável configurado), sem relação com o catálogo remoto.

Nada disso depende de um servidor mantido por este projeto. Não existe
backend proprietário — o único servidor externo envolvido é aquele que
hospeda o JSON do catálogo, escolhido e configurado por cada pessoa que usa
o app.

## Rodando localmente

```bash
npm install
npm start        # abre o launcher
npm test          # roda a suíte de testes de lógica pura (sem precisar de rede)
```

Na primeira execução, o app exibe um aviso legal bloqueante (ver
[`LEGAL.md`](LEGAL.md)) — é preciso aceitar para liberar a tela principal.
Depois, configure uma fonte de catálogo em Configurações para começar a ver
itens na Loja/Biblioteca.

## Empacotando (build de distribuição)

```bash
npm run dist:win     # instalador NSIS para Windows
npm run dist:linux   # AppImage para Linux
npm run dist:mac     # dmg para macOS
```

O empacotamento usa [electron-builder](https://www.electron.build/) e, no
pós-empacotamento (`build/afterPack.js`), aplica um endurecimento adicional
via [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
— entre outras coisas, desativa a possibilidade de rodar o binário
empacotado como um interpretador Node.js genérico.

## Segurança

Medidas em vigor no código, na versão atual:

- Janela principal com `contextIsolation` ativado, `nodeIntegration`
  desativado e `sandbox` ativado; toda comunicação entre a interface e o
  processo principal passa por uma API restrita exposta via `preload.js`
  (`contextBridge`), não por acesso direto a APIs do Node/Electron.
- Content-Security-Policy restritiva no HTML da interface.
- `shell.openExternal` só é chamado com URLs que começam literalmente com
  `http://` ou `https://` — qualquer outro esquema é recusado.
- A URL da fonte do catálogo também é restrita a `http://`/`https://` antes
  de qualquer requisição.
- O identificador (`id`) de cada item do catálogo é validado contra um
  formato restrito (letras, números, hífen e underscore) antes de virar
  nome de pasta em disco ou chave de dados internos — evita que uma fonte
  de catálogo maliciosa ou comprometida escreva fora da pasta de downloads
  escolhida.
- Busca automática de capa (quando ligada): só aceita URLs `https://`, tem
  limite de tempo e de bytes lidos por requisição, roda com concorrência
  limitada, nunca baixa/persiste o arquivo de imagem em si (só resolve a
  URL), e o resultado por jogo é lido de um regex simples e restrito — sem
  parser de HTML completo, para reduzir superfície de ataque.
- Endurecimento de binário empacotado via Electron Fuses (ver seção acima).

Isso reduz superfícies de ataque conhecidas, mas nenhum software está livre
de falhas — se encontrar um problema de segurança, abra uma issue
descrevendo o cenário.

## Privacidade e responsabilidade

- [`PRIVACY.md`](PRIVACY.md) — o que o app coleta (nada, hoje) e o que
  foge do controle dele (tráfego de rede inerente a HTTP/BitTorrent).
- [`LEGAL.md`](LEGAL.md) — termos de uso, isenção de garantia e limitação
  de responsabilidade. Leitura obrigatória (o app bloqueia o uso até
  aceitar).
- [`LICENSE`](LICENSE) — licença MIT do código deste repositório.

## Contribuindo

Veja [`CONTRIBUTING.md`](CONTRIBUTING.md), em especial a seção sobre o que
**não** enviar em Pull Requests.
