import React from 'react';
import {View, TouchableOpacity, Modal, ScrollView} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {Tool, WIDTHS, ZOOM_IN_STEP, ZOOM_OUT_STEP} from '../../whiteboard/geometry';

const BASE_TOOLS: {id: Tool; glyph: string; key: string}[] = [
  {id: 'draw', glyph: '✎', key: 'whiteboard.draw'},
  {id: 'move', glyph: '✥', key: 'whiteboard.move'},
  {id: 'erase', glyph: '⌫', key: 'whiteboard.erase'},
];
const SHAPE_TOOLS: {id: Tool; glyph: string; key: string}[] = [
  {id: 'line', glyph: '╱', key: 'whiteboard.shapeLine'},
  {id: 'rect', glyph: '▭', key: 'whiteboard.shapeRect'},
  {id: 'ellipse', glyph: '◯', key: 'whiteboard.shapeEllipse'},
  {id: 'poly', glyph: '⬠', key: 'whiteboard.shapePoly'},
];
const HEADER_HIT = {top: 8, bottom: 8, left: 6, right: 6};

export const WhiteboardHeader = ({onBack, onUndo, onZoom, onClear, hasStrokes}: {
  onBack: () => void; onUndo: () => void; onZoom: (f: number) => void; onClear: () => void; hasStrokes: boolean;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const headerBtn = (onPress: () => void, label: string, glyph: string, glyphColor: string, size = 15, disabled?: boolean) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={disabled === undefined ? undefined : {disabled}} hitSlop={HEADER_HIT} style={{padding: 6}}>
      <Text style={{fontSize: fs(size), color: glyphColor}} accessibilityElementsHidden importantForAccessibility="no">{glyph}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border, gap: 8}}>
      {headerBtn(onBack, t('common.back'), '‹', T.dim, 16)}
      <Text accessibilityRole="header" style={{flex: 1, fontSize: fs(16), fontWeight: '600', color: T.text}}>{t('whiteboard.title')}</Text>
      {headerBtn(onUndo, t('whiteboard.undo'), '↩', hasStrokes ? T.text : T.muted, 15, !hasStrokes)}
      {headerBtn(() => onZoom(ZOOM_IN_STEP), t('systemMap.zoomIn'), '＋', T.text)}
      {headerBtn(() => onZoom(ZOOM_OUT_STEP), t('systemMap.zoomOut'), '－', T.text)}
      {headerBtn(onClear, t('whiteboard.clear'), '🗑', T.danger)}
    </View>
  );
};

export const WhiteboardToolbar = ({tool, onTool, width, onWidth, color}: {
  tool: Tool; onTool: (next: Tool) => void; width: number; onWidth: (w: number) => void; color: string;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const toolBtn = ({id, glyph, key}: {id: Tool; glyph: string; key: string}) => (
    <TouchableOpacity key={id} onPress={() => onTool(id)} activeOpacity={0.7}
      accessibilityRole="button" accessibilityState={{selected: tool === id}} accessibilityLabel={t(key)}
      hitSlop={{top: 6, bottom: 6}} style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
        backgroundColor: tool === id ? T.accentBg : 'transparent', borderColor: tool === id ? T.accent : T.border}}>
      <Text style={{fontSize: fs(15), color: tool === id ? T.accent : T.dim}} accessibilityElementsHidden importantForAccessibility="no">{glyph}</Text>
    </TouchableOpacity>
  );
  const divider = <View style={{width: 1, height: 22, backgroundColor: T.border}} importantForAccessibility="no" accessibilityElementsHidden />;
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: T.border}}>
      {BASE_TOOLS.map(toolBtn)}
      {divider}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow: 1, flexShrink: 1}} contentContainerStyle={{alignItems: 'center', gap: 8}} snapToInterval={38} decelerationRate="fast">
        {SHAPE_TOOLS.map(toolBtn)}
        {divider}
        {WIDTHS.map(wd => (
          <TouchableOpacity key={wd} onPress={() => onWidth(wd)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityState={{selected: width === wd}} accessibilityLabel={t('whiteboard.brushSizeN', {n: wd})}
            hitSlop={HEADER_HIT} style={{width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: width === wd ? T.accent : T.border}}>
            <View style={{width: wd + 4, height: wd + 4, borderRadius: (wd + 4) / 2, backgroundColor: color}} accessibilityElementsHidden importantForAccessibility="no" />
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => onTool('bucket')} activeOpacity={0.7}
          accessibilityRole="button" accessibilityState={{selected: tool === 'bucket'}} accessibilityLabel={t('whiteboard.bucket')}
          hitSlop={HEADER_HIT} style={{width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: tool === 'bucket' ? T.accentBg : 'transparent', borderColor: tool === 'bucket' ? T.accent : T.border}}>
          <Text style={{fontSize: fs(14)}} accessibilityElementsHidden importantForAccessibility="no">🪣</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export const VoCommandsHelp = ({visible, commands, onClose}: {
  visible: boolean; commands: {name: string; label: string; help: boolean}[]; onClose: () => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24}}>
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={{backgroundColor: T.card, borderRadius: 12, padding: 16, maxHeight: '80%'}}>
          <Text accessibilityRole="header" style={{fontSize: fs(17), fontWeight: '700', color: T.text, marginBottom: 8}}>{t('whiteboard.voCommands')}</Text>
          <ScrollView>
            <Text style={{fontSize: fs(13), color: T.dim, marginBottom: 12}}>{t('whiteboard.voHint')}</Text>
            {commands.filter(c => c.help).map(c => (
              <Text key={c.name} style={{fontSize: fs(15), color: T.text, paddingVertical: 6}} accessibilityLabel={c.label}>{`• ${c.label}`}</Text>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={{top: 6, bottom: 6}} style={{marginTop: 12, alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12}}>
            <Text style={{fontSize: fs(15), color: T.accent, fontWeight: '600'}}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
