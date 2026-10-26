import {createContext, useContext} from 'react';
import {DEFAULT_THEME} from './theme';
import type {ThemeColors} from './theme';

const ThemeContext = createContext<ThemeColors>(DEFAULT_THEME);

export const ThemeProvider = ThemeContext.Provider;

export const useTheme = (): ThemeColors => useContext(ThemeContext);
