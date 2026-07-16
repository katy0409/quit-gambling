/* Restart V13.8 Avatar Engine
   Three-direction head-and-body combined base, swipe direction switching,
   shared Canvas renderer, no separate head/body and no back-hair layer.
*/
(function () {
  'use strict';

  const VERSION = '13.11';
  const ASSET_ROOT = 'assets/avatar';
  const ARTBOARD = 1024;
  const DEFAULT_HAIR_COLOR = '#9B6737';
  const DIRECTIONS = ['left', 'front', 'right'];

  const ASSETS = {
    bases: {
      front: `${ASSET_ROOT}/base/base_front.png`,
      left: `${ASSET_ROOT}/base/base_left.png`,
      right: `${ASSET_ROOT}/base/base_right.png`
    },
    expression: {
      front: `${ASSET_ROOT}/expression/default/default_front.png`,
      left: `${ASSET_ROOT}/expression/default/default_left.png`,
      right: `${ASSET_ROOT}/expression/default/default_right.png`
    },
    maleHair: {
      front: `${ASSET_ROOT}/hair/male/male_hair_001_front.png`,
      left: `${ASSET_ROOT}/hair/male/male_hair_001_left.png`,
      right: `${ASSET_ROOT}/hair/male/male_hair_001_right.png`
    },
    femaleHair: {
      front: `${ASSET_ROOT}/hair/female/female_hair_001_front.png`,
      left: `${ASSET_ROOT}/hair/female/female_hair_001_left.png`,
      right: `${ASSET_ROOT}/hair/female/female_hair_001_right.png`
    }
  };

  const HEAD_THUMB_SLOTS = new Set(['hair','hairColor','eyeColor','expression']);

  /* New base files already use the common 1024 x 1024 artboard. */
  const TRANSFORM = {
    base: { scale: 1, x: 0, y: 0 },
    expression: { scale: 1, x: 0, y: 0 },
    hair: { scale: 1, x: 0, y: 0 }
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
      base: ASSETS.bases[direction] || ASSETS.bases.front,
      face: ASSETS.expression[direction] || ASSETS.expression.front,
      hair: female
        ? (ASSETS.femaleHair[direction] || ASSETS.femaleHair.front)
        : (ASSETS.maleHair[direction] || ASSETS.maleHair.front)
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

  function resolveEyeColor(equippedOverride) {
    try {
      const colorId = equippedOverride?.eyeColor || state?.game?.equipped?.eyeColor;
      const item = typeof itemById === 'function' ? itemById(colorId) : null;
      return normalizeHex(item?.color || '#6D462E');
    } catch (_) { return '#6D462E'; }
  }

  function tintEyeImage(img, colorHex) {
    const key = `eye-tint:${img.src}|${normalizeHex(colorHex)}`;
    if (imageCache.has(key)) return imageCache.get(key);
    const promise = Promise.resolve().then(() => {
      const canvas = document.createElement('canvas');
      canvas.width = ARTBOARD; canvas.height = ARTBOARD;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, ARTBOARD, ARTBOARD);
      const imageData = ctx.getImageData(0, 0, ARTBOARD, ARTBOARD);
      const data = imageData.data, target = hexToRgb(colorHex);
      for (let i=0;i<data.length;i+=4) {
        if (data[i+3]===0) continue;
        const r=data[i],g=data[i+1],b=data[i+2];
        // Only recolour warm brown iris pixels; preserve black outlines, whites and mouth.
        if (r>45 && r>g*1.08 && g>b*1.15 && b<105) {
          const lum=(r+g+b)/3/255;
          const scale=.45+lum*.95;
          data[i]=Math.min(255,target.r*scale);
          data[i+1]=Math.min(255,target.g*scale);
          data[i+2]=Math.min(255,target.b*scale);
        }
      }
      ctx.putImageData(imageData,0,0); return canvas;
    });
    imageCache.set(key,promise); return promise;
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
    // All avatar assets stay on the original 1024 x 1024 artboard.  Instead of
    // resizing/offsetting individual layers, each UI surface uses a camera crop.
    // This keeps base, hair and expression perfectly aligned while allowing the
    // character to appear large in previews and thumbnails.
    let crop = null;
    if (viewport.headCrop) {
      crop = { x: 245, y: 245, width: 534, height: 430 };
    } else if (viewport.renderMode === 'mini') {
      crop = { x: 250, y: 250, width: 524, height: 650 };
    } else if (viewport.renderMode === 'select') {
      crop = { x: 252, y: 235, width: 520, height: 700 };
    } else if (viewport.renderMode === 'square') {
      crop = { x: 252, y: 235, width: 520, height: 700 };
    } else if (viewport.renderMode === 'full') {
      crop = { x: 252, y: 235, width: 520, height: 700 };
    }

    if (!crop) {
      const fit = Math.min(viewport.cssWidth / ARTBOARD, viewport.cssHeight / ARTBOARD);
      return { fit, x: (viewport.cssWidth - ARTBOARD * fit) / 2, y: (viewport.cssHeight - ARTBOARD * fit) / 2 };
    }

    const fit = Math.min(viewport.cssWidth / crop.width, viewport.cssHeight / crop.height);
    const visibleWidth = crop.width * fit;
    const visibleHeight = crop.height * fit;
    return {
      fit,
      x: (viewport.cssWidth - visibleWidth) / 2 - crop.x * fit,
      y: (viewport.cssHeight - visibleHeight) / 2 - crop.y * fit
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

  async function renderCanvas(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const gender = canvas.dataset.gender || 'male';
    const direction = DIRECTIONS.includes(canvas.dataset.direction) ? canvas.dataset.direction : 'front';
    const hairColor = normalizeHex(canvas.dataset.hairColor || DEFAULT_HAIR_COLOR);
    const eyeColor = normalizeHex(canvas.dataset.eyeColor || '#6D462E');
    const look = resolveLook(gender, direction);
    const token = Symbol('render');
    canvasState.set(canvas, token);
    const viewport = setupCanvas(canvas);
    viewport.headCrop = canvas.classList.contains('avatar-canvas-thumb') && HEAD_THUMB_SLOTS.has(canvas.dataset.thumbSlot || '');
    viewport.renderMode = canvas.classList.contains('avatar-canvas-mini') ? 'mini'
      : canvas.classList.contains('avatar-canvas-select') ? 'select'
      : canvas.classList.contains('avatar-canvas-square') ? 'square'
      : canvas.classList.contains('avatar-canvas-full') ? 'full'
      : 'default';
    const ctx = viewport.ctx;

    try {
      const [base, rawFace, rawHair] = await Promise.all([
        loadImage(look.base), loadImage(look.face), loadImage(look.hair)
      ]);
      const [hair, face] = await Promise.all([tintHairImage(rawHair, hairColor), tintEyeImage(rawFace, eyeColor)]);
      if (canvasState.get(canvas) !== token) return;
      ctx.clearRect(0, 0, viewport.cssWidth, viewport.cssHeight);

      drawArtboardLayer(ctx, base, viewport, TRANSFORM.base);
      drawArtboardLayer(ctx, face, viewport, TRANSFORM.expression);
      drawArtboardLayer(ctx, hair, viewport, TRANSFORM.hair);
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
    const eyeColor = resolveEyeColor(equippedOverride);
    const direction = ['full', 'mini', 'square'].includes(size) ? currentDirection() : 'front';
    const thumbSlot = equippedOverride?.__thumbSlot || '';
    return `<canvas class="avatar-canvas avatar-canvas-${size}" data-gender="${gender}" data-direction="${direction}" data-hair-color="${hairColor}" data-eye-color="${eyeColor}" data-thumb-slot="${thumbSlot}" aria-label="${gender === 'female' ? '女生' : '男生'}角色"></canvas>`;
  }

  window.avatarV123Markup = canvasMarkup;
  window.renderRestartAvatars = renderAll;
  window.avatarSvg = function (size = 'full', equippedOverride = null) { return canvasMarkup(currentGender(), size, equippedOverride); };
  window.avatarSvgForStarter = function (char) { return canvasMarkup(char?.gender || getGender(char?.id), 'select', { hairColor: 'hair-rgb-155-103-055' }); };

  window.renderCharacterChoices = function () {
    const box = $('characterChoices');
    if (!box) return;
    const pending = state.game.pendingCharacter || 'male-1';
    const starters = Array.isArray(window.STARTER_CHARACTERS) ? window.STARTER_CHARACTERS : [];
    const card = char => {
      const available = char.id === 'male-1' || char.id === 'female-1';
      if (!available) return `<button class="starter-character is-coming" type="button" disabled><span>${char.name}</span><b class="vertical-coming">製<br>作<br>中</b></button>`;
      return `<button class="starter-character ${pending === char.id ? 'selected' : ''}" onclick="previewCharacter('${char.id}')"><span>${char.name}</span>${canvasMarkup(char.gender, 'select', { hairColor: 'hair-rgb-155-103-055', eyeColor:'eye-brown' })}</button>`;
    };
    box.innerHTML = ['male','female'].map(gender => `<section class="starter-group"><h3>${gender==='male'?'♂ 男生角色':'♀ 女生角色'}</h3><div class="starter-grid v131-starter-row">${starters.filter(x=>x.gender===gender).map(card).join('')}</div></section>`).join('');
    requestAnimationFrame(() => renderAll(box));
  };

  const originalConfirm = window.confirmCharacter;
  if (typeof originalConfirm === 'function') {
    window.confirmCharacter = function () {
      originalConfirm();
      if (state.game.character) {
        state.game.avatarEngine = `v${VERSION}-three-direction`;
        state.game.avatarDirection = state.game.avatarDirection || 'front';
        save();
        renderGame(); renderGameHome();
        requestAnimationFrame(() => renderAll());
      }
    };
  }

  window.animateGameAvatar = function () {};

  function setDirection(direction, persist = true) {
    if (!DIRECTIONS.includes(direction) || direction === currentDirection()) return;
    state.game.avatarDirection = direction;
    if (persist) save();
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
    let lastX = 0, startY = 0, tracking = false, moved = false;
    const STEP = 12;
    stageEl.style.touchAction = 'pan-y';
    stageEl.addEventListener('pointerdown', event => {
      tracking = true; moved = false; lastX = event.clientX; startY = event.clientY;
      try { stageEl.setPointerCapture(event.pointerId); } catch (_) {}
    });
    stageEl.addEventListener('pointermove', event => {
      if (!tracking) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - startY;
      if (Math.abs(dy) > 26 && Math.abs(dy) > Math.abs(dx) * 1.4) return;
      if (Math.abs(dx) >= STEP) {
        moved = true;
        rotateDirection(dx < 0 ? -1 : 1);
        lastX = event.clientX;
      }
    });
    stageEl.addEventListener('pointerup', () => {
      if (!tracking) return;
      tracking = false;
      if (moved) save();
    });
    stageEl.addEventListener('pointercancel', () => { tracking = false; if (moved) save(); });
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
