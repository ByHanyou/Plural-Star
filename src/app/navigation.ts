import type {Tab} from '../components/TabBar';

export type TabControl = {goTab: (id: Tab) => void; currentTab: () => Tab};

let control: TabControl | null = null;

export const registerTabControl = (next: TabControl | null): void => {
  control = next;
};

export const goTab = (id: Tab): void => {
  control?.goTab(id);
};

export const currentTab = (): Tab | null => (control ? control.currentTab() : null);
