/**
 * JOSHRIX Playable Engine — deterministic, always-renders game builder.
 *
 * The AI (Idea Agent) designs the game as a blueprint; THIS hand-written engine
 * renders it. That is the reliability fix: a bespoke one-shot AI HTML file can
 * silently draw a background and stop, but this engine is fixed code we test
 * exhaustively, so every forge produces a game that actually plays.
 *
 * Output is one self-contained HTML file: no external resources, no storage,
 * <canvas>, mouse + touch + keyboard, WebAudio SFX + mute, title screen ->
 * play -> win/lose -> restart, rising difficulty, themed from the blueprint.
 */
import type { GameBlueprint } from "../shared/contracts";

type Theme = {
  mode: "catch" | "pilot";
  bg: string; bg2: string; accent: string; good: string; bad: string; ink: string; sub: string;
  goodLabel: string; badLabel: string; scoreWord: string; playerWord: string;
};

const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
// JSON embedded in <script> must not contain a literal </script> or U+2028/9.
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function pickTheme(bp: GameBlueprint): Theme {
  const g = (bp.genre || []).join(" ").toLowerCase();
  const all = (g + " " + (bp.summary || "") + " " + (bp.title || "")).toLowerCase();
  const has = (...k: string[]) => k.some((x) => all.includes(x));

  // mode: a bottom paddle "catch" feels right for sports/casual/kids/puzzle;
  // free-roam "pilot" fits space/action/adventure/shooter.
  const pilot = has("space", "galaxy", "star", "flight", "fly", "pilot", "shoot", "action", "runner", "dodge", "adventure", "rogue", "battle");
  const mode: Theme["mode"] = pilot ? "pilot" : "catch";

  // palette
  let bg = "#070311", bg2 = "#0d0524", accent = "#7C3AED", good = "#22D3EE", bad = "#FB7185", ink = "#F4F4FA", sub = "#A9A6C9";
  if (has("football", "soccer", "pitch", "sport", "stadium")) { bg = "#04140a"; bg2 = "#06210f"; accent = "#22c55e"; good = "#fde047"; bad = "#f87171"; }
  else if (has("kid", "child", "candy", "toy", "school", "cute", "wonder", "crystal", "fairy", "magic")) { bg = "#0a0620"; bg2 = "#160a33"; accent = "#a855f7"; good = "#34d399"; bad = "#fb7185"; ink = "#fdf7ff"; }
  else if (has("space", "galaxy", "star", "cosmic", "neon", "cyber")) { bg = "#03040f"; bg2 = "#070a24"; accent = "#22D3EE"; good = "#a78bfa"; bad = "#f43f5e"; }
  else if (has("forest", "nature", "jungle", "farm", "garden")) { bg = "#04120c"; bg2 = "#07231a"; accent = "#34d399"; good = "#fde047"; bad = "#f87171"; }

  const goodLabel = has("football", "soccer", "goal") ? "GOAL" : has("crystal", "gem", "treasure", "wonder") ? "CRYSTAL" : has("coin", "gold") ? "COIN" : has("star", "space") ? "STAR" : "ORB";
  const badLabel = (bp.characters && bp.characters[0] && bp.characters[0].name) ? String(bp.characters[0].name).toUpperCase().slice(0, 14) : "HAZARD";
  const scoreWord = goodLabel === "GOAL" ? "GOALS" : "SCORE";
  const playerWord = mode === "pilot" ? "PILOT" : "KEEPER";
  return { mode, bg, bg2, accent, good, bad, ink, sub, goodLabel, badLabel, scoreWord, playerWord };
}

export function buildPlayableGame(bp: GameBlueprint): string {
  const theme = pickTheme(bp);
  const title = String(bp.title || "Your Game").slice(0, 60);
  const summary = String(bp.summary || "").slice(0, 200);
  const lang = bp.language && bp.language !== "auto" ? bp.language : "en";
  const levels = (bp.levels && bp.levels.length ? bp.levels : [{ name: "Level 1", objective: "Score points" }])
    .slice(0, 5).map((l) => ({ name: String(l.name || "Level").slice(0, 28), objective: String(l.objective || "").slice(0, 60) }));
  const howto = theme.mode === "pilot"
    ? "Move with your mouse, finger, or arrow keys. Collect the bright " + theme.goodLabel.toLowerCase() + "s. Avoid the red " + theme.badLabel.toLowerCase() + "s."
    : "Slide left/right with mouse, finger, or arrow keys. Catch the bright " + theme.goodLabel.toLowerCase() + "s. Dodge the red " + theme.badLabel.toLowerCase() + "s.";

  const cfg = { title, summary, howto, levels, ...theme, lang };

  // NOTE: the game script is FIXED, hand-tested code. Only `cfg` varies per game.
  return `<!DOCTYPE html><html lang="${esc(lang)}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${esc(title)}</title>
<style>
  html,body{height:100%;margin:0;background:${theme.bg};overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:${theme.ink}}
  #wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
  canvas{display:block;width:100%;height:100%;touch-action:none;background:${theme.bg}}
  #mute{position:fixed;top:10px;right:10px;z-index:5;width:40px;height:40px;border-radius:50%;border:1px solid ${theme.accent};background:rgba(0,0,0,.35);color:${theme.ink};font-size:18px;cursor:pointer}
</style></head>
<body>
<div id="wrap"><canvas id="game"></canvas></div>
<button id="mute" aria-label="Toggle sound">&#128266;</button>
<script>
"use strict";
var CFG = ${safeJson(cfg)};
(function(){
  var cv = document.getElementById('game'), ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  function resize(){
    W = cv.clientWidth || window.innerWidth || 360;
    H = cv.clientHeight || window.innerHeight || 540;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- audio (created on first gesture) ----
  var AC = null, muted = false;
  function beep(freq, dur, type){
    if (muted) return;
    try{
      if(!AC){ var A = window.AudioContext || window.webkitAudioContext; if(!A) return; AC = new A(); }
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.value = 0.08; o.connect(g); g.connect(AC.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + (dur||0.12)); o.stop(AC.currentTime + (dur||0.12));
    }catch(e){}
  }
  var muteBtn = document.getElementById('mute');
  muteBtn.addEventListener('click', function(){ muted = !muted; muteBtn.innerHTML = muted ? '&#128263;' : '&#128266;'; });

  // ---- state ----
  var state = 'title';           // title | play | win | lose
  var score = 0, lives = 3, level = 0, spawnT = 0, t = 0;
  var player = { x: 0.5, y: 0.86, r: 26 };   // x,y are 0..1 fractions
  var ents = [];                 // {x,y (0..1), vy, r, good}
  var pointer = { active:false, x:0.5, y:0.86 };
  var keys = {};
  var TARGET = 12;               // good catches to clear a level

  function reset(){ score=0; lives=3; level=0; ents=[]; spawnT=0; t=0; player.x=0.5; player.y = CFG.mode==='pilot'?0.7:0.86; }

  function start(){ if(state==='play') return; reset(); state='play'; beep(520,0.1,'triangle'); }

  // ---- input ----
  function setPointerFromEvent(e){
    var r = cv.getBoundingClientRect();
    var p = (e.touches && e.touches[0]) ? e.touches[0] : e;
    pointer.x = Math.min(1, Math.max(0, (p.clientX - r.left) / (r.width||1)));
    pointer.y = Math.min(1, Math.max(0, (p.clientY - r.top) / (r.height||1)));
  }
  function onDown(e){
    pointer.active = true; setPointerFromEvent(e);
    if(state==='title' || state==='win' || state==='lose'){ start(); }
    if(e.cancelable) e.preventDefault();
  }
  function onMove(e){ if(pointer.active || CFG.mode==='catch'){ setPointerFromEvent(e); } if(e.cancelable) e.preventDefault(); }
  function onUp(e){ pointer.active = false; }
  cv.addEventListener('mousedown', onDown); cv.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  cv.addEventListener('touchstart', onDown, {passive:false}); cv.addEventListener('touchmove', onMove, {passive:false}); cv.addEventListener('touchend', onUp);
  window.addEventListener('keydown', function(e){
    keys[e.key] = true;
    if((e.key===' '||e.key==='Enter') && state!=='play'){ start(); }
  });
  window.addEventListener('keyup', function(e){ keys[e.key] = false; });

  // ---- spawning & update ----
  function spawn(){
    var good = Math.random() < 0.68;
    ents.push({ x: 0.08 + Math.random()*0.84, y: -0.05, vy: 0.0026 + level*0.0006 + Math.random()*0.0016, r: good?0.032:0.036, good: good, wob: Math.random()*6.28 });
  }
  function update(dt){
    t += dt;
    // player movement
    var speed = 0.9 * dt/16;
    if(keys['ArrowLeft']||keys['a']||keys['A']) player.x -= speed;
    if(keys['ArrowRight']||keys['d']||keys['D']) player.x += speed;
    if(CFG.mode==='pilot'){
      if(keys['ArrowUp']||keys['w']||keys['W']) player.y -= speed;
      if(keys['ArrowDown']||keys['s']||keys['S']) player.y += speed;
    }
    if(pointer.active || CFG.mode==='catch'){
      player.x += (pointer.x - player.x) * 0.35;
      if(CFG.mode==='pilot' && pointer.active) player.y += (pointer.y - player.y) * 0.35;
    }
    player.x = Math.min(0.94, Math.max(0.06, player.x));
    player.y = Math.min(0.94, Math.max(0.30, player.y));

    // spawn
    spawnT -= dt;
    var interval = Math.max(360, 820 - level*70);
    if(spawnT <= 0){ spawn(); spawnT = interval; }

    // move entities + collide
    for(var i=ents.length-1;i>=0;i--){
      var en = ents[i];
      en.y += en.vy * dt;
      en.x += Math.sin(t*0.003 + en.wob) * 0.0006;
      var dx=(en.x-player.x), dy=(en.y-player.y);
      var hit = Math.hypot(dx*W, dy*H) < (en.r*Math.min(W,H)*0.5 + player.r);
      if(hit){
        if(en.good){ score++; beep(680+score*4,0.08,'square'); if(score>0 && score % TARGET === 0){ levelUp(); } }
        else { lives--; beep(140,0.22,'sawtooth'); if(lives<=0){ state='lose'; beep(90,0.5,'sawtooth'); } }
        ents.splice(i,1); continue;
      }
      if(en.y > 1.08){ ents.splice(i,1); }
    }
  }
  function levelUp(){
    if(level >= CFG.levels.length-1){ state='win'; beep(880,0.5,'triangle'); return; }
    level++; beep(760,0.18,'triangle');
  }

  // ---- draw ----
  function bg(){
    var grd = ctx.createLinearGradient(0,0,0,H);
    grd.addColorStop(0, CFG.bg2); grd.addColorStop(1, CFG.bg);
    ctx.fillStyle = grd; ctx.fillRect(0,0,W,H);
    // parallax stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for(var i=0;i<40;i++){ var sx=(i*97.3 % W), sy=((i*53.7 + t*0.02*(1+(i%3)))% H); ctx.globalAlpha=0.15+0.5*((i%5)/5); ctx.fillRect(sx, sy, 2, 2); }
    ctx.globalAlpha=1;
  }
  function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function drawPlayer(){
    var px=player.x*W, py=player.y*H;
    ctx.save();
    if(CFG.mode==='catch'){
      ctx.fillStyle = CFG.accent; roundRect(px-38, py-12, 76, 20, 10); ctx.fill();
      ctx.fillStyle = CFG.good; ctx.globalAlpha=.35; roundRect(px-38, py-12, 76, 20, 10); ctx.fill();
    } else {
      ctx.translate(px,py); ctx.fillStyle=CFG.accent; ctx.beginPath();
      ctx.moveTo(0,-22); ctx.lineTo(16,16); ctx.lineTo(0,8); ctx.lineTo(-16,16); ctx.closePath(); ctx.fill();
      ctx.fillStyle=CFG.good; ctx.globalAlpha=.7; ctx.beginPath(); ctx.arc(0,-2,5,0,7); ctx.fill();
    }
    ctx.restore();
  }
  function drawEnts(){
    for(var i=0;i<ents.length;i++){
      var en=ents[i], ex=en.x*W, ey=en.y*H, rr=en.r*Math.min(W,H)*0.5;
      ctx.beginPath(); ctx.arc(ex,ey,rr,0,7);
      ctx.fillStyle = en.good ? CFG.good : CFG.bad; ctx.fill();
      ctx.globalAlpha=.25; ctx.beginPath(); ctx.arc(ex,ey,rr*1.6,0,7); ctx.fillStyle=en.good?CFG.good:CFG.bad; ctx.fill(); ctx.globalAlpha=1;
    }
  }
  function hud(){
    ctx.fillStyle=CFG.ink; ctx.font='bold 18px system-ui'; ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText(CFG.scoreWord+' '+score, 16, 14);
    ctx.textAlign='center'; ctx.fillStyle=CFG.sub; ctx.font='600 13px system-ui';
    var lv = CFG.levels[Math.min(level,CFG.levels.length-1)];
    ctx.fillText(lv.name, W/2, 16);
    ctx.textAlign='right'; ctx.fillStyle=CFG.bad; ctx.font='bold 18px system-ui';
    var hearts=''; for(var i=0;i<lives;i++) hearts+='♥'; ctx.fillText(hearts||' ', W-62, 14);
  }
  function centerText(lines){
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    // measure total block height first so it sits centred in the upper area,
    // then advance by each block's ACTUAL wrapped height (long titles never overlap)
    var maxw = Math.min(W*0.86, 560);
    var heights = lines.map(function(L){ ctx.font=L.f||'bold 22px system-ui'; return wrapLines(L.t, maxw).length * (L.lh||28) + (L.gap||18); });
    var total = heights.reduce(function(a,b){return a+b;},0);
    var cy = Math.max(H*0.12, H*0.42 - total/2);
    for(var i=0;i<lines.length;i++){
      var L=lines[i];
      ctx.fillStyle=L.c||CFG.ink; ctx.font=L.f||'bold 22px system-ui';
      var rows = wrapLines(L.t, maxw), lh = L.lh||28;
      for(var r=0;r<rows.length;r++){ ctx.fillText(rows[r], W/2, cy); cy += lh; }
      cy += (L.gap||18);
    }
    return cy;
  }
  function wrapLines(text, maxw){
    var words=String(text).split(' '), line='', out=[];
    for(var n=0;n<words.length;n++){
      var test=line?(line+' '+words[n]):words[n];
      if(ctx.measureText(test).width>maxw && line){ out.push(line); line=words[n]; }
      else line=test;
    }
    if(line) out.push(line);
    return out.length?out:[''];
  }
  function button(label, y){
    var bw=Math.min(260,W*0.7), bh=54, bx=W/2-bw/2;
    var by=Math.min(H-90, Math.max(H*0.5, (y||H*0.62)));
    ctx.fillStyle=CFG.accent; roundRect(bx,by,bw,bh,14); ctx.fill();
    ctx.fillStyle='#0a0612'; ctx.font='bold 20px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, W/2, by+bh/2); ctx.textBaseline='alphabetic';
    return by+bh;
  }

  function frame(now){
    try{
      var dt = Math.min(48, now - (frame._last||now)); frame._last = now;
      bg();
      if(state==='play'){ update(dt); drawEnts(); drawPlayer(); hud(); }
      else {
        // decorative drifting entities on menu screens so it never looks dead
        if(ents.length<8 && Math.random()<0.06) spawn();
        for(var i=ents.length-1;i>=0;i--){ ents[i].y+=ents[i].vy*dt; if(ents[i].y>1.1) ents.splice(i,1); }
        drawEnts();
        if(state==='title'){
          var endY = centerText([
            {t:CFG.title, f:'bold 28px system-ui', c:CFG.ink, lh:32, gap:18},
            {t:CFG.howto, f:'500 15px system-ui', c:CFG.sub, lh:22, gap:14}
          ]);
          var bb = button('▶ START', endY);
          ctx.fillStyle=CFG.sub; ctx.font='500 12px system-ui'; ctx.textAlign='center';
          if(bb+26 < H) ctx.fillText('Tap / click / press Space to begin', W/2, bb+26);
        } else if(state==='win'){
          var wy = centerText([
            {t:'★ YOU WIN', f:'bold 32px system-ui', c:CFG.good, lh:36, gap:18},
            {t:CFG.scoreWord+': '+score, f:'bold 20px system-ui', c:CFG.ink, lh:26, gap:14}
          ]);
          button('↻ PLAY AGAIN', wy);
        } else {
          var ly = centerText([
            {t:'GAME OVER', f:'bold 32px system-ui', c:CFG.bad, lh:36, gap:18},
            {t:CFG.scoreWord+': '+score, f:'bold 20px system-ui', c:CFG.ink, lh:26, gap:14}
          ]);
          button('↻ TRY AGAIN', ly);
        }
      }
    }catch(err){
      // never let a frame error blank the game — show it and keep going
      ctx.fillStyle=CFG.bg; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#fca5a5'; ctx.font='14px system-ui'; ctx.textAlign='left';
      ctx.fillText('Frame error: '+(err&&err.message||err), 16, 40);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>
</body></html>`;
}
