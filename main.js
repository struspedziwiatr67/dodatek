// ==UserScript==
// @name         Bot na exp (iframe-aware exhaustion + throttling + captcha->Discord + ping-pong trasy + only-selected-maps + elite toggle + group-size filter + heros->Discord + obrazki + fixy map/lvl/wt/grupy + FOW cache)
// @version      2.17.3
// @description  Bot z przechodzeniem map, anty-spam ataku, captcha->Discord, START/STOP, zbijanie wyczerpania, atak tylko na wybranych mapach, elity toggle, filtr grup, powiadomienia o herosach (bez Namiotu Tropicieli Herosów), normalizacja nazw map, odporne parsowanie lvli, poprawki 'wt', stabilny wybór grup przy mgle (cache max rozmiaru grupy)
// @match        *://*/
// @match        *://www.margonem.pl/*
// @grant        none
// ==/UserScript==


// ===== HARD GUARD: block attacking elites when checkbox is OFF (works even if target selection misses) =====
(function(){
  function __adi_noEliteEnabled(){
    try{ return localStorage.getItem('adi-bot_allow_elite') === '0'; }catch(e){ return false; }
  }
  function __adi_isEliteIcon(n){
    try{
      var ic = String((n && (n.icon || n.ticon)) || '');
      // elites are usually stored under npc/e1..e5 folders
      return /(?:^|\/)npc\/e[1-5]\//i.test(ic);
    }catch(e){ return false; }
  }
  function __adi_getParam(u, key){
    try{
      var m = String(u).match(new RegExp('(?:^|&)' + key + '=([^&]+)'));
      return m ? m[1] : null;
    }catch(e){ return null; }
  }

  function __adi_installGuard(){
    try{
      if(!window._g || window.__adi_eliteGuardInstalled) return;
      window.__adi_eliteGuardInstalled = true;
      var __orig = window._g;

      window._g = function(url, cb){
        try{
          var s = String(url);
          if(__adi_noEliteEnabled() && s.indexOf('fight&a=attack') !== -1){
            var rawId = __adi_getParam(s, 'id');
            if(rawId != null){
              var tid = Math.abs(Number(String(rawId).replace(/[^\d\-]/g,'')));
              var n = (window.g && g.npc) ? g.npc[tid] : null;
              if(n && __adi_isEliteIcon(n)){
                if(window.console && console.warn){
                  console.warn('[adi-bot] Zablokowano atak na elitę (ikona):', {tid: tid, nick: (n.nick||n.name), icon: n.icon, ticon: n.ticon, url: s});
                }
                try{
                  __adiBlacklistNpc(tid, 60000);
                  try{ if(typeof addToGlobal==='function') addToGlobal(tid); }catch(_){}
                  try{ __attackBanUntil = Date.now() + 1500; }catch(_){}
                  // wyczyść bieżący cel, żeby bot nie stał przy elicie
                  try{ window.$m_id = undefined; }catch(_){}
                  if(typeof clearTargetLock === 'function') clearTargetLock();
                }catch(_){}
                return; // BLOCK
              }
            }
          }
        }catch(e){}
        return __orig.apply(this, arguments);
      };
    }catch(e){}
  }

  // try now and retry for a short while (in case _g is defined later)
  __adi_installGuard();
  var tries = 0;
  var intId = setInterval(function(){
    tries++;
    __adi_installGuard();
    if(window.__adi_eliteGuardInstalled || tries > 60) clearInterval(intId); // ~30s
  }, 500);
})();
var TpG3Y86zpgrtWMzb, ZHN4ekpZ5m95pFbJ, YQTtmEs6a5mTXE5a;

window.adiwilkTestBot = new function () {
  // ---------- DISCORD CONFIG ----------
  const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1384875398583685252/L7uwO4aZCfyFhSDUz4GjaCYN1hM_KooGqsx4aDwjq6rvSIjYOq4rpSpVl6dMHVH3qVsT";
const HERO_DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1471175985494888449/d6sr8Y29bK2cnAqRCpJkHcxY7dgn6L47vc6MupgBxx5rLTuK1m1CpXhPbUkkVNBLsJay";
// <--- PODMIEŃ
  const DISCORD_PING_HERE = true;
  const DISCORD_COOLDOWN_MS = 20000;
  const DISCORD_FORCE_FOR_HERO = true;
  let __lastDiscordAt = 0;
  let __lastCaptchaSignature = null;

  function getHeroName() { try { return hero?.nick || hero?.name || "Nieznany"; } catch { return "Nieznany"; } }

  function sendDiscord(text, embed, { force = false, webhook = DISCORD_WEBHOOK } = {}) {
    try {
      if (!webhook) return false;
      const now = Date.now();
      if (!force && now - __lastDiscordAt < DISCORD_COOLDOWN_MS) return false;
      __lastDiscordAt = now;

      const prefix = DISCORD_PING_HERE ? "@here " : "";
      const payload = embed ? { content: prefix + text, embeds: [embed] } : { content: prefix + text };

      fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(res => { if (!res.ok) console.warn("Discord webhook HTTP", res.status); })
        .catch(err => console.warn("Discord webhook error:", err));

      return true;
    } catch (e) {
      console.warn("sendDiscord exception:", e);
      return false;
    }
  }
  // ------------------------------------

  // === cache obrazków Herosów ===
  const HERO_IMG_CACHE_KEY = "adi-bot_heroimg_cache";
  const HERO_IMG_CACHE_TTL = 14 * 24 * 60 * 60 * 1000;

  function loadHeroImgCache(){ try{ const raw=localStorage.getItem(HERO_IMG_CACHE_KEY); const obj=raw?JSON.parse(raw):{}; const now=Date.now(); for(const k in obj){ if(!obj[k]||!obj[k].ts||now-obj[k].ts>HERO_IMG_CACHE_TTL) delete obj[k]; } return obj; }catch{ return {}; } }
  function saveHeroImgCache(c){ try{ localStorage.setItem(HERO_IMG_CACHE_KEY, JSON.stringify(c)); }catch{} }

  async function fetchText(url, timeoutMs=5000){
    try{
      const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(), timeoutMs);
      const res=await fetch(url,{signal:ctl.signal,credentials:"omit",mode:"cors"});
      clearTimeout(t);
      if(!res.ok) throw new Error("HTTP "+res.status);
      return await res.text();
    }catch{ return null; }
  }

  function absUrl(base,maybe){ try{ return new URL(maybe,base).toString(); }catch{ return null; } }

  function findImgNearName(html,name,baseUrl){
    try{
      const nameRe=new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),"i");
      const m=nameRe.exec(html); if(!m) return null;
      const windowHtml=html.slice(Math.max(0,m.index-1500), Math.min(html.length,m.index+3000));
      const imgRe=/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/ig; let best=null, mm;
      while((mm=imgRe.exec(windowHtml))){
        const src=mm[1];
        if(/\.(png|gif|webp|jpg|jpeg)/i.test(src) && !/emoji|emot|icon|logo|avatar|smile|tiny|thumb/i.test(src)){
          best=src; if(/npc|hero|postac|outfit|grafika|sylwet|sprite/i.test(src)) break;
        }
      }
      return best ? absUrl(baseUrl,best) : null;
    }catch{ return null; }
  }

  async function resolveHeroImageUrl(heroName){
    const name=(heroName||"").trim(); if(!name) return null;
    const key=name.toLowerCase(); const cache=loadHeroImgCache();
    if(cache[key] && cache[key].url) return cache[key].url;

    const FORUM_URL="https://forum.margonem.pl/?task=forum&show=posts&id=514740";
    let html=await fetchText(FORUM_URL,6000);
    let url=html?findImgNearName(html,name,FORUM_URL):null;

    if(!url){
      const MW_URL="https://margoworld.pl/npc/heros";
      html=await fetchText(MW_URL,6000);
      if(html){
        const rowRe=new RegExp(`(<tr[\\s\\S]*?>[\\s\\S]*?${name.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\$&")}[\\s\\S]*?<\\/tr>)`,"i");
        const rowM=rowRe.exec(html); const scope=rowM?rowM[1]:html;
        const img=findImgNearName(scope,name,MW_URL); if(img) url=img;
      }
    }
    if(!url){
      const MH_URL="https://margohelp.pl/herosi";
      html=await fetchText(MH_URL,6000);
      if(html){
        const blockRe=new RegExp(`(<div[\\s\\S]*?>[\\s\\S]*?${name.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\$&")}[\\s\\S]*?<\\/div>)`,"i");
        const blockM=blockRe.exec(html); const scope=blockM?blockM[1]:html;
        const img=findImgNearName(scope,name,MH_URL); if(img) url=img;
      }
    }

    if(url){ cache[key]={url,ts:Date.now()}; saveHeroImgCache(cache); }
    return url;
  }

  // === HEROSI: wykrywanie + Discord ===
  const HEROS_SCAN_INTERVAL_MS = 2000;
  const HEROS_RENOTIFY_AFTER_MS = 5 * 60 * 1000;
  const __herosSeen = new Map();

  const HERO_NAME_BLOCKLIST = [
    /namiot.*tropicieli.*heros/i,
    /tropiciel.*heros/i,
  ];

  function detectSpecialNpcType(n){
    try{
      if(!n) return null;

      const nmRaw = (n.nick || n.name || "").toString();
      const nm = nmRaw.toLowerCase();

      // blokujemy namiot/tropicieli, żeby nie spamowało
      for(const rx of HERO_NAME_BLOCKLIST) if(rx.test(nm)) return null;

      // klucz: WT (tak robi wykrywacz herosów)
      const wt = Number(n.wt);
      if(Number.isFinite(wt) && wt >= 79){
        // wt>99 -> tytan/kolos (kolos zwykle na mapach instancji)
        if(wt > 99){
          try{
            if(window.map && map.mode === 5) return "Kolos";
          }catch(_){}
          return "Tytan";
        }
        return "Heros";
      }

      // (opcjonalnie) “Tropiciel Herosów”
      if(["tropiciel herosów","wtajemniczony tropiciel herosów","doświadczony tropiciel herosów"].includes(nm)){
        return "Tropiciel";
      }
    }catch(_){}
    return null;
  }

  function isHeros(n){
    return detectSpecialNpcType(n) === "Heros";
  }
  function herosKey(n){ return n && n.grp ? `grp:${n.grp}` : `id:${n.id}`; }
  function pickHerosCoords(n){
    try{
      if(n && n.grp){ for(const i in g.npc){ const m=g.npc[i]; if(m && m.grp==n.grp) return {x:m.x,y:m.y}; } }
      return {x:n.x,y:n.y};
    }catch{ return {x:n?.x??0,y:n?.y??0}; }
  }

  setInterval(() => {
    (async () => {
      try{
        if(!window.g || !g.npc) return;

        const now = Date.now();
        for(const [k,t] of __herosSeen.entries()) if(now - t > HEROS_RENOTIFY_AFTER_MS) __herosSeen.delete(k);

        for(const i in g.npc){
          const n=g.npc[i];
          if(!n || !isHeros(n)) continue;

          const key=herosKey(n);
          if(__herosSeen.has(key)) continue;

          const where=(window.map && map.name)?map.name:"Nieznana mapa";
          const nm=n.nick||n.name||"Heros";
          const {x,y}=pickHerosCoords(n);

          let imgUrl=null; try{ imgUrl=await resolveHeroImageUrl(nm); }catch{}

          const typ = detectSpecialNpcType(n) || "Heros";
        const embed = {
          title: `${typ}! ${nm}`,
          description: `Mapa: **${where}**
Koordy: **(${x}, ${y})**
WT: **${n.wt ?? "?"}**
Lvl: **${n.lvl ?? "?"}**`,
          footer: { text: "adiwilkTestBot" }
        };
          if(imgUrl) embed.image={url:imgUrl};

          const ok=sendDiscord(`${typ}! ${nm}`, embed, { force: DISCORD_FORCE_FOR_HERO, webhook: HERO_DISCORD_WEBHOOK });
          if(ok) __herosSeen.set(key, Date.now());
        }
      }catch(e){ console.warn("HEROS scan error:", e); }
    })();
  }, HEROS_SCAN_INTERVAL_MS);

  // === Exhaustion helpers ===
  const DEFAULT_EXH_SELECTOR = 'span[tip="Limit 6h/dzień"]';
  const EXH_CHECK_EVERY_MS = 10000;
  let __lastExhCheck=0, __exhCached=null, __exhIdleWasOn=false, __savedMapsBeforeExh=null;

  function parseExhaustionFromText(txt){ if(!txt) return null; const m=txt.match(/([0-9]{1,4})/); return m?parseInt(m[1],10):null; }
  function getAllDocs(){ const docs=[document]; for(let i=0;i<window.frames.length;i++){ try{ const d=window.frames[i].document; if(d) docs.push(d);}catch{} } return docs; }
  function findExhaustionElement(){
    let sel=(localStorage.getItem("adi-bot_exh_selector")||DEFAULT_EXH_SELECTOR).trim();
    if (/=\s*['"]/.test(sel)){ const m=sel.match(/['"](.+?)['"]/); if(m) sel=m[1]; }
    const cands=[sel,'span[tip*="Limit"]'].filter(Boolean);
    const docs=getAllDocs();
    for(const doc of docs){ for(const s of cands){ try{ const el=doc.querySelector(s); if(el) return el; }catch{} } }
    for(const doc of docs){ try{ const spans=doc.querySelectorAll('span[tip]'); for(const e of spans){ const t=(e.innerText||e.textContent||"").trim(); if(/^\d{1,4}$/.test(t)) return e; } }catch{} }
    return null;
  }
  function getExhaustionMinutes(throttle=true){
    const now=Date.now();
    if(throttle && now-__lastExhCheck<EXH_CHECK_EVERY_MS && __exhCached!==null) return __exhCached;
    __lastExhCheck=now;
    const el=findExhaustionElement(); if(!el) return __exhCached;
    const val=parseExhaustionFromText((el.innerText||el.textContent||"").trim());
    if(typeof val==="number" && !Number.isNaN(val)) __exhCached=val;
    return __exhCached;
  }

  // --- hotfix newNpc ---
  const newNpcOldCopyAf = preNewNpc;
  preNewNpc = function (npcs) {
    for (var npc in npcs) {
      if (npcs[npc].del && g.npc[npc] && Math.abs(hero.x - g.npc[npc].x) + Math.abs(hero.y - g.npc[npc].y) > 13) {
        delete npcs[npc];
      }
    }
    newNpcOldCopyAf(npcs);
  };

  // wyłączenie alertów i blokad
  mAlert = function () {};
  if (typeof g == "undefined" && document.location.href.indexOf("jaruna.margonem.pl") > -1) document.location.reload();

  // ===== expowiska =====
  let expowiska = {
    "Stare Ruiny": { map: "Przeklęty Zamek - wejście południowe, Przeklęty Zamek - podziemia południowe, Przeklęty Zamek - zbrojownia, Przeklęty Zamek - podziemia północne, Przeklęty Zamek - wejście północne, Przeklęty Zamek - podziemia północne, Przeklęty Zamek - zbrojownia, Przeklęty Zamek - sala zgromadzeń, Przeklęty Zamek - wejście wschodnie" },
    "Mrówki": { map: "Mrowisko, Mrowisko p.1, Mrowisko p.2, Kopiec Mrówek p.2, Kopiec Mrówek p.1, Kopiec Mrówek" },
    "Demony": { map: "Przeklęta Strażnica, Przeklęta Strażnica p.1, Przeklęta Strażnica p.2, Przeklęta Strażnica p.1, Przeklęta Strażnica, Przeklęta Strażnica - podziemia p.1 s.1, Przeklęta Strażnica - podziemia p.2 s.1, Przeklęta Strażnica - podziemia p.1 s.1, Przeklęta Strażnica, Przeklęta Strażnica - podziemia p.1 s.2, Przeklęta Strażnica - podziemia p.2 s.2, Przeklęta Strażnica - podziemia p.2 s.3, Przeklęta Strażnica - podziemia p.2 s.2, Przeklęta Strażnica - podziemia p.1 s.2" },
    "Wilki Eder": { map: "Warczące Osuwiska, Wilcza Skarpa, Legowisko Wilczej Hordy" },
    "Gobliny1": { map: "Las Goblinów, Podmokła Dolina, Morwowe Przejście" },
    "Puffy+Gobliny": { map: "Pieczara Niepogody p.1, Pieczara Niepogody p.2 - sala 1, Pieczara Niepogody p.3, Pieczara Niepogody p.4, Pieczara Niepogody p.5, Pieczara Niepogody p.4, Pieczara Niepogody p.3, Pieczara Niepogody p.2 - sala 2, Fort Eder, Las Goblinów, Podmokła Dolina, Las Goblinów, Fort Eder" },
    "Demony": { map: "Przeklęta Strażnica, Przeklęta Strażnica - podziemia p.1 s.2, Przeklęta Strażnica - podziemia p.2 s.2, Przeklęta Strażnica - podziemia p.1 s.2, Przeklęta Strażnica, Przeklęta Strażnica - podziemia p.1 s.1, Przeklęta Strażnica - podziemia p.2 s.1" },
    "Pagórki Łupieżców": { map: "Pagórki Łupieżców, Skład Grabieżców, Pagórki Łupieżców, Schowek na Łupy" },
    "Ghule": { map: "Ghuli Mogilnik, Polana Ścierwojadów, Ghuli Mogilnik, Zapomniany Grobowiec p.1, Zapomniany Grobowiec p.2, Zapomniany Grobowiec p.3, Zapomniany Grobowiec p.4, Zapomniany Grobowiec p.5" },
    "Zbiry Eder": { map: "Stary Kupiecki Trakt, Stukot Widmowych Kół, Wertepy Rzezimieszków" },
    "Galaretki + Pająki": { map: "Zapomniany Szlak, Mokra Grota p.1, Mokra Grota p.1 - przełaz, Mokra Grota p.1 - boczny korytarz, Mokra Grota p.2 - korytarz, Mokra Grota p.1 - boczny korytarz, Mokra Grota p.1, Zapomniany Szlak, Grota Bezszelestnych Kroków - sala 1, Grota Bezszelestnych Kroków - sala 2, Grota Bezszelestnych Kroków - sala 3, Grota Bezszelestnych Kroków - sala 1, Zapomniany Szlak" },
    "Pszczoły Ithan": { map: "Porzucone Pasieki, Kopalnia Kapiącego Miodu p.1 - sala 2, Kopalnia Kapiącego Miodu p.2 - sala 2, Kopalnia Kapiącego Miodu p.3, Kopalnia Kapiącego Miodu p.2 - sala 1, Kopalnia Kapiącego Miodu p.2 - sala Owadziej Matki, Kopalnia Kapiącego Miodu p.2 - sala 1, Kopalnia Kapiącego Miodu p.1 - sala 1, Porzucone Pasieki", mobs_id: [71698] },
    "Gnolle": { map: "Wioska Gnolli, Jaskinia Gnollich Szamanów p.2, Jaskinia Gnollich Szamanów p.3, Jaskinia Gnollich Szamanów p.2, Wioska Gnolli, Czeluść Ognistej Pożogi, Grota Pragnolli p.1, GrotaGrota Pragnolli p.2 Pragnolli p.1 - sala 2, Grota Pragnolli p.2, Grota Pragnolli p.2 - sala 2, Grota Pragnolli p.2, Grota Pragnolli p.3, Czeluść Ognistej Pożogi" },
    "Mnisi LOW": { map: "Świątynia Andarum, Świątynia Andarum - zejście lewe, Świątynia Andarum - podziemia, Świątynia Andarum - zejście prawe, Świątynia Andarum - podziemia, Świątynia Andarum - lokum mnichów" },
    "Mnisi+Zbrojki": { map: "Świątynia Andarum, Świątynia Andarum - zejście lewe, Świątynia Andarum - podziemia, Świątynia Andarum - zejście prawe, Świątynia Andarum - podziemia, Świątynia Andarum - biblioteka, Świątynia Andarum - podziemia, Świątynia Andarum - lokum mnichów, Świątynia Andarum - magazyn p.2, Świątynia Andarum - magazyn p.1" },
    "Erem+Zbrojki": { map: "Świątynia Andarum - magazyn p.1, Świątynia Andarum - magazyn p.2, Erem Czarnego Słońca p.4 - sala 2, Erem Czarnego Słońca p.3 - południe, Erem Czarnego Słońca p.4 - sala 2, Erem Czarnego Słońca p.3, Erem Czarnego Słońca p.2, Erem Czarnego Słońca p.1 - północ, Erem Czarnego Słońca p.2, Erem Czarnego Słońca p.3, Erem Czarnego Słońca p.4 - sala 1, Erem Czarnego Słońca p.5" },
  };

  // ===== AUTO EXPOWISKO (po lvl) =====
  function getAutoExpowiskoByLevel(lvl){
    lvl = Number(lvl)||0;
    // Progi: [0,23) Stare Ruiny, [23,28) Mrówki, [28,33) Demony, [33,37) Pagórki Łupieżców,
    //        [37,45) Ghule, [45,47) Zbiry Eder, [47,52) Galaretki + Pająki, [52,57) Pszczoły Ithan, [57,∞) Gnolle
    if(lvl < 23) return "Stare Ruiny";
    if(lvl < 28) return "Mrówki";
    if(lvl < 33) return "Demony";
    if(lvl < 37) return "Pagórki Łupieżców";
    if(lvl < 45) return "Ghule";
    if(lvl < 47) return "Zbiry Eder";
    if(lvl < 52) return "Galaretki + Pająki";
    if(lvl < 57) return "Pszczoły Ithan";
    return "Gnolle";
  }

  // Zwraca realny klucz expowiska (rozwiązuje "auto" -> konkret)
  function getSelectedExpKey(){
    const sel = (localStorage.getItem('adi-bot_expowiska') || "Stare Ruiny").trim();
    if(sel === "auto") return getAutoExpowiskoByLevel(hero && hero.lvl);
    return sel;
  }

  // ===== AUTO: synchronizacja map po lvl (gdy wybrane "auto") =====
  let __adiLastAutoExp = null;
  let __adiLastAutoCheck = 0;

  function syncAutoExpowiskoUI(){
    const sel = (localStorage.getItem('adi-bot_expowiska') || '').trim();
    if(sel !== 'auto') { __adiLastAutoExp = null; return; }

    const now = Date.now();
    if(now - __adiLastAutoCheck < 2000) return; // throttle 2s
    __adiLastAutoCheck = now;

    const key = getSelectedExpKey();
    if(key === __adiLastAutoExp) return;

    __adiLastAutoExp = key;
    const def = expowiska[key];
    if(def && def.map){
      const input2 = document.querySelector('#adi-bot_maps');
      if(input2){
        input2.value = def.map;
        localStorage.setItem('adi-bot_maps', input2.value);
        localStorage.setItem('alksjd', 0);
      }
      __graphRoute=null;
      __graphRouteTarget=null;
      message(`AUTO expowisko → "${key}" (lvl ${hero && hero.lvl || 0})`);
    }
  }
  // ===== MAP GRAPH (expowisko routing to the first map) =====

  (function(){
    window.ADI_MAP_GRAPH = window.ADI_MAP_GRAPH || {};
    window.ADI_MAP_GRAPH_READY = window.ADI_MAP_GRAPH_READY || false;
  })();

  (function(){
    try{
      const raw = localStorage.getItem('adi-bot_graph_json');
      if(raw && raw.trim().length>2){
        try{
          window.ADI_MAP_GRAPH = JSON.parse(raw);
          window.ADI_MAP_GRAPH_READY = true;
          console.log('[adi-bot] MAP_GRAPH loaded from localStorage:', Object.keys(window.ADI_MAP_GRAPH).length, 'nodes');
        }catch(e){
          console.warn('[adi-bot] Stored MAP_GRAPH is invalid JSON, ignoring.', e);
          window.ADI_MAP_GRAPH = {};
          window.ADI_MAP_GRAPH_READY = false;
        }
      }else{
        console.log('[adi-bot] No stored MAP_GRAPH found. Paste it in the UI Graph box to enable routing.');
      }
    }catch(e){
      console.warn('[adi-bot] Error reading stored MAP_GRAPH', e);
    }
  })();

  function graphGetNode(name){ const k=normMapName(name); return window.ADI_MAP_GRAPH[k] ? {key:k, edges:window.ADI_MAP_GRAPH[k]} : null; }
  function graphEdge(fromName, toName){
    const fk=normMapName(fromName), tk=normMapName(toName);
    const edges = window.ADI_MAP_GRAPH[fk] || [];
    for(const e of edges){ if(normMapName(e.to)===tk) return e; }
    return null;
  }
  function bfsGraph(fromName, toName){
    const start=normMapName(fromName), goal=normMapName(toName);
    if(start===goal) return [];
    const q=[start], prev={}, seen=new Set([start]);
    while(q.length){
      const v=q.shift();
      const edges=window.ADI_MAP_GRAPH[v]||[];
      for(const e of edges){
        const u=normMapName(e.to);
        if(!seen.has(u)){
          seen.add(u); prev[u]=v; q.push(u);
          if(u===goal){ q.length=0; break; }
        }
      }
    }
    if(!(goal in prev)) return null;
    const path=[goal]; let cur=goal;
    while(cur!==start){ cur=prev[cur]; path.push(cur); }
    path.reverse();
    return path;
  }
  let __graphRoute = null;
  let __graphRouteTarget = null;

  function getSelectedExpFirstMap(){
    const key = getSelectedExpKey();
    const def = key && expowiska[key];
    if(!def || !def.map) return null;
    const first = String(def.map).split(',')[0].trim();
    return first || null;
  }

  function rebuildGraphRouteIfNeeded(){
    if(!window.ADI_MAP_GRAPH_READY){ __graphRoute=null; __graphRouteTarget=null; return; }
    const first = getSelectedExpFirstMap();
    if(!first) { __graphRoute=null; __graphRouteTarget=null; return; }
    const current = normMapName(map.name);
    const target = normMapName(first);
    if(current===target){ __graphRoute=null; __graphRouteTarget=null; return; }
    if(__graphRoute && __graphRouteTarget===target){ return; }
    const path = bfsGraph(current, target);
    if(!path || path.length<2){ __graphRoute=null; __graphRouteTarget=null; return; }
    const steps=[];
    for(let i=0;i<path.length-1;i++){
      const from=path[i], to=path[i+1];
      const e = graphEdge(from, to);
      steps.push({ from, to, via: e && e.via ? {x: e.via.x, y: e.via.y} : null });
    }
    __graphRoute = steps;
    __graphRouteTarget = target;
  }

  function followGraphRoute(){
  rebuildGraphRouteIfNeeded();
  if(!__graphRoute || __graphRoute.length===0) return null;

  const curName = normMapName(map.name);

  // consume steps already completed (we might have been teleported etc.)
  while(__graphRoute.length && normMapName(__graphRoute[0].to)===curName){
    __graphRoute.shift();
  }

  const step = __graphRoute[0];
  if(!step) return null;

  // if current position doesn't match expected "from", recompute
  if(normMapName(step.from)!==curName){
    __graphRoute=null; __graphRouteTarget=null;
    rebuildGraphRouteIfNeeded();
    if(!__graphRoute || __graphRoute.length===0) return null;
  }

  // prefer explicit coordinates from the graph
  if(step.via){
    return { x: step.via.x, y: step.via.y, reason: 'graph-via' };
  }

  // otherwise try to find the gateway by town name
  const targetReadable = step.to;
  let obj;
  for(const i in g.townname){
    if(isNameMatch(normMapName(targetReadable), normMapName(g.townname[i].replace(/ +(?= )/g,'')))){
      const c=g.gwIds[i].split('.');
      if(a_getWay(c[0],c[1])===undefined) continue;
      obj={x:c[0], y:c[1], reason:'graph-gw-by-name'}; break;
    }
  }
  if(obj) return obj;

  return null;
}

// ---- Generic routing to an arbitrary target map (e.g., Torneg for vendor) ----
function buildGraphRouteTo(targetName){
  if(!window.ADI_MAP_GRAPH_READY) return null;
  const current = normMapName(map.name);
  const target = normMapName(targetName);
  if(current===target) return [];
  const path = bfsGraph(current, target);
  if(!path || path.length<2) return null;
  const steps=[];
  for(let i=0;i<path.length-1;i++){
    const from=path[i], to=path[i+1];
    const e = graphEdge(from, to);
    steps.push({ from, to, via: e && e.via ? {x:e.via.x, y:e.via.y} : null });
  }
  return steps;
}

function followGraphTo(targetName){
  if(!window.ADI_MAP_GRAPH_READY) return null;

  if(!window.__tempRoute || window.__tempRouteTarget !== normMapName(targetName)){
    const r = buildGraphRouteTo(targetName);
    window.__tempRoute = r;
    window.__tempRouteTarget = r ? normMapName(targetName) : null;
  }

  if(!window.__tempRoute || window.__tempRoute.length===0) return null;

  const curName = normMapName(map.name);

  // consume steps already completed
  while(window.__tempRoute.length && normMapName(window.__tempRoute[0].to)===curName){
    window.__tempRoute.shift();
  }

  const step = window.__tempRoute[0];
  if(!step) return null;

  if(step.via) return {x:step.via.x, y:step.via.y};

  // try gateway by town name if no via
  const targetReadable = step.to;
  for(const i in g.townname){
    if(isNameMatch(normMapName(targetReadable), normMapName(g.townname[i].replace(/ +(?= )/g,'')))){
      const c=g.gwIds[i].split('.');
      if(a_getWay(c[0],c[1])===undefined) continue;
      return {x:c[0], y:c[1]};
    }
  }
  return null;
}

// Global temp target (e.g., vendor city); when set, findBestGw will route only there and suspend fallback
window.ADI_TEMP_TARGET_MAP = window.ADI_TEMP_TARGET_MAP || null;



// === PERSIST: ADI_TEMP_TARGET_MAP across refresh ===
(function(){
  try{
    const saved = localStorage.getItem('adi-temp-target') || '';
    if(saved) window.ADI_TEMP_TARGET_MAP = saved;
  }catch(_){}
})();
function setTempTarget(val){
  window.ADI_TEMP_TARGET_MAP = val || null;
  try{
    if(val) localStorage.setItem('adi-temp-target', String(val));
    else localStorage.removeItem('adi-temp-target');
  }catch(_){}
}
// ===== A* =====
  class AStar {
    constructor(collisionsString, width, height, start, end, additionalCollisions) {
      this.width=width; this.height=height;
      this.collisions=this.parseCollisions(collisionsString,width,height);
      this.additionalCollisions=additionalCollisions||{};
      this.start=this.collisions[start.x][start.y];
      this.end=this.collisions[end.x][end.y];
      this.start.beginning=true; this.start.g=0; this.start.f=heuristic(this.start,this.end);
      this.end.target=true; this.end.g=0;
      this.addNeighbours(); this.openSet=[this.start]; this.closedSet=[];
    }
    parseCollisions(s,w,h){ const c=new Array(w); for(let x=0;x<w;x++){ c[x]=new Array(h); for(let y=0;y<h;y++){ c[x][y]=new Point(x,y,s.charAt(x+y*w)==="1"); } } return c; }
    addNeighbours(){ for(let i=0;i<this.width;i++) for(let j=0;j<this.height;j++) this.addPointNeighbours(this.collisions[i][j]); }
    addPointNeighbours(p){ const x=p.x,y=p.y,n=[]; if(x>0)n.push(this.collisions[x-1][y]); if(y>0)n.push(this.collisions[x][y-1]); if(x<this.width-1)n.push(this.collisions[x+1][y]); if(y<this.height-1)n.push(this.collisions[x][y+1]); p.neighbours=n; }
    anotherFindPath(){
      while(this.openSet.length>0){
        let idx=this.getLowestF(), cur=this.openSet[idx];
        if(cur===this.end) return this.reconstructPath();
        this.openSet.splice(idx,1); this.closedSet.push(cur);
        for(const nb of cur.neighbours){
          if(this.closedSet.includes(nb)) continue;
          const tentative=cur.g+1; let better=false;
          if(this.end==this.collisions[nb.x][nb.y] || (!this.openSet.includes(nb) && !nb.collision && !this.additionalCollisions[nb.x+256*nb.y])){
            this.openSet.push(nb); nb.h=heuristic(nb,this.end); better=true;
          } else if(tentative<nb.g && !nb.collision){ better=true; }
          if(better){ nb.previous=cur; nb.g=tentative; nb.f=nb.g+nb.h; }
        }
      }
    }
    getLowestF(){ let i0=0; for(let i=0;i<this.openSet.length;i++) if(this.openSet[i].f<this.openSet[i0].f) i0=i; return i0; }
    reconstructPath(){ const path=[]; let cur=this.end; while(cur!==this.start){ path.push(cur); cur=cur.previous; } return path; }
  }
  class Point{ constructor(x,y,col){ this.x=x; this.y=y; this.collision=col; this.g=1e7; this.f=1e7; this.neighbours=[]; this.beginning=false; this.target=false; this.previous=undefined; } }
  function heuristic(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y); }
  function a_getWay(x,y){ return new AStar(map.col,map.x,map.y,{x:hero.x,y:hero.y},{x:x,y:y},g.npccol).anotherFindPath(); }
  function a_goTo(x,y){ let r=a_getWay(x,y); if(Array.isArray(r)) window.road=r; }

  if(!localStorage.getItem("adi-bot_lastmaps")) localStorage.setItem("adi-bot_lastmaps", JSON.stringify([]));

  let self=this, blokada=false, blokada2=false, $m_id;
  let herolx,heroly,increment=0;
  let bolcka=false, start=false;
  g.loadQueue.push({ fun:()=>{ start=true; } });

  let globalArray=[]; function addToGlobal(id){ let n=g.npc[id]; if(n.grp){ for(let i in g.npc){ if(g.npc[i].grp==n.grp && !globalArray.includes(g.npc[i].id)) globalArray.push(g.npc[i].id); } } else if(!globalArray.includes(id)) globalArray.push(id); }

  // === THROTTLE / DEBOUNCE ATAKU ===
  const ATTACK_GAP=900, ATTACK_SAME_TARGET_GAP=3000;
  let __lastAttackTime=0, __lastAttackTarget=null, __attackBanUntil=0;
  function safeAttack(targetId, cb){
    const now=Date.now();
    // mapa na czarnej liście -> nie atakuj
    try{ if(typeof __adi_isAttackBlockedOnMap==='function' && __adi_isAttackBlockedOnMap()) return; }catch(_){ }
    try{
      if(localStorage.getItem('adi-bot_allow_elite')==='0'){
        const npc = (typeof g!=='undefined' && g && g.npc) ? g.npc[targetId] : null;
        if(npc){
          if(npc.grp ? groupHasElite(npc.grp) : isElite(npc)) return;
        }
      }
    }catch(_){ }
    if(now<__attackBanUntil) return;
    if(now-__lastAttackTime<ATTACK_GAP) return;
    if(__lastAttackTarget===targetId && (now-__lastAttackTime)<ATTACK_SAME_TARGET_GAP) return;
    __lastAttackTime=now; __lastAttackTarget=targetId;
    _g(`fight&a=attack&ff=1&id=-${targetId}`, function(res){
      if(res&&res.alert&&/z powodu ogromnej ilości|opóźnienia internetu/i.test(res.alert)) __attackBanUntil=Date.now()+10500;
      if(res&&res.alert&&/Przeciwnik walczy już z kimś/i.test(res.alert)){ addToGlobal(targetId); $m_id=undefined;  clearTargetLock();}
      if(typeof cb==="function") cb(res);
    });
  }

  function chceckBlockade(){
    // mapa na czarnej liście -> nie próbuj atakować przy zacięciu
    try{ if(typeof __adi_isAttackBlockedOnMap==='function' && __adi_isAttackBlockedOnMap()) return; }catch(_){ }
    for(let i in g.npc){
      let n=g.npc[i];
      if((n.type==2||n.type==3)&&n.wt<19&&checkGrp(n.id)&&(!__adiIsBlacklisted||!__adiIsBlacklisted(n.id))&&hero.lvl+30>=n.lvl&&Math.abs(hero.x-n.x)<2&&Math.abs(hero.y-n.y)<2&&checkHeroHp())
        return safeAttack(n.id);
    }
  }

  // ====== CACHE ROZMIARU GRUPY (na mgłę/FOW) ======
  const GRP_SIZE_CACHE_TTL_MS = 30000; // 30s trzymamy max zaobserwowany rozmiar
  const __grpSizeCache = new Map();    // grpId -> { max, ts }

  function refreshGroupSizeCache(){
    try{
      if(!g || !g.npc) return;
      const now=Date.now();
      const counts = new Map(); // grpId -> visible count

      for(const i in g.npc){
        const m=g.npc[i];
        if(m && m.grp && (m.type==2 || m.type==3)){
          counts.set(m.grp, (counts.get(m.grp)||0)+1);
        }
      }
      // aktualizuj maksima
      for(const [grp, cnt] of counts){
        const prev = __grpSizeCache.get(grp);
        if(!prev || now - prev.ts > GRP_SIZE_CACHE_TTL_MS || cnt > prev.max){
          __grpSizeCache.set(grp, { max: prev ? Math.max(prev.max, cnt) : cnt, ts: now });
        } else {
          // odśwież znacznik czasu, żeby nie wygasło jeśli wciąż widzimy grupę
          __grpSizeCache.set(grp, { max: prev.max, ts: now });
        }
      }
      // sprzątnij stare wpisy
      for(const [grp, v] of __grpSizeCache){
        if(now - v.ts > GRP_SIZE_CACHE_TTL_MS) __grpSizeCache.delete(grp);
      }
    }catch{}
  }
  setInterval(refreshGroupSizeCache, 1000);


  // ===== BLACKLIST NPC (np. elity) =====
  const ADI_NPC_BL_TTL = 60000; // ms
  const __adiNpcBlacklist = new Map(); // id -> untilTs

  function __adiBlacklistNpc(id, ms){
    try{
      const until = Date.now() + (Number(ms)||ADI_NPC_BL_TTL);
      __adiNpcBlacklist.set(Number(id), until);
    }catch(_){}
  }
  function __adiIsBlacklisted(id){
    try{
      const until = __adiNpcBlacklist.get(Number(id));
      if(!until) return false;
      if(Date.now() > until){
        __adiNpcBlacklist.delete(Number(id));
        return false;
      }
      return true;
    }catch(_){}
    return false;
  }


  // ===== FOW: pamięć ostatnio widzianych mobów + lock celu (żeby nie "szarpać") =====
  const NPC_LAST_SEEN_TTL = 4500; // ms – jak długo trzymamy ostatnią pozycję moba
  const TARGET_LOCK_MS = 2000;    // ms – minimalny czas trzymania wybranego celu

  const __npcLastSeen = new Map(); // id -> {x,y,ts,mapName,grp,lvl,type}
  let __targetLockedUntil = 0;

  function lockTarget(){ __targetLockedUntil = Date.now() + TARGET_LOCK_MS; }
  function clearTargetLock(){ __targetLockedUntil = 0; }
  function isTargetLocked(){ return !!$m_id && Date.now() < __targetLockedUntil; }

  function updateNpcLastSeen(){
    try{
      if(!window.g || !g.npc) return;
      const now = Date.now();
      const curMap = (window.map && map.name) ? String(map.name) : '';
      for(const i in g.npc){
        const n = g.npc[i];
        if(!n) continue;
        if(n.type==2 || n.type==3){
          __npcLastSeen.set(n.id, {
            x:n.x, y:n.y, ts:now,
            mapName:curMap,
            grp:n.grp||null,
            lvl:n.lvl||null,
            type:n.type
          });
        }
      }
      for(const [id, snap] of __npcLastSeen){
        if(now - snap.ts > NPC_LAST_SEEN_TTL) __npcLastSeen.delete(id);
      }
    }catch{}
  }

  // anti-zacięcie: resetuj cel tylko jeśli NAPRAWDĘ zniknął i nie mamy snapshota
  setInterval(()=>{
    try{
      if($m_id && (!g.npc || !g.npc[$m_id]) && !__npcLastSeen.has($m_id)){
        $m_id=undefined;
       clearTargetLock();}
    }catch{}
  }, 4000);



  // ===== CAPTCHA LOGGER + persistent toggle =====
  const selfRef=this;
  if(!selfRef.basePI) selfRef.basePI=parseInput;
  selfRef.botPI=function(a){
    const ret=selfRef.basePI.apply(this, arguments);

    // CAPTCHA detect (skrócone)
    try{
      let info=null;
      if(a && a.captcha){
        if(typeof a.captcha==="object"){
          if(typeof a.captcha.autostart_time_left==="number") info={type:"countdown", seconds:a.captcha.autostart_time_left};
          else if (a.captcha.active || a.captcha.question || a.captcha.text) info={type:"active", text:a.captcha.question||a.captcha.text||JSON.stringify(a.captcha)};
        }
        if(!info && typeof a.captcha==="string") info={type:"active", text:a.captcha};
      }
      if(!info && a && a.alert && /(captcha|podaj wynik|zagadk)/i.test(a.alert)) info={type:"alert", text:a.alert};
      if(info){
        const sig=info.type==="countdown" ? `countdown:${info.seconds}` : `${info.type}:${info.text||""}`;
        if(sig!==__lastCaptchaSignature){
          __lastCaptchaSignature=sig;
          const nick=getHeroName();
          if(info.type==="countdown"){ message(`[BOT] CAPTCHA za ${info.seconds}s`); sendDiscord(`[${nick}] Za ${info.seconds}s pojawi się CAPTCHA. Kliknij "Rozwiąż teraz".`); }
          else { message(`[BOT] CAPTCHA aktywna`); sendDiscord(`[${nick}] CAPTCHA AKTYWNA${info.text?`: ${info.text}`:""}`); }
        }
      }
    }catch(e){}

    // logika ruch/atak + tryb wyczerpania
    if(!g.battle && !g.dead && start){
      syncAutoExpowiskoUI();
      const exhEnabled=localStorage.getItem("adi-bot_exh_enabled")==="1";
      const exhTargetMap=(localStorage.getItem("adi-bot_exh_map")||"Dom Roana").trim();
      const exhMin=getExhaustionMinutes(true);

      if (exhEnabled && typeof exhMin==="number" && exhMin>0){
        if(!__exhIdleWasOn){
          __exhIdleWasOn=true;
          const inputMaps0=document.querySelector("#adi-bot_maps");
          if(inputMaps0) __savedMapsBeforeExh=inputMaps0.value;
          message(`[BOT] Zbijanie wyczerpania: ${exhMin} min – idę na ${exhTargetMap} i stoję.`);
        }
        const inputMaps=document.querySelector("#adi-bot_maps");
        if(inputMaps && inputMaps.value!==exhTargetMap){
          inputMaps.value=exhTargetMap;
          localStorage.setItem("adi-bot_maps", exhTargetMap);
          localStorage.setItem("alksjd", 0);
        }
        if(map.name!==exhTargetMap){
          $map_cords=self.findBestGw();
          if($map_cords && !bolcka){
            if(hero.x==$map_cords.x && hero.y==$map_cords.y){ _g(`walk`); }
            else { a_goTo($map_cords.x,$map_cords.y); bolcka=true; setTimeout(()=>bolcka=false,2000); }
          }
        } else { $m_id=undefined;  clearTargetLock();window.road=undefined; }
        return ret;
      }

      if (__exhIdleWasOn && (typeof exhMin==="number" && exhMin<=0)){
        __exhIdleWasOn=false;
        const inputMapsR=document.querySelector("#adi-bot_maps");
        if(__savedMapsBeforeExh!==null && inputMapsR){
          inputMapsR.value=__savedMapsBeforeExh;
          localStorage.setItem("adi-bot_maps", __savedMapsBeforeExh);
          localStorage.setItem("alksjd", 0);
        }
        __savedMapsBeforeExh=null;
        if(parseInput!==selfRef.botPI){
          parseInput=selfRef.botPI;
          localStorage.setItem("adi-bot_enabled","1");
          const btn=document.querySelector("#adi-bot_toggle"); if(btn) btn.innerText="STOP";
        }
        message("[BOT] Wyczerpanie = 0 min – wznowiono expienie.");
      }

      // normalna praca bota
      refreshGroupSizeCache();


      updateNpcLastSeen();

// ===== PRIORITY: equipment task overrides exping =====
      try{
        const eqRaw = localStorage.getItem('adi-bot_equip_task');
        const eqTask = eqRaw ? JSON.parse(eqRaw) : null;

        if(eqTask && eqTask.kind === 'equip' && eqTask.map){
          // STALE GUARD: jeśli task dotyczy niższego lvla niż aktualny (np. po śmierci/reload) -> czyść
          const curLvl = Number(hero?.lvl) || 0;
          const taskLvl = Number(eqTask?.level) || 0;
          if(taskLvl > 0 && curLvl > 0 && taskLvl < curLvl){
            console.warn('[adi-bot] Stary equip_task wykryty -> czyszczę', {taskLvl, curLvl, eqTask});
            try{ localStorage.removeItem('adi-bot_equip_task'); }catch(_){ }
            try{ localStorage.setItem('adi-bot_equip_task_queue', JSON.stringify([])); }catch(_){ }
            try{ setTempTarget(null); }catch(_){ }
            return ret;
          }

          // zawsze utrzymuj temp target na miasto od ekwipunku
          setTempTarget(eqTask.map);

          // nie wybieraj mobów, nie wracaj na expowisko
          $m_id = undefined;
           clearTargetLock();blokada = false;
          blokada2 = false;

          // jeśli jesteśmy poza miastem -> jedziemy tylko po GW (findBestGw ma już logikę ADI_TEMP_TARGET_MAP)
          const cur = normMapName(map.name);
          const tgt = normMapName(eqTask.map);

          if(cur !== tgt){
            $map_cords = self.findBestGw();
            if($map_cords && !bolcka){
              if(hero.x == $map_cords.x && hero.y == $map_cords.y){
                _g('walk');
              }else{
                a_goTo($map_cords.x, $map_cords.y);
                bolcka = true;
                setTimeout(()=>bolcka=false, 2000);
              }
            }
          }

          // priorytet -> pomijamy całą resztę (exp, moby, trasy na expowisko)
          return ret;
        }
      }catch(_){}



      // ===== PRIORITY: potion buy task overrides exping (hard priority like equip) =====
      try{
        const btRaw = localStorage.getItem('adi-bot_buy_task');
        const bt = btRaw ? JSON.parse(btRaw) : null;

        if(bt && bt.active){
          // trzymaj temp target na mapę handlarza mikstur przez cały czas trwania taska
          try{ const v = (bt && bt.vendor) ? bt.vendor : getSelectedVendor(); setTempTarget(v.map); }catch(_){ }

          // zablokuj expienie / wybór mobów / powroty na expowisko
          $m_id = undefined;
           clearTargetLock();blokada = false;
          blokada2 = false;

          // jeśli jeszcze nie jesteśmy na mapie handlarza -> jedziemy tylko po GW
          try{
            const cur = normMapName(map.name);
            const v = (bt && bt.vendor) ? bt.vendor : getSelectedVendor();
            const tgt = normMapName(v.map);
            if(cur !== tgt){
              $map_cords = self.findBestGw();
              if($map_cords && !bolcka){
                if(hero.x == $map_cords.x && hero.y == $map_cords.y){
                  _g('walk');
                }else{
                  a_goTo($map_cords.x, $map_cords.y);
                  bolcka = true;
                  setTimeout(()=>bolcka=false, 2000);
                }
              }
            }
          }catch(_){}

          // twardy priorytet -> pomijamy całą resztę (exp, moby, trasy na expowisko)
          return ret;
        }
      }catch(_){}

      if(!$m_id && !bolcka && !isTargetLocked()){
        $m_id=self.findBestMob();
        if(!$m_id && localStorage.getItem(`adi-bot_expowiska`)){
          let tmp1,tmp2=9999; const def=expowiska[getSelectedExpKey()];
          if(def && def.mobs_id){
            let ex=def.mobs_id;
            for(let i in ex){
              if(g.npc[ex[i]]){
                tmp1=a_getWay(g.npc[ex[i]].x,g.npc[ex[i]].y).length;
                if(tmp1<tmp2){ tmp2=tmp1; $m_id=ex[i]; }
              }
            }
          }
        }
        if($m_id) lockTarget();
        blokada2=false; blokada=false;
      }

      if($m_id){
        let mob=g.npc[$m_id];

        // mob wypadł z widoku (czerwone mapy / FOW) -> goń po ostatniej znanej pozycji
        if(!mob){
          const snap = __npcLastSeen.get($m_id);
          const curMap = (window.map && map.name) ? String(map.name) : '';
          if(snap && snap.mapName === curMap){
            if(!blokada2 && !blokada){
              a_goTo(snap.x, snap.y);
              blokada2=true;
              lockTarget();
              setTimeout(()=>{ blokada2=false; },900);
            }
            // jeśli doszliśmy i nadal go nie ma – odpuść
            if(Math.abs(hero.x - snap.x) + Math.abs(hero.y - snap.y) <= 1){
              $m_id=undefined;
             clearTargetLock();}
            return ret;
          }
          $m_id=undefined;
           clearTargetLock();return ret;
        }

        if(Math.abs(hero.x-mob.x)<2 && Math.abs(hero.y-mob.y)<2 && !blokada){
          blokada=true;
          if(checkGrp(mob.id) && (!__adiIsBlacklisted||!__adiIsBlacklisted(mob.id))){
            safeAttack(mob.id,function(res){
              if(res && res.alert && /Przeciwnik walczy już z kimś/i.test(res.alert)){ addToGlobal(mob.id); $m_id=undefined;  clearTargetLock();}
            });
          }
          setTimeout(()=>{ $m_id=undefined;  clearTargetLock();},500);
        } else if(!blokada2 && !blokada){
          a_goTo(mob.x,mob.y); blokada2=true;
          lockTarget();
        }
      } else if (document.querySelector(`#adi-bot_maps`) && document.querySelector(`#adi-bot_maps`).value.length>0){
        $map_cords=self.findBestGw();
        if($map_cords && !bolcka){
          if(hero.x==$map_cords.x && hero.y==$map_cords.y){ _g(`walk`); }
          else { a_goTo($map_cords.x,$map_cords.y); bolcka=true; setTimeout(()=>bolcka=false,2000); }
        }
      }

      if(heroly==hero.y && herolx==hero.x){
        increment++; if(increment>4){ chceckBlockade(); increment=0; $m_id=undefined;  clearTargetLock();$map_cords=undefined; bolcka=false; }
      } else { heroly=hero.y; herolx=hero.x; increment=0; }
    }

    return ret;
  };

  // ====== PERSISTENT TOGGLE on load ======
  const ENABLE_KEY="adi-bot_enabled";
  if(localStorage.getItem(ENABLE_KEY)===null) localStorage.setItem(ENABLE_KEY,"1");
  const enabledOnStart=localStorage.getItem(ENABLE_KEY)==="1";
  const selfRef2=this;
  if(enabledOnStart) parseInput=selfRef2.botPI; else parseInput=selfRef2.basePI;

  // === ELITY: rozpoznanie ===
  function isElite(n){
    try{
      if(!n) return false;

      // Elity często po ikonie: /npc/e1/.. /npc/e2/.. itd.
      const ic = String(n.icon||"");
      const tic = String(n.ticon||"");
      if(/\/npc\/e[1-5]\//i.test(ic) || /\/npc\/e[1-5]\//i.test(tic)) return true;

      if(typeof n.rank==="string" && /elita|e[2-5]/i.test(n.rank)) return true;

      const nm=(n.nick||n.name||"");
      if(/elita|e[2-5]/i.test(nm)) return true;

      // Fallback: wt 21..78
      const wt=Number(n.wt);
      if(Number.isFinite(wt) && wt>20 && wt<79) return true;
    }catch{}
    return false;
  }

  // === CACHE: czy grupa ma elitę (na FOW/mgłę/doczytywanie grupy) ===
  const GRP_ELITE_CACHE_TTL_MS=60000; // 60s
  const __grpEliteCache=new Map();   // grpId -> {hasElite:true, ts}

  function refreshGroupEliteCache(){
    try{
      if(!g || !g.npc) return;
      const now=Date.now();

      for(const i in g.npc){
        const n=g.npc[i];
        if(n && n.grp && isElite(n)){
          __grpEliteCache.set(n.grp,{hasElite:true, ts:now});
        }
      }

      // sprzątanie
      for(const [grp,v] of __grpEliteCache){
        if(now - v.ts > GRP_ELITE_CACHE_TTL_MS) __grpEliteCache.delete(grp);
      }
    }catch{}
  }
  setInterval(refreshGroupEliteCache, 800);

  function groupHasElite(grpid){
    try{
      const cached=__grpEliteCache.get(grpid);
      if(cached && cached.hasElite && (Date.now()-cached.ts) <= GRP_ELITE_CACHE_TTL_MS) return true;
    }catch{}

    try{
      for(let i in g.npc){
        const m=g.npc[i];
        if(m && m.grp==grpid && isElite(m)) return true;
      }
    }catch{}
    return false;
  }

  // === MAPY: normalizacja + dopasowanie podciągiem ===
  function stripDiacritics(s){ try{ return s.normalize("NFD").replace(/[\u0300-\u036f]/g,""); }catch{ return s; } }
  function normMapName(s){ return stripDiacritics((s||"").toString().replace(/\u00A0/g," ").replace(/\s+/g," ").trim().toLowerCase()); }
  function isNameMatch(a,b){ return a===b || a.includes(b) || b.includes(a); }
  function isOnAllowedMap(){
    const el=document.querySelector('#adi-bot_maps');
    if(!el) return true;
    const raw=(el.value||'').trim(); if(!raw) return true;
    const allowed=raw.split(',').map(s=>normMapName(s)).filter(Boolean);
    const current=normMapName(map.name);
    return allowed.some(x=>isNameMatch(current,x));
  }
// === CZARNA LISTA MAP: na tych mapach bot NIE ATAKUJE (tylko przejście) ===
const ATTACK_MAP_BLACKLIST_KEY = 'adi-bot_attack_map_blacklist';

function __adi_getAttackMapBlacklist(){
  // domyślnie blokujemy mapy tranzytowe (Fort Eder, Zapomniany Szlak)
  const def = ['Fort Eder', 'Zapomniany Szlak'];
  try{
    const raw = (localStorage.getItem(ATTACK_MAP_BLACKLIST_KEY) || '').trim();
    if(!raw) return def;
    // format: "Fort Eder, Inna mapa, ..."
    const arr = raw.split(',').map(s=>s.trim()).filter(Boolean);
    // jeśli ktoś wpisał tylko Fort Eder – OK; jeśli pusty – fallback
    return arr.length ? arr : def;
  }catch(_){
    return def;
  }
}

function __adi_isAttackBlockedOnMap(){
  try{
    if(!window.map || !map.name) return false;
    const cur = normMapName(map.name);
    const bl = __adi_getAttackMapBlacklist().map(normMapName);
    // dopasowanie podciągiem, tak jak w isOnAllowedMap()
    return bl.some(x => x && (cur===x || cur.includes(x) || x.includes(cur)));
  }catch(_){
    return false;
  }
}

  // === GRUPY: parsowanie i sprawdzanie liczebności ===
  function parseGroupRangeConf(){
    const raw=(localStorage.getItem('adi-bot_grp_range')||'1-3').trim();
    if(/^\d+\s*-\s*\d+$/.test(raw)){
      const [a,b]=raw.split('-').map(s=>parseInt(s.trim(),10));
      if(!isNaN(a)&&!isNaN(b)) return {type:'range', min:Math.min(a,b), max:Math.max(a,b)};
    }
    if(/^\d+$/.test(raw)) return {type:'set', set:new Set([parseInt(raw,10)])};
    if(/^\d+(?:\s*,\s*\d+)+$/.test(raw)){
      const arr=raw.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n)&&n>0);
      return {type:'set', set:new Set(arr)};
    }
    return {type:'range', min:1, max:3};
  }
  function getGroupSizeVisible(grpid){
    let cnt=0;
    for(let i in g.npc){ const m=g.npc[i]; if(m && m.grp==grpid && (m.type==2||m.type==3)) cnt++; }
    return Math.max(1,cnt);
  }
  function getGroupSize(npc){
    if(npc && npc.grp){
      const visible = getGroupSizeVisible(npc.grp);
      const cached = __grpSizeCache.get(npc.grp);
      const now = Date.now();
      if(cached && (now - cached.ts) <= GRP_SIZE_CACHE_TTL_MS){
        return Math.max(visible, cached.max); // używamy MAX z ostatniego okna czasowego
      }
      return visible;
    }
    return 1;
  }
  function isGroupSizeAllowed(size){
    const conf=parseGroupRangeConf();
    if(conf.type==='set') return conf.set.has(size);
    return size>=conf.min && size<=conf.max;
  }

  // ===== filtry / reguły wyboru celu =====
  function checke2(grpid){
    try{
      let hasFree=false;
      for(const i in g.npc){
        const m=g.npc[i];
        if(m && m.grp==grpid && (m.type==2 || m.type==3)){
          if(typeof m.wt !== "number" || m.wt <= 20){ hasFree=true; break; }
        }
      }
      return hasFree;
    }catch{ return true; }
  }
  function checkHeroHp(){ return (hero.hp/hero.maxhp)*100>70; }

  function checkGrp(id){
    const npc=g.npc[id];
    try{ if(typeof __adiIsBlacklisted==='function' && __adiIsBlacklisted(id)) return false; }catch(_){ }

    const allowElite = localStorage.getItem('adi-bot_allow_elite')==='1';

    if(!allowElite){
      if(npc.grp){ if(groupHasElite(npc.grp)) return false; }
      else if(isElite(npc)) return false;
    }

    const size = getGroupSize(npc); // <<< używa MAX z cache (stabilne na czerwonych mapach)
    if(!isGroupSizeAllowed(size)) return false;

    if(npc.grp){
      const __expKey = getSelectedExpKey();
      if(!checke2(npc.grp) ||
         (expowiska[__expKey] &&
          expowiska[__expKey].ignore_grp &&
          expowiska[__expKey].ignore_grp.includes(npc.grp))) return false;
    }
    return true;
  }

  // ===== wybór moba =====
  this.findBestMob=function(){
    if(!isOnAllowedMap()) return undefined;

    // czarna lista map -> na tej mapie nie wybieramy celu do ataku
    try{ if(typeof __adi_isAttackBlockedOnMap==='function' && __adi_isAttackBlockedOnMap()) return undefined; }catch(_){ }

    let dist=9999, id;
    for(const i in g.npc){
      const n=g.npc[i];

      // blacklist (np. elity wykryte po ikonie)
      const __nid = (n && n.id!=null) ? Number(n.id) : Number(i);
      if(__adiIsBlacklisted(__nid)) continue;


      const inp=document.querySelector('#adi-bot_mobs');
      let min,max;

      // Default: read range from UI (e.g. "1-50")
      if(inp){
        const raw=(inp.value||'').replace(/[–—−]/g,'-');
        if(raw.includes('-')){
          const [a,b]=raw.split('-').map(s=>parseInt(s.trim(),10));
          if(!Number.isNaN(a)&&!Number.isNaN(b)){ min=Math.min(a,b); max=Math.max(a,b); }
        }
      }

      const wtOk = (typeof n.wt !== 'number') || (n.wt <= 20);

      if((n.type==2||n.type==3) && wtOk && min!=null && max!=null &&
         n.lvl<=max && n.lvl>=min && checkGrp(n.id) && (!__adiIsBlacklisted||!__adiIsBlacklisted(n.id)) && !globalArray.includes(n.id)){
        const path=a_getWay(n.x,n.y); if(!path) continue;
        if(path.length<dist){ dist=path.length; id=n.id; }
      }
    }
    return id;
  };

  if(!localStorage.getItem(`alksjd`)) localStorage.setItem(`alksjd`, '0');

  // ===== przechodzenie listy map w trybie ping-pong =====

  this.findBestGw=function(){
    // If a temporary target map is set (e.g., going to vendor), route ONLY to it and pause fallback.
    if(window.ADI_TEMP_TARGET_MAP){
      const tgt = normMapName(window.ADI_TEMP_TARGET_MAP);
      const cur = normMapName(map.name);
      if(cur !== tgt){
        const via = followGraphTo(window.ADI_TEMP_TARGET_MAP);
        if(via) return {x: via.x, y: via.y};
      }
      // already at target -> do not move anywhere until caller clears ADI_TEMP_TARGET_MAP
      return;
    }

    const mapsInput=document.querySelector('#adi-bot_maps');
    const txt=(mapsInput?mapsInput.value:'').split(',').map(s=>s.trim()).filter(Boolean);
    if(txt.length===0) return;

    if(!localStorage.getItem('adi-bot_dir')) localStorage.setItem('adi-bot_dir','1');
    let inc=parseInt(localStorage.getItem('alksjd'),10); if(!Number.isFinite(inc)) inc=0;
    let dir=parseInt(localStorage.getItem('adi-bot_dir'),10); if(!Number.isFinite(dir)||dir===0) dir=1;

    const curName = normMapName(map.name);

    // If we are currently on one of the listed maps, sync the pointer to that position.
    let curIdx = -1;
    for(let i=0;i<txt.length;i++){
      if(isNameMatch(normMapName(txt[i]), curName)){ curIdx=i; break; }
    }
    if(curIdx>=0) inc = curIdx;

    // Ping-pong advance if we're already at the current target.
    if(txt[inc] && isNameMatch(normMapName(txt[inc]), curName)){
      inc += dir;
      if(inc>=txt.length){ inc=Math.max(0, txt.length-2); dir=-1; }
      else if(inc<0){ inc=Math.min(1, txt.length-1); dir=1; }
      localStorage.setItem('alksjd', String(inc));
      localStorage.setItem('adi-bot_dir', String(dir));
    }else{
      // persist synced index even if we didn't advance
      localStorage.setItem('alksjd', String(Math.max(0, Math.min(txt.length-1, inc))));
      localStorage.setItem('adi-bot_dir', String(dir));
    }

    const target = txt[Math.max(0, Math.min(txt.length-1, inc))];

    // 1) Try direct gateway (adjacent map).
    let obj;
    for(const i in g.townname){
      if(isNameMatch(normMapName(target), normMapName(g.townname[i].replace(/ +(?= )/g,'')))){
        const c=g.gwIds[i].split('.');
        if(a_getWay(c[0],c[1])===undefined) continue;
        obj={x:c[0], y:c[1]}; break;
      }
    }
    if(obj) return obj;

    // 2) If not adjacent, use graph routing (multi-map) to reach the target map.
    if(window.ADI_MAP_GRAPH_READY){
      const via = followGraphTo(target);
      if(via) return { x: via.x, y: via.y };
    }

    // 3) Fallback: if graph isn't available, try to route to the FIRST map via graphRoute logic (if any)
    // (Without graph we can't reliably move to non-adjacent targets.)
    const first = getSelectedExpFirstMap && getSelectedExpFirstMap();
    if(first && window.ADI_MAP_GRAPH_READY){
      const via = followGraphTo(first);
      if(via) return { x: via.x, y: via.y };
    }
    return;
  };

  // ===== UI =====
  this.initHTML=function(){
    if(!localStorage.getItem(`adi-bot_position`)) localStorage.setItem(`adi-bot_position`, JSON.stringify({x:0,y:0}));
    let position=JSON.parse(localStorage.getItem(`adi-bot_position`));

    let box=document.createElement(`div`); box.id=`adi-bot_box`; box.setAttribute(`tip`,`Złap i przenieś :)`);

    let input1=document.createElement(`input`); input1.type=`text`; input1.id=`adi-bot_mobs`; input1.classList.add(`adi-bot_inputs`);
    input1.setAttribute(`tip`,`Wprowadź lvl mobków w postaci np. '50-70'`); box.appendChild(input1);

    let input2=document.createElement(`input`); input2.type=`text`; input2.id=`adi-bot_maps`; input2.classList.add(`adi-bot_inputs`);
    input2.setAttribute(`tip`,`Wprowadź nazwy map`); box.appendChild(input2);

    let select=document.createElement(`select`); select.id=`adi-bot_list`; select.classList.add(`adi-bot_inputs`);
    select.setAttribute(`tip`,`Wybierz expowisko, aby dodatek wpisał mapy za Ciebie`);
    // AUTO na górze
    { let o=document.createElement(`option`); o.setAttribute(`value`,`auto`); o.text=`Auto`; select.appendChild(o); }
    // reszta expowisk
    for(let i=0;i<Object.keys(expowiska).length;i++){ let o=document.createElement(`option`); o.setAttribute(`value`,Object.keys(expowiska)[i]); o.text=Object.keys(expowiska)[i]; select.appendChild(o); }
    box.appendChild(select);
    // --- Graf map (JSON) - lokalny ---
    const graphWrap = document.createElement('div');
    graphWrap.classList.add('adi-bot_box');
    graphWrap.style.marginTop = '6px';
    graphWrap.setAttribute('tip','Wklej tutaj graf map (JSON). Zostanie zapisany lokalnie.');
    const graphLabel = document.createElement('div');
    graphLabel.textContent = 'Graf map (JSON):';
    graphLabel.style.margin = '4px 0';
    const graphArea = document.createElement('textarea');
    graphArea.id = 'adi-bot_graph';
    graphArea.classList.add('adi-bot_inputs');
    graphArea.style.width = '100%';
    graphArea.style.minHeight = '120px';
    graphArea.placeholder = '{ \"Stare Ruiny\": [ {\"to\": \"...\", \"via\": {\"x\":123,\"y\":456}} ] }';
    try{ graphArea.value = localStorage.getItem('adi-bot_graph_json') || ''; }catch(_){}
    const graphRow = document.createElement('div');
    graphRow.style.display='flex'; graphRow.style.gap='6px'; graphRow.style.alignItems='center'; graphRow.style.marginTop='4px';
    const btnSaveGraph = document.createElement('button');
    btnSaveGraph.textContent = 'Zapisz graf';
    btnSaveGraph.classList.add('adi-bot_btn');
    const btnClearGraph = document.createElement('button');
    btnClearGraph.textContent = 'Wyczyść';
    btnClearGraph.classList.add('adi-bot_btn');
    const graphStatus = document.createElement('span');
    graphStatus.id = 'adi-bot_graph_status';
    graphStatus.style.fontSize='11px'; graphStatus.style.opacity='0.8';
    function setGraphStatus(msg, ok){
      graphStatus.textContent = msg;
      graphStatus.style.color = ok ? '#3cb371' : '#f08080';
    }
    btnSaveGraph.addEventListener('click', ()=>{
      const txt = graphArea.value.trim();
      if(!txt){ localStorage.removeItem('adi-bot_graph_json'); window.ADI_MAP_GRAPH={}; window.ADI_MAP_GRAPH_READY=false; setGraphStatus('Usunięto graf.', true); return; }
      try{
        const obj = JSON.parse(txt);
        if(typeof obj!=='object' || Array.isArray(obj)) throw new Error('JSON musi być obiektem {mapa:[...]...}');
        localStorage.setItem('adi-bot_graph_json', txt);
        window.ADI_MAP_GRAPH = obj;
        window.ADI_MAP_GRAPH_READY = true;
        setGraphStatus('Zapisano. Wczytano '+Object.keys(obj).length+' węzłów.', true);
        console.log('[adi-bot] MAP_GRAPH saved & loaded from UI:', Object.keys(obj).length, 'nodes');
      }catch(e){
        setGraphStatus('Błędny JSON: '+e.message, false);
      }
    });
    btnClearGraph.addEventListener('click', ()=>{
      graphArea.value='';
      localStorage.removeItem('adi-bot_graph_json');
      window.ADI_MAP_GRAPH={};
      window.ADI_MAP_GRAPH_READY=false;
      setGraphStatus('Graf wyczyszczony.', true);
    });
    graphRow.appendChild(btnSaveGraph);
    graphRow.appendChild(btnClearGraph);
    graphRow.appendChild(graphStatus);
    graphWrap.appendChild(graphLabel);
    graphWrap.appendChild(graphArea);
    graphWrap.appendChild(graphRow);
    box.appendChild(graphWrap);

    // --- Auto-kupowanie mikstur (Torneg / Wysoka kapłanka Gryfia) ---
    const apWrap = document.createElement('div'); apWrap.classList.add('adi-bot_box'); apWrap.style.marginTop='6px';
    apWrap.setAttribute('tip','Auto-kupowanie mikstur u wybranego handlarza (Auto: najbliższy – graf | Torneg/Ithan/Karka-han/Werbin/Eder/Dom Tunii/Liściaste Rozstaje/...)');
    const apRow = document.createElement('div'); apRow.style.display='grid'; apRow.style.gridTemplateColumns='1fr auto'; apRow.style.gap='6px';
    // === KONFIGURACJA HANDLARZY MIKSTUR ===
    const POTION_VENDORS = {
            torneg:   { key: 'torneg',   map: 'Torneg',   npc: 'Wysoka kapłanka Gryfia', stand: { x: 79, y: 9 } },
      ithan:    { key: 'ithan',    map: 'Ithan',    npc: 'Uzdrowicielka Makatara', stand: { x: 18, y: 16 } },
      karkahan: { key: 'karkahan', map: 'Karka-han',npc: 'Uzdrowicielka Halfinia', stand: { x: 31, y: 39 } },
      werbin:   { key: 'werbin',   map: 'Werbin',   npc: 'Uzdrowicielka Hiliko',  stand: { x: 38, y: 17 } },
      eder:     { key: 'eder',     map: 'Eder',     npc: 'Szalony Etrefan',       stand: { x: 56, y: 41 } },
      domtunii: { key: 'domtunii', map: 'Dom Tunii', npc: 'Tunia Frupotius', stand: { x: 7, y: 10 } },
      mirvenisadur: { key: 'mirvenisadur', map: 'Mirvenis-Adur', npc: 'Uzdrowiciel Ypsli', stand: { x: 82, y: 8 } },
      tuzmer: { key: 'tuzmer', map: 'Tuzmer', npc: 'Uzdrowiciel Toramidamus', stand: { x: 26, y: 22 } },
      mythar: { key: 'mythar', map: 'Mythar', npc: 'Jemenoss', stand: { x: 45, y: 14 } },
      nithal: { key: 'nithal', map: 'Nithal', npc: 'Doktor Nad', stand: { x: 5, y: 49 } },
      thuzal: { key: 'thuzal', map: 'Thuzal', npc: 'Kapłanka Hiada', stand: { x: 52, y: 18 } },
      lisciasterozstaje: { key: 'lisciasterozstaje', map: 'Liściaste Rozstaje', npc: 'Uzdrowicielka Emanilia', stand: { x: 21, y: 52 } },
    };
// --- ograniczenie dostępu do Tunii (Dom Tunii) do poziomu 70+ ---
function domTuniiAllowed(){ try{ return (Number(hero?.lvl)||0) >= 70; }catch(_){ return false; } }

    function getSelectedVendorKey(){ try{ return localStorage.getItem('adi-bot_vendor') || 'auto'; }catch(_){ return 'auto'; } }

// policz liczbę przejść w grafie do wskazanej mapy; Infinity gdy brak trasy/grafu
function stepsToMap(targetName){
  try{
    if(!window.ADI_MAP_GRAPH_READY) return Infinity;
    const cur = normMapName(map?.name || '');
    const tgt = normMapName(targetName || '');
    if(!cur || !tgt) return Infinity;
    if(cur === tgt) return 0;
    const path = bfsGraph(cur, tgt);
    if(!path || path.length < 2) return Infinity;
    return path.length - 1;
  }catch(_){ return Infinity; }
}

// wybierz najbliższego handlarza wg liczby krawędzi w grafie
function findNearestVendor(){
  try{
    const cur = normMapName(map?.name || '');
    let best = null, bestSteps = Infinity;
    for(const k in POTION_VENDORS){
      const v = POTION_VENDORS[k];
      if(v.key==='domtunii' && !domTuniiAllowed()) continue;
      const s = stepsToMap(v.map);
      // prefer same-map immediately
      if(cur && normMapName(v.map) === cur){ return v; }
      if(s < bestSteps){ bestSteps = s; best = v; }
    }
    // jeśli graf nie gotowy lub brak tras – wróć do Torneg jako domyślnego
    return best || POTION_VENDORS.torneg;
  }catch(_){ return POTION_VENDORS.torneg; }
}

function getSelectedVendor(){
  const k = getSelectedVendorKey();
  if(k === 'auto') return findNearestVendor();
  if(k === 'domtunii' && !domTuniiAllowed()) return findNearestVendor();
  return POTION_VENDORS[k] || matchVendorByMap(k) || POTION_VENDORS.torneg;
}

function setSelectedVendor(k){
  try{
    if(k === 'auto' || (k && (k in POTION_VENDORS))){
      localStorage.setItem('adi-bot_vendor', k);
    }else{
      localStorage.setItem('adi-bot_vendor', 'torneg');
    }

function matchVendorByMap(mapName){
  const nm = normMapName(mapName||'');
  for(const kk in POTION_VENDORS){
    const v = POTION_VENDORS[kk];
    if(normMapName(v.map) === nm) return v;
  }
  return null;
}

  }catch(_){}
}

    // UI: wybór handlarza mikstur
    const vendorRow = document.createElement('div');
    vendorRow.style.display='grid';
    vendorRow.style.gridTemplateColumns='1fr';
    vendorRow.style.gap='6px';
    vendorRow.style.margin='4px 0';

    const vendorSel = document.createElement('select');
    vendorSel.id = 'adi-bot_vendor';
    vendorSel.className = 'adi-bot_inputs';
const optAuto = document.createElement('option'); optAuto.value='auto'; optAuto.textContent='Auto (najbliższy – graf)'; vendorSel.appendChild(optAuto);

    const opt1 = document.createElement('option'); opt1.value='torneg';   opt1.textContent='Torneg – Wysoka kapłanka Gryfia'; vendorSel.appendChild(opt1);
    const opt2 = document.createElement('option'); opt2.value='ithan';    opt2.textContent='Ithan – Uzdrowicielka Makatara';   vendorSel.appendChild(opt2);
    const opt3 = document.createElement('option'); opt3.value='karkahan'; opt3.textContent='Karka-han – Uzdrowicielka Halfinia'; vendorSel.appendChild(opt3);
    const opt4 = document.createElement('option'); opt4.value='werbin';   opt4.textContent='Werbin – Uzdrowicielka Hiliko';    vendorSel.appendChild(opt4);
    const opt5 = document.createElement('option'); opt5.value='eder';     opt5.textContent='Eder – Szalony Etrefan';           vendorSel.appendChild(opt5);
        const opt6 = document.createElement('option'); opt6.value='domtunii';  opt6.textContent='Dom Tunii – Tunia Frupotius'; vendorSel.appendChild(opt6);
    const opt7 = document.createElement('option'); opt7.value='mirvenisadur';  opt7.textContent='Mirvenis-Adur – Uzdrowiciel Ypsli'; vendorSel.appendChild(opt7);
    const opt8 = document.createElement('option'); opt8.value='tuzmer';  opt8.textContent='Tuzmer – Uzdrowiciel Toramidamus'; vendorSel.appendChild(opt8);
    const opt9 = document.createElement('option'); opt9.value='mythar';  opt9.textContent='Mythar – Jemenoss'; vendorSel.appendChild(opt9);
    const opt10 = document.createElement('option'); opt10.value='nithal';  opt10.textContent='Nithal – Doktor Nad'; vendorSel.appendChild(opt10);
    const opt11 = document.createElement('option'); opt11.value='thuzal';  opt11.textContent='Thuzal – Kapłanka Hiada'; vendorSel.appendChild(opt11);
    const opt12 = document.createElement('option'); opt12.value='lisciasterozstaje';  opt12.textContent='Liściaste Rozstaje – Uzdrowicielka Emanilia'; vendorSel.appendChild(opt12);
try{ vendorSel.value = getSelectedVendorKey(); }catch(_){}
    vendorSel.addEventListener('change', ()=>{ setSelectedVendor(vendorSel.value); message('Zapisano wybór handlarza mikstur.'); });



vendorRow.appendChild(vendorSel);
    apWrap.appendChild(vendorRow);

    const sel = document.createElement('select'); sel.id='adi-bot_potion_name'; sel.className='adi-bot_inputs';
      o=document.createElement('option'); o.value='Ampułka uzdrawiająca'; o.textContent='Ampułka uzdrawiająca'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Fiolka lekkiej regeneracji'; o.textContent='Fiolka lekkiej regeneracji'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Flakonik śmiałka'; o.textContent='Flakonik śmiałka'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Krople na drobne rany'; o.textContent='Krople na drobne rany'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Piramidka odnowy'; o.textContent='Piramidka odnowy'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Mikstura początkującego alchemika'; o.textContent='Mikstura początkującego alchemika'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Łyk Odrodzenia'; o.textContent='Łyk Odrodzenia'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Remedium na głębokie rany'; o.textContent='Remedium na głębokie rany'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Magiczne panaceum'; o.textContent='Magiczne panaceum'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Silny specyfik leczący'; o.textContent='Silny specyfik leczący'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Wyciąg wieloziołowy'; o.textContent='Wyciąg wieloziołowy'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Antidotum łowcy węży'; o.textContent='Antidotum łowcy węży'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Słój ze śliną bazyliszka'; o.textContent='Słój ze śliną bazyliszka'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Preparat wzmocnionej regeneracji'; o.textContent='Preparat wzmocnionej regeneracji'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Eliksir mistrza alchemii'; o.textContent='Eliksir mistrza alchemii'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Płyn w kryształowym więzieniu'; o.textContent='Płyn w kryształowym więzieniu'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Próbka krwi minotaura'; o.textContent='Próbka krwi minotaura'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Roztwór Róży Wspomnień'; o.textContent='Roztwór Róży Wspomnień'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Wywar z magicznych porostów'; o.textContent='Wywar z magicznych porostów'; sel.appendChild(o);
      o=document.createElement('option'); o.value='Koncentrat zabliźniający'; o.textContent='Koncentrat zabliźniający'; sel.appendChild(o);

    const qty = document.createElement('input'); qty.type='number'; qty.min='1'; qty.max='100'; qty.value='5'; qty.id='adi-bot_potion_qty'; qty.className='adi-bot_inputs';
    const btnBuy = document.createElement('button'); btnBuy.textContent='Kup mikstury teraz'; btnBuy.className='adi-bot_btn'; btnBuy.style.marginTop='6px';
    const apInfo = document.createElement('div'); apInfo.style.fontSize='11px'; apInfo.style.opacity='0.8'; apInfo.style.marginTop='2px';
    apRow.appendChild(sel); apRow.appendChild(qty); apWrap.appendChild(apRow); apWrap.appendChild(btnBuy); apWrap.appendChild(apInfo); box.appendChild(apWrap);
    // --- AUTOBUY UI ---
    const autoRow = document.createElement('div');
    autoRow.style.display='flex';
    autoRow.style.alignItems='center';
    autoRow.style.gap='6px';
    autoRow.style.marginTop='4px';

    const chkAuto = document.createElement('input');
    chkAuto.type='checkbox';
    chkAuto.id='adi-bot_potion_autobuy';
    chkAuto.style.marginRight='6px';

    const lblAuto = document.createElement('label');
    lblAuto.htmlFor='adi-bot_potion_autobuy';
    lblAuto.textContent='Auto: kup gdy skończą się mikstury';

    autoRow.appendChild(chkAuto);
    autoRow.appendChild(lblAuto);
    apWrap.appendChild(autoRow);

    // Restore stored selections
    try{
      const storedName = localStorage.getItem('adi-bot_potion_name_sel');
      if(storedName){ for(const opt of sel.options){ if(opt.value === storedName){ sel.value = storedName; break; } } }
      const storedQty = parseInt(localStorage.getItem('adi-bot_potion_qty')||'5',10);
      if(!Number.isNaN(storedQty) && storedQty>0) qty.value = String(storedQty);
      chkAuto.checked = (localStorage.getItem('adi-bot_potion_autobuy') === '1');
    }catch(_){}

    // Persist selections
    sel.addEventListener('change', ()=>{ try{ localStorage.setItem('adi-bot_potion_name_sel', sel.value); }catch(_){} });
    qty.addEventListener('change', ()=>{ try{ localStorage.setItem('adi-bot_potion_qty', String(Math.max(1,parseInt(qty.value||'5',10)||5))); }catch(_){} });
    chkAuto.addEventListener('change', ()=>{ try{ localStorage.setItem('adi-bot_potion_autobuy', chkAuto.checked?'1':'0'); }catch(_){} });

    function apSetInfo(msg,ok){ apInfo.textContent=msg; apInfo.style.color = ok?'#3cb371':'#e57373'; }
    function apFindNpcByName(name){
      const all = Array.from(document.querySelectorAll('div.npc[ctip="t_npc"]'));
      const needle = normMapName(name);
      for(const el of all){
        const tip = (el.getAttribute('tip')||'').replace(/<[^>]*>/g,'');
        if(isNameMatch(needle, normMapName(tip))) return el;
      }
      return null;
    }
    function apClick(el){ if(!el) return; el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); el.click(); }


function apOpenDialogShop(){
  const dlg = document.querySelector('#dialog, .dialog, .npcDialog, #npcDialog, .dsc') || document.body;
  // 0) bezpośrednio po klasie LINE_SHOP (jak na screenie)
  let link = dlg.querySelector('li.LINE_SHOP, .LINE_SHOP, li[class*="LINE_SHOP"]');
  // 1) po onclick zawierającym "SHOP" albo wzorzec talk&id=...&c=20.2
  if(!link) link = dlg.querySelector('li[onclick*="LINE_SHOP"], li[onclick*="SHOP"], li[onclick*="&c=20.2"], li[onclick*="talk"][onclick*="20.2"]');
  // 2) po pozycji nr 2 na liście odpowiedzi
  if(!link){
    const rep = dlg.querySelector('#replies, .replies');
    if(rep) link = rep.querySelector('li:nth-child(2)');
  }
  // 3) fallback – po tekście/regexie (gdyby jednak był widoczny tekst)
  if(!link){
    const cand = Array.from(dlg.querySelectorAll('a, button, .ans, .option, li, div, span'));
    link = cand.find(e=>/specyfiki|lecznicz|sklep|handluj/i.test((e.innerText||e.textContent||'').trim()));
    if(!link) link = cand.find(e=>/^\s*2[\.\)]/.test((e.innerText||e.textContent||'').trim()));
  }

  if(link){
    try{ link.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); }catch(_){}
    try{ link.click(); }catch(_){}
    try{ link.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); }catch(_){}
    return true;
  }

  // 4) awaryjnie klawisz "2"
  try{
    const ev = new KeyboardEvent('keydown',{key:'2', keyCode:50, which:50, code:'Digit2', bubbles:true});
    document.dispatchEvent(ev);
  }catch(_){}
  return false;
}
    function apShopIsOpen(){ return document.querySelector('.item[id^=\"item\"], .shop, #shop, #npcshop'); }
    function apBuyByName(name, qty){
      const items = Array.from(document.querySelectorAll('.item[id^=\"item\"]'));
      const needle = normMapName(name);
      const el = items.find(e=>{
        const t=e.getAttribute('tip')||''; return normMapName(t).includes(needle);
      });
      if(!el) return false;
      let n=0; const timer = setInterval(()=>{ if(n>=qty) return clearInterval(timer); apClick(el); n++; }, 350);
      return true;
    }

    // === PERSISTENT AUTO-BUY TASK (survives F5) ===
    const BUY_TASK_KEY = 'adi-bot_buy_task';
    function loadBuyTask(){
      try{
        const raw = localStorage.getItem(BUY_TASK_KEY);
        if(!raw) return null;
        const o = JSON.parse(raw);
        if(o && o.active) return o;
      }catch(_){}
      return null;
    }
    function saveBuyTask(o){
      try{ localStorage.setItem(BUY_TASK_KEY, JSON.stringify(o || {})); }catch(_){}
    }
    function clearBuyTask(){ saveBuyTask({}); }

    // Single runner for the persisted task
    let __buyTaskTimer = null;
    function stopBuyFlow(){ if(__buyTaskTimer){ clearInterval(__buyTaskTimer); __buyTaskTimer = null; } }

    function startBuyFlow(){
      stopBuyFlow();
      __buyTaskTimer = setInterval(()=>{
        const task = loadBuyTask();
        if(!task){ stopBuyFlow(); return; }

        // vendor snapshot (avoid 'auto' switching vendors mid-task)
        const v = task.vendor || getSelectedVendor();
        const standX = v.stand.x, standY = v.stand.y;

        const here = normMapName(map.name);
        const want = task.name;
        const qtyN = Math.max(1, parseInt(task.qty||'1',10));

        // ensure temp target persists while active
        try{ setTempTarget(v.map); }catch(_){}

        if(task.stage==='toMap'){
          if(here===normMapName(v.map)){
            a_goTo(standX, standY);
            apSetInfo('Podchodzę do kapłanki...', true);
            task.stage='toStand'; saveBuyTask(task);
          }else{
            // move along the graph towards vendor map
            const via = followGraphTo(v.map);
            if(via){
              if(hero.x===via.x && hero.y===via.y){ _g('walk'); }
              else { a_goTo(via.x, via.y); }
            }
            apSetInfo('Wyznaczam trasę do ' + v.map + '...', true);
          }
          return;
        }

        if(task.stage==='toStand'){
          if(typeof hero!=='undefined' && hero.x===standX && hero.y===standY){
            task.stage='toNpc'; saveBuyTask(task);
            const npc = apFindNpcByName(v.npc); if(npc) apClick(npc);
          }else{
            a_goTo(standX, standY);
          }
          return;
        }

        if(task.stage==='toNpc'){
          if(document.querySelector('.dialog, #dialog, .npcDialog, #npcDialog, .dsc')){
            apOpenDialogShop();
            task.stage='shop'; saveBuyTask(task);
          }else{
            const npc = apFindNpcByName(v.npc); if(npc) apClick(npc);
          }
          return;
        }

        if(task.stage==='shop'){
          if(apShopIsOpen()){
            apBuyByName(want, qtyN);
            // after clicks, accept and close
            setTimeout(()=>{
              const acceptBtn = document.querySelector('#shop_accept'); if(acceptBtn) acceptBtn.click();
              setTimeout(()=>{ const closeBtn = document.querySelector('#shop_close'); if(closeBtn) closeBtn.click(); }, 300);
            }, qtyN*350 + 200);
            apSetInfo('Kupuję mikstury...', true);
            task.stage='back'; saveBuyTask(task);

            setTimeout(()=>{
              // finish: clear temp target and task; resume exp
              setTempTarget(null); window.__tempRoute=null; window.__tempRouteTarget=null;
              window.__graphRoute=null; window.__graphRouteTarget=null;
              apSetInfo('Kupione. Wracam na expowisko...', true);
              clearBuyTask();
              stopBuyFlow();
            }, qtyN*400 + 700);
          }else{
            apOpenDialogShop();
          }
          return;
        }

        // Safety: unknown stage -> reset
        if(!task.stage){
          task.stage='toMap'; saveBuyTask(task);
        }
      }, 600);
    }

btnBuy.addEventListener('click', ()=>{
  const want = sel.value;
  const qtyN = Math.max(1, parseInt(qty.value||'5',10));

  // create/overwrite persistent task (freeze vendor to avoid 'auto' switching mid-task)
  const v = getSelectedVendor();
  saveBuyTask({ active: true, name: want, qty: qtyN, stage: 'toMap', createdAt: Date.now(), vendor: { key: v.key, map: v.map, npc: v.npc, stand: v.stand } });

  // ensure temp target survives refresh while task active
  setTempTarget(v.map);
// start/continue the flow
  startBuyFlow();

  apSetInfo('Wyznaczam trasę do ' + getSelectedVendor().map + '...', true);

  // make sure bot is running
  const btn=document.querySelector('#adi-bot_toggle'); if(btn && btn.innerText==='START'){ btn.click(); }
});

// === AUTO-DETEKCJA BRAKU MIKSTUR W EKWIPUNKU ===
(function(){
// Policz sztuki mikstur po nazwie (tolerancyjnie po fragmencie nazwy) – FIX: normalizacja + strip HTML
function __adi_normTxt(s){
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPotionCountByName(name){
  try{
    if(!window.g || !g.item) return 0;

    const needle = __adi_normTxt(name);
    if(!needle || needle.length < 3) return 0;

    let sum = 0;
    for(const k in g.item){
      const it = g.item[k];
      if(!it) continue;

      const nm = __adi_normTxt(it.name) + ' ' + __adi_normTxt(it.nick) + ' ' + __adi_normTxt(it.tip);

      if(nm.includes(needle)){
        const amt = Number(it.amount ?? it.ilosc ?? it.count ?? it.quantity ?? 1);
        sum += (Number.isFinite(amt) && amt > 0) ? amt : 1;
      }
    }
    return sum;
  }catch(_){
    return 0;
  }
}

// expose for other parts of the bot (resume after refresh, etc.)
try{ window.__adi_normTxt = __adi_normTxt; window.getPotionCountByName = getPotionCountByName; }catch(_){}

  function getSelectedPotion(){
    const el = document.querySelector('#adi-bot_potion_name');
    if(el && el.value) return el.value;
    try{ return localStorage.getItem('adi-bot_potion_name_sel') || ''; }catch(_){ return ''; }
  }
  function getDesiredQty(){
    try{
      const v = parseInt(localStorage.getItem('adi-bot_potion_qty')||'5',10);
      return Math.max(1, Number.isFinite(v) ? v : 5);
    }catch(_){ return 5; }
  }

  let __autoBuyGuard = false;
  const CHECK_MS = 2500;

  setInterval(()=>{
    try{
      if(__autoBuyGuard) return;
      if(window.g?.battle || window.g?.dead) return;
      if(localStorage.getItem('adi-bot_potion_autobuy')!=='1') return;
      // nie rozpoczynaj, jeśli jest już aktywne zadanie zakupowe
      try{ const t = (function(){ try{return JSON.parse(localStorage.getItem('adi-bot_buy_task')||'{}');}catch(_){return null;} })(); if(t && t.active) return; }catch(_){}
      // nie rozpoczynaj, jeśli już lecimy gdzieś tymczasowo (np. inny task)
      // UWAGA: ADI_TEMP_TARGET_MAP jest też używane przez "smart traversal" (rotacja po dozwolonych mapach).
      // Nie blokujemy wtedy auto-kupowania, bo i tak nadpiszemy cel na mapę handlarza.
      // Blokuj tylko wtedy, gdy aktywny jest inny „twardy” task (np. ekwipunek).
      try{
        const eqTask = (function(){ try{return JSON.parse(localStorage.getItem('adi-bot_equip_task')||'null');}catch(_){return null;} })();
        if(eqTask && eqTask.stage) return;
      }catch(_){}

      const name = getSelectedPotion();
      if(!name) return;

      const have = getPotionCountByName(name);
      if(have > 0) return; // mamy chociaż 1 -> nic nie rób

      __autoBuyGuard = true;

      const qtyN = getDesiredQty();
      const v = getSelectedVendor();
      // utwórz task jak przy ręcznym kliknięciu (freeze vendor to avoid 'auto' switching mid-task)
      try{ localStorage.setItem('adi-bot_buy_task', JSON.stringify({ active:true, name, qty:qtyN, stage:'toMap', createdAt: Date.now(), vendor: { key: v.key, map: v.map, npc: v.npc, stand: v.stand } })); }catch(_){ }

      setTempTarget(v.map);

      startBuyFlow();
      try{ const elInfo = document.querySelector('#adi-bot_potion_name'); if(elInfo) { /* apSetInfo should exist in closure scope */ } }catch(_){ }

      // upewnij się, że bot pracuje
      const btn=document.querySelector('#adi-bot_toggle'); if(btn && btn.innerText==='START'){ btn.click(); }
    }catch(_){
    }finally{
      // pozwól na kolejne sprawdzenie po krótkiej pauzie
      setTimeout(()=>{ __autoBuyGuard=false; }, 1000);
    }
  }, CHECK_MS);
})();

// TRYB ZBIJANIA WYCZERPANIA
    let exhWrap=document.createElement("div"); exhWrap.style.marginTop="6px";
    let chkExh=document.createElement("input"); chkExh.type="checkbox"; chkExh.id="adi-bot_exh_enabled"; chkExh.style.marginRight="6px";
    let lblExh=document.createElement("label"); lblExh.htmlFor="adi-bot_exh_enabled"; lblExh.innerText="Zbijaj wyczerpanie";
    let mapExh=document.createElement("input"); mapExh.type="text"; mapExh.id="adi-bot_exh_map"; mapExh.classList.add("adi-bot_inputs");
    mapExh.setAttribute("tip","Mapa do stania (np. Dom Roana)"); mapExh.placeholder="Dom Roana";
    exhWrap.appendChild(chkExh); exhWrap.appendChild(lblExh); box.appendChild(exhWrap); box.appendChild(mapExh);

    // ELITY
    let eliteWrap=document.createElement("label"); eliteWrap.style.display="block"; eliteWrap.style.margin="4px 0 0";
    let chkElite=document.createElement("input"); chkElite.type="checkbox"; chkElite.id="adi-bot_allow_elite"; chkElite.style.marginRight="6px";
    eliteWrap.appendChild(chkElite); eliteWrap.appendChild(document.createTextNode("Walcz z elitami")); box.appendChild(eliteWrap);

    // AUTO UMIEJĘTNOŚCI
    let autoSkillsWrap=document.createElement("label"); autoSkillsWrap.style.display="block"; autoSkillsWrap.style.margin="4px 0 0";
    let chkAutoSkills=document.createElement("input"); chkAutoSkills.type="checkbox"; chkAutoSkills.id="adi-bot_auto_skills"; chkAutoSkills.style.marginRight="6px";
    autoSkillsWrap.appendChild(chkAutoSkills); autoSkillsWrap.appendChild(document.createTextNode("Auto umiejętności")); box.appendChild(autoSkillsWrap);

    // ROZMIAR GRUP
    let grpInput=document.createElement("input"); grpInput.type="text"; grpInput.id="adi-bot_grp_range"; grpInput.classList.add("adi-bot_inputs");
    grpInput.setAttribute("tip","Jakie grupy atakować: np. 1-3 lub 2 albo 1,3,5"); grpInput.placeholder="1-3"; box.appendChild(grpInput);

    // selektor do wyczerpania
    let exhSel=document.createElement("input"); exhSel.type="text"; exhSel.id="adi-bot_exh_selector"; exhSel.classList.add("adi-bot_inputs");
    exhSel.setAttribute("tip","CSS selektor elementu z napisem/liczbą wyczerpania"); exhSel.placeholder='np. span[tip="Limit 6h/dzień"]';
    let exhTest=document.createElement("button"); exhTest.id="adi-bot_exh_test"; exhTest.innerText="Test wyczerpania"; exhTest.classList.add("adi-bot_inputs");
    box.appendChild(exhSel); box.appendChild(exhTest);

    // START/STOP
    let toggleBtn=document.createElement("button"); toggleBtn.id="adi-bot_toggle"; toggleBtn.classList.add("adi-bot_inputs");
    toggleBtn.setAttribute("tip","Włącz lub wyłącz bota"); box.appendChild(toggleBtn);


    // ===== Tabs (Exp | E2 | Test) =====
    try{
      const tabExp = document.createElement('div');
      tabExp.id = 'adi-tab-exp';
      tabExp.className = 'adi-tab-content active';

      const tabE2 = document.createElement('div');
      tabE2.id = 'adi-tab-e2';
      tabE2.className = 'adi-tab-content';

      const tabTest = document.createElement('div');
      tabTest.id = 'adi-tab-test';
      tabTest.className = 'adi-tab-content';

      // Move all current UI controls into Exp tab (na razie nic nie przenosimy logicznie — tylko opakowanie)
      while(box.firstChild){
        tabExp.appendChild(box.firstChild);
      }

// Przenieś wybrane kontrolki testowe do zakładki "Test" (zgodnie z UI na screenach)
function __adi_moveToTestById(id, takeParent=false){
  try{
    const el = tabExp.querySelector('#'+id);
    if(!el) return null;
    const node = takeParent ? (el.parentElement || el) : el;
    tabTest.appendChild(node);
    return node;
  }catch(_){ return null; }
}
function __adi_moveNodeToTest(node){
  try{ if(node) tabTest.appendChild(node); }catch(_){}
}
// 1) Test wbicia lvla / przyciski testowe ekwipunku (przenosimy cały wiersz)
__adi_moveToTestById('adi-bot_equip_test_lvl', true);

// 2) Zbijaj wyczerpanie + mapa stania
(function(){
  try{
    const chk = tabExp.querySelector('#adi-bot_exh_enabled');
    if(!chk) return;
    const wrap = chk.parentElement && chk.parentElement.tagName ? chk.parentElement : null;
    if(wrap) __adi_moveNodeToTest(wrap);
    const mapInp = tabExp.querySelector('#adi-bot_exh_map');
    if(mapInp) __adi_moveNodeToTest(mapInp);
  }catch(_){}
})();

// 3) Selektor wyczerpania + test
__adi_moveToTestById('adi-bot_exh_selector');
__adi_moveToTestById('adi-bot_exh_test');

// 4) Test umiejętności (ręczny)
try{
  const skillName = document.createElement('input');
  skillName.type = 'text';
  skillName.id = 'adi-bot_skill_name';
  skillName.classList.add('adi-bot_inputs');
  skillName.placeholder = 'Sprawność fizyczna';
  skillName.setAttribute('tip','Nazwa umiejętności do podniesienia o 1 punkt');

  const skillBtn = document.createElement('button');
  skillBtn.id = 'adi-bot_skill_test';
  skillBtn.classList.add('adi-bot_inputs');
  skillBtn.textContent = 'Test umiejętności';
  skillBtn.setAttribute('tip','Otwiera listę umiejętności, znajduje skill po nazwie i klika + (1 punkt), potem zamyka okno');

  const skillStatus = document.createElement('div');
  skillStatus.id = 'adi-bot_skill_status';
  skillStatus.style.fontSize = '12px';
  skillStatus.style.margin = '2px 0 6px';
  skillStatus.style.color = '#111';
  skillStatus.textContent = '';

  tabTest.appendChild(skillName);
  tabTest.appendChild(skillBtn);
  tabTest.appendChild(skillStatus);
}catch(e){ console.warn('[adi-bot] skill test ui failed', e); }


      const tabs = document.createElement('div');
      tabs.className = 'adi-tabs';

      function mkTab(label, key){
        const t = document.createElement('div');
        t.className = 'adi-tab';
        t.dataset.tab = key;
        t.textContent = label;
        return t;
      }

      const t1 = mkTab('Exp','exp');
      const t2 = mkTab('E2','e2');
      const t3 = mkTab('Test','test');
      t1.classList.add('active');

      tabs.appendChild(t1); tabs.appendChild(t2); tabs.appendChild(t3);

      const contentWrap = document.createElement('div');
      contentWrap.className = 'adi-tabwrap';
      contentWrap.appendChild(tabExp);
      contentWrap.appendChild(tabE2);
      contentWrap.appendChild(tabTest);

      box.appendChild(tabs);
      box.appendChild(contentWrap);

      function activateTab(key){
        const allTabs = box.querySelectorAll('.adi-tab');
        const allPanels = box.querySelectorAll('.adi-tab-content');
        allTabs.forEach(x=>x.classList.toggle('active', x.dataset.tab===key));
        allPanels.forEach(p=>p.classList.toggle('active', p.id==='adi-tab-'+key));
        try{ localStorage.setItem('adi-bot_active_tab', key); }catch(_){}
      }

      tabs.addEventListener('click', (ev)=>{
        const el = ev.target && ev.target.closest ? ev.target.closest('.adi-tab') : null;
        if(!el) return;
        activateTab(el.dataset.tab);
      });

      // restore last active tab
      try{
        const saved = (localStorage.getItem('adi-bot_active_tab')||'exp').trim();
        if(saved==='e2' || saved==='test' || saved==='exp') activateTab(saved);
      }catch(_){}
    }catch(e){ console.warn('[adi-bot] tabs init failed', e); }

    document.body.appendChild(box);

    let style=document.createElement(`style`); style.type=`text/css`;
    style.appendChild(document.createTextNode(`
      #adi-bot_box{position:absolute;border:3px solid lime;padding:5px;text-align:center;background:url(http://i.imgur.com/iQISZHL.png);cursor:grab;left:${position.x}px;top:${position.y}px;width:auto;height:auto;z-index:390;}
      .adi-bot_inputs{box-sizing:content-box;margin:0 auto 3px;padding:2px;cursor:pointer;border:2px solid lime;border-radius:5px;font:normal 16px/normal "Comic Sans MS", Times, serif;color:#000;background:rgba(234,227,227,1);box-shadow:2px 2px 2px 0 rgba(0,0,0,0.2) inset;text-shadow:1px 1px 0 rgba(255,255,255,0.66);display:block;}
      input#adi-bot_mobs{text-align:center;}
      #adi-bot_toggle{background-color:#c9f7c9;font-weight:bold;}
    

      /* ===== Tabs ===== */
      #adi-bot_box .adi-tabs{display:flex;gap:0;background:#0f0f0f;border-bottom:1px solid #000;margin:-5px -5px 6px -5px;}
      #adi-bot_box .adi-tab{padding:6px 14px;cursor:pointer;background:#1a1a1a;border-right:1px solid #000;font-size:13px;user-select:none;color:#eae3e3;}
      #adi-bot_box .adi-tab:last-child{border-right:none;}
      #adi-bot_box .adi-tab:hover{background:#2a2a2a;}
      #adi-bot_box .adi-tab.active{background:#1e90ff;color:#000;font-weight:bold;}
      #adi-bot_box .adi-tabwrap{padding:0;margin:0;}
      #adi-bot_box .adi-tab-content{display:none;}
      #adi-bot_box .adi-tab-content.active{display:block;}
`)); document.head.appendChild(style);

    // odczyt ustawień UI
    if(localStorage.getItem(`adi-bot_mobs`)) input1.value=localStorage.getItem(`adi-bot_mobs`);
    if(localStorage.getItem(`adi-bot_maps`)) input2.value=localStorage.getItem(`adi-bot_maps`);
    {
      const savedExp = (localStorage.getItem(`adi-bot_expowiska`) || '').trim();
      if(savedExp === 'auto') select.value = 'auto';
      else if(savedExp && expowiska[savedExp]) select.value = savedExp;
    }
    // jeśli zapisane było AUTO, dopasuj mapy od razu
    if(select.value === 'auto'){
      const key = getSelectedExpKey();
      const def = expowiska[key];
      if(def && def.map){
        input2.value = def.map;
        localStorage.setItem(`adi-bot_maps`, input2.value);
      }
    }
    chkExh.checked = localStorage.getItem("adi-bot_exh_enabled")==="1";
    const eliteOn = localStorage.getItem("adi-bot_allow_elite")==="1"; chkElite.checked = eliteOn;
    const autoSkillsOn = localStorage.getItem("adi-bot_auto_skills")==="1"; try{ chkAutoSkills.checked = autoSkillsOn; }catch(_){ }
    grpInput.value = localStorage.getItem("adi-bot_grp_range") || "1-3";
    mapExh.value = localStorage.getItem("adi-bot_exh_map") || "Dom Roana";
    const selStored = localStorage.getItem("adi-bot_exh_selector"); exhSel.value = selStored && selStored.trim().length ? selStored : DEFAULT_EXH_SELECTOR;

    toggleBtn.innerText = (localStorage.getItem("adi-bot_enabled")==="1") ? "STOP" : "START";
    // Resume auto-buy task if it was active before refresh
    try{
      const t = loadBuyTask();
      if(t && t.active){
        // Jeśli po odświeżeniu mamy już mikstury, usuń wiszący task, żeby bot nie biegał do handlarza bez sensu.
        const selName = (document.querySelector('#adi-bot_potion_name')?.value || localStorage.getItem('adi-bot_potion_name_sel') || '').toString();
const have = (window.getPotionCountByName ? window.getPotionCountByName(selName) : 0);

        if(have > 0){
          apSetInfo('Po odświeżeniu: był aktywny task kupowania, ale mikstury są w ekwipunku — czyszczę task.', true);
          clearBuyTask();
          stopBuyFlow();
          setTempTarget(null);
        }else{
          apSetInfo('Wznawiam auto-zakup po odświeżeniu...', true);
          startBuyFlow();
        }
      }
}catch(_){}


    // listenery UI
    input1.addEventListener(`keyup`, ()=>localStorage.setItem(`adi-bot_mobs`, input1.value));
    input2.addEventListener(`keyup`, ()=>{
      localStorage.setItem(`adi-bot_maps`, input2.value);

      // >>> FIX: zmiana listy map = czyścimy zaległy tymczasowy cel i cache tras
      try{
        setTempTarget(null);                 // czyści window.ADI_TEMP_TARGET_MAP + localStorage adi-temp-target
        window.__tempRoute = null;
        window.__tempRouteTarget = null;
        __graphRoute = null;
        __graphRouteTarget = null;

        // opcjonalnie: jeśli używasz SMART TRAVERSAL, wyczyść jego listę odwiedzonych
        localStorage.removeItem('adi-bot_smart_visited');

        // restart cyklu ping-pong / kierunku
        localStorage.setItem(`alksjd`, 0);
        localStorage.setItem(`adi-bot_dir`, '1');
      }catch(_){}
    });
    select.addEventListener(`change`, ()=>{
      // >>> FIX: zmieniono expowisko = czyścimy zaległy tymczasowy cel i cache tras
      try{
        setTempTarget(null);                 // czyści window.ADI_TEMP_TARGET_MAP + localStorage adi-temp-target
        window.__tempRoute = null;
        window.__tempRouteTarget = null;
        __graphRoute = null;
        __graphRouteTarget = null;

        // opcjonalnie: jeśli używasz SMART TRAVERSAL, wyczyść jego listę odwiedzonych
        localStorage.removeItem('adi-bot_smart_visited');
      }catch(_){}

      // reset tras grafowych
      __graphRoute=null; __graphRouteTarget=null;
      localStorage.setItem(`adi-bot_expowiska`, select.value);

      const key = getSelectedExpKey(); // rozwiązuje "auto" -> konkret
      const def = expowiska[key];

      if(def && def.map){
        input2.value = def.map;
        localStorage.setItem(`adi-bot_maps`, input2.value);
        localStorage.setItem(`alksjd`, 0);

        if(select.value === 'auto') message(`Expowisko: AUTO → "${key}" (lvl ${hero && hero.lvl || 0})`);
        else message(`Zapisano expowisko "${select.value}"`);
      }else{
        message('Brak definicji expowiska dla: ' + key);
      }
    });

chkElite.addEventListener("change", ()=>{ localStorage.setItem("adi-bot_allow_elite", chkElite.checked?"1":"0"); message(chkElite.checked?"Elity: WŁ":"Elity: WYŁ"); });
    try{ chkAutoSkills.addEventListener("change", ()=>{ localStorage.setItem("adi-bot_auto_skills", chkAutoSkills.checked?"1":"0"); message(chkAutoSkills.checked?"Auto umiejętności: WŁ":"Auto umiejętności: WYŁ"); }); }catch(_){ }
    grpInput.addEventListener("keyup", ()=>{ localStorage.setItem("adi-bot_grp_range", grpInput.value.trim()); message(`Zakres grup zapisany: ${grpInput.value.trim()||'1-3'}`); });
    chkExh.addEventListener("change", ()=>{ localStorage.setItem("adi-bot_exh_enabled", chkExh.checked?"1":"0"); message(chkExh.checked?"Tryb zbijania wyczerpania: WŁ":"Tryb zbijania wyczerpania: WYŁ"); });
    mapExh.addEventListener("keyup", ()=>localStorage.setItem("adi-bot_exh_map", mapExh.value.trim()));
    exhSel.addEventListener("keyup", ()=>{ localStorage.setItem("adi-bot_exh_selector", exhSel.value.trim()); });

    exhTest.addEventListener("click", ()=>{ const v=getExhaustionMinutes(false); message(`[BOT] Wykryte wyczerpanie: ${v===null?"brak":v+" min"}`); });

    // ===== Test umiejętności =====
    (function(){
      const btn = document.getElementById('adi-bot_skill_test');
      if(!btn || btn.__adiBound) return;
      btn.__adiBound = true;

      function __adi_norm(s){
        return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
      }
      function __adi_tipToText(tip){
        try{
          const d=document.createElement('div');
          d.innerHTML=String(tip||'');
          return d.textContent||d.innerText||'';
        }catch(_){ return String(tip||''); }
      }
      function __adi_setStatus(msg){
        try{
          const st=document.getElementById('adi-bot_skill_status');
          if(st) st.textContent = msg || '';
        }catch(_){}
      }
      function __adi_wait(ms){ return new Promise(res=>setTimeout(res, ms)); }

      async function __adi_openSkills(){
        // prefer API, fallback to click button
        try{
          if(window.g && g.skills && typeof g.skills.show==='function'){ g.skills.show(); }
        }catch(_){}
        // click the "Lista umiejętności" button (some interfaces require it)
        try{
          const b=document.querySelector('#b_skills');
          if(b) b.click();
        }catch(_){}
      }

      function __adi_isSkillsVisible(){
        const s = document.querySelector('#skills');
        if(!s) return false;
        const ds = (s.style && s.style.display) ? s.style.display : '';
        if(ds && ds.toLowerCase()==='none') return false;
        const cs = window.getComputedStyle ? getComputedStyle(s) : null;
        if(cs && cs.display==='none') return false;
        return true;
      }

      async function __adi_waitForSkillsBoxes(timeoutMs){
        const t0 = Date.now();
        while(Date.now()-t0 < timeoutMs){
          if(__adi_isSkillsVisible()){
            const boxes = document.querySelectorAll('#skills_body .skillbox[tip]');
            if(boxes && boxes.length) return boxes;
          }
          await __adi_wait(120);
        }
        return null;
      }

      function __adi_findLearnBtnBySkillName(name){
        const want = __adi_norm(name);
        if(!want) return null;

        const boxes = document.querySelectorAll('#skills_body .skillbox[tip]');
        for(const sb of boxes){
          const tip = sb.getAttribute('tip') || '';
          const tipText = __adi_norm(__adi_tipToText(tip));
          // tipText usually starts with skill name (often in <b>..</b>)
          if(!tipText) continue;
          if(tipText.includes(want)){
            const border = sb.closest('.skillbox_border') || sb.parentElement;
            if(!border) continue;
            const learn = border.querySelector('.learn-btn');
            if(learn) return learn;
          }
        }
        return null;
      }

      async function __adi_closeSkills(){
        // wait a bit already handled outside
        try{
          if(window.g && g.skills && typeof g.skills.hide==='function'){ g.skills.hide(); return; }
        }catch(_){}
        try{
          const c = document.querySelector('#skills .closebut[onclick*="g.skills.hide"], #skills .closebut');
          if(c) c.click();
        }catch(_){}
      }

      btn.addEventListener('click', async ()=>{
        if(window.__adiSkillTestRunning) return;
        window.__adiSkillTestRunning = true;
        try{
          const inp = document.getElementById('adi-bot_skill_name');
          const skillName = (inp && inp.value ? inp.value : 'Sprawność fizyczna').trim();
          __adi_setStatus('Otwieram listę umiejętności...');
          console.log('[adi-bot][skills-test] start', skillName);

          await __adi_openSkills();

          // wait for skills UI + boxes
          const boxes = await __adi_waitForSkillsBoxes(7000);
          if(!boxes){
            __adi_setStatus('Nie widzę listy umiejętności (#skills_body).');
            console.log('[adi-bot][skills-test] no skills boxes');
            return;
          }

          // retry finding + clicking (UI often renders a bit later)
          const t0 = Date.now();
          let clicked = false;
          while(Date.now()-t0 < 6000 && !clicked){
            const learnBtn = __adi_findLearnBtnBySkillName(skillName);
            if(learnBtn){
              __adi_setStatus('Klikam + dla: '+skillName);
              try{ learnBtn.click(); }catch(_){}
              console.log('[adi-bot][skills-test] clicked +', skillName);
              clicked = true;

              // IMPORTANT: wait 1s before closing (prevents white-screen bugs)
              await __adi_wait(1000);
              await __adi_closeSkills();
              __adi_setStatus('Dodano 1 punkt i zamknięto okno.');
              break;
            }
            await __adi_wait(180);
          }

          if(!clicked){
            __adi_setStatus('Nie znalazłem umiejętności: '+skillName);
            console.log('[adi-bot][skills-test] skill not found', skillName);
          }
        }catch(e){
          console.warn('[adi-bot][skills-test] error', e);
          __adi_setStatus('Błąd testu umiejętności (sprawdź konsolę).');
        }finally{
          window.__adiSkillTestRunning = false;
        }
      });

    // ===== AUTO UMIEJĘTNOŚCI (po wbiciu lvla) =====
    const __ADI_SKILL_PLAN = {"Łowca":{"25":"błyskawiczny strzał","26":"podwójny strzał","27":"wzmocnienie wigoru","28":"wzmocnienie wigoru","29":"wzmocnienie wigoru","30":"wzmocnienie wigoru","31":"wzmocnienie wigoru","32":"sprawność fizyczna","33":"sprawność fizyczna","34":"sprawność fizyczna","35":"sprawność fizyczna","36":"cios krytyczny","37":"wyswobodzenie","38":"naturalny unik","39":"wzmocnienie wigoru","40":"wzmocnienie wigoru","41":"wzmocnienie wigoru","42":"sprawność fizyczna","43":"sprawność fizyczna","44":"sprawność fizyczna","45":"sprawność fizyczna","46":"wzmocnienie wigoru","47":"wzmocnienie wigoru","48":"sprawność fizyczna","49":"sprawność fizyczna","50":"szybka strzała","51":"wrodzona szybkość","52":"zwinność","53":"przebijanie pancerza","54":"wyswobodzenie","55":"wyswobodzenie","56":"naturalny unik","57":"przebijanie pancerza","58":"przebijanie pancerza","59":"przebijanie pancerza","60":"wrodzona szybkość","61":"wrodzona szybkość","62":"wrodzona szybkość","63":"zwinność","64":"zwinność","65":"zwinność","66":"naturalny unik","67":"naturalny unik","68":"naturalny unik","69":"naturalny unik","70":"szybka strzała","71":"szybka strzała","72":"szybka strzała","73":"wrodzona szybkość","74":"wrodzona szybkość","75":"wrodzona szybkość","76":"zwinność","77":"zwinność","78":"przebijanie pancerza","79":"przebijanie pancerza","80":"przetrwanie","81":"zranienie","82":"krytyczny strzał","83":"przetrwanie","84":"przetrwanie","85":"przetrwanie","86":"wrodzona szybkość","87":"wrodzona szybkość","88":"wyswobodzenie","89":"wyswobodzenie","90":"wyswobodzenie","91":"krytyczny strzał","92":"krytyczny strzał","93":"krytyczny strzał","94":"krytyczny strzał","95":"przebijanie pancerza","96":"przebijanie pancerza","97":"przebijanie pancerza","98":"naturalny unik","99":"naturalny unik","100":"naturalny unik","101":"przebijanie pancerza","102":"zwinność","103":"zwinność","104":"zwinność","105":"zwinność","106":"naturalny unik","107":"przetrwanie","108":"przetrwanie","109":"przetrwanie","110":"przetrwanie","111":"wyswobodzenie","112":"wyswobodzenie","113":"wyswobodzenie","114":"wyswobodzenie"},"Mag":{"25":"kula ognia","26":"koncentracja many","27":"zwiększenie absorpcji","28":"koncentracja many","29":"koncentracja many","30":"koncentracja many","31":"koncentracja many","32":"koncentracja many","33":"koncentracja many","34":"koncentracja many","35":"duszący pocisk","36":"sprawność fizyczna","37":"sprawność fizyczna","38":"sprawność fizyczna","39":"sprawność fizyczna","40":"zwiększenie absorpcji","41":"zwiększenie absorpcji","42":"cios krytyczny","43":"sprawność fizyczna","44":"sprawność fizyczna","45":"sprawność fizyczna","46":"zwiększenie absorpcji","47":"zwiększenie absorpcji","48":"zwiększenie absorpcji","49":"koncentracja many","50":"rytualne szaty","51":"wrodzona szybkość","52":"rozładowujący pocisk","53":"spowalniające uderzenie","54":"zwiększenie absorpcji","55":"zwiększenie absorpcji","56":"sprawność fizyczna","57":"sprawność fizyczna","58":"sprawność fizyczna","59":"rytualne szaty","60":"rytualne szaty","61":"wrodzona szybkość","62":"wrodzona szybkość","63":"wrodzona szybkość","64":"wrodzona szybkość","65":"koncentracja many","66":"zwiększenie absorpcji","67":"zwiększenie absorpcji","68":"rytualne szaty","69":"wrodzona szybkość","70":"wrodzona szybkość","71":"wrodzona szybkość","72":"wrodzona szybkość","73":"wrodzona szybkość","74":"rytualne szaty","75":"rytualne szaty","76":"rytualne szaty","77":"rytualne szaty","78":"rytualne szaty","79":"rytualne szaty","80":"potęga ognia","81":"przetrwanie","82":"moc leczenia","83":"potęga ognia","84":"potęga ognia","85":"potęga ognia","86":"potęga ognia","87":"moc leczenia","88":"moc leczenia","89":"moc leczenia","90":"moc leczenia","91":"moc leczenia","92":"potęga ognia","93":"potęga ognia","94":"potęga ognia","95":"moc leczenia","96":"moc leczenia","97":"moc leczenia","98":"moc leczenia","99":"potęga ognia","100":"potęga ognia","101":"cios krytyczny","102":"cios krytyczny","103":"cios krytyczny","104":"cios krytyczny","105":"cios krytyczny","106":"przetrwanie","107":"przetrwanie","108":"przetrwanie","109":"przetrwanie","110":"przetrwanie","111":"przetrwanie","112":"przetrwanie","113":"przetrwanie","114":"przetrwanie"},"Tropiciel":{"25":"płonąca strzała","26":"podwójne trafienie","27":"skupienie mocy","28":"skupienie mocy","29":"skupienie mocy","30":"skupienie mocy","31":"skupienie mocy","32":"sprawność fizyczna","33":"sprawność fizyczna","34":"sprawność fizyczna","35":"cios krytyczny","36":"swobodny unik","37":"kruszące groty","38":"skupienie mocy","39":"sprawność fizyczna","40":"skupienie mocy","41":"sprawność fizyczna","42":"skupienie mocy","43":"sprawność fizyczna","44":"skupienie mocy","45":"sprawność fizyczna","46":"skupienie mocy","47":"sprawność fizyczna","48":"sprawność fizyczna","49":"sprawność fizyczna","50":"wzmocnienie absorpcji","51":"wygodne stroje","52":"wrodzona szybkość","53":"kruszące groty","54":"kruszące groty","55":"wzmocnienie absorpcji","56":"wrodzona szybkość","57":"wzmocnienie absorpcji","58":"wrodzona szybkość","59":"wygodne stroje","60":"wrodzona szybkość","61":"wzmocnienie absorpcji","62":"wzmocnienie absorpcji","63":"wzmocnienie absorpcji","64":"wrodzona szybkość","65":"wrodzona szybkość","66":"swobodny unik","67":"swobodny unik","68":"wzmocnienie absorpcji","69":"wzmocnienie absorpcji","70":"wrodzona szybkość","71":"wrodzona szybkość","72":"wzmocnienie absorpcji","73":"wzmocnienie absorpcji","74":"wrodzona szybkość","75":"wrodzona szybkość","76":"kruszące groty","77":"kruszące groty","78":"swobodny unik","79":"swobodny unik","80":"strzelecka moc ognia","81":"przetrwanie","82":"krytyczne trafienie","83":"znieczulica","84":"strzelecka moc ognia","85":"strzelecka moc ognia","86":"krytyczne trafienie","87":"wygodne stroje","88":"wygodne stroje","89":"swobodny unik","90":"swobodny unik","91":"strzelecka moc ognia","92":"strzelecka moc ognia","93":"znieczulica","94":"znieczulica","95":"znieczulica","96":"znieczulica","97":"przetrwanie","98":"przetrwanie","99":"strzelecka moc ognia","100":"strzelecka moc ognia","101":"wygodne stroje","102":"wygodne stroje","103":"strzelecka moc ognia","104":"strzelecka moc ognia","105":"strzelecka moc ognia","106":"znieczulica","107":"znieczulica","108":"znieczulica","109":"przetrwanie","110":"przetrwanie","111":"znieczulica","112":"znieczulica","113":"krytyczne trafienie","114":"przetrwanie"},"Paladyn":{"25":"gorące uderzenie","26":"szybki atak","27":"moc sprawiedliwych","28":"moc sprawiedliwych","29":"moc sprawiedliwych","30":"moc sprawiedliwych","31":"moc sprawiedliwych","32":"sprawność fizyczna","33":"sprawność fizyczna","34":"sprawność fizyczna","35":"sprawność fizyczna","36":"sprawność fizyczna","37":"cios krytyczny","38":"skupienie na celu","39":"błogosławiona ochrona","40":"hart ducha","41":"moc sprawiedliwych","42":"moc sprawiedliwych","43":"moc sprawiedliwych","44":"moc sprawiedliwych","45":"moc sprawiedliwych","46":"sprawność fizyczna","47":"sprawność fizyczna","48":"sprawność fizyczna","49":"sprawność fizyczna","50":"sprawność fizyczna","51":"strażnik boskich mocy","52":"wrodzona szybkość","53":"błogosławiona ochrona","54":"błogosławiona ochrona","55":"błogosławiona ochrona","56":"hart ducha","57":"hart ducha","58":"hart ducha","59":"wrodzona szybkość","60":"wrodzona szybkość","61":"wrodzona szybkość","62":"strażnik boskich mocy","63":"strażnik boskich mocy","64":"strażnik boskich mocy","65":"skupienie na celu","66":"błogosławiona ochrona","67":"błogosławiona ochrona","68":"błogosławiona ochrona","69":"hart ducha","70":"hart ducha","71":"hart ducha","72":"wrodzona szybkość","73":"wrodzona szybkość","74":"wrodzona szybkość","75":"wrodzona szybkość","76":"wrodzona szybkość","77":"hart ducha","78":"hart ducha","79":"hart ducha","80":"krytyczna moc ognia","81":"przetrwanie","82":"krytyczne uderzenie","83":"krytyczna moc ognia","84":"krytyczna moc ognia","85":"krytyczna moc ognia","86":"krytyczna moc ognia","87":"krytyczna moc ognia","88":"krytyczne uderzenie","89":"krytyczne uderzenie","90":"krytyczne uderzenie","91":"krytyczne uderzenie","92":"błogosławiona ochrona","93":"krytyczna moc ognia","94":"krytyczna moc ognia","95":"krytyczna moc ognia","96":"krytyczna moc ognia","97":"błogosławiona ochrona","98":"błogosławiona ochrona","99":"wrodzona szybkość","100":"krytyczne uderzenie","101":"krytyczne uderzenie","102":"krytyczne uderzenie","103":"krytyczne uderzenie","104":"krytyczne uderzenie","105":"skupienie na celu","106":"skupienie na celu","107":"przetrwanie","108":"przetrwanie","109":"przetrwanie","110":"przetrwanie","111":"przetrwanie","112":"przetrwanie","113":"przetrwanie","114":"przetrwanie"},"Tancerz ostrzy":{"25":"błyskawiczny cios","26":"poprawa kondycji","27":"potrójne uderzenie","28":"sprawność fizyczna","29":"poprawa kondycji","30":"poprawa kondycji","31":"poprawa kondycji","32":"sprawność fizyczna","33":"sprawność fizyczna","34":"sprawność fizyczna","35":"sprawność fizyczna","36":"sprawność fizyczna","37":"sprawność fizyczna","38":"poprawa kondycji","39":"poprawa kondycji","40":"zadziorny atak","41":"cios krytyczny","42":"zew krwi","43":"potrójne uderzenie","44":"potrójne uderzenie","45":"potrójne uderzenie","46":"poprawa kondycji","47":"poprawa kondycji","48":"sprawność fizyczna","49":"sprawność fizyczna","50":"krytyczne przyspieszenie","51":"wrodzona szybkość","52":"płynność ruchów","53":"sprawność fizyczna","54":"sprawność fizyczna","55":"sprawność fizyczna","56":"potrójne uderzenie","57":"potrójne uderzenie","58":"potrójne uderzenie","59":"wrodzona szybkość","60":"wrodzona szybkość","61":"wrodzona szybkość","62":"wrodzona szybkość","63":"krytyczne przyspieszenie","64":"krytyczne przyspieszenie","65":"krytyczne przyspieszenie","66":"krytyczne przyspieszenie","67":"zew krwi","68":"zew krwi","69":"zew krwi","70":"zew krwi","71":"płynność ruchów","72":"płynność ruchów","73":"płynność ruchów","74":"potrójne uderzenie","75":"potrójne uderzenie","76":"potrójne uderzenie","77":"wrodzona szybkość","78":"wrodzona szybkość","79":"wrodzona szybkość","80":"przetrwanie","81":"krytyczne cięcie","82":"rispota","83":"zdradzieckie cięcie","84":"uporczywość","85":"wrodzona szybkość","86":"wrodzona szybkość","87":"płynność ruchów","88":"płynność ruchów","89":"krytyczne cięcie","90":"krytyczne cięcie","91":"krytyczne przyspieszenie","92":"krytyczne przyspieszenie","93":"krytyczne przyspieszenie","94":"krytyczne przyspieszenie","95":"rispota","96":"rispota","97":"uporczywość","98":"uporczywość","99":"uporczywość","100":"zdradzieckie cięcie","101":"zdradzieckie cięcie","102":"zdradzieckie cięcie","103":"krytyczne przyspieszenie","104":"zew krwi","105":"płynność ruchów","106":"uporczywość","107":"uporczywość","108":"uporczywość","109":"płynność ruchów","110":"rispota","111":"krytyczne cięcie","112":"płynność ruchów","113":"płynność ruchów","114":"uporczywość"},"Wojownik":{"25":"błyskawiczny atak","26":"wzmocnienie energi","27":"wzmocnienie energi","28":"wzmocnienie energi","29":"wzmocnienie energi","30":"wzmocnienie energi","31":"wzmocnienie energi","32":"sprawność fizyczna","33":"sprawność fizyczna","34":"sprawność fizyczna","35":"wzmocnienie energi","36":"cios krytyczny","37":"twarda głowa","38":"żądza krwi","39":"wzmocnienie energi","40":"wzmocnienie energi","41":"wzmocnienie energi","42":"sprawność fizyczna","43":"sprawność fizyczna","44":"twarda głowa","45":"twarda głowa","46":"twarda głowa","47":"żądza krwi","48":"żądza krwi","49":"sprawność fizyczna","50":"sprawność fizyczna","51":"agresywny atak","52":"wrodzona szybkość","53":"sprawność fizyczna","54":"sprawność fizyczna","55":"sprawność fizyczna","56":"twarda głowa","57":"twarda głowa","58":"wrodzona szybkość","59":"wrodzona szybkość","60":"żądza krwi","61":"żądza krwi","62":"twarda głowa","63":"twarda głowa","64":"żądza krwi","65":"żądza krwi","66":"twarda głowa","67":"twarda głowa","68":"żądza krwi","69":"żądza krwi","70":"żądza krwi","71":"błyskawiczny atak","72":"wrodzona szybkość","73":"wrodzona szybkość","74":"wrodzona szybkość","75":"wrodzona szybkość","76":"wrodzona szybkość","77":"wrodzona szybkość","78":"wrodzona szybkość","79":"mocarna ochrona","80":"mocarna ochrona","81":"wytrzymałość","82":"celny cios","83":"przetrwanie","84":"adaptacja","85":"potężne uderzenie","86":"potężne uderzenie","87":"potężne uderzenie","88":"potężne uderzenie","89":"adaptacja","90":"adaptacja","91":"adaptacja","92":"wytrzymałość","93":"wytrzymałość","94":"celny cios","95":"celny cios","96":"przetrwanie","97":"przetrwanie","98":"potężne uderzenie","99":"potężne uderzenie","100":"potężne uderzenie","101":"wytrzymałość","102":"wytrzymałość","103":"celny cios","104":"adaptacja","105":"adaptacja","106":"adaptacja","107":"potężne uderzenie","108":"potężne uderzenie","109":"potężne uderzenie","110":"wytrzymałość","111":"wytrzymałość","112":"celny cios","113":"adaptacja","114":"adaptacja"}};

    function __adi_normProfName(s){
      try{
        return String(s||'')
          .toLowerCase()
          .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
          .replace(/\s+/g,' ')
          .trim();
      }catch(_){ return String(s||'').toLowerCase().trim(); }
    }
    const __ADI_PROF_ALIASES = (function(){
      const m = new Map();
      const canon = ["Łowca","Mag","Paladyn","Tancerz ostrzy","Tropiciel","Wojownik"];
      for(const c of canon){ m.set(__adi_normProfName(c), c); }
      m.set("tancerz ostrzy","Tancerz ostrzy");
      m.set("tancerz","Tancerz ostrzy");
      m.set("lowca","Łowca");
      m.set("paladyn","Paladyn");
      m.set("mag","Mag");
      m.set("tropiciel","Tropiciel");
      m.set("wojownik","Wojownik");
      return m;
    })();
    function __adi_canonProfName(prof){
      const n = __adi_normProfName(prof);
      return __ADI_PROF_ALIASES.get(n) || prof;
    }


    function __adi_getPlannedSkillForLevel(level, prof){
      try{
        level = Number(level)||0;
        if(!level) return null;
        prof = __adi_canonProfName((prof||'').trim());
        const plan = __ADI_SKILL_PLAN[prof];
        if(!plan) return null;
        return plan[String(level)] || null;
      }catch(_){ return null; }
    }

    async function __adi_allocateSkillOnce(skillName){
      skillName = (skillName||'').trim();
      if(!skillName) return false;

      if(window.__adiSkillTestRunning || window.__adiAutoSkillRunning) return false;
      window.__adiAutoSkillRunning = true;
      try{
        // jeśli walka / blokady UI — poczekaj chwilę
        const tWait = Date.now();
        while(Date.now()-tWait < 6000){
          try{ if(!window.g || !g.battle) break; }catch(_){ break; }
          await __adi_wait(200);
        }

        await __adi_openSkills();
        const boxes = await __adi_waitForSkillsBoxes(8000);
        if(!boxes) return false;

        const t0 = Date.now();
        while(Date.now()-t0 < 7000){
          const learnBtn = __adi_findLearnBtnBySkillName(skillName);
          if(learnBtn){
            try{ learnBtn.click(); }catch(_){}
            // IMPORTANT: wait 1s before closing (prevents white-screen bugs)
            await __adi_wait(1000);
            await __adi_closeSkills();
            return true;
          }
          await __adi_wait(180);
        }
        // nie znaleziono
        try{ await __adi_closeSkills(); }catch(_){}
        return false;
      }finally{
        window.__adiAutoSkillRunning = false;
      }
    }

    // Główna funkcja: na awans -> sprawdź plan (prof + lvl) i rozdaj 1 punkt
    window.__adiHandleAutoSkillsOnLevel = async function(level, force){
      try{
        const enabled = (localStorage.getItem('adi-bot_auto_skills')||'0')==='1';
        if(!enabled && !force) return {ok:false, reason:'disabled'};
        const KEY = 'adi-bot_last_skill_level_handled';
        let last = 0;
        try{ last = parseInt(localStorage.getItem(KEY) || '0', 10) || 0; }catch(_){}
        if(!force){
          if(Number(level)||0 === last) return {ok:false, reason:'already', prof: null};
          try{ localStorage.setItem(KEY, String(Number(level)||0)); }catch(_){}
        }
        const profRaw = __adi_getProfession() || (window.hero ? String(hero.prof) : null) || 'Wojownik';
        const prof = __adi_canonProfName(profRaw);
        const skill = __adi_getPlannedSkillForLevel(level, prof);
        if(!skill) return {ok:false, reason:'no-plan', prof};
        const ok = await __adi_allocateSkillOnce(skill);
        return {ok, prof, skill};
      }catch(e){
        return {ok:false, reason:'error', error:String(e&&e.message||e)};
      }
    };

    })();


    if(!window.__adiToggleBound && toggleBtn){
      window.__adiToggleBound=true;
      toggleBtn.addEventListener("click", ()=>{
        const running=(parseInput===window.adiwilkTestBot.botPI);
        if(running){ parseInput=window.adiwilkTestBot.basePI; localStorage.setItem("adi-bot_enabled","0"); a_goTo(hero.x,hero.y); message("Bot zatrzymany"); toggleBtn.innerText="START"; }
        else { parseInput=window.adiwilkTestBot.botPI; localStorage.setItem("adi-bot_enabled","1"); message("Bot uruchomiony"); toggleBtn.innerText="STOP"; }
      });
    }

    document.addEventListener("keyup", function(e){
      if(e.target.tagName!="INPUT" && e.target.tagName!="TEXTAREA" && e.which==90 && !g.battle){
        const running=(parseInput===window.adiwilkTestBot.botPI);
        if(running){ parseInput=window.adiwilkTestBot.basePI; localStorage.setItem("adi-bot_enabled","0"); a_goTo(hero.x,hero.y); message("Bot zatrzymany"); const btn=document.querySelector("#adi-bot_toggle"); if(btn) btn.innerText="START"; }
        else { parseInput=window.adiwilkTestBot.botPI; localStorage.setItem("adi-bot_enabled","1"); message("Bot uruchomiony"); const btn=document.querySelector("#adi-bot_toggle"); if(btn) btn.innerText="STOP"; }
      }
    });


    // === HARD BLOCK: jeśli elity wyłączone, a walka startuje z elitą (np. grupa/FOW),
    // spróbuj natychmiast uciec i zatrzymaj bota na chwilę.
    function __adi_collectBattleUnits(obj, out, depth){
      if(!obj || depth>6) return;
      if(Array.isArray(obj)){
        for(let i=0;i<obj.length;i++) __adi_collectBattleUnits(obj[i], out, depth+1);
        return;
      }
      if(typeof obj!=="object") return;

      // heurystyka: obiekt "jednostki" często ma id + wt/nick/name/rank/type
      const hasId = ("id" in obj) && (typeof obj.id==="number" || typeof obj.id==="string");
      const hasNpcLike = ("wt" in obj) || ("rank" in obj) || ("nick" in obj) || ("name" in obj) || ("type" in obj);
      if(hasId && hasNpcLike) out.push(obj);

      // przejdź po polach
      for(const k in obj){
        if(!Object.prototype.hasOwnProperty.call(obj,k)) continue;
        const v=obj[k];
        if(v && (typeof v==="object")) __adi_collectBattleUnits(v, out, depth+1);
      }
    }

    function __adi_tryFlee(){
      try{
        // 1) spróbuj requestem
        if(typeof _g==="function"){
          _g("fight&a=flee", function(){});
          _g("fight&a=escape", function(){});
          _g("fight&a=run", function(){});
        }
      }catch(_){}
      try{
        // 2) spróbuj kliknąć przycisk ucieczki (różne UI)
        const btn =
          document.querySelector("#battleFlee") ||
          document.querySelector("#btnFlee") ||
          document.querySelector("[id*='flee' i]") ||
          document.querySelector("[class*='flee' i]") ||
          document.querySelector("[id*='uciek' i]") ||
          document.querySelector("[class*='uciek' i]") ||
          document.querySelector("[id*='escape' i]") ||
          document.querySelector("[class*='escape' i]");
        if(btn) btn.click();
      }catch(_){}
    }

    function __adi_onBattleInit(initObj){
      try{
        if(localStorage.getItem("adi-bot_allow_elite")!=="0") return;

        const units=[];
        __adi_collectBattleUnits(initObj, units, 0);

        let hasElite=false;
        for(let i=0;i<units.length;i++){
          const u=units[i];
          if(isElite(u)){ hasElite=true; break; }
        }

        if(hasElite){
          console.warn("[adi-bot] Wykryto elitę w rozpoczętej walce (grupa/FOW). Próba ucieczki + pauza.");
          // pauza ataków na chwilę, żeby nie wchodzić w pętlę
          __attackBanUntil = Date.now() + 15000;

          // zatrzymaj bota na moment (bez psucia UI)
          try{ localStorage.setItem("adi-bot_enabled","0"); }catch(_){}
          try{ const btn=document.querySelector("#adi-bot_toggle"); if(btn) btn.innerText="START"; }catch(_){}

          __adi_tryFlee();
        }
      }catch(e){}
    }


    var oldBattleMsgAFC=window.battleMsg;
    window.battleMsg=function(c,t){
      var ret=oldBattleMsgAFC.apply(this, arguments);
      if(typeof c==="string" && c.indexOf("winner=")>=0){ var btn=document.querySelector("#battleclose"); if(btn) btn.click(); }
      if(typeof c==="object" && c && c.init===1){
        __lastAttackTime=0; __lastAttackTarget=null;
        try{ __adi_onBattleInit(c); }catch(e){}
      }
      return ret;
    };

    (function(){ var oldFight=window.fight; window.fight=function(f){ if(!f||typeof f!=="object")return; try{ return oldFight.apply(this, arguments);}catch(e){ return; } }; })();

    if(window.$ && $.fn && $.fn.draggable){
      $('#adi-bot_box').draggable({
        stop:()=>{
          let tmp={ x:parseInt(document.querySelector(`#adi-bot_box`).style.left), y:parseInt(document.querySelector(`#adi-bot_box`).style.top) };
          localStorage.setItem(`adi-bot_position`, JSON.stringify(tmp));
          message(`Zapisano pozycję`);
        }
      });
    }
    // --- Handlarze EKWIPUNKU (auto dojazd i podejście pod NPC) ---
    const equipWrap = document.createElement('div'); equipWrap.classList.add('adi-bot_box'); equipWrap.style.marginTop='6px';
    // UI for equipment vendors is not needed (bot auto-selects) -> hide
    equipWrap.style.display='none';
    equipWrap.setAttribute('tip','Testowy moduł: bot dojeżdża do wybranego handlarza ekwipunku używając grafu i staje na wskazanych koordach przed NPC.');
    const equipTitle = document.createElement('div'); equipTitle.textContent='Handlarze mikstur:'; equipTitle.style.margin='4px 0';
    equipWrap.appendChild(equipTitle);

    const EQUIP_VENDORS = {
  'torneg-umbar': { key: 'torneg-umbar', map: 'Torneg', npc: 'Umbar', pos: { x: 42, y: 56 }, stand: { x: 42, y: 57 } },
  'torneg-kowal-alrik': { key: 'torneg-kowal-alrik', map: 'Torneg', npc: 'Kowal Alrik', pos: { x: 59, y: 18 }, stand: { x: 59, y: 19 } },
  'torneg-szagarat-czarny-owca': { key: 'torneg-szagarat-czarny-owca', map: 'Torneg', npc: 'Szagarat Czarny Łowca', pos: { x: 15, y: 35 }, stand: { x: 15, y: 36 } },
  'torneg-wieszczka-sara': { key: 'torneg-wieszczka-sara', map: 'Torneg', npc: 'Wieszczka Sara', pos: { x: 72, y: 56 }, stand: { x: 72, y: 57 } },
  'eder-anaret-eder': { key: 'eder-anaret-eder', map: 'Eder', npc: 'Anaret', pos: { x: 27, y: 50 }, stand: { x: 28, y: 50 } },
  'eder-szmugler-beniamin': { key: 'eder-szmugler-beniamin', map: 'Eder', npc: 'Szmugler Beniamin', pos: { x: 13, y: 55 }, stand: { x: 13, y: 56 } },
  'eder-mroczny-zgrzyt': { key: 'eder-mroczny-zgrzyt', map: 'Eder', npc: 'Mroczny Zgrzyt', pos: { x: 6, y: 4 }, stand: { x: 6, y: 5 } },
  'eder-czarnoksieznik-interbad': { key: 'eder-czarnoksieznik-interbad', map: 'Eder', npc: 'Czarnoksiężnik Interbad', pos: { x: 50, y: 5 }, stand: { x: 50, y: 6 } },
  'ithan-sprzedawca-roan': { key: 'ithan-sprzedawca-roan', map: 'Ithan', npc: 'Sprzedawca Roan', pos: { x: 39, y: 51 }, stand: { x: 39, y: 52 } },
  'ithan-kowal-unil': { key: 'ithan-kowal-unil', map: 'Ithan', npc: 'Kowal Unil', pos: { x: 73, y: 52 }, stand: { x: 73, y: 53 } },
  'ithan-huslin': { key: 'ithan-huslin', map: 'Ithan', npc: 'Huslin', pos: { x: 12, y: 96 }, stand: { x: 12, y: 97 } },
  'ithan-adept-ceranir': { key: 'ithan-adept-ceranir', map: 'Ithan', npc: 'Adept Ceranir', pos: { x: 54, y: 55 }, stand: { x: 54, y: 56 } },
  'lisciaste-rozstaje-szybki-daraker': { key: 'lisciaste-rozstaje-szybki-daraker', map: 'Liściaste Rozstaje', npc: 'Szybki Daraker', pos: { x: 22, y: 58 }, stand: { x: 22, y: 57 } },
  'lisciaste-rozstaje-tropicielka-olekusa': { key: 'lisciaste-rozstaje-tropicielka-olekusa', map: 'Liściaste Rozstaje', npc: 'Tropicielka Olekusa', pos: { x: 2, y: 48 }, stand: { x: 3, y: 48 } },
  'lisciaste-rozstaje-mag-waken': { key: 'lisciaste-rozstaje-mag-waken', map: 'Liściaste Rozstaje', npc: 'Mag Waken', pos: { x: 29, y: 38 }, stand: { x: 29, y: 39 } },
  'lisciaste-rozstaje-handlarka-halidura': { key: 'lisciaste-rozstaje-handlarka-halidura', map: 'Liściaste Rozstaje', npc: 'Handlarka Halidura', pos: { x: 19, y: 53 }, stand: { x: 19, y: 54 } }
};

// === AUTO-GENERATED EQUIP PLAN (from TXT) ===
const EQUIP_AUTO_PLAN = {"Łowca":[{"lvl":20,"vendor":"Umbar","items":["Kask myśliwego","Pierścień sprawności","Amulet rycerza"]},{"lvl":20,"vendor":"Szagarat Czarny Łowca","items":["Wzmocniony naciąg","Krótkie strzały bukowe"]},{"lvl":25,"vendor":"Szagarat Czarny Łowca","items":["Wyrzutnia ostrych strzał","Krótkie strzały klonowe"]},{"lvl":28,"vendor":"Umbar","items":["Stalowa czapka","Wzmocnione podeszwy","Oko fałszu","Malachitowa zawieszka"]},{"lvl":30,"vendor":"Szagarat Czarny Łowca","items":["Drżąca cięciwa","Krótkie strzały wiązowe"]},{"lvl":36,"vendor":"Anaret","items":["Bitewny diabeł","Goblinie cichobiegi","Czaszka gniewu","Szczęście podróżnika"]},{"lvl":36,"vendor":"Mroczny Zgrzyt","items":["Samoobrona łowcy","Ostre strzały zbója"]},{"lvl":41,"vendor":"Mroczny Zgrzyt","items":["Zdobiony łuk odkrywcy","Ostre strzały bandziora","Krucze odzienie"]},{"lvl":41,"vendor":"Anaret","items":["Skórzany hełm leszego"]},{"lvl":46,"vendor":"Mroczny Zgrzyt","items":["Naciąg szaleństwa","Ostre strzały rzezimieszka"]},{"lvl":46,"vendor":"Anaret","items":["Czarna zguba bojownika","Szkiełko w srebrnej oprawie"]},{"lvl":48,"vendor":"Mroczny Zgrzyt","items":["Leśny kaftan trapera"]},{"lvl":50,"vendor":"Huslin","items":["Broń doświadczonego łowcy","Kompletny kołczan łowcy"]},{"lvl":55,"vendor":"Sprzedawca Roan","items":["Osłona młodej harpii","Szelest nieuważnego kobolda","Odznaka młodego asasyna","Zielony wabiciel żądłaków"]},{"lvl":55,"vendor":"Huslin","items":["Skórzana kurta łowcy"]},{"lvl":60,"vendor":"Huslin","items":["Przekleństwo leśnej zwierzyny","Doskonały kołczan łowcy"]},{"lvl":65,"vendor":"Sprzedawca Roan","items":["Czapka łowcy tygrysów","Szczecina gnolla","Symbol spopielenia","Medalion fotosyntezy"]},{"lvl":65,"vendor":"Huslin","items":["Karmazynowy lekki pancerz"]},{"lvl":70,"vendor":"Huslin","items":["Szybkostrzelik myśliwego","Mistrzowski kołczan łowcy"]},{"lvl":75,"vendor":"Huslin","items":["Warstwa czarnej szczeciny"]},{"lvl":75,"vendor":"Sprzedawca Roan","items":["Srebrna kopuła śmiałka","Pozłacana duma rycerza","Zemsta banity","Koralowa narośl","Wonne pąki kniei"]},{"lvl":80,"vendor":"Tropicielka Olekusa","items":["Naciąg łowcy węży","Ostre strzały na ropuchy"]},{"lvl":85,"vendor":"Handlarka Halidura","items":["Prosta wężowa łebka","Ochrona przed igliwiem","Zamszowy chwyt gadziny","Bagienna narośl","Naszyjnik ofiary bagien"]},{"lvl":85,"vendor":"Tropicielka Olekusa","items":["Ukrycie czarnej kobry"]},{"lvl":90,"vendor":"Tropicielka Olekusa","items":["Cięciwa orlich piór","Ostre strzały na węże"]},{"lvl":95,"vendor":"Handlarka Halidura","items":["Świerkowy kask","Mytharskie cholewy","Ochrona z wężowej skóry","Koralowy język żaby","Ozdoba wężowego kochanka"]},{"lvl":95,"vendor":"Tropicielka Olekusa","items":["Kurta doświadczonego łowcy"]},{"lvl":100,"vendor":"Tropicielka Olekusa","items":["Pleciona wyrzutnia konarów","Ostre strzały na aligatory"]}],"Mag":[{"lvl":20,"vendor":"Umbar","items":["Hełm maga bojowego","Koralowy sygnet","Magiczna błyskotka"]},{"lvl":20,"vendor":"Wieszczka Sara","items":["Ognisty kryształ","Piekielna sfera"]},{"lvl":25,"vendor":"Wieszczka Sara","items":["Parząca chłosta","Parzący orb maga"]},{"lvl":28,"vendor":"Umbar","items":["Stalowa czapka","Magiczne trzewiki","Ziarno prawdy","Medalion z turkusem"]},{"lvl":30,"vendor":"Wieszczka Sara","items":["Piekielnik","Zaklęty ogień"]},{"lvl":36,"vendor":"Anaret","items":["Wzmocniona ochrona maga","Obuwie z magiczną powłoką","Czaszka chciwości","Los tułacza"]},{"lvl":36,"vendor":"Czarnoksiężnik Interbad","items":["Ścieżka wiecznego ognia","Szklana sfera płomieni"]},{"lvl":41,"vendor":"Czarnoksiężnik Interbad","items":["Czarcia pochodnia","Żar w kościanej oprawie","Płaszcz wróżbity amatora"]},{"lvl":41,"vendor":"Anaret","items":["Wizja trzeciego oka"]},{"lvl":46,"vendor":"Czarnoksiężnik Interbad","items":["Igneum Daemonium","Złoty cielec"]},{"lvl":46,"vendor":"Anaret","items":["Pierścień żądzy krwi","Gwiazda nadziei"]},{"lvl":48,"vendor":"Czarnoksiężnik Interbad","items":["Cyklamenowa peleryna"]},{"lvl":50,"vendor":"Adept Ceranir","items":["Iskra piromana","Żar z niebios"]},{"lvl":55,"vendor":"Sprzedawca Roan","items":["Hełm łowcy koboldów","Obuwie pokryte pajęczyną","Pierścień ulotnej myśli","Miododajny naszyjnik maga"]},{"lvl":55,"vendor":"Adept Ceranir","items":["Strój szlachetnego czarodzieja"]},{"lvl":60,"vendor":"Adept Ceranir","items":["Kryształy erupcji","Piekielny podarunek"]},{"lvl":65,"vendor":"Sprzedawca Roan","items":["Magiczne wsparcie demiliszy","Szczecina gnolla","Kryształowe iskry","Chabrowa zawieszka"]},{"lvl":65,"vendor":"Adept Ceranir","items":["Surdut sztukmistrza"]},{"lvl":70,"vendor":"Adept Ceranir","items":["Przewodnik magmowych świątyń","Serce wygasłego wulkanu"]},{"lvl":75,"vendor":"Adept Ceranir","items":["Splot magicznych nici"]},{"lvl":75,"vendor":"Sprzedawca Roan","items":["Srebrna kopuła śmiałka","Cholewy czarnoksiężnika","Splot ametystowych nici","Sygnet wyniosłości","Odurzająca woń hortensji"]},{"lvl":80,"vendor":"Mag Waken","items":["Płomień cierpiącej duszy","Wygotowany kryształ"]},{"lvl":85,"vendor":"Handlarka Halidura","items":["Hełm leśnego licha","Fikuśne kamasze maga","Wytwór syczącego rzemieślnika","Iglasty kryształ","Amulet przemiany w gada"]},{"lvl":85,"vendor":"Mag Waken","items":["Peleryna z metalową wstawką"]},{"lvl":90,"vendor":"Mag Waken","items":["Miotacz szeptanych zaklęć","Parzący knebel"]},{"lvl":95,"vendor":"Handlarka Halidura","items":["Podarunek Introprodara","Mytharskie cholewy","Wytwór syczącego rzemieślnika","Jaspisowy język węża","Smoczy wisior"]},{"lvl":95,"vendor":"Mag Waken","items":["Szata doświadczonego maga"]},{"lvl":100,"vendor":"Mag Waken","items":["Skarb ifryta","Serce nienawiści"]}],"Paladyn":[{"lvl":20,"vendor":"Umbar","items":["Rogi odkrywcy","Ozdoba wojaka","Magiczna błyskotka"]},{"lvl":20,"vendor":"Kowal Alrik","items":["Rozgrzana stal paladyna","Prosta tarcza paladyna"]},{"lvl":25,"vendor":"Kowal Alrik","items":["Ognista fala","Zbrukana osłona"]},{"lvl":28,"vendor":"Umbar","items":["Stalowa czapka","Magiczne trzewiki","Ziarno prawdy","Kwiecie ametystu"]},{"lvl":30,"vendor":"Kowal Alrik","items":["Magmowe ostrze","Ochrona demonów"]},{"lvl":36,"vendor":"Anaret","items":["Wzmocniona ochrona maga","Kamasze odważnego rycerza","Czaszka chciwości","Los tułacza"]},{"lvl":36,"vendor":"Szmugler Beniamin","items":["Ostrze topiące skały","Wsparcie złego ducha"]},{"lvl":41,"vendor":"Szmugler Beniamin","items":["Pałasz długiej agonii","Ochrona trzeciego kręgu","Gruby pikowany bezrękawnik"]},{"lvl":41,"vendor":"Anaret","items":["Hełm byczej siły"]},{"lvl":46,"vendor":"Szmugler Beniamin","items":["Skwierczący szpon demona","Zwęglone rogi szakala"]},{"lvl":46,"vendor":"Anaret","items":["Pierścień żądzy krwi","Złote płatki władzy"]},{"lvl":48,"vendor":"Szmugler Beniamin","items":["Pancerz szabrownika"]},{"lvl":50,"vendor":"Kowal Unil","items":["Skwar","Oranżowa osłona paladyna"]},{"lvl":55,"vendor":"Sprzedawca Roan","items":["Hełm łowcy koboldów","Szara piechota","Odwet wojownika","Miododajny naszyjnik maga"]},{"lvl":55,"vendor":"Kowal Unil","items":["Pierś z tajemniczym symbolem"]},{"lvl":60,"vendor":"Kowal Unil","items":["Język żaru i ognia","Tarcza nocy i dni"]},{"lvl":65,"vendor":"Sprzedawca Roan","items":["Kask pogromcy gnolli","Szczecina gnolla","Kryształowe iskry","Chabrowa zawieszka"]},{"lvl":65,"vendor":"Kowal Unil","items":["Odzienie znawcy zaklęć"]},{"lvl":70,"vendor":"Kowal Unil","items":["Przestroga żywiołaka","Blokada herosa"]},{"lvl":75,"vendor":"Kowal Unil","items":["Skórzany strój herosa"]},{"lvl":75,"vendor":"Sprzedawca Roan","items":["Srebrna kopuła śmiałka","Cholewy czarnoksiężnika","Splot ametystowych nici","Pycha Wernoradu","Odurzająca woń hortensji"]},{"lvl":80,"vendor":"Szybki Daraker","items":["Płomienny sejmitar","Ochrona gadziego odkrywcy"]},{"lvl":85,"vendor":"Handlarka Halidura","items":["Hełm leśnego licha","Smocze podeszwy","Zamszowy chwyt gadziny","Iglasty kryształ","Gadzia kolia"]},{"lvl":85,"vendor":"Szybki Daraker","items":["Kolczuga smoczej łuski"]},{"lvl":90,"vendor":"Szybki Daraker","items":["Wyszczerbione ostrze pożogi","Tarcza z fiolką antidotum"]},{"lvl":95,"vendor":"Handlarka Halidura","items":["Okazałe rogi centaura","Mytharskie cholewy","Wytwór syczącego rzemieślnika","Rubinowy język kameleona","Smoczy wisior"]},{"lvl":95,"vendor":"Szybki Daraker","items":["Puszka doświadczonego paladyna"]},{"lvl":100,"vendor":"Szybki Daraker","items":["Stal rozgrzana smoczym oddechem","Ochrona smoczych pazurów"]}],"Tancerz ostrzy":[{"lvl":20,"vendor":"Umbar","items":["Kask myśliwego","Pierścień sprawności","Amulet rycerza"]},{"lvl":20,"vendor":"Kowal Alrik","items":["Lekkie ostrze tancerza","Sztylet młodego rzezimieszka"]},{"lvl":25,"vendor":"Kowal Alrik","items":["Pogromca szkieletów","Złota rysa"]},{"lvl":28,"vendor":"Umbar","items":["Stalowa czapka","Wzmocnione podeszwy","Oko fałszu","Malachitowa zawieszka"]},{"lvl":30,"vendor":"Kowal Alrik","items":["Czarnoostrze","Kordzik skrytobójcy"]},{"lvl":36,"vendor":"Anaret","items":["Bitewny diabeł","Goblinie cichobiegi","Czaszka pychy","Szczęście podróżnika"]},{"lvl":36,"vendor":"Szmugler Beniamin","items":["Mroczny kordelas","Podręczne ostrze strażnika"]},{"lvl":41,"vendor":"Szmugler Beniamin","items":["Miecz sprawiedliwości","Zniszczona pamiątka","Skórzana kamizela tancerza"]},{"lvl":41,"vendor":"Anaret","items":["Skórzany hełm leszego"]},{"lvl":46,"vendor":"Szmugler Beniamin","items":["Przeklęta broń gwardzisty","Sztylet wspinaczkowy"]},{"lvl":46,"vendor":"Anaret","items":["Czarna zguba bojownika","Szkiełko w srebrnej oprawie"]},{"lvl":48,"vendor":"Szmugler Beniamin","items":["Kolczuga skrytobójcy amatora"]},{"lvl":50,"vendor":"Kowal Unil","items":["Pałasz honoru i chwały","Sztylet okrętowy"]},{"lvl":55,"vendor":"Sprzedawca Roan","items":["Osłona młodej harpii","Szelest nieuważnego kobolda","Odznaka młodego asasyna","Zielony wabiciel żądłaków"]},{"lvl":55,"vendor":"Kowal Unil","items":["Strój ze znakiem śmierci"]},{"lvl":60,"vendor":"Kowal Unil","items":["Ekwipunek szlachcica","Duma rzeźnika"]},{"lvl":65,"vendor":"Sprzedawca Roan","items":["Czapka łowcy tygrysów","Szczecina gnolla","Symbol spopielenia","Kwiecisty popis jubilera"]},{"lvl":65,"vendor":"Kowal Unil","items":["Klata pulsujących świateł"]},{"lvl":70,"vendor":"Kowal Unil","items":["Szeroki metal strażnika","Stalowy płatek"]},{"lvl":75,"vendor":"Kowal Unil","items":["Pancerz zwycięzcy turnieju"]},{"lvl":75,"vendor":"Sprzedawca Roan","items":["Srebrna kopuła śmiałka","Pozłacana duma rycerza","Zakurzone wojenne rękawice","Koralowa narośl","Wonne pąki kniei"]},{"lvl":80,"vendor":"Szybki Daraker","items":["Podręczna mytharska maczeta","Ostrze grzechotnika"]},{"lvl":85,"vendor":"Handlarka Halidura","items":["Prosta wężowa łebka","Ochrona przed igliwiem","Zamszowy chwyt gadziny","Bagienna narośl","Naszyjnik ofiary bagien"]},{"lvl":85,"vendor":"Szybki Daraker","items":["Blaszane oko bogów"]},{"lvl":90,"vendor":"Szybki Daraker","items":["Piła tnąca konary","Żelazna strzałka"]},{"lvl":95,"vendor":"Handlarka Halidura","items":["Świerkowy kask","Mytharskie cholewy","Ochrona z wężowej skóry","Koralowy język żaby","Ozdoba wężowego kochanka"]},{"lvl":95,"vendor":"Szybki Daraker","items":["Zbroja doświadczonego tancerza"]},{"lvl":100,"vendor":"Szybki Daraker","items":["Wężowy urwiłeb","Haratanie wężowego ogona"]}],"Tropiciel":[{"lvl":20,"vendor":"Umbar","items":["Hełm maga bojowego","Pierścień sprawności","Magiczna błyskotka"]},{"lvl":20,"vendor":"Szagarat Czarny Łowca","items":["Płomienna cięciwa","Iskrzące strzały bukowe"]},{"lvl":25,"vendor":"Szagarat Czarny Łowca","items":["Łuk dotkliwych poparzeń","Iskrzące strzały klonowe"]},{"lvl":28,"vendor":"Umbar","items":["Stalowa czapka","Magiczne trzewiki","Ziarno prawdy","Medalion z turkusem"]},{"lvl":30,"vendor":"Szagarat Czarny Łowca","items":["Ogniste skrzydła","Iskrzące strzały wiązowe"]},{"lvl":36,"vendor":"Anaret","items":["Wzmocniona ochrona maga","Obuwie z magiczną powłoką","Czaszka gniewu","Los tułacza"]},{"lvl":36,"vendor":"Mroczny Zgrzyt","items":["Objęcie młodego smoka","Gorące strzały zbója"]},{"lvl":41,"vendor":"Mroczny Zgrzyt","items":["Piekielna tortura","Gorące strzały bandziora","Płaszcz trapera"]},{"lvl":41,"vendor":"Anaret","items":["Wizja trzeciego oka"]},{"lvl":46,"vendor":"Mroczny Zgrzyt","items":["Manotrówczy naciąg tropiciela","Gorące strzały rzezimieszka"]},{"lvl":46,"vendor":"Anaret","items":["Czarna zguba bojownika","Gwiazda nadziei"]},{"lvl":48,"vendor":"Mroczny Zgrzyt","items":["Złota pierś myśliwego"]},{"lvl":50,"vendor":"Huslin","items":["Skwierczący naciąg","Kompletny kołczan tropiciela"]},{"lvl":55,"vendor":"Sprzedawca Roan","items":["Hełm łowcy koboldów","Obuwie pokryte pajęczyną","Pierścień ulotnej myśli","Miododajny naszyjnik maga"]},{"lvl":55,"vendor":"Huslin","items":["Odzienie złotych pyłków"]},{"lvl":60,"vendor":"Huslin","items":["Ogniste szczypce","Doskonały kołczan tropiciela"]},{"lvl":65,"vendor":"Sprzedawca Roan","items":["Magiczne wsparcie demiliszy","Szczecina gnolla","Kryształowe iskry","Medalion fotosyntezy"]},{"lvl":65,"vendor":"Huslin","items":["Płaszcz tropiciela z wyżyn"]},{"lvl":70,"vendor":"Huslin","items":["Soczysty łuk anemonów","Mistrzowski kołczan tropiciela"]},{"lvl":75,"vendor":"Huslin","items":["Opieka leśnej istoty"]},{"lvl":75,"vendor":"Sprzedawca Roan","items":["Srebrna kopuła śmiałka","Cholewy czarnoksiężnika","Zemsta banity","Sygnet wyniosłości","Odurzająca woń hortensji"]},{"lvl":80,"vendor":"Tropicielka Olekusa","items":["Wyrzutnia rozgotowanych żab","Płonące strzały na ropuchy"]},{"lvl":85,"vendor":"Handlarka Halidura","items":["Hełm leśnego licha","Fikuśne kamasze maga","Zamszowy chwyt gadziny","Iglasty kryształ","Amulet przemiany w gada"]},{"lvl":85,"vendor":"Tropicielka Olekusa","items":["Zbożowy kamuflaż węża"]},{"lvl":90,"vendor":"Tropicielka Olekusa","items":["Gniewna cięciwa z Mythar","Płonące strzały na węże"]},{"lvl":95,"vendor":"Handlarka Halidura","items":["Podarunek Introprodara","Mytharskie cholewy","Wytwór syczącego rzemieślnika","Jaspisowy język węża","Smoczy wisior"]},{"lvl":95,"vendor":"Tropicielka Olekusa","items":["Odzienie doświadczonego tropiciela"]},{"lvl":100,"vendor":"Tropicielka Olekusa","items":["Zew Introprodara","Płonące strzały na aligatory"]}],"Wojownik":[{"lvl":20,"vendor":"Umbar","items":["Rogi odkrywcy","Ozdoba wojaka","Amulet rycerza"]},{"lvl":20,"vendor":"Kowal Alrik","items":["Uniwersalne ostrze","Tarcza początkującego"]},{"lvl":25,"vendor":"Kowal Alrik","items":["Kątownik","Lepsza ochrona wojaka"]},{"lvl":28,"vendor":"Umbar","items":["Stalowa czapka","Wzmocnione podeszwy","Oko fałszu","Kwiecie ametystu"]},{"lvl":30,"vendor":"Kowal Alrik","items":["Smukły miecz rycerza","Rogi bawoła"]},{"lvl":36,"vendor":"Anaret","items":["Bitewny diabeł","Kamasze odważnego rycerza","Czaszka pychy","Szczęście podróżnika"]},{"lvl":36,"vendor":"Szmugler Beniamin","items":["Falchion podróżnika","Tarcza obita skórą"]},{"lvl":41,"vendor":"Szmugler Beniamin","items":["Kliga ostrych zębów","Zakrwawiona tafla","Bojowy serdak"]},{"lvl":41,"vendor":"Anaret","items":["Hełm byczej siły"]},{"lvl":46,"vendor":"Szmugler Beniamin","items":["Ostrze dekapitacji","Zderzak"]},{"lvl":46,"vendor":"Anaret","items":["Czarna zguba bojownika","Szkiełko w srebrnej oprawie"]},{"lvl":48,"vendor":"Szmugler Beniamin","items":["Odzienie ze skóry dzika"]},{"lvl":50,"vendor":"Kowal Unil","items":["Eleganckie ostrze wojownika","Kolczasta osłona"]},{"lvl":55,"vendor":"Sprzedawca Roan","items":["Osłona młodej harpii","Szara piechota","Odwet wojownika","Zielony wabiciel żądłaków"]},{"lvl":55,"vendor":"Kowal Unil","items":["Wytwór miejscowej szwaczki"]},{"lvl":60,"vendor":"Kowal Unil","items":["Stalowy zawijas","Tarcza dawnej chwały"]},{"lvl":65,"vendor":"Sprzedawca Roan","items":["Kask pogromcy gnolli","Szczecina gnolla","Symbol spopielenia","Kwiecisty popis jubilera"]},{"lvl":65,"vendor":"Kowal Unil","items":["Wzmocniona ochrona żeber"]},{"lvl":70,"vendor":"Kowal Unil","items":["Wzmocniona ochrona żeber","Patronat demona"]},{"lvl":75,"vendor":"Kowal Unil","items":["Wytworna kamizela wojownika"]},{"lvl":75,"vendor":"Sprzedawca Roan","items":["Srebrna kopuła śmiałka","Pozłacana duma rycerza","Zakurzone wojenne rękawice","Pycha Wernoradu","Wonne pąki kniei"]},{"lvl":80,"vendor":"Szybki Daraker","items":["Falchion żabiej czaszki","Iglasta osłona"]},{"lvl":85,"vendor":"Handlarka Halidura","items":["Prosta wężowa łebka","Smocze podeszwy","Zamszowy chwyt gadziny","Bagienna narośl","Gadzia kolia"]},{"lvl":85,"vendor":"Szybki Daraker","items":["Filcowa opieka gadów"]},{"lvl":90,"vendor":"Szybki Daraker","items":["Czarna strzała wojownika","Tarcza połowicznej przemiany"]},{"lvl":95,"vendor":"Handlarka Halidura","items":["Okazałe rogi centaura","Mytharskie cholewy","Ochrona z wężowej skóry","Rubinowy język kameleona","Ozdoba wężowego kochanka"]},{"lvl":95,"vendor":"Szybki Daraker","items":["Puszka doświadczonego paladyna"]},{"lvl":100,"vendor":"Szybki Daraker","items":["Cięcie biesa","Trofeum centaura"]}]};



    function getSelectedEquipVendorKey(){ try{ return localStorage.getItem('adi-bot_equip_vendor') || 'auto'; }catch(_ ){ return 'auto'; } }
    function setSelectedEquipVendor(k){ try{ localStorage.setItem('adi-bot_equip_vendor', k); }catch(_ ){} }
    function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim(); }
    function eqStepsToMap(name){ return stepsToMap? stepsToMap(name): 99999; }
    function findNearestEquipVendor(){
      try{ const cur = norm(map?.name||''); let best=null, bestSteps=Infinity;
        for(const k in EQUIP_VENDORS){ const v=EQUIP_VENDORS[k]; if(norm(v.map)===cur) return v; const s=eqStepsToMap(v.map); if(s<bestSteps){bestSteps=s; best=v;} }
        return best || Object.values(EQUIP_VENDORS)[0];
      }catch(_ ){ return Object.values(EQUIP_VENDORS)[0]; }
    }
    function getSelectedEquipVendor(){
      const k=getSelectedEquipVendorKey();
      if(k==='auto') return findNearestEquipVendor();
      return EQUIP_VENDORS[k] || findNearestEquipVendor();
    }

    const equipSel = document.createElement('select'); equipSel.id='adi-bot_equip_vendor'; equipSel.className='adi-bot_inputs';
    (function(){var o=document.createElement('option'); o.value='auto'; o.textContent='Auto (najbliższy – graf)'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='torneg-umbar'; o.textContent='Torneg – Umbar'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='torneg-kowal-alrik'; o.textContent='Torneg – Kowal Alrik'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='torneg-szagarat-czarny-owca'; o.textContent='Torneg – Szagarat Czarny Łowca'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='torneg-wieszczka-sara'; o.textContent='Torneg – Wieszczka Sara'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='eder-anaret-eder'; o.textContent='Eder – Anaret'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='eder-szmugler-beniamin'; o.textContent='Eder – Szmugler Beniamin'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='eder-mroczny-zgrzyt'; o.textContent='Eder – Mroczny Zgrzyt'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='eder-czarnoksieznik-interbad'; o.textContent='Eder – Czarnoksiężnik Interbad'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='ithan-sprzedawca-roan'; o.textContent='Ithan – Sprzedawca Roan'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='ithan-kowal-unil'; o.textContent='Ithan – Kowal Unil'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='ithan-huslin'; o.textContent='Ithan – Huslin'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='ithan-adept-ceranir'; o.textContent='Ithan – Adept Ceranir'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='lisciaste-rozstaje-szybki-daraker'; o.textContent='Liściaste Rozstaje – Szybki Daraker'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='lisciaste-rozstaje-tropicielka-olekusa'; o.textContent='Liściaste Rozstaje – Tropicielka Olekusa'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='lisciaste-rozstaje-mag-waken'; o.textContent='Liściaste Rozstaje – Mag Waken'; equipSel.appendChild(o);})();
    (function(){var o=document.createElement('option'); o.value='lisciaste-rozstaje-handlarka-halidura'; o.textContent='Liściaste Rozstaje – Handlarka Halidura'; equipSel.appendChild(o);})();
    try{ equipSel.value = getSelectedEquipVendorKey(); }catch(_ ){}
    equipSel.addEventListener('change', ()=>{ setSelectedEquipVendor(equipSel.value); message('Zapisano wybór handlarza ekwipunku.'); });
    equipWrap.appendChild(equipSel);

    const equipBtnRow = document.createElement('div'); equipBtnRow.style.display='grid'; equipBtnRow.style.gridTemplateColumns='1fr auto'; equipBtnRow.style.gap='6px'; equipBtnRow.style.marginTop='6px';
    const equipInfo = document.createElement('div'); equipInfo.textContent = '—'; equipInfo.style.fontSize='12px'; equipInfo.style.color='#bbb';
    const equipBtn = document.createElement('button'); equipBtn.textContent='Kup ekwipunek (test: podejdź)'; equipBtn.className='adi-bot_btn';

    // === TEST WBICIA LVL (dowolny) ===
const equipTestLvl = document.createElement('input');
equipTestLvl.type = 'number';
equipTestLvl.min = '1';
equipTestLvl.max = '300';
equipTestLvl.step = '1';
equipTestLvl.id = 'adi-bot_equip_test_lvl';
equipTestLvl.className = 'adi-bot_inputs';
equipTestLvl.placeholder = 'Test lvl (np. 20)';

// przywróć ostatnio wpisany lvl
try{
  const saved = localStorage.getItem('adi-bot_equip_test_lvl');
  if(saved) equipTestLvl.value = saved;
}catch(_){}

equipTestLvl.addEventListener('change', ()=>{
  try{ localStorage.setItem('adi-bot_equip_test_lvl', String(equipTestLvl.value||'')); }catch(_){}
});

const equipTestBtn = document.createElement('button');
equipTestBtn.id = 'adi-bot_equip_test_btn';
equipTestBtn.textContent = 'Testuj wbicie lvla';
equipTestBtn.className = 'adi-bot_btn';

equipTestBtn.addEventListener('click', ()=>{
  try{
    const lvl = Math.max(1, parseInt(equipTestLvl.value || '0', 10) || 0);
    if(!lvl){
      eqSetInfo('Podaj lvl do testu (np. 20).', false);
      return;
    }
    const ok = window.__adiTriggerEquipLevelUp(lvl);
    eqSetInfo(ok ? `Test: symuluję awans na ${lvl} lvl.` : `Brak planu zakupów na ${lvl} lvl (dla tej profesji).`, ok);
  }catch(e){
    eqSetInfo('Błąd testu: ' + (e?.message || e), false);
  }
});

// ważne: dodajemy do UI
equipBtnRow.appendChild(equipInfo);
equipBtnRow.appendChild(equipBtn);
equipBtnRow.appendChild(equipTestLvl);
equipBtnRow.appendChild(equipTestBtn);
// przenieś wiersz testowy do zakładki TEST (żeby nie znikał razem z ukrytym modułem handlarzy)
try{
  var __tp = (typeof tabTest!=='undefined' && tabTest) ? tabTest : document.querySelector('#adi-tab-test');
  if(__tp){ __tp.appendChild(equipBtnRow); }
  else { equipWrap.appendChild(equipBtnRow); }
}catch(_){ equipWrap.appendChild(equipBtnRow); }


    function eqSetInfo(msg, ok){ equipInfo.textContent=msg; equipInfo.style.color = ok?'#3cb371':'#e57373'; }

    // zadanie/dojazd
    const EQUIP_TASK_KEY='adi-bot_equip_task';
    function saveEquipTask(t){ try{ localStorage.setItem(EQUIP_TASK_KEY, JSON.stringify(t)); }catch(_ ){} }
    function loadEquipTask(){ try{ const r=localStorage.getItem(EQUIP_TASK_KEY); return r? JSON.parse(r): null; }catch(_ ){ return null; } }
    function clearEquipTask(){ try{ localStorage.removeItem(EQUIP_TASK_KEY); }catch(_ ){} }

    function eqFindNpcByName(name){
      const all = Array.from(document.querySelectorAll('div.npc[ctip="t_npc"]'));
      const needle = norm(name);
      for(const el of all){
        const t = (el.getAttribute('tip')||'').replace(/<[^>]*>/g,'');
        if(norm(t).includes(needle)) return el;
      }
      return null;
    }
    function eqShopOpen(){ return document.querySelector('.item[id^="item"], .shop, #shop, #npcshop'); }
    function eqClick(el){ try{ el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); }catch(_ ){} try{ el.click(); }catch(_ ){} try{ el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); }catch(_ ){} }

    function startEquipFlow(){
      let timer = window.__adiEquipTimer;
      if(timer) clearInterval(timer);
      window.__adiEquipTimer = setInterval(()=>{
        const task = loadEquipTask(); if(!task) return clearInterval(window.__adiEquipTimer);
        // 1) Do miasta
        if(task.stage==='toCity'){
          if(norm(map?.name||'')===norm(task.map)){ task.stage='toStand'; saveEquipTask(task); }
          else{
          setTempTarget(task.map);
          eqSetInfo('Wyznaczam trasę do '+task.map+'...', true);
          // Move one step of the route here (do not depend on main bot loop)
          try{
            var step = (typeof followGraphTo==='function') ? followGraphTo(task.map) : null;
            if(step && typeof step.x!=='undefined') a_goTo(step.x, step.y);
          }catch(_){}
        }
          return;
        }
        // 2) Podejście pod NPC
        if(task.stage==='toStand'){
          const {x,y} = task.stand;
          if(hero?.x===x && hero?.y===y){ task.stage='toNpc'; saveEquipTask(task); return; }
          a_goTo(x,y); return;
        }
        // 3) Klik NPC i (na razie) stop
        if(task.stage==='toNpc'){
          const npc = eqFindNpcByName(task.npc);
          if(npc){
            eqClick(npc);
            task.stage='dialog'; saveEquipTask(task);
            eqSetInfo('Jestem u '+task.npc+' ('+task.map+'). Otwieram „Pokaż towary”…', true);
          } else {
            eqSetInfo('Szukam NPC: '+task.npc+'...', false);
          }
          return;
        }
        // 4) Klik w „Pokaż towary” / „Sklep”
        if(task.stage==='dialog'){
          if(document.querySelector('.dialog, #dialog, .npcDialog, #npcDialog, .dsc')){
            if(typeof apOpenDialogShop==='function') apOpenDialogShop();
            task.stage='shop'; saveEquipTask(task);
          } else {
            const npc = eqFindNpcByName(task.npc); if(npc) eqClick(npc);
          }
          return;
        }

        // 5) Poczekaj aż sklep się otworzy
        if(task.stage==='shop'){
          if(eqShopOpen()){
            if(!task.started){
              task.started = true; saveEquipTask(task);
              // if items specified, buy them sequentially
              const items = (task.items||[]).slice();
              if(items.length){
                let i=0;
                function __buyNext(){
                  if(i>=items.length){
                    setTimeout(()=>{
                      const acceptBtn = document.querySelector('#shop_accept'); if(acceptBtn) acceptBtn.click();
                      setTimeout(()=>{ const closeBtn = document.querySelector('#shop_close'); if(closeBtn) closeBtn.click(); }, 200);
                      eqSetInfo('Zakupy u '+task.npc+' zakończone.', true);
                      // przejdź do etapu zakładania (z retry), nie czyść taska od razu
                      task.stage = 'equip';
                      task.equipTries = 0;
                      saveEquipTask(task);
                    }, 300);
                    return;
                  }
                  apBuyByName(items[i], 1);
                  i++;
                  setTimeout(__buyNext, 500);
                }
                __buyNext();
              }else{
                eqSetInfo('Sklep otwarty u '+task.npc+'. (brak listy zakupów)', true);
                clearEquipTask(); setTempTarget(null); clearInterval(window.__adiEquipTimer);
              }
            }
          } else {
            if(typeof apOpenDialogShop==='function') apOpenDialogShop();
          }
          return;
        }

        // 6) Zakładanie zakupionego ekwipunku (jednorazowo + krótka weryfikacja)
if(task.stage==='equip'){
  const names = Array.from(new Set((task.items||[]).map(x=>String(x||'').trim()).filter(Boolean)));

  // Nie spamujemy – uruchamiamy sekwencję tylko raz po zakupie
  if(!task.equipStarted){
    task.equipStarted = true;
    saveEquipTask(task);

    // daj chwilę na to, żeby itemy „weszły” do ekwipunku po zakupie
    setTimeout(()=>{
      try{ window.__adiEquipSeq(names); }catch(_){}
    }, 600);

    // po krótkiej chwili kończymy task (unikamy spamowania komunikatem "już wyekwipowany")
    setTimeout(()=>{
      try{
        eqSetInfo('Ekwipunek założony / sprawdzony. Wracam do expowiska.', true);
        clearEquipTask();
        setTempTarget(null);
        clearInterval(window.__adiEquipTimer);
      }catch(_){}
    }, 2200);
  }
  return;
}
}, 400);
    }



// ===== ABORT EQUIP FLOW ON DEATH (prevents resuming stale equip tasks after respawn) =====
(function(){
  let wasDead = false;
  setInterval(() => {
    try{
      const deadNow = !!(window.g && g.dead);

      // alive -> dead
      if(deadNow && !wasDead){
        wasDead = true;
        console.warn('[adi-bot] Śmierć wykryta -> abort equip/buy tasków');
        try{ localStorage.removeItem('adi-bot_equip_task'); }catch(_){ }
        try{ localStorage.setItem('adi-bot_equip_task_queue', JSON.stringify([])); }catch(_){ }
        try{ setTempTarget(null); }catch(_){ }
        try{ if(window.__adiEquipTimer) clearInterval(window.__adiEquipTimer); }catch(_){ }
      }

      // dead -> alive
      if(!deadNow && wasDead){
        wasDead = false;
      }
    }catch(_){ }
  }, 500);
})();
    equipBtn.addEventListener('click', ()=>{
      const v = getSelectedEquipVendor();
      const task = { kind:'equip', stage:'toCity', map: v.map, npc: v.npc, stand: v.stand, level: Number(hero?.lvl)||0, createdAt: Date.now() };
      saveEquipTask(task);
      setTempTarget(v.map);
      startEquipFlow();
      eqSetInfo('Wyznaczam trasę do '+v.map+'...', true);
      const btn=document.querySelector('#adi-bot_toggle'); if(btn && btn.innerText==='START') btn.click();
    });


// === AUTO-BUY EQUIPMENT ON LEVEL-UP ===

// Utility: normalize
function __adi_norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim(); }

// Read profession from #nick[tip] or hero object

function __adi_getProfession(){
  // 1) read from #nick[tip] (full name)
  try{
    const nick = document.querySelector('#nick');
    const tip = nick ? (nick.getAttribute('tip')||'') : '';
    const m = tip.match(/Profesja:\s*([^<]+)/i);
    if(m){ return m[1].trim(); }
  }catch(_){}
  // 2) fallback to hero.prof short code and map to full
  try{
    const v = (window.hero && hero.prof) ? String(hero.prof) : '';
    const s = (v||'').toLowerCase().trim();
    const map = { 't':'Tropiciel', 'm':'Mag', 'w':'Wojownik', 'p':'Paladyn', 'l':'Łowca', 'to':'Tancerz ostrzy', 'ta':'Tancerz ostrzy' };
    if(map[s]) return map[s];
    // some builds may expose polish initials like 'ł': normalize to 'l'
    if(s && map[s.normalize('NFD').replace(/\p{Diacritic}/gu,'')]) return map[s.normalize('NFD').replace(/\p{Diacritic}/gu,'')];
  }catch(_){}
  return null;
}

// Queue storage
const EQUIP_TASK_QUEUE_KEY='adi-bot_equip_task_queue';
function __adi_loadEquipQueue(){ try{ const r=localStorage.getItem(EQUIP_TASK_QUEUE_KEY); return r? JSON.parse(r): []; }catch(_){ return []; } }
function __adi_saveEquipQueue(a){ try{ localStorage.setItem(EQUIP_TASK_QUEUE_KEY, JSON.stringify(a||[])); }catch(_ ){} }

// Extend clear to run next queued task
const __adi__origClearEquipTask = clearEquipTask;
clearEquipTask = function(){
  try{ __adi__origClearEquipTask(); }catch(_){}
  const q = __adi_loadEquipQueue();
  if(q.length){
    const next = q.shift(); __adi_saveEquipQueue(q);
    saveEquipTask(next);
    setTimeout(startEquipFlow, 250);
  }
};

// Build tasks for a given L and profession
function __adi_buildEquipTasksFor(level, profession){
  try{
    const plan = EQUIP_AUTO_PLAN && EQUIP_AUTO_PLAN[profession];
    if(!plan || !plan.length) return [];
    // entries with exact lvl
    const entries = plan.filter(e=>Number(e.lvl)===Number(level));
    // group by vendor
    const groups = {};
    for(const e of entries){
      const vend = e.vendor.trim();
      if(!groups[vend]) groups[vend] = new Set();
      for(const it of (e.items||[])) groups[vend].add(it);
    }
    // convert to tasks: find vendor info from EQUIP_VENDORS by npc match, pick nearest
    const tasks=[];
    for(const vend in groups){
      // candidates
      const cand = Object.values(EQUIP_VENDORS).filter(v=>__adi_norm(v.npc).includes(__adi_norm(vend)));
      let chosen = cand[0] || findNearestEquipVendor();
      if(cand.length>1){
        // choose by steps to map
        let best = cand[0], bestSteps = eqStepsToMap(cand[0].map);
        for(const v of cand){ const s=eqStepsToMap(v.map); if(s<bestSteps){ best=v; bestSteps=s; } }
        chosen = best;
      }
      tasks.push({
        kind:'equip',
        stage:'toCity',
        map: chosen.map,
        npc: chosen.npc,
        stand: chosen.stand,
        items: Array.from(groups[vend]),
        level: Number(level) || 0,
        createdAt: Date.now()
      });
    }
    return tasks;
  }catch(_){ return []; }
}

// Observe chat for level-up message
(function(){
  async function onLevelUp(level){
    level = Number(level) || 0;
    if(!level) return;

    // ✅ Guard: obsłuż dany poziom tylko raz (MutationObserver + setInterval mogą odpalić razem)
    const KEY = 'adi-bot_last_equip_level_handled';
    let last = 0;
    try{ last = parseInt(localStorage.getItem(KEY) || '0', 10) || 0; }catch(_){}
    if(level === last) return;
    try{ localStorage.setItem(KEY, String(level)); }catch(_){}


    // AUTO UMIEJĘTNOŚCI: najpierw rozdaj skill (żeby nie kolidowało z kupowaniem eq)
    try{
      const sr = await (window.__adiHandleAutoSkillsOnLevel ? window.__adiHandleAutoSkillsOnLevel(level) : Promise.resolve(null));
      if(sr && sr.ok) console.log('[adi-bot][auto-skill] lvl', level, 'prof', sr.prof, '->', sr.skill);
      else if(sr && sr.reason==='no-plan') console.log('[adi-bot][auto-skill] brak planu dla', sr.prof, 'na lvl', level);
      else if(sr && sr.reason==='disabled') console.log('[adi-bot][auto-skill] wyłączone (checkbox Auto umiejętności)');
    }catch(e){ console.warn('[adi-bot][auto-skill] błąd', e); }

    const prof = __adi_getProfession() || (window.hero ? String(hero.prof) : null) || 'Wojownik';
    const tasks = __adi_buildEquipTasksFor(level, prof);
    if(!tasks.length) return;

    const [first, ...rest] = tasks;
    __adi_saveEquipQueue(rest);
    saveEquipTask(first);
    setTempTarget(first.map);
    startEquipFlow();
    try{ a_goTo(hero.x, hero.y); }catch(_){}
}
  const rx = /Awansowa\p{L}*\s+na\s+poziom\s+(\d+)/iu;
  const mo = new MutationObserver(muts=>{
    for(const m of muts){
      for(const n of m.addedNodes){
        try{
          const t = (n.textContent||'').trim();
          const mm = rx.exec(t);
          if(mm){ onLevelUp(Number(mm[1])); return; }
        }catch(_){}
      }
    }
  });
  mo.observe(document.body, {childList:true, subtree:true});
  // Fallback: jeśli komunikat o awansie nie jest dodawany jako nowy node
  // (albo ma polskie znaki w HTML/tooltipie), wykrywaj awans po zmianie hero.lvl
  let __adiLastLvlSeen = 0;
  try{
    __adiLastLvlSeen = parseInt(localStorage.getItem('adi-bot_last_lvl_seen')||'0',10) || 0;
  }catch(_){}
  if(!__adiLastLvlSeen && window.hero && hero.lvl) __adiLastLvlSeen = Number(hero.lvl)||0;

  setInterval(()=>{
    try{
      if(!window.hero || !hero.lvl) return;
      const cur = Number(hero.lvl)||0;
      if(cur > __adiLastLvlSeen){
        __adiLastLvlSeen = cur;
        try{ localStorage.setItem('adi-bot_last_lvl_seen', String(cur)); }catch(_){}
        onLevelUp(cur);
      }
    }catch(_){}
  }, 1500);


// Manual trigger for testing
window.__adiTriggerEquipLevelUp = async function(level){
  try{
    level = Number(level)||0;
    // najpierw skill
    try{ if(window.__adiHandleAutoSkillsOnLevel) await window.__adiHandleAutoSkillsOnLevel(level, true); }catch(e){ console.warn('[adi-bot][auto-skill] błąd (test lvl)', e); }
    const prof = __adi_getProfession() || (window.hero ? String(hero.prof) : null) || 'Wojownik';
    const tasks = __adi_buildEquipTasksFor(level, prof);
    if(!tasks.length){ console.log('[adi-bot] Brak planu zakupów dla', prof, 'na poziom', level); return false; }
    const [first, ...rest] = tasks;
    __adi_saveEquipQueue(rest);
    saveEquipTask(first);
    setTempTarget(first.map);
    startEquipFlow();
    console.log('[adi-bot] Test equip: zasymulowano wbicie poziomu', level, 'dla profesji', prof);
    return true;
  }catch(e){ console.warn('[adi-bot] Test equip error', e); return false; }
};
})();

// włącz kontynuację po F5
    if(loadEquipTask()) startEquipFlow();

    graphWrap.parentNode.insertBefore(equipWrap, graphWrap.nextSibling);

  };

  this.initHTML();
}();


// --- PUBLIC MANUAL-EQUIP HELPERS (for testing any item) ---
window.__adiEquipByName = function(name){
  try{
    const el = window.__adi_findInvItemByName(name);
    if(!el){ console.log('[auto-equip] not found:', name); return false; }
    if(!window.__adi_tryJquiDrag(el)) { window.__adi_tryDragToEq(el); }
    return true;
  }catch(e){ console.warn('[auto-equip] __adiEquipByName error', e); return false; }
};

window.__adiEquipSeq = function(names){
  try{ window.window.__adiEquipSeq(names||[], function(){}); }catch(e){ console.warn('[auto-equip] __adiEquipSeq error', e); }
};



// --- expose equip sequence globally (and define if missing) ---
if (typeof window.window.__adi_equipByNameSequence !== 'function') {
  window.window.__adi_equipByNameSequence = function(names, doneCb){
    const list = (names||[]).slice();
    let i = 0;
    function step(){
      if(i >= list.length){ try{ doneCb && doneCb(); }catch(_){ } return; }
      const name = list[i++];
      const el = window.__adi_findInvItemByName(name);
      if(!el){ setTimeout(step, 150); return; }
      if(!window.__adi_tryJquiDrag(el)) { window.__adi_tryDragToEq(el); }
      setTimeout(step, 350);
    }
    step();
  };
}


// inject page-scope equip helpers

(function(){
  try{
    var s = document.createElement('script');
    s.textContent = '\n(function(){\n  try{\n    // === Page-scope helpers (no sandbox) ===\n    function __adi_eq_norm(s){ return String(s||\'\').toLowerCase().normalize(\'NFKD\').replace(/[\\u0300-\\u036f]/g,\'\'); }\n    function __adi_findInvItemByName(name){\n      const needle = __adi_eq_norm(name);\n      const items = Array.from(document.querySelectorAll(\'.item[id^="item"]\'));\n      const invOnly = items.filter(el => !el.closest(\'#npcshop, .shop, #shop\'));\n      function getName(el){\n        const a = el.getAttribute(\'tip\') || \'\';\n        const b = el.getAttribute(\'ctip\') || \'\';\n        const t = el.textContent || \'\';\n        return [a,b,t].map(__adi_eq_norm).join(\' | \');\n      }\n      return invOnly.find(el => getName(el).includes(needle)) || null;\n    }\n    function __adi_tryDragToEq(el){\n      try{\n        const target = document.querySelector(\'#b_pvp\') || document.querySelector(\'#panel\') || document.body;\n        const wait = (ms)=>new Promise(r=>setTimeout(r,ms));\n        function fireAll(tgt, type, opts){\n          const evMouse = new MouseEvent(type, Object.assign({bubbles:true, cancelable:true}, opts));\n          try{ tgt.dispatchEvent(evMouse); }catch(_){}\n          try{ document.dispatchEvent(new MouseEvent(type, Object.assign({bubbles:true, cancelable:true}, opts))); }catch(_){}\n          try{ window.dispatchEvent(new MouseEvent(type, Object.assign({bubbles:true, cancelable:true}, opts))); }catch(_){}\n          if(window.PointerEvent){\n            const evPtr = new PointerEvent(type, Object.assign({bubbles:true, cancelable:true, pointerId:1, pointerType:\'mouse\', isPrimary:true}, opts));\n            try{ tgt.dispatchEvent(evPtr); }catch(_){}\n            try{ document.dispatchEvent(new PointerEvent(type, Object.assign({bubbles:true, cancelable:true, pointerId:1, pointerType:\'mouse\', isPrimary:true}, opts))); }catch(_){}\n            try{ window.dispatchEvent(new PointerEvent(type, Object.assign({bubbles:true, cancelable:true, pointerId:1, pointerType:\'mouse\', isPrimary:true}, opts))); }catch(_){}\n          }\n        }\n        function fireHtml5(tgt, type, opts){\n          try{\n            const dt = new DataTransfer();\n            const ev = new DragEvent(type, Object.assign({bubbles:true, cancelable:true, dataTransfer: dt}, opts));\n            tgt.dispatchEvent(ev);\n          }catch(_){}\n        }\n        try{ el.scrollIntoView({block:\'center\', inline:\'center\'}); }catch(_){}\n        try{ target.scrollIntoView({block:\'center\', inline:\'center\'}); }catch(_){}\n        const rectEl = el.getBoundingClientRect();\n        const rectTg = target.getBoundingClientRect();\n        const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;\n        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;\n        const fromX = Math.round(rectEl.left + rectEl.width/2);\n        const fromY = Math.round(rectEl.top + rectEl.height/2);\n        const toX = Math.round(rectTg.left + rectTg.width/2);\n        const toY = Math.round(rectTg.top + rectTg.height/2);\n        const path = [[fromX,fromY],[fromX+8,fromY+4],[fromX+20,fromY+10],[Math.round((fromX+toX)/2),Math.round((fromY+toY)/2)],[toX-8,toY-4],[toX,toY]];\n        (async ()=>{\n          const down = {clientX:path[0][0], clientY:path[0][1], pageX:path[0][0]+scrollX, pageY:path[0][1]+scrollY, which:1, button:0, buttons:1};\n          fireAll(el,\'pointerdown\',down); fireAll(el,\'mousedown\',down); fireHtml5(el,\'dragstart\',down);\n          for(let i=1;i<path.length;i++){\n            const [cx,cy]=path[i]; const move = {clientX:cx, clientY:cy, pageX:cx+scrollX, pageY:cy+scrollY, which:1, button:0, buttons:1};\n            fireAll(document,\'pointermove\',move); fireAll(document,\'mousemove\',move); fireHtml5(document,\'drag\',move); fireHtml5(target,\'dragenter\',move); fireHtml5(target,\'dragover\',move);\n            await new Promise(r=>setTimeout(r,60));\n          }\n          const last = path[path.length-1]; const up = {clientX:last[0], clientY:last[1], pageX:last[0]+scrollX, pageY:last[1]+scrollY, which:1, button:0, buttons:0};\n          const dropTarget = document.elementFromPoint(last[0],last[1]) || target;\n          fireHtml5(dropTarget,\'drop\',up); fireAll(dropTarget,\'pointerup\',up); fireAll(dropTarget,\'mouseup\',up); fireAll(dropTarget,\'click\',up); fireHtml5(dropTarget,\'dragend\',up);\n        })();\n        return true;\n      }catch(e){ console.warn(\'dragToEq error\', e); return false; }\n    }\n    function __adi_tryJquiDrag(el){\n      try{\n        if(!window.jQuery) return false;\n        const $ = window.jQuery;\n        const $el = $(el);\n        const inst = $el.data(\'ui-draggable\') || $el.data(\'draggable\');\n        if(!inst || (!inst._mouseStart && !inst._mouseDrag)) {\n          // Fallback: spróbuj klasycznego triggerowania zdarzeń jQuery na elemencie\n          const rectEl = el.getBoundingClientRect();\n          const rectTg = (document.querySelector(\'#b_pvp\') || document.querySelector(\'#panel\') || document.body).getBoundingClientRect();\n          const from = {pageX: rectEl.left + rectEl.width/2, pageY: rectEl.top + rectEl.height/2, which:1};\n          const to =   {pageX: rectTg.left + rectTg.width/2, pageY: rectTg.top + rectTg.height/2, which:1};\n          $el.trigger($.Event(\'mousedown\', from));\n          $(document).trigger($.Event(\'mousemove\', to));\n          $(document).trigger($.Event(\'mouseup\', to));\n          return true;\n        }\n        const target = document.querySelector(\'#b_pvp\') || document.querySelector(\'#panel\') || document.body;\n        const rectEl = el.getBoundingClientRect();\n        const rectTg = target.getBoundingClientRect();\n        const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;\n        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;\n        const fromX = Math.round(rectEl.left + rectEl.width/2) + scrollX;\n        const fromY = Math.round(rectEl.top + rectEl.height/2) + scrollY;\n        const toX = Math.round(rectTg.left + rectTg.width/2) + scrollX;\n        const toY = Math.round(rectTg.top + rectTg.height/2) + scrollY;\n        const evDown = $.Event(\'mousedown\', {pageX: fromX, pageY: fromY, which:1});\n        const evMove = $.Event(\'mousemove\', {pageX: toX, pageY: toY, which:1});\n        const evUp = $.Event(\'mouseup\', {pageX: toX, pageY: toY, which:1});\n        inst._mouseDownEvent = evDown;\n        if(!inst._mouseCapture || inst._mouseCapture(evDown) !== false){\n          inst._mouseStarted = true;\n          inst.helper = $el; // guard\n          inst.position = {left: fromX, top: fromY};\n          inst._mouseStart && inst._mouseStart(evDown);\n          inst._mouseDrag && inst._mouseDrag(evMove);\n          inst._mouseStop && inst._mouseStop(evUp);\n          return true;\n        }\n        return false;\n      }catch(e){ console.warn(\'jqui drag err\', e); return false; }\n    }\n    function __adi_equipByNameSequence(names, doneCb){\n      const list = (names||[]).slice(); let i=0;\n      function step(){\n        if(i>=list.length){ try{doneCb&&doneCb();}catch(_){ } return; }\n        const name=list[i++]; const el = __adi_findInvItemByName(name);\n        if(!el){ setTimeout(step,150); return; }\n        if(!__adi_tryJquiDrag(el)) { __adi_tryDragToEq(el); }\n        setTimeout(step,350);\n      }\n      step();\n    }\n    window.__adiEquipByName = function(name){\n      try{\n        const el = __adi_findInvItemByName(name);\n        if(!el){ console.log(\'[auto-equip] not found:\', name); return false; }\n        if(!__adi_tryJquiDrag(el)) { __adi_tryDragToEq(el); }\n        return true;\n      }catch(e){ console.warn(\'[auto-equip] __adiEquipByName error\', e); return false; }\n    };\n    window.__adiEquipSeq = function(names){ try{ __adi_equipByNameSequence(names||[], function(){}); }catch(e){ console.warn(\'[auto-equip] __adiEquipSeq error\', e); } };\n  }catch(e){ console.warn(\'inject equip helpers error\', e); }\n})();\n';
    (document.head||document.documentElement).appendChild(s);
    s.parentNode.removeChild(s);
  }catch(e){ console.warn('inject error', e); }
})();


// inject improved page-scope equip helpers
(function(){try{var s=document.createElement('script');s.textContent='\n(function(){\n  try{\n    function __adi_eq_norm(s){ return String(s||\'\').toLowerCase().normalize(\'NFKD\').replace(/[\\u0300-\\u036f]/g,\'\'); }\n    function __adi_findInvItemByName(name){\n      const needle = __adi_eq_norm(name);\n      const items = Array.from(document.querySelectorAll(\'.item[id^="item"]\'));\n      const invOnly = items.filter(el => !el.closest(\'#npcshop, .shop, #shop\'));\n      function getName(el){\n        const a = el.getAttribute(\'tip\') || \'\';\n        const b = el.getAttribute(\'ctip\') || \'\';\n        const t = el.textContent || \'\';\n        return [a,b,t].map(__adi_eq_norm).join(\' | \');\n      }\n      return invOnly.find(el => getName(el).includes(needle)) || null;\n    }\n\n    async function __adi_dragTo(el, toX, toY){\n      const wait = (ms)=>new Promise(r=>setTimeout(r,ms));\n      function fireAll(tgt, type, opts){\n        const evMouse = new MouseEvent(type, Object.assign({bubbles:true, cancelable:true}, opts));\n        try{ tgt.dispatchEvent(evMouse); }catch(_){}\n        try{ document.dispatchEvent(new MouseEvent(type, Object.assign({bubbles:true, cancelable:true}, opts))); }catch(_){}\n        try{ window.dispatchEvent(new MouseEvent(type, Object.assign({bubbles:true, cancelable:true}, opts))); }catch(_){}\n        if(window.PointerEvent){\n          const evPtr = new PointerEvent(type, Object.assign({bubbles:true, cancelable:true, pointerId:1, pointerType:\'mouse\', isPrimary:true}, opts));\n          try{ tgt.dispatchEvent(evPtr); }catch(_){}\n          try{ document.dispatchEvent(new PointerEvent(type, Object.assign({bubbles:true, cancelable:true, pointerId:1, pointerType:\'mouse\', isPrimary:true}, opts))); }catch(_){}\n          try{ window.dispatchEvent(new PointerEvent(type, Object.assign({bubbles:true, cancelable:true, pointerId:1, pointerType:\'mouse\', isPrimary:true}, opts))); }catch(_){}\n        }\n      }\n      function fireHtml5(tgt, type, opts){\n        try{\n          const dt = new DataTransfer();\n          const ev = new DragEvent(type, Object.assign({bubbles:true, cancelable:true, dataTransfer: dt}, opts));\n          tgt.dispatchEvent(ev);\n        }catch(_){}\n      }\n      try{ el.scrollIntoView({block:\'center\', inline:\'center\'}); }catch(_){}\n      const rectEl = el.getBoundingClientRect();\n      const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;\n      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;\n      const fromX = Math.round(rectEl.left + rectEl.width/2);\n      const fromY = Math.round(rectEl.top + rectEl.height/2);\n\n      // Path with intermediate points\n      const path = [\n        [fromX, fromY],\n        [fromX+8, fromY+4],\n        [Math.round((fromX+toX)/2), Math.round((fromY+toY)/2)],\n        [toX-6, toY-4],\n        [toX, toY]\n      ];\n\n      const down = {clientX:path[0][0], clientY:path[0][1], pageX:path[0][0]+scrollX, pageY:path[0][1]+scrollY, which:1, button:0, buttons:1};\n      fireAll(el,\'pointerdown\',down); fireAll(el,\'mousedown\',down); fireHtml5(el,\'dragstart\',down);\n      await wait(30);\n\n      for(let i=1;i<path.length;i++){\n        const [cx, cy] = path[i];\n        const move = {clientX:cx, clientY:cy, pageX:cx+scrollX, pageY:cy+scrollY, which:1, button:0, buttons:1};\n        fireAll(document,\'pointermove\',move); fireAll(document,\'mousemove\',move); fireHtml5(document,\'drag\',move);\n        await wait(30);\n      }\n      const up = {clientX:toX, clientY:toY, pageX:toX+scrollX, pageY:toY+scrollY, which:1, button:0, buttons:0};\n      const dropTarget = document.elementFromPoint(toX, toY) || document.body;\n      fireHtml5(dropTarget,\'dragenter\',up); fireHtml5(dropTarget,\'dragover\',up);\n      fireHtml5(dropTarget,\'drop\',up); fireAll(dropTarget,\'pointerup\',up); fireAll(dropTarget,\'mouseup\',up); fireAll(dropTarget,\'click\',up); fireHtml5(dropTarget,\'dragend\',up);\n      try{\n        const releaseTargets = [dropTarget, document, window, document.body];\n        for(const rt of releaseTargets){\n          if(!rt) continue;\n          rt.dispatchEvent(new MouseEvent(\'mouseup\', {bubbles:true, cancelable:true, which:1, button:0, buttons:0}));\n          if(window.PointerEvent){\n            rt.dispatchEvent(new PointerEvent(\'pointerup\', {bubbles:true, cancelable:true, pointerId:1, pointerType:\'mouse\', isPrimary:true, buttons:0}));\n          }\n        }\n      }catch(_){}\n      await wait(40);\n    }\n\n    async function __adi_tryDragToTargets(el, targets){\n      const before = el.getBoundingClientRect();\n      for(const [tx, ty] of targets){\n        await __adi_dragTo(el, tx, ty);\n        await new Promise(r=>setTimeout(r,80));\n        const after = el.isConnected ? el.getBoundingClientRect() : null;\n        if(!after) return true;\n        const moved = Math.hypot(after.left - before.left, after.top - before.top);\n        if(moved > 40) return true;\n      }\n      return false;\n    }\n\n    function __adi_computeTargets(){\n      const tg = document.querySelector(\'#b_pvp\') || document.querySelector(\'#panel\') || document.body;\n      const rt = tg.getBoundingClientRect();\n      const panel = document.querySelector(\'#panel\');\n      const prt = panel ? panel.getBoundingClientRect() : rt;\n      const pts = [[Math.round(rt.left+rt.width/2), Math.round(rt.top+rt.height/2)]];\n      const cell = 42;\n      for(let r=0;r<2;r++){\n        for(let c=0;c<3;c++){\n          pts.push([Math.round(prt.left + 60 + c*cell), Math.round(prt.top + 120 + r*cell)]);\n        }\n      }\n      return pts;\n    }\n\n    function __adi_tryJquiDrag(el){\n      try{\n        if(!window.jQuery) return false;\n        const $ = window.jQuery;\n        const $el = $(el);\n        const inst = $el.data(\'ui-draggable\') || $el.data(\'draggable\');\n        if(!inst) return false;\n        const tg = document.querySelector(\'#b_pvp\') || document.querySelector(\'#panel\') || document.body;\n        const re = el.getBoundingClientRect(), rt = tg.getBoundingClientRect();\n        const from = {pageX: re.left + re.width/2, pageY: re.top + re.height/2, which:1};\n        const to   = {pageX: rt.left + rt.width/2, pageY: rt.top + rt.height/2, which:1};\n        $el.trigger($.Event(\'mousedown\', from));\n        $(document).trigger($.Event(\'mousemove\', to));\n        $(document).trigger($.Event(\'mouseup\', to));\n        return true;\n      }catch(_){ return false; }\n    }\n\n    async function __adi_equipByNameSequence(names, doneCb){\n      const list = (names||[]).slice(); let i=0;\n      async function step(){\n        if(i>=list.length){ try{doneCb&&doneCb();}catch(_){ } return; }\n        const name=list[i++]; const el = __adi_findInvItemByName(name);\n        if(!el){ setTimeout(step,150); return; }\n        if(!__adi_tryJquiDrag(el)){\n          const pts = __adi_computeTargets();\n          await __adi_tryDragToTargets(el, pts);\n        }\n        setTimeout(step,250);\n      }\n      step();\n    }\n    window.__adiEquipByName = function(name){ try{ __adi_equipByNameSequence([name], function(){}); return true; }catch(e){ console.warn(e); return false; } };\n    window.__adiEquipSeq = function(names){ try{ __adi_equipByNameSequence(names||[], function(){}); }catch(e){ console.warn(e); } };\n  }catch(e){ console.warn(\'inject equip helpers error\', e); }\n})();\n';(document.head||document.documentElement).appendChild(s);s.parentNode.removeChild(s);}catch(e){console.warn('inject error',e);}})();

// inject ULTRA page-scope equip helpers
(function(){try{var s=document.createElement('script');s.textContent='\n(function(){\n  try{\n    function __adi_eq_norm(s){ return String(s||\'\').toLowerCase().normalize(\'NFKD\').replace(/[\\u0300-\\u036f]/g,\'\'); }\n    function __adi_findInvItemByName(name){\n      const needle = __adi_eq_norm(name);\n      const items = Array.from(document.querySelectorAll(\'.item[id^="item"]\'));\n      const invOnly = items.filter(el => !el.closest(\'#npcshop, .shop, #shop\'));\n      function getName(el){\n        const a = el.getAttribute(\'tip\') || \'\';\n        const b = el.getAttribute(\'ctip\') || \'\';\n        const t = el.textContent || \'\';\n        return [a,b,t].map(__adi_eq_norm).join(\' | \');\n      }\n      return invOnly.find(el => getName(el).includes(needle)) || null;\n    }\n\n    function __adi_hasJQ(){ return !!window.jQuery; }\n\n    async function __adi_dragViaJQ(el, toX, toY){\n      if(!__adi_hasJQ()) return false;\n      const $ = window.jQuery;\n      const $el = $(el);\n      const startRect = el.getBoundingClientRect();\n      const from = { x: Math.round(startRect.left + startRect.width/2), y: Math.round(startRect.top + startRect.height/2) };\n      const steps = 8;\n      const path = [];\n      for(let i=0;i<=steps;i++){\n        const t = i/steps;\n        path.push([ Math.round(from.x + (toX - from.x)*t), Math.round(from.y + (toY - from.y)*t) ]);\n      }\n      function emit(type, x, y, buttonsVal){\n        const evNative = new MouseEvent(type, {bubbles:true, cancelable:true, clientX:x, clientY:y, which:1, button:0, buttons:buttonsVal});\n        const evJQ = $.Event(type, {pageX:x + (window.scrollX||0), pageY:y + (window.scrollY||0), which:1, button:0, buttons:buttonsVal});\n        evJQ.originalEvent = evNative;\n        return evJQ;\n      }\n      // mousedown on the element\n      $el.trigger(emit(\'mousedown\', path[0][0], path[0][1], 1));\n      await new Promise(r=>setTimeout(r, 30));\n      // move along the path; fire both on document and on the element under pointer\n      for(let i=1;i<path.length;i++){\n        const [mx,my] = path[i];\n        const under = document.elementFromPoint(mx,my) || document;\n        const $under = $(under);\n        const eMove = emit(\'mousemove\', mx, my, 1);\n        $(document).trigger(eMove);\n        $under.trigger(eMove);\n        await new Promise(r=>setTimeout(r, 25));\n      }\n      // mouseup on target under final point + document\n      const last = path[path.length-1];\n      const under = document.elementFromPoint(last[0], last[1]) || document;\n      $(under).trigger(emit(\'mouseup\', last[0], last[1], 0));\n      $(document).trigger(emit(\'mouseup\', last[0], last[1], 0));\n      return true;\n    }\n\n    async function __adi_dragSynth(el, toX, toY){\n      // Fallback pure synthetic\n      function fireAll(tgt, type, opts){\n        const evMouse = new MouseEvent(type, Object.assign({bubbles:true, cancelable:true}, opts));\n        try{ tgt.dispatchEvent(evMouse); }catch(_){}\n        try{ document.dispatchEvent(new MouseEvent(type, Object.assign({bubbles:true, cancelable:true}, opts))); }catch(_){}\n        try{ window.dispatchEvent(new MouseEvent(type, Object.assign({bubbles:true, cancelable:true}, opts))); }catch(_){}\n      }\n      const rectEl = el.getBoundingClientRect();\n      const fromX = Math.round(rectEl.left + rectEl.width/2);\n      const fromY = Math.round(rectEl.top + rectEl.height/2);\n      const path = [];\n      const steps = 8;\n      for(let i=0;i<=steps;i++){\n        const t = i/steps;\n        path.push([ Math.round(fromX + (toX - fromX)*t), Math.round(fromY + (toY - fromY)*t) ]);\n      }\n      fireAll(el, \'mousedown\', {clientX: path[0][0], clientY: path[0][1], which:1, button:0, buttons:1});\n      await new Promise(r=>setTimeout(r, 25));\n      for(let i=1;i<path.length;i++){\n        const [mx,my] = path[i];\n        fireAll(document, \'mousemove\', {clientX: mx, clientY: my, which:1, button:0, buttons:1});\n        const under = document.elementFromPoint(mx,my);\n        if(under) fireAll(under, \'mousemove\', {clientX: mx, clientY: my, which:1, button:0, buttons:1});\n        await new Promise(r=>setTimeout(r, 20));\n      }\n      const last = path[path.length-1];\n      const under = document.elementFromPoint(last[0], last[1]) || document;\n      fireAll(under, \'mouseup\', {clientX:last[0], clientY:last[1], which:1, button:0, buttons:0});\n      fireAll(document, \'mouseup\', {clientX:last[0], clientY:last[1], which:1, button:0, buttons:0});\n      return true;\n    }\n\n    async function __adi_dragToTargets(el, targets){\n      const before = el.getBoundingClientRect();\n      for(const [tx, ty] of targets){\n        let ok = false;\n        if(__adi_hasJQ()){\n          ok = await __adi_dragViaJQ(el, tx, ty);\n        }\n        if(!ok){\n          ok = await __adi_dragSynth(el, tx, ty);\n        }\n        await new Promise(r=>setTimeout(r,80));\n        const after = el.isConnected ? el.getBoundingClientRect() : null;\n        if(!after) return true;\n        const moved = Math.hypot(after.left - before.left, after.top - before.top);\n        if(moved > 40) return true;\n      }\n      return false;\n    }\n\n    function __adi_targets(){\n      const tg = document.querySelector(\'#b_pvp\') || document.querySelector(\'#panel\') || document.body;\n      const rt = tg.getBoundingClientRect();\n      const panel = document.querySelector(\'#panel\');\n      const prt = panel ? panel.getBoundingClientRect() : rt;\n      const pts = [[Math.round(rt.left+rt.width/2), Math.round(rt.top+rt.height/2)]];\n      const cell = 42;\n      for(let r=0;r<3;r++){\n        for(let c=0;c<4;c++){\n          pts.push([Math.round(prt.left + 40 + c*cell), Math.round(prt.top + 90 + r*cell)]);\n        }\n      }\n      return pts;\n    }\n\n    async function __adi_equipByNameSequence(names, doneCb){\n      const list = (names||[]).slice(); let i=0;\n      async function step(){\n        if(i>=list.length){ try{doneCb&&doneCb();}catch(_){ } return; }\n        const name=list[i++]; const el = __adi_findInvItemByName(name);\n        if(!el){ setTimeout(step,150); return; }\n        const pts = __adi_targets();\n        await __adi_dragToTargets(el, pts);\n        setTimeout(step,250);\n      }\n      step();\n    }\n    window.__adiEquipByName = function(name){ try{ __adi_equipByNameSequence([name], function(){}); return true; }catch(e){ console.warn(e); return false; } };\n    window.__adiEquipSeq = function(names){ try{ __adi_equipByNameSequence(names||[], function(){}); }catch(e){ console.warn(e); } };\n  }catch(e){ console.warn(\'inject ultra equip helpers error\', e); }\n})();\n';(document.head||document.documentElement).appendChild(s);s.parentNode.removeChild(s);}catch(e){console.warn('inject error',e);}})();


/* =======================================================
   SMART TRAVERSAL PATCH (NO PING-PONG) — FIXED
   - usuwa ping-pong, ale NIE używa niedostępnych helperów (followGraphTo/a_getWay)
   - wykorzystuje oryginalny findBestGw jako "silnik ruchu"
   - steruje ruchem przez ADI_TEMP_TARGET_MAP (obsługiwane w oryginalnym findBestGw)
   ======================================================= */
(function () {
  const VISITED_KEY = 'adi-bot_smart_visited';

  function normMapName(s){
    try{
      return (s||'')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/\u00A0/g,' ')
        .replace(/\s+/g,' ')
        .trim()
        .toLowerCase();
    }catch{
      return (s||'').toLowerCase();
    }
  }

  function getAllowedMapsRaw(){
    const el = document.querySelector('#adi-bot_maps');
    if(!el) return [];
    const raw = (el.value || '').trim();
    if(!raw) return [];
    return raw.split(',').map(s=>s.trim()).filter(Boolean);
  }

  function loadVisited(){
    try{ return JSON.parse(localStorage.getItem(VISITED_KEY) || '[]'); }
    catch{ return []; }
  }
  function saveVisited(arr){
    try{ localStorage.setItem(VISITED_KEY, JSON.stringify(arr)); }
    catch{}
  }

  function markVisitedCurIfAllowed(){
    if(!window.map || !map.name) return;
    const allowedRaw = getAllowedMapsRaw();
    if(!allowedRaw.length) return;

    const allowedNorm = allowedRaw.map(normMapName);
    const cur = normMapName(map.name);
    if(!allowedNorm.includes(cur)) return;

    const visited = loadVisited();
    if(!visited.includes(cur)){
      visited.push(cur);
      saveVisited(visited);
    }
  }

  function pickNextTargetRaw(){
    const allowedRaw = getAllowedMapsRaw();
    if(!allowedRaw.length) return null;

    const allowedNorm = allowedRaw.map(normMapName);
    const visited = loadVisited();

    for(let i=0;i<allowedRaw.length;i++){
      const nm = allowedNorm[i];
      if(!visited.includes(nm)) return allowedRaw[i];
    }
    // wszystkie odwiedzone -> reset
    saveVisited([]);
    return allowedRaw[0];
  }

  const bot = window.adiwilkTestBot;
  if(!bot || typeof bot.findBestGw !== 'function') return;

  const _origFindBestGw = bot.findBestGw.bind(bot);

  bot.findBestGw = function(){
    const allowedRaw = getAllowedMapsRaw();
    const cur = normMapName(window.map && map.name);

    // jeśli mamy ustawiony cel i doszliśmy -> wyczyść
    if(window.ADI_TEMP_TARGET_MAP){
      const tgt = normMapName(window.ADI_TEMP_TARGET_MAP);
      if(cur && tgt && cur === tgt){
        window.ADI_TEMP_TARGET_MAP = null;
        try{ localStorage.removeItem('adi-temp-target'); }catch(_){}
      } else {
        // cel ustawiony (vendor/exh/smart) -> nie przeszkadzaj
        return _origFindBestGw();
      }
    }

    // brak map do traversalu -> oryginał
    if(!allowedRaw.length) return _origFindBestGw();

    markVisitedCurIfAllowed();

    const nextRaw = pickNextTargetRaw();
    if(!nextRaw) return _origFindBestGw();

    if(cur === normMapName(nextRaw)) return _origFindBestGw();

    // ustaw cel i pozwól oryginałowi wyznaczyć bramę/trasę
    window.ADI_TEMP_TARGET_MAP = nextRaw;
    try{ localStorage.setItem('adi-temp-target', String(nextRaw)); }catch(_){}

    return _origFindBestGw();
  };

  console.log('[adi-bot] SMART TRAVERSAL ACTIVE (fixed, no ping-pong)');
})();

