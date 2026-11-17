// skymp-full-logger.js  -  full event logger for a SkyMP / Skyrim Platform client
//
// Captures EVERYTHING it can and writes it to an in-overlay panel + a file:
//   * every Skyrim Platform event that this build supports (equip, hit, container,
//     effect, menu, cell/location, death, combat, quest, loadGame, trackedStats, ...)
//   * both directions of overlay traffic (client->overlay executeJavaScript, overlay->client browserMessage)
//   * notifications / message boxes / console
//
// MONEY HIGHLIGHT: any line that touches gold/coin/septim/currency is tagged  >>>GOLD<<<
//   and counted separately, so when the server hands a new character money you can see
//   exactly which event delivered it and all its info.  __log.gold() filters to just those.
//
// Hotkeys (DX scancodes):
//   F2  save log to Data/Platform/Plugins/skymp-full-log.js   (also pauses)
//   F7  show / hide panel      F8  pause / resume      F6  clear      F10 notify counts
//   F3  GOLD-only view toggle (panel shows only gold-tagged lines)
//
// Console:  __log.save() .pause() .clear() .gold() .all() .only('EVENT,EVAL,MSG')
//           .grep('gold') .dedup(true|false) .counts() .stop()

(function () {
try {
  const g = typeof globalThis !== "undefined" ? globalThis : this;
  if (g.__log && typeof g.__log.stop === "function") { try { g.__log.stop(true); } catch (e) {} }

  const sp = typeof skyrimPlatform !== "undefined" ? skyrimPlatform : require("skyrimPlatform");
  const { on, once, Game, Actor, Form, ObjectReference, Debug, Input, printConsole } = sp;

  // ================= SETTINGS =================
  const KEY_SAVE = 60, KEY_PANEL = 65, KEY_PAUSE = 66, KEY_CLEAR = 64, KEY_COUNTS = 68, KEY_GOLD = 61; // F2 F7 F8 F6 F10 F3

  let DEDUP          = false;  // FALSE = log every event (what you want for a one-off like the money grant)
  let GOLD_ONLY      = false;  // panel shows only gold-tagged lines (toggle with F3 / __log.gold())
  let GREP           = null;
  const INCLUDE_SPAM = false;  // include very noisy overlay calls (chat sync, hunger sync, context menu, nickname sync)
  const SPAM_RE      = /useChatStore|useHungerStore|setContextMenu|set-nicknames|useJobsTimeStore|addMessage/;
  const EVAL_MAX_LEN = 320;
  const PANEL_LINES  = 18;
  const BUF_MAX      = 8000;
  const LOG_TO_FILE  = true;   // sp.writeLogs -> Data/Platform/Logs/skymp-full-logs.txt (if supported)
  const TO_CONSOLE   = false;
  // Gold / currency detection:
  const GOLD_FORM_IDS = [0x0000000F]; // Gold001
  const GOLD_RE       = /\bgold\b|\bcoins?\b|septim|currency|\bmoney\b|balance|wallet/i;
  // ============================================

  const state = { paused: false, stop: false, dedup: DEDUP, goldOnly: GOLD_ONLY, grep: GREP };
  const counts = {};
  const buf = [];        // {cat,msg,gold,line}
  const seen = new Set();
  const stamp = () => new Date().toTimeString().slice(0, 8);

  function isGold(text) { return GOLD_RE.test(text || ""); }

  function emit(cat, msg, forceGold) {
    if (state.paused) return;
    const gold = !!forceGold || isGold(msg) || isGold(cat);
    counts[cat] = (counts[cat] || 0) + 1;
    if (gold) counts.__GOLD = (counts.__GOLD || 0) + 1;
    let core = cat + " " + msg;
    if (state.grep && core.toLowerCase().indexOf(state.grep) < 0) return;
    if (state.dedup && !gold) { const k = core.replace(/-?\d+(\.\d+)?/g, "#").slice(0, 120); if (seen.has(k)) return; seen.add(k); }
    const line = stamp() + (gold ? "  >>>GOLD<<< " : "  ") + core;
    const rec = { cat, gold, line };
    buf.push(rec); if (buf.length > BUF_MAX) buf.shift();
    if (TO_CONSOLE) { try { printConsole("[LOG] " + line); } catch (e) {} }
    if (LOG_TO_FILE && typeof sp.writeLogs === "function") { try { sp.writeLogs("skymp-full", line); } catch (e) {} }
    panelAdd(rec);
  }

  // ---------- safe describers ----------
  function nm(f) { try { return (f && f.getName && f.getName()) || ""; } catch (e) { return ""; } }
  function id(f) { try { return f && f.getFormID ? "0x" + (f.getFormID() >>> 0).toString(16) : "?"; } catch (e) { return "?"; } }
  function who(f) { const n = nm(f); return (n ? "'" + n + "' " : "") + id(f); }
  function goldFormHit(f) { try { return f && GOLD_FORM_IDS.indexOf(f.getFormID() >>> 0) >= 0; } catch (e) { return false; } }

  // ---------- panel ----------
  const hasBrowser = !!(sp.browser && typeof sp.browser.executeJavaScript === "function");
  let panelReady = false;
  function pageEval(code) { if (!hasBrowser) return false; try { sp.browser.executeJavaScript("/*__log*/" + code); return true; } catch (e) { return false; } }
  const PANEL_CODE = `(function(){
    if (window.__logP) { window.__logP.el.style.display=''; return; }
    var b=document.createElement('div'); b.id='sk-log';
    b.style.cssText='position:fixed;left:12px;top:12px;width:680px;height:${PANEL_LINES*17+40}px;z-index:2147483647;background:rgba(6,8,12,.88);border:1px solid #3a4250;border-radius:6px;color:#cfe;font:11px/1.3 Consolas,monospace;display:flex;flex-direction:column;pointer-events:none';
    b.innerHTML='<div style="padding:4px 8px;background:rgba(255,255,255,.06);border-bottom:1px solid #3a4250"><b style="color:#f0c674">SkyMP Full Logger</b> <span id="sk-n" style="opacity:.6"></span></div><pre id="sk-b" style="flex:1;margin:0;padding:6px 8px;overflow:hidden;white-space:pre-wrap;word-break:break-all"></pre>';
    document.body.appendChild(b);
    var body=b.querySelector('#sk-b'), nEl=b.querySelector('#sk-n'), L=[];
    window.__logP={el:b,goldOnly:false,
      add:function(x,gold){ if(this.goldOnly&&!gold)return; L.push({t:x,g:gold}); if(L.length>${PANEL_LINES})L.shift(); body.innerHTML=L.map(function(o){return o.g?'<span style=\\'color:#ffd23f\\'>'+o.t.replace(/</g,'&lt;')+'</span>':o.t.replace(/</g,'&lt;')}).join('<br>'); },
      toggle:function(){ b.style.display=b.style.display==='none'?'':'none'; },
      setGold:function(v){ this.goldOnly=v; L=[]; body.innerHTML=''; nEl.textContent=v?'(gold only)':''; }
    };
  })();`;
  function panelInit() { if (hasBrowser) { panelReady = pageEval(PANEL_CODE); if (panelReady) for (const r of buf.slice(-PANEL_LINES)) panelAdd(r); } }
  function panelAdd(r) { if (panelReady) pageEval("window.__logP&&window.__logP.add(" + JSON.stringify(r.line) + "," + (r.gold ? "true" : "false") + ")"); }
  function panelToggle() { if (!panelReady) panelInit(); else pageEval("window.__logP&&window.__logP.toggle()"); }
  function panelGold(v) { pageEval("window.__logP&&window.__logP.setGold(" + (v ? "true" : "false") + ")"); for (const r of buf.slice(-200)) panelAdd(r); }
  function panelRemove() { pageEval("var b=document.getElementById('sk-log');if(b)b.remove();window.__logP=undefined;"); }

  function saveFile(reason) {
    const text = "/* SkyMP Full Log  " + new Date().toString() + "  reason=" + reason + "\n" +
      "counts: " + JSON.stringify(counts) + "\n\n" + buf.map((r) => r.line).join("\n").replace(/\*\//g, "* /") + "\n*/\n";
    let how = "no writePlugin";
    if (typeof sp.writePlugin === "function") { try { sp.writePlugin("skymp-full-log", text); how = "Data/Platform/Plugins/skymp-full-log.js"; } catch (e) { how = "failed: " + e; } }
    try { Debug.notification("FullLog saved -> " + how); } catch (e) {}
    return how;
  }

  // ---------- overlay traffic + notifications (patches) ----------
  const restores = [];
  function patch(obj, key, wrap) { if (!obj || typeof obj[key] !== "function") return; const o = obj[key]; obj[key] = function () { try { wrap.apply(this, arguments); } catch (e) {} return o.apply(this, arguments); }; restores.push(() => { try { obj[key] = o; } catch (e) {} }); }

  patch(sp.browser, "executeJavaScript", (code) => {
    const c = String(code);
    if (c.indexOf("__log") >= 0) return;
    if (!INCLUDE_SPAM && SPAM_RE.test(c) && !isGold(c)) return; // keep gold-bearing lines even if "spammy"
    emit("EVAL", c.slice(0, EVAL_MAX_LEN).replace(/\s+/g, " "));
  });
  patch(Debug, "notification", (m) => { if (String(m).indexOf("FullLog") !== 0) emit("NOTIFY", "note: " + String(m).slice(0, 220)); });
  patch(Debug, "messageBox", (m) => emit("NOTIFY", "box: " + String(m).slice(0, 220)));

  // ---------- events ----------
  const subs = [];
  const sub = (ev, fn) => { try { subs.push(on(ev, fn)); emit("INIT", "subscribed " + ev); } catch (e) { /* event not on this build */ } };

  // overlay -> client (this is where a server-sent "here is your starting gold" often shows up)
  sub("browserMessage", (e) => { try { const a = e.arguments && e.arguments[0]; if (a && !a.evalEnd) emit("MSG", JSON.stringify(a).slice(0, 320)); } catch (err) {} });

  sub("menuOpen", (e) => emit("MENU", "open  " + e.name));
  sub("menuClose", (e) => emit("MENU", "close " + e.name));

  sub("containerChanged", (e) => {
    try {
      const b = e.baseObj, from = e.oldContainer, to = e.newContainer, n = e.numItems;
      const toP = to && (to.getFormID() >>> 0) === 0x14, fromP = from && (from.getFormID() >>> 0) === 0x14;
      const dir = toP ? "+player" : fromP ? "-player" : "move";
      const g = goldFormHit(b) || isGold(nm(b));
      emit("ITEM", dir + " " + who(b) + " x" + n + " (from " + (from ? id(from) : "?") + " -> " + (to ? id(to) : "?") + ")", g);
    } catch (err) {}
  });
  sub("equip", (e) => emit("EQUIP", "equip   " + who(e.baseObj) + " by " + who(e.actor)));
  sub("unequip", (e) => emit("EQUIP", "unequip " + who(e.baseObj) + " by " + who(e.actor)));

  sub("hit", (e) => emit("HIT", "target " + who(e.target) + " <- agg " + who(e.aggressor || e.agressor) + " src " + who(e.source) + (e.projectile ? " proj " + who(e.projectile) : "") + (e.isPowerAttack ? " power" : "") + (e.isBashAttack ? " bash" : "") + (e.isSneakAttack ? " sneak" : "")));
  sub("magicEffectApply", (e) => emit("MAGIC", "apply " + who(e.effect) + " on " + who(e.target) + " by " + who(e.caster)));
  sub("effectStart", (e) => emit("MAGIC", "effStart " + who(e.effect) + " on " + who(e.target)));
  sub("effectFinish", (e) => emit("MAGIC", "effEnd   " + who(e.effect) + " on " + who(e.target)));

  sub("deathStart", (e) => emit("DEATH", "dying " + who(e.actorDying) + " by " + who(e.actorKiller)));
  sub("deathEnd", (e) => emit("DEATH", "dead  " + who(e.actorDying) + " by " + who(e.actorKiller)));
  sub("combatState", (e) => emit("COMBAT", who(e.actor) + " state " + e.combatState + " target " + who(e.targetActor)));

  sub("loadGame", () => emit("GAME", "loadGame"));
  sub("saveGame", () => emit("GAME", "saveGame"));
  sub("cellFullyLoaded", (e) => emit("CELL", "cellFullyLoaded " + who(e.cell)));
  sub("cellAttach", (e) => emit("CELL", "cellAttach " + who(e.refr)));
  sub("locationChanged", (e) => emit("MOVE", "location " + who(e.newLoc)));
  sub("switchRaceComplete", (e) => emit("GAME", "switchRaceComplete " + who(e.subject)));   // fires around chargen
  sub("questInit", (e) => emit("QUEST", "init " + who(e.quest)));
  sub("questStage", (e) => emit("QUEST", "stage " + who(e.quest) + " #" + e.stage));
  sub("trackedStats", (e) => emit("STAT", (e.statName || "?") + " = " + e.newValue, isGold(e.statName)));
  sub("objectLoaded", (e) => { try { const g = goldFormHit(e.object) || isGold(nm(e.object)); if (g || INCLUDE_SPAM) emit("OBJ", "loaded " + who(e.object) + (e.isLoaded ? " in" : " out"), g); } catch (err) {} });
  sub("lockChanged", (e) => emit("LOCK", "lockChanged " + who(e.lockedObject)));
  sub("bookRead", (e) => emit("BOOK", "read " + who(e.book)));
  sub("waitStop", () => emit("GAME", "waitStop"));
  sub("consoleMessage", (e) => { try { const m = String(e.message || ""); if (m.indexOf("[LOG]") !== 0) emit("CONSOLE", m.slice(0, 220)); } catch (err) {} });

  // Poll the player's gold directly so we SEE the change even if no event names it.
  let lastGold = null, lastGoldPoll = 0;
  function pollGold(t) {
    if (t - lastGoldPoll < 500) return; lastGoldPoll = t;
    try {
      const p = Game.getPlayer(); if (!p) return;
      const gform = Game.getFormEx(0x0000000F);
      const amt = gform ? p.getItemCount(gform) : null;
      if (amt === null) return;
      if (lastGold === null) { lastGold = amt; emit("GOLD", "starting gold count = " + amt, true); }
      else if (amt !== lastGold) { emit("GOLD", "gold " + lastGold + " -> " + amt + "  (delta " + (amt - lastGold > 0 ? "+" : "") + (amt - lastGold) + ")", true); lastGold = amt; }
    } catch (e) {}
  }

  // ---------- keys / loop ----------
  const keyState = {};
  function pressed(code) { let d = false; try { d = Input.isKeyPressed(code); } catch (e) {} const was = !!keyState[code]; keyState[code] = d; return d && !was; }
  const handle = on("update", () => {
    if (state.stop) { state.stop = false; panelRemove(); for (const r of restores) r(); if (typeof sp.unsubscribe === "function") { for (const h of subs) { try { sp.unsubscribe(h); } catch (e) {} } try { sp.unsubscribe(handle); } catch (e) {} } return; }
    if (pressed(KEY_SAVE)) { state.paused = true; saveFile("F2"); }
    if (pressed(KEY_PANEL)) panelToggle();
    if (pressed(KEY_PAUSE)) { state.paused = !state.paused; try { Debug.notification("FullLog " + (state.paused ? "PAUSED" : "capturing")); } catch (e) {} }
    if (pressed(KEY_CLEAR)) { buf.length = 0; seen.clear(); for (const k in counts) delete counts[k]; try { Debug.notification("FullLog cleared"); } catch (e) {} }
    if (pressed(KEY_COUNTS)) { try { Debug.notification("FullLog " + JSON.stringify(counts)); } catch (e) {} emit("INIT", "counts " + JSON.stringify(counts)); }
    if (pressed(KEY_GOLD)) { state.goldOnly = !state.goldOnly; panelGold(state.goldOnly); try { Debug.notification("FullLog gold-only " + state.goldOnly); } catch (e) {} }
    if (!state.paused) pollGold(Date.now());
  });

  panelInit();
  const apis = ["writeLogs", "writePlugin", "browser", "createText", "storage"].map((k) => k + "=" + (typeof sp[k] !== "undefined" ? "Y" : "N")).join(" ");
  emit("INIT", "SkyMP Full Logger up. APIs: " + apis);
  emit("INIT", "F2 save  F7 panel  F8 pause  F6 clear  F3 gold-only  F10 counts");
  try { Debug.notification("SkyMP Full Logger ON — make the new character now"); } catch (e) {}

  g.__log = {
    stop(silent) { state.stop = true; if (!silent) try { Debug.notification("FullLog stopped"); } catch (e) {} },
    save() { return saveFile("manual"); },
    pause() { state.paused = !state.paused; return state.paused; },
    clear() { buf.length = 0; seen.clear(); },
    gold() { state.goldOnly = !state.goldOnly; panelGold(state.goldOnly); return state.goldOnly; },
    all() { state.goldOnly = false; panelGold(false); state.grep = null; },
    only(c) { /* reserved: category filter */ return c; },
    grep(s) { state.grep = s ? String(s).toLowerCase() : null; return state.grep; },
    dedup(b) { state.dedup = !!b; seen.clear(); return state.dedup; },
    counts() { try { printConsole("[LOG] " + JSON.stringify(counts)); } catch (e) {} return counts; },
    lines: buf,
  };
} catch (err) {
  try { skyrimPlatform.Debug.notification("Full logger inject FAILED: " + err); } catch (e) {}
  try { skyrimPlatform.printConsole("[LOG] inject FAILED: " + err + "\n" + (err && err.stack)); } catch (e) {}
}
})();
