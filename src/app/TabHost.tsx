import React, {useState, useEffect, useCallback, useRef, startTransition} from 'react';
import {View, StyleSheet} from 'react-native';
import {TabBar, Tab, TAB_IDS} from '../components/TabBar';
import {TabActiveContext, createTabActiveSources} from '../hooks/useTabActive';
import {useUiStore} from '../store/uiStore';
import {log} from '../utils/log';
import {registerTabControl} from './navigation';

export type TabMemory = {tab: Tab; mounted: Tab[]};

export const initialTabMemory = (): TabMemory => ({tab: 'front', mounted: ['front']});

const FrozenTab = React.memo(
  ({children}: {frozen: boolean; children: React.ReactNode}) => <>{children}</>,
  (_prev, next) => next.frozen,
);

export function TabHost({isSinglet, screens, memory}: {isSinglet: boolean; screens: Record<Tab, React.ReactNode>; memory: React.RefObject<TabMemory>}) {
  const [tab, setTab] = useState<Tab>(memory.current.tab);
  const [shownTab, setShownTab] = useState<Tab>(memory.current.tab);
  const [mountedTabs, setMountedTabs] = useState<Tab[]>(memory.current.mounted);
  const [activeSources] = useState(() => createTabActiveSources(TAB_IDS, memory.current.tab));
  const tabRef = useRef(tab);
  const tabSwitchStart = useRef<{id: Tab; at: number} | null>(null);
  const goTab = useCallback((id: Tab) => {
    tabSwitchStart.current = {id, at: Date.now()};
    tabRef.current = id;
    setTab(id);
    startTransition(() => {
      setMountedTabs(prev => prev.includes(id) ? prev : [...prev, id]);
      setShownTab(id);
    });
  }, []);
  useEffect(() => { registerTabControl({goTab, currentTab: () => tabRef.current}); return () => registerTabControl(null); }, [goTab]);
  const onReselectHub = useUiStore(s => s.reselectHub);
  useEffect(() => { memory.current = {tab: shownTab, mounted: mountedTabs}; }, [memory, shownTab, mountedTabs]);
  useEffect(() => { TAB_IDS.forEach(id => activeSources[id].set(id === shownTab)); }, [activeSources, shownTab]);
  useEffect(() => {
    const s = tabSwitchStart.current;
    if (!s || s.id !== shownTab) return;
    tabSwitchStart.current = null;
    const commit = Date.now() - s.at;
    requestAnimationFrame(() => log.debug('perf', `tab ${shownTab}: ${commit} ms to commit, ${Date.now() - s.at} ms to next frame`));
  }, [shownTab]);
  const onPressTab = useCallback((id: Tab) => {
    if (id === 'hub' && tabRef.current === 'hub') onReselectHub();
    goTab(id);
  }, [goTab, onReselectHub]);
  return (
    <>
      <View style={styles.content}>
        {TAB_IDS.map(id => mountedTabs.includes(id) ? (
          <View key={id} style={[StyleSheet.absoluteFill, shownTab === id ? null : styles.hiddenTab]} pointerEvents={shownTab === id ? 'auto' : 'none'}
            importantForAccessibility={shownTab === id ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={shownTab !== id}>
            <TabActiveContext.Provider value={activeSources[id]}>
              <FrozenTab frozen={shownTab !== id}>{screens[id]}</FrozenTab>
            </TabActiveContext.Provider>
          </View>
        ) : null)}
      </View>
      <TabBar tab={tab} isSinglet={isSinglet} onPressTab={onPressTab} />
    </>
  );
}

const styles = StyleSheet.create({
  content: {flex: 1},
  hiddenTab: {transform: [{translateX: 100000}]},
});
