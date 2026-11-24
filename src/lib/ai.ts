import OpenAI from 'openai';
import { createReadStream } from 'node:fs';

let client: OpenAI | undefined;
function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  return (client ??= new OpenAI());
}

export async function transcribe(audioPath: string) {
  const res = await openai().audio.transcriptions.create({
    model: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1',
    file: createReadStream(audioPath),
    language: 'en',
    // Biases spelling of club jargon the model otherwise gets wrong.
    prompt: 'Toastmasters evaluation. Table Topics, Pathways, Ah-Counter, Grammarian, Toastmaster of the Evening.',
  });
  return res.text.trim();
}

const EVALUATION_SYSTEM = `You summarise spoken Toastmasters evaluations for the person who was evaluated.
Write in English, second person ("you"), warm and concrete. Output plain text for WhatsApp:
- 1 short sentence overall impression
- "Strengths:" then 2-3 bullets starting with "• "
- "To improve:" then 1-3 bullets starting with "• "
Only use what the evaluator actually said. No headings other than those two, no markdown, max 90 words.`;

export async function summarizeEvaluation(input: { transcript: string; about: string; name: string }) {
  return chat(
    EVALUATION_SYSTEM,
    `Evaluated person: ${input.name}\nWhat was evaluated: ${input.about}\n\nTranscript:\n${input.transcript}`,
  );
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
