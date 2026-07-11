import React, {useState} from 'react';
import {View, TouchableOpacity, Image, Alert} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {pickImageFromGallery} from '../utils/imagePicker';
import {Sheet} from '../components/Sheet';
import {ColorPicker} from '../components/ColorPicker';
import {PALETTE, fontScale} from '../theme';
import {Member, uid, isValidHex, normalizeHex, getInitials, colorName} from '../utils';
import {RichText as RichDescription} from '../components/MarkdownRenderer';
import {RichTextEditor} from '../components/RichTextEditor';
import {deleteAvatar, saveAvatarFromUri, saveAvatarFromUrl} from '../utils/mediaUtils';
import {Btn, Field} from './shared';

export const CustomFrontModal = ({visible, theme: T, customFront, onSave, onDelete, onClose, isFronting = false, statusMode = false}: any) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const isNew = !customFront;
  const blank = (): Member => ({id: uid(), name: '', pronouns: '', role: '', color: PALETTE[0], description: '', tags: [], groupIds: [], isCustomFront: true});
  const [f, setF] = useState<Member>(customFront || blank());
  const [hexInput, setHexInput] = useState(customFront?.color || PALETTE[0]);
  const [hexError, setHexError] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [showDescEditor, setShowDescEditor] = useState(false);
  React.useEffect(() => { if (visible) { const fresh = customFront || blank(); setF({...fresh, tags: fresh.tags || [], groupIds: fresh.groupIds || [], isCustomFront: true}); setHexInput(fresh.color || PALETTE[0]); setHexError(false); setConfirmDel(false); setShowLink(false); setLinkInput(''); setLinking(false); setShowDescEditor(false); } }, [visible, customFront?.id]);
  const set = (k: keyof Member, v: any) => setF(x => ({...x, [k]: v}));
  const handleHexChange = (val: string) => { setHexInput(val); const n = normalizeHex(val); if (isValidHex(n)) {set('color', n); setHexError(false);} else setHexError(val.length > 1); };
  const applyLink = async () => {
    const url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) { Alert.alert(t('modal.pfpFailed')); return; }
    setLinking(true);
    try { const uri = await saveAvatarFromUrl(f.id, url); if (uri) { set('avatar', uri); setShowLink(false); setLinkInput(''); } else { Alert.alert(t('modal.pfpFailed')); } }
    catch (e: any) { Alert.alert(t('modal.pfpFailed'), e?.message || ''); }
    finally { setLinking(false); }
  };
  const pickPfp = async () => {
    try {
      const img = await pickImageFromGallery();
      if (!img) return;
      const src = img.uri.startsWith('file://') || img.uri.startsWith('content://') ? img.uri : `file://${img.uri}`;
      const uri = await saveAvatarFromUri(f.id, src);
      set('avatar', uri);
    } catch (e: any) { Alert.alert(t('modal.pfpFailed'), e?.message || ''); }
  };
  const removePfp = async () => {
    Alert.alert(t('modal.removePfp'), t('modal.removeImageMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.remove'), style: 'destructive', onPress: async () => {
        await deleteAvatar(f.id);
        set('avatar', undefined);
      }},
    ]);
  };

  return (
    <Sheet visible={visible} title={statusMode ? (isNew ? t('status.add') : t('status.edit')) : (isNew ? t('customFront.add') : t('customFront.edit'))} theme={T} onClose={onClose} footer={<>
      {!isNew && !confirmDel && <Btn instant variant="danger" T={T} disabled={isFronting} onPress={() => setConfirmDel(true)}>{t('common.delete')}</Btn>}
      {confirmDel && (<><Btn instant variant="danger" T={T} onPress={() => {onDelete(f.id); onClose();}}>{t('modal.confirmDelete')}</Btn><Btn instant variant="ghost" T={T} onPress={() => setConfirmDel(false)}>{t('common.cancel')}</Btn></>)}
      {!confirmDel && <Btn instant variant="ghost" T={T} onPress={onClose}>{t('common.cancel')}</Btn>}
      {!confirmDel && <Btn instant T={T} onPress={() => {if (f.name.trim()) {onSave({...f, isCustomFront: true}); onClose();}}}>{t('common.save')}</Btn>}</>}>
      <View style={{alignItems: 'center', marginBottom: 16}}>
        <TouchableOpacity onPress={pickPfp} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.changePfp')}>
          {f.avatar ? (
            <Image source={{uri: f.avatar}} accessibilityElementsHidden importantForAccessibility="no" style={{width: 88, height: 88, borderRadius: 20, borderWidth: 2, borderColor: f.color}} resizeMode="cover" />
          ) : (
            <View style={{width: 88, height: 88, borderRadius: 20, backgroundColor: f.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}}>
              <Text style={{fontSize: fs(30), fontWeight: '700', color: 'rgba(0,0,0,0.75)'}}>{getInitials(f.name || '?')}</Text>
            </View>
          )}
          <View style={{position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 9, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center'}}>
            <Text style={{fontSize: fs(13), color: T.bg}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">📷</Text>
          </View>
        </TouchableOpacity>
        {f.avatar && <TouchableOpacity onPress={removePfp} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.removePfp')} style={{marginTop: 6}}><Text style={{fontSize: fs(11), color: T.danger}}>{t('modal.removePfp')}</Text></TouchableOpacity>}
        <TouchableOpacity onPress={() => setShowLink(!showLink)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.linkPfp')} style={{marginTop: 6}}><Text style={{fontSize: fs(11), color: T.accent}}>🔗 {t('modal.linkPfp')}</Text></TouchableOpacity>
        {showLink && (
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8, width: '100%'}}>
            <TextInput value={linkInput} onChangeText={setLinkInput} placeholder="https://…" placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url"
              style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13)}} onSubmitEditing={applyLink} returnKeyType="done" />
            <Btn T={T} disabled={linking || !linkInput.trim()} onPress={applyLink} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
          </View>
        )}
      </View>
      <Field label={t('modal.name')} value={f.name} onChange={(v: string) => set('name', v)} placeholder={t('customFront.namePlaceholder')} T={T} />
      <View style={{marginBottom: 14}}>
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{t('modal.descriptionBio')}</Text>
        <TouchableOpacity onPress={() => setShowDescEditor(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.descriptionBio')}
          style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 72}}>
          {f.description ? <RichDescription text={f.description} T={T} /> : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.descriptionPlaceholder')}</Text>}
        </TouchableOpacity>
      </View>
      <RichTextEditor visible={showDescEditor} title={t('modal.descriptionBio')} initialContent={f.description || ''} theme={T}
        onSave={(html: string) => {set('description', html); setShowDescEditor(false);}} onClose={() => setShowDescEditor(false)} />
      <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.color')}</Text>
      <ColorPicker value={f.color} onChange={(v: string) => set('color', v)} T={T} />
      <View style={{height: 12}} />
      {hexError && <Text style={{fontSize: fs(11), color: T.danger, marginBottom: 8}}>{t('modal.invalidHex')}</Text>}
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
        <TouchableOpacity onPress={() => set('avatarTransparent', !f.avatarTransparent)} activeOpacity={0.8}
          accessibilityRole="switch" accessibilityState={{checked: !!f.avatarTransparent}} accessibilityLabel={t('modal.transparentColor')}
          style={{width: 30, height: 30, borderRadius: 8, backgroundColor: 'transparent', borderWidth: 2, borderColor: f.avatarTransparent ? '#fff' : T.border, alignItems: 'center', justifyContent: 'center'}}>
          <Text style={{fontSize: 15, color: f.avatarTransparent ? '#fff' : T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">⊘</Text>
        </TouchableOpacity>
        {PALETTE.map((c: string) => (<TouchableOpacity key={c} onPress={() => {set('color', c); setHexInput(c); setHexError(false);}} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{selected: f.color === c}} accessibilityLabel={colorName(c, t)} style={{width: 30, height: 30, borderRadius: 8, backgroundColor: c, borderWidth: 2, borderColor: f.color === c ? '#fff' : 'transparent'}} />))}
      </View>
      {isFronting && <Text style={{fontSize: fs(11), color: T.danger, lineHeight: 15, marginTop: 4}}>{t('members.frontingLockMsg')}</Text>}
    </Sheet>
  );
};
