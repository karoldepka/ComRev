import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, systemPrompt }: { messages: UIMessage[]; systemPrompt?: string } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: systemPrompt ?? 'You are a helpful assistant for Structable, an open-source alternative to Airtable. Help the user understand, analyze, and work with their data.',
    messages: await convertToModelMessages(messages),
  });

  return result.toTextStreamResponse();
}
