const ALLOWED_MODELS = new Set([
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    return res.status(503).json({
      error:
        'GEMINI_API_KEY is not configured in Vercel Environment Variables yet.',
    });
  }

  try {
    const parsedBody =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { model = 'gemini-3.6-flash', payload } = parsedBody;

    if (!ALLOWED_MODELS.has(model)) {
      return res.status(400).json({ error: 'Unsupported model requested.' });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    return res.send(text);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Proxy request failed.',
    });
  }
}
