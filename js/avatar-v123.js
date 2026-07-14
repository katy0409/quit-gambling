/* Restart V12.4 Avatar Engine
   Six-direction body preview, swipe direction switching, fixed body sizing,
   lowered face anchor and shared Canvas renderer.
*/
(function () {
  'use strict';

  const VERSION = '12.4';
  const ASSET_ROOT = 'assets/avatar';
  const ARTBOARD = 1024;
  const DEFAULT_HAIR_COLOR = '#9B6737';
  const DIRECTIONS = ['front', 'right', 'backRight', 'back', 'backLeft', 'left'];

  const ASSETS = {
    bodies: {
      front: `${ASSET_ROOT}/body/body_front.png`,
      left: `${ASSET_ROOT}/body/body_left.png`,
      right: `${ASSET_ROOT}/body/body_right.png`,
      backLeft: `${ASSET_ROOT}/body/body_back_left.png`,
      back: `${ASSET_ROOT}/body/body_back.png`,
      backRight: `${ASSET_ROOT}/body/body_back_right.png`
    },
    head: `${ASSET_ROOT}/head/head_base.png`,
    maleFace: `${ASSET_ROOT}/face/male_face_default.png`,
    femaleFace: `${ASSET_ROOT}/face/female_face_default.png`,
    maleHairFront: `${ASSET_ROOT}/hair/male/male_hair_001_front.png`,
    maleHairBack: `${ASSET_ROOT}/hair/male/male_hair_001_back.png`,
    femaleHairFront: `${ASSET_ROOT}/hair/female/female_hair_001_front.png`,
    femaleHairBack: `${ASSET_ROOT}/hair/female/female_hair_001_back.png`
  };

  /* All bodies are normalized to the front body's visible height and foot line.
     The avatar stage then applies ONE common body transform to every direction. */
  const BODY_BOUNDS = {
    front:     { x: 319, y: 202, w: 381, h: 651 },
    left:      { x: 347, y: 131, w: 356, h: 753 },
    right:     { x: 345, y: 126, w: 357, h: 741 },
    backLeft:  { x: 353, y: 130, w: 341, h: 751 },
    back:      { x: 318, y: 132, w: 391, h: 740 },
    backRight: { x: 362, y: 125, w: 323, h: 717 }
  };
  const TARGET_BODY = { centerX: 509.5, bottomY: 852, height: 651 };

  const TRANSFORM = {
    body: { scale: 0.78, x: 110, y: 258 },
    head: { scale: 0.78, x: 112, y: 50 },
    face: { scale: 0.78, x: 112, y: 64 },
    hair: { scale: 0.78, x: 112, y: 50 }
  };

  const imageCache = new Map();
  const canvasState = new WeakMap();

  function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`無法載入角色素材：${src}`));
      img.src = src;
    });
    imageCache.set(src, promise);
    return promise;
  }

  function getGender(characterId) {
    return typeof characterId === 'string' && characterId.startsWith('female') ? 'female' : 'male';
  }

  function currentGender() {
    try {
      const char = typeof STARTER_CHARACTERS !== 'undefined' && STARTER_CHARACTERS.find(item => item.id === state.game.character);
      return char?.gender || getGender(state.game.character);
    } catch (_) {
      return 'male';
    }
  }

  function currentDirection() {
    try {
      const value = state?.game?.avatarDirection;
      return DIRECTIONS.includes(value) ? value : 'front';
    } catch (_) {
      return 'front';
    }
  }

  function resolveLook(gender, direction) {
    const female = gender === 'female';
    return {
      gender,
      direction,
      body: ASSETS.bodies[direction] || ASSETS.bodies.front,
      head: ASSETS.head,
      face: female ? ASSETS.femaleFace : ASSETS.maleFace,
      hairBack: female ? ASSETS.femaleHairBack : ASSETS.maleHairBack,
      hairFront: female ? ASSETS.femaleHairFront : ASSETS.maleHairFront
    };
  }

  function normalizeHex(value) {
    if (typeof value !== 'string') return DEFAULT_HAIR_COLOR;
    const raw = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) return ('#' + raw.slice(1).split('').map(ch => ch + ch).join('')).toUpperCase();
    return DEFAULT_HAIR_COLOR;
  }

  function hexToRgb(hex) {
    const clean = normalizeHex(hex).slice(1);
    return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
  }

  function tintHairImage(img, colorHex) {
    const key = `tint:${img.src}|${normalizeHex(colorHex)}`;
    if (imageCache.has(key)) return imageCache.get(key);
    const promise = Promise.resolve().then(() => {
      const canvas = document.createElement('canvas');
      canvas.width = ARTBOARD;
      canvas.height = ARTBOARD;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, ARTBOARD, ARTBOARD);
      const imageData = ctx.getImageData(0, 0, ARTBOARD, ARTBOARD);
      const data = imageData.data;
      const target = hexToRgb(colorHex);
      const targetLum = 0.2126 * target.r + 0.7152 * target.g + 0.0722 * target.b;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        const normalized = lum / 255;
        let lightness;
        if (targetLum < 45) lightness = 0.06 + normalized * 0.30;
        else if (targetLum > 220) lightness = 0.64 + normalized * 0.34;
        else lightness = 0.20 + normalized * 0.68;
        const scale = Math.max(0.12, Math.min(2.8, (lightness * 255) / Math.max(1, targetLum)));
        data[i] = Math.min(255, target.r * scale);
        data[i + 1] = Math.min(255, target.g * scale);
        data[i + 2] = Math.min(255, target.b * scale);
      }
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    });
    imageCache.set(key, promise);
    return promise;
  }

  function resolveHairColor(equippedOverride) {
    try {
      const colorId = equippedOverride?.hairColor || state?.game?.equipped?.hairColor;
      const item = typeof itemById === 'function' ? itemById(colorId) : null;
      return normalizeHex(item?.color || DEFAULT_HAIR_COLOR);
    } catch (_) {
      return DEFAULT_HAIR_COLOR;
    }
  }

  function setupCanvas(canvas) {
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || Number(canvas.dataset.width) || 300);
    const cssHeight = Math.max(1, rect.height || Number(canvas.dataset.height) || 360);
    const width = Math.round(cssWidth * ratio);
    const height = Math.round(cssHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return { ctx, cssWidth, cssHeight };
  }

  function stage(viewport) {
    const fit = Math.min(viewport.cssWidth / ARTBOARD, viewport.cssHeight / ARTBOARD);
    return {
      fit,
      x: (viewport.cssWidth - ARTBOARD * fit) / 2,
      y: (viewport.cssHeight - ARTBOARD * fit) / 2
    };
  }

  function drawArtboardLayer(ctx, img, viewport, transform, alpha = 1) {
    const s = stage(viewport);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x + transform.x * s.fit, s.y + transform.y * s.fit);
    ctx.scale(transform.scale * s.fit, transform.scale * s.fit);
    ctx.drawImage(img, 0, 0, ARTBOARD, ARTBOARD);
    ctx.restore();
  }

  function drawNormalizedBody(ctx, img, viewport, direction) {
    const bounds = BODY_BOUNDS[direction] || BODY_BOUNDS.front;
    const normalizeScale = TARGET_BODY.height / bounds.h;
    const normalizedCenter = (bounds.x + bounds.w / 2) * normalizeScale;
    const normalizedBottom = (bounds.y + bounds.h) * normalizeScale;
    const preX = TARGET_BODY.centerX - normalizedCenter;
    const preY = TARGET_BODY.bottomY - normalizedBottom;
    const s = stage(viewport);
    const t = TRANSFORM.body;

    ctx.save();
    ctx.translate(s.x + t.x * s.fit, s.y + t.y * s.fit);
    ctx.scale(t.scale * s.fit, t.scale * s.fit);
    ctx.translate(preX, preY);
    ctx.scale(normalizeScale, normalizeScale);
    ctx.drawImage(img, 0, 0, ARTBOARD, ARTBOARD);
    ctx.restore();
  }

  async function renderCanvas(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const gender = canvas.dataset.gender || 'male';
    const direction = DIRECTIONS.includes(canvas.dataset.direction) ? canvas.dataset.direction : 'front';
    const hairColor = normalizeHex(canvas.dataset.hairColor || DEFAULT_HAIR_COLOR);
    const look = resolveLook(gender, direction);
    const token = Symbol('render');
    canvasState.set(canvas, token);
    const viewport = setupCanvas(canvas);
    const ctx = viewport.ctx;

    try {
      const [rawHairBack, body, head, face, rawHairFront] = await Promise.all([
        loadImage(look.hairBack), loadImage(look.body), loadImage(look.head), loadImage(look.face), loadImage(look.hairFront)
      ]);
      const [hairBack, hairFront] = await Promise.all([
        tintHairImage(rawHairBack, hairColor), tintHairImage(rawHairFront, hairColor)
      ]);
      if (canvasState.get(canvas) !== token) return;
      ctx.clearRect(0, 0, viewport.cssWidth, viewport.cssHeight);

      const isRear = direction === 'back' || direction === 'backLeft' || direction === 'backRight';
      drawArtboardLayer(ctx, hairBack, viewport, TRANSFORM.hair);
      drawNormalizedBody(ctx, body, viewport, direction);
      drawArtboardLayer(ctx, head, viewport, TRANSFORM.head);
      if (!isRear) drawArtboardLayer(ctx, face, viewport, TRANSFORM.face);
      if (!isRear) drawArtboardLayer(ctx, hairFront, viewport, TRANSFORM.hair);
    } catch (error) {
      console.error(error);
      ctx.clearRect(0, 0, viewport.cssWidth, viewport.cssHeight);
      ctx.fillStyle = '#758078';
      ctx.font = '700 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('角色素材載入失敗', viewport.cssWidth / 2, viewport.cssHeight / 2);
    }
  }

  function renderAll(root = document) {
    root.querySelectorAll('canvas.avatar-canvas').forEach(renderCanvas);
  }

  function canvasMarkup(gender = 'male', size = 'full', equippedOverride = null) {
    const hairColor = resolveHairColor(equippedOverride);
    const direction = ['full', 'mini', 'square'].includes(size) ? currentDirection() : 'front';
    return `<canvas class="avatar-canvas avatar-canvas-${size}" data-gender="${gender}" data-direction="${direction}" data-hair-color="${hairColor}" aria-label="${gender === 'female' ? '女生' : '男生'}角色"></canvas>`;
  }

  window.avatarV123Markup = canvasMarkup;
  window.renderRestartAvatars = renderAll;
  window.avatarSvg = function (size = 'full', equippedOverride = null) { return canvasMarkup(currentGender(), size, equippedOverride); };
  window.avatarSvgForStarter = function (char) { return canvasMarkup(char?.gender || getGender(char?.id), 'select', { hairColor: 'hair-rgb-155-103-055' }); };

  window.renderCharacterChoices = function () {
    const box = $('characterChoices');
    if (!box) return;
    const pending = state.game.pendingCharacter || 'male-1';
    box.innerHTML = `
      <div class="v123-preview-note"><strong>V12.4 六方向角色測試</strong><span>建立角色後，可在角色預覽區左右滑動切換方向。</span></div>
      <section class="starter-group"><h3>♂ 男生角色</h3><div class="starter-grid v1234-starter-grid"><button class="starter-character ${pending === 'male-1' ? 'selected' : ''}" onclick="previewCharacter('male-1')"><span>男生初始 1</span>${canvasMarkup('male', 'select')}</button></div></section>
      <section class="starter-group"><h3>♀ 女生角色</h3><div class="starter-grid v1234-starter-grid"><button class="starter-character ${pending === 'female-1' ? 'selected' : ''}" onclick="previewCharacter('female-1')"><span>女生初始 1</span>${canvasMarkup('female', 'select')}</button></div></section>`;
    requestAnimationFrame(() => renderAll(box));
  };

  const originalConfirm = window.confirmCharacter;
  if (typeof originalConfirm === 'function') {
    window.confirmCharacter = function () {
      originalConfirm();
      if (state.game.character) {
        state.game.avatarEngine = `v${VERSION}-six-direction`;
        state.game.avatarDirection = state.game.avatarDirection || 'front';
        save();
        renderGame(); renderGameHome();
        requestAnimationFrame(() => renderAll());
      }
    };
  }

  window.animateGameAvatar = function () {
    const el = $('gameAvatar');
    if (!el) return;
    el.classList.remove('avatar-wave');
    void el.offsetWidth;
    el.classList.add('avatar-wave');
    window.setTimeout(() => el.classList.remove('avatar-wave'), 1150);
  };

  function setDirection(direction) {
    if (!DIRECTIONS.includes(direction)) return;
    state.game.avatarDirection = direction;
    save();
    renderGame();
    renderGameHome();
    requestAnimationFrame(() => renderAll());
  }

  function rotateDirection(step) {
    const current = currentDirection();
    const index = DIRECTIONS.indexOf(current);
    setDirection(DIRECTIONS[(index + step + DIRECTIONS.length) % DIRECTIONS.length]);
  }

  function attachSwipe() {
    const stageEl = $('gameAvatar');
    if (!stageEl || stageEl.dataset.swipeReady === '1') return;
    stageEl.dataset.swipeReady = '1';
    let startX = 0, startY = 0, tracking = false;
    stageEl.style.touchAction = 'pan-y';
    stageEl.addEventListener('pointerdown', event => {
      tracking = true; startX = event.clientX; startY = event.clientY;
      try { stageEl.setPointerCapture(event.pointerId); } catch (_) {}
    });
    stageEl.addEventListener('pointerup', event => {
      if (!tracking) return;
      tracking = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) >= 34 && Math.abs(dx) > Math.abs(dy) * 1.15) rotateDirection(dx < 0 ? 1 : -1);
      else animateGameAvatar();
    });
    stageEl.addEventListener('pointercancel', () => { tracking = false; });
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.('canvas.avatar-canvas')) renderCanvas(node);
      renderAll(node);
    }
    attachSwipe();
  });

  function boot() {
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      if (state?.game) state.game.avatarDirection = currentDirection();
      if (state?.game?.character) renderGameHome();
    } catch (_) {}
    attachSwipe();
    renderAll();
    requestAnimationFrame(() => renderAll());
  }

  window.addEventListener('resize', () => renderAll());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
