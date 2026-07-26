const SUPABASE_URL = 'https://dzbwfmdxqlddntiwttmr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_tiXzp96LWvu59j9zDV_hLA_f_300UxX';

if (!window.supabase) {
  throw new Error('Supabase 程式庫載入失敗，請確認網路連線後重新整理。');
}

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
