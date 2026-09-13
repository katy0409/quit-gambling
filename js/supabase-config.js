const SUPABASE_URL = 'https://dzbwfmdxqlddntiwttmr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_tiXzp96LWvu59j9zDV_hLA_f_300UxX';

// V13.27：Supabase 程式庫載入失敗時不再直接 throw。
// 舊版會讓整個 App 停在空白畫面，連 SOS 都按不到；現在改成掛上「離線替身」，
// 所有雲端呼叫都會安全地回傳錯誤，App 其他功能照常可用。
window.RESTART_CLOUD_READY = false;

function restartOfflineCloud() {
  const offline = () => ({ data: null, error: { message: '目前離線，無法連線雲端', code: 'offline' } });
  const offlineError = () => ({ data: null, error: new Error('目前離線，請連上網路後再試') });
  function builder() {
    const settled = Promise.resolve(offline());
    const proxy = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') return settled.then.bind(settled);
        if (prop === 'catch') return settled.catch.bind(settled);
        if (prop === 'finally') return settled.finally.bind(settled);
        return () => proxy;
      }
    });
    return proxy;
  }
  return {
    __offline: true,
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => offlineError(),
      signUp: async () => offlineError(),
      signInWithOAuth: async () => offlineError(),
      resetPasswordForEmail: async () => offlineError(),
      updateUser: async () => offlineError()
    },
    from: () => builder(),
    rpc: async () => offline(),
    channel: () => {
      const ch = {
        on() { return ch; },
        subscribe() { return ch; },
        unsubscribe() {},
        presenceState: () => ({}),
        track: async () => {}
      };
      return ch;
    },
    storage: {
      from: () => ({
        list: async () => offline(),
        remove: async () => offline(),
        upload: async () => offline(),
        createSignedUrl: async () => offline()
      })
    }
  };
}

if (window.supabase) {
  window.cloud = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
      }
    }
  );
  window.RESTART_CLOUD_READY = true;
} else {
  console.warn('Supabase 程式庫未載入，改以離線模式啟動。');
  window.cloud = restartOfflineCloud();
}
