import React, {useRef, useState} from 'react';
import {Alert, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text} from '../components/AppText';
import {BackgroundImage} from '../components/BackgroundImage';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';
import {useAppStore} from '../store/appStore';
import {setBackgroundImage} from '../store/actions';
import {pickImageForUpload} from '../utils/imagePicker';
import {removeBackgroundImage, saveBackgroundImageFromUri} from '../utils/mediaUtils';
import {logError} from '../utils/log';
import {Btn} from './shared';

export const BackgroundSettings = ({theme: T}: {theme: ThemeColors}) => {
  const {t} = useTranslation();
  const fs = fontScale(T);
  const filename = useAppStore(s => s.appSettings.backgroundImage);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const change = async (remove = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let next: string | undefined;
    try {
      if (!remove) {
        const image = await pickImageForUpload({maxWidth: 1920, maxHeight: 1920, quality: 0.9});
        if (!image) return;
        next = await saveBackgroundImageFromUri(image.uri);
      }
      const previous = useAppStore.getState().appSettings.backgroundImage;
      await setBackgroundImage(next);
      await removeBackgroundImage(previous);
    } catch (e) {
      if (useAppStore.getState().appSettings.backgroundImage !== next) await removeBackgroundImage(next);
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
        <Btn T={T} disabled={busy} onPress={() => change()} style={{flex: 1}}>{t(filename ? 'modal.changeBackgroundImage' : 'modal.chooseBackgroundImage')}</Btn>
        {filename && <Btn T={T} variant="ghost" disabled={busy} onPress={() => change(true)}>{t('common.remove')}</Btn>}
      </View>
    </View>
  );
};
