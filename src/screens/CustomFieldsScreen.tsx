import React, {useState, useEffect, useRef} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, AccessibilityInfo, findNodeHandle, LayoutChangeEvent} from 'react-native';
import {KeyboardAwareScrollView, KeyboardStickyView} from 'react-native-keyboard-controller';
import {Text, TextInput} from '../components/AppText';
import {useDragReorder} from '../hooks/useDragReorder';
import {DragHandle, ReorderLockButton} from '../components/DragHandle';
import {useTranslation} from 'react-i18next';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {CustomFieldDef, CustomFieldType, CUSTOM_FIELD_TYPES, customFieldTypeKey, moveInList, stripCustomField, uid, withSortOrder} from '../utils';
import {reportSaveError} from '../utils/saveError';
import {announceMove} from '../utils/announce';
import {logError} from '../utils/log';
import {store, KEYS} from '../storage';
import {NetworkManager} from '../network/NetworkManager';
import {useAppStore} from '../store/appStore';
import {saveMembers} from '../store/actions';
import {reloadAll} from '../app/startup/loadAll';

const FIELD_TYPE_ICON: Record<CustomFieldType, string> = {
  text: 'Tt', markdown: '¶', image: '🖼', color: '🎨', date: '📅', month: '📅', year: '📅', monthYear: '📅',
  timestamp: '🕐', monthDay: '📅', dateRange: '📅', number: '#', toggle: '☑',
};

const FIELD_TYPES = CUSTOM_FIELD_TYPES.map(type => ({type, icon: FIELD_TYPE_ICON[type]}));

export const CustomFieldsScreen = () => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CustomFieldType>('text');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [barH, setBarH] = useState(0);
  const onBarLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setBarH(prev => (Math.abs(prev - h) > 1 ? h : prev));
  };
  const clearance = Math.max(barH, 64) + 24;
  const [editId, setEditId] = useState<string | null>(null);
  const [retypeId, setRetypeId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [reorderOn, setReorderOn] = useState(false);

  const onDropField = (_key: string, from: number, to: number) => {
    const updated = moveInList(fields, from, to);
    save(withSortOrder(updated));
    announceMove(to, updated.length, updated[to - 1]?.name, false);
  };
  const {drag, dragging, registerHeight, makeHandlePanHandlers} = useDragReorder({enabled: reorderOn, onDrop: onDropField});

  useEffect(() => {
    const load = () => { store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []).then(d => setFields(d || [])).catch(e => logError('customFields', e)); };
    load();
    return NetworkManager.onSyncApplied(load);
  }, []);

  const save = async (updated: CustomFieldDef[]) => {
    setFields(updated);
    await store.set(KEYS.customFieldDefs, updated).catch(reportSaveError);
    reloadAll();
  };

  const addField = () => {
    if (!newName.trim()) return;
    const def: CustomFieldDef = {id: uid(), name: newName.trim(), type: newType, sortOrder: fields.length};
    save([...fields, def]);
    setNewName(''); setNewType('text');
  };

  const deleteField = (id: string) => {
    Alert.alert(t('customFields.deleteField'), t('customFields.deleteFieldMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        save(fields.filter(f => f.id !== id));
        const cleaned = stripCustomField(useAppStore.getState().members, id);
        if (cleaned) saveMembers(cleaned).catch(reportSaveError);
      }},
    ]);
  };

  const patchField = (id: string, patch: Partial<CustomFieldDef>) => save(fields.map(f => (f.id === id ? {...f, ...patch} : f)));

  const renameField = (id: string) => {
    if (!editName.trim()) return;
    patchField(id, {name: editName.trim()});
    setEditId(null);
  };

  const toggleMarkdown = (fd: CustomFieldDef) => patchField(fd.id, {markdown: !fd.markdown});

  const moveBtnRefs = useRef<Record<string, View | null>>({});

  const moveField = (id: string, direction: 'up' | 'down') => {
    const idx = fields.findIndex(f => f.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= fields.length) return;
    save(withSortOrder(moveInList(fields, idx, swapIdx)));
    announceMove(swapIdx, fields.length, fields[swapIdx].name, direction === 'up');
    setTimeout(() => {
      const node = moveBtnRefs.current[id];
      const tag = node ? findNodeHandle(node) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 100);
  };

  const typeLabel = (type: CustomFieldType) => t(customFieldTypeKey(type));

  return (
    <View style={{flex: 1}}>
      <KeyboardAwareScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: clearance}} scrollEnabled={!dragging} bottomOffset={clearance}>
        {fields.length > 1 && (
          <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10}}>
            <ReorderLockButton on={reorderOn} onToggle={() => setReorderOn(v => !v)} />
          </View>
        )}
        {fields.length === 0 && (
          <View style={{alignItems: 'center', paddingVertical: 48}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('customFields.noFields')}</Text>
          </View>
        )}

        {fields.map((fd, i) => (
          <View
            key={fd.id}
            onLayout={e => registerHeight(fd.id, e.nativeEvent.layout.height + 10)}
            style={{
              backgroundColor: T.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: dragging && drag.key !== fd.id && drag.target === i ? T.accent : T.border,
              padding: 14,
              marginBottom: 10,
              ...(drag.key === fd.id ? {transform: [{translateY: drag.dy}], zIndex: 10, elevation: 6} : null),
            }}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <DragHandle active={reorderOn} panHandlers={makeHandlePanHandlers(fd.id, () => fields.map(f => f.id))} name={fd.name}
                position={i + 1} count={fields.length}
                onStep={dir => moveField(fd.id, dir === 1 ? 'down' : 'up')} />
              <View style={{alignItems: 'center', gap: 2}}>
                <TouchableOpacity
                  ref={(el) => { moveBtnRefs.current[fd.id] = el; }}
                  onPress={() => moveField(fd.id, 'up')}
                  disabled={i === 0}
                  hitSlop={{top: 10, bottom: 6, left: 12, right: 12}}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={i === 0 ? t('members.moveUpItem', {name: fd.name}) : `${t('members.moveUpItem', {name: fd.name})}, ${t('members.moveAbove', {name: fields[i - 1].name})}`}
                  accessibilityState={{disabled: i === 0}}
                  style={{padding: 3}}>
                  <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(14), color: i === 0 ? T.border : T.muted, lineHeight: fs(14)}}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveField(fd.id, 'down')}
                  disabled={i === fields.length - 1}
                  hitSlop={{top: 6, bottom: 10, left: 12, right: 12}}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={i === fields.length - 1 ? t('members.moveDownItem', {name: fd.name}) : `${t('members.moveDownItem', {name: fd.name})}, ${t('members.moveBelow', {name: fields[i + 1].name})}`}
                  accessibilityState={{disabled: i === fields.length - 1}}
                  style={{padding: 3}}>
                  <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(14), color: i === fields.length - 1 ? T.border : T.muted, lineHeight: fs(14)}}>▼</Text>
                </TouchableOpacity>
              </View>
              <View style={{flex: 1}}>
                {editId === fd.id ? (
                  <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                    <TextInput value={editName} onChangeText={setEditName} autoFocus accessibilityLabel={t('customFields.fieldName')}
                      style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: fs(14)}}
                      onSubmitEditing={() => renameField(fd.id)} />
                    <TouchableOpacity hitSlop={{top: 12, bottom: 12, left: 8, right: 12}} onPress={() => renameField(fd.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')}>
                      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(16), color: T.accent}}>✓</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity hitSlop={{top: 13, bottom: 13}} onPress={() => {setEditId(fd.id); setEditName(fd.name);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${fd.name}, ${t('common.edit')}`}>
                    <Text style={{fontSize: fs(15), color: T.text, fontWeight: '500'}}>{fd.name}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity hitSlop={{top: 12, bottom: 12, left: 10, right: 12}} onPress={() => deleteField(fd.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.deleteItem', {name: fd.name})}>
                <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(18), color: T.danger}}>🗑</Text>
              </TouchableOpacity>
            </View>

            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8}}>
              <Text style={{fontSize: fs(11), color: T.dim}}>{t('customFields.fieldType')}</Text>
              <TouchableOpacity onPress={() => setRetypeId(retypeId === fd.id ? null : fd.id)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{expanded: retypeId === fd.id}}
                accessibilityLabel={`${t('customFields.fieldType')} - ${fd.name}`} accessibilityValue={{text: typeLabel(fd.type)}}
                hitSlop={{top: 8, bottom: 11}} style={{backgroundColor: T.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: retypeId === fd.id ? `${T.accent}60` : T.border}}>
                <Text style={{fontSize: fs(12), color: T.muted}}>{typeLabel(fd.type)} ▾</Text>
              </TouchableOpacity>
            </View>
            {retypeId === fd.id && (
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8}}>
                {FIELD_TYPES.map(ft => (
                  <TouchableOpacity key={ft.type} activeOpacity={0.7}
                    onPress={() => { patchField(fd.id, {type: ft.type}); setRetypeId(null); }}
                    accessibilityRole="menuitem" accessibilityState={{selected: fd.type === ft.type}} accessibilityLabel={typeLabel(ft.type)}
                    hitSlop={{top: 6, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                      backgroundColor: fd.type === ft.type ? T.accentBg : T.surface, borderColor: fd.type === ft.type ? `${T.accent}50` : T.border}}>
                    <Text style={{fontSize: fs(11), color: fd.type === ft.type ? T.accent : T.dim}}>{typeLabel(ft.type)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {(fd.type === 'text' || fd.type === 'markdown') && (
              <TouchableOpacity onPress={() => toggleMarkdown(fd)} activeOpacity={0.7} accessibilityRole="checkbox" accessibilityState={{checked: !!fd.markdown}} accessibilityLabel={t('customFields.markdownSupport')} hitSlop={{top: 8, bottom: 12}} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8}}>
                <Text style={{fontSize: fs(16), color: fd.markdown ? T.accent : T.muted}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{fd.markdown ? '☑' : '☐'}</Text>
                <Text style={{fontSize: fs(12), color: T.dim}}>{t('customFields.markdownSupport')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </KeyboardAwareScrollView>

      <KeyboardStickyView style={{position: 'absolute', bottom: 0, left: 0, right: 0}}>
      <View onLayout={onBarLayout} style={{backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: T.border, padding: 12}}>
        <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
          <TextInput value={newName} onChangeText={setNewName} accessibilityLabel={t('customFields.fieldName')} placeholder={t('customFields.fieldName')} placeholderTextColor={T.muted}
            style={{flex: 1, backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}}
            onSubmitEditing={addField} />
          <TouchableOpacity onPress={() => setShowTypePicker(!showTypePicker)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{expanded: showTypePicker}} accessibilityLabel={t('customFields.fieldType')} accessibilityValue={{text: typeLabel(newType)}}
            hitSlop={{top: 6, bottom: 6}} style={{backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>{typeLabel(newType)} ▾</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={addField} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('common.add')}
            hitSlop={{top: 6, bottom: 6}} style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9}}>
            <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>+</Text>
          </TouchableOpacity>
        </View>

        {showTypePicker && (
          <ScrollView style={{maxHeight: 240, marginTop: 8}} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, overflow: 'hidden'}}>
            {FIELD_TYPES.map(ft => (
              <TouchableOpacity key={ft.type} onPress={() => {setNewType(ft.type); setShowTypePicker(false);}} activeOpacity={0.7}
                accessibilityRole="menuitem" accessibilityState={{selected: newType === ft.type}} accessibilityLabel={typeLabel(ft.type)}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border,
                  backgroundColor: newType === ft.type ? `${T.accent}15` : 'transparent'}}>
                <Text style={{fontSize: fs(16), width: 24, textAlign: 'center'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{ft.icon}</Text>
                <Text style={{fontSize: fs(13), color: newType === ft.type ? T.accent : T.text, fontWeight: newType === ft.type ? '600' : '400'}}>{typeLabel(ft.type)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
      </KeyboardStickyView>
    </View>
  );
};
