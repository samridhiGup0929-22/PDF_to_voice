/** Splits text into chunks of at most `maxWords` words, preserving order. */
export function chunkWords(text, maxWords) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }
  return chunks.length ? chunks : [''];
}
