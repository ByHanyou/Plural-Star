import React, {useEffect, useState} from 'react';
import {View, ScrollView, TouchableOpacity, Modal} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {useAppStore} from '../../store/appStore';
import {store, KEYS} from '../../storage';
import {logError} from '../../utils/log';
import {useKeyboardHeight} from '../../hooks/useKeyboardHeight';
import {CustomFieldDef, Relationship, RelationshipTypeDef} from '../../utils';
import {NetworkManager} from '../../network/NetworkManager';
import {Friend, PrivacyScopeMode} from '../../network/types';
import {Bucket, BucketFeature, BUCKET_ROWS, FRONT_DETAILS, featureLabel, scopeModesFor, withScopeMode, withFriendToggled, bucketPickItems, allPicked, withPickToggled, withAllPickedToggled} from '../../network/buckets';
import {CheckMark, netStyles} from './NetParts';
import {CancelConfirmRow} from '../../components/controls';

const SCOPE_KEY: Record<PrivacyScopeMode, string> = {all: 'network.scopeAll', select: 'network.scopeSelect', none: 'network.scopeNone'};

export const BucketEditor = ({bucket, setBucket, title, friends, onSave}: {
  bucket: Bucket | null; setBucket: (b: Bucket | null) => void; title: string; friends: Friend[]; onSave: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const ns = netStyles(T);
  const kbHeight = useKeyboardHeight();
  const members = useAppStore(s => s.members);
  const groups = useAppStore(s => s.groups);
  const journal = useAppStore(s => s.journal);
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [relTypes, setRelTypes] = useState<RelationshipTypeDef[]>([]);
  const [pickerFeature, setPickerFeature] = useState<BucketFeature | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => {
    const load = () => {
      store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []).then(d => setFieldDefs(d || [])).catch(e => logError('network', e));
      store.get<Relationship[]>(KEYS.relationships, []).then(r => setRelationships(r || [])).catch(e => logError('network', e));
      store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes, []).then(rt => setRelTypes(rt || [])).catch(e => logError('network', e));
    };
    load();
    return NetworkManager.onSyncApplied(load);
  }, []);

  const openPicker = (f: BucketFeature) => {
    setPickerSearch('');
    setPickerFeature(f);
  };
  const setScopeMode = (f: BucketFeature, mode: PrivacyScopeMode) => {
    if (!bucket) return;
    setBucket(withScopeMode(bucket, f, mode));
    if (mode === 'select') openPicker(f);
  };
  const pickerItems = pickerFeature ? bucketPickItems(pickerFeature, {members, groups, journal, fieldDefs, relationships, relTypes}, pickerSearch, t) : [];
  const allPickedChecked = !!bucket && !!pickerFeature && allPicked(bucket, pickerFeature, pickerItems);
  const nameOk = !!bucket?.name.trim();

  return (
    <>
      <Modal visible={!!bucket && !pickerFeature} transparent animationType="fade" onRequestClose={() => setBucket(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24, paddingBottom: 24 + kbHeight}}>
          <View accessibilityViewIsModal onAccessibilityEscape={() => setBucket(null)} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, overflow: 'hidden', maxHeight: '85%'}}>
            <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>{title}</Text>
            <ScrollView style={{flexGrow: 0, flexShrink: 1}}>
              <View style={{paddingHorizontal: 16, paddingBottom: 4}}>
                <Text style={ns.label} nativeID="lblBucketName">{t('network.bucketName')}</Text>
                <TextInput value={bucket?.name || ''} onChangeText={v => bucket && setBucket({...bucket, name: v})}
                  placeholder={t('network.bucketName')} placeholderTextColor={T.muted} style={ns.input}
                  accessibilityLabel={t('network.bucketName')} accessibilityLabelledBy="lblBucketName" />
              </View>
              {bucket && BUCKET_ROWS.map(f => (
                <View key={f} style={{paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.border}}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Text style={{flex: 1, fontSize: fs(13), fontWeight: '600', color: T.text}}>{featureLabel(t, f)}</Text>
                    {scopeModesFor(f).map(mode => {
                      const sel = bucket[f].mode === mode;
                      const label = t(SCOPE_KEY[mode]);
                      return (
                        <TouchableOpacity key={mode} onPress={() => setScopeMode(f, mode)} activeOpacity={0.7}
                          accessibilityRole="button" accessibilityState={{selected: sel}} accessibilityLabel={t('a11y.labelValue', {label: featureLabel(t, f), value: label})}
                          hitSlop={{top: 8, bottom: 10}} style={{marginLeft: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                            backgroundColor: sel ? T.accentBg : 'transparent', borderColor: sel ? T.accent : T.border}}>
                          <Text style={{fontSize: fs(11), color: sel ? T.accent : T.dim}} accessibilityElementsHidden importantForAccessibility="no">{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {bucket[f].mode === 'select' && (
                    <TouchableOpacity onPress={() => openPicker(f)} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityLabel={`${t('a11y.labelValue', {label: featureLabel(t, f), value: t('network.scopeSelect')})}, ${t('network.scopeCount', {count: bucket[f].ids.length})}`}
                      hitSlop={{top: 6, bottom: 15}} style={{marginTop: 6, alignSelf: 'flex-start'}}>
                      <Text style={{fontSize: fs(11), color: T.accent}}>{`${bucket[f].ids.length} ✎`}</Text>
                    </TouchableOpacity>
                  )}
                  {f === 'front' && bucket.front.mode !== 'none' && (
                    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8}}>
                      {FRONT_DETAILS.map(([key, labelKey]) => {
                        const on = bucket[key] !== false;
                        const label = t(labelKey);
                        return (
                          <TouchableOpacity key={key} onPress={() => setBucket({...bucket, [key]: !on})} activeOpacity={0.7}
                            accessibilityRole="checkbox" accessibilityState={{checked: on}} accessibilityLabel={label}
                            hitSlop={{top: 6, bottom: 10}} style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                              backgroundColor: on ? T.accentBg : 'transparent', borderColor: on ? T.accent : T.border}}>
                            <Text style={{fontSize: fs(11), color: on ? T.accent : T.dim}} accessibilityElementsHidden importantForAccessibility="no">{on ? '✓ ' : ''}{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
              {bucket && (
                <View style={{paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.border}}>
                  <Text style={{fontSize: fs(13), fontWeight: '600', color: T.text, marginBottom: 6}}>{t('network.friends')}</Text>
                  {friends.length === 0 ? (
                    <Text style={{fontSize: fs(11), color: T.dim}}>{t('network.noFriends')}</Text>
                  ) : friends.map(f => {
                    const checked = (bucket.friendPeerIds || []).includes(f.peerId);
                    return (
                      <TouchableOpacity key={f.peerId} activeOpacity={0.7}
                        onPress={() => setBucket(withFriendToggled(bucket, f.peerId))}
                        accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={f.displayName}
                        style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7}}>
                        <CheckMark checked={checked} />
                        <Text style={{flex: 1, fontSize: fs(13), color: T.text}} numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no">{f.displayName}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
            <CancelConfirmRow label={t('common.save')} onConfirm={onSave} onCancel={() => setBucket(null)} disabled={!nameOk}
              style={{padding: 16, borderTopWidth: 1, borderTopColor: T.border}} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!bucket && !!pickerFeature} transparent animationType="fade" onRequestClose={() => setPickerFeature(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24}}>
          <View accessibilityViewIsModal onAccessibilityEscape={() => setPickerFeature(null)} style={{backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, maxHeight: '75%', overflow: 'hidden'}}>
            <Text accessibilityRole="header" style={{fontSize: fs(15), fontWeight: '600', color: T.text, padding: 16, paddingBottom: 8}}>
              {t('network.scopeSelectTitle', {feature: pickerFeature ? featureLabel(t, pickerFeature) : ''})}
            </Text>
            {pickerFeature !== 'groups' && (
              <View style={{paddingHorizontal: 16, paddingBottom: 8}}>
                <TextInput value={pickerSearch} onChangeText={setPickerSearch} placeholder={t('common.search')} placeholderTextColor={T.muted} style={ns.input} accessibilityLabel={t('common.search')} />
              </View>
            )}
            {pickerItems.length > 0 && (
              <TouchableOpacity onPress={() => { if (bucket && pickerFeature) setBucket(withAllPickedToggled(bucket, pickerFeature, pickerItems)); }} activeOpacity={0.7} accessibilityRole="checkbox"
                accessibilityState={{checked: allPickedChecked}} accessibilityLabel={allPickedChecked ? t('network.deselectAll') : t('network.selectAll')}
                hitSlop={{top: 6, bottom: 6}} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
                <CheckMark checked={allPickedChecked} square />
                <Text style={{flex: 1, fontSize: fs(13), fontWeight: '600', color: T.accent}} numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no">
                  {allPickedChecked ? t('network.deselectAll') : t('network.selectAll')}
                </Text>
              </TouchableOpacity>
            )}
            <ScrollView style={{maxHeight: 340}}>
              {pickerItems.map(item => {
                const checked = !!(bucket && pickerFeature && bucket[pickerFeature].ids.includes(item.id));
                return (
                  <TouchableOpacity key={item.id} onPress={() => { if (bucket && pickerFeature) setBucket(withPickToggled(bucket, pickerFeature, item.id)); }} activeOpacity={0.7}
                    accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={item.name}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border}}>
                    <CheckMark checked={checked} />
                    <Text style={{flex: 1, fontSize: fs(13), color: T.text}} numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no">{item.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={() => setPickerFeature(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}
              style={{alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: T.border}}>
              <Text style={{fontSize: fs(13), fontWeight: '600', color: T.accent}}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};
