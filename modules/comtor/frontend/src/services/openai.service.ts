import type { Locale } from '@cmt/lib/i18n/types';

/** Structured summary response from OpenAI. */
export interface MeetingSummaryData {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
}

const LANGUAGE_MAP: Record<Locale, string> = {
  vi: 'Vietnamese',
  en: 'English',
  ja: 'Japanese',
};

/**
 * Generate a meeting summary from transcript text using OpenAI GPT-4o-mini.
 * In the desktop app the API key is read from the local keyring and passed in.
 */
export async function generateMeetingSummary(
  transcript: string,
  language: Locale,
  apiKey: string,
  model: string = 'gpt-4o-mini'
): Promise<MeetingSummaryData> {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const langName = LANGUAGE_MAP[language] || 'Vietnamese';

  const systemPrompt = `You are a professional meeting analyst. Analyze the following meeting transcript and produce a structured summary.

Output ONLY valid JSON with this exact structure:
{
  "summary": "A concise 2-3 paragraph overview of the meeting",
  "keyPoints": ["Key point 1", "Key point 2", ...],
  "actionItems": ["Action item 1", "Action item 2", ...]
}

Rules:
- Write entirely in ${langName}
- summary: 2-3 paragraphs, capturing the main discussion topics and outcomes
- keyPoints: 3-7 bullet points of the most important decisions, insights, or topics discussed
- actionItems: specific tasks or follow-ups mentioned, with responsible person if identifiable
- If no clear action items exist, return an empty array
- Be concise and professional`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`OpenAI API error: ${res.status} — ${error}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response from OpenAI');
  }

  const parsed: MeetingSummaryData = JSON.parse(content);

  // Validate structure
  if (!parsed.summary || !Array.isArray(parsed.keyPoints) || !Array.isArray(parsed.actionItems)) {
    throw new Error('Invalid summary structure from OpenAI');
  }

  return parsed;
}
