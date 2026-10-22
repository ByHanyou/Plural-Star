import React, {useEffect, useRef, useState} from 'react';
import {View, TouchableOpacity, Image, Alert} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {SystemProfileCard} from '../components/SystemProfileCard';
import {pickAndSaveImage} from '../utils/imagePicker';
import {reportSaveError} from '../utils/saveError';
import {ImageCropHost} from '../components/ImageCropModal';
import {saveBioImageFromUri, saveAvatarFromUri} from '../utils/mediaUtils';
import {SystemInfo} from '../utils';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {AvatarLink, Btn, Field, confirmRemoveImage} from '../components/controls';
import {useDraft, clearDraft} from '../hooks/useDraft';

type Mode = 'read' | 'edit';

interface Props {
  visible: boolean;
  system: SystemInfo;
  onSave: (next: SystemInfo) => Promise<void>;
  onClose: () => void;
}

export const SystemProfileModal = ({visible, system, onSave, onClose}: Props) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [mode, setMode] = useState<Mode>('read');
  const [f, setF] = useState<SystemInfo>({...system});

  const systemRef = useRef(system);
  systemRef.current = system;
  useEffect(() => {
    if (!visible) return;
    setMode('read');
    setF({...systemRef.current});
  }, [visible]);

  const dirty =
    (f.name || '') !== (system.name || '') ||
    (f.description || '') !== (system.description || '') ||
    (f.avatar || '') !== (system.avatar || '') ||
    (f.banner || '') !== (system.banner || '');

  useDraft<SystemInfo>('systemProfile', 'systemProfile', visible, f, d => {
    setF(cur => ({...d, avatar: cur.avatar || d.avatar, banner: cur.banner || d.banner}));
    setMode('edit');
  });

  const commit = async () => {
    try {
      await onSave({...system, name: f.name, description: f.description, avatar: f.avatar, banner: f.banner});
      clearDraft('systemProfile', 'systemProfile');
      setMode('read');
    } catch (e) {
      reportSaveError(e);
    }
  };

  const leaveEdit = () => {
    if (!dirty) { setMode('read'); return; }
    Alert.alert(t('systemProfile.discardTitle'), t('systemProfile.discardMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('systemProfile.discard'), style: 'destructive', onPress: () => {
        setF({...system});
        clearDraft('systemProfile', 'systemProfile');
        setMode('read');
      }},
    ]);
  };

  const pickInto = async (which: 'avatar' | 'banner') => {
    const uri = await pickAndSaveImage(src => (which === 'avatar' ? saveAvatarFromUri('system-avatar', src) : saveBioImageFromUri('system-banner', src)));
    if (uri) setF(x => ({...x, [which]: uri}));
  };

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    if (next === 'read') { leaveEdit(); return; }
    if (!dirty) setF({...system});
    setMode('edit');
  };

  return (
    <Sheet
      visible={visible}
      title={t('systemProfile.title')}
      onClose={onClose}
      headerAction={
        <Btn onPress={() => switchTo(mode === 'read' ? 'edit' : 'read')} style={{paddingHorizontal: 12, paddingVertical: 6, marginRight: 8}}>
          {mode === 'read' ? t('common.edit') : t('systemProfile.read')}
        </Btn>
      }
      footer={mode === 'edit' ? <Btn instant onPress={commit}>{t('common.save')}</Btn> : undefined}>

      {mode === 'read' ? (
        <SystemProfileCard
          embedded
          name={system.name}
          description={system.description}
          avatar={system.avatar}
          banner={system.banner}
        />
      ) : (
        <>
          <Field label={t('modal.systemName')} value={f.name}
            onChange={(v: string) => setF(x => ({...x, name: v}))}
            placeholder={t('modal.systemNamePlaceholder')} />
          <Field label={t('modal.descriptionLabel')} value={f.description}
            onChange={(v: string) => setF(x => ({...x, description: v}))}
            placeholder={t('modal.descriptionFieldPlaceholder')}
            multiline numberOfLines={3} />

          <View style={{flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start'}}>
            <TouchableOpacity onPress={() => pickInto('avatar')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('a11y.changeAvatar')}>
              <View style={{width: 64, height: 64, borderRadius: 14, borderWidth: 2, borderColor: T.accent, overflow: 'hidden', backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}>
                {f.avatar
                  ? <Image source={{uri: f.avatar}} accessibilityElementsHidden importantForAccessibility="no" style={{width: 64, height: 64, borderRadius: 14}} resizeMode="cover" />
                  : <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(22), color: T.dim}}>📷</Text>}
              </View>
            </TouchableOpacity>
            <View style={{flex: 1}}>
              <TouchableOpacity onPress={() => pickInto('banner')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('a11y.changeBanner')}>
                <View style={{width: '100%', aspectRatio: 3, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, overflow: 'hidden', backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}>
                  {f.banner
                    ? <Image source={{uri: f.banner}} accessibilityElementsHidden importantForAccessibility="no" style={{width: '100%', height: '100%', borderRadius: 8}} resizeMode="cover" />
                    : <Text style={{fontSize: fs(11), color: T.dim}}>{t('systemProfile.changeBanner')}</Text>}
                </View>
              </TouchableOpacity>
              {f.banner ? (
                <TouchableOpacity hitSlop={{top: 4, bottom: 12, left: 8, right: 8}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemProfile.removeBanner')}
                  onPress={() => confirmRemoveImage(t, t('systemProfile.removeBanner'), () => setF(x => ({...x, banner: undefined})))}>
                  <Text style={{fontSize: fs(10), color: T.danger, marginTop: 4}}>{t('systemProfile.removeBanner')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {f.avatar ? (
            <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemProfile.removeAvatar')} hitSlop={{top: 12, bottom: 12, left: 8, right: 8}} style={{marginBottom: 8}}
              onPress={() => confirmRemoveImage(t, t('systemProfile.removeAvatar'), () => setF(x => ({...x, avatar: undefined})))}>
              <Text style={{fontSize: fs(10), color: T.danger}}>{t('systemProfile.removeAvatar')}</Text>
            </TouchableOpacity>
          ) : null}

          <AvatarLink ownerId="system-avatar" onLinked={uri => setF(x => ({...x, avatar: uri}))} toggleStyle={{marginBottom: 8}} rowStyle={{marginBottom: 10}} />

          <Text style={{fontSize: fs(11), color: T.muted, lineHeight: fs(16), marginTop: 4}}>{t('systemProfile.shareHint')}</Text>
        </>
      )}
      {visible && <ImageCropHost />}
    </Sheet>
  );
};
