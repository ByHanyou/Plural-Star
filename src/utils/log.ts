export const logError = (tag: string, e: unknown) => {
  console.warn(`[${tag}]`, e);
};
