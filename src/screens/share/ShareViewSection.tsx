import React from 'react';
import {View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {Fonts, fontScale, tierAccent} from '../../theme';
import {useTheme} from '../../themeContext';
import {useAppStore} from '../../store/appStore';
import {saveShareSettings} from '../../store/actions';
import {reportSaveError} from '../../utils/saveError';
import {Member, ShareSettings, FRONT_TIER_KEYS, TIER_I18N_KEY, isRosterMember, membersByIds} from '../../utils';
import {sectionLabel} from '../../components/controls';
import {Divider, Para, PreviewTier, SectionRow} from './ShareParts';

const PREVIEW_MEMBER_CAP = 4;

export const ShareViewSection = () => {
  const T = useTheme();
  const system = useAppStore(s => s.system);
  const members = useAppStore(s => s.members);
  const front = useAppStore(s => s.front);
  const shareSettings = useAppStore(s => s.shareSettings);
  const singlet = useAppStore(s => s.appSettings.accountMode === 'singlet');
  const {t} = useTranslation();
  const fs = fontScale(T);
  const toggle = (k: keyof ShareSettings) => { saveShareSettings({...shareSettings, [k]: !shareSettings[k]}).catch(reportSaveError); };
  const tierMembers = (ids: string[] | undefined): Member[] => membersByIds(ids, id => members.find(m => m.id === id));
  const fronters = {
    primary: tierMembers(front?.primary?.memberIds),
    coFront: tierMembers(front?.coFront?.memberIds),
    coConscious: tierMembers(front?.coConscious?.memberIds),
  };
  const nobody = FRONT_TIER_KEYS.every(k => fronters[k].length === 0);
  const previewMembers = members.filter(m => isRosterMember(m) && !m.archived);

  return (
    <View>
      <Para text={t('share.controlVisibility')} style={{marginTop: 8}} />
      <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, overflow: 'hidden', marginBottom: 4}}>
        <SectionRow label={singlet ? t('share.showCurrentStatus') : t('share.showCurrentFront')} value={shareSettings.showFront} onToggle={() => toggle('showFront')} />
        {!singlet && <SectionRow label={t('share.showMemberList')} value={shareSettings.showMembers} onToggle={() => toggle('showMembers')} />}
        <SectionRow label={t('share.showMemberDescriptions')} value={shareSettings.showDescriptions} onToggle={() => toggle('showDescriptions')} />
      </View>
      <Divider label={t('share.preview')} />
      <View style={{backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 16}}>
        <Text style={{fontFamily: Fonts.display, fontSize: fs(20), color: T.accent, marginBottom: 4, fontStyle: 'italic'}}>{system.name}</Text>
        {system.description ? <Text style={{fontSize: fs(12), color: T.dim, lineHeight: fs(18), marginBottom: 12}}>{system.description}</Text> : null}
        {shareSettings.showFront && (
          <View>
            {nobody ? <Text style={{fontSize: fs(12), color: T.muted, marginTop: 8}}>{t('share.nobodySet')}</Text>
              : singlet ? <PreviewTier label={t('tabs.status')} fronters={fronters.primary} color={T.accent} />
              : FRONT_TIER_KEYS.map(k => <PreviewTier key={k} label={t(TIER_I18N_KEY[k])} fronters={fronters[k]} color={tierAccent(T, k)} />)}
          </View>
        )}
        {!singlet && shareSettings.showMembers && previewMembers.length > 0 && (
          <View style={{marginTop: 10}}>
            <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{t('share.membersLabel', {count: previewMembers.length})}</Text>
            {previewMembers.slice(0, PREVIEW_MEMBER_CAP).map(m => (
              <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5}}>
                <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: m.color}} />
                <Text style={{fontSize: fs(13), color: T.text}}>{m.name}</Text>
                {m.pronouns ? <Text style={{fontSize: fs(11), color: T.dim}}>({m.pronouns})</Text> : null}
              </View>
            ))}
            {previewMembers.length > PREVIEW_MEMBER_CAP && <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{t('share.more', {count: previewMembers.length - PREVIEW_MEMBER_CAP})}</Text>}
          </View>
        )}
      </View>
    </View>
  );
};
