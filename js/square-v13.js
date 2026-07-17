(() => {
  'use strict';

  const CHANNEL_NAME = 'restart-square-v13';
  const MAP_W = 2458;
  const MAP_H = 1229;
  const STREET_MIN_Y = 72;
  const STREET_MAX_Y = 91;
  const START = { x: 48, y: 84 };
  let channel = null;
  let selfUser = null;
  let selfKey = '';
  let position = { ...START };
  let target = { ...START };
  let direction = 'front';
  let moveFrame = 0;
  let lastFrame = 0;
  let lastSync = 0;
  let joined = false;
  let closing = false;
  let heartbeat = null;
  let profileNickname = '';
  const speechTimers = new Map();

  const $id = id => document.getElementById(id);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  function getDisplayName(user) {
    const meta = user?.user_metadata || {};
    return (profileNickname || meta.display_name || meta.full_name || meta.name || 'Restart 玩家').slice(0, 12);
  }

  function getLocalLook() {
    try {
      if (typeof ensureGameState === 'function') ensureGameState();
      const character = (window.STARTER_CHARACTERS || []).find(x => x.id === state?.game?.character);
      const gender = character?.gender || (String(state?.game?.character || '').startsWith('female') ? 'female' : 'male');
      const colorId = state?.game?.equipped?.hairColor;
      const colorItem = typeof itemById === 'function' ? itemById(colorId) : null;
      const eyeId=state?.game?.equipped?.eyeColor;const eyeItem=typeof itemById==='function'?itemById(eyeId):null;return { gender, hairColor: colorItem?.color || '#9B6737', eyeColor:eyeItem?.color||'#6D462E' };
    } catch (_) {
      return { gender: 'male', hairColor: '#9B6737', eyeColor:'#6D462E' };
    }
  }

  function presencePayload() {
    const look = getLocalLook();
    return {
      user_id: selfUser?.id || selfKey,
      name: getDisplayName(selfUser),
      x: position.x,
      y: position.y,
      target_x: target.x,
      target_y: target.y,
      direction,
      moving: Math.hypot(target.x-position.x,target.y-position.y) > 0.15,
      gender: look.gender,
      hair_color: look.hairColor,
      eye_color: look.eyeColor,
      updated_at: new Date().toISOString()
    };
  }

  function flattenPresence(stateMap) {
    const output = [];
    Object.entries(stateMap || {}).forEach(([key, presences]) => {
      const latest = Array.isArray(presences) ? presences[presences.length - 1] : presences;
      if (!latest) return;
      output.push({ ...latest, presenceKey: key });
    });
    return output;
  }

  function playerMarkup(player) {
    const mine = player.user_id === selfUser?.id || player.presenceKey === selfKey;
    const x = clamp(Number(player.x) || 50, 5, 95);
    const y = clamp(Number(player.y) || 82, STREET_MIN_Y, STREET_MAX_Y);
    const depth = Math.round(y * 10);
    const gender = player.gender === 'female' ? 'female' : 'male';
    const color = /^#[0-9a-f]{6}$/i.test(player.hair_color || '') ? player.hair_color : '#9B6737';
    const playerDirection = ['front','right','left'].includes(player.direction) ? player.direction : 'front';
    return `<div class="square-player ${mine ? 'is-me' : ''}" data-user-id="${escapeHtml(player.user_id || player.presenceKey)}" style="left:${x}%;top:${y}%;z-index:${depth}">
      <div class="square-speech" aria-live="polite"></div>
      <div class="square-avatar-wrap">${typeof avatarV123Markup === 'function' ? avatarV123Markup(gender, 'square', { hairColor: null, eyeColor:null }) : ''}</div>
      <div class="square-name">${escapeHtml(player.name || 'Restart 玩家')}</div>
    </div>`;
  }

  function applyCanvasColors(players) {
    const root = $id('squarePlayers');
    if (!root) return;
    const elements = [...root.querySelectorAll('.square-player')];
    elements.forEach((el, index) => {
      const canvas = el.querySelector('canvas.avatar-canvas');
      const player = players[index];
      if (canvas && player) {
        canvas.dataset.gender = player.gender === 'female' ? 'female' : 'male';
        canvas.dataset.hairColor = player.hair_color || '#9B6737';
        canvas.dataset.direction = ['front','right','left'].includes(player.direction) ? player.direction : 'front';
        canvas.dataset.eyeColor = player.eye_color || '#6D462E';
      }
    });
    if (typeof renderRestartAvatars === 'function') requestAnimationFrame(() => renderRestartAvatars(root));
  }

  function renderPlayers() {
    if (!channel) return;
    const players = flattenPresence(channel.presenceState());
    const mine = players.find(player => player.user_id === selfUser?.id || player.presenceKey === selfKey);
    if (mine) Object.assign(mine, { x: position.x, y: position.y, target_x: target.x, target_y: target.y, direction });
    const root = $id('squarePlayers');
    if (!root) return;
    root.innerHTML = players.map(playerMarkup).join('');
    applyCanvasColors(players);
    const count = players.length;
    if ($id('squareOnlineCount')) $id('squareOnlineCount').textContent = `${count} 人在線`;
    if ($id('squareHomeCount')) $id('squareHomeCount').textContent = `${count} 人在線`;
  }

  async function syncTrack() {
    if (!channel || !joined) return;
    await channel.track(presencePayload());
  }

  function chooseDirection(dx, dy) {
    if (Math.abs(dx) < 4) return 'front';
    return dx >= 0 ? 'right' : 'left';
  }

  function movementLoop(now) {
    moveFrame = requestAnimationFrame(movementLoop);
    if (!joined) return;
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const map = $id('squareMap');
    if (!map) return;
    const rect = map.getBoundingClientRect();
    const dxPct = target.x - position.x, dyPct = target.y - position.y;
    const dxPx = dxPct / 100 * rect.width, dyPx = dyPct / 100 * rect.height;
    const distPx = Math.hypot(dxPx, dyPx);
    if (distPx < 1.5) { position = { ...target }; return; }
    direction = chooseDirection(dxPx, dyPx);
    const step = Math.min(distPx, 115 * dt);
    position.x += (dxPx / distPx) * step / rect.width * 100;
    position.y += (dyPx / distPx) * step / rect.height * 100;
    renderPlayers();
    const viewport=$id('squareViewport');
    if(viewport){const playerPx=position.x/100*rect.width;const desired=playerPx-viewport.clientWidth*.5;viewport.scrollLeft += (desired-viewport.scrollLeft)*Math.min(1,dt*4);}
    if (now - lastSync > 90) { lastSync = now; syncTrack().catch(() => {}); }
  }

  function moveFromPointer(event) {
    const map = $id('squareMap');
    if (!map || !joined) return;
    if (event.target.closest('button')) return;
    const rect = map.getBoundingClientRect();
    target.x = clamp(((event.clientX - rect.left) / rect.width) * 100, 5, 95);
    target.y = clamp(((event.clientY - rect.top) / rect.height) * 100, STREET_MIN_Y, STREET_MAX_Y);
    direction = chooseDirection(target.x-position.x, target.y-position.y);
    syncTrack().catch(console.error);
  }

  function setStatus(text, error = false) {
    const el = $id('squareStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('square-error', error);
  }

  async function connectSquare() {
    if (channel || closing) return;
    if (!window.cloud?.auth) {
      setStatus('Supabase 尚未載入', true);
      return;
    }
    const { data, error } = await window.cloud.auth.getUser();
    if (error || !data?.user) {
      setStatus('請先登入後再進入廣場', true);
      return;
    }
    selfUser = data.user;
    selfKey = selfUser.id;
    try { const {data:profile}=await window.cloud.from('profiles').select('display_name').eq('id',selfKey).maybeSingle(); profileNickname=String(profile?.display_name||'').trim(); } catch(_) {}
    const saved = JSON.parse(localStorage.getItem('restart-square-position') || 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) { position = saved; target = { ...saved }; }

    channel = window.cloud.channel(CHANNEL_NAME, {
      config: { presence: { key: selfKey }, broadcast: { self: true } }
    });
    channel
      .on('presence', { event: 'sync' }, renderPlayers)
      .on('presence', { event: 'join' }, renderPlayers)
      .on('presence', { event: 'leave' }, renderPlayers)
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          joined = true;
          setStatus('已連線，大家會即時看到你');
          await syncTrack();
          clearInterval(heartbeat);
          heartbeat = setInterval(() => syncTrack().catch(() => {}), 25000);
          if (!moveFrame) moveFrame = requestAnimationFrame(movementLoop);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setStatus('廣場連線失敗，請檢查網路後重試', true);
        }
      });
  }

  async function disconnectSquare() {
    closing = true;
    clearInterval(heartbeat);
    heartbeat = null;
    localStorage.setItem('restart-square-position', JSON.stringify(position));
    cancelAnimationFrame(moveFrame); moveFrame = 0; lastFrame = 0;
    if (channel) {
      try { await channel.untrack(); } catch (_) {}
      try { await window.cloud.removeChannel(channel); } catch (_) {}
    }
    channel = null;
    joined = false;
    closing = false;
  }

  function openTownBuilding(type){
    // V13.12: building destinations are intentionally unbound until the plaza plan is confirmed.
    if (typeof notify === 'function') notify('建築物功能規劃中，暫時不切換畫面');
  }

  window.openSquare = async function () {
    if (!state?.game?.character) {
      if (typeof notify === 'function') notify('請先建立角色，才能進入廣場');
      if (typeof openGame === 'function') openGame();
      return;
    }
    if (typeof openModal === 'function') openModal('squareModal');
    const map = $id('squareMap');
    const viewport=$id('squareViewport');
    if (map && !map.dataset.bound) {
      map.dataset.bound = '1';
      map.addEventListener('click', e=>{if(!e.target.closest('.building-hitbox')) moveFromPointer(e)});
      map.querySelectorAll('.building-hitbox').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openTownBuilding(btn.dataset.building)}));
    }
    if(viewport && !viewport.dataset.dragBound){
      viewport.dataset.dragBound='1';
      let dragging=false,startX=0,startScroll=0,pendingScroll=null,dragFrame=0;
      const flushDrag=()=>{dragFrame=0;if(pendingScroll!==null){viewport.scrollLeft=pendingScroll;pendingScroll=null}};
      const stopDrag=e=>{if(!dragging)return;dragging=false;viewport.classList.remove('is-dragging');pendingScroll=null;if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0}try{viewport.releasePointerCapture?.(e.pointerId)}catch(_){}};
      viewport.addEventListener('pointerdown',e=>{
        if(e.pointerType==='touch'||e.target.closest('.building-hitbox'))return;
        dragging=true;startX=e.clientX;startScroll=viewport.scrollLeft;viewport.classList.add('is-dragging');viewport.setPointerCapture?.(e.pointerId)
      });
      viewport.addEventListener('pointermove',e=>{
        if(!dragging)return;e.preventDefault();pendingScroll=startScroll-(e.clientX-startX);
        if(!dragFrame)dragFrame=requestAnimationFrame(flushDrag)
      },{passive:false});
      viewport.addEventListener('pointerup',stopDrag);viewport.addEventListener('pointercancel',stopDrag);viewport.addEventListener('lostpointercapture',stopDrag);
    }
    setStatus('正在連線…');
    await connectSquare();
    await window.RestartSquareChat?.start?.();
  };


  function showSpeech(userId, message) {
    const root=$id('squarePlayers'); if(!root)return;
    const el=[...root.querySelectorAll('.square-player')].find(node=>node.dataset.userId===String(userId));
    const bubble=el?.querySelector('.square-speech'); if(!bubble)return;
    bubble.textContent=String(message||'').trim(); bubble.classList.toggle('show',!!bubble.textContent);
    clearTimeout(speechTimers.get(String(userId)));
    speechTimers.set(String(userId),setTimeout(()=>{bubble.classList.remove('show');bubble.textContent='';},5000));
  }
  window.addEventListener('restart:square-speech',e=>showSpeech(e.detail?.user_id,e.detail?.message));
  window.addEventListener('restart:nickname-changed',e=>{profileNickname=e.detail?.nickname||profileNickname;syncTrack().catch(()=>{});});

  window.closeSquare = async function () {
    if (typeof closeModal === 'function') closeModal('squareModal');
    await disconnectSquare();
  };

  window.addEventListener('beforeunload', () => {
    localStorage.setItem('restart-square-position', JSON.stringify(position));
    cancelAnimationFrame(moveFrame); moveFrame = 0; lastFrame = 0;
  });
})();
