// Proxy de TV SFC La Unión para Cloudflare Workers
// Uso: https://TU-WORKER.workers.dev/?url=<URL codificada del canal>

// Páginas que pueden usar este proxy (evita que otros lo usen gratis)
const ALLOWED_ORIGINS = [
  'https://tvsfclaunion.vercel.app',
  // 'http://localhost:3000',
];

const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const UA_VLC = 'VLC/3.0.20 LibVLC/3.0.20';

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    ...extra,
  };
}

function permitido(request) {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const de = origin || (referer ? new URL(referer).origin : '');
  if (!de) return true; // <video src> nativo a veces no envía ninguno
  return ALLOWED_ORIGINS.includes(de);
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (!permitido(request)) return new Response('Origen no permitido', { status: 403, headers: cors() });

    const self = new URL(request.url);
    const destino = self.searchParams.get('url');
    if (!destino) return new Response('Falta el parámetro url', { status: 400, headers: cors() });

    let urlDestino;
    try { urlDestino = new URL(destino); } catch { return new Response('URL no válida', { status: 400, headers: cors() }); }
    if (!['http:', 'https:'].includes(urlDestino.protocol)) {
      return new Response('Protocolo no permitido', { status: 400, headers: cors() });
    }

    const range = request.headers.get('Range');
    const pedir = (ua) => fetch(urlDestino.href, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: { 'User-Agent': ua, 'Accept': '*/*', ...(range ? { Range: range } : {}) },
      redirect: 'follow',
    });

    let resp;
    try {
      resp = await pedir(UA_NAVEGADOR);
      // Algunos paneles IPTV rechazan navegadores: reintenta como VLC
      if ([401, 403, 404, 458].includes(resp.status)) {
        const reintento = await pedir(UA_VLC);
        if (reintento.ok) resp = reintento;
      }
    } catch (e) {
      return new Response('Error del proxy: ' + e.message, { status: 502, headers: cors() });
    }

    const tipo = resp.headers.get('content-type') || 'application/octet-stream';
    const esLista = tipo.includes('mpegurl') || urlDestino.pathname.toLowerCase().endsWith('.m3u8');

    // Listas M3U8: las URLs internas también pasan por el Worker
    if (esLista && resp.ok) {
      const texto = await resp.text();
      const base = resp.url || urlDestino.href;
      const proxy = self.origin + '/?url=';
      const reescrita = texto.split('\n').map((linea) => {
        const t = linea.trim();
        if (t === '') return linea;
        if (t.startsWith('#')) {
          // Líneas como #EXT-X-KEY:URI="..." o #EXT-X-MAP:URI="..."
          return linea.replace(/URI="([^"]+)"/g, (m, u) => {
            try { return 'URI="' + proxy + encodeURIComponent(new URL(u, base).href) + '"'; } catch { return m; }
          });
        }
        try { return proxy + encodeURIComponent(new URL(t, base).href); } catch { return linea; }
      }).join('\n');
      return new Response(reescrita, {
        status: 200,
        headers: cors({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' }),
      });
    }

    // Todo lo demás (segmentos, .ts continuo, mp4, dash) se reenvía en directo, sin guardarlo en memoria
    const headers = cors({ 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    for (const h of ['content-range', 'accept-ranges', 'content-length']) {
      const v = resp.headers.get(h);
      if (v) headers[h] = v;
    }
    return new Response(resp.body, { status: resp.status, headers });
  },
};
