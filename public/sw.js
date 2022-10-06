const cacheName = "MyFancyCacheName_v1";
self.addEventListener("install", async (event) => {
  console.log("开始安装", event);
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", async (event) => {
  console.log("安装完成，开始启动", event);
  event.waitUntil(self.clients.claim());
});
const requestEventMap = new Map();
self.addEventListener("fetch", async (event) => {
  console.log("运行中，拦截请求", event.request);
  if (
    event.request.method == "GET" &&
    ["image", "script", "style"].includes(event.request.destination)
  ) {
    // 先检查是否有本地缓存
    const cacheResponse = await caches.open(cacheName).then((cache) => {
      return cache.match(event.request.url).then((cachedResponse) => {
        // 有就返回
        if (cachedResponse) {
          return cachedResponse;
        }
      });
    });
    if (cacheResponse) {
      return event.respondWith(Promise.resolve(cacheResponse));
    }

    // 没有就请求远端
    requestEventMap.set(event.request.url, event);
    postToHtml({
      cmd: "request_source",
      url: event.request.url,
    });

    event.respondWith(
      caches.open(cacheName).then((cache) => {
        return cache.match(event.request.url).then((cachedResponse) => {
          // 有就返回
          if (cachedResponse) {
            return cachedResponse;
          }

          // 没有就请求远端
          requestEventMap.set(event.request.url, event);
          postToHtml({
            cmd: "request_source",
            url: event.request.url,
          });
        });
      })
    );
  } else {
    event.respondWith(fetch(event.request));
  }
});
self.addEventListener("message", function (event) {
  // 收到消息
  console.log("收到消息html->sw", event.data);
  if (event.data?.cmd == "request_source") {
    // 远端收到本地 资源请求request消息
    caches.open(cacheName).then((cache) => {
      cache.match(event.data.url).then((cachedResponse) => {
        // 返回cache对象，可能是空
        postToHtml({
          cmd: "response_source",
          url: event.request.url,
          data: cachedResponse,
        });
      });
    });
  } else if (event.data?.cmd == "response_source") {
    // 本地收到远端返回 资源请求response消息
    const requestEvent = requestEventMap.get(event.data.url);
    if (requestEvent.data) {
      // 从远端拿到资源
      requestEvent.respondWith(requestEvent.data);
    } else {
      // 远端也未拿到资源
      return requestEvent.respondWith(
        caches.open(cacheName).then((cache) => {
          return cache
            .match(requestEvent.request.url)
            .then((cachedResponse) => {
              // 有就返回
              if (cachedResponse) {
                return cachedResponse;
              }
              // 缓存没有就实际请求
              return fetch(requestEvent.request).then((fetchedResponse) => {
                cache.put(requestEvent.request, fetchedResponse.clone());
                return fetchedResponse;
              });
            });
        })
      );
    }
  }
});

function postToHtml(message) {
  // 发送消息
  self.clients.matchAll().then(function (clients) {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}
