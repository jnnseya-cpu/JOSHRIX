/**
 * JOSHRIX 3D runtime, version 1.  Global: JOSHRIX3D
 *
 * Every 3D game the forge has failed to deliver failed in the same handful of
 * places: the canvas was never appended, the world was built inside a loader
 * callback, the arena was sized for a different scale than the models, the fog
 * colour disagreed with the sky and drew a seam across the horizon, a phone got
 * a desktop render budget, a skinned character was .clone()d and every copy
 * animated as one, or a single bad frame threw and the screen went black.
 *
 * This file owns all of that. A game built on it CANNOT fail those ways,
 * because it never writes that code. It supplies the concept: what to load,
 * what to spawn, what happens each frame, and when the run ends.
 *
 * Versioned in the filename on purpose — published games pin this URL forever,
 * so v1 must keep behaving like v1. Ship changes as joshrix3d-2.js.
 *
 * Requires three.js r147 UMD and GLTFLoader to be loaded first.
 */
(function (global) {
  "use strict";

  /* Where the model library lives. Derived from this script's own URL rather
     than hardcoded, so a game works unchanged on the live domain, on a preview
     deploy, and on a local server — and so the library can move to another CDN
     without every published game breaking. */
  var ASSETS = (function () {
    try {
      var s = document.currentScript;
      if (!s) {
        var all = document.getElementsByTagName("script");
        for (var i = all.length - 1; i >= 0; i--) {
          if (/joshrix3d-\d+\.js/.test(all[i].src)) { s = all[i]; break; }
        }
      }
      if (s && s.src) return new URL("../models3d/", s.src).href;
    } catch (e) {}
    return "https://www.joshrix.com/assets/models3d/";
  })();

  /* ------------------------------------------------------------------ *
   * Skinned-mesh cloning.
   * THREE.Object3D.clone() copies the bones but leaves every clone bound
   * to the ORIGINAL skeleton, so all copies animate identically. Rebinding
   * against the cloned bone tree is the whole fix, and it is the reason a
   * game can safely put eight of the same character on screen.
   * ------------------------------------------------------------------ */
  function cloneSkinned(source) {
    var clone = source.clone(true);
    var srcBones = [], dstBones = [];
    source.traverse(function (n) { if (n.isBone) srcBones.push(n); });
    clone.traverse(function (n) { if (n.isBone) dstBones.push(n); });
    var byName = {};
    for (var i = 0; i < dstBones.length; i++) byName[dstBones[i].name] = dstBones[i];

    var srcSkinned = [], dstSkinned = [];
    source.traverse(function (n) { if (n.isSkinnedMesh) srcSkinned.push(n); });
    clone.traverse(function (n) { if (n.isSkinnedMesh) dstSkinned.push(n); });

    for (var s = 0; s < dstSkinned.length; s++) {
      var dst = dstSkinned[s], src = srcSkinned[s];
      if (!src || !src.skeleton) continue;
      var bones = [];
      for (var b = 0; b < src.skeleton.bones.length; b++) {
        bones.push(byName[src.skeleton.bones[b].name] || src.skeleton.bones[b]);
      }
      dst.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), dst.matrixWorld);
    }
    return clone;
  }

  /* ---------------------------- textures ---------------------------- *
   * The sky's horizon colour and the fog colour MUST be the same value.
   * When they differ, distant fogged geometry meets the dome in a hard
   * band across the screen — it reads as a rendering bug and it is very
   * easy to ship without noticing.
   * ------------------------------------------------------------------ */
  function skyTexture(top, mid, haze) {
    var c = document.createElement("canvas");
    c.width = 16; c.height = 256;
    var x = c.getContext("2d");
    var g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(0.34, mid);
    g.addColorStop(0.5, haze);      // v=0.5 is the sphere's equator = the horizon
    g.addColorStop(0.72, haze);
    g.addColorStop(1, haze);
    x.fillStyle = g; x.fillRect(0, 0, 16, 256);
    return new THREE.CanvasTexture(c);
  }

  function groundTexture(base, speckle, repeat) {
    var c = document.createElement("canvas");
    c.width = c.height = 256;
    var x = c.getContext("2d");
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2600; i++) {
      x.fillStyle = speckle[i % speckle.length];
      x.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat || 7, repeat || 7);
    return t;
  }

  /* ------------------------------- UI ------------------------------- */
  var CSS = [
    "html,body{height:100%;margin:0;overflow:hidden;background:#0b1622;",
    "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-tap-highlight-color:transparent}",
    "canvas{display:block}",
    ".jx-hud{position:fixed;top:0;left:0;right:0;padding:12px 16px;display:flex;justify-content:space-between;",
    "align-items:flex-start;pointer-events:none;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.7);z-index:5}",
    ".jx-hud .jx-col{display:flex;flex-direction:column;gap:3px}",
    ".jx-hud .jx-right{align-items:flex-end}",
    ".jx-big{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}",
    ".jx-lbl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.75}",
    ".jx-pips{font-size:20px;letter-spacing:2px;line-height:1}",
    ".jx-vig{position:fixed;inset:0;pointer-events:none;z-index:4;",
    "background:radial-gradient(ellipse at 50% 48%,transparent 52%,rgba(4,10,18,.5) 100%)}",
    ".jx-ov{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;",
    "text-align:center;padding:24px;z-index:10;color:#fff}",
    ".jx-ov h1{font-size:clamp(28px,7vw,54px);margin:0 0 10px;letter-spacing:-.01em;text-shadow:0 4px 24px rgba(0,0,0,.6)}",
    ".jx-ov p{max-width:520px;line-height:1.65;opacity:.92;margin:.3rem 0;font-size:15px}",
    ".jx-btn{margin-top:22px;border:0;border-radius:999px;padding:16px 44px;font-size:19px;font-weight:800;",
    "cursor:pointer;transition:transform .12s}",
    ".jx-btn:active{transform:scale(.96)}",
    ".jx-tip{margin-top:16px;font-size:12.5px;opacity:.65;letter-spacing:.04em}",
    ".jx-flash{position:fixed;inset:0;opacity:0;pointer-events:none;z-index:6;transition:opacity .12s}",
    ".jx-load{position:fixed;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.12);z-index:11}",
    ".jx-load i{display:block;height:100%;width:0;transition:width .25s}",
    ".jx-mute{position:fixed;right:14px;bottom:14px;z-index:7;background:rgba(0,0,0,.45);color:#fff;",
    "border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:8px 12px;font-size:13px;cursor:pointer}",
  ].join("");

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* =================================================================== */

  function boot(cfg) {
    cfg = cfg || {};
    var arena = cfg.arena || 24;
    var playR = cfg.playRadius || arena * 0.75;
    var sky = cfg.sky || {};
    var skyTop = sky.top || "#1d3b57", skyMid = sky.mid || "#3f7ba6", haze = sky.haze || "#7fb0c8";
    var grd = cfg.ground || {};
    var accent = cfg.accent || "#ffd166";

    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    /* --- render budget: a phone cannot afford the desktop settings --- */
    var LIGHT = Math.min(window.innerWidth, window.innerHeight) < 700;

    var renderer = new THREE.WebGLRenderer({ antialias: !LIGHT, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, LIGHT ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = LIGHT ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);      // CANVAS ON SCREEN, FRAME ZERO

    var scene = new THREE.Scene();
    var hazeHex = new THREE.Color(haze).getHex();
    scene.fog = new THREE.Fog(hazeHex, arena * 1.4, arena * 4.6);

    var camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 600);
    camera.position.set(0, arena * 0.6, arena * 0.8);
    camera.lookAt(0, 0, 0);

    /* Portrait phones see a narrow slice of the arena and half a screen of
       empty ground. Pull back, widen the lens, and aim lower so the hero is
       off-centre rather than dead middle. */
    var camPull = 1, camDrop = -2.5;
    function fitCamera() {
      var a = window.innerWidth / window.innerHeight;
      camera.aspect = a;
      camera.fov = a < 1 ? Math.min(64, 52 + (1 - a) * 26) : 52;
      camPull = a < 1 ? 1 + (1 - a) * 0.6 : 1;
      camDrop = a < 1 ? -arena * 0.25 : -arena * 0.11;
      camera.updateProjectionMatrix();
    }
    fitCamera();

    // sky dome — fog:false or the fog flattens the whole thing to one colour
    var dome = new THREE.Mesh(
      new THREE.SphereGeometry(arena * 6, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(skyTop, skyMid, haze), side: THREE.BackSide, fog: false }));
    scene.add(dome);

    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(arena, 56),
      new THREE.MeshStandardMaterial({
        map: groundTexture(grd.base || "#4e8a45", grd.speckle || ["#5c9c50", "#437a3c", "#6aa85c", "#3d6f38"], grd.repeat),
        roughness: 1,
      }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    if (cfg.sea !== false) {
      var sea = new THREE.Mesh(new THREE.CircleGeometry(arena * 5.4, 64),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.seaColor || "#2f7fa8"), roughness: 0.28 }));
      sea.rotation.x = -Math.PI / 2; sea.position.y = -0.4; scene.add(sea);
      var shallows = new THREE.Mesh(new THREE.RingGeometry(arena - 0.5, arena + arena * 0.3, 64),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.shoreColor || "#63c4d8"), roughness: .35, transparent: true, opacity: .8 }));
      shallows.rotation.x = -Math.PI / 2; shallows.position.y = -0.2; scene.add(shallows);
    }

    var amb = cfg.ambient || {};
    scene.add(new THREE.HemisphereLight(
      new THREE.Color(amb.sky || "#cfe6ff").getHex(),
      new THREE.Color(amb.ground || "#4a6b3a").getHex(),
      amb.intensity == null ? 0.95 : amb.intensity));

    var sunCfg = cfg.sun || {};
    var sun = new THREE.DirectionalLight(new THREE.Color(sunCfg.color || "#fff0d4").getHex(),
      sunCfg.intensity == null ? 1.35 : sunCfg.intensity);
    sun.position.set(arena * 0.75, arena * 1.4, arena * 0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(LIGHT ? 1024 : 2048, LIGHT ? 1024 : 2048);
    sun.shadow.camera.left = -arena - 4; sun.shadow.camera.right = arena + 4;
    sun.shadow.camera.top = arena + 4; sun.shadow.camera.bottom = -arena - 4;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = arena * 4;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);

    /* ------------------------------ HUD ------------------------------ */
    var hud = el("div", "jx-hud");
    var hudL = el("div", "jx-col"), hudR = el("div", "jx-col jx-right");
    hud.appendChild(hudL); hud.appendChild(hudR);
    var vig = el("div", "jx-vig");
    var flash = el("div", "jx-flash");
    var loadBar = el("div", "jx-load"); var loadFill = el("i");
    loadBar.appendChild(loadFill); loadFill.style.background = accent;
    var mute = el("button", "jx-mute", "&#128266;");
    document.body.appendChild(hud); document.body.appendChild(vig);
    document.body.appendChild(flash); document.body.appendChild(loadBar);
    document.body.appendChild(mute);

    function overlay(headline, body, buttonLabel, tip) {
      var o = el("div", "jx-ov");
      o.style.background = "radial-gradient(ellipse at 50% 40%,rgba(24,58,74,.86),rgba(6,14,22,.96))";
      var h = el("h1", null, headline);
      o.appendChild(h);
      if (body) o.appendChild(el("p", null, body));
      var b = el("button", "jx-btn", buttonLabel);
      b.style.background = accent; b.style.color = "#2a1a05";
      o.appendChild(b);
      if (tip) o.appendChild(el("div", "jx-tip", tip));
      document.body.appendChild(o);
      return { root: o, button: b, headline: h };
    }

    var titleText = cfg.title || "Untitled";
    if (cfg.titleAccent && titleText.indexOf(cfg.titleAccent) >= 0) {
      titleText = titleText.replace(cfg.titleAccent, '<span style="color:' + accent + '">' + cfg.titleAccent + "</span>");
    }
    var titleUi = overlay(titleText,
      (cfg.tagline ? "<b>" + cfg.tagline + "</b> " : "") + (cfg.howTo || ""),
      "&#9654; Start", "Tap · click · press Space to begin");
    var overUi = overlay("Game Over", "", "&#8635; Play again", "Built on JOSHRIX Studio");
    overUi.root.style.display = "none";
    var overBody = overUi.root.querySelector("p");

    /* ---------------------------- audio ------------------------------ */
    var actx = null, muted = false;
    mute.addEventListener("click", function () {
      muted = !muted;
      mute.innerHTML = muted ? "&#128263;" : "&#128266;";
    });

    /* ---------------------------- particles -------------------------- */
    var PC = 220;
    var pGeo = new THREE.BufferGeometry();
    var pPos = new Float32Array(PC * 3), pLife = new Float32Array(PC), pVel = [];
    for (var pi = 0; pi < PC; pi++) { pPos[pi * 3 + 1] = -999; pVel.push(new THREE.Vector3()); }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    var points = new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: 0xffe9a8, size: 0.42, transparent: true, opacity: .9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(points);

    /* ---------------------------- input ------------------------------ */
    var keys = {};
    var target = new THREE.Vector3(0, 0, 0);
    var dragging = false;
    var ray = new THREE.Raycaster();
    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    var hit = new THREE.Vector3();
    var v2 = new THREE.Vector2();

    function pointTo(cx, cy) {
      v2.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
      ray.setFromCamera(v2, camera);
      if (ray.ray.intersectPlane(plane, hit)) { target.copy(hit); target.y = 0; }
    }
    addEventListener("keydown", function (e) {
      var k = e.key.toLowerCase();
      keys[k] = true;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].indexOf(k) >= 0) e.preventDefault();
      if ((e.key === " " || e.key === "Enter") && G.state !== "play") { e.preventDefault(); start(); }
    });
    addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });
    renderer.domElement.addEventListener("pointerdown", function (e) { dragging = true; pointTo(e.clientX, e.clientY); });
    renderer.domElement.addEventListener("pointermove", function (e) { if (dragging) pointTo(e.clientX, e.clientY); });
    addEventListener("pointerup", function () { dragging = false; });
    addEventListener("resize", function () { fitCamera(); renderer.setSize(innerWidth, innerHeight); });

    /* ---------------------------- loading ---------------------------- */
    var loader = new THREE.GLTFLoader();
    var bank = {};                 // key -> { root, clips, height }
    var wanted = 0, settled = 0;
    var readyCbs = [];

    function progress() {
      var pct = wanted ? Math.round(settled / wanted * 100) : 100;
      loadFill.style.width = pct + "%";
      if (settled >= wanted) {
        setTimeout(function () { loadBar.style.display = "none"; }, 400);
        for (var i = 0; i < readyCbs.length; i++) { try { readyCbs[i](); } catch (e) {} }
        readyCbs.length = 0;
      }
    }

    var startHandlers = [], updateHandlers = [], resetHandlers = [];

    var G = {
      THREE: THREE,
      scene: scene, camera: camera, renderer: renderer,
      arena: arena, playRadius: playR,
      state: "title", score: 0, lives: 0, wave: 1, elapsed: 0,
      keys: keys, target: target,
      light: LIGHT,

      /** Queue a model. Never blocks: the game runs whether or not it lands.
       *
       *  Pass ONE of:
       *    height — normalise so the model stands this tall. Right for anything
       *             upright: characters, trees, towers.
       *    size   — normalise so the model's LARGEST dimension is this. Right
       *             for wide flat things: a nest, a rug, a platform, a pool.
       *             Sizing a flat disc by height scales it enormously in X/Z.
       *    scale  — a raw multiplier, when you already know the number.
       *
       *  This is what stops a 376-unit FBX import or a 1-unit Kenney kit piece
       *  from landing next to a 2-unit character. */
      load: function (key, file, opts) {
        opts = opts || {};
        wanted++;
        loader.load(ASSETS + file + ".glb", function (gltf) {
          var root = gltf.scene;
          root.traverse(function (n) { if (n.isMesh || n.isSkinnedMesh) { n.castShadow = true; n.receiveShadow = true; } });
          var box = new THREE.Box3().setFromObject(root);
          var size = new THREE.Vector3(); box.getSize(size);
          var s = 1;
          var biggest = Math.max(size.x, size.y, size.z);
          if (opts.height && size.y > 0) s = opts.height / size.y;
          else if (opts.size && biggest > 0) s = opts.size / biggest;
          else if (opts.scale) s = opts.scale;
          bank[key] = { root: root, clips: gltf.animations || [], scale: s, size: size };
          settled++; progress();
          if (opts.onLoad) { try { opts.onLoad(bank[key]); } catch (e) {} }
        }, undefined, function () {
          settled++; progress();
          if (opts.onError) { try { opts.onError(); } catch (e) {} }
        });
        return this;
      },

      /** True once every queued model has resolved one way or the other. */
      onReady: function (fn) { if (settled >= wanted && wanted > 0) fn(); else readyCbs.push(fn); return this; },

      has: function (key) { return !!bank[key]; },

      /** A fresh instance. Skinned models are rebound so each copy animates
       *  on its own — plain .clone() would make them all move as one. */
      get: function (key) {
        var b = bank[key];
        if (!b) return null;
        var skinned = false;
        b.root.traverse(function (n) { if (n.isSkinnedMesh) skinned = true; });
        var obj = skinned ? cloneSkinned(b.root) : b.root.clone(true);
        obj.scale.setScalar(b.scale);
        return obj;
      },

      /** An instance plus its own mixer, ready to play a named clip. */
      actor: function (key, clipName) {
        var obj = this.get(key);
        if (!obj) return null;
        var b = bank[key];
        var a = { obj: obj, mixer: null, clips: b.clips };
        if (b.clips && b.clips.length) {
          a.mixer = new THREE.AnimationMixer(obj);
          a.play = function (name) {
            var clip = THREE.AnimationClip.findByName(b.clips, name) || b.clips[0];
            a.mixer.stopAllAction();
            a.mixer.clipAction(clip).play();
          };
          a.play(clipName || "idle");
          mixers.push(a.mixer);
        } else {
          a.play = function () {};
        }
        return a;
      },

      /** Ring the arena edge with a model so the middle stays playable and
       *  nothing tall can stand between the camera and the hero. */
      scatter: function (key, count, opts) {
        opts = opts || {};
        var minR = opts.minR == null ? playR + 2 : opts.minR;
        var maxR = opts.maxR == null ? arena : opts.maxR;
        var made = [];
        for (var i = 0; i < count; i++) {
          var o = this.get(key);
          if (!o) break;
          var ang = Math.random() * Math.PI * 2;
          var rad = minR + Math.random() * Math.max(0.001, maxR - minR);
          o.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
          o.rotation.y = Math.random() * Math.PI * 2;
          if (opts.jitter !== false) o.scale.multiplyScalar(0.85 + Math.random() * 0.5);
          if (opts.avoid && o.position.distanceTo(opts.avoid) < (opts.avoidRadius || 5)) continue;
          scene.add(o); made.push(o);
        }
        return made;
      },

      burst: function (pos, color, count) {
        points.material.color.setHex(color == null ? 0xffe9a8 : color);
        var made = 0, want = count || 22;
        for (var k = 0; k < PC && made < want; k++) {
          if (pLife[k] > 0) continue;
          pPos[k * 3] = pos.x; pPos[k * 3 + 1] = pos.y + 0.8; pPos[k * 3 + 2] = pos.z;
          pVel[k].set((Math.random() - .5) * 7, 3 + Math.random() * 5, (Math.random() - .5) * 7);
          pLife[k] = 0.8; made++;
        }
      },

      beep: function (freq, dur, type, gain) {
        if (!actx || muted) return;
        try {
          var o = actx.createOscillator(), g = actx.createGain();
          o.type = type || "sine"; o.frequency.value = freq;
          g.gain.setValueAtTime(gain || 0.12, actx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
          o.connect(g); g.connect(actx.destination);
          o.start(); o.stop(actx.currentTime + dur);
        } catch (e) {}
      },

      flash: function (color) {
        flash.style.background = color || "#ff3b3b";
        flash.style.opacity = ".55";
        setTimeout(function () { flash.style.opacity = "0"; }, 130);
      },

      /** HUD as label/value pairs. `side` is "left" or "right". */
      stat: function (label, value, side) {
        var col = side === "right" ? hudR : hudL;
        var id = "jxstat_" + label.replace(/\W/g, "");
        var node = col.querySelector("[data-k='" + id + "']");
        if (!node) {
          node = el("div");
          node.setAttribute("data-k", id);
          node.appendChild(el("span", "jx-lbl", label));
          node.appendChild(el("div", "jx-big", ""));
          col.appendChild(node);
        }
        node.querySelector(".jx-big").textContent = value;
        return this;
      },

      pips: function (label, n, glyph, side) {
        var col = side === "left" ? hudL : hudR;
        var id = "jxpip_" + label.replace(/\W/g, "");
        var node = col.querySelector("[data-k='" + id + "']");
        if (!node) {
          node = el("div");
          node.setAttribute("data-k", id);
          node.appendChild(el("span", "jx-lbl", label));
          node.appendChild(el("div", "jx-pips", ""));
          col.appendChild(node);
        }
        node.querySelector(".jx-pips").textContent = n > 0 ? new Array(n + 1).join(glyph || "♥") : "—";
        return this;
      },

      /** Camera: lagged follow during play, slow orbit on the menus. */
      follow: function (obj) { followTarget = obj; return this; },

      onStart: function (fn) { startHandlers.push(fn); return this; },
      onUpdate: function (fn) { updateHandlers.push(fn); return this; },
      onReset: function (fn) { resetHandlers.push(fn); return this; },

      over: function (headline, message) {
        if (G.state === "over") return;
        G.state = "over";
        overUi.headline.textContent = headline || "Game Over";
        if (overBody) overBody.textContent = message || "";
        overUi.root.style.display = "flex";
        G.beep(220, .5, "sawtooth", .14);
      },
    };

    var mixers = [];
    var followTarget = null;

    function start() {
      if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
      G.score = 0; G.wave = 1; G.elapsed = 0;
      for (var i = 0; i < resetHandlers.length; i++) { try { resetHandlers[i](G); } catch (e) {} }
      G.state = "play";
      titleUi.root.style.display = "none";
      overUi.root.style.display = "none";
      for (var j = 0; j < startHandlers.length; j++) { try { startHandlers[j](G); } catch (e) {} }
      G.beep(660, .12, "triangle", .16);
      setTimeout(function () { G.beep(880, .18, "triangle", .16); }, 130);
    }
    titleUi.button.addEventListener("click", start);
    overUi.button.addEventListener("click", start);
    titleUi.button.addEventListener("touchstart", function (e) { e.preventDefault(); start(); }, { passive: false });
    overUi.button.addEventListener("touchstart", function (e) { e.preventDefault(); start(); }, { passive: false });

    /* ------------------------------ loop ----------------------------- */
    var clock = new THREE.Clock();
    var menuAngle = 1.2;

    function frame() {
      requestAnimationFrame(frame);
      var dt = Math.min(clock.getDelta(), 0.05);
      try {
        if (G.state === "play") {
          G.elapsed += dt;
          for (var i = 0; i < updateHandlers.length; i++) updateHandlers[i](G, dt);
        }

        for (var m = 0; m < mixers.length; m++) mixers[m].update(dt);

        for (var p = 0; p < PC; p++) {
          if (pLife[p] <= 0) continue;
          pLife[p] -= dt;
          pVel[p].y -= 12 * dt;
          pPos[p * 3] += pVel[p].x * dt;
          pPos[p * 3 + 1] += pVel[p].y * dt;
          pPos[p * 3 + 2] += pVel[p].z * dt;
          if (pLife[p] <= 0) pPos[p * 3 + 1] = -999;
        }
        pGeo.attributes.position.needsUpdate = true;

        if (G.state === "play" && followTarget) {
          var t = followTarget.position;
          camera.position.lerp(new THREE.Vector3(
            t.x * 0.5, arena * 0.62 * camPull, t.z * 0.5 + arena * 0.79 * camPull), 0.05);
          camera.lookAt(t.x * 0.4, 1.4, t.z * 0.4 + camDrop);
        } else {
          menuAngle += dt * 0.11;
          camera.position.set(Math.sin(menuAngle) * arena * 0.8 * camPull,
            arena * 0.44 * camPull, Math.cos(menuAngle) * arena * 0.8 * camPull);
          camera.lookAt(0, arena * 0.075, -arena * 0.12);
        }
        renderer.render(scene, camera);
      } catch (err) {
        // one bad frame must never blank the screen
        try { renderer.render(scene, camera); } catch (e2) {}
      }
    }
    frame();                                    // world is live before any model loads

    // Published games run in an iframe on the arcade. Exposing the live state
    // lets the host read a final score for leaderboards without the game having
    // to invent its own protocol — and gives automated play-tests something
    // truthful to assert against.
    global.JOSHRIX_GAME = G;
    return G;
  }

  global.JOSHRIX3D = { boot: boot, version: 1, assets: ASSETS, cloneSkinned: cloneSkinned };
})(window);
