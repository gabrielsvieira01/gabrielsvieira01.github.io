// =============================================================================
// Service worker da agenda.
//
// Duas políticas diferentes de propósito:
//
//  - APP SHELL (html/css/js/ícone): stale-while-revalidate. Responde na
//    hora com o que está em cache (abre instantâneo e funciona offline) e,
//    em paralelo, busca a versão nova na rede pra próxima visita. Cache
//    puro seria mais rápido ainda, mas aí editar o app e recarregar não
//    mostraria nada até alguém lembrar de subir o CACHE_VERSION na mão —
//    e isso é um pé na jaula esperando acontecer.
//  - DADOS (output/events.js e events.json): network-first com cache de
//    reserva. O horário é reextraído da planilha de tempos em tempos, e
//    seria péssimo alguém consultar uma semana desatualizada porque o
//    service worker serviu a versão velha do cache.
//
// Mudar o CACHE_VERSION continua sendo o jeito de forçar limpeza geral
// (ele apaga os caches antigos no 'activate'), mas não é mais obrigatório
// a cada edição.
// =============================================================================

const CACHE_VERSION = "semana-padrao-v1";

const APP_SHELL = [
  "./",
  "./horarios-interativos.html",
  "./assets/shared.js",
  "./assets/app.js",
  "./assets/icon.svg",
  "./manifest.webmanifest",
  // O events.js entra aqui só pra GARANTIR que exista uma cópia offline
  // desde a instalação: sem ele a agenda abre vazia no avião. Em runtime
  // ele continua sendo network-first (ver isDataRequest), então a versão
  // servida no dia a dia é sempre a mais nova.
  "./output/events.js",
];

const DATA_PATHS = ["/output/events.js", "/output/events.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // addAll é tudo-ou-nada: um 404 em qualquer item aborta a instalação
      // inteira. Cada item vai sozinho pra que uma falha isolada não
      // derrube o resto.
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isDataRequest(url) {
  return DATA_PATHS.some((p) => url.pathname.endsWith(p));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isDataRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      // Responde já com o cache (se houver) e deixa a revalidação correndo
      // por fora; sem cache, espera a rede.
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    })
  );
});
