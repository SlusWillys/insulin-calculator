// api/analyze.js
// Serverless-функция Vercel: безопасно вызывает Claude API.
// Ключ ANTHROPIC_API_KEY хранится в переменных окружения Vercel, никогда не попадает в браузер.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mimeType, prompt } = req.body;

  if (!image || !prompt) {
    return res.status(400).json({ error: 'Missing image or prompt' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'API error' });
    }

    const textBlock = data.content?.find(b => b.type === 'text');
    if (!textBlock) {
      return res.status(500).json({ error: 'No text in response' });
    }

    return res.status(200).json({ text: textBlock.text });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
