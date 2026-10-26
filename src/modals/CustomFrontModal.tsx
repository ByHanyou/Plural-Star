import React, {useState, useRef} from 'react';
import {View, TouchableOpacity, Image, Alert, Keyboard} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {pickAndSaveImage} from '../utils/imagePicker';
import {reportSaveError} from '../utils/saveError';
import {ImageCropHost} from '../components/ImageCropModal';
import {Sheet} from '../components/Sheet';
import {ColorCarousel} from '../components/ColorCarousel';
import {fontScale, initialOn} from '../theme';
import {useTheme} from '../themeContext';
import {Member, MemberGroup, blankMember, getInitials, sortGroupsForDisplay, normalizeMemberEmoji, toggleId} from '../utils';
import {RichText as RichDescription} from '../components/MarkdownRenderer';
import {RichTextEditor} from '../components/RichTextEditor';
import {saveAvatarFromUri} from '../utils/mediaUtils';
import {AvatarLink, Btn, Field, ToggleRow, confirmRemoveImage, sectionLabel} from '../components/controls';
import {useDraft, clearDraft} from '../hooks/useDraft';
import {GroupToggleChip} from './member/GroupPickers';

export const CustomFrontModal = ({visible, customFront, groups, onSave, onDelete, onClose, isFronting = false, statusMode = false}: {
  visible: boolean; customFront: Member | null; groups: MemberGroup[]; onSave: (m: Member) => void | Promise<void>; onDelete: (id: string) => void | Promise<void>; onClose: () => void; isFronting?: boolean; statusMode?: boolean;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const isNew = !customFront;
  const blank = (): Member => blankMember({isCustomFront: true});
  const [f, setF] = useState<Member>(customFront || blank());
  const fRef = useRef(f);
  fRef.current = f;
  const [confirmDel, setConfirmDel] = useState(false);
  const [showDescEditor, setShowDescEditor] = useState(false);
  const customFrontRef = React.useRef(customFront);
  customFrontRef.current = customFront;
  React.useEffect(() => { if (visible) { const fresh = customFrontRef.current || blank(); setF({...fresh, tags: fresh.tags || [], groupIds: fresh.groupIds || [], isCustomFront: true}); setConfirmDel(false); setShowDescEditor(false); } }, [visible, customFront?.id]);
  const draftId = isNew ? 'new' : (customFront?.id || f.id);
  useDraft<Member>('customFront', draftId, visible, f, d => setF(cur => ({
    ...d,
    avatar: cur.avatar || d.avatar,
    avatarTransparent: cur.avatar ? cur.avatarTransparent : d.avatarTransparent,
    banner: cur.banner || d.banner,
  })));
  const set = <K extends keyof Member>(k: K, v: Member[K]) => {
    fRef.current = {...fRef.current, [k]: v};
    setF(x => ({...x, [k]: v}));
  };
  const pickPfp = async () => {
    const uri = await pickAndSaveImage(src => saveAvatarFromUri(f.id, src));
    if (uri) set('avatar', uri);
  };
  const removePfp = () => confirmRemoveImage(t, t('modal.removePfp'), () => set('avatar', undefined));

  return (
    <Sheet visible={visible} title={statusMode ? (isNew ? t('status.add') : t('status.edit')) : (isNew ? t('customFront.add') : t('customFront.edit'))} onClose={onClose} footer={<>
      {!isNew && !confirmDel && <Btn instant variant="danger" disabled={isFronting} onPress={() => setConfirmDel(true)}>{t('common.delete')}</Btn>}
      {confirmDel && (<><Btn instant variant="danger" onPress={async () => {try {await onDelete(f.id); clearDraft('customFront', draftId); onClose();} catch (e) {reportSaveError(e);}}}>{t('modal.confirmDelete')}</Btn><Btn instant variant="ghost" onPress={() => setConfirmDel(false)}>{t('common.cancel')}</Btn></>)}
      {!confirmDel && <Btn instant variant="ghost" onPress={() => {clearDraft('customFront', draftId); onClose();}}>{t('common.cancel')}</Btn>}
      {!confirmDel && <Btn instant onPress={async () => {Keyboard.dismiss(); const cur = fRef.current; if (!(cur.name || '').trim()) {Alert.alert(t('modal.nameRequired')); return;} try {await onSave({...cur, isCustomFront: true}); clearDraft('customFront', draftId); onClose();} catch (e) {reportSaveError(e);}}}>{t('common.save')}</Btn>}</>}>
      <View style={{alignItems: 'center', marginBottom: 16}}>
        <TouchableOpacity onPress={pickPfp} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.changePfp')}>
          {f.avatar ? (
            <Image source={{uri: f.avatar}} accessibilityElementsHidden importantForAccessibility="no" style={{width: 88, height: 88, borderRadius: 20, borderWidth: 2, borderColor: f.color}} resizeMode="cover" />
          ) : (
            <View style={{width: 88, height: 88, borderRadius: 20, backgroundColor: f.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}}>
              <Text style={{fontSize: fs(30), fontWeight: '700', color: initialOn(f.color), includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center'}}>{getInitials(f.name || '?')}</Text>
            </View>
          )}
          <View style={{position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 9, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center'}}>
            <Text style={{fontSize: fs(13), color: T.bg}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">📷</Text>
          </View>
        </TouchableOpacity>
        {f.avatar && <TouchableOpacity onPress={removePfp} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.removePfp')} hitSlop={{top: 6, bottom: 6, left: 8, right: 8}} style={{marginTop: 6}}><Text style={{fontSize: fs(11), color: T.danger}}>{t('modal.removePfp')}</Text></TouchableOpacity>}
        <AvatarLink key={f.id} ownerId={f.id} onLinked={uri => set('avatar', uri)} toggleStyle={{marginTop: 6}} rowStyle={{marginTop: 8, width: '100%'}} />
      </View>
      <Field label={t('modal.name')} value={f.name} onChange={(v: string) => set('name', v)} placeholder={t('customFront.namePlaceholder')} />
      <Field label={t('modal.nickname')} value={f.nickname || ''} onChange={(v: string) => set('nickname', v || undefined)} placeholder={t('modal.nickname')} />
      {!statusMode && groups.length > 0 && (
        <>
          <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('memberGroups.title')}</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14}}>
            {sortGroupsForDisplay(groups, groups).map(g => (
              <GroupToggleChip key={g.id} g={g} on={(f.groupIds || []).includes(g.id)} onPress={() => set('groupIds', toggleId(f.groupIds || [], g.id))} role="button" label={g.name} />
            ))}
          </View>
        </>
      )}
      <View style={{marginBottom: 14}}>
        <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 5})}>{t('modal.descriptionBio')}</Text>
        <TouchableOpacity onPress={() => setShowDescEditor(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.descriptionBio')}
          style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 72}}>
          {f.description ? <RichDescription text={f.description} /> : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.descriptionPlaceholder')}</Text>}
        </TouchableOpacity>
      </View>
      <RichTextEditor visible={showDescEditor} title={t('modal.descriptionBio')} initialContent={f.description || ''}
        onSave={(html: string) => {set('description', html); setShowDescEditor(false);}} onClose={() => setShowDescEditor(false)} />
      <Field label={t('modal.emoji')} value={f.emoji || ''} onChange={(v: string) => set('emoji', normalizeMemberEmoji(v))} placeholder={t('modal.emojiPlaceholder')} />
      <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('modal.color')}</Text>
      <ColorCarousel value={f.color} onChange={(v: string) => set('color', v)} />
      <View style={{height: 12}} />
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
        <TouchableOpacity onPress={() => set('avatarTransparent', !f.avatarTransparent)} activeOpacity={0.8}
          accessibilityRole="switch" accessibilityState={{checked: !!f.avatarTransparent}} accessibilityLabel={t('modal.transparentColor')}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          style={{width: 30, height: 30, borderRadius: 8, backgroundColor: 'transparent', borderWidth: 2, borderColor: f.avatarTransparent ? '#fff' : T.border, alignItems: 'center', justifyContent: 'center'}}>
          <Text style={{fontSize: 15, color: f.avatarTransparent ? '#fff' : T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">⊘</Text>
        </TouchableOpacity>
      </View>
      <ToggleRow label={t('modal.private')} desc={t('modal.privateDesc')} value={!!f.private} onToggle={() => set('private', !f.private)}
        style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 6}} />
      {isFronting && <Text style={{fontSize: fs(11), color: T.danger, lineHeight: fs(15), marginTop: 4}}>{t('members.frontingLockMsg')}</Text>}
      {visible && <ImageCropHost />}
    </Sheet>
  );
};
