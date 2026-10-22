import {listFormatter} from './intl';

export const DEFAULT_MOODS = [
  'Calm', 'Happy', 'Anxious', 'Tired', 'Energetic',
  'Dissociated', 'Grounded', 'Irritable', 'Sad', 'Focused',
];

export const moodChoices = (customMoods: string[] | undefined): string[] => [...DEFAULT_MOODS, ...(customMoods || [])];

const fmtMoodList = (items: string[]): string => listFormatter('mood', {style: 'narrow', type: 'conjunction'})(items);

export const translateMood = (mood: string, t: (k: string) => string): string => {
  if (!mood) return '';
  const parts = mood.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  const translateOne = (one: string): string => {
    const canon = DEFAULT_MOODS.find(d => d.toLowerCase() === one.toLowerCase());
    if (canon) {
      const translated = t(`mood.${canon}`);
      return translated && translated !== `mood.${canon}` ? translated : canon;
    }
    return one;
  };
  return fmtMoodList(parts.map(translateOne));
};

const MOOD_DELIMITER = ', ';
export const parseMoodList = (mood: string | undefined): string[] =>
  (mood || '').split(',').map(s => s.trim()).filter(Boolean);
export const serializeMoodList = (moods: string[]): string =>
  moods.filter(Boolean).map(s => s.trim()).filter(Boolean).join(MOOD_DELIMITER);
export const toggleMoodInList = (current: string | undefined, chip: string): string => {
  const list = parseMoodList(current);
  const i = list.indexOf(chip);
  if (i >= 0) list.splice(i, 1);
  else list.push(chip);
  return serializeMoodList(list);
};

export const withCustomMood = (mood: string, showCustom: boolean, customMood: string): string | undefined => {
  const moods = parseMoodList(mood);
  if (showCustom && customMood.trim()) moods.push(customMood.trim());
  return serializeMoodList(moods) || undefined;
};
