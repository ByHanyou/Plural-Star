import React, {useState, useEffect, useRef} from 'react';
import {View, TouchableOpacity, ScrollView, Image, Alert, Keyboard} from 'react-native';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {pickAndSaveImage} from '../utils/imagePicker';
import {ImageCropHost} from '../components/ImageCropModal';
import {Sheet} from '../components/Sheet';
import {ColorCarousel} from '../components/ColorCarousel';
import {ColorPickerModal} from '../components/ColorPickerModal';
import {fontScale, ensureReadable, initialOn, inkOn, profileTheme} from '../theme';
import {ThemeProvider, useTheme} from '../themeContext';
import type {MirrorMember} from '../network/types';
import {logError} from '../utils/log';
import {reportSaveError} from '../utils/saveError';
import {Member, MemberGroup, CustomFieldDef, AppSettings, getInitials, blankMember, cloneMemberFrom, CLONE_ALL, sortGroupsForDisplay, groupKind, Relationship, RelationshipTypeDef, allRelationshipTypes, DEFAULT_REL_COLOR, isValidHex, tagKey, linkedSubsystemsOf, setSubsystemLinks, normalizeMemberEmoji, toggleId, withTag, tagSuggestions, memberRelationships, relationshipRoleOfOther, withFieldValue} from '../utils';
import type {CloneSelection} from '../utils';
import {store, KEYS} from '../storage';
import {useAppStore} from '../store/appStore';
import {saveGroups} from '../store/actions';
import {RichText as RichDescription} from '../components/MarkdownRenderer';
import {RichTextEditor} from '../components/RichTextEditor';
import {saveAvatarFromUri, saveBioImageFromUri, avatarFullUri} from '../utils/mediaUtils';
import {fieldImageId} from '../utils/mediaFiles';
import {AvatarLink, Btn, Field, TagEditor, ToggleRow, confirmRemoveImage, sectionLabel} from '../components/controls';
import {useDraft, clearDraft} from '../hooks/useDraft';
import {GroupChips, GroupTreePicker, LinkedSubsystemPicker} from './member/GroupPickers';
import {MemberFieldsPanel} from './member/MemberFieldsPanel';
import {MemberConnectionsPanel} from './member/MemberConnectionsPanel';
import type {MemberConnectionRow} from './member/MemberConnectionsPanel';
import {AvatarViewer, GroupInfoDialog, CloneDialog} from './member/MemberDialogs';
import {profileHeading} from '../components/headings';

type ConnectionRow = NonNullable<MirrorMember['connections']>[number];

type MemberTab = 'main' | 'fields' | 'connections';

export const MemberModal = ({visible, member, members, groups, settings, onSave, onDelete, onClose, readOnly: readOnlyProp = false, onMentionPress, isFronting = false, profileMode = false, onShowOnMap, fieldDefsOverride, connectionsOverride, lockRead = false, facetMode = false}: {
  visible: boolean; member: Member | null; members: Member[]; groups: MemberGroup[]; settings?: AppSettings;
  onSave: (m: Member) => void | Promise<void>; onDelete: (id: string) => void | Promise<void>; onClose: () => void; readOnly?: boolean;
  onMentionPress?: (memberId: string) => void; isFronting?: boolean; profileMode?: boolean; onShowOnMap?: (memberId: string) => void;
  fieldDefsOverride?: CustomFieldDef[]; connectionsOverride?: ConnectionRow[]; lockRead?: boolean; facetMode?: boolean;
}) => {
  const baseT = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(baseT);
  const isNew = !member;
  const [readMode, setReadMode] = useState<boolean>(!!readOnlyProp);
  const readOnly = readMode;
  const [showClone, setShowClone] = useState(false);
  const [cloneSel, setCloneSel] = useState<CloneSelection>(CLONE_ALL);
  const [f, setF] = useState<Member>(member || blankMember());
  const fRef = useRef(f);
  fRef.current = f;
  const [confirmDel, setConfirmDel] = useState(false);
  const [viewPfp, setViewPfp] = useState(false);
  const [pfpFull, setPfpFull] = useState<string | null>(null);
  const openViewPfp = async () => {
    setPfpFull(await avatarFullUri(f.id));
    setViewPfp(true);
  };
  const [tagInput, setTagInput] = useState('');
  const [showDescEditor, setShowDescEditor] = useState(false);
  const [bannerBroken, setBannerBroken] = useState(false);
  useEffect(() => { setBannerBroken(false); }, [f.banner]);
  const [showPicker, setShowPicker] = useState(false);

  const bgOn = readOnly && !!f.profileBg && isValidHex(f.color);
  const T = React.useMemo(() => (bgOn ? profileTheme(baseT, f.color) : baseT), [bgOn, baseT, f.color]);
  const mc = bgOn ? T.text : ensureReadable(f.color || T.accent, T.card, 3);
  const edge = bgOn ? T.border : `${f.color}40`;

  const [memberTab, setMemberTab] = useState<MemberTab>('main');
  const [relList, setRelList] = useState<Relationship[]>([]);
  const [relTypes, setRelTypes] = useState<RelationshipTypeDef[]>([]);

  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>(fieldDefsOverride || []);
  const [markdownEditFieldId, setMarkdownEditFieldId] = useState<string | null>(null);

  useEffect(() => {
    if (fieldDefsOverride) { setFieldDefs(fieldDefsOverride); return; }
    store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []).then(d => setFieldDefs(d || [])).catch(e => logError('member', e));
  }, [fieldDefsOverride]);

  const openPropsRef = React.useRef({member, readOnlyProp});
  openPropsRef.current = {member, readOnlyProp};
  React.useEffect(() => { if (visible) { const fresh = openPropsRef.current.member || blankMember(); setF({...fresh, tags: fresh.tags || [], groupIds: fresh.groupIds || []}); setConfirmDel(false); setTagInput(''); setShowDescEditor(false); setShowPicker(false); setMemberTab('main'); setReadMode(openPropsRef.current.readOnlyProp); } }, [visible, member?.id]);
  useEffect(() => {
    if (!visible || !lockRead || !member) return;
    setF(cur => {
      if (cur.id !== member.id) return cur;
      const had = cur.customFields || [];
      const next = member.customFields || [];
      const same = cur.banner === member.banner && cur.avatar === member.avatar && had.length === next.length
        && had.every((c, i) => c.fieldId === next[i].fieldId && c.value === next[i].value);
      return same ? cur : {...cur, banner: member.banner, avatar: member.avatar, customFields: member.customFields};
    });
  }, [visible, lockRead, member]);
  const draftId = isNew ? 'new' : (member?.id || f.id);
  useDraft<Member>('member', readOnly ? '' : draftId, visible, f, d => setF(cur => ({
    ...d,
    avatar: cur.avatar || d.avatar,
    avatarTransparent: cur.avatar ? cur.avatarTransparent : d.avatarTransparent,
    banner: cur.banner || d.banner,
  })));
  const set = <K extends keyof Member>(k: K, v: Member[K]) => {
    fRef.current = {...fRef.current, [k]: v};
    setF(x => ({...x, [k]: v}));
  };
  const applyTag = (tag: string) => { set('tags', withTag(f.tags || [], tag)); setTagInput(''); };
  const suggestions = React.useMemo(() => tagSuggestions(members.flatMap(m => m.tags || []), f.tags || [], tagInput), [members, f.tags, tagInput]);
  const togGroup = (gid: string) => set('groupIds', toggleId(f.groupIds || [], gid));
  const [groupInfo, setGroupInfo] = useState<MemberGroup | null>(null);
  const [groupOpen, setGroupOpen] = useState<ReadonlyMap<string, boolean>>(new Map());
  useEffect(() => { if (visible) setGroupOpen(new Map()); }, [visible, member?.id]);
  const [linkSel, setLinkSel] = useState<string[] | null>(null);
  useEffect(() => { if (visible) setLinkSel(null); }, [visible, member?.id]);
  const savedLinkIds = linkedSubsystemsOf(groups, f.id).map(g => g.id);
  const linkedIds = linkSel ?? savedLinkIds;
  const toggleLink = (gid: string) => setLinkSel(cur => toggleId(cur ?? savedLinkIds, gid));
  const applyLinks = async (memberId: string) => {
    if (!linkSel) return;
    const live = useAppStore.getState().groups;
    const next = setSubsystemLinks(live, memberId, linkSel);
    if (next !== live) await saveGroups(next);
  };
  const doClone = async () => {
    setShowClone(false);
    try { await onSave(cloneMemberFrom(f, cloneSel)); } catch (e) { reportSaveError(e); }
  };

  const pickAvatar = async () => {
    const uri = await pickAndSaveImage(src => saveAvatarFromUri(f.id, src));
    if (uri) set('avatar', uri);
  };

  const removeAvatar = () => confirmRemoveImage(t, t('modal.removePfp'), () => set('avatar', undefined));

  React.useEffect(() => {
    if (connectionsOverride) return;
    if (visible && (memberTab === 'connections' || readMode) && !isNew) {
      store.get<Relationship[]>(KEYS.relationships, []).then(r => setRelList(r || [])).catch(e => logError('member', e));
      store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes, []).then(tt => setRelTypes(tt || [])).catch(e => logError('member', e));
    }
  }, [visible, memberTab, isNew, readMode, connectionsOverride]);

  const setFieldVal = (fieldId: string, newVal: string | number | boolean | null) => {
    const apply = (x: Member): Member => ({...x, customFields: withFieldValue(x.customFields, fieldId, newVal)});
    fRef.current = apply(fRef.current);
    setF(apply);
  };

  const pickCfImage = async (fieldId: string) => {
    const uri = await pickAndSaveImage(src => saveBioImageFromUri(fieldImageId(f.id, fieldId), src));
    if (uri) setFieldVal(fieldId, uri);
  };

  const relTypeMap = new Map(allRelationshipTypes(relTypes).map((td: RelationshipTypeDef) => [td.id, td] as [string, RelationshipTypeDef]));
  const connRole = (r: Relationship) => relationshipRoleOfOther(relTypeMap.get(r.typeId), r, f.id, t);
  const myConnections = memberRelationships(f.id, members, relList);

  const connRows: MemberConnectionRow[] =
    connectionsOverride
      ? connectionsOverride.map(c => ({
          key: c.id,
          otherId: c.otherId,
          name: c.otherName,
          note: c.note,
          label: c.labelKey ? t(c.labelKey) : c.label,
          color: c.color || DEFAULT_REL_COLOR,
          other: members.find(m => m.id === c.otherId) || blankMember({id: c.otherId, name: c.otherName}),
        }))
      : myConnections.flatMap((r: Relationship) => {
          const otherId = r.fromId === f.id ? r.toId : r.fromId;
          const other = members.find(m => m.id === otherId);
          if (!other) return [];
          const td = relTypeMap.get(r.typeId);
          return [{
            key: r.id,
            otherId,
            name: other.name,
            note: r.note,
            label: connRole(r),
            color: td?.color || DEFAULT_REL_COLOR,
            other,
          }];
        });

  const activeGroups = sortGroupsForDisplay(groups.filter(g => (f.groupIds || []).includes(g.id)), groups);
  const linkedSubs = sortGroupsForDisplay(linkedSubsystemsOf(groups, f.id), groups);
  const subsystems = sortGroupsForDisplay(groups.filter(g => groupKind(g) === 'subsystem'), groups);

  return (
    <ThemeProvider value={T}>
      <Sheet visible={visible} title={
        facetMode
          ? (readOnly ? (f.name || t('members.facet')) : (isNew ? t('members.addFacet') : (f.name || t('members.facet'))))
          : (readOnly ? (f.name || t('modal.member')) : (isNew ? t('modal.addMember') : t('modal.editMember')))
      } onClose={onClose}
        headerAction={!isNew && !lockRead ? (
          <TouchableOpacity onPress={() => setReadMode(m => !m)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={readMode ? t('common.edit') : t('modal.read')} accessibilityState={{selected: readMode}}
            hitSlop={{top: 9, bottom: 9}} style={{paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, marginRight: 10}}>
            <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>{readMode ? t('common.edit') : t('modal.read')}</Text>
          </TouchableOpacity>
        ) : undefined}
        footer={readOnly ? (
        <Btn instant variant="ghost" onPress={onClose}>{t('common.close')}</Btn>
      ) : (<>
        {!isNew && !confirmDel && <Btn instant variant="danger" disabled={isFronting} onPress={() => setConfirmDel(true)}>{t('common.delete')}</Btn>}
        {!isNew && !confirmDel && <Btn instant variant="ghost" onPress={() => setShowClone(true)}>{t('members.clone')}</Btn>}
        {confirmDel && (<><Btn instant variant="danger" onPress={async () => {try {await onDelete((member || f).id); clearDraft('member', draftId); onClose();} catch (e) {reportSaveError(e);}}}>{t('modal.confirmDelete')}</Btn><Btn instant variant="ghost" onPress={() => setConfirmDel(false)}>{t('common.cancel')}</Btn></>)}
        {!confirmDel && <Btn instant variant="ghost" onPress={() => {clearDraft('member', draftId); onClose();}}>{t('common.cancel')}</Btn>}
        {!confirmDel && <Btn instant onPress={async () => {Keyboard.dismiss(); const cur = fRef.current; const nm = (cur.name || '').trim(); if (!nm) {Alert.alert(t('modal.nameRequired')); return;} try {await onSave({...cur, name: nm}); await applyLinks(cur.id); clearDraft('member', draftId); onClose();} catch (e) {reportSaveError(e);}}}>{t('common.save')}</Btn>}</>)}>

        {!isNew && !profileMode && !readOnly && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 14}}
            contentContainerStyle={{borderBottomWidth: 1, borderBottomColor: T.border}}>
            {(['main', 'fields', 'connections'] as MemberTab[]).map(tab => (
              <TouchableOpacity key={tab} onPress={() => setMemberTab(tab)} activeOpacity={0.7}
                accessibilityRole="tab" accessibilityState={{selected: memberTab === tab}}
                hitSlop={{top: 6, bottom: 6}} style={{paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: memberTab === tab ? T.accent : 'transparent'}}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{fontSize: fs(12), color: memberTab === tab ? T.accent : T.dim, fontWeight: memberTab === tab ? '600' : '400'}}>
                  {tab === 'main' ? t('modal.editMember') : tab === 'fields' ? t('customFields.title') : t('systemMap.connections')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {!isNew && !readOnly && !profileMode && memberTab === 'main' && settings?.selfMemberId !== f.id && (
          <TouchableOpacity
            onPress={() => {
              const toFacet = !f.isFacet;
              setF({...f, isFacet: toFacet, isCustomFront: toFacet ? false : f.isCustomFront});
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={f.isFacet
              ? t('members.makeMember')
              : t('members.makeFacet')}
            accessibilityHint={t('members.moveCategoryHint')}
            hitSlop={{top: 8, bottom: 8}} style={{alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, marginBottom: 14}}>
            <Text style={{fontSize: fs(12), color: T.dim, fontWeight: '600'}}>
              {f.isFacet
                ? `↩ ${t('members.makeMember')}`
                : `◈ ${t('members.makeFacet')}`}
            </Text>
          </TouchableOpacity>
        )}

        {readOnly && !isNew && (<>
          {f.banner && !bannerBroken && (
            <View style={{width: '100%', aspectRatio: 3, borderRadius: 8, overflow: 'hidden', backgroundColor: T.surface, marginBottom: 12}}>
              <Image source={{uri: f.banner}} onError={() => setBannerBroken(true)} accessibilityElementsHidden importantForAccessibility="no" style={{width: '100%', height: '100%'}} resizeMode="cover" />
            </View>
          )}

          <View style={{flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8}}>
            <TouchableOpacity onPress={f.avatar ? openViewPfp : undefined} activeOpacity={f.avatar ? 0.7 : 1}
              accessibilityRole={f.avatar ? 'button' : 'image'} accessibilityLabel={f.avatar ? t('modal.viewPfp') : (f.name || '?')}>
              {f.avatar ? (
                <Image source={{uri: f.avatar}} accessibilityElementsHidden importantForAccessibility="no" style={{width: 80, height: 80, borderRadius: 18, borderWidth: 2, borderColor: bgOn ? T.border : f.color}} resizeMode="cover" />
              ) : (
                <View style={{width: 80, height: 80, borderRadius: 18, backgroundColor: bgOn ? T.surface : f.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: bgOn ? T.border : 'rgba(255,255,255,0.15)'}}>
                  <Text style={{fontSize: fs(28), fontWeight: '700', color: bgOn ? T.text : initialOn(f.color), includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center'}}>{getInitials(f.name || '?')}</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={{flex: 1, alignItems: 'center'}}>
              <Text accessibilityRole="header" style={{fontSize: fs(20), fontWeight: '700', color: mc, textAlign: 'center'}} numberOfLines={2}>{f.name}</Text>
              {f.pronouns ? <Text style={{fontSize: fs(13), color: T.dim, textAlign: 'center', marginTop: 2}}>{f.pronouns}</Text> : null}
              {!profileMode && f.role ? <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 2}} numberOfLines={2}>{f.role}</Text> : null}
            </View>
          </View>
          {f.avatar && (
            <TouchableOpacity onPress={openViewPfp} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.viewPfp')} hitSlop={{top: 8, bottom: 8}} style={{alignSelf: 'flex-start', marginBottom: 8}}>
              <Text style={{fontSize: fs(11), color: mc}}>🔍 {t('modal.viewPfp')}</Text>
            </TouchableOpacity>
          )}

          <View style={{flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginBottom: 10}}>
            <View accessible accessibilityLabel={t('a11y.labelValue', {label: profileMode ? t('profile.favoriteColor') : t('modal.color'), value: f.color})} style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: edge, backgroundColor: T.surface}}>
              <View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: f.color, borderWidth: 1, borderColor: bgOn ? T.border : 'rgba(255,255,255,0.2)'}} />
              <Text style={{fontSize: fs(11), color: T.dim, fontFamily: 'monospace'}} accessibilityElementsHidden importantForAccessibility="no">{f.color}</Text>
            </View>
            {f.emoji ? (
              <View accessible accessibilityLabel={t('a11y.labelValue', {label: t('modal.emoji'), value: f.emoji})} style={{paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: edge, backgroundColor: T.surface}}>
                <Text style={{fontSize: fs(14)}} accessibilityElementsHidden importantForAccessibility="no">{f.emoji}</Text>
              </View>
            ) : null}
          </View>

          {!profileMode && (f.tags || []).length > 0 && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10}}>
              {(f.tags || []).map((tag: string) => (
                <View key={tag} style={{paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: bgOn ? T.surface : `${f.color}18`, borderWidth: 1, borderColor: edge}}>
                  <Text style={{fontSize: fs(11), color: mc}}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
          {activeGroups.length > 0 && <GroupChips groups={activeGroups} onInfo={setGroupInfo} bgOn={bgOn} style={{marginBottom: 12}} />}

          {!lockRead && linkedSubs.length > 0 && (
            <View style={{marginBottom: 12}}>
              <Text accessibilityRole="header" style={profileHeading(fs, mc, {marginBottom: 6})}>{t('memberGroups.linkedSubsystems')}</Text>
              <GroupChips groups={linkedSubs} onInfo={setGroupInfo} bgOn={bgOn} />
            </View>
          )}

          {f.description ? (
            <View style={{marginBottom: 14}}>
              <Text accessibilityRole="header" style={profileHeading(fs, mc, {marginBottom: 5})}>{t('modal.descriptionBio')}</Text>
              <View style={{backgroundColor: T.surface, borderWidth: 1, borderColor: edge, borderRadius: 8, padding: 12, minHeight: 80}}>
                <RichDescription text={f.description} members={members} onMentionPress={onMentionPress} />
              </View>
            </View>
          ) : null}
        </>)}

        {!readOnly && (memberTab === 'main' || isNew) && (<>
          <View style={{alignItems: 'center', marginBottom: 16}}>
            <TouchableOpacity onPress={pickAvatar} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.changePfp')}>
              {f.avatar ? (
                <Image source={{uri: f.avatar}} accessibilityElementsHidden importantForAccessibility="no" style={{width: 80, height: 80, borderRadius: 18, borderWidth: 2, borderColor: f.color}} resizeMode="cover" />
              ) : (
                <View style={{width: 80, height: 80, borderRadius: 18, backgroundColor: f.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}}>
                  <Text style={{fontSize: fs(28), fontWeight: '700', color: initialOn(f.color), includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center'}}>{getInitials(f.name || '?')}</Text>
                </View>
              )}
              <View style={{position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: fs(12), color: T.bg}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">📷</Text>
              </View>
            </TouchableOpacity>
            {f.avatar && (
              <TouchableOpacity onPress={openViewPfp} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.viewPfp')} hitSlop={{top: 6, bottom: 6}} style={{marginTop: 6}}>
                <Text style={{fontSize: fs(11), color: T.accent}}>🔍 {t('modal.viewPfp')}</Text>
              </TouchableOpacity>
            )}
            {f.avatar && (
              <TouchableOpacity onPress={removeAvatar} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('modal.removePfp')} hitSlop={{top: 6, bottom: 6}} style={{marginTop: 6}}>
                <Text style={{fontSize: fs(11), color: T.danger}}>{t('modal.removePfp')}</Text>
              </TouchableOpacity>
            )}
            <AvatarLink key={f.id} ownerId={f.id} onLinked={uri => set('avatar', uri)} toggleStyle={{marginTop: 6}} rowStyle={{marginTop: 8, width: '100%'}} />
          </View>

          <TouchableOpacity onPress={async () => {
            const uri = await pickAndSaveImage(src => saveBioImageFromUri(`banner-${f.id}`, src));
            if (uri) set('banner', uri);
          }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('memberProfile.changeBanner')} style={{marginBottom: 10}}>
            <View style={{width: '100%', aspectRatio: 3, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, overflow: 'hidden', backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}>
              {f.banner && !bannerBroken ? <Image source={{uri: f.banner}} onError={() => setBannerBroken(true)} accessibilityElementsHidden importantForAccessibility="no" style={{width: '100%', height: '100%', borderRadius: 8}} resizeMode="cover" /> : <Text style={{fontSize: fs(11), color: T.dim}}>{t('memberProfile.changeBanner')}</Text>}
            </View>
          </TouchableOpacity>
          {f.banner && <TouchableOpacity onPress={() => confirmRemoveImage(t, t('memberProfile.removeBanner'), () => set('banner', undefined))} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('memberProfile.removeBanner')} hitSlop={{top: 10, bottom: 8}} style={{marginBottom: 8}}><Text style={{fontSize: fs(10), color: T.danger}}>{t('memberProfile.removeBanner')}</Text></TouchableOpacity>}

          <Field label={t('modal.name')} value={f.name} onChange={(v: string) => set('name', v)} placeholder={facetMode ? t('modal.facetName') : t('modal.headmateName')} />
          <Field label={t('modal.nickname')} value={f.nickname || ''} onChange={(v: string) => set('nickname', v || undefined)} placeholder={t('modal.nickname')} />
          <Field label={t('modal.pronouns')} value={f.pronouns} onChange={(v: string) => set('pronouns', v)} placeholder={t('modal.pronounsPlaceholder')} />
          {!profileMode && <Field label={t('modal.role')} value={f.role} onChange={(v: string) => set('role', v)} placeholder={t('modal.rolePlaceholder')} />}
          <Field label={t('modal.emoji')} value={f.emoji || ''} onChange={(v: string) => set('emoji', normalizeMemberEmoji(v))} placeholder={t('modal.emojiPlaceholder')} />

          <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{profileMode ? t('profile.favoriteColor') : t('modal.color')}</Text>
          <View style={{marginBottom: 14}}>
            <ColorCarousel value={f.color} onChange={(v: string) => set('color', v)} />
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12}}>
              <TouchableOpacity onPress={() => set('avatarTransparent', !f.avatarTransparent)} activeOpacity={0.8}
                accessibilityRole="switch" accessibilityState={{checked: !!f.avatarTransparent}} accessibilityLabel={t('modal.transparentColor')}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                style={{width: 30, height: 30, borderRadius: 15, backgroundColor: 'transparent', borderWidth: 2, borderColor: f.avatarTransparent ? '#fff' : T.border, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: 15, color: f.avatarTransparent ? '#fff' : T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">⊘</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => set('profileBg', !f.profileBg)} activeOpacity={0.8}
                accessibilityRole="switch" accessibilityState={{checked: !!f.profileBg}} accessibilityLabel={t('modal.palBg')}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                style={{width: 30, height: 30, borderRadius: 15, backgroundColor: f.profileBg && isValidHex(f.color) ? f.color : T.surface, borderWidth: 2, borderColor: f.profileBg ? '#fff' : T.border, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: 12, fontWeight: '500', color: f.profileBg && isValidHex(f.color) ? inkOn(f.color) : T.dim, includeFontPadding: false, textAlign: 'center'}} allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{t('modal.palBgShort')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowPicker(true)} activeOpacity={0.8}
                accessibilityRole="button" accessibilityLabel={t('modal.customColor')}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                style={{width: 30, height: 30, borderRadius: 15, backgroundColor: T.surface, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: 14, fontWeight: '700', color: T.dim}} allowFontScaling={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">#</Text>
              </TouchableOpacity>
            </View>
            <ColorPickerModal visible={showPicker} title={t('modal.customColor')} value={f.color}
              onSave={(hex: string) => { set('color', hex); setShowPicker(false); }}
              onClose={() => setShowPicker(false)} />
          </View>

          {groups.length > 0 && (
            <GroupTreePicker groups={groups} selectedIds={f.groupIds || []} onToggle={togGroup} open={groupOpen} setOpen={setGroupOpen} />
          )}

          {!lockRead && subsystems.length > 0 && (
            <LinkedSubsystemPicker subsystems={subsystems} linkedIds={linkedIds} members={members} memberId={f.id} onToggle={toggleLink} />
          )}

          {!profileMode && (<>
            <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 8})}>{t('modal.memberTags')}</Text>
            <TagEditor tags={f.tags || []} onChange={tags => set('tags', tags)} input={tagInput} setInput={setTagInput} placeholder={t('modal.memberTagPlaceholder')} style={{marginBottom: 14}} />
            {suggestions.length > 0 && (
              <View accessibilityRole="list" accessibilityLabel={t('members.allTags')} style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -6, marginBottom: 14}}>
                {suggestions.map(tag => (
                  <TouchableOpacity key={tagKey(tag)} onPress={() => applyTag(tag)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={t('common.addItem', {name: tag})}
                    hitSlop={{top: 6, bottom: 6}} style={{paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', backgroundColor: T.surface, borderColor: T.border}}>
                    <Text style={{fontSize: fs(12), color: T.dim}}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>)}

          <View style={{marginBottom: 14}}>
            <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 5})}>{t('modal.descriptionBio')}</Text>
            <TouchableOpacity onPress={() => setShowDescEditor(true)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={t('modal.descriptionBio')}
              style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 80}}>
              {f.description ? <RichDescription text={f.description} members={members} onMentionPress={onMentionPress} /> : <Text style={{fontSize: fs(13), color: T.muted}}>{t('modal.descriptionPlaceholder')}</Text>}
            </TouchableOpacity>
          </View>
          <RichTextEditor visible={showDescEditor} title={t('modal.descriptionBio')} initialContent={f.description || ''}
            members={members}
            onSave={(html: string) => {set('description', html); setShowDescEditor(false);}} onClose={() => setShowDescEditor(false)} />

          {!profileMode && (
            <ToggleRow label={t('modal.private')} desc={t('modal.privateDesc')} value={!!f.private} onToggle={() => set('private', !f.private)}
              style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 4, marginBottom: isNew ? 0 : 14}} />
          )}

          {!isNew && (
            <ToggleRow label={t('modal.archiveMember')} desc={isFronting ? t('members.frontingLockMsg') : t('modal.archiveDesc')} descColor={isFronting ? T.danger : undefined}
              value={!!f.archived} onToggle={() => set('archived', !f.archived)} disabled={isFronting}
              style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 4}} />
          )}
        </>)}

        {(memberTab === 'fields' || (readOnly && !profileMode)) && !isNew && (
          <View>
            <MemberFieldsPanel fieldDefs={fieldDefs} values={f.customFields} readOnly={readOnly} setFieldVal={setFieldVal} pickImage={pickCfImage}
              markdownEditFieldId={markdownEditFieldId} setMarkdownEditFieldId={setMarkdownEditFieldId} members={members} onMentionPress={onMentionPress} mc={mc} edge={edge} />
          </View>
        )}

        {(memberTab === 'connections' || (readOnly && !profileMode)) && !isNew && (!readOnly || connRows.length > 0 || onShowOnMap) && (
          <MemberConnectionsPanel rows={connRows} readOnly={readOnly} memberId={f.id} onShowOnMap={onShowOnMap} onMentionPress={onMentionPress} bgOn={bgOn} mc={mc} edge={edge} />
        )}

        {visible && <ImageCropHost />}
        <AvatarViewer visible={viewPfp && !!f.avatar} uri={pfpFull || f.avatar} name={f.name || '?'} onClose={() => setViewPfp(false)} />

        <GroupInfoDialog group={groupInfo} onClose={() => setGroupInfo(null)} />

        <CloneDialog visible={showClone} sel={cloneSel} setSel={setCloneSel} onClone={doClone} onCancel={() => setShowClone(false)} />
      </Sheet>
    </ThemeProvider>
  );
};
