import OpenAI from 'openai';

let client: OpenAI | undefined;
function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  return (client ??= new OpenAI());
}

const FEEDBACK_SYSTEM = `You condense anonymous written audience feedback from a Toastmasters meeting for the speaker.
Write in English, second person, encouraging and specific. Plain text for WhatsApp, max 70 words:
one sentence on what the audience liked most, one sentence on the most common improvement idea.
Only use what is in the feedback.`;

export async function summarizeAudienceFeedback(input: { about: string; positives: string[]; improvements: string[] }) {
  return chat(
    FEEDBACK_SYSTEM,
    `About: ${input.about}\n\nPositive:\n${input.positives.map((p) => `- ${p}`).join('\n')}\n\nImprovements:\n${input.improvements
      .map((p) => `- ${p}`)
      .join('\n')}`,
  );
}

async function chat(system: string, user: string) {
  const res = await openai().chat.completions.create({
    model: process.env.OPENAI_SUMMARY_MODEL ?? 'gpt-5-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return res.choices[0]?.message.content?.trim() ?? '';
}
