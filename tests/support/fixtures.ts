// Synthetic secret shaped test values are built at run time from short parts,
// so no key shaped literal exists in any source file.
export const join = (...parts: string[]): string => parts.join("");
export const rep = (unit: string, count: number): string => unit.repeat(count);
