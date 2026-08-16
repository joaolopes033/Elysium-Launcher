# Política de Privacidade

Este documento descreve o que o Elysium Launcher faz e não faz em relação a
dados de quem usa o app. Ele reflete o comportamento real do código deste
repositório — não é um texto genérico.

## O que este projeto NÃO coleta

- Não existe telemetria, analytics, rastreamento de uso ou relatório de
  erros enviado para qualquer servidor.
- Não existe conta de usuário, login, e-mail ou qualquer identificador
  pessoal solicitado pelo app.
- Não existe backend ou servidor operado por este projeto. O código não
  envia nenhum dado para os mantenedores do Elysium Launcher, porque não
  há para onde enviar.

## O que fica armazenado, e onde

Tudo o que o app grava fica **somente no computador de quem usa o app**,
numa pasta de configuração local do sistema operacional (a pasta padrão de
dados de aplicativos do usuário no Windows/macOS/Linux). Isso inclui:

- Preferências (pasta de downloads escolhida, opção de fechar para a
  bandeja do sistema).
- A URL da fonte de catálogo configurada, e uma cópia em cache do último
  catálogo baixado com sucesso (usada quando não há conexão).
- A biblioteca de jogos instalados localmente (caminho, status, executável
  configurado).
- O registro de aceite do aviso legal (se foi aceito e quando).

Nenhum desses dados é transmitido para fora da máquina de quem usa o app
por este projeto. Se a pasta de instalação for apagada manualmente, esses
dados vão junto.

## O que foge do controle deste projeto

Por natureza do que o app faz, duas coisas gerem tráfego de rede que **não
passa por nenhum servidor deste projeto** e não pode ser controlado por
ele:

- **Busca do catálogo**: ao sincronizar, o app faz uma requisição HTTP(S)
  comum para a URL que a pessoa configurou. Como em qualquer requisição
  HTTP, o servidor que hospeda esse catálogo vê o IP de quem fez a
  requisição. Isso é definido por quem opera aquele servidor, não por este
  projeto.
- **Download via BitTorrent**: o protocolo BitTorrent é par-a-par (P2P) por
  definição — durante um download, outros participantes da mesma rede
  (peers) veem o IP de quem está baixando/enviando, e trackers/DHT também
  ficam cientes da participação naquele torrent específico. Isso é
  inerente ao protocolo, usado por qualquer cliente BitTorrent, não algo
  que este app adiciona.
- **Busca de capa dos jogos** (opcional, ligada por padrão, desligável em
  Configurações): quando um item do catálogo não traz uma imagem de capa
  própria, o app busca a página de `officialWebsite` daquele jogo — já
  presente no catálogo — e procura a imagem de preview que aquele site já
  declara publicamente (tag `og:image`/`twitter:image`, o mesmo mecanismo
  usado por apps de mensagem ao gerar preview de link). Isso soma uma
  requisição HTTPS por jogo (com limite de tempo e de tamanho), feita uma
  única vez por jogo e depois guardada em cache local. Nenhum arquivo de
  imagem é baixado ou salvo pelo app — só a URL da imagem é resolvida; o
  carregamento em si acontece direto na interface, como qualquer imagem
  de página web.

## Alterações

Se o comportamento de coleta/armazenamento de dados do app mudar em uma
versão futura, este arquivo deve ser atualizado junto, no mesmo Pull
Request que introduzir a mudança.
