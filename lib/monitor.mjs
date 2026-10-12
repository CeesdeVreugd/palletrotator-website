// Bereikbaarheids- en taalcontrole van de websites (elke paar minuten). Geen dependencies.
import tls from 'node:tls';
import { load, save, log } from './store.mjs';

const KEEP = 288; // 24 uur bij 5 minuten

export const targetKey = (siteId, targetId) => `${siteId}:${targetId}`;

function certDays(host) {
  return new Promise((resolve) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 8000, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate();
      const ok = s.authorized;
      s.end();
      if (!c || !c.valid_to) return resolve({ days: null, valid: false });
      resolve({ days: Math.floor((new Date(c.valid_to) - Date.now()) / 86400000), valid: ok });
    });
    s.on('error', () => resolve({ days: null, valid: false }));
    s.on('timeout', () => { s.destroy(); resolve({ days: null, valid: false }); });
  });
}

export async function checkTarget(t) {
  const started = Date.now();
  const res = { at: new Date().toISOString(), ok: false, status: null, ms: null, htmlLang: null, langOk: null, certDays: null, certValid: null, error: null, finalUrl: null };
  try {
    const r = await fetch(t.url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'PalletRotator-Portal/1.0 (+monitor)' } });
    res.status = r.status; res.ms = Date.now() - started; res.finalUrl = r.url;
    res.ok = r.status >= 200 && r.status < 400;
    const body = (await r.text()).slice(0, 30000);
    const m = body.match(/<html[^>]*\slang=["']?([a-zA-Z-]+)/i);
    res.htmlLang = m ? m[1].toLowerCase() : null;
    if (t.lang && res.htmlLang) res.langOk = res.htmlLang.slice(0, 2) === t.lang.slice(0, 2);
  } catch (e) {
    res.error = e.cause?.code || e.name || e.message;
    res.ms = Date.now() - started;
  }
  try {
    const u = new URL(t.url);
    if (u.protocol === 'https:') { const c = await certDays(u.hostname); res.certDays = c.days; res.certValid = c.valid; }
  } catch {}
  return res;
}

export async function runChecks(sites, only) {
  const checks = load('checks.json', {});
  const jobs = [];
  for (const s of sites) {
    if (only && only !== s.id) continue;
    for (const t of s.targets || []) jobs.push([s, t]);
  }
  await Promise.all(jobs.map(async ([s, t]) => {
    const key = targetKey(s.id, t.id);
    const r = await checkTarget(t);
    const prev = checks[key] || { history: [] };
    const wasOk = prev.last ? prev.last.ok : null;
    const history = [...prev.history, { at: r.at, ok: r.ok, ms: r.ms }].slice(-KEEP);
    let downSince = prev.downSince || null;
    if (!r.ok && !downSince) downSince = r.at;
    if (r.ok) downSince = null;
    checks[key] = { last: r, history, downSince };
    if (wasOk !== null && wasOk !== r.ok) log('monitor', r.ok ? 'weer bereikbaar' : 'onbereikbaar', `${s.name} ${t.label}: ${r.error || r.status}`);
  }));
  save('checks.json');
  return checks;
}

export const uptimePct = (history) => {
  if (!history || !history.length) return null;
  return Math.round((history.filter((h) => h.ok).length / history.length) * 1000) / 10;
};

export function startMonitor(getSites) {
  const minutes = Math.max(1, Number(process.env.CHECK_INTERVAL_MIN || 5));
  const tick = () => runChecks(getSites()).catch((e) => console.error('[monitor]', e.message));
  setTimeout(tick, 3000);
  return setInterval(tick, minutes * 60000);
}
