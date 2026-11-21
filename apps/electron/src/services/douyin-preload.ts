// This preload observes only the current page's own detail response. The
// page remains sandboxed and media playback/fetching is disabled separately.
const pageScript = String.raw`(() => {
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  function save(url, body) {
    try {
      if (new URL(url, location.href).pathname !== '/aweme/v1/web/aweme/detail/') return;
      const a = body && body.aweme_detail;
      if (!a || typeof a !== 'object') return;
      const p = a.video && a.video.play_addr;
      window.__nyaDouyin = {
        aweme_id: String(a.aweme_id || '').slice(0, 26),
        desc: typeof a.desc === 'string' ? a.desc.slice(0, 500) : '',
        duration: Number(a.duration) || 0,
        images: Array.isArray(a.images) ? a.images.slice(0, 21).map(i => ({
          uri: typeof i?.uri === 'string' ? i.uri.slice(0, 1025) : '',
          url_list: Array.isArray(i?.url_list) ? i.url_list.slice(0, 8).map(x => typeof x === 'string' ? x.slice(0, 8193) : '') : []
        })) : [],
        video: { play_addr: { width: Number(p && p.width) || 0, height: Number(p && p.height) || 0,
          url_list: Array.isArray(p && p.url_list) ? p.url_list.slice(0, 8).map(x => typeof x === 'string' ? x.slice(0, 8193) : '') : [] },
          cover: { url_list: Array.isArray(a.video?.cover?.url_list) ? a.video.cover.url_list.slice(0, 4).map(x => typeof x === 'string' ? x.slice(0, 8193) : '') : [] } }
      };
    } catch {}
  }
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      if (new URL(url, location.href).pathname === '/aweme/v1/web/aweme/detail/')
        response.clone().json().then(data => save(url, data)).catch(() => {});
    } catch {}
    return response;
  };
  const originalOpen = XMLHttpRequest.prototype.open, originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) { this.__nyaUrl = url; return originalOpen.call(this, method, url, ...rest); };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => { try { save(this.__nyaUrl, this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); } catch {} });
    return originalSend.apply(this, args);
  };
})()`;
export const douyinPreload = `const { webFrame } = require('electron');\nvoid webFrame.executeJavaScript(${JSON.stringify(pageScript)});\n`;
