(() => {
  'use strict';

  const CHANNEL_NAME = 'restart-square-v13';
  const MAP_W = 1000;
  const MAP_H = 620;
  const START = { x: 50, y: 72 };
  let channel = null;
  let selfUser = null;
  let selfKey = '';
  let position = { ...START };
  let joined = false;
  let closing = false;
  let heartbeat = null;
  let waveTimer = null;
  const waving = new Map();

  const $id = id => document.getElementById(id);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  function getDisplayName(user) {
    const meta = user?.user_metadata || {};
    return (meta.display_name || meta.full_name || meta.name || user?.email?.split('@')[0] || 'Restart 玩家').slice(0, 16);
  }

  function getLocalLook() {
    try {
      if (typeof ensureGameState === 'function') ensureGameState();
      const character = (window.STARTER_CHARACTERS || []).find(x => x.id === state?.game?.character);
      const gender = character?.gender || (String(state?.game?.character || '').startsWith('female') ? 'female' : 'male');
      const colorId = state?.game?.equipped?.hairColor;
      const colorItem = typeof itemById === 'function' ? itemById(colorId) : null;
      return { gender, hairColor: colorItem?.color || '#9B6737' };
    } catch (_) {
      return { gender: 'male', hairColor: '#9B6737' };
    }
  }

  function presencePayload() {
    const look = getLocalLook();
    return {
      user_id: selfUser?.id || selfKey,
      name: getDisplayName(selfUser),
      x: position.x,
      y: position.y,
      gender: look.gender,
      hair_color: look.hairColor,
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
    const y = clamp(Number(player.y) || 72, 28, 91);
    const depth = Math.round(y * 10);
    const gender = player.gender === 'female' ? 'female' : 'male';
    const color = /^#[0-9a-f]{6}$/i.test(player.hair_color || '') ? player.hair_color : '#9B6737';
    const isWaving = waving.has(player.user_id || player.presenceKey);
    return `<div class="square-player ${mine ? 'is-me' : ''} ${isWaving ? 'is-waving' : ''}" data-user-id="${escapeHtml(player.user_id || player.presenceKey)}" style="left:${x}%;top:${y}%;z-index:${depth}">
      <div class="square-name">${mine ? '<b>你</b> · ' : ''}${escapeHtml(player.name || 'Restart 玩家')}</div>
      <div class="square-avatar-wrap">${typeof avatarV123Markup === 'function' ? avatarV123Markup(gender, 'square', { hairColor: null }) : ''}<span class="square-wave-emoji">👋</span></div>
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
      }
    });
    if (typeof renderRestartAvatars === 'function') requestAnimationFrame(() => renderRestartAvatars(root));
  }

  function renderPlayers() {
    if (!channel) return;
    const players = flattenPresence(channel.presenceState());
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

  function moveFromPointer(event) {
    const map = $id('squareMap');
    if (!map || !joined) return;
    if (event.target.closest('button')) return;
    const rect = map.getBoundingClientRect();
    position.x = clamp(((event.clientX - rect.left) / rect.width) * 100, 5, 95);
    position.y = clamp(((event.clientY - rect.top) / rect.height) * 100, 28, 91);
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
    const saved = JSON.parse(localStorage.getItem('restart-square-position') || 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = saved;

    channel = window.cloud.channel(CHANNEL_NAME, {
      config: { presence: { key: selfKey }, broadcast: { self: true } }
    });
    channel
      .on('presence', { event: 'sync' }, renderPlayers)
      .on('presence', { event: 'join' }, renderPlayers)
      .on('presence', { event: 'leave' }, renderPlayers)
      .on('broadcast', { event: 'wave' }, ({ payload }) => {
        const key = payload?.user_id;
        if (!key) return;
        waving.set(key, Date.now());
        renderPlayers();
        setTimeout(() => { waving.delete(key); renderPlayers(); }, 1400);
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          joined = true;
          setStatus('已連線，大家會即時看到你');
          await syncTrack();
          clearInterval(heartbeat);
          heartbeat = setInterval(() => syncTrack().catch(() => {}), 25000);
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
    if (channel) {
      try { await channel.untrack(); } catch (_) {}
      try { await window.cloud.removeChannel(channel); } catch (_) {}
    }
    channel = null;
    joined = false;
    closing = false;
  }

  window.openSquare = async function () {
    if (!state?.game?.character) {
      if (typeof notify === 'function') notify('請先建立角色，才能進入廣場');
      if (typeof openGame === 'function') openGame();
      return;
    }
    if (typeof openModal === 'function') openModal('squareModal');
    const map = $id('squareMap');
    if (map && !map.dataset.bound) {
      map.dataset.bound = '1';
      map.addEventListener('pointerdown', moveFromPointer);
    }
    setStatus('正在連線…');
    await connectSquare();
  };

  window.closeSquare = async function () {
    if (typeof closeModal === 'function') closeModal('squareModal');
    await disconnectSquare();
  };

  window.squareWave = async function () {
    if (!channel || !joined) return;
    clearTimeout(waveTimer);
    waving.set(selfUser.id, Date.now());
    renderPlayers();
    await channel.send({ type: 'broadcast', event: 'wave', payload: { user_id: selfUser.id, name: getDisplayName(selfUser) } });
    waveTimer = setTimeout(() => { waving.delete(selfUser.id); renderPlayers(); }, 1400);
  };

  window.addEventListener('beforeunload', () => {
    localStorage.setItem('restart-square-position', JSON.stringify(position));
  });
})();
