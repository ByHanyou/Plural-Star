import type {TFunction} from 'i18next';
import {CloudErrorKind, CloudLeftOut, CloudPhase, CloudStatus, cloudErrorCode, cloudErrorKind} from './cloudTypes';
import type {PasswordRule} from './cloudCrypto';
import {CLOUD_OBJECT_MAX_MB} from './cloudKeys';
import {log, errorMessage} from '../utils/log';

const PASSWORD_RULE_KEY: Record<PasswordRule, string> = {
  length: 'network.cloudRuleLength',
  upper: 'network.cloudRuleUpper',
  lower: 'network.cloudRuleLower',
  digit: 'network.cloudRuleDigit',
  symbol: 'network.cloudRuleSymbol',
};

const PHASE_KEY: Record<CloudPhase, string | null> = {
  idle: null,
  deriving: 'network.cloudDeriving',
  uploading: 'network.cloudUploading',
  checking: 'network.cloudChecking',
  importing: 'network.cloudImporting',
};

const OFFLINE_HINTS = ['network', 'timed out', 'failed', 'fetch', 'not connected', 'unreach'];

export const cloudRuleText = (rule: PasswordRule | null, t: TFunction): string => (rule ? t(PASSWORD_RULE_KEY[rule]) : '');

export const cloudPhaseText = (phase: CloudPhase, t: TFunction): string => {
  const key = PHASE_KEY[phase];
  return key ? t(key) : '';
};

const withCode = (key: string, code: string, t: TFunction): string => `${t(key)} ${t('common.errorCode', {code})}`;

export const cloudErrorText = (kind: CloudErrorKind, raw: string, code: string, t: TFunction): string => {
  switch (kind) {
    case 'OBJECT_TOO_LARGE':
    case 'TOO_LARGE':
      return t('network.cloudErrTooLarge', {keys: '', mb: CLOUD_OBJECT_MAX_MB});
    case 'RATE_LIMITED':
      return t('network.cloudErrRate');
    case 'QUOTA_EXCEEDED':
    case 'DISK_AT_WATERMARK':
    case 'INSUFFICIENT_STORAGE':
      return t('network.cloudErrFull');
    case 'BAD_PASSWORD':
    case 'BAD_AUTH':
      return t('network.cloudErrBadPassword');
    case 'HASH_MISMATCH':
    case 'OBJECT_HASH_MISMATCH':
    case 'OBJECT_UNDECRYPTABLE':
    case 'MANIFEST_UNDECRYPTABLE':
    case 'MANIFEST_MALFORMED':
      return t('network.cloudErrCorrupt');
    case 'MANIFEST_VERSION_CONFLICT':
    case 'CONFLICT':
    case 'INTERNAL':
    case 'UNAVAILABLE':
      return withCode('network.cloudErrNetwork', code, t);
    case 'UNKNOWN': {
      const s = raw.toLowerCase();
      if (OFFLINE_HINTS.some(hint => s.includes(hint))) return withCode('network.cloudErrNetwork', code, t);
      break;
    }
  }
  log.warn('cloud', kind, raw);
  return withCode('network.cloudErrGeneric', code, t);
};

export const cloudExceptionText = (e: unknown, t: TFunction): string =>
  cloudErrorText(cloudErrorKind(e), errorMessage(e), cloudErrorCode(e), t);

export const leftOutText = (l: CloudLeftOut, raw: string, t: TFunction): string => {
  const parts: string[] = [];
  if (l.tooLarge.length) parts.push(t('network.cloudErrTooLarge', {keys: l.tooLarge.join(', '), mb: l.maxObjectMb}));
  if (l.overQuota.length) parts.push(t('network.cloudErrOverQuota', {keys: l.overQuota.join(', ')}));
  if (l.refused.length) parts.push(t('network.cloudErrRefused', {keys: l.refused.map(r => `${r.key} (${r.code})`).join(', ')}));
  if (l.unreadable.length) parts.push(t('network.cloudErrUnreadable', {keys: l.unreadable.map(u => `${u.key} (${u.why})`).join(', ')}));
  return parts.length ? parts.join('\n') : raw;
};

export const cloudStatusErrorText = (status: CloudStatus, t: TFunction): string =>
  status.leftOut
    ? leftOutText(status.leftOut, status.lastError || '', t)
    : cloudErrorText(status.lastErrorKind || 'UNKNOWN', status.lastError || '', status.lastErrorCode || 'CLOUD-APP', t);
