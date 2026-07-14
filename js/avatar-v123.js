/* Restart V12.3.5 Avatar Engine
   - Uses a fixed 1024 × 1024 logical canvas.
   - Every source PNG stays on the same 1024 × 1024 artboard.
   - Body and head groups use separate transforms so the final avatar matches
     the approved 2.5D chibi proportion while keeping the neck connected.
   - The same renderer is used by character selection, homepage, wardrobe,
     shop thumbnail and full preview.
*/
(function () {
  'use strict';

  const VERSION = '12.3.5';
  const ASSET_ROOT = 'assets/avatar';
  const ARTBOARD = 1024;
  const DEFAULT_HAIR_COLOR = '#9B6737';

  const ASSETS = {
    body: `${ASSET_ROOT}/body/body_base.png`,
    head: `${ASSET_ROOT}/head/head_base.png`,
    maleFace: `${ASSET_ROOT}/face/male_face_default.png`,
    femaleFace: `${ASSET_ROOT}/face/female_face_default.png`,
    maleHairFront: `${ASSET_ROOT}/hair/male/male_hair_001_front.png`,
    maleHairBack: `${ASSET_ROOT}/hair/male/male_hair_001_back.png`,
    femaleHairFront: `${ASSET_ROOT}/hair/female/female_hair_001_front.png`,
    femaleHairBack: `${ASSET_ROOT}/hair/female/female_hair_001_back.png`
  };

  /*
    Approved avatar coordinate system (1024 × 1024):
    - center X: 512
    - foot line: about Y 920
    - head visible center: about Y 305
    - body visible begins around Y 425

    Source PNGs were generated independently, so we normalize them here.
    These values are centralized and can be fine-tuned later without touching
    any wardrobe or shop code.
  */
  const TRANSFORM = {
    body: { scale: 0.78, x: 110, y: 258 },
    head: { scale: 0.78, x: 112, y: 50 }
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
    if (typeof characterId === 'string' && characterId.startsWith('female')) return 'female';
    return 'male';
  }

  function currentGender() {
    try {
      const char = (typeof STARTER_CHARACTERS !== 'undefined' &&
        STARTER_CHARACTERS.find(item => item.id === state.game.character));
      return char?.gender || getGender(state.game.character);
    } catch (_) {
      return 'male';
    }
  }

  function resolveLook(gender) {
    const female = gender === 'female';
    return {
      gender,
      body: ASSETS.body,
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
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      return ('#' + raw.slice(1).split('').map(ch => ch + ch).join('')).toUpperCase();
    }
    return DEFAULT_HAIR_COLOR;
  }

  function hexToRgb(hex) {
    const clean = normalizeHex(hex).slice(1);
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function tintHairImage(img, colorHex) {
    const key = `${img.src}|${normalizeHex(colorHex)}`;
    if (imageCache.has(`tint:${key}`)) return imageCache.get(`tint:${key}`);
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
        if (targetLum < 45) {
          lightness = 0.06 + normalized * 0.30;
        } else if (targetLum > 220) {
          lightness = 0.64 + normalized * 0.34;
        } else {
          lightness = 0.20 + normalized * 0.68;
        }
        const scale = Math.max(0.12, Math.min(2.8, (lightness * 255) / Math.max(1, targetLum)));
        data[i] = Math.min(255, target.r * scale);
        data[i + 1] = Math.min(255, target.g * scale);
        data[i + 2] = Math.min(255, target.b * scale);
      }
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    });
    imageCache.set(`tint:${key}`, promise);
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
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return { ctx, cssWidth, cssHeight };
  }

  function drawArtboardLayer(ctx, img, viewport, transform, alpha = 1) {
    const { cssWidth, cssHeight } = viewport;
    const fit = Math.min(cssWidth / ARTBOARD, cssHeight / ARTBOARD);
    const stageWidth = ARTBOARD * fit;
    const stageHeight = ARTBOARD * fit;
    const stageX = (cssWidth - stageWidth) / 2;
    const stageY = (cssHeight - stageHeight) / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(stageX + transform.x * fit, stageY + transform.y * fit);
    ctx.scale(transform.scale * fit, transform.scale * fit);
    ctx.drawImage(img, 0, 0, ARTBOARD, ARTBOARD);
    ctx.restore();
  }

  async function renderCanvas(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const gender = canvas.dataset.gender || 'male';
    const hairColor = normalizeHex(canvas.dataset.hairColor || DEFAULT_HAIR_COLOR);
    const look = resolveLook(gender);
    const token = Symbol('render');
    canvasState.set(canvas, token);

    const viewport = setupCanvas(canvas);
    const ctx = viewport.ctx;

    try {
      const [rawHairBack, body, head, face, rawHairFront] = await Promise.all([
        loadImage(look.hairBack),
        loadImage(look.body),
        loadImage(look.head),
        loadImage(look.face),
        loadImage(look.hairFront)
      ]);
      const [hairBack, hairFront] = await Promise.all([
        tintHairImage(rawHairBack, hairColor),
        tintHairImage(rawHairFront, hairColor)
      ]);
      if (canvasState.get(canvas) !== token) return;

      ctx.clearRect(0, 0, viewport.cssWidth, viewport.cssHeight);

      // Correct RPG layering order.
      drawArtboardLayer(ctx, hairBack, viewport, TRANSFORM.head);
      drawArtboardLayer(ctx, body, viewport, TRANSFORM.body);
      drawArtboardLayer(ctx, head, viewport, TRANSFORM.head);
      drawArtboardLayer(ctx, face, viewport, TRANSFORM.head);
      drawArtboardLayer(ctx, hairFront, viewport, TRANSFORM.head);
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
    return `<canvas class="avatar-canvas avatar-canvas-${size}" data-gender="${gender}" data-hair-color="${hairColor}" aria-label="${gender === 'female' ? '女生' : '男生'}角色"></canvas>`;
  }

  window.avatarV123Markup = canvasMarkup;
  window.renderRestartAvatars = renderAll;

  // Replace the former temporary SVG/PNG renderer everywhere.
  window.avatarSvg = function (size = 'full', equippedOverride = null) {
    return canvasMarkup(currentGender(), size, equippedOverride);
  };

  window.avatarSvgForStarter = function (char) {
    return canvasMarkup(char?.gender || getGender(char?.id), 'select', { hairColor: 'hair-rgb-155-103-055' });
  };

  window.renderCharacterChoices = function () {
    const box = $('characterChoices');
    if (!box) return;
    const pending = state.game.pendingCharacter || 'male-1';
    box.innerHTML = `
      <div class="v123-preview-note">
        <strong>V12.3.5 八色髮色試染</strong>
        <span>髮色由同一張棕色母版即時染色；商城、衣櫃與角色預覽使用相同結果。</span>
      </div>
      <section class="starter-group">
        <h3>♂ 男生角色</h3>
        <div class="starter-grid v1234-starter-grid">
          <button class="starter-character ${pending === 'male-1' ? 'selected' : ''}" onclick="previewCharacter('male-1')">
            <span>男生初始 1</span>${canvasMarkup('male', 'select')}
          </button>
        </div>
      </section>
      <section class="starter-group">
        <h3>♀ 女生角色</h3>
        <div class="starter-grid v1234-starter-grid">
          <button class="starter-character ${pending === 'female-1' ? 'selected' : ''}" onclick="previewCharacter('female-1')">
            <span>女生初始 1</span>${canvasMarkup('female', 'select')}
          </button>
        </div>
      </section>`;
    requestAnimationFrame(() => renderAll(box));
  };

  const originalConfirm = window.confirmCharacter;
  if (typeof originalConfirm === 'function') {
    window.confirmCharacter = function () {
      originalConfirm();
      if (state.game.character) {
        state.game.avatarEngine = `v${VERSION}-canvas-anchor`;
        save();
        renderGame();
        renderGameHome();
        requestAnimationFrame(() => renderAll());
      }
    };
  }

  // Interaction: wave. The current body is a single PNG, so V12.3.4 uses a
  // clean body sway + hand cue. When a separate arm layer is supplied later,
  // the same event can animate that actual arm without changing the UI.
  window.animateGameAvatar = function () {
    const el = $('gameAvatar');
    if (!el) return;
    el.classList.remove('avatar-wave');
    void el.offsetWidth;
    el.classList.add('avatar-wave');
    window.setTimeout(() => el.classList.remove('avatar-wave'), 1150);
  };

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('canvas.avatar-canvas')) renderCanvas(node);
        renderAll(node);
      }
    }
  });

  function boot() {
    observer.observe(document.body, { childList: true, subtree: true });
    renderAll();
    try {
      if (state?.game?.character) renderGameHome();
    } catch (error) {
      console.warn('Avatar initial render skipped', error);
    }
    requestAnimationFrame(() => renderAll());
  }

  window.addEventListener('resize', () => renderAll());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
