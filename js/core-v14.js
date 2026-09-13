/* Restart V13.27 — 核心層：帳號分離儲存、容量保護、圖片雲端儲存、整體雲端備援同步 */
(function () {
  'use strict';

  const LEGACY_KEY = 'restart-v6-data';
  const ACTIVE_HINT = 'restart-active-store';
  const BUCKET = 'restart-images';
  const SNAP_TABLE = 'app_snapshots';

  function toast(msg) {
    if (typeof window.notify === 'function') window.notify(msg);
    else console.warn(msg);
  }

  /* ---------------- 1. 帳號分離的本機儲存（修正：同手機換帳號會混資料） ---------------- */
  // 舊版所有帳號共用 'restart-v6-data'，B 登入後會看到 A 的負債與日記。
  // 現在每個帳號有自己的 key；開機時先用上次登入的 key，避免畫面閃一下空資料。

  let currentKey = localStorage.getItem(ACTIVE_HINT) || LEGACY_KEY;
  let quotaWarned = false;

  function accountKey(userId) {
    return userId ? `${LEGACY_KEY}-${userId}` : LEGACY_KEY;
  }

  function read() {
    try {
      return localStorage.getItem(currentKey);
    } catch (e) {
      console.warn('讀取本機資料失敗', e);
      return null;
    }
  }

  function write(value) {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      localStorage.setItem(currentKey, json);
      quotaWarned = false;
      return true;
    } catch (e) {
      // 修正：舊版寫入失敗仍會顯示「已儲存」，重新整理後資料卻不見了。
      console.error('本機儲存失敗（可能已超出容量）', e);
      if (!quotaWarned) {
        quotaWarned = true;
        toast('手機儲存空間已滿，這次的變更沒有存進手機。請登入以改用雲端儲存，或刪除部分照片。');
      }
      window.dispatchEvent(new CustomEvent('restart:storage-full'));
      return false;
    }
  }

  function clear() {
    try { localStorage.removeItem(currentKey); } catch (e) { console.warn(e); }
  }

  // 切換到某個帳號的資料空間。回傳 true 表示 key 有變動（呼叫端需重新載入 state）。
  function bindUser(userId) {
    const next = accountKey(userId);
    if (next === currentKey) {
      localStorage.setItem(ACTIVE_HINT, next);
      return false;
    }
    if (userId && !localStorage.getItem(next)) {
      // 這個帳號第一次在這支手機登入：把還沒歸屬的舊資料搬過來，只搬一次。
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        localStorage.setItem(next, legacy);
        localStorage.removeItem(LEGACY_KEY);
        console.info('已將未歸屬的本機資料移轉到目前帳號');
      }
    }
    currentKey = next;
    localStorage.setItem(ACTIVE_HINT, next);
    return true;
  }

  window.RestartStore = {
    key: () => currentKey,
    legacyKey: LEGACY_KEY,
    read,
    write,
    clear,
    bindUser
  };

  /* ---------------- 2. 圖片改存 Supabase Storage（修正：base64 撐爆 localStorage） ---------------- */
  // 舊版把封面、SOS 照片與收據以 base64 存在 localStorage，Safari 約 5MB 就滿。
  // 現在登入後一律上傳到私有 bucket，本機只留 'sb:<路徑>'；未登入時才退回 base64。

  const signedCache = new Map();

  async function currentUser() {
    try {
      const { data } = await window.cloud.auth.getUser();
      return data?.user || null;
    } catch (e) {
      return null;
    }
  }

  function isCloudRef(ref) {
    return typeof ref === 'string' && ref.startsWith('sb:');
  }

  async function resolveImage(ref) {
    if (!ref) return '';
    if (!isCloudRef(ref)) return ref;
    const path = ref.slice(3);
    const hit = signedCache.get(path);
    if (hit && hit.expires > Date.now()) return hit.url;
    try {
      const { data, error } = await window.cloud.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) return '';
      signedCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
      return data.signedUrl;
    } catch (e) {
      console.warn('取得圖片網址失敗', e);
      return '';
    }
  }

  async function applyImage(el, ref) {
    if (!el) return '';
    const url = await resolveImage(ref);
    el.src = url || '';
    if (el.tagName === 'IMG' && el.dataset.hideWhenEmpty === '1') {
      el.style.display = url ? 'block' : 'none';
    }
    return url;
  }

  // 把容器裡所有 <img data-img-ref="..."> 換成實際網址。
  async function hydrateImages(root) {
    const scope = root || document;
    const targets = [...scope.querySelectorAll('img[data-img-ref]')];
    await Promise.all(targets.map(el => applyImage(el, el.dataset.imgRef)));
  }

  async function uploadImage(file, kind = 'photo', max = 1200, quality = 0.78) {
    if (!file) return '';
    const dataUrl = typeof window.fileToData === 'function' ? await window.fileToData(file, max, quality) : '';
    if (!dataUrl) return '';
    const user = await currentUser();
    if (!user) return dataUrl; // 未登入：暫存本機，登入後再上傳
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${user.id}/${kind}/${newId()}.jpg`;
      const { error } = await window.cloud.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false
      });
      if (error) throw error;
      return 'sb:' + path;
    } catch (e) {
      console.warn('圖片上傳失敗，改存本機', e);
      return dataUrl;
    }
  }

  async function removeImage(ref) {
    if (!isCloudRef(ref)) return;
    const path = ref.slice(3);
    signedCache.delete(path);
    try { await window.cloud.storage.from(BUCKET).remove([path]); } catch (e) { console.warn('刪除圖片失敗', e); }
  }

  // 登入後把還留在本機的 base64 圖片搬上雲端，釋放 localStorage 空間。
  async function migrateLocalImages() {
    const app = window.RestartApp;
    if (!app) return false;
    const user = await currentUser();
    if (!user) return false;
    const state = app.getState();
    let changed = false;

    const push = async (dataUrl, kind) => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const path = `${user.id}/${kind}/${newId()}.jpg`;
        const { error } = await window.cloud.storage.from(BUCKET).upload(path, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });
        if (error) throw error;
        return 'sb:' + path;
      } catch (e) {
        console.warn('圖片移轉失敗', e);
        return '';
      }
    };

    if (typeof state.heroPhoto === 'string' && state.heroPhoto.startsWith('data:')) {
      const ref = await push(state.heroPhoto, 'hero');
      if (ref) { state.heroPhoto = ref; changed = true; }
    }
    if (Array.isArray(state.photos)) {
      for (let i = 0; i < state.photos.length; i += 1) {
        const p = state.photos[i];
        if (typeof p === 'string' && p.startsWith('data:')) {
          const ref = await push(p, 'sos');
          if (ref) { state.photos[i] = ref; changed = true; }
        }
      }
    }
    if (Array.isArray(state.transactions)) {
      for (const tx of state.transactions) {
        if (typeof tx.receipt === 'string' && tx.receipt.startsWith('data:')) {
          const ref = await push(tx.receipt, 'receipt');
          if (ref) { tx.receipt = ref; changed = true; }
        }
      }
    }
    if (changed) app.persistLocal();
    return changed;
  }

  window.RestartImages = {
    bucket: BUCKET,
    upload: uploadImage,
    remove: removeImage,
    resolve: resolveImage,
    apply: applyImage,
    hydrate: hydrateImages,
    migrateLocal: migrateLocalImages,
    isCloudRef
  };

  /* ---------------- 3. 全資料雲端備援（修正：資料只存在手機，Safari 會清掉） ---------------- */
  // Safari 對 PWA 以外的網站，7 天沒造訪就會清除 localStorage。
  // 這裡用一張 app_snapshots 表做整份快照同步，換手機或被清掉都能還原。

  let pushTimer = null;
  let pushing = false;
  let syncUserId = '';

  function meta() {
    const app = window.RestartApp;
    if (!app) return null;
    const state = app.getState();
    state.sync = state.sync || { revision: 0, pulledAt: '', dirtyAt: '' };
    return state.sync;
  }

  function markDirty() {
    const m = meta();
    if (!m) return;
    m.dirtyAt = new Date().toISOString();
    schedulePush();
  }

  // 快照不放 base64 圖片，避免 payload 過大（雲端圖片只是短短的 sb: 路徑）。
  function snapshotPayload(state) {
    const copy = JSON.parse(JSON.stringify(state));
    const strip = v => (typeof v === 'string' && v.startsWith('data:') ? '' : v);
    copy.heroPhoto = strip(copy.heroPhoto);
    if (Array.isArray(copy.photos)) copy.photos = copy.photos.map(strip).filter(Boolean);
    if (Array.isArray(copy.transactions)) copy.transactions.forEach(tx => { tx.receipt = strip(tx.receipt); });
    return copy;
  }

  function schedulePush() {
    if (!syncUserId) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushSnapshot().catch(e => console.warn('快照同步失敗', e)); }, 4000);
  }

  async function pushSnapshot() {
    const app = window.RestartApp;
    if (!app || !syncUserId || pushing) return null;
    pushing = true;
    try {
      const state = app.getState();
      const m = meta();
      const payload = snapshotPayload(state);
      const nextRevision = Number(m.revision || 0) + 1;
      const { data, error } = await window.cloud
        .from(SNAP_TABLE)
        .upsert({
          user_id: syncUserId,
          payload,
          revision: nextRevision,
          client_updated_at: m.dirtyAt || new Date().toISOString()
        }, { onConflict: 'user_id' })
        .select('revision')
        .single();
      if (error) throw error;
      m.revision = Number(data?.revision || nextRevision);
      m.pulledAt = new Date().toISOString();
      app.persistLocal({ silent: true });
      return m.revision;
    } finally {
      pushing = false;
    }
  }

  function applySnapshot(payload) {
    const app = window.RestartApp;
    if (!app || !payload) return;
    const local = app.getState();
    // 本機的 base64 圖片不在快照裡，套用雲端資料時要保留。
    const keepHero = typeof local.heroPhoto === 'string' && local.heroPhoto.startsWith('data:') ? local.heroPhoto : '';
    const localDataPhotos = Array.isArray(local.photos) ? local.photos.filter(p => typeof p === 'string' && p.startsWith('data:')) : [];
    const next = { ...payload };
    if (!next.heroPhoto && keepHero) next.heroPhoto = keepHero;
    next.photos = [...new Set([...(Array.isArray(next.photos) ? next.photos : []), ...localDataPhotos])];
    app.replaceState(next);
  }

  async function pullSnapshot(userId) {
    const app = window.RestartApp;
    if (!app || !userId) return null;
    const { data, error } = await window.cloud
      .from(SNAP_TABLE)
      .select('payload,revision,client_updated_at,updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function initialSync(userId) {
    const app = window.RestartApp;
    if (!app || !userId || window.cloud?.__offline) return;
    syncUserId = userId;
    const m = meta();
    if (!m) return;
    try {
      const cloudRow = await pullSnapshot(userId);
      if (!cloudRow) {
        await pushSnapshot();
        return;
      }
      const cloudRevision = Number(cloudRow.revision || 0);
      const localRevision = Number(m.revision || 0);
      if (cloudRevision <= localRevision) {
        // 本機同步過且不落後：把本機的新變更推上去。
        if (m.dirtyAt && m.dirtyAt > (m.pulledAt || '')) await pushSnapshot();
        return;
      }
      const localChangedSincePull = !!(m.dirtyAt && m.dirtyAt > (m.pulledAt || ''));
      const cloudTime = cloudRow.client_updated_at || cloudRow.updated_at || '';
      if (localChangedSincePull && m.dirtyAt > cloudTime) {
        // 兩邊都有新變更，而本機更新：先備份雲端版本再推本機，避免直接覆蓋掉任何一份。
        try {
          localStorage.setItem(`restart-conflict-${userId}-${Date.now()}`, JSON.stringify(cloudRow.payload));
        } catch (e) { console.warn('衝突備份失敗', e); }
        m.revision = cloudRevision;
        await pushSnapshot();
        toast('本機資料較新，已保留本機版本並備份雲端版本');
        return;
      }
      if (localChangedSincePull) {
        try {
          localStorage.setItem(`restart-conflict-local-${userId}-${Date.now()}`, JSON.stringify(snapshotPayload(app.getState())));
        } catch (e) { console.warn('衝突備份失敗', e); }
      }
      applySnapshot(cloudRow.payload);
      const after = meta();
      if (after) {
        after.revision = cloudRevision;
        after.pulledAt = new Date().toISOString();
        after.dirtyAt = '';
      }
      app.persistLocal({ silent: true });
    } catch (e) {
      console.warn('雲端備援同步失敗', e);
    }
  }

  function stopSync() {
    clearTimeout(pushTimer);
    syncUserId = '';
  }

  // 離開頁面前盡量把未推送的變更送出去。
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && syncUserId) {
      clearTimeout(pushTimer);
      pushSnapshot().catch(() => {});
    }
  });

  window.RestartSync = {
    markDirty,
    push: pushSnapshot,
    pull: pullSnapshot,
    initial: initialSync,
    stop: stopSync,
    userId: () => syncUserId
  };

  /* ---------------- 4. 共用工具 ---------------- */
  function newId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    if (window.crypto?.getRandomValues) {
      const a = new Uint8Array(16);
      window.crypto.getRandomValues(a);
      return [...a].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  window.RestartNewId = newId;
})();
