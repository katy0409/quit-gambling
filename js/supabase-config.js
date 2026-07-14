const SUPABASE_URL='https://dzbwfmdxqlddntiwttmr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_tiXzp96LWvu59j9zDV_hLA_f_300UxX';
const cloud=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
