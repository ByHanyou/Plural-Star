// src/screens/MembersScreen.tsx
import React, {useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Image, Alert} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Fonts, PALETTE} from '../theme';
import {Member, MemberGroup, FrontState, FrontTierKey, getInitials, allFrontMemberIds, uid, isValidHex, normalizeHex} from '../utils';
import {RichText} from '../components/MarkdownRenderer';

const Avatar = ({member, size = 40, pulse = false, T}: {member?: Member | null; size?: number; pulse?: boolean; T: any}) => {
  if (member?.avatar) {
    return <Image source={{uri: member.avatar}} style={{width: size, height: size, borderRadius: size / 2,
      shadowColor: pulse ? member.color : 'transparent', shadowOpacity: pulse ? 0.5 : 0, shadowRadius: pulse ? 8 : 0, elevation: pulse ? 4 : 0}} />;
  }
  return (
    <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: member?.color || T.toggleOff, alignItems: 'center', justifyContent: 'center',
      shadowColor: pulse ? member?.color : 'transparent', shadowOpacity: pulse ? 0.5 : 0, shadowRadius: pulse ? 8 : 0, elevation: pulse ? 4 : 0}}>
      <Text style={{fontSize: size * 0.35, fontWeight: '700', color: 'rgba(0,0,0,0.75)'}}>{getInitials(member?.name || '?')}</Text>
    </View>
  );
};

const getMemberTier = (id: string, front: FrontState | null): FrontTierKey | null => {
  if (!front) return null;
  if (front.primary.memberIds.includes(id)) return 'primary';
  if (front.coFront.memberIds.includes(id)) return 'coFront';
  if (front.coConscious.memberIds.includes(id)) return 'coConscious';
  return null;
};

const TIER_BADGE_KEY: Record<FrontTierKey, {i18nKey: string; colorKey: string}> = {
  primary: {i18nKey: 'tier.primaryBadge', colorKey: 'accent'},
  coFront: {i18nKey: 'tier.coFrontBadge', colorKey: 'info'},
  coConscious: {i18nKey: 'tier.coConBadge', colorKey: 'success'},
};

interface Props {
  theme: any; members: Member[]; front: FrontState | null; groups: MemberGroup[];
  onAdd: () => void; onEdit: (member: Member) => void; onSaveGroups: (groups: MemberGroup[]) => void;
}

export const MembersScreen = ({theme: T, members, front, groups, onAdd, onEdit, onSaveGroups}: Props) => {
  const {t} = useTranslation();
  const [memberTab, setMemberTab] = useState<'active' | 'archived'>('active');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showManageGroups, setShowManageGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(PALETTE[0]);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');

  const tabMembers = members.filter(m => memberTab === 'archived' ? m.archived : !m.archived);
  const allFrontIds = new Set(allFrontMemberIds(front));
  const allTags = [...new Set(tabMembers.flatMap(m => m.tags || []))].sort();
  const archivedCount = members.filter(m => m.archived).length;

  const filtered = tabMembers.filter(m => {
    const nameMatch = !query || m.name.toLowerCase().includes(query.toLowerCase()) || m.role?.toLowerCase().includes(query.toLowerCase());
    const groupMatch = !activeGroup || (m.groupIds || []).includes(activeGroup);
    const tagMatch = !activeTag || (m.tags || []).includes(activeTag);
    return nameMatch && groupMatch && tagMatch;
  });

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name || groups.find(g => g.name.toLowerCase() === name.toLowerCase())) return;
    onSaveGroups([...groups, {id: uid(), name, color: newGroupColor}]);
    setNewGroupName('');
  };

  const deleteGroup = (id: string) => {
    Alert.alert(t('memberGroups.deleteGroup'), t('memberGroups.deleteGroupMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => onSaveGroups(groups.filter(g => g.id !== id))},
    ]);
  };

  const renameGroup = (id: string) => {
    const name = editGroupName.trim();
    if (!name) return;
    onSaveGroups(groups.map(g => g.id === id ? {...g, name} : g));
    setEditGroupId(null); setEditGroupName('');
  };

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.headerRow}>
        <Text style={[s.heading, {color: T.text}]}>{t('members.title')}</Text>
        <View style={{flexDirection: 'row', gap: 6}}>
          <TouchableOpacity onPress={() => setShowManageGroups(!showManageGroups)} activeOpacity={0.7}
            style={[s.addBtn, {backgroundColor: showManageGroups ? `${T.info}18` : T.surface, borderColor: showManageGroups ? `${T.info}50` : T.border}]}>
            <Text style={{fontSize: 12, fontWeight: '500', color: showManageGroups ? T.info : T.dim}}>{t('memberGroups.manage')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onAdd} activeOpacity={0.7} style={[s.addBtn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
            <Text style={{fontSize: 13, fontWeight: '500', color: T.accent}}>{t('members.add')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{flexDirection: 'row', gap: 0, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: T.border}}>
        {(['active', 'archived'] as const).map(tab => (
          <TouchableOpacity key={tab} onPress={() => {setMemberTab(tab); setQuery(''); setActiveGroup(null); setActiveTag(null);}} activeOpacity={0.7}
            style={{paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: memberTab === tab ? T.accent : 'transparent'}}>
            <Text style={{fontSize: 13, color: memberTab === tab ? T.accent : T.dim, fontWeight: memberTab === tab ? '600' : '400'}}>
              {tab === 'active' ? t('members.active') : `${t('members.archived')}${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Manage Groups Section */}
      {showManageGroups && (
        <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
          <Text style={{fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: T.dim, fontWeight: '600', marginBottom: 10}}>{t('memberGroups.title')}</Text>
          {groups.map(g => (
            <View key={g.id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8}}>
              <View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: g.color || T.accent}} />
              {editGroupId === g.id ? (
                <View style={{flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center'}}>
                  <TextInput value={editGroupName} onChangeText={setEditGroupName} autoFocus style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, fontSize: 13}} onSubmitEditing={() => renameGroup(g.id)} returnKeyType="done" />
                  <TouchableOpacity onPress={() => renameGroup(g.id)}><Text style={{color: T.success, fontSize: 14}}>✓</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditGroupId(null)}><Text style={{color: T.dim, fontSize: 12}}>✕</Text></TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={{flex: 1, fontSize: 14, color: T.text, fontWeight: '500'}}>{g.name}</Text>
                  <Text style={{fontSize: 11, color: T.muted}}>{members.filter(m => (m.groupIds || []).includes(g.id)).length}</Text>
                  <TouchableOpacity onPress={() => {setEditGroupId(g.id); setEditGroupName(g.name);}} style={{padding: 4}}><Text style={{fontSize: 12, color: T.dim}}>✎</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteGroup(g.id)} style={{padding: 4}}><Text style={{fontSize: 12, color: T.danger}}>✕</Text></TouchableOpacity>
                </>
              )}
            </View>
          ))}
          <View style={{flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4}}>
            <TouchableOpacity onPress={() => { const idx = PALETTE.indexOf(newGroupColor); setNewGroupColor(PALETTE[(idx + 1) % PALETTE.length]); }}
              style={{width: 28, height: 28, borderRadius: 14, backgroundColor: newGroupColor, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)'}} />
            <TextInput value={newGroupName} onChangeText={setNewGroupName} placeholder={t('memberGroups.addPlaceholder')} placeholderTextColor={T.muted}
              style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13}} onSubmitEditing={addGroup} returnKeyType="done" />
            <TouchableOpacity onPress={addGroup} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
              <Text style={{fontSize: 12, fontWeight: '500', color: T.accent}}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Group filter chips */}
      {groups.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6}}>
          <View style={{flexDirection: 'row', gap: 6}}>
            <TouchableOpacity onPress={() => setActiveGroup(null)} activeOpacity={0.7}
              style={[s.chip, {backgroundColor: !activeGroup ? `${T.accent}18` : T.surface, borderColor: !activeGroup ? `${T.accent}50` : T.border}]}>
              <Text style={{fontSize: 11, color: !activeGroup ? T.accent : T.dim, fontWeight: !activeGroup ? '600' : '400'}}>{t('memberGroups.allGroups')}</Text>
            </TouchableOpacity>
            {groups.map(g => (
              <TouchableOpacity key={g.id} onPress={() => setActiveGroup(activeGroup === g.id ? null : g.id)} activeOpacity={0.7}
                style={[s.chip, {backgroundColor: activeGroup === g.id ? `${g.color || T.accent}18` : T.surface, borderColor: activeGroup === g.id ? `${g.color || T.accent}50` : T.border}]}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
                  <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: g.color || T.accent}} />
                  <Text style={{fontSize: 11, color: activeGroup === g.id ? (g.color || T.accent) : T.dim, fontWeight: activeGroup === g.id ? '600' : '400'}}>{g.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 8}}>
          <View style={{flexDirection: 'row', gap: 6}}>
            <TouchableOpacity onPress={() => setActiveTag(null)} activeOpacity={0.7}
              style={[s.chip, {backgroundColor: !activeTag ? `${T.info}18` : T.surface, borderColor: !activeTag ? `${T.info}50` : T.border}]}>
              <Text style={{fontSize: 11, color: !activeTag ? T.info : T.dim, fontWeight: !activeTag ? '600' : '400'}}>{t('members.allTags')}</Text>
            </TouchableOpacity>
            {allTags.map(tag => (
              <TouchableOpacity key={tag} onPress={() => setActiveTag(activeTag === tag ? null : tag)} activeOpacity={0.7}
                style={[s.chip, {backgroundColor: activeTag === tag ? `${T.info}18` : T.surface, borderColor: activeTag === tag ? `${T.info}50` : T.border}]}>
                <Text style={{fontSize: 11, color: activeTag === tag ? T.info : T.dim, fontWeight: activeTag === tag ? '600' : '400'}}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Search */}
      {tabMembers.length > 3 && (
        <TextInput value={query} onChangeText={setQuery} placeholder={t('members.search')} placeholderTextColor={T.muted}
          style={[s.search, {backgroundColor: T.surface, color: T.text, borderColor: T.border}]} />
      )}

      {tabMembers.length === 0 ? (
        <View style={s.empty}>
          <Text style={{fontSize: 36, opacity: 0.4, marginBottom: 12}}>◇</Text>
          <Text style={{fontSize: 13, color: T.dim, textAlign: 'center', marginBottom: 16}}>{memberTab === 'archived' ? t('members.noArchived') : t('members.noMembers')}</Text>
          {memberTab === 'active' && (
            <TouchableOpacity onPress={onAdd} activeOpacity={0.7} style={[s.addBtn, {backgroundColor: T.accentBg, borderColor: `${T.accent}40`}]}>
              <Text style={{fontSize: 13, fontWeight: '500', color: T.accent}}>{t('members.addMember')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={{gap: 8}}>
          {filtered.map(m => {
            const tier = getMemberTier(m.id, front);
            const isFronting = allFrontIds.has(m.id);
            const badgeCfg = tier ? TIER_BADGE_KEY[tier] : null;
            const badgeColor = badgeCfg ? (T as any)[badgeCfg.colorKey] || T.accent : T.accent;
            const memberGroups = groups.filter(g => (m.groupIds || []).includes(g.id));
            return (
              <TouchableOpacity key={m.id} activeOpacity={0.75} style={[s.card, {backgroundColor: T.card, borderColor: isFronting ? `${m.color}60` : T.border}]}
                onPress={() => setExpanded(expanded === m.id ? null : m.id)}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 14}}>
                  <Avatar member={m} size={44} pulse={isFronting} T={T} />
                  <View style={{flex: 1, overflow: 'hidden'}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2}}>
                      <Text style={{fontSize: 15, fontWeight: '500', color: T.text}}>{m.name}</Text>
                      {badgeCfg && (<View style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${badgeColor}18`, borderWidth: 1, borderColor: `${badgeColor}35`}}><Text style={{fontSize: 10, color: badgeColor, fontWeight: '500'}}>{t(badgeCfg.i18nKey)}</Text></View>)}
                    </View>
                    <Text style={{fontSize: 12, color: T.dim}}>{[m.pronouns, m.role].filter(Boolean).join(' · ') || t('members.noDetails')}</Text>
                    {memberGroups.length > 0 && (
                      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4}}>
                        {memberGroups.map(g => (<View key={g.id} style={{flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: `${g.color || T.accent}15`}}><View style={{width: 5, height: 5, borderRadius: 2.5, backgroundColor: g.color || T.accent}} /><Text style={{fontSize: 10, color: g.color || T.accent}}>{g.name}</Text></View>))}
                      </View>
                    )}
                    {m.description && expanded !== m.id ? <Text style={{fontSize: 11, color: T.muted, marginTop: 3}} numberOfLines={1}>{m.description}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => onEdit(m)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}><Text style={{fontSize: 14, color: T.muted}}>✎</Text></TouchableOpacity>
                </View>
                {expanded === m.id && (
                  <View style={{marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.border}}>
                    {(m.tags || []).length > 0 && (
                      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: m.description ? 10 : 0}}>
                        {(m.tags || []).map(tag => (<View key={tag} style={{paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: `${T.info}12`, borderWidth: 1, borderColor: `${T.info}30`}}><Text style={{fontSize: 11, color: T.info}}>{tag}</Text></View>))}
                      </View>
                    )}
                    {m.description ? <RichText text={m.description} T={T} /> : null}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

const s = StyleSheet.create({
  content: {padding: 16, paddingBottom: 32},
  headerRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14},
  heading: {fontFamily: Fonts.display, fontSize: 26, fontWeight: '600', fontStyle: 'italic'},
  addBtn: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1},
  search: {borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, fontSize: 13, marginBottom: 14},
  empty: {alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24},
  card: {borderRadius: 12, borderWidth: 1, padding: 14},
  chip: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1},
});
