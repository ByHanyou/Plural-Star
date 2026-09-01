import React, {useEffect, useState} from 'react';
import {View, TouchableOpacity, Image, Alert} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {Sheet} from '../components/Sheet';
import {SystemProfileCard} from '../components/SystemProfileCard';
import {pickImageForUpload} from '../utils/imagePicker';
import {saveBannerImage, saveAvatarFromUri, saveAvatarFromUrl} from '../utils/mediaUtils';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';
import {Btn, Field} from './shared';
import {useDraft, clearDraft} from '../hooks/useDraft';

type Mode = 'read' | 'edit';

interface Props {
  visible: boolean;
  theme: ThemeColors;
  system: any;
  onSave: (next: any) => void;
  onClose: () => void;
}

/**
 * The system's own profile, reached by tapping the system name in the header.
 * These fields used to live inside the System settings sheet; a profile is not
 * a setting, so it reads like one — the singlet Profile with a Read/Edit
 * switch instead of a separate editor screen.
 *
 * SYSTEMS ONLY. A singlet is not a system: they already have the Profile tab,
 * and their name and goals stay in the System settings sheet.
 */
export const SystemProfileModal = ({visible, theme: T, system, onSave, onClose}: Props) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [mode, setMode] = useState<Mode>('read');
  const [f, setF] = useState<any>({...system});
  const [showAvatarLink, setShowAvatarLink] = useState(false);
  const [avatarLinkInput, setAvatarLinkInput] = useState('');
  const [avatarLinking, setAvatarLinking] = useState(false);

  // Reseed on open only. `system` is a fresh object on every store write, so
  // keeping it in the deps would throw away edits in progress — the same trap
  // that reset the custom mood list in the settings sheet.
  useEffect(() => {
    if (!visible) return;
    setMode('read');
    setF({...system});
    setShowAvatarLink(false);
    setAvatarLinkInput('');
    setAvatarLinking(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    (f?.name || '') !== (system?.name || '') ||
    (f?.description || '') !== (system?.description || '') ||
    (f?.avatar || '') !== (system?.avatar || '') ||
    (f?.banner || '') !== (system?.banner || '');

  // The settings sheet used to draft this record, so a swipe-away did not cost
  // you the half-typed description. That has to come with the fields.
  // Only fires when a stored draft actually differs from what we opened with,
  // so landing in Edit means there really is unfinished work to land in.
  useDraft<any>('systemProfile', 'systemProfile', visible, f, d => { setF(d); setMode('edit'); });

  const commit = () => {
    onSave({...system, name: f.name, description: f.description, avatar: f.avatar, banner: f.banner});
    clearDraft('systemProfile', 'systemProfile');
    setMode('read');
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

  const applyAvatarLink = async () => {
    const url = avatarLinkInput.trim();
    if (!/^https?:\/\//i.test(url)) { Alert.alert(t('modal.pfpFailed')); return; }
    setAvatarLinking(true);
    try {
      const uri = await saveAvatarFromUrl('system-avatar', url);
      if (uri) { setF((x: any) => ({...x, avatar: uri})); setShowAvatarLink(false); setAvatarLinkInput(''); }
      else { Alert.alert(t('modal.pfpFailed')); }
    } catch (e: any) {
      Alert.alert(t('modal.pfpFailed'), e?.message || '');
    } finally {
      setAvatarLinking(false);
    }
  };

  const pickInto = async (which: 'avatar' | 'banner') => {
    try {
      const img = await pickImageForUpload();
      if (!img) return;
      const sourceFileUri = img.uri.startsWith('file://') || img.uri.startsWith('content://')
        ? img.uri
        : `file://${img.uri}`;
      // saveAvatarFromUri, NOT saveBioImageFromUri. The old settings sheet used
      // the bio-image helper here, which is a raw byte copy into a different
      // directory under a forced .png name — so a gallery pick landed at full
      // resolution in ps_bio_images while every other writer of
      // 'system-avatar' (restore, sync apply, the link-by-URL path right
      // above) writes the downscaled copy in ps_avatars. The two paths
      // orphaned each other's file and the uncapped image rode every sync.
      const uri = which === 'avatar'
        ? await saveAvatarFromUri('system-avatar', sourceFileUri)
        : await saveBannerImage('system-banner', sourceFileUri);
      setF((x: any) => ({...x, [which]: uri}));
    } catch (e: any) {
      Alert.alert(t('modal.pfpFailed'));
    }
  };

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    if (next === 'read') { leaveEdit(); return; }
    // Seed the edit buffer at the moment editing starts, so it can never open
    // on top of a record that changed while the read view was up — but never
    // over the top of pending work, which is what a restored draft is.
    if (!dirty) setF({...system});
    setMode('edit');
  };

  return (
    <Sheet
      visible={visible}
      title={t('systemProfile.title')}
      theme={T}
      onClose={onClose}
      headerAction={
        <Btn T={T} onPress={() => switchTo(mode === 'read' ? 'edit' : 'read')} style={{paddingHorizontal: 12, paddingVertical: 6, marginRight: 8}}>
          {mode === 'read' ? t('common.edit') : t('systemProfile.read')}
        </Btn>
      }
      footer={mode === 'edit' ? <Btn instant T={T} onPress={commit}>{t('common.save')}</Btn> : undefined}>

      {mode === 'read' ? (
        // Reads straight off the live record, never off the edit buffer: a sync
        // or an import landing while this is open should show, and after a save
        // the buffer and the record say the same thing anyway.
        // The card scrolls itself; inside a Sheet that is one scroll view too
        // many, so the read side renders the same layout without its wrapper.
        <SystemProfileCard
          T={T}
          embedded
          name={system?.name}
          description={system?.description}
          avatar={system?.avatar}
          banner={system?.banner}
        />
      ) : (
        <>
          <Field label={t('modal.systemName')} value={f.name}
            onChange={(v: string) => setF((x: any) => ({...x, name: v}))}
            placeholder={t('modal.systemNamePlaceholder')} T={T} />
          <Field label={t('modal.descriptionLabel')} value={f.description}
            onChange={(v: string) => setF((x: any) => ({...x, description: v}))}
            placeholder={t('modal.descriptionFieldPlaceholder')}
            multiline numberOfLines={3} T={T} />

          <View style={{flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start'}}>
            <TouchableOpacity onPress={() => pickInto('avatar')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('a11y.changeAvatar')}>
              <View style={{width: 64, height: 64, borderRadius: 14, borderWidth: 2, borderColor: T.accent, overflow: 'hidden', backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}>
                {f.avatar
                  ? <Image source={{uri: f.avatar}} accessibilityElementsHidden importantForAccessibility="no" style={{width: 64, height: 64, borderRadius: 14}} resizeMode="cover" />
                  : <Text style={{fontSize: fs(22), color: T.dim}}>📷</Text>}
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
                <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemProfile.removeBanner')}
                  onPress={() => Alert.alert(t('systemProfile.removeBanner'), t('modal.removeImageMsg'), [
                    {text: t('common.cancel'), style: 'cancel'},
                    {text: t('common.remove'), style: 'destructive', onPress: () => setF((x: any) => ({...x, banner: undefined}))},
                  ])}>
                  <Text style={{fontSize: fs(10), color: T.danger, marginTop: 4}}>{t('systemProfile.removeBanner')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {f.avatar ? (
            <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemProfile.removeAvatar')} style={{marginBottom: 8}}
              onPress={() => Alert.alert(t('systemProfile.removeAvatar'), t('modal.removeImageMsg'), [
                {text: t('common.cancel'), style: 'cancel'},
                {text: t('common.remove'), style: 'destructive', onPress: () => setF((x: any) => ({...x, avatar: undefined}))},
              ])}>
              <Text style={{fontSize: fs(10), color: T.danger}}>{t('systemProfile.removeAvatar')}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity onPress={() => setShowAvatarLink(!showAvatarLink)} activeOpacity={0.7} accessibilityRole="button"
            accessibilityState={{expanded: showAvatarLink}} accessibilityLabel={t('modal.linkPfp')} style={{marginBottom: 8}}>
            <Text style={{fontSize: fs(11), color: T.accent}}>🔗 {t('modal.linkPfp')}</Text>
          </TouchableOpacity>
          {showAvatarLink && (
            <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10}}>
              <TextInput value={avatarLinkInput} onChangeText={setAvatarLinkInput} accessibilityLabel={t('modal.linkPfp')}
                placeholder="https://…" placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url"
                style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13)}}
                onSubmitEditing={applyAvatarLink} returnKeyType="done" />
              <Btn T={T} disabled={avatarLinking || !avatarLinkInput.trim()} onPress={applyAvatarLink} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
            </View>
          )}

          <Text style={{fontSize: fs(11), color: T.muted, lineHeight: fs(16), marginTop: 4}}>{t('systemProfile.shareHint')}</Text>
        </>
      )}
    </Sheet>
  );
};
