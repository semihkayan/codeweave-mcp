// Rough token estimate: ~4 chars per token (GPT/Claude average)
const CHARS_PER_TOKEN = 4;

export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}
