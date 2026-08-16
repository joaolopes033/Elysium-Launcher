'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`FALHOU  ${name}`);
    console.log(`        ${err.message}`);
  }
}

async function main() {
  console.log('\n--- torrentManager: isValidTorrentSource ---');
  const torrentManager = require(path.join(__dirname, '..', 'src', 'main', 'torrentManager.js'));
  const { isValidTorrentSource, extractMagnetParts, looksLikeBencodedTorrent } = torrentManager;

  await test('aceita magnet URI valida (formato padrao, com dn)', () => {
    const magnet = 'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&dn=exemplo-jogo-1.0.zip';
    assert.strictEqual(isValidTorrentSource(magnet), true);
  });

  await test('aceita URL http(s) terminando em .torrent', () => {
    assert.strictEqual(isValidTorrentSource('https://exemplo.org/downloads/exemplo-jogo.torrent'), true);
  });

  await test('aceita infoHash puro de 40 caracteres hexadecimais', () => {
    assert.strictEqual(isValidTorrentSource('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), true);
  });

  await test('REJEITA undefined (este era exatamente o crash original)', () => {
    assert.strictEqual(isValidTorrentSource(undefined), false);
  });

  await test('rejeita null', () => {
    assert.strictEqual(isValidTorrentSource(null), false);
  });

  await test('rejeita string vazia', () => {
    assert.strictEqual(isValidTorrentSource(''), false);
  });

  await test('rejeita string em branco (so espacos)', () => {
    assert.strictEqual(isValidTorrentSource('   '), false);
  });

  await test('rejeita texto aleatorio que nao e magnet nem url de torrent', () => {
    assert.strictEqual(isValidTorrentSource('isso nao e um torrent'), false);
  });

  await test('rejeita magnet malformada (sem o btih)', () => {
    assert.strictEqual(isValidTorrentSource('magnet:notreal'), false);
  });

  await test('rejeita URL http comum que nao termina em .torrent', () => {
    assert.strictEqual(isValidTorrentSource('https://exemplo.com/pagina.html'), false);
  });

  await test('rejeita tipos que nao sao string (number)', () => {
    assert.strictEqual(isValidTorrentSource(12345), false);
  });

  await test('rejeita tipos que nao sao string (objeto)', () => {
    assert.strictEqual(isValidTorrentSource({ magnet: 'magnet:?xt=urn:btih:abc' }), false);
  });

  await test('rejeita tipos que nao sao string (array)', () => {
    assert.strictEqual(isValidTorrentSource(['magnet:?xt=urn:btih:abc']), false);
  });

  console.log('\n--- torrentManager: extractMagnetParts (contorno do bug do WebTorrent) ---');

  await test('extrai o infoHash de um magnet completo (com dn e trackers)', async () => {
    const magnet = 'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&dn=exemplo-jogo-1.0.zip&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce';
    const { infoHash, trackers } = await extractMagnetParts(magnet);
    assert.strictEqual(infoHash, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.deepStrictEqual(trackers, ['udp://tracker.opentrackr.org:1337/announce']);
  });

  await test('extrai o infoHash de um magnet "nu" (so o hash, sem dn nem tr)', async () => {
    const magnet = 'magnet:?xt=urn:btih:5858f7533ff21c227429169933139240ad7b7ced';
    const { infoHash, trackers } = await extractMagnetParts(magnet);
    assert.strictEqual(infoHash, '5858f7533ff21c227429169933139240ad7b7ced');
    assert.deepStrictEqual(trackers, []);
  });

  await test('extrai multiplos trackers quando ha mais de um "tr="', async () => {
    const magnet = 'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&tr=udp%3A%2F%2Fa.com%3A80&tr=udp%3A%2F%2Fb.com%3A80';
    const { trackers } = await extractMagnetParts(magnet);
    assert.strictEqual(trackers.length, 2);
  });

  const { withFallbackTrackers, FALLBACK_TRACKERS } = torrentManager;

  await test('withFallbackTrackers: sempre inclui os trackers de fallback, mesmo partindo de lista vazia', () => {
    const resultado = withFallbackTrackers([]);
    FALLBACK_TRACKERS.forEach((t) => assert.ok(resultado.includes(t), `deveria incluir ${t}`));
  });

  await test('withFallbackTrackers: preserva os trackers originais do magnet junto com os de fallback', () => {
    const resultado = withFallbackTrackers(['udp://tracker-do-catalogo.example:1111/announce']);
    assert.ok(resultado.includes('udp://tracker-do-catalogo.example:1111/announce'));
    FALLBACK_TRACKERS.forEach((t) => assert.ok(resultado.includes(t)));
  });

  await test('withFallbackTrackers: nao duplica quando o magnet ja tem um dos trackers de fallback', () => {
    const resultado = withFallbackTrackers([FALLBACK_TRACKERS[0]]);
    const ocorrencias = resultado.filter((t) => t === FALLBACK_TRACKERS[0]).length;
    assert.strictEqual(ocorrencias, 1);
  });

  console.log('\n--- torrentManager: looksLikeBencodedTorrent (validacao do .torrent baixado) ---');

  await test('aceita um buffer que comeca com "d" (bencode dictionary valido)', () => {
    assert.strictEqual(looksLikeBencodedTorrent(Buffer.from('d8:announce...')), true);
  });

  await test('rejeita um buffer vazio', () => {
    assert.strictEqual(looksLikeBencodedTorrent(Buffer.alloc(0)), false);
  });

  await test('rejeita conteudo que parece HTML (pagina de erro em vez do .torrent)', () => {
    assert.strictEqual(looksLikeBencodedTorrent(Buffer.from('<!DOCTYPE html>')), false);
  });

  await test('rejeita conteudo que parece JSON', () => {
    assert.strictEqual(looksLikeBencodedTorrent(Buffer.from('{"error":"not found"}')), false);
  });

  await test('rejeita valores que nao sao Buffer', () => {
    assert.strictEqual(looksLikeBencodedTorrent('d8:announce'), false);
    assert.strictEqual(looksLikeBencodedTorrent(null), false);
    assert.strictEqual(looksLikeBencodedTorrent(undefined), false);
  });

  console.log('\n--- components.js: formatacao e escape (renderer) ---');
  const componentsUrl = 'file://' + path.join(__dirname, '..', 'src', 'renderer', 'js', 'components.js');
  const components = await import(componentsUrl);
  const { formatBytes, formatSpeed, formatEta, statusLabel, escapeHtml } = components;

  await test('formatBytes: 0 vira "0 MB"', () => {
    assert.strictEqual(formatBytes(0), '0 MB');
  });

  await test('formatBytes: undefined nao quebra, vira "0 MB"', () => {
    assert.strictEqual(formatBytes(undefined), '0 MB');
  });

  await test('formatBytes: 500 bytes vira "500 B"', () => {
    assert.strictEqual(formatBytes(500), '500 B');
  });

  await test('formatBytes: 1536 bytes (1.5 KB) formata em KB', () => {
    assert.strictEqual(formatBytes(1536), '1.5 KB');
  });

  await test('formatBytes: valores grandes chegam a GB', () => {
    const result = formatBytes(1.5 * 1024 * 1024 * 1024);
    assert.ok(result.endsWith('GB'), `esperado terminar em GB, recebeu "${result}"`);
  });

  await test('formatEta: Infinity vira "--" (nao mostra tempo absurdo)', () => {
    assert.strictEqual(formatEta(Infinity), '--');
  });

  await test('formatEta: 0 ou negativo vira "--"', () => {
    assert.strictEqual(formatEta(0), '--');
    assert.strictEqual(formatEta(-5), '--');
  });

  await test('formatEta: segundos abaixo de 1 minuto mostra em segundos', () => {
    assert.strictEqual(formatEta(30), '30 s');
  });

  await test('formatEta: 90 segundos mostra em minutos', () => {
    assert.strictEqual(formatEta(90), '2 min');
  });

  await test('formatEta: mais de 1 hora mostra horas e minutos', () => {
    assert.strictEqual(formatEta(3900), '1h 5min');
  });

  await test('statusLabel: estados novos (bug fix) tem rotulo amigavel', () => {
    assert.strictEqual(statusLabel('metadados'), 'Buscando peers e metadados');
    assert.strictEqual(statusLabel('sem-peers'), 'Nenhum peer encontrado ainda');
  });

  await test('statusLabel: estado desconhecido nao quebra, devolve o proprio valor', () => {
    assert.strictEqual(statusLabel('estado-que-nao-existe'), 'estado-que-nao-existe');
  });

  await test('escapeHtml: escapa tags (protecao contra injecao no innerHTML)', () => {
    assert.strictEqual(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  await test('escapeHtml: escapa aspas', () => {
    assert.strictEqual(escapeHtml(`nome com "aspas" e 'apostrofo'`), 'nome com &quot;aspas&quot; e &#39;apostrofo&#39;');
  });

  await test('escapeHtml: null/undefined nao quebra, vira string vazia', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
  });

  console.log('\n--- catalog.js: validacao do catalogo (isValidCatalogItem / sanitizeCatalogPayload) ---');
  const catalog = require(path.join(__dirname, '..', 'src', 'main', 'catalog.js'));
  const { isValidCatalogItem, sanitizeCatalogPayload } = catalog;

  const exemploValido = {
    id: 'jogo-exemplo',
    name: 'Jogo Exemplo',
    license: 'MIT',
    officialWebsite: 'https://exemplo.org',
    repository: 'https://exemplo.org/repo',
  };

  await test('isValidCatalogItem: aceita item com todos os campos obrigatorios (id/name/license/officialWebsite/repository)', () => {
    assert.strictEqual(isValidCatalogItem(exemploValido), true);
  });

  await test('isValidCatalogItem: rejeita quando falta qualquer campo obrigatorio', () => {
    ['id', 'name', 'license', 'officialWebsite', 'repository'].forEach((campo) => {
      const item = { ...exemploValido };
      delete item[campo];
      assert.strictEqual(isValidCatalogItem(item), false, `deveria rejeitar sem o campo "${campo}"`);
    });
  });

  await test('isValidCatalogItem: rejeita campo obrigatorio vazio ou so espacos', () => {
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, name: '' }), false);
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, license: '   ' }), false);
  });

  await test('isValidCatalogItem: nao exige download.torrent/download.direct (fallback manual via officialWebsite e valido)', () => {
    assert.strictEqual('download' in exemploValido, false);
    assert.strictEqual(isValidCatalogItem(exemploValido), true);
  });

  await test('isValidCatalogItem: rejeita null, undefined e tipos que nao sao objeto', () => {
    assert.strictEqual(isValidCatalogItem(null), false);
    assert.strictEqual(isValidCatalogItem(undefined), false);
    assert.strictEqual(isValidCatalogItem('string'), false);
    assert.strictEqual(isValidCatalogItem(42), false);
    assert.strictEqual(isValidCatalogItem([]), false);
  });

  await test('sanitizeCatalogPayload: lanca erro quando o payload nao tem "games" como array', () => {
    assert.throws(() => sanitizeCatalogPayload({}), /games/i);
    assert.throws(() => sanitizeCatalogPayload({ games: 'nao-e-array' }), /games/i);
    assert.throws(() => sanitizeCatalogPayload(null), /games/i);
  });

  await test('sanitizeCatalogPayload: filtra itens invalidos e mantem so os validos, sem lancar erro', () => {
    const payload = {
      schemaVersion: 1,
      updatedAt: '2026-01-01',
      games: [
        exemploValido,
        { id: 'incompleto', name: 'Sem license nem site' },
        { ...exemploValido, id: 'outro-valido', name: 'Outro Jogo' },
      ],
    };
    const resultado = sanitizeCatalogPayload(payload);
    assert.strictEqual(resultado.games.length, 2, 'deveria manter so os 2 itens validos e descartar o incompleto');
    assert.ok(resultado.games.every(isValidCatalogItem));
  });

  await test('sanitizeCatalogPayload: preserva schemaVersion/updatedAt e aplica default quando ausentes', () => {
    const comCampos = sanitizeCatalogPayload({ schemaVersion: 3, updatedAt: '2026-05-01', games: [] });
    assert.strictEqual(comCampos.schemaVersion, 3);
    assert.strictEqual(comCampos.updatedAt, '2026-05-01');

    const semCampos = sanitizeCatalogPayload({ games: [] });
    assert.strictEqual(semCampos.schemaVersion, 1);
    assert.strictEqual(semCampos.updatedAt, null);
  });

  console.log('\n--- catalog.js: seguranca do id (path traversal / prototype pollution) ---');

  await test('isValidCatalogItem: rejeita id com ".." (tentativa de sair da pasta de downloads)', () => {
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, id: '../../etc/passwd' }), false);
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, id: '..\\..\\algo' }), false);
  });

  await test('isValidCatalogItem: rejeita id com barra ou contra-barra', () => {
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, id: 'pasta/arquivo' }), false);
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, id: 'pasta\\arquivo' }), false);
  });

  await test('isValidCatalogItem: rejeita id "__proto__", "constructor" e "prototype"', () => {
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, id: '__proto__' }), false);
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, id: 'constructor' }), false);
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, id: 'prototype' }), false);
  });

  await test('isValidCatalogItem: aceita id normal (letras, numeros, hifen, underscore)', () => {
    assert.strictEqual(isValidCatalogItem({ ...exemploValido, id: 'jogo-2_final' }), true);
  });

  console.log('\n--- catalog.js: URL do catalogo precisa ser http/https ---');

  await test('testConnection: rejeita URL com esquema diferente de http/https (ex: file://)', async () => {
    const resultado = await catalog.testConnection('file:///etc/passwd');
    assert.strictEqual(resultado.ok, false);
  });

  await test('testConnection: rejeita string que nao e uma URL', async () => {
    const resultado = await catalog.testConnection('nao-e-uma-url');
    assert.strictEqual(resultado.ok, false);
  });

  console.log('\n--- store.js: bloqueio de chaves perigosas na library (defesa em profundidade) ---');
  const store = require(path.join(__dirname, '..', 'src', 'main', 'store.js'));

  await test('updateLibraryEntry: ignora gameId "__proto__" sem lancar excecao', () => {
    assert.doesNotThrow(() => store.updateLibraryEntry('__proto__', { status: 'baixado' }));
    assert.strictEqual({}.status, undefined, 'Object.prototype nao deveria ter sido alterado');
  });

  console.log('\n--- catalog.js: resolucao de capa (og:image / twitter:image) ---');
  const { extractMetaImageUrl, isHttpsUrl } = catalog;

  await test('extractMetaImageUrl: acha og:image com content depois da property', () => {
    const html = '<html><head><meta property="og:image" content="https://exemplo.org/capa.png"></head></html>';
    assert.strictEqual(extractMetaImageUrl(html, 'https://exemplo.org'), 'https://exemplo.org/capa.png');
  });

  await test('extractMetaImageUrl: acha og:image com content antes da property (ordem trocada)', () => {
    const html = '<html><head><meta content="https://exemplo.org/capa2.png" property="og:image"></head></html>';
    assert.strictEqual(extractMetaImageUrl(html, 'https://exemplo.org'), 'https://exemplo.org/capa2.png');
  });

  await test('extractMetaImageUrl: resolve URL relativa contra a URL base', () => {
    const html = '<html><head><meta property="og:image" content="/img/capa.png"></head></html>';
    assert.strictEqual(extractMetaImageUrl(html, 'https://exemplo.org/pagina'), 'https://exemplo.org/img/capa.png');
  });

  await test('extractMetaImageUrl: usa twitter:image quando nao ha og:image', () => {
    const html = '<html><head><meta name="twitter:image" content="https://exemplo.org/tw.png"></head></html>';
    assert.strictEqual(extractMetaImageUrl(html, 'https://exemplo.org'), 'https://exemplo.org/tw.png');
  });

  await test('extractMetaImageUrl: rejeita imagem http (nao https) e retorna null', () => {
    const html = '<html><head><meta property="og:image" content="http://exemplo.org/capa.png"></head></html>';
    assert.strictEqual(extractMetaImageUrl(html, 'https://exemplo.org'), null);
  });

  await test('extractMetaImageUrl: retorna null sem nenhuma meta tag de imagem', () => {
    assert.strictEqual(extractMetaImageUrl('<html><head></head></html>', 'https://exemplo.org'), null);
  });

  await test('isHttpsUrl: aceita https, rejeita http/javascript/file/string vazia', () => {
    assert.strictEqual(isHttpsUrl('https://exemplo.org/x.png'), true);
    assert.strictEqual(isHttpsUrl('http://exemplo.org/x.png'), false);
    assert.strictEqual(isHttpsUrl('javascript:alert(1)'), false);
    assert.strictEqual(isHttpsUrl('file:///etc/passwd'), false);
    assert.strictEqual(isHttpsUrl(''), false);
    assert.strictEqual(isHttpsUrl(null), false);
  });

  console.log(`\n${passed} passaram, ${failed} falharam.\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Erro ao rodar os testes:', err);
  process.exitCode = 1;
});
