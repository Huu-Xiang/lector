export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// TODO: add per-language system prompt configuration in Settings
export function getSystemPrompt(langName: string, nativeName: string): string {
  return [
    `You are a friendly ${langName} language tutor helping a ${nativeName} speaker learn ${langName}. Answer questions about grammar, vocabulary, usage, idioms, and differences between similar words or phrases. Keep answers concise and educational. Use examples where helpful.`,
    `Language rule: if the student writes in a language other than ${langName}, reply in the language of the student's message. A question written in Chinese gets an answer in Chinese. If the student writes in ${langName}, reply in ${langName} with a short explanation in ${nativeName}. If you cannot tell the language of the message, reply in ${nativeName}.`,
    `Honesty rule: if a term is slang, a meme, or a word you are not sure about, say that you are not sure. Do not invent an origin or a meaning. Do not name a source that you cannot verify.`,
    `You may use simple Markdown: short paragraphs, bullet lists, and bold text.`,
  ].join(' ');
}

/** Puts the system prompt in the first user turn: some providers reject a system role. */
export function withSystemPrompt(turns: ChatTurn[], systemPrompt: string): ChatTurn[] {
  const first = turns.findIndex((m) => m.role === 'user');
  return turns.map((m, i) =>
    i === first
      ? { role: 'user', content: `${systemPrompt}\n\nStudent's question: ${m.content}` }
      : { role: m.role, content: m.content },
  );
}
