import React, {useState, useEffect, useRef} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text, TextInput} from './AppText';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import i18n from '../i18n/i18n';
import {clamp, daysInMonth, getLocale, uses12HourClock, dayPeriodLabel} from '../utils';
import {sectionLabel} from './controls';

type DateTimeEditorMode =
  | 'datetime'
  | 'date'
  | 'time'
  | 'monthYear'
  | 'month'
  | 'year'
  | 'monthDay';

interface Props {
  date: Date;
  onChange: (d: Date) => void;
  label?: string;
  a11yLabel?: string;
  mode?: DateTimeEditorMode;
  collapsible?: boolean;
  readOnly?: boolean;
}

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

const EditableCell = ({
  value, pad, min, max, onCommit, onStep, width, label, a11yLabel,
}: {
  value: number;
  pad: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  onStep: (delta: number) => void;
  width: number;
  label?: string;
  a11yLabel?: string;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const display = String(value).padStart(pad, '0');
  const [text, setText] = useState(display);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(display);
  }, [display]);

  const commit = () => {
    editing.current = false;
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) { setText(display); return; }
    const clamped = clamp(n, min, max);
    setText(String(clamped).padStart(pad, '0'));
    onCommit(clamped);
  };

  return (
    <View style={{alignItems: 'center', width}}>
      <TouchableOpacity onPress={() => onStep(1)} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={a11yLabel ? `${i18n.t('a11y.increase')}, ${a11yLabel}` : i18n.t('a11y.increase')} hitSlop={{top: 10, bottom: 0, left: 6, right: 6}} style={{padding: 4}}>
        <Text style={{fontSize: fs(14), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">▲</Text>
      </TouchableOpacity>
      <TextInput
        value={text}
        accessibilityLabel={a11yLabel || i18n.t('a11y.value')}
        onChangeText={raw => {
          editing.current = true;
          const cleaned = raw.replace(/[^0-9]/g, '');
          setText(cleaned);
          const n = parseInt(cleaned, 10);
          if (!Number.isNaN(n) && n >= min && n <= max) onCommit(n);
        }}
        onFocus={() => { editing.current = true; }}
        onBlur={() => commit()}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        maxLength={Math.max(pad, String(max).length)}
        style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 4, minWidth: width, textAlign: 'center', fontSize: fs(14), color: T.text, fontWeight: '500', fontFamily: 'monospace'}}
      />
      <TouchableOpacity onPress={() => onStep(-1)} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={a11yLabel ? `${i18n.t('a11y.decrease')}, ${a11yLabel}` : i18n.t('a11y.decrease')} hitSlop={{top: 0, bottom: 10, left: 6, right: 6}} style={{padding: 4}}>
        <Text style={{fontSize: fs(14), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">▼</Text>
      </TouchableOpacity>
      {label ? <Text style={{fontSize: fs(9), color: T.muted, marginTop: 2, letterSpacing: 0.5}} accessibilityElementsHidden importantForAccessibility="no">{label}</Text> : null}
    </View>
  );
};

export const DateTimeEditor = ({date, onChange, label, a11yLabel, mode = 'datetime', collapsible = true, readOnly = false}: Props) => {
  const T = useTheme();
  const fs = fontScale(T);
  const [expanded, setExpanded] = useState(!collapsible && !readOnly);

  const month = date.getMonth();
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const isPM = hours >= 12;
  const twelveHour = uses12HourClock();
  const displayHour = twelveHour ? (hours % 12 || 12) : hours;

  const showMonth = mode !== 'time' && mode !== 'year';
  const showDay   = mode === 'datetime' || mode === 'date' || mode === 'monthDay';
  const showYear  = mode === 'datetime' || mode === 'date' || mode === 'monthYear' || mode === 'year';
  const showTime  = mode === 'datetime' || mode === 'time';

  const edit = (apply: (d: Date) => void) => {
    const d = new Date(date);
    apply(d);
    onChange(d);
  };

  const stepBy = (field: 'month' | 'day' | 'year' | 'hour' | 'minute', delta: number) => edit(d => {
    if (field === 'month') d.setMonth(d.getMonth() + delta);
    else if (field === 'day') d.setDate(d.getDate() + delta);
    else if (field === 'year') d.setFullYear(d.getFullYear() + delta);
    else if (field === 'hour') d.setHours(d.getHours() + delta);
    else d.setMinutes(d.getMinutes() + delta);
  });

  const commitMonth = (m1: number) => edit(d => {
    const newMonth = clamp(m1, 1, 12) - 1;
    d.setDate(1);
    d.setMonth(newMonth);
    d.setDate(Math.min(day, daysInMonth(year, newMonth)));
  });
  const commitDay = (dy: number) => edit(d => d.setDate(Math.min(dy, daysInMonth(year, month))));
  const commitYear = (y: number) => edit(d => {
    d.setFullYear(y);
    d.setDate(Math.min(day, daysInMonth(y, month)));
  });
  const commitHour12 = (h12: number) => edit(d => d.setHours((h12 % 12) + (isPM ? 12 : 0)));
  const commitHour24 = (h24: number) => edit(d => d.setHours(clamp(h24, 0, 23)));
  const commitMinute = (m: number) => edit(d => d.setMinutes(m));
  const toggleAmPm = () => edit(d => d.setHours(d.getHours() + (isPM ? -12 : 12)));

  const fmtSummary = () => {
    const loc = getLocale();
    if (mode === 'time') return date.toLocaleTimeString(loc, {hour: 'numeric', minute: '2-digit'});
    if (mode === 'year') return String(year);
    if (mode === 'month') return date.toLocaleDateString(loc, {month: 'long'});
    if (mode === 'monthYear') return date.toLocaleDateString(loc, {month: 'short', year: 'numeric'});
    if (mode === 'monthDay') return date.toLocaleDateString(loc, {month: 'short', day: 'numeric'});
    if (mode === 'date') return date.toLocaleDateString(loc, {month: 'short', day: 'numeric', year: 'numeric'});
    return date.toLocaleString(loc, {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'});
  };

  const canExpand = collapsible && !readOnly;
  const headerToggle = (
    <TouchableOpacity onPress={() => canExpand && setExpanded(!expanded)} activeOpacity={canExpand ? 0.7 : 1}
      accessibilityRole={canExpand ? 'button' : undefined} accessibilityState={canExpand ? {expanded} : undefined} accessibilityLabel={label || a11yLabel ? i18n.t('a11y.labelValue', {label: label || a11yLabel, value: fmtSummary()}) : fmtSummary()}
      hitSlop={{top: 6, bottom: 6}}
      style={{flexDirection: 'row', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: expanded ? `${T.accent}50` : T.border}}>
      <Text style={{flex: 1, fontSize: fs(14), color: T.text}}>{fmtSummary()}</Text>
      {canExpand && <Text style={{fontSize: fs(12), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{expanded ? '▲' : '▼'}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={{marginBottom: 14}}>
      {label ? (
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={sectionLabel(T, {marginBottom: 6})}>{label}</Text>
      ) : null}
      {headerToggle}
      {expanded && !readOnly && (
        <View style={{backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 8, marginTop: 6, padding: 12}}>
          <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, flexWrap: 'wrap'}}>
            {showMonth && (
              <EditableCell
                value={month + 1} pad={2} min={1} max={12}
                onCommit={commitMonth} onStep={d => stepBy('month', d)}
                width={44} label={i18n.t('dateFormat.month')} a11yLabel={i18n.t('a11y.month')}
              />
            )}
            {showDay && (
              <EditableCell
                value={day} pad={2} min={1} max={daysInMonth(year, month)}
                onCommit={commitDay} onStep={d => stepBy('day', d)}
                width={44} label={i18n.t('dateFormat.day')} a11yLabel={i18n.t('a11y.day')}
              />
            )}
            {showYear && (
              <EditableCell
                value={year} pad={4} min={MIN_YEAR} max={MAX_YEAR}
                onCommit={commitYear} onStep={d => stepBy('year', d)}
                width={60} label={i18n.t('dateFormat.year')} a11yLabel={i18n.t('a11y.year')}
              />
            )}
            {showTime && (
              <>
                {(showMonth || showDay || showYear) && <View style={{width: 12}} />}
                <EditableCell
                  value={displayHour} pad={2} min={twelveHour ? 1 : 0} max={twelveHour ? 12 : 23}
                  onCommit={twelveHour ? commitHour12 : commitHour24} onStep={d => stepBy('hour', d)}
                  width={44} label={i18n.t('dateFormat.hour')} a11yLabel={i18n.t('a11y.hour')}
                />
                <Text style={{fontSize: fs(18), color: T.dim, fontWeight: '700', marginHorizontal: 2}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">:</Text>
                <EditableCell
                  value={minutes} pad={2} min={0} max={59}
                  onCommit={commitMinute} onStep={d => stepBy('minute', d)}
                  width={44} label={i18n.t('dateFormat.minute')} a11yLabel={i18n.t('a11y.minute')}
                />
                {twelveHour && (
                  <TouchableOpacity onPress={toggleAmPm} activeOpacity={0.6}
                    accessibilityRole="button" accessibilityLabel={isPM ? i18n.t('a11y.switchToAm') : i18n.t('a11y.switchToPm')}
                    hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
                    style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, marginLeft: 4}}>
                    <Text style={{fontSize: fs(13), color: T.accent, fontWeight: '600'}}>{dayPeriodLabel(isPM)}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
};
