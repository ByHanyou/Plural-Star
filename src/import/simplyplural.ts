import {Alert} from 'react-native';
import type {TFunction} from 'i18next';
import {spGet} from './spApi';

export type SimplyPluralFetchCtx = {
  extToken: string;
  t: TFunction;
  setExtLoading: any;
  setExtPreview: any;
};

export const handleSimplyPluralFetch = async (ctx: SimplyPluralFetchCtx) => {
  const {extToken, t, setExtLoading, setExtPreview} = ctx;
    if (!extToken.trim()) {Alert.alert(t('share.tokenRequired'), t('share.tokenRequiredMsg')); return;}
    setExtLoading(true); setExtPreview(null);
    try {
      const headers = {Authorization: extToken.trim(), 'Content-Type': 'application/json'};
      const meRes = await fetch('https://v2.apparyllis.com/v1/me', {headers});
      if (!meRes.ok) throw new Error(t('share.authFailed', {status: meRes.status}));
      const meData = await meRes.json();
      const userId = meData.id || meData.uid;
      const mData = await spGet(`https://v2.apparyllis.com/v1/members/${userId}`, headers);
      const sData = await spGet(`https://v2.apparyllis.com/v1/frontHistory/${userId}?startTime=0&endTime=${Date.now()}`, headers);
      const cfData = await spGet(`https://v2.apparyllis.com/v1/customFields/${userId}`, headers);
      const gData = await spGet(`https://v2.apparyllis.com/v1/groups/${userId}`, headers);
      if (mData == null) throw new Error(t('share.spFetchPartial', {categories: t('share.memberProfiles')}));
      const failedCats: string[] = [];
      if (sData == null) failedCats.push(t('share.frontHistory'));
      if (cfData == null) failedCats.push(t('customFields.title'));
      if (gData == null) failedCats.push(t('share.groups'));
      const memberList = Array.isArray(mData) ? mData : (mData.members || []);
      const switchList = Array.isArray(sData) ? sData : (sData?.switches || sData?.frontHistory || []);
      const customFieldList = Array.isArray(cfData) ? cfData : (cfData?.customFields || []);
      const groupList = Array.isArray(gData) ? gData : (gData?.groups || []);
      if (failedCats.length > 0) Alert.alert(t('share.importFailed'), t('share.spFetchPartial', {categories: failedCats.join(', ')}));
      const sanitized = memberList.map((m: any) => {
        if (m?.content?.name) m.content.name = String(m.content.name).replace(/[-\u001F\u007F]/g, '').trim();
        if (m?.name) m.name = String(m.name).replace(/[-\u001F\u007F]/g, '').trim();
        return m;
      });
      setExtPreview({system: meData, members: sanitized, switches: switchList, customFields: customFieldList, groups: groupList});
    } catch (e: any) {Alert.alert(t('share.importFailed'), e.message || t('share.couldNotConnect'));}
    finally {setExtLoading(false);}
  };
