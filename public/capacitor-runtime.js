(() => {
  const PRODUCTION_ORIGIN = 'https://estudoadaptativo.com';
  const capacitor = window.Capacitor;
  const isNative = Boolean(capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform());

  window.__CAPACITOR_NATIVE__ = isNative;
  window.__APP_BACKEND_ORIGIN__ = isNative ? PRODUCTION_ORIGIN : window.location.origin;

  function loadAuthResilience() {
    if (document.querySelector('script[data-auth-resilience]')) return;
    const script = document.createElement('script');
    script.src = './js/auth-resilience-v2.js?v=20260830';
    script.dataset.authResilience = 'true';
    script.async = false;
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAuthResilience, { once:true });
  } else {
    loadAuthResilience();
  }

  if (!isNative) return;

  const shouldRewrite = value => {
    if (typeof value !== 'string') return false;
    return value.startsWith('/api/') || value.startsWith('./api/');
  };

  const rewriteUrl = value => {
    if (!shouldRewrite(value)) return value;
    const path = value.startsWith('./') ? value.slice(1) : value;
    return `${PRODUCTION_ORIGIN}${path}`;
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function capacitorAwareFetch(input, init) {
    if (typeof input === 'string') return nativeFetch(rewriteUrl(input), init);
    if (input instanceof Request) {
      const url = new URL(input.url, window.location.href);
      if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        const rewritten = `${PRODUCTION_ORIGIN}${url.pathname}${url.search}${url.hash}`;
        return nativeFetch(new Request(rewritten, input), init);
      }
    }
    return nativeFetch(input, init);
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function capacitorAwareOpen(method, url, ...rest) {
    return nativeOpen.call(this, method, rewriteUrl(url), ...rest);
  };

  console.info('[Capacitor] Runtime nativo ativo; backend:', PRODUCTION_ORIGIN);
})();
