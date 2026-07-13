import React from 'react';
import {View, Image, Linking} from 'react-native';
import {Text} from './AppText';
import type {Member} from '../utils';
import i18n from '../i18n/i18n';
import {fontScale} from '../theme';
import type {ThemeColors} from '../theme';

const IMAGE_URL_RE = /https?:\/\/\S+\.(?:gif|png|pnj|jpe?g|webp|bmp|svg)(?:[?#]\S*)?/gi;
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/;
const MENTION_RE = /@\[([^\]]+)\]\(member:([a-zA-Z0-9_-]+)\)/g;

const fs = (s: number, T: ThemeColors): number => fontScale(T)(s);

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

const AutoImage = ({uri, T, hintRatio}: {uri: string; T: ThemeColors; hintRatio?: number}) => {
  const [ratio, setRatio] = React.useState<number | null>(hintRatio || null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    setFailed(false);
    if (hintRatio) { setRatio(hintRatio); return; }
    setRatio(null);
    Image.getSize(uri, (w, h) => { if (live && w > 0 && h > 0) setRatio(w / h); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [uri, hintRatio]);
  if (failed) {
    return <Text style={{fontSize: fs(11, T), color: T?.muted || '#888', fontStyle: 'italic'}}>{i18n.t('markdown.imageUnavailable')}</Text>;
  }
  const r = ratio || 1.5;
  const sizing = r >= 1 ? {width: '100%' as const, aspectRatio: r} : {width: '100%' as const, height: 280};
  return <Image source={{uri}} style={[{borderRadius: 8, marginVertical: 2}, sizing]} resizeMode="contain" accessibilityRole="image" accessibilityLabel={i18n.t('a11y.image')} onError={() => setFailed(true)} />;
};

const renderTextWithMentions = (
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
  return t.startsWith('<') || /<(?:p|h[1-6]|div|ul|ol|blockquote|pre|hr|strong|em|b|i|s|del|code|a)\b/i.test(t);
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
          parts.push(<Image key={key++} source={{uri: url}} style={{width: w || 200, height: h || w || 200, borderRadius: 8, marginVertical: 4}} resizeMode="contain" accessibilityRole="image" accessibilityLabel={i18n.t('a11y.image')} />);
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
      case 'code': parts.push(<Text key={key++} style={{fontFamily: 'monospace', backgroundColor: T.surface, paddingHorizontal: 4, borderRadius: 3, fontSize: fs(12, T)}}>{decodeEntities(inner)}</Text>); break;
      case 'a': { const href = (attrs.match(/href=["']([^"']+)["']/) || [])[1] || ''; parts.push(<Text key={key++} style={{color: T.info, textDecorationLine: 'underline'}} onPress={() => href && Linking.openURL(href)}>{renderInlineHTML(inner, T, members, onMentionPress)}</Text>); break; }
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

    if (openTag) {
      if (tag === 'hr') { if (current.trim()) segments.push({tag: currentTag, content: current}); current = ''; segments.push({tag: 'hr', content: ''}); continue; }
      if (tag === 'ul' || tag === 'ol') { if (current.trim()) segments.push({tag: currentTag, content: current}); current = ''; inList = tag; listItems = []; continue; }
      if (tag === 'li') { current = ''; continue; }
      if (tag === 'pre' || tag === 'blockquote') { if (current.trim()) segments.push({tag: currentTag, content: current}); current = ''; currentTag = tag; continue; }
      if (current.trim()) segments.push({tag: currentTag, content: current});
      current = '';
      currentTag = tag;
    } else if (closeTag) {
      if (closeTag === 'li') { listItems.push(current); current = ''; continue; }
      if (closeTag === 'ul' || closeTag === 'ol') { segments.push({tag: closeTag, content: '', listItems: [...listItems]}); inList = ''; listItems = []; continue; }
      if (current.trim() || closeTag === 'p') segments.push({tag: currentTag, content: current});
      current = '';
      currentTag = 'p';
    }
    lastIdx = match.index + full.length;
    const nextMatch = blockRe.exec(raw);
    if (nextMatch) { current = raw.slice(match.index + full.length, nextMatch.index); blockRe.lastIndex = nextMatch.index; }
    else { current = raw.slice(match.index + full.length); }
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
          case 'ul': return <View key={i} style={{marginVertical: 2}}>{(seg.listItems || []).map((li, j) => <View key={j} style={{flexDirection: 'row', gap: 6, marginVertical: 1}}><Text style={{fontSize: fs(13, T), color: T.dim}}>•</Text><Text style={{fontSize: fs(13, T), color: T.dim, flex: 1, lineHeight: 20}}>{renderInlineHTML(li, T, members, onMentionPress)}</Text></View>)}</View>;
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
                if (validUrl && restPlain.length > 0) {
                  const wAttr = imgM[0].match(/width=["']?(\d+)["']?/);
                  const hAttr = imgM[0].match(/height=["']?(\d+)["']?/);
                  const sideW = Math.min(wAttr ? Number(wAttr[1]) : 110, 130);
                  const sideH = (wAttr && hAttr) ? Math.round(sideW * (Number(hAttr[1]) / Number(wAttr[1]))) : Math.round(sideW * 1.4);
                  return (
                    <View key={i} style={{flexDirection: 'row', gap: 10, marginVertical: 2, alignItems: 'flex-start'}}>
                      <Image source={{uri: url}} style={{width: sideW, height: sideH, borderRadius: 8}} resizeMode="contain" accessibilityRole="image" accessibilityLabel={i18n.t('a11y.image')} />
                      <Text style={{flex: 1, fontSize: fs(13, T), color: T.dim, lineHeight: 20}}>{renderInlineHTML(restHtml, T, members, onMentionPress)}</Text>
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
    [/@\[([^\]]+)\]\(member:([a-zA-Z0-9_-]+)\)/, m => {
      const member = members?.find(mb => mb.id === m[2]);
      const displayName = member?.name || m[1];
      const color = member?.color || T.muted;
      return (
        <Text
          key={key++}
          onPress={onMentionPress && member ? () => onMentionPress(m[2]) : undefined}
          style={{color, textDecorationLine: 'underline'}}>
          @{displayName}
        </Text>
      );
    }],
    [/\*\*\*(.+?)\*\*\*/, m => <Text key={key++} style={{fontWeight: '700', fontStyle: 'italic', color: T.text}}>{m[1]}</Text>],
    [/\*\*(.+?)\*\*/, m => <Text key={key++} style={{fontWeight: '700', color: T.text}}>{m[1]}</Text>],
    [/\*(.+?)\*/, m => <Text key={key++} style={{fontStyle: 'italic'}}>{m[1]}</Text>],
    [/~~(.+?)~~/, m => <Text key={key++} style={{textDecorationLine: 'line-through'}}>{m[1]}</Text>],
    [/`(.+?)`/, m => <Text key={key++} style={{fontFamily: 'monospace', backgroundColor: T.surface, paddingHorizontal: 4, borderRadius: 3, fontSize: fs(12, T)}}>{m[1]}</Text>],
    [/!\[([^\]]*)\]\(([^)]+)\)/, m => {
      const url = m[2].replace(/[)]+$/, '').trim();
      if (!isValidImageUri(url)) return <Text key={key++} style={{fontSize: fs(11, T), color: T.muted, fontStyle: 'italic'}}>{i18n.t('markdown.brokenImage')}</Text>;
      return <UriImage key={key++} uri={url} style={{width: 200, height: 200, borderRadius: 8}} T={T} />;
    }],
    [/\[(.+?)\]\((.+?)\)/, m => <Text key={key++} style={{color: T.info, textDecorationLine: 'underline'}} onPress={() => Linking.openURL(m[2])}>{m[1]}</Text>],
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

const renderMarkdownLine = (line: string, T: ThemeColors, i: number, members?: Member[], onMentionPress?: (id: string) => void): React.ReactNode => {
  if (line.startsWith('### ')) return <Text key={i} style={{fontSize: fs(14, T), fontWeight: '700', color: T.text, marginBottom: 4}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(4), T, members, onMentionPress)}</Text>;
  if (line.startsWith('## ')) return <Text key={i} style={{fontSize: fs(16, T), fontWeight: '700', color: T.text, marginBottom: 4}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(3), T, members, onMentionPress)}</Text>;
  if (line.startsWith('# ')) return <Text key={i} style={{fontSize: fs(18, T), fontWeight: '700', color: T.text, marginBottom: 4}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(2), T, members, onMentionPress)}</Text>;
  if (line.startsWith('> ')) return <View key={i} style={{borderLeftWidth: 3, borderLeftColor: T.accent, paddingLeft: 10, marginVertical: 2}}><Text style={{fontSize: fs(13, T), color: T.dim, fontStyle: 'italic', lineHeight: 20}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(2), T, members, onMentionPress)}</Text></View>;
  if (line.startsWith('---') || line.startsWith('***')) return <View key={i} style={{height: 1, backgroundColor: T.border, marginVertical: 8}} />;
  if (line.match(/^[-*] /)) return <View key={i} style={{flexDirection: 'row', gap: 6, marginVertical: 1}}><Text style={{fontSize: fs(13, T), color: T.dim}} maxFontSizeMultiplier={1.3}>•</Text><Text style={{fontSize: fs(13, T), color: T.dim, flex: 1, lineHeight: 20}} maxFontSizeMultiplier={1.3}>{renderInline(line.slice(2), T, members, onMentionPress)}</Text></View>;
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
      return `![](${src}${w && h ? `#${w}x${h}` : ''})`;
    })
    .replace(/<br\s*\/?>/gi, '\n');
  const lines = mdText.split('\n');
  const displayLines = numberOfLines ? lines.slice(0, numberOfLines) : lines;
  const elements: React.ReactNode[] = [];
  displayLines.forEach((line, i) => {
    const mdImgMatch = line.match(MD_IMAGE_RE);
    if (mdImgMatch && mdImgMatch.index !== undefined) {
      const before = line.slice(0, mdImgMatch.index).trim();
      const after = line.slice(mdImgMatch.index + mdImgMatch[0].length).trim();
      const rawUrl = mdImgMatch[2].trim();
      const sizeHint = rawUrl.match(/#(\d+)x(\d+)$/);
      const url = rawUrl.replace(/[)]+$/, '').replace(/#\d+x\d+$/, '').trim();
      if (isValidImageUri(url) && (before || after)) {
        const sideW = sizeHint ? Math.min(Number(sizeHint[1]), 130) : 110;
        const sideH = sizeHint ? Math.round(sideW * (Number(sizeHint[2]) / Number(sizeHint[1]))) : Math.round(sideW * 1.4);
        elements.push(
          <View key={i * 3} style={{flexDirection: 'row', gap: 10, marginVertical: 2, alignItems: 'flex-start'}}>
            <UriImage uri={url} style={{width: sideW, height: sideH, borderRadius: 8}} T={T} />
            <View style={{flex: 1, gap: 2}}>
              {before ? renderMarkdownLine(before, T, i * 3 + 1, members, onMentionPress) : null}
              {after ? renderMarkdownLine(after, T, i * 3 + 2, members, onMentionPress) : null}
            </View>
          </View>,
        );
        return;
      }
      if (before) elements.push(renderMarkdownLine(before, T, i * 3, members, onMentionPress));
      if (isValidImageUri(url)) {
        const hintRatio = sizeHint ? Number(sizeHint[1]) / Number(sizeHint[2]) : undefined;
        elements.push(<AutoImage key={i * 3 + 1} uri={url} T={T} hintRatio={hintRatio && hintRatio > 0 ? hintRatio : undefined} />);
      } else {
        elements.push(<Text key={i * 3 + 1} style={{fontSize: fs(11, T), color: T.muted, fontStyle: 'italic'}}>{i18n.t('markdown.brokenImage')}</Text>);
      }
      if (after) elements.push(renderMarkdownLine(after, T, i * 3 + 2, members, onMentionPress));
      return;
    }
    const imgMatch = line.match(IMAGE_URL_RE);
    if (imgMatch && isValidImageUri(imgMatch[0])) {
      const before = line.slice(0, line.indexOf(imgMatch[0])).trim();
      const after = line.slice(line.indexOf(imgMatch[0]) + imgMatch[0].length).trim();
      if (before) elements.push(renderMarkdownLine(before, T, i * 3, members, onMentionPress));
      elements.push(<AutoImage key={i * 3 + 1} uri={imgMatch[0]} T={T} />);
      if (after) elements.push(renderMarkdownLine(after, T, i * 3 + 2, members, onMentionPress));
    } else {
      elements.push(renderMarkdownLine(line, T, i, members, onMentionPress));
    }
  });
  return <View style={{gap: 2}}>{elements}</View>;
};
