import {Alert} from 'react-native';
import {ImportUserError, importErrorText} from './importError';
import type {TFunction} from 'i18next';
import {sleep, withTimeout} from '../utils/concurrency';
import {log} from '../utils/log';
import {asRecord, clamp, isRecord} from '../utils';
import {asArray, cleanImportedName} from './formats';
import type {PkSystem, PkMember, PkSwitch, PkGroup} from './formats';
import type {ExtPreview} from './preview';

export type PluralKitFetchCtx = {
  extToken: string;
  t: TFunction;
  setExtLoading: (v: boolean) => void;
  setExtPreview: (p: ExtPreview | null) => void;
};

const PK_PAGE = 100;
const PK_MAX_PAGES = 200;
const PK_BASE = 'https://api.pluralkit.me/v2';
const PK_TIMEOUT_MS = 30000;

class PkHttpError extends Error {
  constructor(readonly status: number) {
    super(`PluralKit returned ${status}`);
  }
}

const pkRequest = async (url: string, headers: Record<string, string>): Promise<Response> => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await withTimeout(fetch(url, {headers}), PK_TIMEOUT_MS, 'PluralKit request');
    if (res.status !== 429) return res;
    let waitMs = 1000;
    try {
      const body = asRecord(await withTimeout<unknown>(res.clone().json(), PK_TIMEOUT_MS, 'PluralKit request'));
      const ra = Number(body?.retry_after);
      if (isFinite(ra) && ra > 0) waitMs = ra;
    } catch {}
    await sleep(clamp(waitMs, 250, 10000));
  }
  return withTimeout(fetch(url, {headers}), PK_TIMEOUT_MS, 'PluralKit request');
};

const fetchAllPkSwitches = async (headers: Record<string, string>): Promise<PkSwitch[]> => {
  const out: PkSwitch[] = [];
  const seen = new Set<string>();
  let before: string | undefined;
  for (let page = 0; page < PK_MAX_PAGES; page++) {
    const url = `${PK_BASE}/systems/@me/switches?limit=${PK_PAGE}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const res = await pkRequest(url, headers);
    if (!res.ok) {
      if (out.length > 0) break;
      throw new PkHttpError(res.status);
    }
    let batch: unknown;
    try { batch = await withTimeout(res.json(), PK_TIMEOUT_MS, 'PluralKit request'); } catch (e) { log.debug('import', e); break; }
    if (!Array.isArray(batch) || batch.length === 0) break;
    const page_ = batch.filter(isRecord) as PkSwitch[];
    let added = 0;
    for (const sw of page_) {
      const id = String(sw?.id || sw?.timestamp || '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(sw);
      added++;
    }
    const oldest = page_[page_.length - 1]?.timestamp;
    if (!oldest || oldest === before || added === 0 || page_.length < PK_PAGE) break;
    before = String(oldest);
  }
  return out;
};

export const handlePluralKitFetch = async (ctx: PluralKitFetchCtx) => {
  const {extToken, t, setExtLoading, setExtPreview} = ctx;
  if (!extToken.trim()) {Alert.alert(t('share.tokenRequired'), t('share.pkTokenRequiredMsg')); return;}
  setExtLoading(true); setExtPreview(null);
  try {
    const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json', 'User-Agent': 'PluralStar (https://github.com/ByHanyou/Plural-Star)'};
    const [sRes, mRes, gRes] = await Promise.all([
      pkRequest(`${PK_BASE}/systems/@me`, headers),
      pkRequest(`${PK_BASE}/systems/@me/members`, headers),
      pkRequest(`${PK_BASE}/systems/@me/groups?with_members=true`, headers),
    ]).catch(e => { log.debug('import', e); throw new ImportUserError(t('share.couldNotConnect')); });
    const check = (res: Response) => {
      if (res.ok) return;
      if (res.status === 401 || res.status === 403) throw new ImportUserError(t('share.authFailed', {status: res.status}));
      throw new ImportUserError(t('share.couldNotConnect'));
    };
    check(sRes); check(mRes); check(gRes);
    let sData: PkSystem = {}; let mData: unknown = []; let gData: unknown = [];
    try { sData = (asRecord(await withTimeout<unknown>(sRes.json(), PK_TIMEOUT_MS, 'PluralKit request')) ?? {}) as PkSystem; } catch (e) { log.debug('import', e); sData = {}; }
    try { mData = await withTimeout(mRes.json(), PK_TIMEOUT_MS, 'PluralKit request'); } catch (e) { log.debug('import', e); mData = []; }
    try { gData = await withTimeout(gRes.json(), PK_TIMEOUT_MS, 'PluralKit request'); } catch (e) { log.debug('import', e); gData = []; }
    let swData: PkSwitch[] = [];
    try {
      swData = await fetchAllPkSwitches(headers);
    } catch (e) {
      const status = e instanceof PkHttpError ? e.status : 0;
      if (status === 401 || status === 403) throw new ImportUserError(t('share.authFailed', {status}));
      throw new ImportUserError(t('share.couldNotConnect'));
    }
    const memberList = asArray<PkMember>(mData);
    const sanitized = memberList.map(m => {
      if (m?.display_name) m.display_name = cleanImportedName(m.display_name);
      if (m?.name) m.name = cleanImportedName(m.name);
      return m;
    });
    setExtPreview({source: 'pluralkit', system: sData, members: sanitized, switches: swData, groups: asArray<PkGroup>(gData)});
  } catch (e) {Alert.alert(t('share.importFailed'), importErrorText(e, t));}
  finally {setExtLoading(false);}
};
