'use strict';
/* Service Worker:离线壳 + 缓存策略(无 ES module 语法,兼容 SW 环境)
 *
 * 策略:
 * - /api/ 的 GET 请求:network-first,成功后写入缓存,离线时回退缓存;
 *   非 GET(如判分 POST /api/grade)一律不拦截、不缓存。
 * - 静态资源(html/js/css/svg 等同源 GET):stale-while-revalidate。
 * - 页面导航请求离线时回退到预缓存的 /index.html(App Shell)。
 *
 * 升级方式:改动任何静态资源后把 SW_VERSION +1,
 * 新 SW activate 时会清掉旧版本缓存。
 */

var SW_VERSION = 'v13';
var CACHE_STATIC = 'nce-static-' + SW_VERSION;
var CACHE_API = 'nce-api-' + SW_VERSION;
var CACHE_AUDIO = 'nce-audio-' + SW_VERSION;

// 核心壳:index.html 实际引用的全部脚本与样式
var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/help.html',
  '/manifest.json',
  '/icon.svg',
  '/styles.css',
  '/themes.css',
  '/theme.js',
  '/profile.js',
  '/app.js',
  '/js/profile-store.js',
  '/js/pwa.js',
  '/js/feat-review.js',
  '/js/word-offline.js',
  '/js/dialogue-offline.js',
  '/js/feat-dictionary.js',
  '/js/feat-vocab.js',
  '/js/feat-dictation.js',
  '/js/feat-transform.js',
  '/js/feat-dialogue.js',
  '/js/feat-stats.js',
  '/js/feat-plan.js',
  '/js/feat-words.js',
  '/js/vocabtest-ui.js',
  '/js/feat-listenvocab.js',
  '/js/feat-readvocab.js',
  '/js/feat-globalvocab.js',
  '/js/feat-vocabtrend.js',
  '/js/feat-backup.js',
  '/js/feat-exam.js',
  '/js/feat-comprehension.js',
  '/js/feat-level.js',
  '/audio/pronunc-index.json',
  '/audio/official-segments.json',
  '/data/word-bundle.json',
  '/data/dialogue-bundle.json',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            // 清理旧版本缓存(nce- 前缀但版本不同)
            if (key !== CACHE_STATIC && key !== CACHE_API && key !== CACHE_AUDIO && key.indexOf('nce-') === 0) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// /api/:network-first,离线回退缓存;无缓存时返回 503 JSON
function apiNetworkFirst(request) {
  return fetch(request)
    .then(function (resp) {
      if (resp && resp.ok) {
        var copy = resp.clone();
        caches.open(CACHE_API).then(function (cache) {
          cache.put(request, copy);
        });
      }
      return resp;
    })
    .catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        return new Response(
          JSON.stringify({ error: '当前离线,且该数据尚无缓存' }),
          { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
      });
    });
}

// 音频:cache-first(离线优先读已缓存的 mp3)
// Git LFS 未拉取时 MP3 仅为 ~130B 指针文件；勿缓存/勿回退此类响应，否则 play() 永远失败。
var MIN_AUDIO_BYTES = 8192;

function audioBodyLargeEnough(resp) {
  if (!resp || !resp.ok) return Promise.resolve(false);
  var len = resp.headers.get('content-length');
  if (len != null) return Promise.resolve(Number(len) >= MIN_AUDIO_BYTES);
  return resp.clone().arrayBuffer().then(function (buf) {
    return buf.byteLength >= MIN_AUDIO_BYTES;
  });
}

function fetchAudioMaybeCache(cache, request) {
  return fetch(request).then(function (resp) {
    return audioBodyLargeEnough(resp).then(function (ok) {
      if (ok) cache.put(request, resp.clone());
      return resp;
    });
  });
}

function cacheFirst(request) {
  return caches.open(CACHE_AUDIO).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (!cached) return fetchAudioMaybeCache(cache, request);
      return audioBodyLargeEnough(cached).then(function (ok) {
        if (ok) return cached;
        return cache.delete(request).then(function () {
          return fetchAudioMaybeCache(cache, request);
        });
      });
    });
  });
}

// 静态资源:stale-while-revalidate(先回缓存,后台更新)
function staleWhileRevalidate(request) {
  return caches.open(CACHE_STATIC).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var network = fetch(request)
        .then(function (resp) {
          if (resp && resp.ok) cache.put(request, resp.clone());
          return resp;
        })
        .catch(function (err) {
          if (cached) return cached;
          throw err;
        });
      return cached || network;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // 非 GET(判分 POST、状态同步等)一律不拦截、不缓存
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  // 跨域请求不处理
  if (url.origin !== self.location.origin) return;

  // 真人发音 / 原声课文音频:cache-first
  if (url.pathname.indexOf('/audio/pronunc/') === 0 || url.pathname.indexOf('/audio/nce/') === 0) {
    event.respondWith(
      cacheFirst(request).catch(function () {
        return new Response('', { status: 404, statusText: 'Not Found' });
      })
    );
    return;
  }

  // API:network-first
  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(apiNetworkFirst(request));
    return;
  }

  // 页面导航:SWR,彻底失败时回退 App Shell
  if (request.mode === 'navigate') {
    event.respondWith(
      staleWhileRevalidate(request).catch(function () {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // 其余静态资源:SWR
  event.respondWith(staleWhileRevalidate(request));
});
