import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { title, content, style = 'quick revision notes' } = await req.json();
    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'content is required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured for this Edge Function.' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-6-luna',
        instructions: 'You are a Taekwondo study assistant. Summarise only the supplied source content. Do not invent grading requirements, terminology or facts. Keep the result concise and useful for revision.',
        input: `Title: ${title || 'Study material'}\nRequested format: ${style}\n\nSOURCE:\n${content}`,
        max_output_tokens: 1200
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || 'OpenAI request failed' }), { status: response.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const text = data.output_text || data.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text || '').join('') || '';
    return new Response(JSON.stringify({ summary: text }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
