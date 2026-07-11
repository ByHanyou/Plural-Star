import {saveAvatarFromUrl} from '../utils/mediaUtils';

export const normalizeSpAvatarUrl = (raw: any): string => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/avatars/')) return 'https://spaces.apparyllis.com' + s;
  if (/^[\w-]+(\.[\w-]+)+\//.test(s)) return 'https://' + s;
  return '';
};
export const spAvatarCandidates = (content: any, fallbackUid: string): string[] => {
  const out: string[] = [];
  const c = content || {};
  const uuid = String(c.avatarUuid || '');
  const uid = String(c.uid || fallbackUid || '');
  if (uuid && uid) out.push(`https://spaces.apparyllis.com/avatars/${uid}/${uuid}`);
  const direct = normalizeSpAvatarUrl(c.avatarUrl);
  if (direct && !out.includes(direct)) out.push(direct);
  return out;
};
export const downloadFirstAvatar = async (memberId: string, urls: string[]): Promise<string | undefined> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const u of urls) {
      const r = await saveAvatarFromUrl(memberId, u).catch(() => undefined);
      if (r) return r;
    }
    if (attempt === 0) await new Promise<void>(res => setTimeout(() => res(), 1200));
  }
  return undefined;
};

export const spGet = async (url: string, headers: any): Promise<any | null> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {headers});
      if (res.ok) { try { return await res.json(); } catch { return null; } }
      if (res.status === 401 || res.status === 403) return null;
      console.log(`[SP-FETCH] ${url} -> ${res.status} (attempt ${attempt + 1})`);
    } catch (e) {
      console.log(`[SP-FETCH] ${url} network error (attempt ${attempt + 1}):`, e);
    }
    if (attempt < 2) await new Promise<void>(r => setTimeout(() => r(), 700 * (attempt + 1)));
  }
  return null;
};
