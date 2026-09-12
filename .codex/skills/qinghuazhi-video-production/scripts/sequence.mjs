import { readdir } from 'node:fs/promises';

export async function nextSequence(dir, prefix) {
  const files = await readdir(dir).catch(() => []);
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)`);

  for (const file of files) {
    const match = file.match(re);
    if (match) max = Math.max(max, Number(match[1]));
  }

  return max + 1;
}

export function pad3(n) {
  return String(n).padStart(3, '0');
}
