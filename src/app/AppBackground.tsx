import React, {useMemo} from 'react';
import {View} from 'react-native';
import {BackgroundImage} from '../components/BackgroundImage';
import {useAppStore} from '../store/appStore';
import {ThemeProvider, useTheme} from '../themeContext';
import {backgroundImageUri} from '../utils/backgroundImage';

// Only screen canvases are transparent; sheets, setup and the lock screen keep
// their normal palette. Profile themes can still supply their own solid canvas.
export function AppBackground({children}: {children: React.ReactNode}) {
  const theme = useTheme();
  const filename = useAppStore(s => s.appSettings.backgroundImage);
  const hasImage = !!backgroundImageUri(filename);
  const screenTheme = useMemo(() => ({...theme, canvas: hasImage ? 'transparent' : theme.bg}), [theme, hasImage]);
  return (
    <View style={{flex: 1, backgroundColor: theme.bg}}>
      <BackgroundImage filename={filename} theme={theme} />
      <ThemeProvider value={screenTheme}>{children}</ThemeProvider>
    </View>
  );
}
