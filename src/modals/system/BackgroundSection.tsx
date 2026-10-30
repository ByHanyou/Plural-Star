import React, {useRef, useState} from 'react';
import {Alert, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {BackgroundImage} from '../../components/BackgroundImage';
import {useTheme} from '../../themeContext';
import {fontScale} from '../../theme';
import {launchImageLibrary} from 'react-native-image-picker';
import {logError} from '../../utils/log';
import {Btn} from '../../components/controls';

export const BackgroundSection = ({filename, onChange}: {filename?: string; onChange: (uri?: string) => Promise<void>}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const change = async (remove = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let uri: string | undefined;
    try {
      if (!remove) {
        const result = await launchImageLibrary({mediaType: 'photo', selectionLimit: 1, includeBase64: false, maxWidth: 1920, maxHeight: 1920, quality: 0.9});
        if (result.didCancel) return;
        if (result.errorCode) throw new Error(result.errorMessage || result.errorCode);
        const image = result.assets?.[0];
        if (!image?.uri) return;
        uri = /^(file|content):\/\//.test(image.uri) ? image.uri : `file://${image.uri}`;
      }
      await onChange(uri);
    } catch (e) {
      logError('background', e);
      Alert.alert(t('modal.saveFailed'), t('modal.backgroundImageFailed'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
      <Text accessibilityRole="header" style={{fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase', color: T.dim, marginBottom: 8, fontWeight: '600'}}>{t('modal.backgroundImage')}</Text>
      <Text style={{fontSize: fs(11), color: T.muted, lineHeight: fs(15), marginBottom: 10}}>{t('modal.backgroundImageDesc')}</Text>
      {filename && <View style={{height: 140, borderRadius: 10, overflow: 'hidden', marginBottom: 10}}>
        <BackgroundImage filename={filename} theme={T} />
      </View>}
      <View style={{flexDirection: 'row', gap: 8}}>
        <Btn disabled={busy} onPress={() => change()} style={{flex: 1}}>{t(filename ? 'modal.changeBackgroundImage' : 'modal.chooseBackgroundImage')}</Btn>
        {filename && <Btn variant="ghost" disabled={busy} onPress={() => change(true)}>{t('common.remove')}</Btn>}
      </View>
    </View>
  );
};
