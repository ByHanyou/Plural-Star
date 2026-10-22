import React, {useState} from 'react';
import {View, ScrollView, TouchableOpacity, Alert} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {DragHandle, ReorderLockButton} from '../../components/DragHandle';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {useAppStore} from '../../store/appStore';
import {saveChatChannels, saveChatCategories} from '../../store/actions';
import {useDragReorder} from '../../hooks/useDragReorder';
import {store, chatMsgKey} from '../../storage';
import {handOffTextFile} from '../../export/files';
import {deleteChatMediaFile} from '../../utils/mediaUtils';
import {announceMove} from '../../utils/announce';
import {logError} from '../../utils/log';
import {reportSaveError} from '../../utils/saveError';
import {sectionLabel} from '../../components/controls';
import {CHAT_CHANNEL_LIMIT, ChatChannel, ChatCategory, ChatMessage, uid, fmtTime, sortChatCategories, chatChannelsIn, applySortOrder, moveChannelToCategory, releaseCategoryChannels, fileSlug, moveInList} from '../../utils';
import {InlineRename, NewItemRow, Pill} from './ChatParts';

const isMedia = (m: ChatMessage) => m.type === 'image' || m.type === 'file';

export const ChannelList = ({activeChannelId, onOpen, onActiveGone, onCleared}: {
  activeChannelId: string | null; onOpen: (id: string) => void; onActiveGone: (nextId: string | null) => void; onCleared: (id: string) => void;
}) => {
  const T = useTheme();
  const channels = useAppStore(s => s.chatChannels);
  const categories = useAppStore(s => s.chatCategories);
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [reorderOn, setReorderOn] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [editChannelId, setEditChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [moveChannelId, setMoveChannelId] = useState<string | null>(null);

  const activeChannels = channels.filter(c => !c.archived);
  const archivedChannels = channels.filter(c => c.archived);
  const sortedCategories = sortChatCategories(categories);
  const uncategorized = chatChannelsIn(activeChannels, null, categories);
  const channelsOf = (categoryId: string | null | undefined) => chatChannelsIn(activeChannels, categoryId, categories);
  const commitChannels = (next: ChatChannel[]) => { saveChatChannels(next).catch(reportSaveError); };
  const commitCategories = (next: ChatCategory[]) => { saveChatCategories(next).catch(reportSaveError); };

  const reorderChannels = (ids: string[], from: number, to: number) => {
    const ordered = moveInList(ids, from, to);
    commitChannels(applySortOrder(channels, ordered));
    announceMove(to, ordered.length, channels.find(c => c.id === ordered[to - 1])?.name, false);
  };
  const reorderCategories = (ids: string[], from: number, to: number) => {
    const ordered = moveInList(ids, from, to);
    commitCategories(applySortOrder(categories, ordered));
    announceMove(to, ordered.length, categories.find(c => c.id === ordered[to - 1])?.name, false);
  };

  const stepChannel = (list: ChatChannel[], id: string, dir: 1 | -1) => {
    const ids = list.map(c => c.id);
    const from = ids.indexOf(id);
    const to = from + dir;
    if (from >= 0 && to >= 0 && to < ids.length) reorderChannels(ids, from, to);
  };
  const stepCategory = (cat: ChatCategory, dir: 1 | -1) => {
    const ids = sortedCategories.map(c => c.id);
    const from = ids.indexOf(cat.id);
    const to = from + dir;
    if (from >= 0 && to >= 0 && to < ids.length) reorderCategories(ids, from, to);
  };

  const chDrag = useDragReorder({enabled: reorderOn, onDrop: (_key, from, to, siblings) => reorderChannels(siblings, from, to)});
  const catDrag = useDragReorder({enabled: reorderOn, onDrop: (_key, from, to, siblings) => reorderCategories(siblings, from, to)});

  const isChannelDropTarget = (ch: ChatChannel, i: number) =>
    chDrag.dragging && chDrag.drag.key !== ch.id && chDrag.drag.target === i && chDrag.drag.siblings.includes(ch.id);

  const createCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    commitCategories([...categories, {id: uid(), name, sortOrder: sortedCategories.length, createdAt: Date.now()}]);
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  const renameCategory = (id: string) => {
    const name = editCategoryName.trim();
    if (!name) return;
    commitCategories(categories.map(c => (c.id === id ? {...c, name} : c)));
    setEditCategoryId(null);
    setEditCategoryName('');
  };

  const toggleCategory = (id: string) => commitCategories(categories.map(c => (c.id === id ? {...c, collapsed: !c.collapsed} : c)));

  const deleteCategory = (id: string) => {
    Alert.alert(t('chat.deleteCategory'), t('chat.deleteCategoryMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        if (channels.some(c => c.categoryId === id)) commitChannels(releaseCategoryChannels(channels, categories, id));
        commitCategories(categories.filter(c => c.id !== id));
      }},
    ]);
  };

  const assignChannel = (chId: string, categoryId: string | null) => {
    commitChannels(moveChannelToCategory(channels, categories, chId, categoryId));
    setMoveChannelId(null);
  };

  const createChannel = () => {
    const name = newChannelName.trim();
    if (!name) return;
    if (activeChannels.length >= CHAT_CHANNEL_LIMIT) {
      Alert.alert(t('chat.channelLimit'), t('chat.channelLimitMsg'));
      return;
    }
    const ch: ChatChannel = {id: uid(), name, sortOrder: uncategorized.length, createdAt: Date.now()};
    commitChannels([...channels, ch]);
    setNewChannelName('');
    setShowNewChannel(false);
    onOpen(ch.id);
  };

  const renameChannel = (id: string) => {
    const name = editChannelName.trim();
    if (!name) return;
    commitChannels(channels.map(c => c.id === id ? {...c, name} : c));
    setEditChannelId(null);
    setEditChannelName('');
  };

  const unarchiveChannel = (id: string) => commitChannels(channels.map(c => c.id === id ? {...c, archived: false, archivedAt: undefined} : c));

  const deleteChannel = (id: string) => {
    Alert.alert(t('chat.deleteChannel'), t('chat.deleteChannelMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        (async () => {
          const gone = (await store.get<ChatMessage[]>(chatMsgKey(id), [])) ?? [];
          await store.remove(chatMsgKey(id));
          const updated = channels.filter(c => c.id !== id);
          await saveChatChannels(updated);
          if (activeChannelId === id) onActiveGone(updated.find(c => !c.archived)?.id || null);
          for (const m of gone) if (isMedia(m)) deleteChatMediaFile(m.content).catch(e => logError('chat', e));
        })().catch(reportSaveError);
      }},
    ]);
  };

  const archiveChannel = (ch: ChatChannel) => {
    const snapshot = async (): Promise<string> => {
      const msgs = await store.get<ChatMessage[]>(chatMsgKey(ch.id), []) ?? [];
      const filename = `${fileSlug(ch.name, 'channel')}_${new Date().toISOString().slice(0, 10)}.json`;
      await handOffTextFile(JSON.stringify({channel: ch, messages: msgs}, null, 2), filename);
      return filename;
    };
    Alert.alert(t('chat.archiveChannel'), t('chat.archiveChannelMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('chat.archiveClose'), onPress: () => {
        (async () => {
          const filename = await snapshot();
          await store.remove(chatMsgKey(ch.id));
          await saveChatChannels(channels.map(c => c.id === ch.id ? {...c, archived: true, archivedAt: Date.now()} : c));
          if (activeChannelId === ch.id) onActiveGone(activeChannels.find(c => c.id !== ch.id)?.id || null);
          Alert.alert(t('chat.archived'), t('chat.archivedMsg', {filename}));
        })().catch(reportSaveError);
      }},
      {text: t('chat.archiveFresh'), onPress: () => {
        (async () => {
          const filename = await snapshot();
          await store.set(chatMsgKey(ch.id), []);
          onCleared(ch.id);
          Alert.alert(t('chat.archived'), t('chat.archivedFreshMsg', {filename}));
        })().catch(reportSaveError);
      }},
    ]);
  };

  const moveTargets: {id: string | null; name: string}[] = [{id: null, name: t('chat.uncategorized')}, ...sortedCategories.map(c => ({id: c.id, name: c.name}))];

  const renderChannelRow = (ch: ChatChannel, i: number, list: ChatChannel[]) => (
    <View
      key={ch.id}
      onLayout={e => chDrag.registerHeight(ch.id, e.nativeEvent.layout.height + 6)}
      style={{marginBottom: 6, ...(chDrag.drag.key === ch.id ? {transform: [{translateY: chDrag.drag.dy}], zIndex: 10, elevation: 6} : null)}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        {editChannelId === ch.id ? (
          <InlineRename value={editChannelName} onChange={setEditChannelName} label={t('chat.channelName')} onSubmit={() => renameChannel(ch.id)} onCancel={() => setEditChannelId(null)} top={6} />
        ) : (
          <>
            <DragHandle active={reorderOn}
              panHandlers={chDrag.makeHandlePanHandlers(ch.id, () => list.map(c => c.id))}
              name={ch.name} position={i + 1} count={list.length}
              onStep={dir => stepChannel(list, ch.id, dir)} />
            <TouchableOpacity onPress={() => onOpen(ch.id)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{selected: activeChannelId === ch.id}} accessibilityLabel={ch.name}
              hitSlop={{top: 6, bottom: 6}} style={{flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: T.card,
                borderColor: isChannelDropTarget(ch, i) ? T.accent : activeChannelId === ch.id ? `${T.accent}50` : T.border}}>
              <Text style={{fontSize: fs(14), fontWeight: '500', color: T.text}}># {ch.name}</Text>
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{top: 6, bottom: 15, left: 10, right: 10}} onPress={() => setMoveChannelId(moveChannelId === ch.id ? null : ch.id)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityState={{expanded: moveChannelId === ch.id}} accessibilityLabel={`${t('chat.moveToCategory')}, ${ch.name}`}>
              <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: moveChannelId === ch.id ? T.accent : T.dim}}>🗂</Text>
            </TouchableOpacity>
            <Pill compact onPress={() => {setEditChannelId(ch.id); setEditChannelName(ch.name);}} label={t('common.edit')} color={T.accent} bg={T.accentBg} a11y={t('common.editItem', {name: ch.name})} hitSlop={{top: 6, bottom: 12}} />
            <TouchableOpacity hitSlop={{top: 6, bottom: 15}} onPress={() => archiveChannel(ch)} accessibilityRole="button" accessibilityLabel={t('chat.archiveChannelNamed', {name: ch.name})}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: T.info}}>▼</Text></TouchableOpacity>
            <TouchableOpacity hitSlop={{top: 6, bottom: 15}} onPress={() => deleteChannel(ch.id)} accessibilityRole="button" accessibilityLabel={t('common.deleteItem', {name: ch.name})}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
          </>
        )}
      </View>
      {moveChannelId === ch.id && (
        <View style={{marginTop: 6, marginLeft: 30, padding: 8, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border}}>
          <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 6})}>{t('chat.moveToCategory')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{flexDirection: 'row', gap: 6}}>
              {moveTargets.map(opt => {
                const current = (ch.categoryId || null) === opt.id;
                return (
                  <TouchableOpacity key={opt.id ?? '__none__'} onPress={() => assignChannel(ch.id, opt.id)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: current}} accessibilityLabel={opt.name}
                    hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                      backgroundColor: current ? T.accentBg : T.bg, borderColor: current ? `${T.accent}50` : T.border}}>
                    <Text style={{fontSize: fs(11), color: current ? T.accent : T.text}}>{opt.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAwareScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 32}} bottomOffset={24}>
      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
        <Text accessibilityRole="header" style={sectionLabel(T, {flex: 1})}>{t('chat.channels')}</Text>
        <ReorderLockButton on={reorderOn} onToggle={() => setReorderOn(v => !v)} />
      </View>

      {sortedCategories.length > 0 && uncategorized.length > 0 && (
        <Text accessibilityRole="header" style={sectionLabel(T, {color: T.muted, marginBottom: 8})}>{t('chat.uncategorized')}</Text>
      )}
      {uncategorized.map((ch, i) => renderChannelRow(ch, i, uncategorized))}

      {sortedCategories.map((cat, ci) => {
        const list = channelsOf(cat.id);
        const catTarget = catDrag.dragging && catDrag.drag.key !== cat.id && catDrag.drag.target === ci;
        return (
          <View key={cat.id}
            onLayout={e => catDrag.registerHeight(cat.id, e.nativeEvent.layout.height + 14)}
            style={{marginTop: 14, ...(catDrag.drag.key === cat.id ? {transform: [{translateY: catDrag.drag.dy}], zIndex: 10, elevation: 6} : null)}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: catTarget ? T.accent : T.border}}>
              {editCategoryId === cat.id ? (
                <InlineRename value={editCategoryName} onChange={setEditCategoryName} label={t('chat.categoryName')} onSubmit={() => renameCategory(cat.id)} onCancel={() => setEditCategoryId(null)} top={12} />
              ) : (
                <>
                  <DragHandle active={reorderOn}
                    panHandlers={catDrag.makeHandlePanHandlers(cat.id, () => sortedCategories.map(c => c.id))}
                    name={cat.name} position={ci + 1} count={sortedCategories.length}
                    onStep={dir => stepCategory(cat, dir)} />
                  <TouchableOpacity onPress={() => toggleCategory(cat.id)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{expanded: !cat.collapsed}} accessibilityLabel={cat.name}
                    accessibilityValue={{text: String(list.length)}}
                    hitSlop={{top: 11, bottom: 11}} style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4}}>
                    <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(11), color: T.dim}}>{cat.collapsed ? '▸' : '▾'}</Text>
                    <Text style={sectionLabel(T, {flex: 1})}>{cat.name}</Text>
                    <Text style={{fontSize: fs(10), color: T.muted}}>{list.length}</Text>
                  </TouchableOpacity>
                  <Pill compact onPress={() => {setEditCategoryId(cat.id); setEditCategoryName(cat.name);}} label={t('common.edit')} color={T.accent} bg={T.accentBg} a11y={t('common.editItem', {name: cat.name})} hitSlop={{top: 12, bottom: 12}} />
                  <TouchableOpacity hitSlop={{top: 15, bottom: 15}} onPress={() => deleteCategory(cat.id)} accessibilityRole="button" accessibilityLabel={t('common.deleteItem', {name: cat.name})}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: T.danger}}>✕</Text></TouchableOpacity>
                </>
              )}
            </View>
            {!cat.collapsed && list.map((ch, i) => renderChannelRow(ch, i, list))}
            {!cat.collapsed && list.length === 0 && (
              <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', marginBottom: 6}}>{t('chat.categoryEmpty')}</Text>
            )}
          </View>
        );
      })}

      <NewItemRow open={showNewChannel} onOpen={() => setShowNewChannel(true)} value={newChannelName} onChange={setNewChannelName} label={t('chat.channelName')} newLabel={t('chat.newChannel')} onSubmit={createChannel} />

      <NewItemRow open={showNewCategory} onOpen={() => setShowNewCategory(true)} value={newCategoryName} onChange={setNewCategoryName} label={t('chat.categoryName')} newLabel={t('chat.newCategory')} onSubmit={createCategory} />

      {archivedChannels.length > 0 && (
        <View style={{marginTop: 20}}>
          <Text accessibilityRole="header" style={sectionLabel(T, {marginBottom: 10})}>{t('chat.archivedChannels')}</Text>
          {archivedChannels.map(ch => (
            <View key={ch.id} style={{padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border, marginBottom: 6, opacity: 0.75}}>
              <Text style={{fontSize: fs(14), color: T.text}}>#{ch.name}</Text>
              <Text style={{fontSize: fs(11), color: T.muted, marginTop: 2}}>{t('chat.archivedOn', {date: ch.archivedAt ? fmtTime(ch.archivedAt) : '?'})}</Text>
              <View style={{flexDirection: 'row', gap: 8, marginTop: 8}}>
                <TouchableOpacity onPress={() => unarchiveChannel(ch.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.unarchive')}
                  hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
                  <Text style={{fontSize: fs(11), fontWeight: '500', color: T.accent}}>{t('chat.unarchive')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteChannel(ch.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.delete')}
                  hitSlop={{top: 10, bottom: 10}} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: T.border}}>
                  <Text style={{fontSize: fs(11), color: T.muted}}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </KeyboardAwareScrollView>
  );
};
