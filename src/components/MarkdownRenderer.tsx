import React from 'react';
import {View, Image, Linking} from 'react-native';
import {Text} from './AppText';
import type {Member} from '../utils';
import i18n from '../i18n/i18n';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';

const IMAGE_URL_RE = /https?:\/\/\S+\.(?:gif|png|pnj|jpe?g|webp|bmp|svg)(?:[?#]\S*)?/i;
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/;
const MENTION_RE = /@\[([^\]]+)\]\(member:([a-zA-Z0-9_-]+)\)/g;

type Side = 'left' | 'right';
const SIDE_ALT = 'ps-side:';
const imgTagSide = (tag: string): Side | null => {
  const m = tag.match(/\salign\s*=\s*["']?\s*(left|right)\b/i);
  if (!m) return null;
  return m[1].toLowerCase() === 'right' ? 'right' : 'left';
};
const altSide = (alt: string): Side | null => (alt === `${SIDE_ALT}left` ? 'left' : alt === `${SIDE_ALT}right` ? 'right' : null);
const lineHasImage = (line: string): boolean => MD_IMAGE_RE.test(line) || IMAGE_URL_RE.test(line);
const parseImageRef = (raw: string): {url: string; w?: number; h?: number} => {
  const s = raw.trim();
  const hint = s.match(/#(\d+)x(\d+)$/);
  const w = hint ? Number(hint[1]) : 0;
  const h = hint ? Number(hint[2]) : 0;
  return {url: s.replace(/[)]+$/, '').replace(/#\d+x\d+$/, '').trim(), w: w > 0 ? w : undefined, h: h > 0 ? h : undefined};
};

const fs = (s: number, T: ThemeColors): number => fontScale(T)(s);

const openSafeLink = (href: string): void => {
  const h = (href || '').trim();
  if (!/^(https?:\/\/|mailto:)/i.test(h)) return;
  Linking.openURL(h).catch(() => {});
};

const isValidImageUri = (u: unknown): u is string => {
  if (typeof u !== 'string') return false;
  const s = u.trim();
  if (!s) return false;
  return /^https?:\/\//i.test(s) || /^file:\/\//i.test(s) || /^content:\/\//i.test(s) || s.startsWith('data:image/');
};

const UriImage = ({uri, style, T}: {uri: string; style: any; T: ThemeColors}) => {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [uri]);
  if (failed) {
    return <Text style={{fontSize: fs(11, T), color: T?.muted || '#888', fontStyle: 'italic'}}>{i18n.t('markdown.imageUnavailable')}</Text>;
  }
  return <Image source={{uri}} style={style} resizeMode="contain" accessibilityRole="image" accessibilityLabel={i18n.t('a11y.image')} onError={() => setFailed(true)} />;
};

const AutoImage = ({uri, T, hintRatio, hintW, side}: {uri: string; T: ThemeColors; hintRatio?: number; hintW?: number; side?: Side}) => {
  const [ratio, setRatio] = React.useState<number | null>(hintRatio || null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
    setRatio(hintRatio || null);
  }, [uri, hintRatio]);
  if (failed) {
    return <Text style={{fontSize: fs(11, T), color: T?.muted || '#888', fontStyle: 'italic', alignSelf: side === 'right' ? 'flex-end' : 'auto'}}>{i18n.t('markdown.imageUnavailable')}</Text>;
  }
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
      accessibilityRole="image"
      accessibilityLabel={i18n.t('a11y.image')}
      onLoad={e => {
        if (hintRatio) return;
        const src: any = (e?.nativeEvent as any)?.source;
        if (!src || !(src.width > 0) || !(src.height > 0)) return;
        const real = src.width / src.height;
        setRatio(prev => (prev && Math.abs(prev - real) < 0.01 ? prev : real));
      }}
      onError={() => setFailed(true)}
    />
  );
};

const SideImage = ({uri, T, w, ratio}: {uri: string; T: ThemeColors; w?: number; ratio?: number}) => {
  const [measured, setMeasured] = React.useState<number | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
    setMeasured(null);
  }, [uri]);
  if (failed) {
    return <Text style={{fontSize: fs(11, T), color: T?.muted || '#888', fontStyle: 'italic', maxWidth: '45%'}}>{i18n.t('markdown.imageUnavailable')}</Text>;
  }
  return (
    <Image
      source={{uri}}
      style={{width: w || 110, maxWidth: '45%', aspectRatio: ratio || measured || 1, borderRadius: 8}}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={i18n.t('a11y.image')}
      onLoad={e => {
        if (ratio) return;
        const src: any = (e?.nativeEvent as any)?.source;
        if (!src || !(src.width > 0) || !(src.height > 0)) return;
        const real = src.width / src.height;
        setMeasured(prev => (prev && Math.abs(prev - real) < 0.01 ? prev : real));
      }}
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

const SPOILER_RE = /\|\|(.+?)\|\|/;
const Spoiler = ({T, raw, render}: {T: ThemeColors; raw: string; render: () => React.ReactNode}) => {
  const [open, setOpen] = React.useState(false);
  const cover = T?.dim || '#666';
  return (
    <Text
      onPress={() => setOpen(v => !v)}
      accessibilityRole="button"
      accessibilityState={{expanded: open}}
      accessibilityLabel={open ? undefined : i18n.t('markdown.spoiler')}
      style={open
        ? {backgroundColor: `${cover}30`, borderRadius: 3}
        : {backgroundColor: cover, color: cover, borderRadius: 3}}>
      {open ? render() : <Text style={{color: cover}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{raw}</Text>}
    </Text>
  );
};
const spoilerKey = (i: number, raw: string) => `sp-${i}-${raw.length}-${raw.slice(0, 24)}`;

const renderTextWithMentions = (
  text: string,
  T: ThemeColors,
  members?: Member[],
  onMentionPress?: (memberId: string) => void,
  baseStyle?: object,
): React.ReactNode => {
  if (!text) return text;
  if (text.indexOf('||') !== -1) {
    const sre = new RegExp(SPOILER_RE.source, 'g');
    const out: React.ReactNode[] = [];
    let last = 0;
    let sm: RegExpExecArray | null;
    let k = 0;
    while ((sm = sre.exec(text)) !== null) {
      if (sm.index > last) out.push(<React.Fragment key={`t-${k++}`}>{renderMentionsOnly(text.slice(last, sm.index), T, members, onMentionPress, baseStyle)}</React.Fragment>);
      { const raw = sm[1]; out.push(<Spoiler key={spoilerKey(k++, raw)} T={T} raw={raw} render={() => renderMentionsOnly(raw, T, members, onMentionPress, baseStyle)} />); }
      last = sm.index + sm[0].length;
    }
    if (last < text.length) out.push(<React.Fragment key={`t-${k++}`}>{renderMentionsOnly(text.slice(last), T, members, onMentionPress, baseStyle)}</React.Fragment>);
    if (out.length > 0) return <>{out}</>;
  }
  return renderMentionsOnly(text, T, members, onMentionPress, baseStyle);
};

const renderMentionsOnly = (
  text: string,
  T: ThemeColors,
  members?: Member[],
  onMentionPress?: (memberId: string) => void,
  baseStyle?: object,
): React.ReactNode => {
  if (!text || text.indexOf('@[') === -1) return text;
  const re = new RegExp(MENTION_RE.source, 'g');
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const storedName = m[1];
    const id = m[2];
    const member = members?.find(mb => mb.id === id);
    const displayName = member?.name || storedName;
    const color = member?.color || T?.muted || '#888';
    const onPress = onMentionPress && member ? () => onMentionPress(id) : undefined;
    parts.push(
      <Text
        key={`men-${key++}`}
        onPress={onPress}
        accessibilityRole={onPress ? 'link' : undefined}
        style={{...(baseStyle || {}), color, textDecorationLine: 'underline'}}>
        @{displayName}
      </Text>,
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  if (parts.length === 1 && typeof parts[0] === 'string') return parts[0];
  return <>{parts}</>;
};

const isHTML = (text: string): boolean => {
  const t = text.trim();
  if (/^<(?:img|br)\b/i.test(t)) {
    return /<(?:p|h[1-6]|div|ul|ol|blockquote|pre|hr|strong|em|b|i|s|del|code|a)\b/i.test(t);
  }
  return /<(?:p|h[1-6]|div|ul|ol|blockquote|pre|hr|strong|em|b|i|s|del|code|a)\b/i.test(t);
};

const decodeEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

const renderInlineHTML = (html: string, T: ThemeColors, members?: Member[], onMentionPress?: (id: string) => void): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let remaining = html;
  let key = 0;
  const hasAnyImage = /<img\s/i.test(html);
  const wrapText = (s: string): React.ReactNode => {
    if (!s) return null;
    const rendered = renderTextWithMentions(s, T, members, onMentionPress);
    if (hasAnyImage) return <Text key={key++} style={{fontSize: fs(13, T), color: T.dim, lineHeight: 20}}>{rendered}</Text>;
    return rendered;
  };
  const imgRe = /<img\s[^>]*>/i;
  const inlineRe = /<(strong|b|em|i|s|del|code|a)(\s[^>]*)?>(.+?)<\/\1>/;
  while (remaining.length > 0) {
    const imgM = remaining.match(imgRe);
    const inlineM = remaining.match(inlineRe);
    const imgIdx = imgM?.index ?? Infinity;
    const inlineIdx = inlineM?.index ?? Infinity;

    if (imgIdx < inlineIdx && imgM && imgM.index !== undefined) {
      if (imgM.index > 0) {
        const before = decodeEntities(remaining.slice(0, imgM.index).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, '')).trim();
        const wrapped = wrapText(before);
        if (wrapped) parts.push(wrapped);
      }
      const srcMatch = imgM[0].match(/src=["']([^"']+)["']/);
      const widthMatch = imgM[0].match(/width=["']?(\d+)["']?/);
      const heightMatch = imgM[0].match(/height=["']?(\d+)["']?/);
      if (srcMatch) {
        const url = srcMatch[1];
        const isValidUrl = /^https?:\/\//i.test(url) || /^file:\/\//i.test(url) || url.startsWith('data:');
        const w = widthMatch ? Number(widthMatch[1]) : undefined;
        const h = heightMatch ? Number(heightMatch[1]) : undefined;
        if (isValidUrl) {
          parts.push(<UriImage key={key++} uri={url} style={{width: w || 200, height: h || w || 200, borderRadius: 8, marginVertical: 4}} T={T} />);
        } else {
          parts.push(<Text key={key++} style={{fontSize: fs(11, T), color: T.muted, fontStyle: 'italic'}}>{i18n.t('markdown.brokenImageUrl', {url})}</Text>);
        }
      }
      remaining = remaining.slice(imgM.index + imgM[0].length);
      continue;
    }

    if (!inlineM || inlineM.index === undefined) {
      const tail = decodeEntities(remaining.replace(/<br\s*\/?>/g, '\n').replace(/<img\s[^>]*>/gi, '').replace(/<[^>]*>/g, ''));
      const wrapped = wrapText(tail);
      if (wrapped) parts.push(wrapped);
      break;
    }
    if (inlineM.index > 0) {
      const before = decodeEntities(remaining.slice(0, inlineM.index).replace(/<br\s*\/?>/g, '\n').replace(/<img\s[^>]*>/gi, '').replace(/<[^>]*>/g, ''));
      const wrapped = wrapText(before);
      if (wrapped) parts.push(wrapped);
    }
    const tag = inlineM[1]; const attrs = inlineM[2] || ''; const inner = inlineM[3];
    switch (tag) {
      case 'strong': case 'b': parts.push(<Text key={key++} style={{fontWeight: '700', color: T.text}}>{renderInlineHTML(inner, T, members, onMentionPress)}</Text>); break;
      case 'em': case 'i': parts.push(<Text key={key++} style={{fontStyle: 'italic'}}>{renderInlineHTML(inner, T, members, onMentionPress)}</Text>); break;
      case 's': case 'del': parts.push(<Text key={key++} style={{textDecorationLine: 'line-through'}}>{renderInlineHTML(inner, T, members, onMentionPress)}</Text>); break;
      case 'code': parts.push(<Text key={key++} style={{fontFamily: 'monospace', backgroundColor: T.surface, fontSize: fs(12, T)}}>{` ${decodeEntities(inner)} `}</Text>); break;
      case 'a': { const href = (attrs.match(/href=["']([^"']+)["']/) || [])[1] || ''; parts.push(<Text key={key++} accessibilityRole="link" style={{color: T.info, textDecorationLine: 'underline'}} onPress={() => openSafeLink(href)}>{renderInlineHTML(inner, T, members, onMentionPress)}</Text>); break; }
      default: { const wrapped = wrapText(decodeEntities(inner)); if (wrapped) parts.push(wrapped); }
    }
    remaining = remaining.slice(inlineM.index + inlineM[0].length);
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>;
};

const renderHTMLBlocks = (html: string, T: ThemeColors, members?: Member[], onMentionPress?: (id: string) => void): React.ReactNode => {
  const blocks: React.ReactNode[] = [];
  let key = 0;
  const blockRe = /<(p|h[1-3]|blockquote|ul|ol|pre|hr|li|div)(\s[^>]*)?>|<\/(p|h[1-3]|blockquote|ul|ol|pre|li|div)>/g;
  const tagStack: string[] = [];
  let segments: {tag: string; content: string; listItems?: string[]}[] = [];
  let current = '';
  let currentTag = 'p';
  let listItems: string[] = [];
  let inList = '';
  let lastIdx = 0;
  let match;

  const raw = html.replace(/\n/g, '');

  while ((match = blockRe.exec(raw)) !== null) {
    const [full, openTag, attrs, closeTag] = match;
    const tag = (openTag || closeTag || '').toLowerCase();

    // Every branch falls through to the capture below: an early `continue` here
    // skipped the text that follows the tag, which emptied list items and lost
    // blockquote and pre content.
    if (openTag) {
      if (tag === 'hr') { if (current.trim()) segments.push({tag: currentTag, content: current}); current = ''; segments.push({tag: 'hr', content: ''}); }
      else if (tag === 'ul' || tag === 'ol') { if (current.trim()) segments.push({tag: currentTag, content: current}); current = ''; inList = tag; listItems = []; }
      else if (tag === 'li') { current = ''; }
      else if (tag === 'pre' || tag === 'blockquote') { if (current.trim()) segments.push({tag: currentTag, content: current}); current = ''; currentTag = tag; }
      else {
        if (current.trim()) segments.push({tag: currentTag, content: current});
        current = '';
        currentTag = tag;
      }
    } else if (closeTag) {
      if (closeTag === 'li') { listItems.push(current); current = ''; }
      else if (closeTag === 'ul' || closeTag === 'ol') { segments.push({tag: closeTag, content: '', listItems: [...listItems]}); inList = ''; listItems = []; }
      else {
        if (current.trim() || closeTag === 'p') segments.push({tag: currentTag, content: current});
        current = '';
        currentTag = 'p';
      }
    }
    lastIdx = match.index + full.length;
    const nextMatch = blockRe.exec(raw);
    if (nextMatch) { current = raw.slice(lastIdx, nextMatch.index); blockRe.lastIndex = nextMatch.index; }
    else { current = raw.slice(lastIdx); blockRe.lastIndex = raw.length; }
  }
  if (current.trim()) segments.push({tag: currentTag, content: current});

  if (segments.length === 0 && raw.trim()) {
    segments.push({tag: 'p', content: raw});
  }

  return (
    <View style={{gap: 2}}>
      {segments.map((seg, i) => {
        switch (seg.tag) {
          case 'h1': return <Text key={i} style={{fontSize: fs(18, T), fontWeight: '700', color: T.text, marginBottom: 4}}>{renderInlineHTML(seg.content, T, members, onMentionPress)}</Text>;
          case 'h2': return <Text key={i} style={{fontSize: fs(16, T), fontWeight: '700', color: T.text, marginBottom: 4}}>{renderInlineHTML(seg.content, T, members, onMentionPress)}</Text>;
          case 'h3': return <Text key={i} style={{fontSize: fs(14, T), fontWeight: '700', color: T.text, marginBottom: 4}}>{renderInlineHTML(seg.content, T, members, onMentionPress)}</Text>;
          case 'blockquote': return <View key={i} style={{borderLeftWidth: 3, borderLeftColor: T.accent, paddingLeft: 10, marginVertical: 2}}><Text style={{fontSize: fs(13, T), color: T.dim, fontStyle: 'italic', lineHeight: 20}}>{renderInlineHTML(seg.content, T, members, onMentionPress)}</Text></View>;
          case 'pre': return <View key={i} style={{backgroundColor: T.surface, padding: 10, borderRadius: 8, marginVertical: 4}}><Text style={{fontFamily: 'monospace', fontSize: fs(12, T), color: T.dim}}>{decodeEntities(seg.content.replace(/<[^>]*>/g, ''))}</Text></View>;
          case 'hr': return <View key={i} style={{height: 1, backgroundColor: T.border, marginVertical: 8}} />;
          case 'ul': return <View key={i} style={{marginVertical: 2}}>{(seg.listItems || []).map((li, j) => <View key={j} style={{flexDirection: 'row', gap: 6, marginVertical: 1}}><Text style={{fontSize: fs(13, T), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">•</Text><Text style={{fontSize: fs(13, T), color: T.dim, flex: 1, lineHeight: 20}}>{renderInlineHTML(li, T, members, onMentionPress)}</Text></View>)}</View>;
          case 'ol': return <View key={i} style={{marginVertical: 2}}>{(seg.listItems || []).map((li, j) => <View key={j} style={{flexDirection: 'row', gap: 6, marginVertical: 1}}><Text style={{fontSize: fs(13, T), color: T.dim, width: 16, textAlign: 'right'}}>{j + 1}.</Text><Text style={{fontSize: fs(13, T), color: T.dim, flex: 1, lineHeight: 20}}>{renderInlineHTML(li, T, members, onMentionPress)}</Text></View>)}</View>;
          case 'p': default: {
            const content = seg.content.trim();
            if (!content) return <View key={i} style={{height: 4}} />;
            const imgCount = (content.match(/<img\s/gi) || []).length;
            if (imgCount === 1) {
              const imgM = content.match(/<img\s[^>]*>/i);
              if (imgM && imgM.index !== undefined) {
                const restHtml = (content.slice(0, imgM.index) + ' ' + content.slice(imgM.index + imgM[0].length));
                const restPlain = restHtml.replace(/<[^>]*>/g, '').trim();
                const srcMatch = imgM[0].match(/src=["']([^"']+)["']/);
                const url = srcMatch ? srcMatch[1] : '';
                const validUrl = /^https?:\/\//i.test(url) || /^file:\/\//i.test(url) || url.startsWith('data:');
                const wAttr = imgM[0].match(/width=["']?(\d+)["']?/);
                const hAttr = imgM[0].match(/height=["']?(\d+)["']?/);
                const w = wAttr ? Number(wAttr[1]) : 0;
                const h = hAttr ? Number(hAttr[1]) : 0;
                const side = imgTagSide(imgM[0]);
                if (validUrl && restPlain.length > 0) {
                  return (
                    <SideRow key={i} side={side || 'left'} image={<SideImage uri={url} T={T} w={w > 0 ? w : undefined} ratio={w > 0 && h > 0 ? w / h : undefined} />}>
                      <Text style={{fontSize: fs(13, T), color: T.dim, lineHeight: 20}}>{renderInlineHTML(restHtml, T, members, onMentionPress)}</Text>
                    </SideRow>
                  );
                }
                if (validUrl && side) {
                  return (
                    <View key={i} style={{marginVertical: 2, alignItems: side === 'right' ? 'flex-end' : 'flex-start'}}>
                      <UriImage uri={url} style={{width: w || 200, height: h || w || 200, borderRadius: 8, marginVertical: 4}} T={T} />
                    </View>
                  );
                }
              }
            }
            if (imgCount >= 1) {
              return <View key={i} style={{marginVertical: 2}}>{renderInlineHTML(content, T, members, onMentionPress)}</View>;
            }
            return <Text key={i} style={{fontSize: fs(13, T), color: T.dim, lineHeight: 20}}>{renderInlineHTML(content, T, members, onMentionPress)}</Text>;
          }
        }
      })}
    </View>
  );
};

const renderInline = (text: string, T: ThemeColors, members?: Member[], onMentionPress?: (id: string) => void): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  const patterns: [RegExp, (m: RegExpMatchArray) => React.ReactNode][] = [
    [SPOILER_RE, m => { const raw = m[1]; return <Spoiler key={spoilerKey(key++, raw)} T={T} raw={raw} render={() => renderInline(raw, T, members, onMentionPress)} />; }],
    [/@\[([^\]]+)\]\(member:([a-zA-Z0-9_-]+)\)/, m => {
      const member = members?.find(mb => mb.id === m[2]);
      const displayName = member?.name || m[1];
      const color = member?.color || T.muted;
      return (
        <Text
          key={key++}
          onPress={onMentionPress && member ? () => onMentionPress(m[2]) : undefined}
          accessibilityRole={onMentionPress && member ? 'link' : undefined}
          style={{color, textDecorationLine: 'underline'}}>
          @{displayName}
        </Text>
      );
    }],
    [/\*\*\*(.+?)\*\*\*/, m => <Text key={key++} style={{fontWeight: '700', fontStyle: 'italic', color: T.text}}>{m[1]}</Text>],
    [/\*\*(.+?)\*\*/, m => <Text key={key++} style={{fontWeight: '700', color: T.text}}>{m[1]}</Text>],
    [/\*(.+?)\*/, m => <Text key={key++} style={{fontStyle: 'italic'}}>{m[1]}</Text>],
    [/~~(.+?)~~/, m => <Text key={key++} style={{textDecorationLine: 'line-through'}}>{m[1]}</Text>],
    [/`(.+?)`/, m => <Text key={key++} style={{fontFamily: 'monospace', backgroundColor: T.surface, fontSize: fs(12, T)}}>{` ${m[1]} `}</Text>],
    [/!\[([^\]]*)\]\(([^)]+)\)/, m => {
      const url = m[2].replace(/[)]+$/, '').trim();
      if (!isValidImageUri(url)) return <Text key={key++} style={{fontSize: fs(11, T), color: T.muted, fontStyle: 'italic'}}>{i18n.t('markdown.brokenImage')}</Text>;
      return <UriImage key={key++} uri={url} style={{width: 200, height: 200, borderRadius: 8}} T={T} />;
    }],
    [/\[(.+?)\]\((.+?)\)/, m => <Text key={key++} accessibilityRole="link" style={{color: T.info, textDecorationLine: 'underline'}} onPress={() => openSafeLink(m[2])}>{m[1]}</Text>],
  ];
  while (remaining.length > 0) {
    let earliest: {idx: number; len: number; node: React.ReactNode} | null = null;
    for (const [re, fn] of patterns) {
      const m = remaining.match(re);
      if (m && m.index !== undefined) {
        const node = fn(m);
        if (!earliest || m.index < earliest.idx) earliest = {idx: m.index, len: m[0].length, node};
      }
    }
    if (!earliest) { parts.push(remaining); break; }
    if (earliest.idx > 0) parts.push(remaining.slice(0, earliest.idx));
    parts.push(earliest.node);
    remaining = remaining.slice(earliest.idx + earliest.len);
  }
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
};

const renderMarkdownLine = (line: string, T: ThemeColors, i: React.Key, members?: Member[], onMentionPress?: (id: string) => void): React.ReactNode => {
  if (line.startsWith('### ')) return <Text key={i} style={{fontSize: fs(14, T), fontWeight: '700', color: T.text, marginBottom: 4}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(4), T, members, onMentionPress)}</Text>;
  if (line.startsWith('## ')) return <Text key={i} style={{fontSize: fs(16, T), fontWeight: '700', color: T.text, marginBottom: 4}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(3), T, members, onMentionPress)}</Text>;
  if (line.startsWith('# ')) return <Text key={i} style={{fontSize: fs(18, T), fontWeight: '700', color: T.text, marginBottom: 4}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(2), T, members, onMentionPress)}</Text>;
  if (line.startsWith('> ')) return <View key={i} style={{borderLeftWidth: 3, borderLeftColor: T.accent, paddingLeft: 10, marginVertical: 2}}><Text style={{fontSize: fs(13, T), color: T.dim, fontStyle: 'italic', lineHeight: 20}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(2), T, members, onMentionPress)}</Text></View>;
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return <View key={i} style={{height: 1, backgroundColor: T.border, marginVertical: 8}} />;
  if (line.match(/^[-*] /)) return <View key={i} style={{flexDirection: 'row', gap: 6, marginVertical: 1}}><Text style={{fontSize: fs(13, T), color: T.dim}} maxFontSizeMultiplier={1.3} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">•</Text><Text style={{fontSize: fs(13, T), color: T.dim, flex: 1, lineHeight: 20}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(2), T, members, onMentionPress)}</Text></View>;
  if (line.match(/^\d+\. /)) {const m = line.match(/^(\d+)\. (.*)$/); return <View key={i} style={{flexDirection: 'row', gap: 6, marginVertical: 1}}><Text style={{fontSize: fs(13, T), color: T.dim, width: 16, textAlign: 'right'}} maxFontSizeMultiplier={1.3}>{m?.[1]}.</Text><Text style={{fontSize: fs(13, T), color: T.dim, flex: 1, lineHeight: 20}} maxFontSizeMultiplier={1.3}>{renderInline(m?.[2] || '', T, members, onMentionPress)}</Text></View>;}
  if (!line.trim()) return <View key={i} style={{height: 8}} />;
  return <Text key={i} style={{fontSize: fs(13, T), color: T.dim, lineHeight: 20}} maxFontSizeMultiplier={1.3}>{renderInline(line, T, members, onMentionPress)}</Text>;
};

export const RichText = ({text, T, numberOfLines, members, onMentionPress}: {
  text: string;
  T: ThemeColors;
  numberOfLines?: number;
  members?: Member[];
  onMentionPress?: (memberId: string) => void;
}) => {
  if (!text) return null;
  if (isHTML(text)) return renderHTMLBlocks(text, T, members, onMentionPress);
  const mdText = text
    .replace(/<img\s[^>]*>/gi, tag => {
      const src = (tag.match(/src=["']([^"']+)["']/) || [])[1] || '';
      if (!src) return '';
      const w = (tag.match(/width=["']?(\d+)/) || [])[1];
      const h = (tag.match(/height=["']?(\d+)/) || [])[1];
      const side = imgTagSide(tag);
      return `![${side ? SIDE_ALT + side : ''}](${src}${w ? `#${w}x${h || 0}` : ''})`;
    })
    .replace(/<br\s*\/?>/gi, '\n');
  const lineSeparators = new RegExp('\\r\\n?|' + String.fromCharCode(0x2028) + '|' + String.fromCharCode(0x2029), 'g');
  const lines = mdText.replace(lineSeparators, '\n').split('\n');
  const displayLines = numberOfLines ? lines.slice(0, numberOfLines) : lines;
  const elements: React.ReactNode[] = [];
  for (let i = 0; i < displayLines.length; i++) {
    const line = displayLines[i];
    const mdImgMatch = line.match(MD_IMAGE_RE);
    if (mdImgMatch && mdImgMatch.index !== undefined) {
      const before = line.slice(0, mdImgMatch.index).trim();
      const after = line.slice(mdImgMatch.index + mdImgMatch[0].length).trim();
      const side = altSide(mdImgMatch[1]);
      const {url, w, h} = parseImageRef(mdImgMatch[2]);
      const start = i;
      if (isValidImageUri(url)) {
        const beside = [before, after].filter(Boolean);
        if (side) {
          while (i + 1 < displayLines.length && displayLines[i + 1].trim() && !lineHasImage(displayLines[i + 1])) beside.push(displayLines[++i]);
        }
        if (beside.length > 0) {
          elements.push(
            <SideRow key={`s${start}`} side={side || 'left'} image={<SideImage uri={url} T={T} w={w} ratio={w && h ? w / h : undefined} />}>
              {beside.map((b, j) => renderMarkdownLine(b, T, `s${start}-${j}`, members, onMentionPress))}
            </SideRow>,
          );
          continue;
        }
        elements.push(<AutoImage key={`m${i}`} uri={url} T={T} hintRatio={w && h ? w / h : undefined} hintW={w && h ? w : undefined} side={side || undefined} />);
        continue;
      }
      if (before) elements.push(renderMarkdownLine(before, T, `b${i}`, members, onMentionPress));
      elements.push(<Text key={`m${i}`} style={{fontSize: fs(11, T), color: T.muted, fontStyle: 'italic'}}>{i18n.t('markdown.brokenImage')}</Text>);
      if (after) elements.push(renderMarkdownLine(after, T, `a${i}`, members, onMentionPress));
      continue;
    }
    const imgMatch = line.match(IMAGE_URL_RE);
    if (imgMatch && isValidImageUri(imgMatch[0])) {
      const before = line.slice(0, line.indexOf(imgMatch[0])).trim();
      const after = line.slice(line.indexOf(imgMatch[0]) + imgMatch[0].length).trim();
      if (before) elements.push(renderMarkdownLine(before, T, `b${i}`, members, onMentionPress));
      elements.push(<AutoImage key={`m${i}`} uri={imgMatch[0]} T={T} />);
      if (after) elements.push(renderMarkdownLine(after, T, `a${i}`, members, onMentionPress));
    } else {
      elements.push(renderMarkdownLine(line, T, `l${i}`, members, onMentionPress));
    }
  }
  return <View style={{gap: 2}}>{elements}</View>;
};
