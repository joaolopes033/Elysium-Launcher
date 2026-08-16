'use strict';

async function loadWebTorrent() {
  const mod = await import('webtorrent');
  return mod.default || mod;
}

const TORRENT_A_MAGNET =
  'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&dn=exemplo-torrent-a' +
  '&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce' +
  '&tr=udp%3A%2F%2Ffosstorrents.com%3A6969%2Fannounce';

const TORRENT_A_INFOHASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TORRENT_A_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://fosstorrents.com:6969/announce',
];

const SINTEL_MAGNET =
  'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel' +
  '&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337' +
  '&tr=wss%3A%2F%2Ftracker.openwebtorrent.com';

let onUnhandled = null;
process.on('unhandledRejection', (reason) => {
  console.error('\n[GLOBAL] Erro nao tratado escapou do WebTorrent (bem provavelmente O BUG que estamos investigando):');
  console.error('  ', (reason && reason.message) || reason);
  if (onUnhandled) {
    const handler = onUnhandled;
    onUnhandled = null;
    handler(reason);
  }
});

function runScenario(WebTorrent, label, torrentId, opts) {
  return new Promise((resolve) => {
    console.log(`\n===== CENARIO: ${label} =====`);
    console.log('torrentId:', typeof torrentId === 'string' ? torrentId : JSON.stringify(torrentId));
    console.log('opts:', JSON.stringify(opts));

    const client = new WebTorrent();
    let finished = false;

    function finish(outcome, err) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      onUnhandled = null;
      const done = () => resolve({ label, outcome, err });
      try { client.destroy(done); } catch { done(); }
    }

    onUnhandled = (reason) => finish('erro-nao-tratado-global', reason);

    const timeout = setTimeout(() => {
      console.log(`[${label}] TIMEOUT (30s) — nao travou nem deu erro, so nao achou peer a tempo. Isso e diferente do bug (o bug e um erro, nao demora).`);
      finish('timeout');
    }, 30000);

    client.on('error', (err) => {
      console.error(`[${label}] ERRO NO CLIENT:`, err && err.message);
      finish('erro-client', err);
    });

    try {
      const torrent = client.add(torrentId, { path: `./teste-download-${label}`, ...opts });

      torrent.on('infoHash', () => console.log(`[${label}] infoHash determinado:`, torrent.infoHash));
      torrent.on('metadata', () => console.log(`[${label}] METADATA recebido. Nome:`, torrent.name));
      torrent.on('warning', (w) => console.warn(`[${label}] aviso:`, (w && w.message) || w));

      torrent.on('ready', () => {
        console.log(`[${label}] SUCESSO — torrent pronto. Peers: ${torrent.numPeers}`);
        finish('sucesso');
      });

      torrent.on('error', (err) => {
        console.error(`[${label}] ERRO NO TORRENT:`, err && err.message);
        finish('erro-torrent', err);
      });
    } catch (err) {
      console.error(`[${label}] ERRO SINCRONO ao chamar client.add():`, err);
      finish('erro-sincrono', err);
    }
  });
}

async function main() {
  console.log('Testando WebTorrent isoladamente (sem Electron, sem o launcher)...');
  console.log('Versao do webtorrent instalada:', require('webtorrent/package.json').version);
  const WebTorrent = await loadWebTorrent();

  const results = [];
  results.push(await runScenario(WebTorrent, 'torrent-a-magnet-completo', TORRENT_A_MAGNET, {}));
  results.push(await runScenario(WebTorrent, 'torrent-a-so-infohash-com-trackers', TORRENT_A_INFOHASH, { announce: TORRENT_A_TRACKERS }));
  results.push(await runScenario(WebTorrent, 'sintel-controle', SINTEL_MAGNET, {}));

  console.log('\n\n===== TESTE EXTRA: dois downloads AO MESMO TEMPO =====');
  const [simA, simB] = await Promise.all([
    runScenario(WebTorrent, 'simultaneo-torrent-a', TORRENT_A_INFOHASH, { announce: TORRENT_A_TRACKERS }),
    runScenario(WebTorrent, 'simultaneo-sintel', SINTEL_MAGNET, {}),
  ]);
  results.push(simA, simB);

  console.log('\n\n===== RESUMO =====');
  results.forEach((r) => console.log(`${r.label}: ${r.outcome}`));

  const [torrentAMagnetCompleto, torrentASoInfohash, sintel] = results;
  const algumCrashou = results.some((r) => r.outcome.startsWith('erro'));
  const simultaneoOk = !simA.outcome.startsWith('erro') && !simB.outcome.startsWith('erro');

  console.log('\n===== DIAGNOSTICO =====');
  if (algumCrashou) {
    console.log('Ainda apareceu erro em pelo menos um cenario — me manda esse resultado completo.');
  } else if (sintel.outcome === 'sucesso' && torrentAMagnetCompleto.outcome !== 'sucesso' && torrentASoInfohash.outcome !== 'sucesso') {
    console.log('O Sintel (torrent de controle, sempre tem gente compartilhando) funcionou, mas o torrent A');
    console.log('nao. Isso indica que essa magnet especifica do torrent A esta com poucos ou nenhum peer');
    console.log('disponivel agora — nao e bug nem bloqueio de rede. Tente novamente mais tarde, ou teste');
    console.log('outro jogo do catalogo.');
  } else if (sintel.outcome === 'timeout' && torrentAMagnetCompleto.outcome === 'timeout' && torrentASoInfohash.outcome === 'timeout') {
    console.log('Nenhum dos tres achou peer, nem o Sintel (que normalmente sempre tem gente compartilhando).');
    console.log('Isso aponta pra bloqueio de rede/firewall no seu PC ou roteador, especificamente de trafego');
    console.log('UDP (usado pelo DHT e pelos trackers) — nao e bug no launcher nem no WebTorrent. Veja a');
    console.log('secao "Sem peers / timeout mesmo com o Sintel" no README pra como investigar isso.');
  } else if (torrentAMagnetCompleto.outcome === 'sucesso' || torrentASoInfohash.outcome === 'sucesso') {
    console.log('Pelo menos um cenario do torrent A funcionou — otimo, o launcher deve funcionar normalmente agora.');
  } else {
    console.log('Resultado misto — cole esse resumo completo de volta que a gente interpreta junto.');
  }
  console.log(simultaneoOk
    ? 'Teste de simultaneidade: os dois downloads ao mesmo tempo terminaram sem erro de cliente duplicado. OK.'
    : 'Teste de simultaneidade: apareceu erro rodando os dois ao mesmo tempo — me manda o log completo.');

  process.exit(0);
}

main().catch((err) => {
  console.error('Erro inesperado no script de teste:', err);
  process.exit(1);
});
