const AUTH_REDIRECT_URL = 'https://katy0409.github.io/quit-gambling/';
const REMEMBER_EMAIL_KEY = 'restart-remember-email';
// LINE 尚需在 Supabase 設定自訂 OAuth Provider。完成後填入例如：custom:line
const LINE_OAUTH_PROVIDER = '';

let authMode = 'login';

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
      const { data, error } = await cloud.auth.signUp({
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
      const { data, error } = await cloud.auth.signInWithPassword({ email, password });
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
  btn.disabled = true;
  showAuthMessage('正在前往 Google 登入…', true);
  try {
    const { error } = await cloud.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: AUTH_REDIRECT_URL,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) throw error;
  } catch (e) {
    console.error(e);
    showAuthMessage(friendlyAuthError(e));
    btn.disabled = false;
  }
}

async function signInWithLine() {
  if (!LINE_OAUTH_PROVIDER) {
    showAuthMessage('LINE 登入按鈕已加入，但還需要完成 LINE Developers 與 Supabase 自訂 OAuth 設定。');
    return;
  }
  const btn = document.getElementById('lineLoginBtn');
  btn.disabled = true;
  showAuthMessage('正在前往 LINE 登入…', true);
  try {
    const { error } = await cloud.auth.signInWithOAuth({
      provider: LINE_OAUTH_PROVIDER,
      options: { redirectTo: AUTH_REDIRECT_URL }
    });
    if (error) throw error;
  } catch (e) {
    console.error(e);
    showAuthMessage(friendlyAuthError(e));
    btn.disabled = false;
  }
}

async function sendResetPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) {
    showAuthMessage('請先輸入要重設密碼的 Email。');
    return;
  }
  try {
    const { error } = await cloud.auth.resetPasswordForEmail(email, {
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

async function applySession(session) {
  const gate = document.getElementById('authGate');
  const email = session?.user?.email || '';
  gate.classList.toggle('hidden', !!session);
  document.getElementById('accountEmail').textContent = email || '尚未登入';
  const providerEl = document.getElementById('accountProvider');
  if (providerEl) providerEl.textContent = session ? getLoginProvider(session.user) : '—';
  const badge = document.getElementById('cloudStatus');
  if (badge) badge.textContent = session ? '● 登入已連線' : '● 尚未登入';

  if (session) {
    try {
      const { error } = await cloud.from('profiles').upsert({
        id: session.user.id,
        email,
        display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.display_name || ''
      }, { onConflict: 'id' });
      if (error) throw error;
    } catch (e) {
      console.warn('profile upsert', e);
    }
    await window.RestartCloudSettings?.initialize?.();
  }
}

async function logoutCloud() {
  if (!confirm('確定登出雲端帳號？本機資料仍會保留。')) return;
  await cloud.auth.signOut();
  await applySession(null);
}

async function initCloudAuth() {
  restoreRememberedEmail();
  const { data, error } = await cloud.auth.getSession();
  if (error) console.warn(error);
  await applySession(data?.session || null);
  cloud.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => applySession(session), 0);
  });
}

window.addEventListener('DOMContentLoaded', initCloudAuth);
