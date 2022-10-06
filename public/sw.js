const cacheName = "MyFancyCacheName_v1" + new Date().getTime();
self.addEventListener("install", (event) => {
  console.log("开始安装", event);
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  console.log("安装完成，开始启动", event);
  event.waitUntil(self.clients.claim());
});
const requestPromiseMap = new Map();
self.addEventListener("fetch", (event) => {
  console.log("运行中，拦截请求", event.request);
  event.respondWith(
    caches.open(cacheName).then((cache) => {
      return cache.match(event.request.url).then((cachedResponse) => {
        // 有就返回
        if (cachedResponse) {
          return cachedResponse;
        }
        if (
          event.request.method == "GET" &&
          ["image"].includes(event.request.destination)
        ) {
          // p2p 远端请求
          return new Promise((resolve, reject) => {
            requestPromiseMap.set(event.request.url, { resolve, reject });
            postToHtml({
              cmd: "request_source",
              url: event.request.url,
            });
          }).then((sourceData) => {
            // 有数据表示拿到了p2p资源
            if (sourceData) {
              const p2pResponse = new Response(str2ArrayBuffer(sourceData));
              cache.put(event.request, p2pResponse.clone());
              return p2pResponse;
            } else {
              // 缓存没有就实际请求
              return fetch(event.request, { mode: "no-cors" }).then(
                (fetchedResponse) => {
                  cache.put(event.request, fetchedResponse.clone());
                  return fetchedResponse;
                }
              );
            }
          });
        } else {
          return fetch(event.request);
        }
      });
    })
  );
});
self.addEventListener("message", function (event) {
  // 收到消息
  console.log("收到消息html->sw", event.data);
  if (event.data?.cmd == "request_source") {
    // 远端收到本地 资源请求request消息
    caches.open(cacheName).then((cache) => {
      cache.match(event.data.url).then((cachedResponse) => {
        if (cachedResponse) {
          cachedResponse
            .clone()
            .arrayBuffer()
            .then((buffer) => {
              postToHtml({
                cmd: "response_source",
                url: event.data.url,
                data: String.fromCharCode.apply(null, new Uint16Array(buffer)),
              });
            });
        } else {
          // 没有返回空
          postToHtml({
            cmd: "response_source",
            url: event.data.url,
            data: "",
          });
        }
      });
    });
  } else if (event.data?.cmd == "response_source") {
    // 本地收到远端返回 资源请求response消息
    const requestPromise = requestPromiseMap.get(event.data.url);
    if (event.data.data) {
      // 从远端拿到资源
      requestPromise.resolve(event.data.data);
    } else {
      // 远端也未拿到资源
      requestPromise.resolve();
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

// 字符串转为ArrayBuffer对象，参数为字符串
const str2ArrayBuffer = function (str) {
  var buf = new ArrayBuffer(str.length * 2); // 每个字符占用2个字节
  var bufView = new Uint16Array(buf);
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
};
