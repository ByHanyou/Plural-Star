import {DARK_PALETTE} from '../themeColors';
import type {AppSettings, MedicalData, PlannerData, ShareSettings, SystemInfo} from './types';

export const EMPTY_SYSTEM: SystemInfo = {name: '', description: ''};

export const DEFAULT_MEDICAL: MedicalData = {
  medications: [],
  appointments: [],
  history: [],
  emergency: {showOnNotification: false},
};

export const DEFAULT_PLANNER: PlannerData = {
  appointments: [],
  reminders: [],
};

export const DEFAULT_SHARE: ShareSettings = {showFront: true, showMembers: true, showDescriptions: false};

export const DEFAULT_SETTINGS: AppSettings = {locations: [], customMoods: [], lightMode: false, gpsEnabled: false, filesEnabled: true, language: 'en', notificationsEnabled: true, noteboardNotifications: true, activePaletteId: DARK_PALETTE.id, textScale: 1.0, useDyslexicFont: false};

export const fontChoiceOf = (s: Pick<AppSettings, 'fontChoice' | 'useDyslexicFont'>): NonNullable<AppSettings['fontChoice']> =>
  s.fontChoice ?? (s.useDyslexicFont === true ? 'opendyslexic' : 'default');
