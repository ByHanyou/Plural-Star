import React, {useMemo, useState} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {PlannerData, getLocale, firstDayOfWeek} from '../../utils';
import {useAppStore} from '../../store/appStore';
import {savePlanner} from '../../store/actions';
import {ColorCarousel} from '../../components/ColorCarousel';
import {appointmentsOn, dayKey, monthGrid, weekdayInitials} from '../../planner/planner';
import {reportSaveError} from '../../utils/saveError';

export const MonthCalendar = ({planner, viewMonth, onViewMonth, selected, onSelect, markColor}: {
  planner: PlannerData; viewMonth: Date; onViewMonth: (d: Date) => void;
  selected: Date; onSelect: (d: Date) => void; markColor: string;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const locale = getLocale();
  const weekStart = firstDayOfWeek();
  const [markPickerOpen, setMarkPickerOpen] = useState(false);
  const initials = useMemo(() => weekdayInitials(locale, weekStart), [locale, weekStart]);
  const grid = useMemo(() => monthGrid(viewMonth, weekStart), [viewMonth, weekStart]);
  const todayKey = dayKey(new Date());
  const selectedKey = dayKey(selected);
  const monthLabel = viewMonth.toLocaleDateString(locale, {month: 'long', year: 'numeric'});
  const shiftMonth = (delta: number) => onViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1));
  const navButton = (delta: number, label: string, glyph: string) => (
    <TouchableOpacity onPress={() => shiftMonth(delta)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label} style={{padding: 8}} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(16), color: T.accent}}>{glyph}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 10}}>
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
        {navButton(-1, t('planner.prevMonth'), '‹')}
        <Text accessibilityRole="header" style={{flex: 1, textAlign: 'center', fontSize: fs(15), fontWeight: '600', color: T.text}}>{monthLabel}</Text>
        {navButton(1, t('planner.nextMonth'), '›')}
      </View>
      <View style={{flexDirection: 'row'}}>
        {initials.map((w, i) => (
          <Text key={i} maxFontSizeMultiplier={1.4} style={{flex: 1, textAlign: 'center', fontSize: fs(10), color: T.muted}}
            accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{w}</Text>
        ))}
      </View>
      {Array.from({length: 6}, (_, row) => (
        <View key={row} style={{flexDirection: 'row'}}>
          {grid.slice(row * 7, row * 7 + 7).map((d, col) => {
            const inMonth = d.getMonth() === viewMonth.getMonth();
            const key = dayKey(d);
            const isSel = key === selectedKey;
            const isToday = key === todayKey;
            const dayList = appointmentsOn(planner, d);
            const count = dayList.length;
            const dots = Array.from(new Set(dayList.map(a => a.color || markColor))).slice(0, 3);
            const label = `${d.toLocaleDateString(locale, {weekday: 'long', month: 'long', day: 'numeric'})}${count > 0 ? `, ${t('planner.apptCount', {count})}` : ''}`;
            return (
              <TouchableOpacity key={col} onPress={() => { onSelect(new Date(d)); if (!inMonth) onViewMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
                activeOpacity={0.7} accessibilityRole="button" accessibilityState={{selected: isSel}} accessibilityLabel={isToday ? t('planner.todayA11y', {date: label}) : label}
                style={{flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 1, borderRadius: 8,
                  backgroundColor: isSel ? `${T.accent}25` : 'transparent', borderWidth: isToday ? 1 : 0, borderColor: T.accent}}>
                <Text maxFontSizeMultiplier={1.6} style={{fontSize: fs(12), color: inMonth ? (isSel ? T.accent : T.text) : T.muted, fontWeight: isSel ? '700' : '400'}}>{d.getDate()}</Text>
                {count > 0 && (
                  <View style={{flexDirection: 'row', gap: 2, marginTop: 2}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {dots.map(c => <View key={c} style={{width: 6, height: 6, borderRadius: 3, backgroundColor: c}} />)}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <TouchableOpacity onPress={() => setMarkPickerOpen(v => !v)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityState={{expanded: markPickerOpen}} accessibilityLabel={t('planner.markColor')}
        hitSlop={{top: 11, bottom: 11}} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border}}>
        <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: markColor}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <Text style={{flex: 1, fontSize: fs(11), color: T.dim}}>{t('planner.markColor')}</Text>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(11), color: T.dim}}>{markPickerOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {markPickerOpen && (
        <View style={{marginTop: 8}}>
          <ColorCarousel value={markColor} onChange={hex => savePlanner({...useAppStore.getState().planner, markColor: hex}).catch(reportSaveError)} size={26} />
        </View>
      )}
    </View>
  );
};
