export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  // Si el cliente cierra la conexión (cambia de canal), cortamos la descarga
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const UA_VLC = 'VLC/3.0.20 LibVLC/3.0.20';
    const pedir = (ua) => fetch(url, {
      headers: { 'User-Agent': ua, 'Accept': '*/*', 'Accept-Encoding': 'identity' },
      redirect: 'follow',
      signal: controller.signal,
    });

    let response = await pedir(UA_NAVEGADOR);
    // Algunos paneles IPTV rechazan navegadores: reintenta como reproductor VLC
    if ([401, 403, 404, 458].includes(response.status)) {
      const reintento = await pedir(UA_VLC);
      if (reintento.ok) response = reintento;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Accel-Buffering', 'no');

    // Playlists M3U8: reescribir las URLs para que también pasen por el proxy
    const isPlaylist =
      contentType.includes('mpegurl') ||
      contentType.includes('x-mpegurl') ||
      url.split('?')[0].toLowerCase().endsWith('.m3u8');

    if (isPlaylist) {
      const text = await response.text();
      const finalUrl = response.url || url;

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed === '') return line;
        let absoluteUrl;
        try { absoluteUrl = new URL(trimmed, finalUrl).href; } catch { return line; }
        return '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.status(200).send(rewritten);
    }

    // Segmentos .ts y streams MPEG-TS continuos: se envían en tiempo real
    res.status(response.status);
    res.setHeader('Content-Type', contentType);

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Respeta la contrapresión para no saturar la memoria con streams en vivo
        if (!res.write(Buffer.from(value))) {
          await new Promise(resolve => res.once('drain', resolve));
        }
      }
      res.end();
    } else {
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (e) {
    if (e.name === 'AbortError') return res.end();
    if (!res.headersSent) {
      res.status(500).send('Proxy error: ' + e.message);
    } else {
      res.end();
    }
  }
}
