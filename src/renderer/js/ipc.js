
if (!window.elysium) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:sans-serif;color:#eaf2f8;background:#0d1520;height:100vh;">' +
      '<h2>Elysium Launcher precisa rodar dentro do Electron</h2>' +
      '<p style="color:#93a5b8">Abra este projeto com <code>npm start</code> em vez de abrir o index.html direto no navegador.</p>' +
      '</div>';
  });
  throw new Error('window.elysium indisponivel — rode o app via "npm start" (Electron), nao como arquivo solto no navegador.');
}

export const elysium = window.elysium;
