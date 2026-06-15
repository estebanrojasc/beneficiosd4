// Service worker del kiosko. Estrategia:
// - Páginas (HTML): RED primero (así tras un deploy siempre se baja el HTML
//   nuevo con los hashes de CSS/JS correctos). La caché solo es respaldo offline.
// - Modelos de IA y wasm de ORT: caché primero (cambian poco y son pesados);
//   van en una caché separada para NO re-descargarlos en cada deploy.
// - Resto de estáticos públicos: caché primero.
//
// Sube APP_CACHE cuando cambie la app; sube MODEL_CACHE solo si cambian modelos.
const APP_CACHE = "almuerzo-app-v4";
const MODEL_CACHE = "almuerzo-models-v1";
const KEEP = [APP_CACHE, MODEL_CACHE];

const PRECACHE_APP = ["/", "/validar", "/enrolar", "/manifest.webmanifest"];
const PRECACHE_MODELS = [
  "/models/arcface/det_500m.onnx",
  "/models/arcface/w600k_mbf.onnx",
  "/ort/ort-wasm-simd-threaded.asyncify.mjs",
  "/ort/ort-wasm-simd-threaded.asyncify.wasm",
  "/ort/ort-wasm-simd-threaded.jsep.mjs",
  "/ort/ort-wasm-simd-threaded.jsep.wasm",
  "/ort/ort-wasm-simd-threaded.jspi.mjs",
  "/ort/ort-wasm-simd-threaded.jspi.wasm",
  "/ort/ort-wasm-simd-threaded.mjs",
  "/ort/ort-wasm-simd-threaded.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_CACHE).then((c) => c.addAll(PRECACHE_APP)).catch(() => {}),
      caches
        .open(MODEL_CACHE)
        .then((c) => c.addAll(PRECACHE_MODELS))
        .catch(() => {}),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isModel(pathname) {
  return pathname.startsWith("/models/") || pathname.startsWith("/ort/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Las APIs y assets internos de Next siempre van a red.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    return;
  }

  // Páginas (navegación): RED primero, caché como respaldo offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_CACHE).then((c) => c.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/"))
        )
    );
    return;
  }

  // Modelos / wasm: caché primero (caché de modelos persistente).
  if (isModel(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200 && response.type !== "opaque") {
            const copy = response.clone();
            caches.open(MODEL_CACHE).then((c) => c.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Resto de estáticos públicos: caché primero, con actualización en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== "opaque") {
            const copy = response.clone();
            caches.open(APP_CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
