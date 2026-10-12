// WebsiteBeheerPortal: enkele pagina, geen frameworks. Alle gebruikersinhoud gaat via textContent (nooit innerHTML).
const $root = document.getElementById('root');
const LANG_NAMES = { nl: 'Nederlands', de: 'Deutsch', en: 'English', fr: 'Français', it: 'Italiano', es: 'Español' };
const ROLE_NAMES = { admin: 'beheerder', editor: 'redacteur', reviewer: 'nalezer' };
const STATUS_NAMES = { open: 'open', resolved: 'afgehandeld', accepted: 'voorstel geaccepteerd', rejected: 'voorstel afgewezen' };

// ---------- hulpjes ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
// append() van de browser maakt van een lijst één tekststring; deze variant rolt lijsten uit en slaat lege waarden over.
const clear = (el) => {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.append = (...kids) => Element.prototype.append.call(el, ...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  return el;
};
const fmtDate = (iso) => (iso ? new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '');
const ago = (iso) => {
  if (!iso) return 'nog niet';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'zojuist';
  if (m < 60) return `${m} min geleden`;
  if (m < 1440) return `${Math.round(m / 60)} uur geleden`;
  return fmtDate(iso);
};
function chips(text) {
  return String(text).split(/(\{\/?\d+\/?\})/).map((p) => (/^\{\/?\d+\/?\}$/.test(p) ? h('span', { class: 'chip' }, p) : p));
}
let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3500);
}
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'X-Requested-With': 'portal', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    if (r.status === 401 && state.me) { state.me = null; render(); }
    if (data.mustChange && state.me) { state.me.mustChange = true; render(); }
    if (data.needs2fa && state.me) { state.me.needs2fa = true; render(); }
    throw Object.assign(new Error(data.error || 'Er ging iets mis.'), { status: r.status });
  }
  return data;
}
const can = (perm) => {
  const P = { admin: ['comment', 'resolve', 'accept', 'photo.propose', 'photo.approve', 'photos.view', 'sites', 'users', 'log', 'check', 'export', 'overview'], editor: ['comment', 'resolve', 'photo.propose', 'photos.view', 'check', 'export', 'overview'], reviewer: ['comment'] };
  return !!state.me && (P[state.me.role] || []).includes(perm);
};
const state = { me: null, badges: { open: 0, photos: 0 }, texts: { site: null, lang: null, page: '', status: '', q: '', offset: 0 } };

function field(label, input) { return h('label', { class: 'f' }, label, input); }
function pill(cls, text) { return h('span', { class: `pill ${cls}` }, text); }
function errBox(e) { return h('div', { class: 'err', role: 'alert' }, e.message || String(e)); }
async function safe(fn, box) {
  try { return await fn(); } catch (e) { if (box) { clear(box).append(errBox(e)); } else toast(e.message); return undefined; }
}

// ---------- inloggen e.d. ----------
function viewLogin() {
  const box = h('div');
  const email = h('input', { type: 'email', id: 'em', autocomplete: 'username', required: true });
  const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    clear(box);
    await safe(async () => {
      const r = await api('POST', '/api/login', { email: email.value, password: pw.value });
      if (r.needs2fa) return viewCode(r.ticket);
      state.me = r.user; await afterLogin();
    }, box);
  } }, h('h1', {}, 'WebsiteBeheerPortal'), h('p', { class: 'sub' }, 'Log in om de websites te beheren.'), field('E-mailadres', email), field('Wachtwoord', pw), box, h('button', { class: 'btn', type: 'submit' }, 'Inloggen'));
  clear($root).append(h('div', { class: 'login' }, form));
  email.focus();
}
function viewCode(ticket) {
  const box = h('div');
  const code = h('input', { type: 'text', id: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', required: true, maxlength: 20 });
  clear($root).append(h('div', { class: 'login' }, h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); clear(box);
    await safe(async () => { const r = await api('POST', '/api/login/2fa', { ticket, code: code.value }); state.me = r.user; await afterLogin(); }, box);
  } }, h('h1', {}, 'Bevestig het inloggen'), h('p', { class: 'sub' }, 'Vul de 6-cijferige code uit uw authenticator-app in. Heeft u geen toegang tot de app? Gebruik dan een herstelcode.'), field('Code', code), box,
  h('button', { class: 'btn', type: 'submit' }, 'Bevestigen'), h('a', { href: '#/', onclick: () => viewLogin() }, 'Terug'))));
  code.focus();
}
async function viewSetup2fa() {
  const box = h('div');
  const root = h('div', { class: 'login', style: 'max-width:480px' });
  clear($root).append(root.appendChild(h('div', { class: 'card' }, 'Laden…')).parentNode);
  let info;
  try { info = await api('POST', '/api/2fa/setup', {}); } catch (e) { clear(root).append(h('div', { class: 'card stack' }, errBox(e))); return; }
  const code = h('input', { type: 'text', id: 'scode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, required: true });
  const grouped = info.secret.match(/.{1,4}/g).join(' ');
  clear(root).append(h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault(); clear(box);
    await safe(async () => { const r = await api('POST', '/api/2fa/enable', { code: code.value }); state.me = r.user; showCodes(root, r.recoveryCodes); }, box);
  } }, h('h1', {}, 'Tweestapsverificatie instellen'),
    h('p', { class: 'sub' }, 'Dit beschermt uw account, ook als iemand uw wachtwoord weet. Doe dit eenmalig:'),
    h('ol', { style: 'margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px' },
      h('li', {}, 'Open een authenticator-app (Microsoft Authenticator, Google Authenticator, Authy, 1Password of Bitwarden).'),
      h('li', {}, 'Kies “account toevoegen” en voer deze sleutel in (type: op tijd gebaseerd):', h('div', { class: 'linkbox', style: 'margin-top:6px;font-size:15px;letter-spacing:1px' }, grouped), h('div', { class: 'small', style: 'margin-top:4px' }, 'Op een telefoon kunt u ook ', h('a', { href: info.uri }, 'deze link'), ' openen.')),
      h('li', {}, 'Vul de 6-cijferige code uit de app hieronder in.')),
    field('Code uit de app', code), box, h('button', { class: 'btn', type: 'submit' }, 'Inschakelen')));
  code.focus();
}
function showCodes(root, codes) {
  clear(root).append(h('div', { class: 'card stack' }, h('h1', {}, 'Bewaar uw herstelcodes'),
    h('p', { class: 'sub' }, 'Raakt u uw telefoon kwijt, dan kunt u met een van deze codes inloggen. Elke code werkt één keer. Ze worden maar nu getoond.'),
    h('div', { class: 'linkbox', style: 'font-size:15px;line-height:1.9;columns:2' }, codes.map((c) => h('div', {}, c))),
    h('div', { class: 'row' }, h('button', { class: 'btn sec', onclick: async () => { try { await navigator.clipboard.writeText(codes.join('\n')); toast('Gekopieerd.'); } catch { toast('Kopiëren lukt niet; schrijf de codes over.'); } } }, 'Kopiëren'),
      h('button', { class: 'btn', onclick: async () => { await afterLogin(); } }, 'Ik heb ze veilig bewaard'))));
}
function viewMustChange() {
  const box = h('div');
  const a = h('input', { type: 'password', id: 'old', autocomplete: 'current-password', required: true });
  const b = h('input', { type: 'password', id: 'new', autocomplete: 'new-password', required: true, minlength: 12 });
  clear($root).append(h('div', { class: 'login' }, h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); clear(box);
    await safe(async () => { await api('POST', '/api/password', { old: a.value, password: b.value }); state.me.mustChange = false; toast('Wachtwoord gewijzigd.'); await afterLogin(); }, box);
  } }, h('h1', {}, 'Kies een eigen wachtwoord'), h('p', { class: 'sub' }, 'Het tijdelijke wachtwoord moet bij de eerste keer worden vervangen. Gebruik minimaal 12 tekens.'),
  field('Huidig (tijdelijk) wachtwoord', a), field('Nieuw wachtwoord', b), box, h('button', { class: 'btn', type: 'submit' }, 'Opslaan'))));
  a.focus();
}
async function viewInvite(token) {
  const box = h('div');
  let info;
  try { info = await api('GET', `/api/invite/${encodeURIComponent(token)}`); } catch (e) {
    clear($root).append(h('div', { class: 'login' }, h('div', { class: 'card' }, h('h1', {}, 'Link niet geldig'), errBox(e), h('a', { href: '#/' }, 'Naar de inlogpagina'))));
    return;
  }
  const pw = h('input', { type: 'password', id: 'np', autocomplete: 'new-password', required: true, minlength: 12 });
  clear($root).append(h('div', { class: 'login' }, h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault(); clear(box);
    await safe(async () => { const r = await api('POST', '/api/password/set', { token, password: pw.value }); location.hash = '#/'; if (r.login) { toast('Wachtwoord ingesteld. Log nu in.'); return viewLogin(); } state.me = r.user; await afterLogin(); }, box);
  } }, h('h1', {}, `Welkom, ${info.name}`), h('p', { class: 'sub' }, `Kies een wachtwoord voor ${info.email} (minimaal 12 tekens).`), field('Nieuw wachtwoord', pw), box, h('button', { class: 'btn', type: 'submit' }, 'Wachtwoord instellen'))));
  pw.focus();
}

// ---------- kader ----------
const NAV = [
  { id: 'overzicht', label: 'Overzicht', perm: 'overview' },
  { id: 'teksten', label: 'Teksten', perm: 'comment', badge: 'open' },
  { id: 'fotos', label: 'Foto’s', perm: 'photos.view', badge: 'photos' },
  { id: 'opmerkingen', label: 'Opmerkingen', perm: 'comment' },
  { sep: 'Beheer' },
  { id: 'websites', label: 'Websites', perm: 'sites' },
  { id: 'gebruikers', label: 'Gebruikers', perm: 'users' },
  { id: 'logboek', label: 'Logboek', perm: 'log' },
];
const currentRoute = () => (location.hash.replace(/^#\/?/, '').split('/')[0] || '');
function layout(content) {
  const cur = currentRoute() || (can('overview') ? 'overzicht' : 'teksten');
  const items = NAV.filter((n) => n.sep ? can('users') || can('sites') : can(n.perm)).map((n) => n.sep
    ? h('div', { class: 'sep' }, n.sep)
    : h('button', { 'aria-current': n.id === cur ? 'page' : null, onclick: () => { location.hash = `#/${n.id}`; } }, n.label, n.badge && state.badges[n.badge] ? h('span', { class: 'badge' }, state.badges[n.badge]) : null));
  const me = h('div', { class: 'me' }, h('b', {}, state.me.name), `${ROLE_NAMES[state.me.role]} · `, h('a', { href: '#', class: 'menu', onclick: async (e) => { e.preventDefault(); await api('POST', '/api/logout', {}); state.me = null; render(); } }, 'uitloggen'), ' · ', h('a', { href: '#/wachtwoord', class: 'menu' }, 'beveiliging'));
  clear($root).append(h('div', { class: 'app' }, h('aside', {}, h('div', { class: 'brand' }, h('i', {}, '▣'), 'WebsiteBeheerPortal'), h('nav', {}, items), me), h('main', {}, content)));
  return $root.querySelector('main');
}
async function refreshBadges() {
  state.badges = { open: 0, photos: 0 };
  try {
    if (can('overview')) {
      const { sites } = await api('GET', '/api/overview');
      state.badges.open = sites.reduce((n, s) => n + s.open, 0);
      state.badges.photos = sites.reduce((n, s) => n + s.pendingPhotos, 0);
    }
  } catch {}
}
async function afterLogin() { await refreshBadges(); render(); }

// ---------- overzicht ----------
async function viewOverview(main) {
  clear(main).append(h('h1', {}, 'Overzicht'), h('p', { class: 'sub' }, 'Bezig met laden…'));
  const { sites } = await api('GET', '/api/overview');
  const draw = (sites) => {
    const down = sites.flatMap((s) => s.targets).filter((t) => t.last && !t.last.ok).length;
    const all = sites.flatMap((s) => s.targets);
    const checked = all.filter((t) => t.last);
    const latest = checked.map((t) => t.last.at).sort().pop();
    const btn = can('check') ? h('button', { class: 'btn', onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Bezig met controleren…'; await safe(async () => { const r = await api('POST', '/api/check', {}); draw(r.sites); }); } }, 'Nu controleren') : null;
    const tile = (label, value, href) => h('div', { class: 'card' }, h('div', { class: 'sub', style: 'margin:0' }, label), h('div', { style: 'font-size:28px;font-weight:700' }, value));
    clear(main).append(h('h1', {}, 'Overzicht'), h('p', { class: 'sub' }, latest ? `Laatste controle ${ago(latest)}.` : 'De eerste controle loopt zo.'),
      h('div', { class: 'row', style: 'margin-bottom:16px' }, btn, down ? pill('bad', `${down} adres${down === 1 ? '' : 'sen'} niet bereikbaar`) : checked.length ? pill('ok', 'Alles bereikbaar') : null),
      h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:18px' },
        tile('Open opmerkingen', sites.reduce((n, s) => n + s.open, 0)), can('photo.approve') ? tile('Foto-voorstellen te beoordelen', sites.reduce((n, s) => n + s.pendingPhotos, 0)) : null, tile('Adressen bereikbaar', `${checked.filter((t) => t.last.ok).length} / ${all.length}`)),
      sites.map((s) => h('div', { class: 'card site', style: 'margin-bottom:14px' }, h('h2', {}, s.name), h('div', { class: 'meta' }, s.description && h('span', {}, s.description), h('span', {}, `${s.open} open opmerking${s.open === 1 ? '' : 'en'}`), s.pendingPhotos ? h('span', {}, `${s.pendingPhotos} foto-voorstel${s.pendingPhotos === 1 ? '' : 'len'}`) : null),
        s.targets.length ? h('div', { class: 'scroll' }, h('table', {}, h('tr', {}, ['Adres', 'Status', 'Taal klopt', 'Reactie', 'Certificaat', '24 uur'].map((x) => h('th', {}, x))), s.targets.map(targetRow))) : h('p', { class: 'sub' }, 'Nog geen adressen ingesteld.'))));
  };
  draw(sites);
}
function targetRow(t) {
  const l = t.last;
  let status = pill('warn', 'Nog niet gecontroleerd'), detail = '';
  if (l) {
    status = l.ok ? pill('ok', 'Online') : pill('bad', 'Niet bereikbaar');
    detail = l.ok ? `${l.ms} ms` : l.error ? (l.error === 'ENOTFOUND' ? 'domein bestaat nog niet (DNS)' : l.error) : `HTTP ${l.status}`;
  }
  const cert = l && l.certDays !== null ? (l.certValid ? `${l.certDays} dagen` : 'ongeldig') : '–';
  const lang = !l || !l.ok ? '–' : l.langOk === null ? '–' : l.langOk ? `ja (${l.htmlLang})` : `NEE (${l.htmlLang})`;
  return h('tr', {}, h('td', {}, h('span', { class: 'lng' }, (t.lang || '').toUpperCase()), ' ', h('a', { href: t.url, target: '_blank', rel: 'noopener', class: 'mono' }, t.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))), h('td', {}, status), h('td', {}, lang), h('td', {}, detail), h('td', {}, cert), h('td', {}, t.uptime === null ? '–' : `${t.uptime}%`));
}

// ---------- teksten ----------
async function viewTexts(main) {
  const st = state.texts;
  const { sites } = await api('GET', '/api/sites');
  const tsites = sites.filter((s) => s.texts);
  if (!tsites.length) return clear(main).append(h('h1', {}, 'Teksten'), h('p', { class: 'sub' }, 'Er zijn geen websites met teksten gekoppeld.'));
  if (!st.site || !tsites.some((s) => s.id === st.site)) st.site = tsites[0].id;
  const meta = await api('GET', `/api/texts/meta?site=${encodeURIComponent(st.site)}`);
  if (!st.lang || !meta.langs.some((l) => l.code === st.lang)) st.lang = (meta.langs.find((l) => l.code !== 'nl') || meta.langs[0]).code;
  const tableBox = h('div');
  const pagerBox = h('div');
  const drawer = h('aside', { class: 'drawer', 'aria-label': 'Tekstdetails' });
  const load = async () => {
    const qs = new URLSearchParams({ site: st.site, lang: st.lang, page: st.page, status: st.status, q: st.q, offset: st.offset, limit: 50 });
    const r = await api('GET', `/api/texts?${qs}`);
    const nlLang = st.lang === 'nl';
    clear(tableBox).append(h('div', { class: 'card scroll', style: 'padding:0' }, h('table', {},
      h('tr', {}, h('th', { style: 'width:16%' }, 'Pagina'), h('th', {}, 'Nederlands'), nlLang ? null : h('th', {}, LANG_NAMES[st.lang] || st.lang), h('th', { style: 'width:100px' }, 'Bron'), h('th', { style: 'width:90px' }, '')),
      r.items.length ? r.items.map((i) => h('tr', { class: 'click', tabindex: 0, onclick: () => openDrawer(i), onkeydown: (e) => { if (e.key === 'Enter') openDrawer(i); } },
        h('td', { class: 'mono' }, i.page), h('td', { class: 'nl' }, chips(i.nl)), nlLang ? null : h('td', {}, chips(i.tr)),
        h('td', {}, i.bron ? h('span', { class: `tag${i.bron === 'handmatig' ? ' m' : ''}` }, i.bron) : null),
        h('td', {}, i.open ? pill('warn', i.open) : i.total ? h('span', { class: 'small' }, `${i.total} ✓`) : null, i.accepted ? pill(i.accepted.applied ? 'ok' : 'warn', i.accepted.applied ? 'doorgevoerd' : 'voorstel') : null))) : h('tr', {}, h('td', { colspan: 5, class: 'sub' }, 'Geen teksten gevonden.')))));
    clear(pagerBox).append(h('div', { class: 'row', style: 'margin-top:12px;justify-content:space-between' },
      h('span', { class: 'sub', style: 'margin:0' }, r.total ? `${st.offset + 1}–${Math.min(st.offset + 50, r.total)} van ${r.total}` : '0 teksten'),
      h('span', { class: 'row' },
        h('button', { class: 'btn sec', disabled: st.offset === 0, onclick: () => { st.offset = Math.max(0, st.offset - 50); load(); } }, 'Vorige'),
        h('button', { class: 'btn sec', disabled: st.offset + 50 >= r.total, onclick: () => { st.offset += 50; load(); } }, 'Volgende'),
        can('export') && st.lang !== 'nl' ? h('a', { class: 'btn sec', href: `/api/export/overrides?site=${encodeURIComponent(st.site)}&lang=${st.lang}`, title: 'Bevat de originele handmatige vertalingen plus de geaccepteerde voorstellen' }, `Export: overrides/${st.lang}.json`) : null)));
  };
  const openDrawer = async (item) => {
    drawer.classList.add('open');
    const draw = async () => {
      const { comments } = await api('GET', `/api/comments?site=${encodeURIComponent(st.site)}&lang=${st.lang}&textId=${item.id}`);
      comments.sort((a, b) => (a.created < b.created ? -1 : 1));
      const text = h('textarea', { id: 'ctext', rows: 3, style: 'width:100%' });
      const prop = h('textarea', { id: 'cprop', rows: 4, style: 'width:100%' }, item.tr);
      const box = h('div');
      clear(drawer).append(
        h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, `${item.page} · ${LANG_NAMES[st.lang]}`), h('button', { class: 'btn sec', onclick: () => { drawer.classList.remove('open'); load(); } }, 'Sluiten')),
        h('div', { class: 'cols', style: 'margin-top:14px' },
          h('div', {}, h('span', { class: 'sub', style: 'margin:0' }, 'Nederlands'), h('p', { style: 'margin:4px 0' }, chips(item.nl))),
          st.lang === 'nl' ? null : h('div', {}, h('span', { class: 'sub', style: 'margin:0' }, 'Huidige vertaling ', item.bron ? h('span', { class: 'tag' }, item.bron) : null), h('p', { style: 'margin:4px 0' }, chips(item.tr)))),
        h('div', { class: 'thread' }, comments.length ? comments.map((c) => commentBlock(c, draw)) : h('p', { class: 'sub' }, 'Nog geen opmerkingen bij deze tekst.')),
        h('div', { class: 'stack' },
          field('Uw opmerking', text),
          st.lang === 'nl' ? null : field('Betere vertaling voorstellen (optioneel)', prop),
          st.lang === 'nl' ? null : h('p', { class: 'hint' }, 'Laat de markeringen {1}, {/1} enz. staan: die houden de opmaak vast. Laat het veld ongewijzigd als u geen voorstel heeft.'),
          box,
          h('button', { class: 'btn', onclick: async () => {
            clear(box);
            await safe(async () => {
              const body = { site: st.site, lang: st.lang, scope: 'text', textId: item.id, text: text.value };
              if (st.lang !== 'nl' && prop.value.trim() && prop.value.trim() !== item.tr) body.proposal = prop.value;
              await api('POST', '/api/comments', body);
              toast('Opmerking geplaatst.'); await draw();
            }, box);
          } }, 'Plaatsen')));
    };
    await safe(draw);
  };
  clear(main).append(h('h1', {}, 'Teksten'), h('p', { class: 'sub' }, 'Lees de teksten per taal en pagina, plaats een opmerking of stel een betere vertaling voor.'),
    h('div', { class: 'row', style: 'margin-bottom:14px' },
      tsites.length > 1 ? h('select', { 'aria-label': 'Website', onchange: (e) => { st.site = e.target.value; st.offset = 0; render(); } }, tsites.map((s) => h('option', { value: s.id, selected: s.id === st.site }, s.name))) : null,
      h('select', { 'aria-label': 'Taal', onchange: (e) => { st.lang = e.target.value; st.offset = 0; render(); } }, meta.langs.map((l) => h('option', { value: l.code, selected: l.code === st.lang }, l.name))),
      h('select', { 'aria-label': 'Pagina', onchange: (e) => { st.page = e.target.value; st.offset = 0; load(); } }, h('option', { value: '' }, `Alle pagina’s (${meta.pages.reduce((n, p) => n + p.count, 0)})`), meta.pages.map((p) => h('option', { value: p.page, selected: p.page === st.page }, `${p.page} (${p.count})`))),
      h('select', { 'aria-label': 'Filter', onchange: (e) => { st.status = e.target.value; st.offset = 0; load(); } }, [['', 'Alles'], ['open', 'Open opmerkingen'], ['commented', 'Met opmerkingen'], ['pending', 'Voorstel nog door te voeren'], ['machine', 'Vertaald met DeepL'], ['manual', 'Handmatig'], ['missing', 'Ontbreekt']].map(([v, l]) => h('option', { value: v, selected: v === st.status }, l))),
      h('input', { type: 'search', placeholder: 'Zoeken in teksten', 'aria-label': 'Zoeken', value: st.q, style: 'flex:1;min-width:160px', oninput: debounce((e) => { st.q = e.target.value; st.offset = 0; load(); }, 300) })),
    tableBox, pagerBox, drawer);
  await load();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function commentBlock(c, redraw, opts = {}) {
  const replyBox = h('input', { type: 'text', 'aria-label': 'Reactie', placeholder: 'Reageer…', style: 'flex:1' });
  const setStatus = (status) => async () => { await safe(async () => { await api('POST', `/api/comments/${c.id}/status`, { status }); await refreshBadges(); await redraw(); }); };
  return h('div', { class: 'msg' },
    h('small', {}, `${c.author.name} · ${ROLE_NAMES[c.author.role] || ''} · ${fmtDate(c.created)} · `, h('b', {}, STATUS_NAMES[c.status] || c.status)),
    opts.context ? h('div', { class: 'small', style: 'margin-bottom:4px' }, opts.context) : null,
    h('div', { style: 'white-space:pre-wrap' }, c.text),
    c.proposal ? h('div', { class: 'prop' }, h('small', {}, 'Voorgestelde vertaling'), chips(c.proposal)) : null,
    c.replies.map((r) => h('div', { style: 'margin-top:8px;padding-left:10px;border-left:2px solid var(--line)' }, h('small', {}, `${r.author.name} · ${fmtDate(r.created)}`), h('div', { style: 'white-space:pre-wrap' }, r.text))),
    h('div', { class: 'row', style: 'margin-top:10px' },
      c.proposal && c.status === 'open' && can('accept') ? h('button', { class: 'btn good', onclick: setStatus('accepted') }, 'Voorstel accepteren') : null,
      c.proposal && c.status === 'open' && can('accept') ? h('button', { class: 'btn bad', onclick: setStatus('rejected') }, 'Afwijzen') : null,
      c.status === 'open' && can('resolve') ? h('button', { class: 'btn sec', onclick: setStatus('resolved') }, 'Afhandelen') : null,
      c.status !== 'open' && (can('resolve') || c.author.id === state.me.id) ? h('button', { class: 'btn sec', onclick: setStatus('open') }, 'Heropenen') : null),
    h('div', { class: 'row', style: 'margin-top:8px' }, replyBox, h('button', { class: 'btn sec', onclick: async () => { if (!replyBox.value.trim()) return; await safe(async () => { await api('POST', `/api/comments/${c.id}/reply`, { text: replyBox.value }); await redraw(); }); } }, 'Reageren')));
}

// ---------- opmerkingen ----------
const cfilter = { status: 'open', lang: '' };
async function viewComments(main) {
  const { sites } = await api('GET', '/api/sites');
  const list = h('div', { class: 'stack' });
  const formBox = h('div');
  const draw = async () => {
    const qs = new URLSearchParams({ ...(cfilter.status ? { status: cfilter.status } : {}), ...(cfilter.lang ? { lang: cfilter.lang } : {}) });
    const { comments } = await api('GET', `/api/comments?${qs}`);
    const nameOf = (id) => sites.find((s) => s.id === id)?.name || id;
    clear(list).append(comments.length ? comments.map((c) => h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:6px' }, h('b', {}, `${nameOf(c.site)}${c.lang ? ' · ' + c.lang.toUpperCase() : ''}${c.page ? ' · ' + c.page : ''}`), pill(c.status === 'open' ? 'warn' : 'ok', STATUS_NAMES[c.status])),
      c.quote ? h('p', { class: 'nl', style: 'margin:0 0 6px' }, '„', chips(c.quote), '”') : null,
      commentBlock(c, async () => { await draw(); }))) : h('p', { class: 'sub' }, 'Geen opmerkingen met dit filter.'));
  };
  const siteSel = h('select', { id: 'ns', 'aria-label': 'Website' }, sites.map((s) => h('option', { value: s.id }, s.name)));
  const langIn = h('input', { id: 'nl', placeholder: 'bijv. de (leeg = algemeen)', style: 'width:100%' });
  const pageIn = h('input', { id: 'np', placeholder: 'Pagina of adres, bijv. /palletrotator/', style: 'width:100%' });
  const quoteIn = h('input', { id: 'nq', placeholder: 'Tekst waar het over gaat (optioneel)', style: 'width:100%' });
  const textIn = h('textarea', { id: 'nt', rows: 3, style: 'width:100%' });
  const toggle = h('button', { class: 'btn sec', onclick: () => { formBox.hidden = !formBox.hidden; } }, 'Nieuwe opmerking op een pagina');
  clear(formBox).append(h('div', { class: 'card stack', style: 'margin-bottom:14px' }, field('Website', siteSel), field('Taal', langIn), field('Pagina', pageIn), field('Tekst of onderdeel', quoteIn), field('Opmerking', textIn), h('button', { class: 'btn', onclick: async () => {
    await safe(async () => { await api('POST', '/api/comments', { site: siteSel.value, lang: langIn.value, scope: 'page', page: pageIn.value, quote: quoteIn.value, text: textIn.value }); textIn.value = ''; toast('Opmerking geplaatst.'); formBox.hidden = true; await refreshBadges(); await draw(); });
  } }, 'Plaatsen')));
  formBox.hidden = true;
  clear(main).append(h('h1', {}, 'Opmerkingen'), h('p', { class: 'sub' }, 'Alles wat nalezers en collega’s hebben geschreven, met status.'),
    h('div', { class: 'row', style: 'margin-bottom:14px' },
      h('select', { 'aria-label': 'Status', onchange: (e) => { cfilter.status = e.target.value; draw(); } }, [['open', 'Open'], ['closed', 'Afgehandeld of beoordeeld'], ['', 'Alle']].map(([v, l]) => h('option', { value: v, selected: v === cfilter.status }, l))),
      h('select', { 'aria-label': 'Taal', onchange: (e) => { cfilter.lang = e.target.value; draw(); } }, [['', 'Alle talen'], ...Object.entries(LANG_NAMES)].map(([v, l]) => h('option', { value: v, selected: v === cfilter.lang }, l))),
      toggle, can('export') ? h('a', { class: 'btn sec', href: '/api/export/comments.csv' }, 'Exporteren (CSV)') : null),
    formBox, list);
  await draw();
}

// ---------- foto's ----------
async function viewPhotos(main) {
  const { sites } = await api('GET', '/api/sites');
  const psites = sites.filter((s) => s.photos);
  if (!psites.length) return clear(main).append(h('h1', {}, 'Foto’s'), h('p', { class: 'sub' }, 'Er zijn geen websites met foto’s gekoppeld.'));
  const grid = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(250px,1fr))' });
  const modal = h('div', { class: 'modal' });
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  const closeModal = () => { modal.classList.remove('open'); clear(modal); };
  let current = psites[0].id;
  const draw = async () => {
    const r = await api('GET', `/api/photos?site=${encodeURIComponent(current)}`);
    const slots = r.slots;
    clear(grid).append(slots.map((s) => {
      const pending = s.proposals.filter((p) => p.status === 'pending').length;
      const last = s.history.find((x) => x.action.startsWith('goedgekeurd'));
      const sq = s.aspect === '1:1';
      return h('div', { class: 'card photo' },
        s.hasBaseline || s.live ? h('img', { src: `/file/live/${s.site}/${s.id}/${s.sizes[s.sizes.length - 1]}?v=${s.version}`, alt: s.label, loading: 'lazy', style: sq ? 'aspect-ratio:1/1' : null }) : h('div', { style: 'aspect-ratio:3/2;background:var(--soft);display:grid;place-items:center;color:var(--muted)' }, 'nog geen foto'),
        h('div', { class: 'b' }, h('b', {}, s.label), h('span', { class: 'small' }, s.usage),
          h('span', {}, s.live ? h('span', { class: 'tag m' }, `gewijzigd${last ? ' door ' + last.by : ''}`) : h('span', { class: 'tag' }, s.hasBaseline ? 'origineel' : 'ontbreekt'), ' ', pending ? pill('warn', `${pending} voorstel${pending > 1 ? 'len' : ''} wacht`) : null),
          h('button', { class: pending && can('photo.approve') ? 'btn' : 'btn sec', onclick: () => openSlot(s) }, pending && can('photo.approve') ? 'Beoordelen' : can('photo.propose') ? 'Beheren' : 'Bekijken')));
    }));
    await refreshBadges();
  };
  const openSlot = (s) => {
    const pend = s.proposals.filter((p) => p.status === 'pending');
    const big = s.sizes[0];
    const box = h('div');
    const note = h('input', { type: 'text', id: 'pnote', placeholder: 'Waarom deze foto? (optioneel)', style: 'width:100%' });
    const editorBox = h('div', { class: 'stack' });
    clear(modal).append(h('div', { class: 'card stack' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, s.label), h('button', { class: 'btn sec', onclick: closeModal }, 'Sluiten')),
      h('p', { class: 'hint' }, s.usage),
      h('div', {}, h('span', { class: 'small' }, s.live ? 'Nu live (gewijzigd)' : 'Nu live (origineel)'), s.hasBaseline || s.live ? h('img', { src: `/file/live/${s.site}/${s.id}/${s.sizes[s.sizes.length - 1]}?v=${s.version}`, alt: '', style: 'width:100%;border-radius:8px;display:block;max-height:320px;object-fit:contain;background:var(--soft)' }) : h('p', { class: 'sub' }, 'Er staat nog geen foto op de website.')),
      pend.map((p) => h('div', { class: 'msg' }, h('small', {}, `Voorstel van ${p.by} · ${fmtDate(p.at)}${p.note ? ' · ' + p.note : ''}`),
        h('img', { src: `/file/proposal/${s.site}/${s.id}/${p.id}/${s.sizes[s.sizes.length - 1]}`, alt: 'voorstel', style: 'width:100%;border-radius:8px;display:block;max-height:320px;object-fit:contain;background:var(--soft)' }),
        can('photo.approve') ? h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn good', onclick: async () => { await safe(async () => { await api('POST', `/api/photos/${s.site}/${s.id}/proposals/${p.id}/approve`, {}); toast('Foto staat nu live (binnen enkele minuten overal zichtbaar).'); closeModal(); await draw(); }); } }, 'Goedkeuren en live zetten'),
          h('button', { class: 'btn bad', onclick: async () => { await safe(async () => { await api('POST', `/api/photos/${s.site}/${s.id}/proposals/${p.id}/reject`, {}); closeModal(); await draw(); }); } }, 'Afwijzen')) : null)),
      can('photo.propose') ? h('div', { class: 'stack' }, h('hr', { style: 'border:0;border-top:1px solid var(--line);width:100%' }), h('b', {}, 'Nieuwe foto voorstellen'),
        h('p', { class: 'hint' }, `Kies een foto. Het portaal snijdt hem op de juiste verhouding (${s.aspect}) en maakt zelf de ${s.sizes.length} formaten die de site nodig heeft. Gebruik Chrome, Edge of Firefox.`),
        h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Foto kiezen', onchange: (e) => e.target.files[0] && startEditor(e.target.files[0], s, editorBox, note, box, closeModal, draw) }), editorBox) : null,
      can('photo.approve') && s.live ? h('button', { class: 'btn bad', onclick: async () => { await safe(async () => { await api('POST', `/api/photos/${s.site}/${s.id}/revert`, {}); toast('Teruggezet naar de originele foto.'); closeModal(); await draw(); }); } }, 'Terugzetten naar origineel') : null,
      s.history.length ? h('details', {}, h('summary', { class: 'small' }, 'Geschiedenis'), s.history.map((x) => h('div', { class: 'small' }, `${fmtDate(x.at)} · ${x.by}: ${x.action}`))) : null, box));
    modal.classList.add('open');
  };
  clear(main).append(h('h1', {}, 'Foto’s'), h('p', { class: 'sub' }, 'Vervang foto’s zonder de website opnieuw te bouwen. Een nieuwe foto wordt eerst voorgesteld en daarna goedgekeurd.'),
    psites.length > 1 ? h('div', { class: 'row', style: 'margin-bottom:14px' }, h('select', { 'aria-label': 'Website', onchange: (e) => { current = e.target.value; draw(); } }, psites.map((x) => h('option', { value: x.id }, x.name)))) : null, grid, modal);
  await draw();
}

function startEditor(file, slot, host, noteInput, box, closeModal, redraw) {
  const [aw, ah] = slot.aspect.split(':').map(Number);
  const W = 560, H = Math.round(W * ah / aw);
  const canvas = h('canvas', { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const img = new Image();
  const url = URL.createObjectURL(file);
  let zoom = 1, ox = 0, oy = 0;
  const geom = () => {
    const base = Math.max(W / img.naturalWidth, H / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * base, dh = img.naturalHeight * base;
    ox = Math.min(0, Math.max(W - dw, ox)); oy = Math.min(0, Math.max(H - dh, oy));
    return { base, dw, dh };
  };
  const paint = () => { const g = geom(); ctx.clearRect(0, 0, W, H); ctx.drawImage(img, ox, oy, g.dw, g.dh); };
  const slider = h('input', { type: 'range', min: 1, max: 3, step: 0.01, value: 1, 'aria-label': 'Inzoomen', oninput: (e) => {
    const g0 = geom(); const cx = (W / 2 - ox) / g0.dw, cy = (H / 2 - oy) / g0.dh;
    zoom = Number(e.target.value); const g = geom(); ox = W / 2 - cx * g.dw; oy = H / 2 - cy * g.dh; paint();
  } });
  let drag = null;
  const wrap = h('div', { class: 'crop' }, canvas);
  wrap.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; wrap.setPointerCapture(e.pointerId); wrap.style.cursor = 'grabbing'; });
  wrap.addEventListener('pointermove', (e) => { if (!drag) return; const k = W / wrap.clientWidth; ox = drag.ox + (e.clientX - drag.x) * k; oy = drag.oy + (e.clientY - drag.y) * k; paint(); });
  wrap.addEventListener('pointerup', () => { drag = null; wrap.style.cursor = 'grab'; });
  const status = h('p', { class: 'hint' }, 'Foto laden…');
  const send = h('button', { class: 'btn', disabled: true, onclick: async () => {
    send.disabled = true; clear(box);
    await safe(async () => {
      const g = geom();
      const files = {};
      for (const size of slot.sizes) {
        const [tw, th] = slot.dims[size];
        const c = document.createElement('canvas'); c.width = tw; c.height = th;
        const k = tw / W;
        c.getContext('2d').drawImage(img, ox * k, oy * k, g.dw * k, g.dh * k);
        const blob = await new Promise((res) => c.toBlob(res, 'image/webp', 0.86));
        if (!blob || blob.type !== 'image/webp') throw new Error('Deze browser kan geen WebP maken. Gebruik Chrome, Edge of Firefox.');
        files[size] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
      }
      await api('POST', `/api/photos/${slot.site}/${slot.id}/proposals`, { note: noteInput.value, files });
      toast('Voorstel verstuurd.'); URL.revokeObjectURL(url); closeModal(); await redraw();
    }, box);
    send.disabled = false;
  } }, 'Voorstel versturen');
  img.onload = () => {
    zoom = 1; const g = geom(); ox = (W - g.dw) / 2; oy = (H - g.dh) / 2; paint(); send.disabled = false;
    const low = img.naturalWidth < slot.dims[slot.sizes[0]][0];
    clear(status).append(low ? `Let op: de foto is klein (${img.naturalWidth}×${img.naturalHeight}); op de website kan hij wat onscherp ogen. Sleep om te verschuiven.` : `Sleep om te verschuiven en gebruik de schuif om in te zoomen.`);
  };
  img.onerror = () => { clear(status).append('Dit bestand kan niet als foto worden gelezen.'); };
  img.src = url;
  clear(host).append(status, wrap, slider, field('Toelichting', noteInput), send);
}

// ---------- websites ----------
async function viewSites(main) {
  const { sites } = await api('GET', '/api/sites');
  const modal = h('div', { class: 'modal' });
  const close = () => { modal.classList.remove('open'); clear(modal); };
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  const edit = (s) => {
    const name = h('input', { id: 'sn', value: s ? s.name : '', style: 'width:100%' });
    const desc = h('input', { id: 'sd', value: s ? s.description : '', style: 'width:100%' });
    const rows = h('div', { class: 'stack' });
    const addRow = (t = {}) => {
      const label = h('input', { placeholder: 'Naam, bijv. DE · palletrotator.de', value: t.label || '', 'aria-label': 'Naam', style: 'flex:2;min-width:140px' });
      const lang = h('input', { placeholder: 'taal', value: t.lang || '', 'aria-label': 'Taalcode', style: 'width:64px' });
      const url = h('input', { placeholder: 'https://…', value: t.url || '', 'aria-label': 'Adres', style: 'flex:3;min-width:180px' });
      const row = h('div', { class: 'row', 'data-row': 1 }, label, lang, url, h('button', { class: 'btn sec', 'aria-label': 'Adres verwijderen', onclick: () => row.remove() }, '✕'));
      row._get = () => ({ id: t.id, label: label.value, lang: lang.value, url: url.value });
      rows.append(row);
    };
    (s ? s.targets : [{}]).forEach(addRow);
    const box = h('div');
    clear(modal).append(h('div', { class: 'card stack' }, h('b', {}, s ? `Bewerken: ${s.name}` : 'Website toevoegen'), field('Naam', name), field('Omschrijving', desc),
      h('div', {}, h('b', {}, 'Adressen die gecontroleerd worden'), h('p', { class: 'hint' }, 'Elk adres wordt elke 5 minuten bezocht. De taalcode (nl, de, …) wordt vergeleken met de taal die de pagina zelf aangeeft.')), rows,
      h('button', { class: 'btn sec', onclick: () => addRow() }, 'Adres toevoegen'), box,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => {
        clear(box);
        await safe(async () => {
          const body = { name: name.value, description: desc.value, targets: [...rows.querySelectorAll('[data-row]')].map((r) => r._get()).filter((t) => t.url.trim()) };
          await api(s ? 'PUT' : 'POST', s ? `/api/sites/${s.id}` : '/api/sites', body);
          toast('Opgeslagen.'); close(); render();
        }, box);
      } }, 'Opslaan'), h('button', { class: 'btn sec', onclick: close }, 'Annuleren'),
      s ? h('button', { class: 'btn bad right', onclick: async () => { await safe(async () => { await api('DELETE', `/api/sites/${s.id}`); close(); render(); }); } }, 'Verwijderen') : null)));
    modal.classList.add('open');
  };
  clear(main).append(h('h1', {}, 'Websites'), h('p', { class: 'sub' }, 'Websites met een koppeling melden zichzelf automatisch aan. Hier voegt u daarnaast gewone websites toe waarvan alleen de bereikbaarheid gecontroleerd wordt.'),
    h('div', { class: 'card scroll' }, h('table', {}, h('tr', {}, ['Naam', 'Adressen', 'Gekoppeld', ''].map((x) => h('th', {}, x))),
      sites.map((s) => h('tr', {}, h('td', {}, s.name), h('td', {}, `${s.targets.length} adres${s.targets.length === 1 ? '' : 'sen'}`), h('td', {}, s.texts ? h('span', { class: 'tag' }, 'teksten') : null, ' ', s.photos ? h('span', { class: 'tag' }, 'foto’s') : null), h('td', {}, s.source === 'manual' ? h('button', { class: 'btn sec', onclick: () => edit(s) }, 'Bewerken') : h('span', { class: 'tag' }, 'meldt zichzelf aan')))))),
    h('p', {}, h('button', { class: 'btn', onclick: () => edit(null) }, 'Website toevoegen')), modal);
}

// ---------- gebruikers ----------
async function viewUsers(main) {
  const { users } = await api('GET', '/api/users');
  const { sites } = await api('GET', '/api/sites');
  const modal = h('div', { class: 'modal' });
  const close = () => { modal.classList.remove('open'); clear(modal); };
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  const showInvite = (inv, who) => {
    clear(modal).append(h('div', { class: 'card stack' }, h('b', {}, `Uitnodiging voor ${who}`),
      inv.mailed ? h('div', { class: 'note' }, 'Er is een e-mail verstuurd met een link om een wachtwoord te kiezen.') : h('div', { class: 'note' }, inv.mailError ? `De e-mail kon niet verstuurd worden (${inv.mailError}). ` : inv.smtp ? '' : 'Er is geen e-mail ingesteld op de server. ', 'Stuur deze link zelf door (7 dagen geldig, werkt één keer):'),
      h('div', { class: 'linkbox' }, inv.link),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(inv.link); toast('Link gekopieerd.'); } catch { toast('Kopiëren lukt niet; selecteer de link handmatig.'); } } }, 'Link kopiëren'), h('button', { class: 'btn sec', onclick: () => { close(); render(); } }, 'Klaar'))));
    modal.classList.add('open');
  };
  const editor = (u) => {
    const name = h('input', { id: 'un', value: u ? u.name : '', style: 'width:100%' });
    const email = h('input', { id: 'ue', type: 'email', value: u ? u.email : '', disabled: !!u, style: 'width:100%' });
    const role = h('select', { id: 'ur' }, ['reviewer', 'editor', 'admin'].map((r) => h('option', { value: r, selected: u ? u.role === r : r === 'reviewer' }, ROLE_NAMES[r])));
    const langChecks = Object.entries(LANG_NAMES).map(([code, nm]) => h('label', {}, h('input', { type: 'checkbox', value: code, checked: u ? u.langs.includes(code) : false }), nm));
    const siteChecks = sites.map((s) => h('label', {}, h('input', { type: 'checkbox', value: s.id, checked: u ? u.siteIds.includes(s.id) : false }), s.name));
    const mail = h('input', { type: 'checkbox', checked: true });
    const disabled = h('input', { type: 'checkbox', checked: u ? u.disabled : false });
    const box = h('div');
    const vals = (list) => list.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
    clear(modal).append(h('div', { class: 'card stack' }, h('b', {}, u ? `Bewerken: ${u.name}` : 'Gebruiker uitnodigen'), field('Naam', name), field('E-mailadres', email), field('Rol', role),
      h('p', { class: 'hint' }, 'Beheerder: alles. Redacteur: overzicht, opmerkingen en foto’s voorstellen. Nalezer: alleen teksten lezen en opmerkingen plaatsen.'),
      h('div', {}, h('b', {}, 'Talen'), h('p', { class: 'hint' }, 'Leeg = alle talen.'), h('div', { class: 'checks' }, langChecks)),
      h('div', {}, h('b', {}, 'Websites'), h('p', { class: 'hint' }, 'Leeg = alle websites.'), h('div', { class: 'checks' }, siteChecks)),
      u ? h('label', { class: 'checks' }, disabled, 'Toegang geblokkeerd') : h('label', { class: 'checks' }, mail, 'Uitnodiging per e-mail versturen'), box,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => {
        clear(box);
        await safe(async () => {
          const body = { name: name.value, role: role.value, langs: vals(langChecks), siteIds: vals(siteChecks) };
          if (u) { body.disabled = disabled.checked; await api('PUT', `/api/users/${u.id}`, body); toast('Opgeslagen.'); close(); render(); }
          else { const r = await api('POST', '/api/users', { ...body, email: email.value, mail: mail.checked }); showInvite(r.invite, r.user.name); }
        }, box);
      } }, u ? 'Opslaan' : 'Uitnodigen'), h('button', { class: 'btn sec', onclick: close }, 'Annuleren'),
      u ? h('button', { class: 'btn sec', onclick: async () => { await safe(async () => { const r = await api('POST', `/api/users/${u.id}/invite`, {}); showInvite(r.invite, u.name); }); } }, 'Nieuwe link / wachtwoord resetten') : null,
      u ? h('button', { class: 'btn sec', onclick: async () => { await safe(async () => { await api('POST', `/api/users/${u.id}/reset2fa`, {}); toast('2FA gereset: de gebruiker stelt het opnieuw in bij de volgende inlog.'); close(); render(); }); } }, '2FA resetten') : null,
      u ? h('button', { class: 'btn sec', onclick: async () => { await safe(async () => { await api('POST', `/api/users/${u.id}/revoke`, {}); toast('Alle sessies van deze gebruiker zijn beëindigd.'); close(); render(); }); } }, 'Sessies beëindigen') : null,
      u && u.id !== state.me.id ? h('button', { class: 'btn bad right', onclick: async () => { await safe(async () => { await api('DELETE', `/api/users/${u.id}`); close(); render(); }); } }, 'Verwijderen') : null)));
    modal.classList.add('open');
  };
  clear(main).append(h('h1', {}, 'Gebruikers'), h('p', { class: 'sub' }, 'Beheerders, redacteuren en nalezers. Een nalezer ziet alleen de teksten van zijn eigen taal.'),
    h('div', { class: 'card scroll' }, h('table', {}, h('tr', {}, ['Naam', 'E-mail', 'Rol', '2FA', 'Toegang', 'Laatst ingelogd', ''].map((x) => h('th', {}, x))),
      users.map((u) => h('tr', {}, h('td', {}, u.name), h('td', {}, u.email), h('td', {}, h('span', { class: `tag${u.role === 'admin' ? ' m' : ''}` }, ROLE_NAMES[u.role]), u.disabled ? ' ' : null, u.disabled ? pill('bad', 'geblokkeerd') : null, u.invited ? ' ' : null, u.invited ? pill('warn', 'uitgenodigd') : null),
        h('td', {}, u.twoFa ? pill('ok', 'aan') : pill('warn', 'uit')),
        h('td', {}, [u.langs.length ? u.langs.map((l) => LANG_NAMES[l] || l).join(', ') : 'alle talen', u.siteIds.length ? ` · ${u.siteIds.length} website(s)` : ''].join('')), h('td', {}, u.lastLogin ? ago(u.lastLogin) : '–'), h('td', {}, h('button', { class: 'btn sec', onclick: () => editor(u) }, 'Bewerken')))))),
    h('p', {}, h('button', { class: 'btn', onclick: () => editor(null) }, 'Gebruiker uitnodigen')), modal);
}

// ---------- logboek ----------
async function viewLog(main) {
  const { log } = await api('GET', '/api/log');
  clear(main).append(h('h1', {}, 'Logboek'), h('p', { class: 'sub' }, 'Wie heeft wat gedaan (laatste 300 gebeurtenissen).'),
    h('div', { class: 'card scroll' }, h('table', {}, log.map((l) => h('tr', {}, h('td', { class: 'mono' }, fmtDate(l.at)), h('td', {}, l.user), h('td', {}, l.action, l.detail ? ` · ${l.detail}` : ''))))));
}

// ---------- beveiliging (wachtwoord en 2FA) ----------
function viewPassword(main) {
  const box = h('div');
  const a = h('input', { type: 'password', id: 'o', autocomplete: 'current-password' });
  const b = h('input', { type: 'password', id: 'n', autocomplete: 'new-password' });
  const box2 = h('div');
  const rp = h('input', { type: 'password', id: 'rp', autocomplete: 'current-password' });
  const rc = h('input', { type: 'text', id: 'rc', inputmode: 'numeric', autocomplete: 'one-time-code' });
  const codesBox = h('div');
  const mfa = state.me.twoFa
    ? h('div', { class: 'card stack', style: 'max-width:420px' }, h('h2', { style: 'margin:0' }, 'Tweestapsverificatie'), pill('ok', 'Ingeschakeld'), h('p', { class: 'hint' }, `Nog ${state.me.recoveryLeft} herstelcode${state.me.recoveryLeft === 1 ? '' : 's'} over.`),
      h('p', { class: 'hint' }, 'Nieuwe herstelcodes maken of uitschakelen vraagt uw wachtwoord en een code uit de app.'), field('Wachtwoord', rp), field('Code uit de app', rc), box2, codesBox,
      h('div', { class: 'row' }, h('button', { class: 'btn sec', onclick: async () => { clear(box2); clear(codesBox); await safe(async () => { const r = await api('POST', '/api/2fa/recovery', { password: rp.value, code: rc.value }); codesBox.append(h('div', { class: 'note' }, 'Nieuwe herstelcodes (de oude werken niet meer):'), h('div', { class: 'linkbox', style: 'columns:2;line-height:1.9' }, r.recoveryCodes.map((c) => h('div', {}, c)))); state.me.recoveryLeft = r.recoveryCodes.length; }, box2); } }, 'Nieuwe herstelcodes'),
        h('button', { class: 'btn bad', onclick: async () => { clear(box2); await safe(async () => { await api('POST', '/api/2fa/disable', { password: rp.value, code: rc.value }); state.me.twoFa = false; toast('Tweestapsverificatie uitgeschakeld.'); render(); }, box2); } }, 'Uitschakelen')))
    : h('div', { class: 'card stack', style: 'max-width:420px' }, h('h2', { style: 'margin:0' }, 'Tweestapsverificatie'), pill('warn', 'Staat uit'), h('button', { class: 'btn', onclick: () => { state.me.needs2fa = true; render(); } }, 'Nu instellen'));
  clear(main).append(h('h1', {}, 'Beveiliging'), h('div', { class: 'stack' },
    h('div', { class: 'card stack', style: 'max-width:420px' }, h('h2', { style: 'margin:0' }, 'Wachtwoord wijzigen'), field('Huidig wachtwoord', a), field('Nieuw wachtwoord (minimaal 12 tekens)', b), box,
      h('button', { class: 'btn', onclick: async () => { clear(box); await safe(async () => { await api('POST', '/api/password', { old: a.value, password: b.value }); toast('Wachtwoord gewijzigd.'); a.value = ''; b.value = ''; }, box); } }, 'Opslaan')),
    mfa));
}

// ---------- router ----------
const VIEWS = { overzicht: viewOverview, teksten: viewTexts, fotos: viewPhotos, opmerkingen: viewComments, websites: viewSites, gebruikers: viewUsers, logboek: viewLog, wachtwoord: viewPassword };
const NEED = { overzicht: 'overview', teksten: 'comment', fotos: 'photos.view', opmerkingen: 'comment', websites: 'sites', gebruikers: 'users', logboek: 'log' };
let renderToken = 0;
async function render() {
  const token = ++renderToken;
  const inv = location.hash.match(/^#\/wachtwoord\/(.+)$/);
  if (inv) return viewInvite(decodeURIComponent(inv[1]));
  if (!state.me) return viewLogin();
  if (state.me.mustChange) return viewMustChange();
  if (state.me.needs2fa) return viewSetup2fa();
  let route = currentRoute();
  if (!route || !VIEWS[route] || (NEED[route] && !can(NEED[route]))) route = can('overview') ? 'overzicht' : 'teksten';
  const main = layout(h('div', {}, 'Laden…'));
  try { await VIEWS[route](main); } catch (e) { if (token === renderToken) clear(main).append(h('h1', {}, 'Er ging iets mis'), errBox(e)); }
}
window.addEventListener('hashchange', render);

(async () => {
  try { state.me = (await api('GET', '/api/me')).user; await refreshBadges(); } catch { state.me = null; }
  render();
})();
