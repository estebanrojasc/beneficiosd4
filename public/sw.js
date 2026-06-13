// Service worker liviano: cachea modelos de IA y la app para uso offline en el kiosko.
const CACHE = "almuerzo-v3-arcface";
const PRECACHE = [
  "/",
  "/validar",
  "/enrolar",
  "/manifest.webmanifest",
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
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Las APIs y assets internos de Next siempre van a red.
  // Cachear /_next en dev/producción puede dejar chunks antiguos y romper HMR.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
