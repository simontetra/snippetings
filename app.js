const SETTINGS = ["Bus","Train","Street","Café","Shop","Waiting room","Pub","Work","Other"];
const { url: API, key: KEY } = window.SNIPPETINGS || {};
const $ = s => document.querySelector(s);
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

let chosen = "Bus", filter = "All", order = "new", docs = [];
const mine = load("snip-reacts", {});           // remembers what this browser smiled at / reported

function load(k, d){ try { return JSON.parse(localStorage.getItem(k)) || d } catch { return d } }
function save(k, v){ try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

/* Same kindness check as the database, so people get instant feedback. */
const BAD=/\b(f+u+c+k\w*|sh[i1]t\w*|c+u+n+t\w*|bastard\w*|bitch\w*|wank\w*|twat\w*|prick\w*|dick(head)?s?|arse(hole)?s?|asshole\w*|bollock\w*|piss(ed|ing)?|slag\w*|whore\w*|retard\w*|spastic\w*|spaz\w*|fag\w*|tranny|nigg\w*|paki\w*|chav\w*|fatty|fatso|ugly|stupid|idiot\w*|moron\w*|cretin\w*|tosser\w*|minger\w*)\b/i;
const IDENT=/(@\w{2,}|\b\S+@\S+\.\S+|\b(\+?\d[\d\s-]{7,}\d)\b|https?:\/\/)/i;
const REASONS = {
  too_short: "That's a bit short. Add the line you heard.",
  too_long: "Keep it under 280 characters.",
  unkind: "Keep it kind: snippets with swearing, insults, handles, emails, phone numbers or links can't go up. Try rewording it.",
  slow_down: "That's a lot of listening! You can share up to 5 snippets an hour. Try again a bit later.",
  duplicate: "Someone's already shared that one this week.",
};
function check(t, extra){
  if (t.length < 8) return REASONS.too_short;
  if (BAD.test(t + " " + extra) || IDENT.test(t + " " + extra)) return REASONS.unkind;
  return "";
}

async function api(path, opts = {}){
  const r = await fetch(API + "/rest/v1/" + path, { ...opts, headers: { ...H, ...(opts.headers||{}) } });
  if (!r.ok){
    let code = "error"; try { const j = await r.json(); code = (j.message || "").trim() || code } catch {}
    throw Object.assign(new Error(code), { code });
  }
  return r.status === 204 ? null : r.json();
}

function chip(label, pressed, onClick){
  const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = label;
  b.setAttribute("aria-pressed", pressed); b.onclick = onClick; return b;
}
function drawSettingChips(){
  $("#settings").replaceChildren(...SETTINGS.map(s => chip(s, s === chosen, () => { chosen = s; drawSettingChips() })));
}
function drawFilters(){
  const used = ["All", ...SETTINGS.filter(s => docs.some(d => d.setting === s))];
  $("#filters").replaceChildren(...used.map(s => chip(s, s === filter, () => { filter = s; drawFilters(); render() })));
}
function ago(iso){
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now"; if (m < 60) return m + " min ago";
  const h = Math.round(m / 60); if (h < 24) return h + " hr ago";
  const d = Math.round(h / 24); return d === 1 ? "yesterday" : d + " days ago";
}

function render(){
  let list = docs.filter(d => filter === "All" || d.setting === filter);
  if (order === "top") list = [...list].sort((a,b) => b.smiles - a.smiles || new Date(b.created_at) - new Date(a.created_at));
  if (order === "shuffle") list = list.map(d => [Math.random(), d]).sort((a,b) => a[0]-b[0]).map(x => x[1]);
  const feed = $("#feed");
  if (!list.length){
    const li = document.createElement("li"); li.className = "empty";
    li.textContent = docs.length ? "Nothing from here yet." : "No snippets yet. Be the first: type what you heard above.";
    return feed.replaceChildren(li);
  }
  feed.replaceChildren(...list.map(d => {
    const li = document.createElement("li"); li.className = "snip";
    const q = document.createElement("blockquote"); q.textContent = d.text;
    const stub = document.createElement("div"); stub.className = "stub";
    const t = document.createElement("span"); t.className = "ticket"; t.textContent = d.setting || "Overheard";
    const w = document.createElement("span"); w.className = "where";
    w.textContent = [d.place, d.heard_when].filter(Boolean).concat("posted " + ago(d.created_at)).join(" · ");
    const acts = document.createElement("span"); acts.className = "acts";
    const r = mine[d.id] || {};
    const smile = document.createElement("button"); smile.type = "button"; smile.className = "act smile";
    smile.setAttribute("aria-pressed", !!r.smile);
    smile.textContent = "☺ " + (d.smiles || 0); smile.title = "This made me smile";
    smile.onclick = () => react(d, "smile");
    const rep = document.createElement("button"); rep.type = "button"; rep.className = "act report" + (r.report ? " done" : "");
    rep.textContent = r.report ? "Reported" : "Report"; rep.disabled = !!r.report;
    rep.onclick = () => {
      if (rep.dataset.sure){ react(d, "report") }
      else { rep.dataset.sure = "1"; rep.textContent = "Report as unkind?"; }
    };
    acts.append(smile, rep);
    stub.append(t, w, acts);
    li.append(q, stub); return li;
  }));
}

async function react(d, kind){
  mine[d.id] = mine[d.id] || {};
  if (mine[d.id][kind]) return;
  mine[d.id][kind] = true; save("snip-reacts", mine);
  if (kind === "smile") d.smiles = (d.smiles || 0) + 1;
  render();
  try { await api("rpc/react", { method: "POST", body: JSON.stringify({ p_id: d.id, p_kind: kind }) }) }
  catch {}
  if (kind === "report") refresh();
}

async function refresh(){
  if (!API){ $("#feed").replaceChildren(Object.assign(document.createElement("li"), { className: "empty", textContent: "Snippetings is being set up. Check back soon." })); return }
  try {
    docs = await api("snippets?select=id,text,setting,place,heard_when,smiles,created_at&status=eq.live&order=created_at.desc&limit=300");
    drawFilters(); render();
  } catch {
    $("#feed").replaceChildren(Object.assign(document.createElement("li"), { className: "empty", textContent: "Couldn't load snippets just now. Pull to refresh or try again in a moment." }));
  }
}

const msg = (t, kind) => { const m = $("#msg"); m.textContent = t; m.className = "msg" + (kind ? " " + kind : "") };
$("#text").addEventListener("input", e => { $("#count").textContent = e.target.value.length + " / 280"; msg("") });
function setOrder(o){
  order = o;
  [["sortNew","new"],["sortTop","top"],["shuffle","shuffle"]].forEach(([id,v]) => $("#"+id).setAttribute("aria-pressed", o === v));
  render();
}
$("#sortNew").onclick = () => setOrder("new");
$("#sortTop").onclick = () => setOrder("top");
$("#shuffle").onclick = () => setOrder("shuffle");

$("#compose").addEventListener("submit", async e => {
  e.preventDefault();
  const text = $("#text").value.trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  const place = $("#place").value.trim(), when = $("#when").value.trim();
  const problem = check(text, place + " " + when);
  if (problem) return msg(problem, "err");
  const btn = $("#send"); btn.disabled = true; msg("Sharing…");
  try {
    const status = await api("rpc/submit_snippet", { method: "POST",
      body: JSON.stringify({ p_text: text, p_setting: chosen, p_place: place, p_when: when }) });
    $("#text").value = ""; $("#place").value = ""; $("#when").value = ""; $("#count").textContent = "0 / 280";
    msg(status === "pending" ? "Thanks! Your snippet will appear once it's been checked." : "Shared. Thanks for listening in.", "ok");
    refresh();
  } catch (err){
    msg(REASONS[err.code] || "That didn't go through. Check your connection and try again.", "err");
  } finally { btn.disabled = false }
});

drawSettingChips(); drawFilters(); refresh();
setInterval(() => { if (!document.hidden) refresh() }, 60000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

/* Get the app: real install where the browser allows it, simple steps elsewhere. */
(() => {
  const btn = $("#getapp"), sheet = $("#howto"), steps = $("#howto-steps");
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (installed) return;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  let deferred = null;

  const SHARE = '<svg class="shareicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  function show(){
    if (isIOS && !/Safari/.test(ua) || /CriOS|FxiOS|EdgiOS/.test(ua) && isIOS){
      steps.innerHTML = `<li>Tap the <b>Share</b> button ${SHARE} in your browser.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>`;
    } else if (isIOS){
      steps.innerHTML = `<li>Tap the <b>Share</b> button ${SHARE} at the bottom of Safari.</li><li>Scroll down and choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li>`;
    } else if (isAndroid){
      steps.innerHTML = `<li>Tap the <b>⋮</b> menu at the top right of your browser.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li>`;
    } else {
      steps.innerHTML = `<li>On your phone, go to <b>www.snippetings.com</b>.</li><li>iPhone: tap <b>Share</b> ${SHARE}, then <b>Add to Home Screen</b>.<br>Android: tap <b>⋮</b>, then <b>Install app</b>.</li>`;
    }
    sheet.hidden = false; $("#howto-close").focus();
  }
  const hide = () => { sheet.hidden = true; btn.focus() };
  $("#howto-close").onclick = hide;
  sheet.addEventListener("click", e => { if (e.target === sheet) hide() });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) hide() });

  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; btn.hidden = false });
  window.addEventListener("appinstalled", () => { btn.hidden = true; deferred = null });
  btn.onclick = async () => {
    if (deferred){ deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r.outcome === "accepted") btn.hidden = true }
    else show();
  };
  btn.hidden = false;
})();
