// Import errors: a message written for the user, or an unexpected failure shown as a generic message with a support code.

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Thrown by importers when the message itself is meant for the user (already translated). */
export class ImportUserError extends Error {}

/** The support code for an unexpected import failure: what kind of thing went wrong, not the raw message. */
export const importErrorCode = (e: unknown): string => {
  if (e instanceof SyntaxError) return 'IMPORT-PARSE';
  const msg = e instanceof Error ? e.message : String(e);
  if (/network request failed|fetch|network|timed out|timeout/i.test(msg)) return 'IMPORT-NET';
  if (/zip|file|ENOENT|EACCES|EISDIR|read|permission|directory/i.test(msg)) return 'IMPORT-FILE';
  return 'IMPORT-APP';
};

/** What to show for an import error: the user message as is, otherwise the generic text plus its code. The raw error goes to the console. */
export const importErrorText = (e: unknown, t: T): string => {
  if (e instanceof ImportUserError) return e.message;
  console.warn('[import]', e);
  return `${t('share.errUnexpected')} ${t('common.errorCode', {code: importErrorCode(e)})}`;
};
