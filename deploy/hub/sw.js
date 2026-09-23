// kill-switch — 옛 Cairn PWA 서비스 워커를 걷어낸다.
//
// cairn.today 는 이전에 Cairn(PWA)이 쓰던 주소다. 그때 등록된 서비스 워커가
// 브라우저에 남아 있으면, 서버가 무엇을 내주든 캐시된 옛 화면이 대신 뜬다.
// (실제로 서비스가 내려간 뒤에도 cairn-v37 캐시가 화면을 계속 그리고 있었다.)
//
// 같은 경로(/sw.js)에 이 파일을 두면 브라우저가 업데이트로 받아가고,
// 그 순간 스스로 등록을 해제하며 캐시를 전부 비운다.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    // 열려 있는 탭을 새로고침해 네트워크에서 새 사이트를 받게 한다
    for (const client of await self.clients.matchAll({ type: "window" })) {
      client.navigate(client.url);
    }
  })());
});

// 혹시 활성화 전에 요청이 들어오면 캐시를 쓰지 않고 네트워크로 보낸다
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
