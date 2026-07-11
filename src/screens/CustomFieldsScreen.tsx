import React, {useState, useEffect, useRef} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, AccessibilityInfo, findNodeHandle} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';
import {useTranslation} from 'react-i18next';
import {Fonts, fontScale, ThemeColors} from '../theme';
import {CustomFieldDef, CustomFieldType, uid} from '../utils';
import {store, KEYS} from '../storage';

const FIELD_TYPES: {type: CustomFieldType; label: string; icon: string}[] = [
  {type: 'text', label: 'Text', icon: 'Tt'},
  {type: 'markdown', label: 'Rich Text', icon: '¶'},
  {type: 'image', label: 'Image', icon: '🖼'},
  {type: 'color', label: 'Color', icon: '🎨'},
  {type: 'date', label: 'Date', icon: '📅'},
  {type: 'month', label: 'Month', icon: '📅'},
  {type: 'year', label: 'Year', icon: '📅'},
  {type: 'monthYear', label: 'Month + Year', icon: '📅'},
  {type: 'timestamp', label: 'Timestamp', icon: '🕐'},
  {type: 'monthDay', label: 'Month + Day', icon: '📅'},
  {type: 'dateRange', label: 'Date Range', icon: '📅'},
  {type: 'number', label: 'Number', icon: '#'},
  {type: 'toggle', label: 'Toggle', icon: '☑'},
];

interface Props {
  theme: ThemeColors;
  onUpdate: () => void;
}

export const CustomFieldsScreen = ({theme: T, onUpdate}: Props) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const behavior = useKeyboardBehavior();
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CustomFieldType>('text');
  const [newMarkdown, setNewMarkdown] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []).then(d => setFields(d || []));
  }, []);

  const save = async (updated: CustomFieldDef[]) => {
    setFields(updated);
    await store.set(KEYS.customFieldDefs, updated);
    onUpdate();
  };

  const addField = () => {
    if (!newName.trim()) return;
    const def: CustomFieldDef = {id: uid(), name: newName.trim(), type: newType, markdown: newMarkdown || undefined, sortOrder: fields.length};
    save([...fields, def]);
    setNewName(''); setNewType('text'); setNewMarkdown(false);
  };

  const deleteField = (id: string) => {
    Alert.alert(t('customFields.deleteField'), t('customFields.deleteFieldMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => save(fields.filter(f => f.id !== id))},
    ]);
  };

  const renameField = (id: string) => {
    if (!editName.trim()) return;
    save(fields.map(f => f.id === id ? {...f, name: editName.trim()} : f));
    setEditId(null);
  };

  const toggleMarkdown = (id: string) => {
    save(fields.map(f => f.id === id ? {...f, markdown: !f.markdown} : f));
  };

  const moveBtnRefs = useRef<Record<string, any>>({});

  const moveField = (id: string, direction: 'up' | 'down') => {
    const idx = fields.findIndex(f => f.id === id);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === fields.length - 1) return;
    const updated = [...fields];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const neighbor = fields[swapIdx];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    save(updated.map((f, i) => ({...f, sortOrder: i})));
    const msg = swapIdx === 0
      ? t('common.movedToTop')
      : swapIdx === fields.length - 1
        ? t('common.movedToBottom')
        : direction === 'up'
          ? t('common.movedAbove', {name: neighbor.name})
          : t('common.movedBelow', {name: neighbor.name});
    AccessibilityInfo.announceForAccessibility(msg);
    setTimeout(() => {
      const node = moveBtnRefs.current[id];
      const tag = node ? findNodeHandle(node) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 100);
  };

  const typeLabel = (type: CustomFieldType) => t(`customFields.type${type.charAt(0).toUpperCase() + type.slice(1)}` as any);

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={behavior}>
      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: 100}}>
        {fields.length === 0 && (
          <View style={{alignItems: 'center', paddingVertical: 48}}>
            <Text style={{fontSize: fs(13), color: T.dim}}>{t('customFields.noFields')}</Text>
          </View>
        )}

        {fields.map((fd, i) => (
          <View key={fd.id} style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 10}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <View style={{alignItems: 'center', gap: 2}}>
                <TouchableOpacity
                  ref={(el) => { moveBtnRefs.current[fd.id] = el; }}
                  onPress={() => moveField(fd.id, 'up')}
                  disabled={i === 0}
                  hitSlop={{top: 10, bottom: 6, left: 12, right: 12}}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={i === 0 ? `${t('members.moveUp')}, ${fd.name}` : `${t('members.moveUp')}, ${fd.name}, ${t('members.moveAbove', {name: fields[i - 1].name})}`}
                  accessibilityState={{disabled: i === 0}}
                  style={{padding: 3}}>
                  <Text style={{fontSize: fs(14), color: i === 0 ? T.border : T.muted, lineHeight: 14}}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveField(fd.id, 'down')}
                  disabled={i === fields.length - 1}
                  hitSlop={{top: 6, bottom: 10, left: 12, right: 12}}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={i === fields.length - 1 ? `${t('members.moveDown')}, ${fd.name}` : `${t('members.moveDown')}, ${fd.name}, ${t('members.moveBelow', {name: fields[i + 1].name})}`}
                  accessibilityState={{disabled: i === fields.length - 1}}
                  style={{padding: 3}}>
                  <Text style={{fontSize: fs(14), color: i === fields.length - 1 ? T.border : T.muted, lineHeight: 14}}>▼</Text>
                </TouchableOpacity>
              </View>
              <View style={{flex: 1}}>
                {editId === fd.id ? (
                  <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                    <TextInput value={editName} onChangeText={setEditName} autoFocus accessibilityLabel={t('customFields.fieldName')}
                      style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: fs(14)}}
                      onSubmitEditing={() => renameField(fd.id)} />
                    <TouchableOpacity onPress={() => renameField(fd.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')}>
                      <Text style={{fontSize: fs(16), color: T.accent}}>✓</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => {setEditId(fd.id); setEditName(fd.name);}} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${fd.name}, ${t('common.edit')}`}>
                    <Text style={{fontSize: fs(15), color: T.text, fontWeight: '500'}}>{fd.name}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity onPress={() => deleteField(fd.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${fd.name}`}>
                <Text style={{fontSize: fs(18), color: T.danger}}>🗑</Text>
              </TouchableOpacity>
            </View>

            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8}}>
              <Text style={{fontSize: fs(11), color: T.dim}}>{t('customFields.fieldType')}</Text>
              <View style={{backgroundColor: T.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: T.border}}>
                <Text style={{fontSize: fs(12), color: T.muted}}>{typeLabel(fd.type)}</Text>
              </View>
            </View>

            {(fd.type === 'text' || fd.type === 'markdown') && (
              <TouchableOpacity onPress={() => toggleMarkdown(fd.id)} activeOpacity={0.7} accessibilityRole="checkbox" accessibilityState={{checked: !!fd.markdown}} accessibilityLabel={t('customFields.markdownSupport')} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8}}>
                <Text style={{fontSize: fs(16), color: fd.markdown ? T.accent : T.muted}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{fd.markdown ? '☑' : '☐'}</Text>
                <Text style={{fontSize: fs(12), color: T.dim}}>{t('customFields.markdownSupport')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={{position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: T.border, padding: 12}}>
        <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
          <TextInput value={newName} onChangeText={setNewName} placeholder={t('customFields.fieldName')} placeholderTextColor={T.muted}
            style={{flex: 1, backgroundColor: T.bg, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13)}}
            onSubmitEditing={addField} />
          <TouchableOpacity onPress={() => setShowTypePicker(!showTypePicker)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{expanded: showTypePicker}} accessibilityLabel={t('customFields.fieldType')} accessibilityValue={{text: typeLabel(newType)}}
            style={{backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9}}>
            <Text style={{fontSize: fs(12), color: T.dim}}>{typeLabel(newType)} ▾</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={addField} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('common.add')}
            style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9}}>
            <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>+</Text>
          </TouchableOpacity>
        </View>

        {showTypePicker && (
          <View style={{backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, marginTop: 8, overflow: 'hidden'}}>
            {FIELD_TYPES.map(ft => (
              <TouchableOpacity key={ft.type} onPress={() => {setNewType(ft.type); setShowTypePicker(false);}} activeOpacity={0.7}
                accessibilityRole="menuitem" accessibilityState={{selected: newType === ft.type}} accessibilityLabel={typeLabel(ft.type)}
                style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border,
                  backgroundColor: newType === ft.type ? `${T.accent}15` : 'transparent'}}>
                <Text style={{fontSize: fs(16), width: 24, textAlign: 'center'}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{ft.icon}</Text>
                <Text style={{fontSize: fs(13), color: newType === ft.type ? T.accent : T.text, fontWeight: newType === ft.type ? '600' : '400'}}>{typeLabel(ft.type)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};
