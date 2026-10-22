export type Side = 'left' | 'right';

export interface ImageRef {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  side?: Side;
}

export type Inline =
  | {kind: 'text'; text: string}
  | {kind: 'bold' | 'italic' | 'boldItalic' | 'underline' | 'strike'; children: Inline[]}
  | {kind: 'code'; text: string}
  | {kind: 'spoiler'; raw: string; children: Inline[]}
  | {kind: 'mention'; name: string; memberId: string}
  | {kind: 'link'; href: string; children: Inline[]}
  | {kind: 'image'; image: ImageRef}
  | {kind: 'break'};

export interface ListItem {
  depth: number;
  ordered: boolean;
  n: number;
  children: Inline[];
}

export type Block =
  | {kind: 'paragraph'; children: Inline[]}
  | {kind: 'heading'; level: 1 | 2 | 3; children: Inline[]}
  | {kind: 'quote'; children: Inline[]}
  | {kind: 'list'; items: ListItem[]}
  | {kind: 'code'; text: string}
  | {kind: 'rule'}
  | {kind: 'blank'}
  | {kind: 'image'; image: ImageRef}
  | {kind: 'aside'; image: ImageRef; children: Block[]};

export const MENTION_RE = /@\[([^\]]+)\]\(member:([a-zA-Z0-9_-]+)\)/;
export const SPOILER_RE = /\|\|(.+?)\|\|/;
const IMAGE_URL_RE = /https?:\/\/\S+\.(?:gif|png|pnj|jpe?g|webp|bmp|svg)(?:[?#]\S*)?/i;
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/;
const SIDE_ALT = 'ps-side:';
const LINE_SEPARATORS = new RegExp('\\r\\n?|' + String.fromCharCode(0x2028) + '|' + String.fromCharCode(0x2029), 'g');

export const isImageUri = (u: unknown): u is string => {
  if (typeof u !== 'string') return false;
  const s = u.trim();
  if (!s) return false;
  return /^https?:\/\//i.test(s) || /^file:\/\//i.test(s) || /^content:\/\//i.test(s) || s.startsWith('data:image/');
};

export const isSafeHref = (href: string): boolean => /^(https?:\/\/|mailto:)/i.test(href.trim());

export const isHTML = (text: string): boolean =>
  /<(?:p|h[1-6]|div|ul|ol|blockquote|pre|hr|strong|em|b|i|s|del|code|a)\b/i.test(text.trim());

export const stripMarkup = (text: string): string => text.replace(/<[^>]+>/g, '').replace(/[#*`~_]/g, '').trim();

const NAMED_ENTITIES = new Map<string, string>(Object.entries({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', deg: '°', times: '×', laquo: '«', raquo: '»',
  euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', iexcl: '¡', iquest: '¿',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', aacute: 'á', acirc: 'â', auml: 'ä', ouml: 'ö', uuml: 'ü',
  ccedil: 'ç', ntilde: 'ñ', oslash: 'ø', aring: 'å', szlig: 'ß', iacute: 'í', oacute: 'ó', uacute: 'ú',
}));

export const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return whole;
      return cp === 0xa0 ? ' ' : String.fromCodePoint(cp);
    }
    return NAMED_ENTITIES.get(body.toLowerCase()) ?? whole;
  });

const text = (s: string): Inline => ({kind: 'text', text: s});

const imgTagSide = (tag: string): Side | undefined => {
  const m = tag.match(/\salign\s*=\s*["']?\s*(left|right)\b/i);
  if (!m) return undefined;
  return m[1].toLowerCase() === 'right' ? 'right' : 'left';
};

const altSide = (alt: string): Side | undefined =>
  alt === `${SIDE_ALT}left` ? 'left' : alt === `${SIDE_ALT}right` ? 'right' : undefined;

const parseImageRef = (alt: string, raw: string): ImageRef => {
  const s = raw.trim();
  const hint = s.match(/#(\d+)x(\d+)$/);
  const w = hint ? Number(hint[1]) : 0;
  const h = hint ? Number(hint[2]) : 0;
  const side = altSide(alt);
  return {
    url: s.replace(/[)]+$/, '').replace(/#\d+x\d+$/, '').trim(),
    alt: side ? '' : alt,
    width: w > 0 ? w : undefined,
    height: h > 0 ? h : undefined,
    side,
  };
};

const imgTagToMarkdown = (tag: string): string => {
  const src = (tag.match(/src=["']([^"']+)["']/) || [])[1] || '';
  if (!src) return '';
  const w = (tag.match(/width=["']?(\d+)/) || [])[1];
  const h = (tag.match(/height=["']?(\d+)/) || [])[1];
  const side = imgTagSide(tag);
  return `![${side ? SIDE_ALT + side : ''}](${src}${w ? `#${w}x${h || 0}` : ''})`;
};

type InlinePattern = [RegExp, (m: RegExpMatchArray, markdown: boolean) => Inline];

const PATTERNS: InlinePattern[] = [
  [SPOILER_RE, (m, markdown) => ({kind: 'spoiler', raw: m[1], children: parseInline(m[1], markdown)})],
  [MENTION_RE, m => ({kind: 'mention', name: m[1], memberId: m[2]})],
];

const MARKDOWN_PATTERNS: InlinePattern[] = [
  ...PATTERNS,
  [/\*\*\*(.+?)\*\*\*/, m => ({kind: 'boldItalic', children: parseInline(m[1], true)})],
  [/\*\*(.+?)\*\*/, m => ({kind: 'bold', children: parseInline(m[1], true)})],
  [/\*(.+?)\*/, m => ({kind: 'italic', children: parseInline(m[1], true)})],
  [/~~(.+?)~~/, m => ({kind: 'strike', children: parseInline(m[1], true)})],
  [/`(.+?)`/, m => ({kind: 'code', text: m[1]})],
  [MD_IMAGE_RE, m => ({kind: 'image', image: parseImageRef(m[1], m[2])})],
  [/\[(.+?)\]\((.+?)\)/, m => ({kind: 'link', href: m[2].trim(), children: parseInline(m[1], true)})],
];

export const parseInline = (input: string, markdown: boolean): Inline[] => {
  const patterns = markdown ? MARKDOWN_PATTERNS : PATTERNS;
  const out: Inline[] = [];
  let remaining = input;
  while (remaining.length > 0) {
    let earliest: {idx: number; len: number; node: Inline} | null = null;
    for (const [re, build] of patterns) {
      const m = remaining.match(re);
      if (m && m.index !== undefined && (!earliest || m.index < earliest.idx)) {
        earliest = {idx: m.index, len: m[0].length, node: build(m, markdown)};
      }
    }
    if (!earliest) {
      out.push(text(remaining));
      break;
    }
    if (earliest.idx > 0) out.push(text(remaining.slice(0, earliest.idx)));
    out.push(earliest.node);
    remaining = remaining.slice(earliest.idx + earliest.len);
  }
  return out;
};

const isBlankInline = (node: Inline): boolean => node.kind === 'text' && !node.text.trim();

export const inlineText = (nodes: Inline[]): string =>
  nodes.map(n => {
    switch (n.kind) {
      case 'text': case 'code': return n.text;
      case 'mention': return `@${n.name}`;
      case 'image': return '';
      case 'break': return '\n';
      default: return inlineText(n.children);
    }
  }).join('');

const hasText = (nodes: Inline[]): boolean => inlineText(nodes).trim().length > 0;

const layoutParagraph = (children: Inline[]): Block => {
  const images = children.filter((n): n is Extract<Inline, {kind: 'image'}> => n.kind === 'image');
  if (images.length === 1 && isImageUri(images[0].image.url)) {
    const rest = children.filter(n => n.kind !== 'image');
    const image = images[0].image;
    if (!hasText(rest)) return {kind: 'image', image};
    return {kind: 'aside', image: {...image, side: image.side || 'left'}, children: [{kind: 'paragraph', children: rest}]};
  }
  return {kind: 'paragraph', children};
};

interface El {
  tag: string;
  attrs: string;
  children: HtmlNode[];
}
type HtmlNode = string | El;

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr', 'col', 'area', 'base', 'source', 'track', 'embed', 'param']);
const DROP = new Set(['script', 'style', 'head', 'title', 'template']);
const CONTAINER = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'figure', 'figcaption', 'details', 'summary']);

export const parseHtmlTree = (html: string): El => {
  const root: El = {tag: '#root', attrs: '', children: []};
  const stack: El[] = [root];
  const top = (): El => stack[stack.length - 1];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const at = m.index;
    if (at > last) top().children.push(html.slice(last, at));
    last = at + m[0].length;
    if (m[0].startsWith('<!--')) continue;
    const tag = m[1].toLowerCase();
    if (m[0][1] === '/') {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const el: El = {tag, attrs: m[2] || '', children: []};
    top().children.push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(el.attrs)) stack.push(el);
  }
  if (last < html.length) top().children.push(html.slice(last));
  return root;
};

const attr = (attrs: string, name: string): string => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return decodeEntities(m ? (m[1] ?? m[2] ?? m[3] ?? '') : '').trim();
};

const plainText = (node: HtmlNode): string => {
  if (typeof node === 'string') return decodeEntities(node);
  if (node.tag === 'br') return '\n';
  return node.children.map(plainText).join('');
};

const imageFromTag = (el: El): ImageRef => {
  const w = Number(attr(el.attrs, 'width'));
  const h = Number(attr(el.attrs, 'height'));
  const align = attr(el.attrs, 'align').toLowerCase();
  return {
    url: attr(el.attrs, 'src'),
    alt: attr(el.attrs, 'alt'),
    width: w > 0 ? w : undefined,
    height: h > 0 ? h : undefined,
    side: align === 'right' ? 'right' : align === 'left' ? 'left' : undefined,
  };
};

const htmlInline = (nodes: HtmlNode[]): Inline[] => {
  const out: Inline[] = [];
  const breakBefore = () => {
    if (out.length && out[out.length - 1].kind !== 'break') out.push({kind: 'break'});
  };
  for (const node of nodes) {
    if (typeof node === 'string') {
      out.push(...parseInline(decodeEntities(node), false));
      continue;
    }
    const tag = node.tag;
    if (DROP.has(tag)) continue;
    if (CONTAINER.has(tag) || tag === 'li') {
      breakBefore();
      out.push(...htmlInline(node.children));
      out.push({kind: 'break'});
      continue;
    }
    switch (tag) {
      case 'br': out.push({kind: 'break'}); break;
      case 'img': out.push({kind: 'image', image: imageFromTag(node)}); break;
      case 'strong': case 'b': out.push({kind: 'bold', children: htmlInline(node.children)}); break;
      case 'em': case 'i': out.push({kind: 'italic', children: htmlInline(node.children)}); break;
      case 'u': case 'ins': out.push({kind: 'underline', children: htmlInline(node.children)}); break;
      case 's': case 'del': case 'strike': out.push({kind: 'strike', children: htmlInline(node.children)}); break;
      case 'code': out.push({kind: 'code', text: plainText(node)}); break;
      case 'a': out.push({kind: 'link', href: attr(node.attrs, 'href'), children: htmlInline(node.children)}); break;
      default: out.push(...htmlInline(node.children));
    }
  }
  return out;
};

const trimInline = (nodes: Inline[]): Inline[] => {
  const out = [...nodes];
  while (out.length && (isBlankInline(out[0]) || out[0].kind === 'break')) out.shift();
  while (out.length && (isBlankInline(out[out.length - 1]) || out[out.length - 1].kind === 'break')) out.pop();
  return out;
};

const htmlBlocks = (nodes: HtmlNode[]): Block[] => {
  const blocks: Block[] = [];
  let buffer: HtmlNode[] = [];
  const flush = () => {
    if (!buffer.length) return;
    const children = trimInline(htmlInline(buffer));
    buffer = [];
    if (children.length) blocks.push(layoutParagraph(children));
  };
  const listItems = (list: El, depth: number, ordered: boolean, items: ListItem[]) => {
    let n = 0;
    for (const child of list.children) {
      if (typeof child === 'string' || child.tag !== 'li') continue;
      const own: HtmlNode[] = [];
      const nested: El[] = [];
      for (const part of child.children) {
        if (typeof part !== 'string' && (part.tag === 'ul' || part.tag === 'ol')) nested.push(part);
        else own.push(part);
      }
      n += 1;
      items.push({depth, ordered, n, children: trimInline(htmlInline(own))});
      for (const sub of nested) listItems(sub, depth + 1, sub.tag === 'ol', items);
    }
  };
  for (const node of nodes) {
    if (typeof node === 'string') {
      buffer.push(node);
      continue;
    }
    const tag = node.tag;
    if (DROP.has(tag)) continue;
    if (/^h[1-6]$/.test(tag)) {
      flush();
      const level = Math.min(3, Number(tag[1])) as 1 | 2 | 3;
      blocks.push({kind: 'heading', level, children: trimInline(htmlInline(node.children))});
    } else if (tag === 'blockquote') {
      flush();
      blocks.push({kind: 'quote', children: trimInline(htmlInline(node.children))});
    } else if (tag === 'pre') {
      flush();
      blocks.push({kind: 'code', text: plainText(node).replace(/^\n+|\n+$/g, '')});
    } else if (tag === 'hr') {
      flush();
      blocks.push({kind: 'rule'});
    } else if (tag === 'ul' || tag === 'ol') {
      flush();
      const items: ListItem[] = [];
      listItems(node, 0, tag === 'ol', items);
      if (items.length) blocks.push({kind: 'list', items});
    } else if (CONTAINER.has(tag) || tag === 'li') {
      flush();
      blocks.push(...htmlBlocks(node.children));
    } else {
      buffer.push(node);
    }
  }
  flush();
  return blocks;
};

export const parseHtml = (html: string): Block[] => htmlBlocks(parseHtmlTree(html.replace(/\n/g, '')).children);

const lineHasImage = (line: string): boolean => MD_IMAGE_RE.test(line) || IMAGE_URL_RE.test(line);

export const parseMarkdownLine = (line: string): Block => {
  if (line.startsWith('### ')) return {kind: 'heading', level: 3, children: parseInline(line.slice(4), true)};
  if (line.startsWith('## ')) return {kind: 'heading', level: 2, children: parseInline(line.slice(3), true)};
  if (line.startsWith('# ')) return {kind: 'heading', level: 1, children: parseInline(line.slice(2), true)};
  if (line.startsWith('> ')) return {kind: 'quote', children: parseInline(line.slice(2), true)};
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return {kind: 'rule'};
  if (/^[-*] /.test(line)) return {kind: 'list', items: [{depth: 0, ordered: false, n: 1, children: parseInline(line.slice(2), true)}]};
  const numbered = line.match(/^(\d+)\. (.*)$/);
  if (numbered) return {kind: 'list', items: [{depth: 0, ordered: true, n: Number(numbered[1]), children: parseInline(numbered[2], true)}]};
  if (!line.trim()) return {kind: 'blank'};
  return {kind: 'paragraph', children: parseInline(line, true)};
};

const mergeLists = (blocks: Block[]): Block[] => {
  const out: Block[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.kind === 'list' && prev && prev.kind === 'list' && prev.items[0].ordered === b.items[0].ordered) {
      prev.items.push(...b.items);
    } else {
      out.push(b.kind === 'list' ? {kind: 'list', items: [...b.items]} : b);
    }
  }
  return out;
};

export const parseMarkdown = (input: string): Block[] => {
  const mdText = input
    .replace(/<img\s[^>]*>/gi, imgTagToMarkdown)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(LINE_SEPARATORS, '\n');
  const lines = mdText.split('\n');
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const md = line.match(MD_IMAGE_RE);
    if (md && md.index !== undefined) {
      const before = line.slice(0, md.index).trim();
      const after = line.slice(md.index + md[0].length).trim();
      const image = parseImageRef(md[1], md[2]);
      if (isImageUri(image.url)) {
        const beside = [before, after].filter(Boolean);
        if (image.side) {
          while (i + 1 < lines.length && lines[i + 1].trim() && !lineHasImage(lines[i + 1])) beside.push(lines[++i]);
        }
        if (beside.length > 0) {
          blocks.push({kind: 'aside', image: {...image, side: image.side || 'left'}, children: mergeLists(beside.map(parseMarkdownLine))});
        } else {
          blocks.push({kind: 'image', image});
        }
        continue;
      }
      if (before) blocks.push(parseMarkdownLine(before));
      blocks.push({kind: 'paragraph', children: [{kind: 'image', image}]});
      if (after) blocks.push(parseMarkdownLine(after));
      continue;
    }
    const url = line.match(IMAGE_URL_RE);
    if (url && isImageUri(url[0])) {
      const at = line.indexOf(url[0]);
      const before = line.slice(0, at).trim();
      const after = line.slice(at + url[0].length).trim();
      if (before) blocks.push(parseMarkdownLine(before));
      blocks.push({kind: 'image', image: {url: url[0], alt: ''}});
      if (after) blocks.push(parseMarkdownLine(after));
      continue;
    }
    blocks.push(parseMarkdownLine(line));
  }
  return mergeLists(blocks);
};

export const parseRichText = (input: string): Block[] => {
  if (!input) return [];
  return isHTML(input) ? parseHtml(input) : parseMarkdown(input);
};

export const blockLines = (b: Block): number => {
  if (b.kind === 'list') return b.items.length;
  if (b.kind === 'aside') return 1 + b.children.reduce((n, c) => n + blockLines(c), 0);
  return 1;
};

export const limitBlocks = (blocks: Block[], maxLines?: number): Block[] => {
  if (!maxLines || maxLines <= 0) return blocks;
  const out: Block[] = [];
  let used = 0;
  for (const b of blocks) {
    const lines = blockLines(b);
    if (used + lines <= maxLines) {
      out.push(b);
      used += lines;
      if (used >= maxLines) break;
      continue;
    }
    if (b.kind === 'list') {
      const room = maxLines - used;
      if (room > 0) out.push({kind: 'list', items: b.items.slice(0, room)});
    }
    break;
  }
  return out;
};

export const sidePictureSnippet = (prior: string, rest: string, side: Side, urlPlaceholder: string, textPlaceholder: string): string => {
  const lead = prior && !prior.endsWith('\n') ? '\n' : '';
  const tail = !rest || rest.startsWith('\n\n') ? '' : rest.startsWith('\n') ? '\n' : '\n\n';
  return `${lead}<img src="${urlPlaceholder}" width="100" height="100" align="${side}">\n${textPlaceholder}${tail}`;
};
