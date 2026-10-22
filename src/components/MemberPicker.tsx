import React, {useMemo, useState} from 'react';
import {View, TouchableOpacity, ScrollView, Text as RNText} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from './AppText';
import {Avatar} from './Avatar';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {Member, uniqueTags} from '../utils';
import {ALL_PICKER_KINDS, PICKER_KIND_ORDER, PICKER_RESULTS_MAX, PickerAnnotation, PickerKinds, PickerPool, activePickerPools, pickerGroups, pickerKindLabel, selectionSet} from '../picker/memberPicker';

export const KindToggles = ({kinds, setKinds}: {kinds: PickerKinds; setKinds: (k: PickerKinds) => void}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8}}>
      {PICKER_KIND_ORDER.map(kind => {
        const on = kinds[kind];
        const label = pickerKindLabel(kind, t);
        return (
          <TouchableOpacity key={kind} onPress={() => setKinds({...kinds, [kind]: !on})} activeOpacity={0.7}
            accessibilityRole="checkbox" accessibilityState={{checked: on}} accessibilityLabel={label}
            hitSlop={{top: 6, bottom: 6, left: 4, right: 4}}
            style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <View style={{width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: on ? T.accent : T.border, backgroundColor: on ? T.accent : T.surface, overflow: 'hidden'}}>
              {on && <RNText style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, fontSize: 12, lineHeight: 15, color: T.bg, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</RNText>}
            </View>
            <Text style={{fontSize: fs(12), color: on ? T.text : T.dim}}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export interface MemberPickerProps {
  pools: PickerPool[];
  selected?: Iterable<string> | string | null;
  onPick: (member: Member) => void;
  multi?: boolean;
  hideSelected?: boolean;
  requireSearch?: boolean;
  maxResults?: number;
  kindToggles?: boolean;
  tagFilter?: boolean;
  selectedChips?: boolean;
  showSearch?: boolean;
  search?: string;
  onSearch?: (value: string) => void;
  searchLabel?: string;
  hint?: string;
  emptyLabel?: string;
  annotate?: (member: Member) => PickerAnnotation | null | undefined;
  orderRows?: (rows: Member[], pool: PickerPool) => Member[];
  keepOrder?: boolean;
  variant?: 'rows' | 'chips';
  chipAvatar?: boolean;
  rowSize?: number;
  listMaxHeight?: number;
  autoFocus?: boolean;
  clearOnPick?: boolean;
}

export const MemberPicker = ({
  pools, selected, onPick, multi = false, hideSelected = false, requireSearch = false, maxResults = PICKER_RESULTS_MAX,
  kindToggles = false, tagFilter = false, selectedChips = false, showSearch = true, search, onSearch, searchLabel, hint, emptyLabel,
  annotate, orderRows, keepOrder = false, variant = 'rows', chipAvatar = false, rowSize = 24, listMaxHeight, autoFocus = false, clearOnPick = true,
}: MemberPickerProps) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [ownSearch, setOwnSearch] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [kinds, setKinds] = useState<PickerKinds>(ALL_PICKER_KINDS);
  const query = (search ?? ownSearch).trim();
  const setQuery = (value: string) => {
    if (onSearch) onSearch(value);
    if (search === undefined) setOwnSearch(value);
  };
  const selectedSet = useMemo(() => selectionSet(selected), [selected]);
  const allMembers = useMemo(() => pools.flatMap(p => p.members), [pools]);
  const hasKinds = kindToggles && pools.some(p => !!p.kind);
  const activePools = useMemo(() => activePickerPools(pools, hasKinds ? kinds : null), [pools, hasKinds, kinds]);

  const allTags = useMemo(() => (tagFilter ? uniqueTags(allMembers.flatMap(m => m.tags || [])) : []), [allMembers, tagFilter]);

  const {grouped, total, shown} = useMemo(
    () => pickerGroups(activePools, {query, selected: selectedSet, hideSelected, tag: filterTag, maxResults, orderRows, keepOrder}),
    [activePools, query, filterTag, hideSelected, selectedSet, maxResults, orderRows, keepOrder],
  );

  const pick = (m: Member) => {
    onPick(m);
    if (clearOnPick && query) setQuery('');
  };

  const showResults = !showSearch || !requireSearch || query.length > 0 || !!filterTag;
  const showHeaders = pools.length > 1;
  const selectedMembers = selectedChips ? allMembers.filter(m => selectedSet.has(m.id)) : [];
  const headerStyle = {fontSize: fs(9), letterSpacing: 1, textTransform: 'uppercase' as const, color: T.dim, fontWeight: '600' as const};
  const noMatches = emptyLabel || t('mention.noMembers');
  const more = total > shown ? <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic'}}>{t('members.refineSearch', {count: total - shown})}</Text> : null;

  const row = (m: Member) => {
    const isSelected = selectedSet.has(m.id);
    const note = annotate ? annotate(m) : null;
    return (
      <TouchableOpacity key={m.id} onPress={() => pick(m)} activeOpacity={0.7}
        accessibilityRole={multi ? 'checkbox' : 'button'}
        accessibilityState={multi ? {checked: isSelected} : {selected: isSelected}}
        accessibilityLabel={[m.name, m.pronouns, note?.label].filter(Boolean).join(', ')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border,
          backgroundColor: isSelected ? `${m.color}12` : 'transparent', opacity: note?.dim && !isSelected ? 0.45 : 1}}>
        <Avatar member={m} size={rowSize} />
        <Text style={{flex: 1, minWidth: 0, fontSize: fs(13), color: isSelected ? m.color : T.text, fontWeight: isSelected ? '600' : '400'}} numberOfLines={1}>{m.name}</Text>
        {m.pronouns ? <Text style={{flexShrink: 1, fontSize: fs(11), color: T.muted}} numberOfLines={1}>{m.pronouns}</Text> : null}
        {note?.label && !isSelected ? <Text style={{flexShrink: 0, fontSize: fs(10), color: T.muted, fontStyle: 'italic'}}>{note.label}</Text> : null}
        {isSelected ? <Text style={{color: m.color, fontWeight: '700'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✓</Text> : null}
      </TouchableOpacity>
    );
  };

  const chip = (m: Member) => {
    const isSelected = selectedSet.has(m.id);
    return (
      <TouchableOpacity key={m.id} onPress={() => pick(m)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={m.name} accessibilityState={{selected: isSelected}}
        hitSlop={{top: 8, bottom: 8}} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
          backgroundColor: isSelected ? `${m.color}20` : T.surface, borderColor: isSelected ? `${m.color}50` : T.border}}>
        {chipAvatar ? <Avatar member={m} size={18} /> : null}
        <Text style={{fontSize: fs(11), color: isSelected ? m.color : T.text}}>{m.name}</Text>
      </TouchableOpacity>
    );
  };

  const results = grouped.length === 0 ? (
    <Text accessibilityLiveRegion="polite" style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 10}}>{noMatches}</Text>
  ) : variant === 'chips' ? (
    <>
      {grouped.map(({pool, rows}, gi) => (
        <View key={`${gi}-${pool.label}`} style={{marginBottom: 8}}>
          {showHeaders && !!pool.label && <Text accessibilityRole="header" style={{...headerStyle, marginBottom: 4}}>{pool.label}</Text>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow: 0}}>
            <View style={{flexDirection: 'row', gap: 6}}>{rows.map(chip)}</View>
          </ScrollView>
        </View>
      ))}
      {more}
    </>
  ) : (
    <View style={{borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.card, overflow: 'hidden'}}>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={listMaxHeight ? {maxHeight: listMaxHeight} : undefined} scrollEnabled={!!listMaxHeight}>
        {grouped.map(({pool, rows}, gi) => (
          <View key={`${gi}-${pool.label}`}>
            {showHeaders && !!pool.label && <Text accessibilityRole="header" style={{...headerStyle, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, backgroundColor: T.surface}}>{pool.label}</Text>}
            {rows.map(row)}
          </View>
        ))}
        {more && <View style={{padding: 8, alignItems: 'center'}}>{more}</View>}
      </ScrollView>
    </View>
  );

  return (
    <View>
      {selectedMembers.length > 0 && (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
          {selectedMembers.map(m => (
            <TouchableOpacity key={m.id} onPress={() => pick(m)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={t('common.removeItem', {name: m.name})}
              hitSlop={{top: 6, bottom: 10}} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${m.color}20`, borderWidth: 1, borderColor: `${m.color}50`}}>
              <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: m.color}} />
              <Text style={{fontSize: fs(12), fontWeight: '500', color: m.color}}>{m.name}</Text>
              <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(10), color: m.color, marginLeft: 2}}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 6, flexGrow: 0}}>
          <View style={{flexDirection: 'row', gap: 5}}>
            {allTags.map(tag => (
              <TouchableOpacity key={tag} onPress={() => setFilterTag(filterTag === tag ? null : tag)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{selected: filterTag === tag}} accessibilityLabel={tag}
                hitSlop={{top: 12, bottom: 12}} style={{paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
                  backgroundColor: filterTag === tag ? `${T.info}18` : T.surface, borderColor: filterTag === tag ? `${T.info}50` : T.border}}>
                <Text style={{fontSize: fs(10), color: filterTag === tag ? T.info : T.dim}}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {showSearch && (
        <TextInput value={search ?? ownSearch} onChangeText={setQuery} accessibilityLabel={searchLabel || t('common.search')} placeholder={searchLabel || t('common.search')} placeholderTextColor={T.muted}
          autoFocus={autoFocus} autoCorrect={false} autoComplete="off" spellCheck={false} textContentType="none"
          style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: fs(13), marginBottom: 6}} />
      )}

      {hasKinds && <KindToggles kinds={kinds} setKinds={setKinds} />}

      {showResults ? results : null}

      {!showResults && hint && selectedSet.size === 0 && (
        <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 6}}>{hint}</Text>
      )}
    </View>
  );
};
