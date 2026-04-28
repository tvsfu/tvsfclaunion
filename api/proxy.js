export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(200).end();
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Manejo especial para playlists M3U8
    if (contentType.includes('mpegurl') || contentType.includes('x-mpegurl') || url.includes('.m3u8')) {
      const text = await response.text();
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed === '') return line;
        let absoluteUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        return '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.status(200).send(rewritten);
    }

    // Para segmentos .ts y streams binarios — streaming en tiempo real
    res.setHeader('Content-Type', contentType);
    
    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      };
      await pump();
    } else {
      const buffer = await response.arrayBuffer();
      res.status(response.status).send(Buffer.from(buffer));
    }

  } catch (e) {
    if (!res.headersSent) {
      res.status(500).send('Proxy error: ' + e.message);
    }
  }
}
