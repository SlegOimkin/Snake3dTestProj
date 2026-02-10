export type RandomFn = () => number;

export function randInRange(random: RandomFn, min: number, max: number): number {
  return min + random() * (max - min);
}

export function randInt(random: RandomFn, minInclusive: number, maxInclusive: number): number {
  return Math.floor(randInRange(random, minInclusive, maxInclusive + 1));
}

export function pickRandom<T>(random: RandomFn, list: readonly T[]): T {
  const index = Math.floor(random() * list.length);
  return list[index];
}
