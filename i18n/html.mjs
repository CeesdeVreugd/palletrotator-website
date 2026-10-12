// Minimale HTML-parser/serializer zonder dependencies, bedoeld voor Astro's nette statische uitvoer.
// Doel: tekst in "runs" (tekst + inline-tags) en vertaalbare attributen vinden en vervangen,
// zonder de rest van de HTML (CSS-classes, scripts, scoped-attributen) aan te raken.

export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAWTEXT = new Set(['script', 'style']);
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'data', 'dfn', 'em', 'i', 'img', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']);
const SKIP = new Set(['script', 'style', 'svg', 'noscript', 'iframe', 'template', 'pre', 'code', 'textarea']);
const TRANS_ATTRS = ['alt', 'title', 'aria-label', 'placeholder', 'data-title'];
const META_KEYS = new Set(['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description', 'og:image:alt', 'twitter:image:alt']);

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', middot: '·', hellip: '…', ndash: '–', mdash: '—', euro: '€', deg: '°', laquo: '«', raquo: '»', times: '×', rarr: '→', larr: '←', reg: '®', trade: '™', eacute: 'é', egrave: 'è', euml: 'ë', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', plusmn: '±' };
export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}
export const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const TAG_RE = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const ATTR_RE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parse(html) {
  const root = { t: 'root', children: [] };
  const stack = [root];
  let last = 0, m;
  TAG_RE.lastIndex = 0;
  const top = () => stack[stack.length - 1];
  const pushText = (s) => { if (s) top().children.push({ t: 'text', raw: s }); };
  while ((m = TAG_RE.exec(html))) {
    pushText(html.slice(last, m.index));
    last = TAG_RE.lastIndex;
    if (m[0].startsWith('<!')) { top().children.push({ t: 'raw', html: m[0] }); continue; }
    if (m[1]) { // sluitende tag
      const name = m[1].toLowerCase();
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== name) i--;
      if (i > 0) { stack[i].closeRaw = m[0]; stack.length = i; } else top().children.push({ t: 'raw', html: m[0] });
      continue;
    }
    const tag = m[2].toLowerCase();
    const attrs = [];
    let a; ATTR_RE.lastIndex = 0;
    while ((a = ATTR_RE.exec(m[3] || ''))) {
      const hasVal = a[2] !== undefined || a[3] !== undefined || a[4] !== undefined;
      attrs.push({ name: a[1], value: a[2] ?? a[3] ?? a[4] ?? '', hasVal, raw: a[0], dirty: false });
    }
    const el = { t: 'el', tag, attrs, open: m[0], dirty: false, children: [], selfClose: m[4] === '/' };
    top().children.push(el);
    if (RAWTEXT.has(tag) && !el.selfClose) {
      const close = new RegExp(`</${tag}\\s*>`, 'ig'); close.lastIndex = last;
      const cm = close.exec(html);
      const end = cm ? cm.index : html.length;
      el.children.push({ t: 'raw', html: html.slice(last, end) });
      if (cm) { el.closeRaw = cm[0]; last = close.lastIndex; } else last = end;
      TAG_RE.lastIndex = last;
      continue;
    }
    if (!VOID.has(tag) && !el.selfClose) stack.push(el);
  }
  pushText(html.slice(last));
  return root;
}

export function openTag(el) {
  if (!el.dirty) return el.open;
  return '<' + el.tag + el.attrs.map((a) => ' ' + (a.dirty ? (a.hasVal ? `${a.name}="${escAttr(a.value)}"` : a.name) : a.raw)).join('') + (el.selfClose ? '/' : '') + '>';
}
export function serialize(node) {
  switch (node.t) {
    case 'root': return node.children.map(serialize).join('');
    case 'text': return node.raw;
    case 'raw': return node.html;
    default: {
      const inner = node.children.map(serialize).join('');
      if (VOID.has(node.tag) || node.selfClose) return openTag(node);
      return openTag(node) + inner + (node.closeRaw ?? `</${node.tag}>`);
    }
  }
}
export const getAttr = (el, name) => el.attrs.find((a) => a.name.toLowerCase() === name);
export function setAttr(el, name, value) {
  const a = getAttr(el, name); if (!a) return;
  a.value = value; a.dirty = true; a.hasVal = true; el.dirty = true;
}

const isSkipped = (el) => SKIP.has(el.tag) || (getAttr(el, 'translate')?.value === 'no');
const isInlineTree = (el) => INLINE.has(el.tag) && !isSkipped(el) && el.children.every((c) => c.t !== 'el' || isInlineTree(c));
const hasLetters = (s) => /\p{L}{3,}/u.test(s);

// Zet een run (opeenvolgende tekst/inline-nodes) om in een sleutel met <xN>-plaatshouders.
function runKey(nodes) {
  const map = []; let n = 0;
  const walk = (list) => list.map((c) => {
    if (c.t === 'text') return escText(decode(c.raw));
    if (c.t === 'raw') { const i = ++n; map[i] = { open: c.html, close: '', void: true }; return `<x${i}/>`; }
    const i = ++n;
    if (VOID.has(c.tag) || c.selfClose) { map[i] = { open: openTag(c), close: '', void: true }; return `<x${i}/>`; }
    map[i] = { open: openTag(c), close: c.closeRaw ?? `</${c.tag}>`, void: false };
    return `<x${i}>${walk(c.children)}</x${i}>`;
  }).join('');
  const joined = walk(nodes);
  const lead = joined.match(/^[ \t\r\n\f]*/)[0], trail = joined.match(/[ \t\r\n\f]*$/)[0];
  return { key: joined.replace(/[ \t\r\n\f]+/g, ' ').replace(/^ | $/g, ''), map, lead: lead ? ' ' : '', trail: trail && trail.length < joined.length ? ' ' : '' };
}

const tokens = (s) => (s.match(/<\/?x\d+\/?>/g) || []).sort().join('');
export function expand(translated, map) {
  return translated.replace(/<x(\d+)(\/?)>|<\/x(\d+)>|([^<]+|<)/g, (m, o, selfc, c, text) => {
    if (text !== undefined) return escText(decode(text.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;')));
    if (o) return map[+o] ? map[+o].open : '';
    return map[+c] ? map[+c].close : '';
  });
}

/**
 * Loopt de boom door. onSegment(key, kind) krijgt elke vertaalbare tekst en geeft de vertaling
 * (XML-escaped tekst, met <xN>-tags) of null/undefined terug om ongewijzigd te laten.
 * onAttr(el, name, value) mag een herschreven attribuutwaarde teruggeven (voor links).
 */
export function process(root, { onSegment, onAttr, onJsonLd, problems = [] }) {
  const doAttrs = (el) => {
    for (const a of el.attrs) {
      const name = a.name.toLowerCase();
      if (onAttr) { const v = onAttr(el, name, a.value); if (typeof v === 'string' && v !== a.value) { a.value = v; a.dirty = true; a.hasVal = true; el.dirty = true; } }
      let translatable = TRANS_ATTRS.includes(name);
      if (el.tag === 'meta' && name === 'content') {
        const k = (getAttr(el, 'name')?.value || getAttr(el, 'property')?.value || '').toLowerCase();
        translatable = META_KEYS.has(k);
      }
      if (el.tag === 'a' && name === 'title') translatable = true;
      if (translatable && a.hasVal) {
        const key = escText(decode(a.value)).replace(/[ \t\r\n\f]+/g, ' ').replace(/^ | $/g, '');
        if (hasLetters(key)) {
          const tr = onSegment(key, 'attr');
          if (tr) { a.value = decode(tr.replace(/<[^>]*>/g, '')); a.dirty = true; el.dirty = true; }
        }
      }
    }
  };
  const treatRun = (parent, from, to) => {
    const nodes = parent.children.slice(from, to);
    const textual = nodes.some((c) => c.t === 'text' && /\S/.test(c.raw) || c.t === 'el');
    if (!textual) return null;
    const { key, map, lead, trail } = runKey(nodes);
    const plain = key.replace(/<\/?x\d+\/?>/g, '');
    if (!hasLetters(plain)) return null;
    const tr = onSegment(key, 'text');
    if (!tr) return null;
    if (tokens(tr) !== tokens(key)) { problems.push(`tags komen niet overeen: ${key.slice(0, 80)}`); return null; }
    return { html: lead + expand(tr.trim(), map) + trail };
  };
  const visit = (el) => {
    if (el.t === 'root') { containerWalk(el); return; }
    doAttrs(el);
    if (isSkipped(el)) {
      if (el.tag === 'script' && onJsonLd && /application\/ld\+json/i.test(getAttr(el, 'type')?.value || '') && el.children[0]) {
        el.children[0].html = onJsonLd(el.children[0].html);
      }
      return;
    }
    containerWalk(el);
  };
  const containerWalk = (el) => {
    const kids = el.children;
    // Eerst: attributen van alle elementen binnen runs (inline) verwerken, daarna runs vervangen.
    const attrOnlyWalk = (c) => { if (c.t === 'el') { doAttrs(c); c.children.forEach(attrOnlyWalk); } };
    let i = 0; const out = [];
    while (i < kids.length) {
      const c = kids[i];
      const inRun = c.t === 'text' || c.t === 'raw' || (c.t === 'el' && isInlineTree(c));
      if (!inRun) { if (c.t === 'el') visit(c); out.push(c); i++; continue; }
      let j = i;
      while (j < kids.length && (kids[j].t === 'text' || kids[j].t === 'raw' || (kids[j].t === 'el' && isInlineTree(kids[j])))) j++;
      const run = kids.slice(i, j);
      const meaningful = run.filter((n) => !(n.t === 'text' && !/\S/.test(n.raw)) && n.t !== 'raw');
      if (meaningful.length >= 1 && meaningful.every((n) => n.t === 'el') && !run.some((n) => n.t === 'text' && /\S/.test(n.raw))) {
        // alleen inline elementen zonder losse tekst ertussen (bijv. <li><a>tekst</a></li> of een rij links):
        // elk element is een eigen container
        for (const n of run) { if (n.t === 'el') visit(n); out.push(n); }
      } else {
        run.forEach(attrOnlyWalk);
        const res = treatRun({ children: kids }, i, j);
        if (res) out.push({ t: 'raw', html: res.html }); else run.forEach((n) => out.push(n));
      }
      i = j;
    }
    el.children = out;
  };
  visit(root);
  return problems;
}
