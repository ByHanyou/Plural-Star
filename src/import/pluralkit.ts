import {Alert} from 'react-native';
import type {TFunction} from 'i18next';

export type PluralKitFetchCtx = {
  extToken: string;
  t: TFunction;
  setExtLoading: any;
  setExtPreview: any;
};

export const handlePluralKitFetch = async (ctx: PluralKitFetchCtx) => {
  const {extToken, t, setExtLoading, setExtPreview} = ctx;
    if (!extToken.trim()) {Alert.alert(t('share.tokenRequired'), t('share.pkTokenRequiredMsg')); return;}
    setExtLoading(true); setExtPreview(null);
    try {
      const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json', 'User-Agent': 'PluralStar/1.9.2'};
      const [sRes, mRes, swRes, gRes] = await Promise.all([
        fetch('https://api.pluralkit.me/v2/systems/@me', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/members', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/switches?limit=500', {headers}),
        fetch('https://api.pluralkit.me/v2/systems/@me/groups?with_members=true', {headers}),
      ]);
      if (!sRes.ok) throw new Error(t('share.authFailed', {status: sRes.status}));
      let sData: any = {}; let mData: any = []; let swData: any = []; let gData: any = [];
      try { sData = await sRes.json(); } catch { sData = {}; }
      try { mData = await mRes.json(); } catch { mData = []; }
      try { swData = await swRes.json(); } catch { swData = []; }
      try { gData = await gRes.json(); } catch { gData = []; }
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
