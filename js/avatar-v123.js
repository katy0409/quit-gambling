/* Restart V13.8 Avatar Engine
   Three-direction head-and-body combined base, swipe direction switching,
   shared Canvas renderer, no separate head/body and no back-hair layer.
*/
(function () {
  'use strict';

  const VERSION = '13.25.1';
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
    expressionMaleSmile1: {
      front: `${ASSET_ROOT}/expression/male-smile-1/male-smile-1_front.png`,
      left: `${ASSET_ROOT}/expression/male-smile-1/male-smile-1_left.png`,
      right: `${ASSET_ROOT}/expression/male-smile-1/male-smile-1_right.png`
    },
    expressionFemaleSmile1: {
      front: `${ASSET_ROOT}/expression/female-smile-1/female-smile-1_front.png`,
      left: `${ASSET_ROOT}/expression/female-smile-1/female-smile-1_left.png`,
      right: `${ASSET_ROOT}/expression/female-smile-1/female-smile-1_right.png`
    },
    maleHair: {
      front: `${ASSET_ROOT}/hair/male/male_hair_001_front.png`,
      left: `${ASSET_ROOT}/hair/male/male_hair_001_left.png`,
      right: `${ASSET_ROOT}/hair/male/male_hair_001_right.png`
    },
    top: {
      front: `${ASSET_ROOT}/top/default/default_front.png`,
      left: `${ASSET_ROOT}/top/default/default_left.png`,
      right: `${ASSET_ROOT}/top/default/default_right.png`
    },
    bottom: {
      front: `${ASSET_ROOT}/bottom/default/default_front.png`,
      left: `${ASSET_ROOT}/bottom/default/default_left.png`,
      right: `${ASSET_ROOT}/bottom/default/default_right.png`
    },
    shopTopWhite: {front:`${ASSET_ROOT}/top/white-t/white-t_front.png`,left:`${ASSET_ROOT}/top/white-t/white-t_left.png`,right:`${ASSET_ROOT}/top/white-t/white-t_right.png`},
    shopTopMale1: {front:`${ASSET_ROOT}/top/male-top-1/male-top-1_front.png`},
    shopBottomBlack: {front:`${ASSET_ROOT}/bottom/black-shorts/black-shorts_front.png`,left:`${ASSET_ROOT}/bottom/black-shorts/black-shorts_left.png`,right:`${ASSET_ROOT}/bottom/black-shorts/black-shorts_right.png`},
    shopBottomMale1: {front:`${ASSET_ROOT}/bottom/male-bottom-1/male-bottom-1_front.png`},
    shoes: {
      front: `${ASSET_ROOT}/shoes/default/default_front.png`,
      left: `${ASSET_ROOT}/shoes/default/default_left.png`,
      right: `${ASSET_ROOT}/shoes/default/default_right.png`
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

  function resolveExpressionAsset(gender, expressionId, direction) {
    const map = expressionId === 'expression-male-smile-1'
      ? ASSETS.expressionMaleSmile1
      : expressionId === 'expression-female-smile-1'
        ? ASSETS.expressionFemaleSmile1
        : ASSETS.expression;
    return map[direction] || map.front;
  }

  function resolveLook(gender, direction) {
    const female = gender === 'female';
    return {
      gender,
      direction,
      base: ASSETS.bases[direction] || ASSETS.bases.front,
      face: ASSETS.expression[direction] || ASSETS.expression.front,
      top: ASSETS.top[direction] || ASSETS.top.front,
      bottom: ASSETS.bottom[direction] || ASSETS.bottom.front,
      shoes: ASSETS.shoes[direction] || ASSETS.shoes.front,
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


  const SKIN_COLORS={porcelain:'#fff4e8',fair:'#f5dcc8',ivory:'#edc9aa',natural:'#deb08d',wheat:'#c98b62',healthy:'#ad704b',bronze:'#8d5638',deep:'#70452f'};
  function resolveSkinTone(){try{return state?.game?.pendingSkinTone||state?.game?.skinTone||'fair'}catch(_){return 'fair'}}
  function tintSkinImage(img,tone){const color=SKIN_COLORS[tone]||SKIN_COLORS.fair;const key=`skin:${img.src}|${color}`;if(imageCache.has(key))return imageCache.get(key);const promise=Promise.resolve().then(()=>{const canvas=document.createElement('canvas');canvas.width=ARTBOARD;canvas.height=ARTBOARD;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,ARTBOARD,ARTBOARD);const d=ctx.getImageData(0,0,ARTBOARD,ARTBOARD),px=d.data,t=hexToRgb(color);for(let i=0;i<px.length;i+=4){if(px[i+3]===0)continue;const max=Math.max(px[i],px[i+1],px[i+2]),min=Math.min(px[i],px[i+1],px[i+2]);if(max-min<55&&max>105){const lum=(px[i]+px[i+1]+px[i+2])/765;const k=.68+lum*.5;px[i]=Math.min(255,t.r*k);px[i+1]=Math.min(255,t.g*k);px[i+2]=Math.min(255,t.b*k)}}ctx.putImageData(d,0,0);return canvas});imageCache.set(key,promise);return promise}

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
      crop = { x: 245, y: 220, width: 534, height: 735 };
    } else if (viewport.renderMode === 'select') {
      crop = { x: 250, y: 205, width: 524, height: 790 };
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
      x: (viewport.cssWidth - visibleWidth) / 2 - crop.x * fit + (viewport.renderMode === 'select' && viewport.gender === 'female' ? -6 : 0),
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
    const equippedTop=canvas.dataset.top||'',equippedBottom=canvas.dataset.bottom||'',equippedSet=canvas.dataset.set||'',equippedShoes=canvas.dataset.shoes||'',equippedExpression=canvas.dataset.expression||'expression-soft';
    const topAssetMap=equippedTop==='top-male-1'?ASSETS.shopTopMale1:equippedTop==='top-white'?ASSETS.shopTopWhite:null;
    const bottomAssetMap=equippedBottom==='bottom-male-1'?ASSETS.shopBottomMale1:equippedBottom==='bottom-black'?ASSETS.shopBottomBlack:null;
    // Front-only preview items intentionally reuse the front artwork until the user supplies left/right assets.
    const topSrc=topAssetMap?(topAssetMap[direction]||topAssetMap.front):look.top;
    const bottomSrc=bottomAssetMap?(bottomAssetMap[direction]||bottomAssetMap.front):look.bottom;
    const hideSeparateClothes=!!equippedSet;
    const token = Symbol('render');
    canvasState.set(canvas, token);
    const viewport = setupCanvas(canvas);
    // V13.12: wardrobe and shop cards always render the full 1024×1024 artboard.
    viewport.headCrop = false;
    viewport.gender = gender;
    viewport.renderMode = canvas.classList.contains('avatar-canvas-mini') ? 'mini'
      : canvas.classList.contains('avatar-canvas-select') ? 'select'
      : canvas.classList.contains('avatar-canvas-square') ? 'square'
      : canvas.classList.contains('avatar-canvas-full') ? 'full'
      : 'default';
    const ctx = viewport.ctx;

    try {
      const [rawBase, top, bottom, shoes, rawFace, rawHair] = await Promise.all([
        loadImage(look.base), loadImage(topSrc), loadImage(bottomSrc), equippedShoes ? loadImage(look.shoes) : Promise.resolve(null), loadImage(resolveExpressionAsset(gender, equippedExpression, direction)), loadImage(look.hair)
      ]);
      const skinTone = canvas.dataset.skinTone || resolveSkinTone();
      const [base,hair, face] = await Promise.all([tintSkinImage(rawBase,skinTone),tintHairImage(rawHair, hairColor), tintEyeImage(rawFace, eyeColor)]);
      if (canvasState.get(canvas) !== token) return;
      ctx.clearRect(0, 0, viewport.cssWidth, viewport.cssHeight);

      // V13.23 fixed layer order: Base → Expression → Shoes → Bottom → Top → Accessory (reserved) → Hair.
      drawArtboardLayer(ctx, base, viewport, TRANSFORM.base);
      drawArtboardLayer(ctx, face, viewport, TRANSFORM.expression);
      if(shoes) drawArtboardLayer(ctx, shoes, viewport, TRANSFORM.base);
      if(!hideSeparateClothes){drawArtboardLayer(ctx, bottom, viewport, TRANSFORM.base);drawArtboardLayer(ctx, top, viewport, TRANSFORM.base);}
      // Accessory layer is intentionally reserved until accessory image assets are added.
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
    let eq={};try{eq=equippedOverride||state?.game?.equipped||{}}catch(_){eq=equippedOverride||{}}
    const skinTone = resolveSkinTone();
    return `<canvas class="avatar-canvas avatar-canvas-${size}" data-gender="${gender}" data-direction="${direction}" data-hair-color="${hairColor}" data-eye-color="${eyeColor}" data-skin-tone="${skinTone}" data-thumb-slot="${thumbSlot}" data-top="${eq.top||''}" data-bottom="${eq.bottom||''}" data-set="${eq.set||''}" data-shoes="${eq.shoes||''}" data-expression="${eq.expression||'expression-soft'}" aria-label="${gender === 'female' ? '女生' : '男生'}角色"></canvas>`;
  }

  window.avatarV123Markup = canvasMarkup;
  window.renderRestartAvatars = renderAll;
  window.avatarSvg = function (size = 'full', equippedOverride = null) { return canvasMarkup(currentGender(), size, equippedOverride); };
  window.avatarSvgForStarter = function (char) { return canvasMarkup(char?.gender || getGender(char?.id), 'select', { hairColor: 'hair-rgb-155-103-055' }); };

  window.renderCharacterChoices = function () {
    if (typeof renderSkinToneChoices === 'function') renderSkinToneChoices();
    const box = $('characterChoices');
    if (!box) return;
    const pending = state.game.pendingCharacter || '';
    const starters = Array.isArray(window.STARTER_CHARACTERS) ? window.STARTER_CHARACTERS : [];
    const card = char => `<button type="button" class="starter-character ${pending === char.id ? 'selected' : ''}" onclick="previewCharacter('${char.id}')"><span>${char.name}</span>${canvasMarkup(char.gender, 'select', { hairColor: 'hair-rgb-155-103-055', eyeColor:'eye-brown' })}</button>`;
    box.innerHTML = `<div class="starter-choice-columns">${['male','female'].map(gender => {
      const char = starters.find(x => x.gender === gender && (x.id === 'male-1' || x.id === 'female-1'));
      return `<section class="starter-group starter-gender-column"><h3><span class="gender-symbol">${gender==='male'?'♂':'♀'}</span><span>${gender==='male'?'男生角色':'女生角色'}</span></h3><div class="starter-grid v131-starter-row">${char ? card(char) : ''}</div></section>`;
    }).join('')}</div>`;
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
