/* Restart V12.3.4 Avatar Engine
   - Uses a fixed 1024 × 1024 logical canvas.
   - Every source PNG stays on the same 1024 × 1024 artboard.
   - Body and head groups use separate transforms so the final avatar matches
     the approved 2.5D chibi proportion while keeping the neck connected.
   - The same renderer is used by character selection, homepage, wardrobe,
     shop thumbnail and full preview.
*/
(function () {
  'use strict';

  const VERSION = '12.3.4';
  const ASSET_ROOT = 'assets/avatar';
  const ARTBOARD = 1024;

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
    const look = resolveLook(gender);
    const token = Symbol('render');
    canvasState.set(canvas, token);

    const viewport = setupCanvas(canvas);
    const ctx = viewport.ctx;

    try {
      const [hairBack, body, head, face, hairFront] = await Promise.all([
        loadImage(look.hairBack),
        loadImage(look.body),
        loadImage(look.head),
        loadImage(look.face),
        loadImage(look.hairFront)
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

  function canvasMarkup(gender = 'male', size = 'full') {
    return `<canvas class="avatar-canvas avatar-canvas-${size}" data-gender="${gender}" aria-label="${gender === 'female' ? '女生' : '男生'}角色"></canvas>`;
  }

  window.avatarV123Markup = canvasMarkup;
  window.renderRestartAvatars = renderAll;

  // Replace the former temporary SVG/PNG renderer everywhere.
  window.avatarSvg = function (size = 'full') {
    return canvasMarkup(currentGender(), size);
  };

  window.avatarSvgForStarter = function (char) {
    return canvasMarkup(char?.gender || getGender(char?.id), 'select');
  };

  window.renderCharacterChoices = function () {
    const box = $('characterChoices');
    if (!box) return;
    const pending = state.game.pendingCharacter || 'male-1';
    box.innerHTML = `
      <div class="v123-preview-note">
        <strong>V12.3.4 正式比例預覽</strong>
        <span>採固定 1024 × 1024 座標、腳底 Y=920、中心 X=512。商城與衣櫃會共用同一個角色引擎。</span>
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
