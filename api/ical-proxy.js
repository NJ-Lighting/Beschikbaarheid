// /api/ical-proxy.js
export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      res.status(400).send('Missing url parameter');
      return;
    }

    // Eén keer decoderen, omdat in de frontend encodeURIComponent() wordt gebruikt
    const targetUrl = decodeURIComponent(url);

    // Klein veiligheidscheckje
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      res.status(400).send('Invalid target URL');
      return;
    }

    // Fetch de ICS bij de bron (Google, Profuze, etc.)
    const upstream = await fetch(targetUrl);

    // Stuur HTTP-status 1-op-1 door
    const status = upstream.status;

    // Tekstinhoud lezen (ICS is gewoon text)
    const text = await upstream.text();

    // Content-Type doorgeven (of fallback)
    const contentType =
      upstream.headers.get('content-type') ||
      'text/calendar; charset=utf-8';

    res.setHeader('Content-Type', contentType);

    // CORS is eigenlijk niet nodig (same origin), maar kan geen kwaad
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.status(status).send(text);
  } catch (err) {
    console.error('ical-proxy error', err);
    res.status(500).send('Internal ical-proxy error');
  }
}
