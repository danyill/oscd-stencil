// from https://stackoverflow.com/questions/43241174/javascript-generating-all-combinations-of-elements-in-a-single-array-in-pairs
export function* combinations<T>(
  array: T[],
  length: number
): IterableIterator<T[]> {
  for (let i = 0; i < array.length; i += 1) {
    if (length === 1) {
      yield [array[i]];
    } else {
      const remaining = combinations(
        array.slice(i + 1, array.length),
        length - 1
      );
      for (const next of remaining) {
        yield [array[i], ...next];
      }
    }
  }
}
