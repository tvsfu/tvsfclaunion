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
        'Connection': 'keep-alive',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store');

    if (contentType.includes('mpegurl') || url.includes('.m3u8')) {
      const text = await response.text();
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      
      const rewritten = text.split('\n').map(line => {
        line = line.trim();
        if (line.startsWith('#') || line === '') return line;
        if (!line.startsWith('http')) {
          line = baseUrl + line;
        }
        return '/api/proxy?url=' + encodeURIComponent(line);
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.status(200).send(rewritten);
    }

    const buffer = await response.arrayBuffer();
    res.status(response.status).send(Buffer.from(buffer));

  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message);
  }
}
