const AUTH_REDIRECT_URL = `${window.location.origin}${window.location.pathname}`;
const REMEMBER_EMAIL_KEY = 'restart-remember-email';
// LINE 尚需在 Supabase 設定自訂 OAuth Provider。完成後填入例如：custom:line
const LINE_OAUTH_PROVIDER = '';

let authMode = 'login';
// V13.27：避免 applySession 重複執行（啟動時會觸發 2～3 次，每小時更新 token 也會觸發）。
let appliedUserId = undefined;
let accountReadyFor = '';
let offlineMode = false;

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('loginTab').classList.toggle('active', mode === 'login');
  document.getElementById('signupTab').classList.toggle('active', mode === 'signup');
  document.getElementById('authNameField').classList.toggle('hidden', mode !== 'signup');
  document.getElementById('rememberRow').classList.toggle('hidden', mode !== 'login');
  const password = document.getElementById('authPassword');
  password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  document.getElementById('authSubmit').textContent = mode === 'login' ? '登入' : '建立帳號';
  showAuthMessage('', false);
}

function showAuthMessage(text, ok = false) {
  const el = document.getElementById('authMessage');
  el.textContent = text || '';
  el.className = 'auth-message' + (text ? ' show ' + (ok ? 'ok' : 'err') : '');
}

function friendlyAuthError(error) {
  const m = String(error?.message || error || '發生未知錯誤');
  if (/Invalid login credentials/i.test(m)) return 'Email 或密碼不正確。';
  if (/User already registered/i.test(m)) return '這個 Email 已經註冊，請直接登入。';
  if (/Password should be/i.test(m)) return '密碼長度不足，請至少輸入 6 個字元。';
  if (/rate limit/i.test(m)) return '操作太頻繁，請稍後再試。';
  if (/provider is not enabled/i.test(m)) return '此登入方式尚未在 Supabase 啟用。';
  if (/離線|offline|Failed to fetch|NetworkError/i.test(m)) return '目前連不上網路，請稍後再試。';
  return m;
}

function restoreRememberedEmail() {
  const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY) || '';
  const input = document.getElementById('authEmail');
  const checkbox = document.getElementById('rememberEmail');
  if (savedEmail && input && checkbox) {
    input.value = savedEmail;
    checkbox.checked = true;
  }
}

function updateRememberedEmail(email) {
  const checked = document.getElementById('rememberEmail')?.checked;
  if (checked) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
  else localStorage.removeItem(REMEMBER_EMAIL_KEY);
}

async function submitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const btn = document.getElementById('authSubmit');
  if (!email || !password) {
    showAuthMessage('請輸入 Email 與密碼。');
    return;
  }

  btn.disabled = true;
  btn.textContent = '處理中…';
  try {
    if (authMode === 'signup') {
      const display_name = document.getElementById('authDisplayName').value.trim();
      const { data, error } = await window.cloud.auth.signUp({
        email,
        password,
        options: { data: { display_name }, emailRedirectTo: AUTH_REDIRECT_URL }
      });
      if (error) throw error;
      if (data.session) {
        updateRememberedEmail(email);
        showAuthMessage('帳號建立成功，已登入。', true);
        await applySession(data.session);
      } else {
        showAuthMessage('帳號已建立，請到信箱完成驗證後再登入。', true);
        setAuthMode('login');
      }
    } else {
      const { data, error } = await window.cloud.auth.signInWithPassword({ email, password });
      if (error) throw error;
      updateRememberedEmail(email);
      showAuthMessage('登入成功。', true);
      await applySession(data.session);
    }
  } catch (e) {
    console.error(e);
    showAuthMessage(friendlyAuthError(e));
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? '登入' : '建立帳號';
  }
}

async function signInWithGoogle() {
  const btn = document.getElementById('googleLoginBtn');
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  showAuthMessage('正在開啟 Google 登入…', true);

  try {
    if (!window.cloud?.auth || window.cloud.__offline) {
      throw new Error('目前離線，無法使用 Google 登入。');
    }

    const { data, error } = await window.cloud.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: AUTH_REDIRECT_URL,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
          access_type: 'offline'
        }
      }
    });

    if (error) throw error;
    if (!data?.url) throw new Error('沒有取得 Google 登入網址，請確認 Supabase Google Provider 已儲存啟用。');

    window.location.assign(data.url);
  } catch (e) {
    console.error('Google login failed:', e);
    showAuthMessage(`Google 登入失敗：${friendlyAuthError(e)}`);
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

async function signInWithLine() {
  alert('LINE 登入功能開發中\n\n目前可使用 Email 或 Google 登入。');
}

async function sendResetPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) {
    showAuthMessage('請先輸入要重設密碼的 Email。');
    return;
  }
  try {
    const { error } = await window.cloud.auth.resetPasswordForEmail(email, {
      redirectTo: AUTH_REDIRECT_URL
    });
    if (error) throw error;
    showAuthMessage('重設密碼信已寄出，請檢查信箱。', true);
  } catch (e) {
    showAuthMessage(friendlyAuthError(e));
  }
}

function getLoginProvider(user) {
  const providers = user?.app_metadata?.providers || [];
  const primary = user?.app_metadata?.provider || providers[0] || 'email';
  if (primary === 'google') return 'Google 帳號';
  if (String(primary).includes('line')) return 'LINE 帳號';
  return 'Email 帳號';
}

// 沒有網路（或 Supabase 程式庫載不進來）時，讓使用者仍能使用 App 與 SOS。
function enterOfflineMode(auto) {
  offlineMode = true;
  document.body.classList.remove('auth-pending');
  document.body.classList.add('restart-offline');
  const gate = document.getElementById('authGate');
  if (gate) gate.classList.add('hidden');
  const emailEl = document.getElementById('accountEmail');
  if (emailEl) emailEl.textContent = '離線使用中（未連線雲端）';
  const providerEl = document.getElementById('accountProvider');
  if (providerEl) providerEl.textContent = '—';
  const badge = document.getElementById('cloudStatus');
  if (badge) badge.textContent = '● 離線模式，資料先存在手機';
  if (!auto && typeof notify === 'function') notify('已進入離線模式，資料會先存在這支手機');
}
window.enterOfflineMode = enterOfflineMode;

function showOfflineOption(reason) {
  const btn = document.getElementById('offlineEnterBtn');
  if (btn) btn.classList.remove('hidden');
  if (reason) showAuthMessage(reason);
}

async function ensureProfileAndSync(session) {
  const userId = session.user.id;
  const email = session.user.email || '';
  try {
    const suggestedName = session.user.user_metadata?.full_name || session.user.user_metadata?.display_name || '';
    const { data: existing } = await window.cloud.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    const payload = { id: userId, email };
    if (!existing?.display_name && suggestedName) payload.display_name = suggestedName.slice(0, 12);
    const { error } = await window.cloud.from('profiles').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    const { data: profile } = await window.cloud.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    const nicknameInput = document.getElementById('profileNickname');
    if (nicknameInput) nicknameInput.value = profile?.display_name || '';
  } catch (e) {
    console.warn('profile upsert', e);
  }
  await window.RestartCloudSettings?.initialize?.();
  // 整份資料的雲端備援：先比對雲端與本機，再決定要拉回或推上去。
  await window.RestartSync?.initial?.(userId);
  // 把還留在本機的 base64 圖片搬上雲端，釋放手機儲存空間。
  window.RestartImages?.migrateLocal?.().catch(e => console.warn('圖片移轉失敗', e));
}

async function applySession(session, options) {
  const force = !!(options && options.force);
  const userId = session?.user?.id || null;
  const gate = document.getElementById('authGate');
  document.body.classList.remove('auth-pending');

  if (!force && appliedUserId === userId) return; // 同一個帳號狀態不重複套用
  appliedUserId = userId;

  if (userId) {
    offlineMode = false;
    document.body.classList.remove('restart-offline');
    // 修正：不同帳號使用同一支手機時，各自使用獨立的本機資料空間。
    const switched = window.RestartStore?.bindUser?.(userId);
    if (switched) window.RestartApp?.reloadFromStorage?.();
  } else {
    window.RestartSync?.stop?.();
    if (!offlineMode) {
      const switched = window.RestartStore?.bindUser?.(null);
      if (switched) window.RestartApp?.reloadFromStorage?.();
    }
  }

  const email = session?.user?.email || '';
  if (gate) gate.classList.toggle('hidden', !!session);
  const emailEl = document.getElementById('accountEmail');
  if (emailEl) emailEl.textContent = email || (offlineMode ? '離線使用中（未連線雲端）' : '尚未登入');
  const providerEl = document.getElementById('accountProvider');
  if (providerEl) providerEl.textContent = session ? getLoginProvider(session.user) : '—';
  const badge = document.getElementById('cloudStatus');
  if (badge) badge.textContent = session ? '● 登入已連線' : (offlineMode ? '● 離線模式' : '● 尚未登入');

  if (session) {
    if (accountReadyFor !== userId) {
      accountReadyFor = userId;
      await ensureProfileAndSync(session);
    }
  } else {
    accountReadyFor = '';
  }
}

async function logoutCloud() {
  if (!confirm('確定登出雲端帳號？本機資料仍會保留。')) return;
  try { await window.RestartSync?.push?.(); } catch (e) { console.warn('登出前同步失敗', e); }
  window.RestartSync?.stop?.();
  await window.cloud.auth.signOut();
  offlineMode = false;
  await applySession(null, { force: true });
}

async function initCloudAuth() {
  restoreRememberedEmail();
  document.getElementById('googleLoginBtn')?.addEventListener('click', signInWithGoogle);
  document.getElementById('lineLoginBtn')?.addEventListener('click', signInWithLine);
  document.getElementById('offlineEnterBtn')?.addEventListener('click', () => enterOfflineMode(false));

  // Supabase 程式庫沒載入（例如離線首次開啟）：直接進離線模式，不要卡在登入頁。
  if (!window.RESTART_CLOUD_READY || window.cloud?.__offline) {
    enterOfflineMode(true);
    return;
  }

  // 保險機制：登入狀態檢查最多等 6 秒。萬一 Supabase 暫時連不上（例如剛從暫停恢復、
  // 或網路不穩），也不要讓整個 App 永遠卡在空白畫面；此時提供「先離線使用」的入口，
  // 使用者仍然可以記帳、寫日記與使用 SOS。
  let settled = false;
  const releaseGate = (session) => {
    if (settled) return;
    settled = true;
    clearTimeout(fallbackTimer);
    applySession(session || null);
  };
  const fallbackTimer = setTimeout(() => {
    console.warn('登入狀態檢查逾時，先顯示畫面');
    releaseGate(null);
    showOfflineOption('目前連不上雲端，可以先離線使用。');
  }, 6000);

  try {
    const { data, error } = await window.cloud.auth.getSession();
    if (error) console.warn(error);
    releaseGate(data?.session || null);
    if (!data?.session && !navigator.onLine) showOfflineOption('目前沒有網路連線，可以先離線使用。');
    window.cloud.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED／INITIAL_SESSION 等事件不會帶來帳號變化，交由 applySession 自行去重。
      setTimeout(() => applySession(session), 0);
    });
  } catch (e) {
    console.error('雲端登入初始化失敗，先顯示登入畫面', e);
    releaseGate(null);
    showOfflineOption('目前連不上雲端，可以先離線使用。');
  }
}

async function saveProfileNickname() {
  const input = document.getElementById('profileNickname');
  const message = document.getElementById('nicknameMessage');
  const nickname = String(input?.value || '').trim();
  if (nickname.length < 2 || nickname.length > 12) {
    if (message) { message.textContent = '暱稱需為 2～12 個字。'; message.className = 'small error'; }
    return;
  }
  try {
    const { data: { user } } = await window.cloud.auth.getUser();
    if (!user) throw new Error('請先登入');
    const { error } = await window.cloud.from('profiles').upsert({ id: user.id, email: user.email || '', display_name: nickname }, { onConflict: 'id' });
    if (error) throw error;
    await window.cloud.auth.updateUser({ data: { display_name: nickname } });
    if (message) { message.textContent = '暱稱已儲存。'; message.className = 'small good-text'; }
    window.dispatchEvent(new CustomEvent('restart:nickname-changed', { detail: { nickname } }));
  } catch (e) {
    if (message) { message.textContent = '儲存失敗：' + e.message; message.className = 'small error'; }
  }
}
window.saveProfileNickname = saveProfileNickname;

window.addEventListener('DOMContentLoaded', initCloudAuth);
