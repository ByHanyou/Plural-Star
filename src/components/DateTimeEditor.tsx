import React, {useState, useEffect, useRef} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text, TextInput} from './AppText';

export type DateTimeEditorMode =
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
  T: any;
  mode?: DateTimeEditorMode;
  collapsible?: boolean;
}

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const lastDayOfMonth = (year: number, monthZeroIndexed: number) =>
  new Date(year, monthZeroIndexed + 1, 0).getDate();

const EditableCell = ({
  value, pad, min, max, onCommit, onStep, width, T,
}: {
  value: number;
  pad: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  onStep: (delta: number) => void;
  width: number;
  T: any;
}) => {
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
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
      <TouchableOpacity onPress={() => onStep(1)} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Increase" hitSlop={{top: 4, bottom: 0, left: 6, right: 6}} style={{padding: 4}}>
        <Text style={{fontSize: fs(14), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">▲</Text>
      </TouchableOpacity>
      <TextInput
        value={text}
        accessibilityLabel="Value"
        onChangeText={t => { editing.current = true; setText(t.replace(/[^0-9]/g, '')); }}
        onFocus={() => { editing.current = true; }}
        onBlur={() => commit()}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        maxLength={Math.max(pad, String(max).length)}
        style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 4, minWidth: width, textAlign: 'center', fontSize: fs(14), color: T.text, fontWeight: '500', fontFamily: 'monospace'}}
      />
      <TouchableOpacity onPress={() => onStep(-1)} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Decrease" hitSlop={{top: 0, bottom: 4, left: 6, right: 6}} style={{padding: 4}}>
        <Text style={{fontSize: fs(14), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no">▼</Text>
      </TouchableOpacity>
    </View>
  );
};

export const DateTimeEditor = ({date, onChange, label, T, mode = 'datetime', collapsible = true}: Props) => {
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const [expanded, setExpanded] = useState(!collapsible);

  const month = date.getMonth();
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const isPM = hours >= 12;
  const displayHour = hours % 12 || 12;

  const showMonth = mode !== 'time' && mode !== 'year';
  const showDay   = mode === 'datetime' || mode === 'date' || mode === 'monthDay';
  const showYear  = mode === 'datetime' || mode === 'date' || mode === 'monthYear' || mode === 'year';
  const showTime  = mode === 'datetime' || mode === 'time';

  const stepBy = (field: 'month' | 'day' | 'year' | 'hour' | 'minute', delta: number) => {
    const d = new Date(date);
    if (field === 'month') d.setMonth(d.getMonth() + delta);
    else if (field === 'day') d.setDate(d.getDate() + delta);
    else if (field === 'year') d.setFullYear(d.getFullYear() + delta);
    else if (field === 'hour') d.setHours(d.getHours() + delta);
    else if (field === 'minute') d.setMinutes(d.getMinutes() + delta);
    onChange(d);
  };

  const commitMonth = (m1: number) => {
    const d = new Date(date);
    const newMonth = clamp(m1, 1, 12) - 1;
    const cappedDay = Math.min(day, lastDayOfMonth(year, newMonth));
    d.setDate(1);
    d.setMonth(newMonth);
    d.setDate(cappedDay);
    onChange(d);
  };
  const commitDay = (dy: number) => {
    const d = new Date(date);
    const capped = Math.min(dy, lastDayOfMonth(year, month));
    d.setDate(capped);
    onChange(d);
  };
  const commitYear = (y: number) => {
    const d = new Date(date);
    const cappedDay = Math.min(day, lastDayOfMonth(y, month));
    d.setFullYear(y);
    d.setDate(cappedDay);
    onChange(d);
  };
  const commitHour12 = (h12: number) => {
    const d = new Date(date);
    const h24 = (h12 % 12) + (isPM ? 12 : 0);
    d.setHours(h24);
    onChange(d);
  };
  const commitMinute = (m: number) => {
    const d = new Date(date);
    d.setMinutes(m);
    onChange(d);
  };

  const toggleAmPm = () => {
    const d = new Date(date);
    d.setHours(d.getHours() + (isPM ? -12 : 12));
    onChange(d);
  };

  const fmtSummary = () => {
    if (mode === 'time') return date.toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});
    if (mode === 'year') return String(year);
    if (mode === 'month') return date.toLocaleDateString(undefined, {month: 'long'});
    if (mode === 'monthYear') return date.toLocaleDateString(undefined, {month: 'short', year: 'numeric'});
    if (mode === 'monthDay') return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    if (mode === 'date') return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
    const datePart = date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
    const timePart = date.toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});
    return `${datePart}  ${timePart}`;
  };

  const headerToggle = (
    <TouchableOpacity onPress={() => collapsible && setExpanded(!expanded)} activeOpacity={collapsible ? 0.7 : 1}
      accessibilityRole={collapsible ? 'button' : undefined} accessibilityState={collapsible ? {expanded} : undefined} accessibilityLabel={fmtSummary()}
      style={{flexDirection: 'row', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: expanded ? `${T.accent}50` : T.border}}>
      <Text style={{flex: 1, fontSize: fs(14), color: T.text}}>{fmtSummary()}</Text>
      {collapsible && <Text style={{fontSize: fs(12), color: T.dim}}>{expanded ? '▲' : '▼'}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={{marginBottom: 14}}>
      {label ? (
        <Text style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 6, fontWeight: '600'}}>{label}</Text>
      ) : null}
      {headerToggle}
      {expanded && (
        <View style={{backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 8, marginTop: 6, padding: 12}}>
          <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, flexWrap: 'wrap'}}>
            {showMonth && (
              <EditableCell
                value={month + 1} pad={2} min={1} max={12}
                onCommit={commitMonth} onStep={d => stepBy('month', d)}
                width={44} T={T}
              />
            )}
            {showDay && (
              <EditableCell
                value={day} pad={2} min={1} max={lastDayOfMonth(year, month)}
                onCommit={commitDay} onStep={d => stepBy('day', d)}
                width={44} T={T}
              />
            )}
            {showYear && (
              <EditableCell
                value={year} pad={4} min={MIN_YEAR} max={MAX_YEAR}
                onCommit={commitYear} onStep={d => stepBy('year', d)}
                width={60} T={T}
              />
            )}
            {showTime && (
              <>
                {(showMonth || showDay || showYear) && <View style={{width: 12}} />}
                <EditableCell
                  value={displayHour} pad={2} min={1} max={12}
                  onCommit={commitHour12} onStep={d => stepBy('hour', d)}
                  width={44} T={T}
                />
                <Text style={{fontSize: fs(18), color: T.dim, fontWeight: '700', marginHorizontal: 2}}>:</Text>
                <EditableCell
                  value={minutes} pad={2} min={0} max={59}
                  onCommit={commitMinute} onStep={d => stepBy('minute', d)}
                  width={44} T={T}
                />
                <TouchableOpacity onPress={toggleAmPm} activeOpacity={0.6}
                  accessibilityRole="button" accessibilityLabel={isPM ? 'PM, switch to AM' : 'AM, switch to PM'}
                  style={{backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, marginLeft: 4}}>
                  <Text style={{fontSize: fs(13), color: T.accent, fontWeight: '600'}}>{isPM ? 'PM' : 'AM'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          {(showMonth && showDay && showYear) && (
            <Text style={{fontSize: fs(9), color: T.muted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5}}>MM &nbsp;&nbsp; DD &nbsp;&nbsp; YYYY{showTime ? '   ·   HH : MM' : ''}</Text>
          )}
          {(mode === 'monthYear' || mode === 'monthDay') && (
            <Text style={{fontSize: fs(9), color: T.muted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5}}>
              {mode === 'monthYear' ? 'MM     YYYY' : 'MM     DD'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};
