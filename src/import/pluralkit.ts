import {Alert} from 'react-native';
import type {TFunction} from 'i18next';

export type PluralKitFetchCtx = {
  extToken: string;
  t: TFunction;
  setExtLoading: any;
  setExtPreview: any;
};

const PK_PAGE = 100;
const PK_MAX_PAGES = 200;
const PK_BASE = 'https://api.pluralkit.me/v2';

const pkRequest = async (url: string, headers: Record<string, string>): Promise<Response> => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {headers});
    if (res.status !== 429) return res;
    let waitMs = 1000;
    try {
      const body = await res.clone().json();
      const ra = Number(body?.retry_after);
      if (isFinite(ra) && ra > 0) waitMs = ra;
    } catch {}
    await new Promise<void>(r => setTimeout(() => r(), Math.min(Math.max(waitMs, 250), 10000)));
  }
  return fetch(url, {headers});
};

const fetchAllPkSwitches = async (headers: Record<string, string>): Promise<any[]> => {
  const out: any[] = [];
  const seen = new Set<string>();
  let before: string | undefined;
  for (let page = 0; page < PK_MAX_PAGES; page++) {
    const url = `${PK_BASE}/systems/@me/switches?limit=${PK_PAGE}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const res = await pkRequest(url, headers);
    if (!res.ok) {
      if (out.length > 0) break;
      throw new Error(String(res.status));
    }
    let batch: any;
    try { batch = await res.json(); } catch { break; }
    if (!Array.isArray(batch) || batch.length === 0) break;
    let added = 0;
    for (const sw of batch) {
      const id = String(sw?.id || sw?.timestamp || '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(sw);
      added++;
    }
    const oldest = batch[batch.length - 1]?.timestamp;
    if (!oldest || oldest === before || added === 0 || batch.length < PK_PAGE) break;
    before = String(oldest);
  }
  return out;
};

export const handlePluralKitFetch = async (ctx: PluralKitFetchCtx) => {
  const {extToken, t, setExtLoading, setExtPreview} = ctx;
    if (!extToken.trim()) {Alert.alert(t('share.tokenRequired'), t('share.pkTokenRequiredMsg')); return;}
    setExtLoading(true); setExtPreview(null);
    try {
      const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json', 'User-Agent': 'PluralStar/1.9.2'};
      const [sRes, mRes, gRes] = await Promise.all([
        pkRequest(`${PK_BASE}/systems/@me`, headers),
        pkRequest(`${PK_BASE}/systems/@me/members`, headers),
        pkRequest(`${PK_BASE}/systems/@me/groups?with_members=true`, headers),
      ]);
      const check = (res: Response) => {
        if (res.ok) return;
        if (res.status === 401 || res.status === 403) throw new Error(t('share.authFailed', {status: res.status}));
        throw new Error(t('share.couldNotConnect'));
      };
      check(sRes); check(mRes); check(gRes);
      let sData: any = {}; let mData: any = []; let gData: any = [];
      try { sData = await sRes.json(); } catch { sData = {}; }
      try { mData = await mRes.json(); } catch { mData = []; }
      try { gData = await gRes.json(); } catch { gData = []; }
      let swData: any[] = [];
      try {
        swData = await fetchAllPkSwitches(headers);
      } catch (e: any) {
        const status = Number(e?.message);
        if (status === 401 || status === 403) throw new Error(t('share.authFailed', {status}));
        throw new Error(t('share.couldNotConnect'));
      }
      const memberList = Array.isArray(mData) ? mData : [];
      const sanitized = memberList.map((m: any) => {
        if (m?.display_name) m.display_name = String(m.display_name).replace(/[-\u001F\u007F]/g, '').trim();
        if (m?.name) m.name = String(m.name).replace(/[-\u001F\u007F]/g, '').trim();
        return m;
      });
      setExtPreview({system: sData, members: sanitized, switches: Array.isArray(swData) ? swData : [], groups: Array.isArray(gData) ? gData : []});
    } catch (e: any) {Alert.alert(t('share.importFailed'), e.message || t('share.couldNotConnect'));}
    finally {setExtLoading(false);}
  };
