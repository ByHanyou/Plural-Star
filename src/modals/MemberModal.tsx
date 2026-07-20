import React, {useState, useEffect} from 'react';
import {View, TouchableOpacity, ScrollView, Image, Alert, Modal} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {pickImageFromGallery} from '../utils/imagePicker';
import {Sheet} from '../components/Sheet';
import {Avatar} from '../components/Avatar';
import {PlusMinusIcon} from '../components/Glyphs';
import {ColorCarousel} from '../components/ColorCarousel';
import {PALETTE, fontScale} from '../theme';
import {Member, MemberGroup, CustomFieldDef, uid, getInitials, sortGroupsForDisplay, Relationship, RelationshipTypeDef, allRelationshipTypes, DEFAULT_REL_COLOR} from '../utils';
import {store, KEYS} from '../storage';
import {RichText as RichDescription} from '../components/MarkdownRenderer';
import {RichTextEditor} from '../components/RichTextEditor';
import {DateTimeEditor} from '../components/DateTimeEditor';
import {deleteAvatar, saveBannerImage, saveAvatarFromUri, saveBioImageFromUri, saveAvatarFromUrl} from '../utils/mediaUtils';
import {Btn, Field} from './shared';
import {ToggleSwitch} from '../components/ToggleSwitch';

export const MemberModal = ({visible, theme: T, member, members, groups, settings, onSave, onDelete, onClose, readOnly: readOnlyProp = false, onMentionPress, isFronting = false, onRequestEdit, profileMode = false, onShowOnMap}: any) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const isNew = !member;
  const [readMode, setReadMode] = useState<boolean>(!!readOnlyProp);
  const readOnly = readMode;
  const [showClone, setShowClone] = useState(false);
  const [cloneSel, setCloneSel] = useState({name: true, pronouns: true, role: true, color: true, description: true});
  const [f, setF] = useState<Member>(member || {id: uid(), name: '', pronouns: '', role: '', color: PALETTE[0], description: '', tags: [], groupIds: []});
  const [confirmDel, setConfirmDel] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showDescEditor, setShowDescEditor] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linking, setLinking] = useState(false);

  type MemberTab = 'main' | 'fields' | 'connections';
  const [memberTab, setMemberTab] = useState<MemberTab>('main');
  const [relList, setRelList] = useState<Relationship[]>([]);
  const [relTypes, setRelTypes] = useState<RelationshipTypeDef[]>([]);

  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);
  const [markdownEditFieldId, setMarkdownEditFieldId] = useState<string | null>(null);

  useEffect(() => {
    store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []).then(d => setFieldDefs(d || []));
  }, []);

  React.useEffect(() => { if (visible) { const fresh = member || {id: uid(), name: '', pronouns: '', role: '', color: PALETTE[0], description: '', tags: [], groupIds: []}; setF({...fresh, tags: fresh.tags || [], groupIds: fresh.groupIds || []}); setConfirmDel(false); setTagInput(''); setShowDescEditor(false); setShowLink(false); setLinkInput(''); setLinking(false); setMemberTab('main'); setReadMode(readOnlyProp); } }, [visible, member?.id]);
  const set = (k: keyof Member, v: any) => setF(x => ({...x, [k]: v}));
  const addTag = () => { const raw = tagInput.trim().replace(/^#/, '').toLowerCase(); if (!raw) return; const cur = f.tags || []; if (!cur.includes(`#${raw}`)) set('tags', [...cur, `#${raw}`]); setTagInput(''); };
  const togGroup = (gid: string) => { const cur = f.groupIds || []; set('groupIds', cur.includes(gid) ? cur.filter(id => id !== gid) : [...cur, gid]); };
  const [groupInfo, setGroupInfo] = useState<MemberGroup | null>(null);
  const doClone = async () => {
    const rnd = String(Math.floor(10000 + Math.random() * 90000));
    const clone: Member = {
      id: uid(),
      name: cloneSel.name && (f.name || '').trim() ? f.name : rnd,
      pronouns: cloneSel.pronouns ? (f.pronouns || '') : '',
      role: cloneSel.role ? (f.role || '') : '',
      color: cloneSel.color ? f.color : PALETTE[0],
      description: cloneSel.description ? (f.description || '') : '',
      tags: [],
      groupIds: [],
    };
    setShowClone(false);
    try { await onSave(clone); } catch (e: any) { Alert.alert(t('modal.saveFailed'), String(e?.message || e || '')); }
  };

  const pickAvatar = async () => {
    try {
      const img = await pickImageFromGallery();
      if (!img) return;
      const sourceFileUri = img.uri.startsWith('file://') || img.uri.startsWith('content://')
        ? img.uri
        : `file://${img.uri}`;
      const uri = await saveAvatarFromUri(f.id, sourceFileUri);
      set('avatar', uri);
    } catch (e: any) {
      Alert.alert(t('modal.pfpFailed'), e.message || '');
    }
  };

  const applyLink = async () => {
    const url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) { Alert.alert(t('modal.pfpFailed')); return; }
    setLinking(true);
    try { const uri = await saveAvatarFromUrl(f.id, url); if (uri) { set('avatar', uri); setShowLink(false); setLinkInput(''); } else { Alert.alert(t('modal.pfpFailed')); } }
    catch (e: any) { Alert.alert(t('modal.pfpFailed'), e?.message || ''); }
    finally { setLinking(false); }
  };

  const removeAvatar = async () => {
    Alert.alert(t('modal.removePfp'), t('modal.removeImageMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.remove'), style: 'destructive', onPress: async () => {
        await deleteAvatar(f.id);
        set('avatar', undefined);
      }},
    ]);
  };

  React.useEffect(() => {
    if (visible && memberTab === 'connections' && !isNew) {
      store.get<Relationship[]>(KEYS.relationships, []).then(r => setRelList(r || []));
      store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes, []).then(tt => setRelTypes(tt || []));
    }
  }, [visible, memberTab, isNew]);

  const setFieldVal = (fieldId: string, newVal: string | number | boolean | null) => {
    const existing = f.customFields || [];
    const updated = existing.some(v => v.fieldId === fieldId)
      ? existing.map(v => v.fieldId === fieldId ? {...v, value: newVal} : v)
      : [...existing, {fieldId, value: newVal}];
    set('customFields' as any, updated);
  };

  const pickCfImage = async (fieldId: string) => {
    try {
      const img = await pickImageFromGallery();
      if (!img) return;
      const src = img.uri.startsWith('file://') || img.uri.startsWith('content://') ? img.uri : `file://${img.uri}`;
      const uri = await saveBioImageFromUri(`cf-${f.id}-${fieldId}`, src);
      setFieldVal(fieldId, uri);
    } catch (e: any) { Alert.alert(t('modal.pfpFailed'), e?.message || ''); }
  };


  const relTypeMap = new Map(allRelationshipTypes(relTypes).map((td: RelationshipTypeDef) => [td.id, td] as [string, RelationshipTypeDef]));
  const relTypeName = (td: RelationshipTypeDef) => (td.preset && !td.overridden) ? t(`relType.${td.id}`) : td.name;
  const relTypeInverse = (td: RelationshipTypeDef) => !td.directional ? relTypeName(td) : ((td.preset && !td.overridden) ? t(`relType.${td.id}Inverse`) : (td.inverseName || td.name));
  const connRole = (r: Relationship) => { const td = relTypeMap.get(r.typeId); if (!td) return '?'; return r.fromId === f.id ? relTypeInverse(td) : relTypeName(td); };
  const myConnections = relList.filter((r: Relationship) => r.fromId === f.id || r.toId === f.id);

  return (
    <Sheet visible={visible} title={readOnly ? (f.name || t('modal.member')) : (isNew ? t('modal.addMember') : t('modal.editMember'))} theme={T} onClose={onClose}
      headerAction={!isNew ? (
        <TouchableOpacity onPress={() => setReadMode(m => !m)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={readMode ? t('common.edit') : t('modal.read')} accessibilityState={{selected: readMode}}
          style={{paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginRight: 10}}>
          <Text style={{fontSize: 13, fontWeight: '500', color: T.accent}}>{readMode ? t('common.edit') : t('modal.read')}</Text>
        </TouchableOpacity>
      ) : undefined}
      footer={readOnly ? (
      <Btn instant variant="ghost" T={T} onPress={onClose}>{t('common.close')}</Btn>
    ) : (<>
      {!isNew && !confirmDel && <Btn instant variant="danger" T={T} disabled={isFronting} onPress={() => setConfirmDel(true)}>{t('common.delete')}</Btn>}
      {!isNew && !confirmDel && <Btn instant variant="ghost" T={T} onPress={() => setShowClone(true)}>{t('members.clone')}</Btn>}
      {confirmDel && (<><Btn instant variant="danger" T={T} onPress={() => {onDelete(member.id); onClose();}}>{t('modal.confirmDelete')}</Btn><Btn instant variant="ghost" T={T} onPress={() => setConfirmDel(false)}>{t('common.cancel')}</Btn></>)}
      {!confirmDel && <Btn instant variant="ghost" T={T} onPress={onClose}>{t('common.cancel')}</Btn>}
      {!confirmDel && <Btn instant T={T} onPress={async () => {const nm = (f.name || '').trim(); if (!nm) {Alert.alert(t('modal.nameRequired')); return;} try {await onSave({...f, name: nm}); onClose();} catch (e: any) {Alert.alert(t('modal.saveFailed'), String(e?.message || e || ''));}}}>{t('common.save')}</Btn>}</>)}>

      {!isNew && !profileMode && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 14}}
          contentContainerStyle={{borderBottomWidth: 1, borderBottomColor: T.border}}>
          {(['main', 'fields', 'connections'] as MemberTab[]).map(tab => (
            <TouchableOpacity key={tab} onPress={() => setMemberTab(tab)} activeOpacity={0.7}
              accessibilityRole="tab" accessibilityState={{selected: memberTab === tab}}
              style={{paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: memberTab === tab ? T.accent : 'transparent'}}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{fontSize: fs(12), color: memberTab === tab ? T.accent : T.dim, fontWeight: memberTab === tab ? '600' : '400'}}>
                {tab === 'main' ? (readOnly ? t('modal.profile') : t('modal.editMember')) : tab === 'fields' ? t('customFields.title') : t('systemMap.connections')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {(memberTab === 'main' || isNew) && (<>
        <View style={{alignItems: 'center', marginBottom: 16}}>
          <TouchableOpacity onPress={readOnly ? undefined : pickAvatar} activeOpacity={readOnly ? 1 : 0.7} accessibilityRole="button" accessibilityLabel={t('modal.changePfp')}>
            {f.avatar ? (
              <Image source={{uri: f.avatar}} accessibilityElementsHidden importantForAccessibility="no" style={{width: 80, height: 80, borderRadius: 18, borderWidth: 2, borderColor: f.color}} resizeMode="cover" />
            ) : (
              <View style={{width: 80, height: 80, borderRadius: 18, backgroundColor: f.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}}>
                <Text style={{fontSize: fs(28), fontWeight: '700', color: 'rgba(0,0,0,0.75)'}}>{getInitials(f.name || '?')}</Text>
              </View>
            )}
            {!readOnly && (
              <View style={{position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: fs(12), color: T.bg}}>📷</Text>
              </View>
            )}
          </TouchableOpacity>
          {f.avatar && !readOnly && (
            <TouchableOpacity onPress={removeAvatar} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.removePfp')} style={{marginTop: 6}}>
              <Text style={{fontSize: fs(11), color: T.danger}}>{t('modal.removePfp')}</Text>
            </TouchableOpacity>
          )}
          {!readOnly && (
            <TouchableOpacity onPress={() => setShowLink(!showLink)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.linkPfp')} style={{marginTop: 6}}>
              <Text style={{fontSize: fs(11), color: T.accent}}>🔗 {t('modal.linkPfp')}</Text>
            </TouchableOpacity>
          )}
          {!readOnly && showLink && (
            <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8, width: '100%'}}>
              <TextInput value={linkInput} onChangeText={setLinkInput} placeholder="https://…" placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url"
                style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13)}} onSubmitEditing={applyLink} returnKeyType="done" />
              <Btn T={T} disabled={linking || !linkInput.trim()} onPress={applyLink} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
            </View>
          )}
        </View>

        {(!readOnly || f.banner) && (
          <TouchableOpacity onPress={readOnly ? undefined : async () => {
            try {
              const img = await pickImageFromGallery();
              if (!img) return;
              const sourceFileUri = img.uri.startsWith('file://') || img.uri.startsWith('content://')
                ? img.uri
                : `file://${img.uri}`;
              const uri = await saveBannerImage(`banner-${f.id}`, sourceFileUri);
              set('banner', uri);
            } catch (e: any) { Alert.alert(t('modal.pfpFailed')); }
          }} activeOpacity={readOnly ? 1 : 0.7} accessibilityRole="button" accessibilityLabel={t('memberProfile.changeBanner')} style={{marginBottom: 10}}>
            <View style={{width: '100%', aspectRatio: 3, borderRadius: 8, borderWidth: readOnly ? 0 : 1, borderStyle: 'dashed', borderColor: T.border, overflow: 'hidden', backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}>
              {f.banner ? <Image source={{uri: f.banner}} accessibilityElementsHidden importantForAccessibility="no" style={{width: '100%', height: '100%', borderRadius: 8}} resizeMode="cover" /> : <Text style={{fontSize: fs(11), color: T.dim}}>{t('memberProfile.changeBanner')}</Text>}
            </View>
          </TouchableOpacity>
        )}
        {f.banner && !readOnly && <TouchableOpacity onPress={() => Alert.alert(t('memberProfile.removeBanner'), t('modal.removeImageMsg'), [{text: t('common.cancel'), style: 'cancel'}, {text: t('common.remove'), style: 'destructive', onPress: () => set('banner', undefined)}])} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('memberProfile.removeBanner')} style={{marginBottom: 8}}><Text style={{fontSize: fs(10), color: T.danger}}>{t('memberProfile.removeBanner')}</Text></TouchableOpacity>}

        <Field label={t('modal.name')} value={f.name} onChange={(v: string) => set('name', v)} placeholder={t('modal.headmateName')} readOnly={readOnly} T={T} />
        <Field label={t('modal.pronouns')} value={f.pronouns} onChange={(v: string) => set('pronouns', v)} placeholder={t('modal.pronounsPlaceholder')} readOnly={readOnly} T={T} />
        {!profileMode && <Field label={t('modal.role')} value={f.role} onChange={(v: string) => set('role', v)} placeholder={t('modal.rolePlaceholder')} readOnly={readOnly} T={T} />}

        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{profileMode ? t('profile.favoriteColor') : t('modal.color')}</Text>
        {!readOnly ? (
          <View style={{marginBottom: 14}}>
            <ColorCarousel value={f.color} onChange={(v: string) => set('color', v)} T={T} />
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12}}>
              <TouchableOpacity onPress={() => set('avatarTransparent', !f.avatarTransparent)} activeOpacity={0.8}
                accessibilityRole="switch" accessibilityState={{checked: !!f.avatarTransparent}} accessibilityLabel={t('modal.transparentColor')}
                style={{width: 30, height: 30, borderRadius: 15, backgroundColor: 'transparent', borderWidth: 2, borderColor: f.avatarTransparent ? '#fff' : T.border, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: 15, color: f.avatarTransparent ? '#fff' : T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">⊘</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14}}>
            <View style={{width: 36, height: 36, borderRadius: 18, backgroundColor: f.color, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}} />
            <Text style={{fontSize: fs(13), color: T.dim, fontFamily: 'monospace'}}>{f.color}</Text>
          </View>
        )}

        {(groups || []).length > 0 && (() => {
          const visibleGroups = sortGroupsForDisplay(
            readOnly
              ? (groups || []).filter((g: MemberGroup) => (f.groupIds || []).includes(g.id))
              : (groups || []),
            groups || [],
          );
          if (readOnly && visibleGroups.length === 0) return null;
          return (
            <>
              <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('memberGroups.title')}</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14}}>
                {visibleGroups.map((g: MemberGroup) => {
                  const active = (f.groupIds || []).includes(g.id);
                  return (
                    <TouchableOpacity key={g.id} onPress={readOnly ? (g.description ? () => setGroupInfo(g) : undefined) : () => togGroup(g.id)} activeOpacity={readOnly && !g.description ? 1 : 0.7}
                      accessibilityRole="button" accessibilityState={{selected: active}} accessibilityLabel={g.name}
                      style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                        backgroundColor: active ? `${g.color || T.accent}20` : T.surface, borderColor: active ? `${g.color || T.accent}50` : T.border}}>
                      <View style={{width: 7, height: 7, borderRadius: 3.5, backgroundColor: g.color || T.accent}} />
                      <Text style={{fontSize: fs(12), color: active ? (g.color || T.accent) : T.dim}}>{g.name}</Text>
                      {active && !readOnly && <Text style={{fontSize: fs(11), fontWeight: '700', color: g.color || T.accent}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          );
        })()}

        {!profileMode && (<>
        {(!readOnly || (f.tags || []).length > 0) && (
          <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.memberTags')}</Text>
        )}
        {(f.tags || []).length > 0 && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: readOnly ? 14 : 8}}>
            {(f.tags || []).map((tag: string) => (
              <TouchableOpacity key={tag} onPress={readOnly ? undefined : () => set('tags', (f.tags || []).filter(x => x !== tag))} activeOpacity={readOnly ? 1 : 0.7}
                accessibilityRole={readOnly ? undefined : 'button'} accessibilityLabel={readOnly ? undefined : `${t('common.remove')} ${tag}`}
                style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: `${T.info}18`, borderWidth: 1, borderColor: `${T.info}40`}}>
                <Text style={{fontSize: fs(12), color: T.info}}>{tag}</Text>
                {!readOnly && <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>}
              </TouchableOpacity>))}
          </View>
        )}
        {!readOnly && (
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 14}}>
            <TextInput value={tagInput} onChangeText={setTagInput} placeholder={t('modal.memberTagPlaceholder')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false}
              style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}} onSubmitEditing={addTag} returnKeyType="done" />
            <Btn T={T} onPress={addTag} style={{paddingHorizontal: 12, paddingVertical: 9}}>{t('common.add')}</Btn>
          </View>
        )}
        </>)}

        {(!readOnly || f.description) && (
          <View style={{marginBottom: 14}}>
            <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{t('modal.descriptionBio')}</Text>
            <TouchableOpacity onPress={readOnly ? undefined : () => setShowDescEditor(true)} activeOpacity={readOnly ? 1 : 0.7}
              accessibilityRole={readOnly ? undefined : 'button'} accessibilityLabel={readOnly ? undefined : t('modal.descriptionBio')}
              style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 80}}>
              {f.description ? <RichDescription text={f.description} T={T} members={members} onMentionPress={onMentionPress} /> : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.descriptionPlaceholder')}</Text>}
            </TouchableOpacity>
          </View>
        )}
        {!readOnly && <RichTextEditor visible={showDescEditor} title={t('modal.descriptionBio')} initialContent={f.description || ''} theme={T}
          members={members}
          onSave={(html: string) => {set('description', html); setShowDescEditor(false);}} onClose={() => setShowDescEditor(false)} />}

        {!isNew && !readOnly && (
          <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 4}}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
              <View style={{flex: 1}}>
                <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 4}}>{t('modal.archiveMember')}</Text>
                <Text style={{fontSize: fs(11), color: isFronting ? T.danger : T.muted, lineHeight: 15}}>{isFronting ? t('members.frontingLockMsg') : t('modal.archiveDesc')}</Text>
              </View>
              <ToggleSwitch value={!!f.archived} onToggle={() => set('archived', !f.archived)} label={t('modal.archiveMember')} T={T} disabled={isFronting} style={{marginLeft: 12}} />
            </View>
          </View>
        )}
      </>)}

      {memberTab === 'fields' && !isNew && (
        <View>
          {(() => {
          const visibleDefs = readOnly
            ? fieldDefs.filter(vfd => { const vv = (f.customFields || []).find(c => c.fieldId === vfd.id)?.value; return !(vv === undefined || vv === null || vv === ''); })
            : fieldDefs;
          return visibleDefs.length > 0 ? visibleDefs.map((fd, fdIndex) => {
            const cfv = (f.customFields || []).find(v => v.fieldId === fd.id);
            const val = cfv?.value ?? '';

            const dateTypes: Record<string, true> = {
              date: true, timestamp: true, monthYear: true,
              month: true, year: true, monthDay: true,
            };
            if (dateTypes[fd.type]) {
              const modeMap: Record<string, 'date' | 'datetime' | 'monthYear' | 'month' | 'year' | 'monthDay'> = {
                date: 'date', timestamp: 'datetime', monthYear: 'monthYear',
                month: 'month', year: 'year', monthDay: 'monthDay',
              };
              let dateVal: Date;
              const bareNum = typeof val === 'number'
                ? val
                : (typeof val === 'string' && val.trim() && Number.isFinite(Number(val)) ? Number(val) : NaN);
              if (!Number.isNaN(bareNum) && Number.isInteger(bareNum) && bareNum >= 1000 && bareNum <= 9999) {
                dateVal = new Date(bareNum, 0, 1);
              } else if (typeof val === 'number' && Number.isFinite(val)) {
                dateVal = new Date(val);
              } else if (typeof val === 'string' && val) {
                const asNum = Number(val);
                const isoDate = val.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00(?::00(?:\.\d+)?)?Z?)?$/);
                if (Number.isFinite(asNum) && asNum !== 0) {
                  dateVal = new Date(asNum);
                } else if (isoDate) {
                  dateVal = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
                } else {
                  const parsed = Date.parse(val);
                  dateVal = Number.isFinite(parsed) ? new Date(parsed) : new Date();
                }
              } else {
                dateVal = new Date();
              }
              return (
                <View key={fd.id} style={{marginBottom: 14, borderTopWidth: fdIndex > 0 ? 1 : 0, borderTopColor: T.border, paddingTop: fdIndex > 0 ? 14 : 0}}>
                  <DateTimeEditor
                    date={dateVal}
                    onChange={readOnly ? () => {} : d => setFieldVal(fd.id, d.getTime())}
                    label={fd.name}
                    mode={modeMap[fd.type]}
                    T={T}
                  />
                  {val !== '' && !readOnly && (
                    <TouchableOpacity onPress={() => setFieldVal(fd.id, null)} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityLabel={`${t('common.clear')} ${fd.name}`}
                      style={{alignSelf: 'flex-end', marginTop: -8, paddingVertical: 4, paddingHorizontal: 6}}>
                      <Text style={{fontSize: fs(11), color: T.muted}}>{t('common.clear')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }

            if (fd.type === 'dateRange') {
              let range: {start: number; end: number} = {start: Date.now(), end: Date.now()};
              if (typeof val === 'string' && val) {
                try { const parsed = JSON.parse(val); if (parsed && typeof parsed.start === 'number' && typeof parsed.end === 'number') range = parsed; } catch {}
              }
              const startD = new Date(range.start);
              const endD = new Date(range.end);
              const writeRange = (next: Partial<typeof range>) => {
                const merged = {...range, ...next};
                setFieldVal(fd.id, JSON.stringify(merged));
              };
              return (
                <View key={fd.id} style={{marginBottom: 14, borderTopWidth: fdIndex > 0 ? 1 : 0, borderTopColor: T.border, paddingTop: fdIndex > 0 ? 14 : 0}}>
                  <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{fd.name}</Text>
                  <DateTimeEditor
                    date={startD}
                    onChange={readOnly ? () => {} : d => writeRange({start: d.getTime()})}
                    label={t('customFields.startDate')}
                    mode="date"
                    T={T}
                  />
                  <DateTimeEditor
                    date={endD}
                    onChange={readOnly ? () => {} : d => writeRange({end: d.getTime()})}
                    label={t('customFields.endDate')}
                    mode="date"
                    T={T}
                  />
                </View>
              );
            }

            return (
              <View key={fd.id} style={{marginBottom: 14, borderTopWidth: fdIndex > 0 ? 1 : 0, borderTopColor: T.border, paddingTop: fdIndex > 0 ? 14 : 0}}>
                {fd.type === 'toggle' ? (
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Text style={{fontSize: fs(13), color: T.text, fontWeight: '500'}}>{fd.name}</Text>
                    <ToggleSwitch value={!!val} onToggle={readOnly ? undefined : () => setFieldVal(fd.id, !val)} activeOpacity={readOnly ? 1 : 0.8} label={fd.name} T={T} />
                  </View>
                ) : fd.type === 'color' ? (
                  <View>
                    <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{fd.name}</Text>
                    {readOnly ? (
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                        <View style={{width: 32, height: 32, borderRadius: 8, backgroundColor: String(val || '#333'), borderWidth: 1, borderColor: T.border}} />
                        <Text style={{fontSize: fs(13), color: T.dim, fontFamily: 'monospace'}}>{String(val || '')}</Text>
                      </View>
                    ) : (
                      <ColorCarousel value={String(val || '#333333')} onChange={v => setFieldVal(fd.id, v)} T={T} />
                    )}
                  </View>
                ) : fd.type === 'image' ? (
                  <View>
                    <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{fd.name}</Text>
                    {val ? (
                      <View>
                        <Image source={{uri: String(val)}} accessibilityRole="image" accessibilityLabel={t('a11y.image')} style={{width: '100%', height: 180, borderRadius: 8, backgroundColor: T.surface}} resizeMode="cover" />
                        {!readOnly && (
                          <View style={{flexDirection: 'row', gap: 16, marginTop: 6}}>
                            <TouchableOpacity onPress={() => pickCfImage(fd.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.change')}><Text style={{fontSize: fs(12), color: T.accent}}>{t('common.change')}</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => setFieldVal(fd.id, null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.clear')}><Text style={{fontSize: fs(12), color: T.danger}}>{t('common.clear')}</Text></TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ) : !readOnly ? (
                      <TouchableOpacity onPress={() => pickCfImage(fd.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('customFields.addImage')}
                        style={{borderWidth: 1.5, borderStyle: 'dashed', borderColor: T.border, borderRadius: 10, paddingVertical: 22, alignItems: 'center', backgroundColor: T.surface}}>
                        <PlusMinusIcon size={16} color={T.dim} />
                        <Text style={{fontSize: fs(12), color: T.dim, marginTop: 4}}>{t('customFields.addImage')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (fd.type === 'markdown' || (fd.type === 'text' && fd.markdown)) ? (
                  <View style={{marginBottom: 0}}>
                    <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{fd.name}</Text>
                    <TouchableOpacity onPress={readOnly ? undefined : () => setMarkdownEditFieldId(fd.id)} activeOpacity={readOnly ? 1 : 0.7}
                      accessibilityRole={readOnly ? undefined : 'button'} accessibilityLabel={readOnly ? undefined : fd.name}
                      style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 72}}>
                      {val
                        ? <RichDescription text={String(val)} T={T} members={members} onMentionPress={onMentionPress} />
                        : <Text style={{fontSize: fs(13), color: T.muted}}>{fd.name}…</Text>}
                    </TouchableOpacity>
                    {!readOnly && <RichTextEditor
                      visible={markdownEditFieldId === fd.id}
                      title={fd.name}
                      initialContent={String(val || '')}
                      theme={T}
                      members={members}
                      onSave={(html: string) => { setFieldVal(fd.id, html); setMarkdownEditFieldId(null); }}
                      onClose={() => setMarkdownEditFieldId(null)}
                    />}
                  </View>
                ) : fd.type === 'text' ? (
                  <View style={{marginBottom: 0}}>
                    <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{fd.name}</Text>
                    <TextInput
                      value={String(val || '')}
                      onChangeText={(v: string) => setFieldVal(fd.id, v)}
                      placeholder={fd.name}
                      placeholderTextColor={T.muted}
                      editable={!readOnly}
                      multiline
                      textAlignVertical="top"
                      style={{
                        backgroundColor: T.surface, color: T.text,
                        borderWidth: 1, borderColor: T.border, borderRadius: 8,
                        paddingHorizontal: 12, paddingVertical: 10,
                        fontSize: fs(14), lineHeight: 20, minHeight: 72,
                      }}
                    />
                  </View>
                ) : fd.type === 'number' ? (
                  <View>
                    <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 5, fontWeight: '600'}}>{fd.name}</Text>
                    <TextInput
                      value={val === null || val === '' ? '' : String(val)}
                      onChangeText={(raw: string) => {
                        const cleaned = raw.replace(/[^0-9.\-]/g, '');
                        if (cleaned === '' || cleaned === '-' || cleaned === '.') { setFieldVal(fd.id, null); return; }
                        const n = Number(cleaned);
                        if (Number.isFinite(n)) setFieldVal(fd.id, n);
                      }}
                      placeholder={fd.name}
                      placeholderTextColor={T.muted}
                      editable={!readOnly}
                      keyboardType="numbers-and-punctuation"
                      style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}}
                    />
                  </View>
                ) : (
                  <Field label={fd.name} value={String(val || '')} onChange={(v: string) => setFieldVal(fd.id, v)}
                    placeholder={fd.name} readOnly={readOnly} multiline T={T} />
                )}
              </View>
            );
          }) : (
            <View style={{alignItems: 'center', paddingVertical: 40}}>
              <Text style={{fontSize: fs(13), color: T.muted}}>{t('customFields.noFieldsInfo')}</Text>
            </View>
          );
          })()}
        </View>
      )}

      {memberTab === 'connections' && !isNew && (
        <View>
          {onShowOnMap && (
            <TouchableOpacity onPress={() => onShowOnMap(f.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('systemMap.showOnMap')}
              style={{alignSelf: 'flex-start', borderWidth: 1, borderColor: `${T.accent}40`, backgroundColor: T.accentBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('systemMap.showOnMap')}</Text>
            </TouchableOpacity>
          )}
          {myConnections.length === 0 ? (
            <Text style={{fontSize: fs(12), color: T.dim, paddingVertical: 8}}>{t('systemMap.noneForMember')}</Text>
          ) : myConnections.map((r: Relationship) => {
            const otherId = r.fromId === f.id ? r.toId : r.fromId;
            const other = (members || []).find((m: Member) => m.id === otherId);
            if (!other) return null;
            const td = relTypeMap.get(r.typeId);
            const c = td?.color || DEFAULT_REL_COLOR;
            return (
              <TouchableOpacity key={r.id} onPress={() => onMentionPress && onMentionPress(otherId)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`${connRole(r)}: ${other.name}`}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border}}>
                <Avatar member={other} size={32} T={T} />
                <View style={{flex: 1}}>
                  <Text style={{fontSize: fs(14), color: T.text}} numberOfLines={1}>{other.name}</Text>
                  {r.note ? <Text style={{fontSize: fs(11), color: T.muted}} numberOfLines={1}>{r.note}</Text> : null}
                </View>
                <View style={{backgroundColor: `${c}20`, borderWidth: 1, borderColor: `${c}60`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3}}>
                  <Text style={{fontSize: fs(10), color: c}}>{connRole(r)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Modal visible={!!groupInfo} transparent animationType="fade" onRequestClose={() => setGroupInfo(null)}>
        <TouchableOpacity style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 28}} activeOpacity={1} onPress={() => setGroupInfo(null)} accessibilityRole="none">
          <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10}}>
              <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: groupInfo?.color || T.accent}} importantForAccessibility="no" />
              <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(15), fontWeight: '600', color: T.text}} numberOfLines={1}>{groupInfo?.name}</Text>
            </View>
            <ScrollView style={{maxHeight: 260}}>
              <Text style={{fontSize: fs(13), color: T.dim, lineHeight: 19}}>{groupInfo?.description}</Text>
            </ScrollView>
            <TouchableOpacity onPress={() => setGroupInfo(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
              style={{alignItems: 'center', paddingVertical: 11, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: T.border}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showClone} transparent animationType="fade" onRequestClose={() => setShowClone(false)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
          <View style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
            <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 4}}>{t('members.clone')}</Text>
            <Text style={{fontSize: fs(12), color: T.dim, paddingHorizontal: 16, paddingBottom: 8}}>{t('members.cloneFields')}</Text>
            {([['name', t('modal.name')], ['pronouns', t('modal.pronouns')], ['role', t('modal.role')], ['color', t('memberProfile.color')], ['description', t('modal.descriptionLabel')]] as ['name' | 'pronouns' | 'role' | 'color' | 'description', string][]).map(([k, label]) => {
              const on = cloneSel[k];
              return (
                <TouchableOpacity key={k} onPress={() => setCloneSel(s => ({...s, [k]: !s[k]}))} activeOpacity={0.7}
                  accessibilityRole="switch" accessibilityState={{checked: on}} accessibilityLabel={label}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: T.border}}>
                  <View style={{width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: on ? T.accent : T.border, backgroundColor: on ? T.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
                    {on ? <Text style={{fontSize: fs(12), color: T.bg, fontWeight: '700'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text> : null}
                  </View>
                  <Text style={{flex: 1, fontSize: fs(14), color: T.text}} numberOfLines={1}>{label}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={{flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border}}>
              <TouchableOpacity onPress={() => setShowClone(false)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
                style={{flex: 1, alignItems: 'center', paddingVertical: 13, borderRightWidth: 1, borderRightColor: T.border}}>
                <Text style={{fontSize: fs(13), color: T.dim}}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={doClone} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('members.clone')}
                style={{flex: 1, alignItems: 'center', paddingVertical: 13}}>
                <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('members.clone')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Sheet>
  );
};
