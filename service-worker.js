// 道の駅めぐり 北海道 — Service Worker
// アプリシェル＋駅データ＋マトリクスをキャッシュしオフラインでも起動できるようにする。
// 地図タイル(OSM)とOSRM経路APIは通信が必要（オフライン時は直線概算にフォールバック）。
const CACHE = "michinoeki-v3";
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
  // それ以外はキャッシュ優先→なければネット→キャッシュに保存
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
