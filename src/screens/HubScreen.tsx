import React, {useState, useEffect, useRef, useCallback} from 'react';
import {View, ScrollView, TouchableOpacity, Linking, BackHandler, Platform, PanResponder, PixelRatio, AccessibilityInfo} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ReorderLockButton} from '../components/DragHandle';
import {Text} from '../components/AppText';
import {useTranslation} from 'react-i18next';
import {logError} from '../utils/log';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useAppStore} from '../store/appStore';
import {CREDITS, DISCORD_URL, SUPPORT_URL, clamp} from '../utils';
import {PlannerScreen} from './PlannerScreen';
import {tileTitle} from '../components/controls';
import {BackHeader} from '../components/BackHeader';
import {RetroHistoryScreen} from './RetroHistoryScreen';
import {useUiStore} from '../store/uiStore';
import {ShareScreen} from './ShareScreen';
import {StatsScreen} from './StatsScreen';
import {ChatScreen} from './ChatScreen';
import {CustomFieldsScreen} from './CustomFieldsScreen';
import {SystemManagerScreen} from './SystemManagerScreen';
import {MembersScreen} from './MembersScreen';
import {PollsScreen} from './PollsScreen';
import {SystemMapScreen} from './SystemMapScreen';
import {MailboxScreen} from './MailboxScreen';
import {WhiteboardScreen} from './WhiteboardScreen';
import {ColorsScreen} from './ColorsScreen';
import {NetworkScreen} from './NetworkScreen';

type HubTile = 'share' | 'retroHistory' | 'statistics' | 'chat' | 'customFields' | 'systemManager' | 'archive' | 'polls' | 'systemMap' | 'mailbox' | 'network' | 'whiteboard' | 'colors' | 'planner' | 'discord' | 'credits' | 'supportPS';

type TileDrag = {id: string; dx: number; dy: number; from: number; target: number};

const SINGLET_HIDDEN_TILES: ReadonlySet<HubTile> = new Set<HubTile>(['chat', 'systemManager', 'customFields', 'polls', 'archive', 'systemMap', 'mailbox']);

const EXTERNAL_TILES: Partial<Record<HubTile, string>> = {discord: DISCORD_URL, supportPS: SUPPORT_URL};

const HUB_ORDER_KEY = 'ps.hubTileOrder';
const DEFAULT_TILE_ORDER: HubTile[] = ['planner', 'retroHistory', 'statistics', 'chat', 'mailbox', 'whiteboard', 'colors', 'network', 'polls', 'systemMap', 'customFields', 'systemManager', 'archive', 'share', 'credits', 'discord', 'supportPS'];

const mergeTileOrder = (saved: string[], defaults: HubTile[]): HubTile[] => {
  const valid = saved.filter(id => (defaults as string[]).includes(id)) as HubTile[];
  const missing = defaults.filter(id => !valid.includes(id));
  return [...valid, ...missing];
};

interface Props {
  singlet?: boolean;
  selfId?: string;
}

const openLink = (url: string): void => { Linking.openURL(url).catch(e => logError('hub', e)); };

const MemoShareScreen = React.memo(ShareScreen);
const MemoStatsScreen = React.memo(StatsScreen);
const MemoChatScreen = React.memo(ChatScreen);
const MemoCustomFieldsScreen = React.memo(CustomFieldsScreen);
const MemoSystemManagerScreen = React.memo(SystemManagerScreen);
const MemoMembersScreen = React.memo(MembersScreen);
const MemoPollsScreen = React.memo(PollsScreen);
const MemoSystemMapScreen = React.memo(SystemMapScreen);
const MemoMailboxScreen = React.memo(MailboxScreen);
const MemoWhiteboardScreen = React.memo(WhiteboardScreen);
const MemoColorsScreen = React.memo(ColorsScreen);
const MemoNetworkScreen = React.memo(NetworkScreen);

const TileFrame = ({title, onBack, right, children}: {title: string; onBack: () => void; right?: React.ReactNode; children: React.ReactNode}) => {
  const T = useTheme();
  return (
    <View style={{flex: 1, backgroundColor: T.bg}}>
      <BackHeader title={title} onBack={onBack} right={right} tile />
      {children}
    </View>
  );
};

export const HubScreen = ({singlet = false, selfId}: Props) => {
  const T = useTheme();
  const openMemberById = useUiStore(s => s.openMemberById);
  const systemMapRelCount = useUiStore(s => s.systemMapRelCount);
  const setSystemMapRelCount = useUiStore(s => s.setSystemMapRelCount);
  const mapFocus = useUiStore(s => s.mapFocus);
  const resetKey = useUiStore(s => s.hubResetKey);
  const editHistoryIndex = useUiStore(s => s.editHistoryIndex);
  const onClearEditHistory = useUiStore(s => s.clearEditHistory);
  const editingEntry = useAppStore(s => (editHistoryIndex !== null ? s.history[editHistoryIndex] : undefined));
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [activeTile, setActiveTile] = useState<HubTile | null>(null);
  const closeTile = useCallback(() => setActiveTile(null), []);
  useEffect(() => {
    if (Platform.OS !== 'android' || !activeTile) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setActiveTile(null);
      return true;
    });
    return () => sub.remove();
  }, [activeTile]);

  const [tileOrder, setTileOrder] = useState<HubTile[]>(DEFAULT_TILE_ORDER);
  const [tileReorderOn, setTileReorderOn] = useState(false);
  const [tileDrag, setTileDrag] = useState<TileDrag | null>(null);
  const tileDragRef = useRef<TileDrag | null>(null);
  const tileReorderOnRef = useRef(false);
  tileReorderOnRef.current = tileReorderOn;
  const tileOrderRef = useRef<HubTile[]>(DEFAULT_TILE_ORDER);
  tileOrderRef.current = tileOrder;
  const visIdsRef = useRef<string[]>([]);
  const tileSizeRef = useRef({w: 0, h: 0});
  const gridWRef = useRef(0);
  const tileColsRef = useRef(3);
  const tileRespondersRef = useRef<Map<string, ReturnType<typeof PanResponder.create>['panHandlers']>>(new Map());

  useEffect(() => {
    AsyncStorage.getItem(HUB_ORDER_KEY).then(raw => {
      let saved: unknown = [];
      try {
        saved = raw ? JSON.parse(raw) : [];
      } catch {}
      if (Array.isArray(saved) && saved.length > 0) setTileOrder(mergeTileOrder(saved.filter((id): id is string => typeof id === 'string'), DEFAULT_TILE_ORDER));
    }).catch(e => logError('hub', e));
  }, []);

  useEffect(() => { setActiveTile(null); }, [resetKey]);

  useEffect(() => {
    if (editHistoryIndex !== null && editHistoryIndex !== undefined) {
      setActiveTile('retroHistory');
    }
  }, [editHistoryIndex]);

  useEffect(() => {
    if (mapFocus) setActiveTile('systemMap');
  }, [mapFocus]);

  const handleRetroBack = () => {
    setActiveTile(null);
    if (editHistoryIndex !== null) onClearEditHistory();
  };

  if (activeTile === 'retroHistory') {
    return <RetroHistoryScreen
      key={editingEntry ? `edit-${editHistoryIndex}` : 'new'}
      singlet={singlet} selfId={selfId}
      onBack={handleRetroBack}
      editIndex={editingEntry ? editHistoryIndex ?? undefined : undefined}
      editEntry={editingEntry}
    />;
  }

  const framedTile = (tile: HubTile): {title: string; body: React.ReactNode; right?: React.ReactNode} | null => {
    switch (tile) {
      case 'share': return {title: t('hub.importExport'), body: <MemoShareScreen />};
      case 'statistics': return {title: t('hub.statistics'), body: <MemoStatsScreen singlet={singlet} selfId={selfId} />};
      case 'chat': return {title: t('hub.systemChat'), body: <MemoChatScreen onMentionPress={openMemberById} />};
      case 'customFields': return {title: t('customFields.title'), body: <MemoCustomFieldsScreen />};
      case 'systemManager': return {title: t('systemManager.title'), body: <MemoSystemManagerScreen onViewMember={openMemberById} />};
      case 'archive': return {title: t('hub.archive'), body: <MemoMembersScreen archiveOnly />};
      case 'polls': return {title: t('polls.title'), body: <MemoPollsScreen />};
      case 'network': return {title: t('network.title'), body: <MemoNetworkScreen />};
      case 'systemMap': return {
        title: t('systemMap.title'),
        right: <Text style={{fontSize: fs(11), color: T.dim}} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t('systemMap.relationships', {count: systemMapRelCount})}</Text>,
        body: <MemoSystemMapScreen onViewMember={openMemberById} onRelCountChange={setSystemMapRelCount} focus={mapFocus} />,
      };
      case 'credits': return {
        title: t('hub.credits'),
        body: (
          <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16, paddingBottom: 32}}>
            {CREDITS.map(c => (
              <TouchableOpacity key={c.url} onPress={() => openLink(c.url)} activeOpacity={0.7} accessibilityRole="link"
                style={{flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, backgroundColor: T.card, borderColor: T.border, padding: 14, marginBottom: 10}}>
                <Text accessibilityElementsHidden importantForAccessibility="no" style={{fontSize: fs(22), color: T.accent, marginRight: 14}}>✦</Text>
                <View style={{flex: 1}}>
                  <Text style={{fontSize: fs(13), fontWeight: '600', color: T.text}} numberOfLines={1}>{c.name}</Text>
                  <Text style={{fontSize: fs(11), color: T.dim, marginTop: 2}} numberOfLines={1}>{t(c.roleKey)}</Text>
                </View>
                <Text accessibilityElementsHidden importantForAccessibility="no" style={{fontSize: fs(14), color: T.dim, marginLeft: 8}}>↗</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ),
      };
      default: return null;
    }
  };

  const bareTile = (tile: HubTile): React.ReactNode => {
    switch (tile) {
      case 'mailbox': return <MemoMailboxScreen onBack={closeTile} />;
      case 'whiteboard': return <MemoWhiteboardScreen onBack={closeTile} />;
      case 'planner': return <PlannerScreen onBack={closeTile} />;
      case 'colors': return <MemoColorsScreen onBack={closeTile} />;
      default: return null;
    }
  };

  const framed = activeTile ? framedTile(activeTile) : null;
  if (framed) return <TileFrame title={framed.title} onBack={closeTile} right={framed.right}>{framed.body}</TileFrame>;
  const bare = activeTile ? bareTile(activeTile) : null;
  if (bare) return <View style={{flex: 1, backgroundColor: T.bg}}>{bare}</View>;

  const setTileDragBoth = (v: TileDrag | null) => {
    tileDragRef.current = v;
    setTileDrag(v);
  };

  const commitTileDrop = (id: string, from: number, target: number) => {
    const visIds = visIdsRef.current;
    if (target === from || target < 0 || target >= visIds.length) return;
    const order = tileOrderRef.current;
    const newFull = order.filter(x => x !== id);
    let insertAt = newFull.indexOf(visIds[target] as HubTile);
    if (insertAt < 0) return;
    if (target > from) insertAt += 1;
    newFull.splice(insertAt, 0, id as HubTile);
    setTileOrder(newFull);
    AsyncStorage.setItem(HUB_ORDER_KEY, JSON.stringify(newFull)).catch(e => logError('hub', e));
  };

  const makeTileResponder = (id: string) => {
    let handlers = tileRespondersRef.current.get(id);
    if (handlers) return {panHandlers: handlers};
    const finish = () => {
      const cur = tileDragRef.current;
      if (cur && cur.id === id) commitTileDrop(id, cur.from, cur.target);
      setTileDragBoth(null);
    };
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => tileReorderOnRef.current,
      onMoveShouldSetPanResponder: () => tileReorderOnRef.current,
      onPanResponderGrant: () => {
        const from = visIdsRef.current.indexOf(id);
        if (from < 0) return;
        setTileDragBoth({id, dx: 0, dy: 0, from, target: from});
      },
      onPanResponderMove: (_evt, gs) => {
        const cur = tileDragRef.current;
        if (!cur || cur.id !== id) return;
        const {w, h} = tileSizeRef.current;
        const gridW = gridWRef.current;
        const cols = tileColsRef.current;
        const colW = gridW > 0 ? gridW / cols : (w || 110);
        const rowH = (h || 104) + 10;
        const col = cur.from % cols;
        const row = Math.floor(cur.from / cols);
        const newCol = clamp(col + Math.round(gs.dx / colW), 0, cols - 1);
        const newRow = clamp(row + Math.round(gs.dy / rowH), 0, Math.ceil(visIdsRef.current.length / cols) - 1);
        const target = Math.min(newRow * cols + newCol, visIdsRef.current.length - 1);
        setTileDragBoth({...cur, dx: gs.dx, dy: gs.dy, target});
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
    });
    handlers = responder.panHandlers;
    tileRespondersRef.current.set(id, handlers);
    return {panHandlers: handlers};
  };

  const allTiles: {id: HubTile; icon: string; label: string}[] = [
    {id: 'planner', icon: '🗓', label: t('planner.title')},
    {id: 'retroHistory', icon: '◷', label: t('hub.retroHistory')},
    {id: 'statistics', icon: '⊞', label: t('hub.statistics')},
    {id: 'chat', icon: '⌨', label: t('hub.systemChat')},
    {id: 'mailbox', icon: '✉', label: t('mailbox.title')},
    {id: 'whiteboard', icon: '🖌', label: t('whiteboard.title')},
    {id: 'colors', icon: '🎨', label: t('colors.title')},
    {id: 'network', icon: '🛰', label: t('network.title')},
    {id: 'polls', icon: '📊', label: t('polls.title')},
    {id: 'systemMap', icon: '🕸', label: t('systemMap.title')},
    {id: 'customFields', icon: '☰', label: t('customFields.title')},
    {id: 'systemManager', icon: '🗂', label: t('systemManager.title')},
    {id: 'archive', icon: '🗃', label: t('hub.archive')},
    {id: 'share', icon: '⇅', label: t('hub.importExport')},
    {id: 'credits', icon: '✦', label: t('hub.credits')},
    {id: 'discord', icon: '💬', label: t('hub.discord')},
    {id: 'supportPS', icon: '☕', label: t('hub.supportPS')},
  ];
  const tiles = singlet ? allTiles.filter(tile => !SINGLET_HIDDEN_TILES.has(tile.id)) : allTiles;

  const handleTilePress = (tile: {id: HubTile}) => {
    const url = EXTERNAL_TILES[tile.id];
    if (url) openLink(url);
    else setActiveTile(tile.id);
  };

  const orderedTiles = [...tiles].sort((a, b) => tileOrder.indexOf(a.id) - tileOrder.indexOf(b.id));
  visIdsRef.current = orderedTiles.map(x => x.id);

  const moveTileStep = (id: string, dir: 1 | -1) => {
    const visIds = visIdsRef.current;
    const from = visIds.indexOf(id);
    const target = from + dir;
    if (from < 0 || target < 0 || target >= visIds.length) return;
    commitTileDrop(id, from, target);
    AccessibilityInfo.announceForAccessibility(t('a11y.movedToPosition', {n: target + 1, total: visIds.length}));
  };
  const osFontCap = Math.min(PixelRatio.getFontScale() || 1, 1.3);
  const tileCols = (T.textScale || 1) * osFontCap >= 1.4 ? 2 : 3;
  tileColsRef.current = tileCols;
  const tileWidth = tileCols === 2 ? '48%' : '31%';
  const labelReserve = Math.round(fs(30) * osFontCap);
  const iconCap = Math.min(PixelRatio.getFontScale() || 1, 1.2);
  const tileHeight = Math.max(104, Math.round(10 + fs(32) * iconCap + 6 + labelReserve + 10 + 4));

  return (
    <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 32}} scrollEnabled={!tileDrag}>
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20}}>
        <Text
          accessibilityRole="header"
          style={tileTitle(T)}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}>
          {t('hub.title')}
        </Text>
        <ReorderLockButton on={tileReorderOn} onToggle={() => setTileReorderOn(v => !v)} />
      </View>
      <View
        onLayout={e => { gridWRef.current = e.nativeEvent.layout.width; }}
        style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'flex-start'}}>
        {orderedTiles.map((tile, i) => {
          const isDragged = tileDrag?.id === tile.id;
          const isTarget = !!tileDrag && !isDragged && tileDrag.target === i;
          return (
            <TouchableOpacity
              key={tile.id}
              onPress={() => handleTilePress(tile)}
              onLayout={e => { tileSizeRef.current = {w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height}; }}
              activeOpacity={0.7}
              accessibilityRole={tileReorderOn ? 'adjustable' : 'button'}
              accessibilityLabel={tileReorderOn ? `${t('common.dragReorder')}, ${tile.label}` : tile.label}
              accessibilityValue={tileReorderOn ? {text: String(i + 1)} : undefined}
              accessibilityActions={tileReorderOn ? [{name: 'increment', label: t('a11y.moveNext')}, {name: 'decrement', label: t('a11y.movePrevious')}, {name: 'activate', label: t('a11y.open')}] : undefined}
              onAccessibilityAction={tileReorderOn ? e => {
                const action = e.nativeEvent.actionName;
                if (action === 'activate') handleTilePress(tile);
                else moveTileStep(tile.id, action === 'increment' ? 1 : -1);
              } : undefined}
              style={{
                width: tileWidth,
                height: tileHeight,
                borderRadius: 14,
                borderWidth: isTarget ? 2 : 1,
                backgroundColor: T.card,
                borderColor: isTarget ? T.accent : T.border,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 10,
                gap: 6,
                ...(isDragged && tileDrag ? {transform: [{translateX: tileDrag.dx}, {translateY: tileDrag.dy}], zIndex: 10, elevation: 8, opacity: 0.92} : null),
              }}>
              {tileReorderOn && (
                <View
                  {...makeTileResponder(tile.id).panHandlers}
                  accessible={false}
                  accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                  style={{position: 'absolute', top: 0, left: 0, paddingHorizontal: 10, paddingVertical: 8, zIndex: 2}}>
                  <Text style={{fontSize: fs(13), color: T.accent}} accessibilityElementsHidden importantForAccessibility="no">⠿</Text>
                </View>
              )}
              <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(26), lineHeight: fs(32), color: T.accent, textAlign: 'center', includeFontPadding: false}} maxFontSizeMultiplier={1.2}>{tile.icon}</Text>
              <Text style={{fontSize: fs(11), lineHeight: fs(15), minHeight: labelReserve, fontWeight: '600', color: T.text, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false}} numberOfLines={2} maxFontSizeMultiplier={1.3}>{tile.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
};
