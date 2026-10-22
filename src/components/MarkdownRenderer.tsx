import React from 'react';
import {View, Image, Linking} from 'react-native';
import type {ImageLoadEvent, ImageStyle, StyleProp, TextStyle} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {TFunction} from 'i18next';
import {Text} from './AppText';
import type {Member} from '../utils';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';
import {useTheme} from '../themeContext';
import {Block, Inline, Side, isImageUri, isSafeHref, limitBlocks, parseRichText} from '../markdown/parse';
import {logError} from '../utils/log';

type MemberLookup = {get: (id: string) => Member | undefined};

interface Ctx {
  T: ThemeColors;
  t: TFunction;
  members?: MemberLookup;
  onMentionPress?: (memberId: string) => void;
}

const fs = (s: number, T: ThemeColors): number => fontScale(T)(s);

const openSafeLink = (href: string): void => {
  if (!isSafeHref(href)) return;
  Linking.openURL(href.trim()).catch(e => logError('link', e));
};

const noteStyle = (T: ThemeColors): TextStyle => ({fontSize: fs(11, T), color: T.muted, fontStyle: 'italic'});

const measureRatio = (set: React.Dispatch<React.SetStateAction<number | null>>) => (e: ImageLoadEvent) => {
  const src = e.nativeEvent.source;
  if (!src || !(src.width > 0) || !(src.height > 0)) return;
  const real = src.width / src.height;
  set(prev => (prev && Math.abs(prev - real) < 0.01 ? prev : real));
};

const Unavailable = ({style}: {style?: TextStyle}) => {
  const T = useTheme();
  const {t} = useTranslation();
  return <Text style={[noteStyle(T), style]}>{t('markdown.imageUnavailable')}</Text>;
};

const UriImage = ({uri, style}: {uri: string; style: StyleProp<ImageStyle>}) => {
  const {t} = useTranslation();
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [uri]);
  if (failed) return <Unavailable />;
  return <Image source={{uri}} style={style} resizeMode="contain" resizeMethod="resize" accessibilityRole="image" accessibilityLabel={t('a11y.image')} onError={() => setFailed(true)} />;
};

const AutoImage = ({uri, hintRatio, hintW, side}: {uri: string; hintRatio?: number; hintW?: number; side?: Side}) => {
  const {t} = useTranslation();
  const [ratio, setRatio] = React.useState<number | null>(hintRatio || null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
    setRatio(hintRatio || null);
  }, [uri, hintRatio]);
  if (failed) return <Unavailable style={{alignSelf: side === 'right' ? 'flex-end' : 'auto'}} />;
  const r = ratio || 1.5;
  const self = side === 'right' ? 'flex-end' as const : 'flex-start' as const;
  const sizing = hintW && hintW > 0
    ? {width: hintW, maxWidth: '100%' as const, aspectRatio: r, alignSelf: self}
    : r >= 1
    ? {width: '100%' as const, aspectRatio: r}
    : {height: 280, aspectRatio: r, maxWidth: '100%' as const, alignSelf: self};
  return (
    <Image
      source={{uri}}
      style={[{borderRadius: 8, marginVertical: 2}, sizing]}
      resizeMode="contain"
      resizeMethod="resize"
      accessibilityRole="image"
      accessibilityLabel={t('a11y.image')}
      onLoad={hintRatio ? undefined : measureRatio(setRatio)}
      onError={() => setFailed(true)}
    />
  );
};

const SideImage = ({uri, w, ratio}: {uri: string; w?: number; ratio?: number}) => {
  const {t} = useTranslation();
  const [measured, setMeasured] = React.useState<number | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
    setMeasured(null);
  }, [uri]);
  if (failed) return <Unavailable style={{maxWidth: '45%'}} />;
  return (
    <Image
      source={{uri}}
      style={{width: w || 110, maxWidth: '45%', aspectRatio: ratio || measured || 1, borderRadius: 8}}
      resizeMode="contain"
      resizeMethod="resize"
      accessibilityRole="image"
      accessibilityLabel={t('a11y.image')}
      onLoad={ratio ? undefined : measureRatio(setMeasured)}
      onError={() => setFailed(true)}
    />
  );
};

const SideRow = ({side, image, children}: {side: Side; image: React.ReactNode; children: React.ReactNode}) => (
  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2}}>
    {side === 'left' ? image : null}
    <View style={{flex: 1, gap: 2}}>{children}</View>
    {side === 'right' ? image : null}
  </View>
);

const Spoiler = ({raw, render}: {raw: string; render: () => React.ReactNode}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const [open, setOpen] = React.useState(false);
  const cover = T.dim;
  return (
    <Text
      onPress={() => setOpen(v => !v)}
      accessibilityRole="button"
      accessibilityState={{expanded: open}}
      accessibilityLabel={open ? undefined : t('markdown.spoiler')}
      style={open
        ? {backgroundColor: `${cover}30`, borderRadius: 3}
        : {backgroundColor: cover, color: cover, borderRadius: 3}}>
      {open ? render() : <Text style={{color: cover}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{raw}</Text>}
    </Text>
  );
};

const brokenImage = (ctx: Ctx, key: string) =>
  <Text key={key} style={noteStyle(ctx.T)}>{ctx.t('markdown.brokenImage')}</Text>;

const renderInline = (nodes: Inline[], ctx: Ctx, prefix: string): React.ReactNode[] => {
  const {T} = ctx;
  return nodes.map((n, i) => {
    const key = `${prefix}${i}`;
    switch (n.kind) {
      case 'text': return n.text;
      case 'break': return '\n';
      case 'bold': return <Text key={key} style={{fontWeight: '700', color: T.text}}>{renderInline(n.children, ctx, key)}</Text>;
      case 'italic': return <Text key={key} style={{fontStyle: 'italic'}}>{renderInline(n.children, ctx, key)}</Text>;
      case 'boldItalic': return <Text key={key} style={{fontWeight: '700', fontStyle: 'italic', color: T.text}}>{renderInline(n.children, ctx, key)}</Text>;
      case 'underline': return <Text key={key} style={{textDecorationLine: 'underline'}}>{renderInline(n.children, ctx, key)}</Text>;
      case 'strike': return <Text key={key} style={{textDecorationLine: 'line-through'}}>{renderInline(n.children, ctx, key)}</Text>;
      case 'code': return <Text key={key} style={{fontFamily: 'monospace', backgroundColor: T.surface, fontSize: fs(12, T)}}>{` ${n.text} `}</Text>;
      case 'spoiler': return <Spoiler key={key} raw={n.raw} render={() => renderInline(n.children, ctx, key)} />;
      case 'mention': {
        const member = ctx.members?.get(n.memberId);
        const press = ctx.onMentionPress;
        const onPress = press && member ? () => press(n.memberId) : undefined;
        return (
          <Text key={key} onPress={onPress} accessibilityRole={onPress ? 'link' : undefined} style={{color: member?.color || T.muted, textDecorationLine: 'underline'}}>
            @{member?.name || n.name}
          </Text>
        );
      }
      case 'link':
        return <Text key={key} accessibilityRole="link" style={{color: T.info, textDecorationLine: 'underline'}} onPress={() => openSafeLink(n.href)}>{renderInline(n.children, ctx, key)}</Text>;
      case 'image': {
        const {url, width, height} = n.image;
        if (!isImageUri(url)) return brokenImage(ctx, key);
        return <UriImage key={key} uri={url} style={{width: width || 200, height: height || width || 200, borderRadius: 8, marginVertical: 4}} />;
      }
    }
  });
};

const lineStyle = (T: ThemeColors) => ({fontSize: fs(13, T), color: T.dim, lineHeight: fs(20, T)});

const HEADING_SIZE: Record<1 | 2 | 3, number> = {1: 18, 2: 16, 3: 14};

const renderBlock = (b: Block, ctx: Ctx, key: string): React.ReactNode => {
  const {T} = ctx;
  switch (b.kind) {
    case 'heading':
      return <Text key={key} accessibilityRole="header" style={{fontSize: fs(HEADING_SIZE[b.level], T), fontWeight: '700', color: T.text, marginBottom: 4}} maxFontSizeMultiplier={1.3}>{renderInline(b.children, ctx, key)}</Text>;
    case 'quote':
      return (
        <View key={key} style={{borderLeftWidth: 3, borderLeftColor: T.accent, paddingLeft: 10, marginVertical: 2}}>
          <Text style={{...lineStyle(T), fontStyle: 'italic'}} maxFontSizeMultiplier={1.3}>{renderInline(b.children, ctx, key)}</Text>
        </View>
      );
    case 'rule': return <View key={key} style={{height: 1, backgroundColor: T.border, marginVertical: 8}} />;
    case 'blank': return <View key={key} style={{height: 8}} />;
    case 'code':
      return (
        <View key={key} style={{backgroundColor: T.surface, padding: 10, borderRadius: 8, marginVertical: 4}}>
          <Text style={{fontFamily: 'monospace', fontSize: fs(12, T), color: T.dim}}>{b.text}</Text>
        </View>
      );
    case 'list':
      return (
        <View key={key} style={{marginVertical: 2}}>
          {b.items.map((item, j) => (
            <View key={`${key}-${j}`} style={{flexDirection: 'row', gap: 6, marginVertical: 1, paddingLeft: item.depth * 14}}>
              {item.ordered
                ? <Text style={{fontSize: fs(13, T), color: T.dim, width: 16, textAlign: 'right'}} maxFontSizeMultiplier={1.3}>{item.n}.</Text>
                : <Text style={{fontSize: fs(13, T), color: T.dim}} maxFontSizeMultiplier={1.3} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">•</Text>}
              <Text style={{...lineStyle(T), flex: 1}} maxFontSizeMultiplier={1.3}>{renderInline(item.children, ctx, `${key}-${j}`)}</Text>
            </View>
          ))}
        </View>
      );
    case 'image': {
      const {url, width, height, side} = b.image;
      if (!isImageUri(url)) return brokenImage(ctx, key);
      return <AutoImage key={key} uri={url} hintRatio={width && height ? width / height : undefined} hintW={width && height ? width : undefined} side={side} />;
    }
    case 'aside': {
      const img = b.image;
      return (
        <SideRow key={key} side={img.side || 'left'} image={<SideImage uri={img.url} w={img.width} ratio={img.width && img.height ? img.width / img.height : undefined} />}>
          {b.children.map((c, j) => renderBlock(c, ctx, `${key}-${j}`))}
        </SideRow>
      );
    }
    case 'paragraph':
      return <Text key={key} style={lineStyle(T)} maxFontSizeMultiplier={1.3}>{renderInline(b.children, ctx, key)}</Text>;
  }
};

const lazyMemberLookup = (members: Member[]): MemberLookup => {
  let map: Map<string, Member> | undefined;
  const build = () => {
    const next = new Map<string, Member>();
    for (const m of members) if (!next.has(m.id)) next.set(m.id, m);
    return next;
  };
  return {get: id => (map || (map = build())).get(id)};
};

export const RichText = React.memo(function RichText({text, numberOfLines, members, memberById, onMentionPress}: {
  text: string;
  numberOfLines?: number;
  members?: Member[];
  memberById?: MemberLookup;
  onMentionPress?: (memberId: string) => void;
}) {
  const T = useTheme();
  const {t} = useTranslation();
  const lookup = React.useMemo(
    () => memberById || (members ? lazyMemberLookup(members) : undefined),
    [memberById, members],
  );
  const blocks = React.useMemo(() => limitBlocks(parseRichText(text), numberOfLines), [text, numberOfLines]);
  return React.useMemo(() => {
    if (blocks.length === 0) return null;
    const ctx: Ctx = {T, t, members: lookup, onMentionPress};
    return <View style={{gap: 2}}>{blocks.map((b, i) => renderBlock(b, ctx, `b${i}`))}</View>;
  }, [blocks, T, t, lookup, onMentionPress]);
});
