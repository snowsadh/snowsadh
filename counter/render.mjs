// Keep the four existing cubes: leading zeroes, then compact numbers at 10,000+.
export function formatCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid count');
  if (count < 10_000) return String(count).padStart(4, '0');
  for (const [unit, size] of [['P', 1e15], ['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]]) {
    if (count < size) continue;
    const value = count / size;
    const number = value < 10 ? (Math.floor(value * 10) / 10).toFixed(1) : String(Math.floor(value));
    return (number + unit).padStart(4, ' ');
  }
}

export function render(artwork, count) {
  const digits = formatCount(count);
  let index = 0;
  const svg = artwork.replace(/(<text x="(?:285|785|1280|1775)" y="410">)—(<\/text>)/g,
    (_, open, close) => open + digits[index++] + close);
  if (index !== 4) throw new Error('Expected four ice-key placeholders');
  return svg.replaceAll('Ice keys; counter not connected', `Ice keys: ${count} image loads`);
}
