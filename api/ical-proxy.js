// api/ical-proxy.js

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    res.status(400).send('Missing url parameter');
    return;
  }

  try {
    const target = decodeURIComponent(url);
    console.log('Proxy fetching:', target);

    const response = await fetch(target);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('Upstream error:', response.status, text.slice(0, 200));
      res
        .status(response.status)
        .send(`Upstream error ${response.status}: ${response.statusText}`);
      return;
    }

    const text = await response.text();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');

    res.status(200).send(text);
  } catch (e) {
    console.error('Error in ical-proxy:', e);
    res.status(500).send('Proxy error');
  }
}
