type T = (key: string, opts?: Record<string, unknown>) => string;

export class ImportUserError extends Error {}

export const importErrorCode = (e: unknown): string => {
  if (e instanceof SyntaxError) return 'IMPORT-PARSE';
  const msg = e instanceof Error ? e.message : String(e);
  if (/network request failed|fetch|network|timed out|timeout/i.test(msg)) return 'IMPORT-NET';
  if (/zip|file|ENOENT|EACCES|EISDIR|read|permission|directory/i.test(msg)) return 'IMPORT-FILE';
  return 'IMPORT-APP';
};

export const importErrorText = (e: unknown, t: T): string => {
  if (e instanceof ImportUserError) return e.message;
  console.warn('[import]', e);
  return `${t('share.errUnexpected')} ${t('common.errorCode', {code: importErrorCode(e)})}`;
};
