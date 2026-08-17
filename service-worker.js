// 道の駅めぐり 北海道 — Service Worker
// アプリシェル＋駅データ＋マトリクスをキャッシュしオフラインでも起動できるようにする。
// 地図タイル(OSM)とOSRM経路APIは通信が必要（オフライン時は直線概算にフォールバック）。
const CACHE = "michinoeki-v13";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/stations-data.js",
  "./assets/matrix-data.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const url = e.request.url;
  // OSRM経路・OSMタイルは常にネット優先（キャッシュしすぎない）
  if (url.includes("router.project-osrm.org") || url.includes("tile.openstreetmap.org")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // アプリ本体（index.html / SW / manifest / データJS）はネット優先→オフライン時のみキャッシュ
  // → 更新が次に開いた時に必ず届く。データJSはサイズがあるので3秒でキャッシュに切替。
  const isShell = e.request.mode === "navigate" || /\/(index\.html|manifest\.webmanifest|assets\/[a-z-]+-data\.js)(\?|$)/.test(url) || url.endsWith("/");
  if (isShell) {
    e.respondWith(
      Promise.race([
        fetch(e.request).then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
          return res;
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), url.includes("-data.js") ? 3000 : 4000))
      ]).catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }
  // それ以外（アイコン・Leaflet等）はキャッシュ優先→なければネット→キャッシュに保存
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && e.request.method === "GET") {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
