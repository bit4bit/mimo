const isDebug = !!process.env.DEBUG;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDebug) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (isDebug) console.log(...args);
  },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
