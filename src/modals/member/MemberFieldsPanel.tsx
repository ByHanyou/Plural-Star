import React from 'react';
import {View, TouchableOpacity, Image} from 'react-native';
import {Text, TextInput} from '../../components/AppText';
import {useTranslation} from 'react-i18next';
import {PlusMinusIcon} from '../../components/Glyphs';
import {ColorCarousel} from '../../components/ColorCarousel';
import {RichText as RichDescription} from '../../components/MarkdownRenderer';
import {RichTextEditor} from '../../components/RichTextEditor';
import {DateTimeEditor} from '../../components/DateTimeEditor';
import {ToggleSwitch} from '../../components/ToggleSwitch';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {CustomFieldDef, CustomFieldValue, Member, parseFieldDate, encodeFieldDate, parseFieldRange, encodeFieldRange} from '../../utils';
import {Field, sectionLabel} from '../../components/controls';
import {profileSectionHeading} from '../../components/headings';
import {CLOUD_MEDIA_MARK} from '../../cloud/cloudKeys';

const isEmptyFieldValue = (fd: CustomFieldDef, value: unknown): boolean =>
  value === undefined || value === null || value === '' || (fd.type === 'image' && value === CLOUD_MEDIA_MARK);

const numberFieldValue = (raw: string): string | number | null => {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && !/[.-]$/.test(cleaned) && cleaned !== '.' ? n : cleaned;
};

const DATE_FIELD_MODES: Record<string, 'date' | 'datetime' | 'monthYear' | 'month' | 'year' | 'monthDay'> = {
  date: 'date', timestamp: 'datetime', monthYear: 'monthYear', month: 'month', year: 'year', monthDay: 'monthDay',
};

export const MemberFieldsPanel = ({fieldDefs, values, readOnly, setFieldVal, pickImage, markdownEditFieldId, setMarkdownEditFieldId, members, onMentionPress, mc, edge}: {
  fieldDefs: CustomFieldDef[]; values: CustomFieldValue[] | undefined; readOnly: boolean;
  setFieldVal: (fieldId: string, value: string | number | boolean | null) => void; pickImage: (fieldId: string) => void;
  markdownEditFieldId: string | null; setMarkdownEditFieldId: (id: string | null) => void;
  members: Member[]; onMentionPress?: (memberId: string) => void; mc: string; edge: string;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const visibleDefs = readOnly ? fieldDefs.filter(fd => !isEmptyFieldValue(fd, (values || []).find(c => c.fieldId === fd.id)?.value)) : fieldDefs;
  if (readOnly && visibleDefs.length === 0) return null;
  return (
    <>
      {readOnly && (
        <Text accessibilityRole="header" style={profileSectionHeading(fs, mc, edge)}>{t('customFields.title')}</Text>
      )}
      {visibleDefs.length > 0 ? visibleDefs.map((fd, fdIndex) => {
        const cfv = (values || []).find(v => v.fieldId === fd.id);
        const val = fd.type === 'image' && cfv?.value === CLOUD_MEDIA_MARK ? '' : (cfv?.value ?? '');
        const rowStyle = {marginBottom: 14, borderTopWidth: fdIndex > 0 ? 1 : 0, borderTopColor: T.border, paddingTop: fdIndex > 0 ? 14 : 0};
        const dateMode = DATE_FIELD_MODES[fd.type];
        if (dateMode) {
          const dateVal = parseFieldDate(val) ?? new Date();
          return (
            <View key={fd.id} style={rowStyle}>
              <DateTimeEditor
                date={dateVal}
                onChange={readOnly ? () => {} : d => setFieldVal(fd.id, encodeFieldDate(fd.type, d))}
                label={fd.name}
                mode={dateMode}
                readOnly={readOnly}
              />
              {val !== '' && !readOnly && (
                <TouchableOpacity onPress={() => setFieldVal(fd.id, null)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={t('common.clearItem', {name: fd.name})}
                  hitSlop={{top: 6, bottom: 11}} style={{alignSelf: 'flex-end', marginTop: -8, paddingVertical: 4, paddingHorizontal: 6}}>
                  <Text style={{fontSize: fs(11), color: T.muted}}>{t('common.clear')}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }

        if (fd.type === 'dateRange') {
          const range = parseFieldRange(val) ?? {start: new Date(), end: new Date()};
          const startD = range.start;
          const endD = range.end;
          const writeRange = (next: Partial<typeof range>) => {
            const merged = {...range, ...next};
            setFieldVal(fd.id, encodeFieldRange(merged.start, merged.end));
          };
          return (
            <View key={fd.id} style={rowStyle}>
              <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{fd.name}</Text>
              <DateTimeEditor
                date={startD}
                onChange={readOnly ? () => {} : d => writeRange({start: d})}
                label={t('customFields.startDate')}
                mode="date"
                readOnly={readOnly}
              />
              <DateTimeEditor
                date={endD}
                onChange={readOnly ? () => {} : d => writeRange({end: d})}
                label={t('customFields.endDate')}
                mode="date"
                readOnly={readOnly}
              />
            </View>
          );
        }

        return (
          <View key={fd.id} style={rowStyle}>
            {fd.type === 'toggle' ? (
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <Text style={{fontSize: fs(13), color: T.text, fontWeight: '500'}}>{fd.name}</Text>
                <ToggleSwitch value={!!val} onToggle={readOnly ? undefined : () => setFieldVal(fd.id, !val)} activeOpacity={readOnly ? 1 : 0.8} label={fd.name} />
              </View>
            ) : fd.type === 'color' ? (
              <View>
                <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{fd.name}</Text>
                {readOnly ? (
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <View style={{width: 32, height: 32, borderRadius: 8, backgroundColor: String(val || '#333'), borderWidth: 1, borderColor: T.border}} />
                    <Text style={{fontSize: fs(13), color: T.dim, fontFamily: 'monospace'}}>{String(val || '')}</Text>
                  </View>
                ) : (
                  <ColorCarousel value={String(val || '#333333')} onChange={v => setFieldVal(fd.id, v)} />
                )}
              </View>
            ) : fd.type === 'image' ? (
              <View>
                <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{fd.name}</Text>
                {val ? (
                  <View>
                    <Image source={{uri: String(val)}} accessibilityRole="image" accessibilityLabel={t('a11y.image')} style={{width: '100%', height: 180, borderRadius: 8, backgroundColor: T.surface}} resizeMode="cover" />
                    {!readOnly && (
                      <View style={{flexDirection: 'row', gap: 16, marginTop: 6}}>
                        <TouchableOpacity hitSlop={{top: 15, bottom: 15}} onPress={() => pickImage(fd.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.change')}><Text style={{fontSize: fs(12), color: T.accent}}>{t('common.change')}</Text></TouchableOpacity>
                        <TouchableOpacity hitSlop={{top: 15, bottom: 15}} onPress={() => setFieldVal(fd.id, null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.clear')}><Text style={{fontSize: fs(12), color: T.danger}}>{t('common.clear')}</Text></TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : !readOnly ? (
                  <TouchableOpacity onPress={() => pickImage(fd.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('customFields.addImage')}
                    style={{borderWidth: 1.5, borderStyle: 'dashed', borderColor: T.border, borderRadius: 10, paddingVertical: 22, alignItems: 'center', backgroundColor: T.surface}}>
                    <PlusMinusIcon size={16} color={T.dim} />
                    <Text style={{fontSize: fs(12), color: T.dim, marginTop: 4}}>{t('customFields.addImage')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (fd.type === 'markdown' || (fd.type === 'text' && fd.markdown)) ? (
              <View>
                <Text style={sectionLabel(T, {marginBottom: 5})}>{fd.name}</Text>
                <TouchableOpacity onPress={readOnly ? undefined : () => setMarkdownEditFieldId(fd.id)} activeOpacity={readOnly ? 1 : 0.7}
                  accessibilityRole={readOnly ? undefined : 'button'} accessibilityLabel={readOnly ? undefined : fd.name}
                  style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, minHeight: 72}}>
                  {val
                    ? <RichDescription text={String(val)} members={members} onMentionPress={onMentionPress} />
                    : <Text style={{fontSize: fs(13), color: T.muted}}>{fd.name}…</Text>}
                </TouchableOpacity>
                {!readOnly && <RichTextEditor
                  visible={markdownEditFieldId === fd.id}
                  title={fd.name}
                  initialContent={String(val || '')}
                  members={members}
                  onSave={(html: string) => { setFieldVal(fd.id, html); setMarkdownEditFieldId(null); }}
                  onClose={() => setMarkdownEditFieldId(null)}
                />}
              </View>
            ) : fd.type === 'text' ? (
              <View>
                <Text style={sectionLabel(T, {marginBottom: 5})}>{fd.name}</Text>
                <TextInput
                  value={String(val || '')}
                  onChangeText={(v: string) => setFieldVal(fd.id, v)}
                  accessibilityLabel={fd.name} placeholder={fd.name}
                  placeholderTextColor={T.muted}
                  editable={!readOnly}
                  multiline
                  textAlignVertical="top"
                  style={{
                    backgroundColor: T.surface, color: T.text,
                    borderWidth: 1, borderColor: T.border, borderRadius: 8,
                    paddingHorizontal: 12, paddingVertical: 10,
                    fontSize: fs(14), lineHeight: fs(20), minHeight: 72,
                  }}
                />
              </View>
            ) : fd.type === 'number' ? (
              <View>
                <Text style={sectionLabel(T, {marginBottom: 5})}>{fd.name}</Text>
                <TextInput
                  value={val === null || val === '' ? '' : String(val)}
                  onChangeText={raw => setFieldVal(fd.id, numberFieldValue(raw))}
                  accessibilityLabel={fd.name} placeholder={fd.name}
                  placeholderTextColor={T.muted}
                  editable={!readOnly}
                  keyboardType="numbers-and-punctuation"
                  style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14)}}
                />
              </View>
            ) : (
              <Field label={fd.name} value={String(val || '')} onChange={(v: string) => setFieldVal(fd.id, v)}
                placeholder={fd.name} readOnly={readOnly} multiline />
            )}
          </View>
        );
      }) : (
        <View style={{alignItems: 'center', paddingVertical: 40}}>
          <Text style={{fontSize: fs(13), color: T.muted}}>{t('customFields.noFieldsInfo')}</Text>
        </View>
      )}
    </>
  );
};
