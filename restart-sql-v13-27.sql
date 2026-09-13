-- Restart V13.27 資料庫修正
-- 對應項目：3（戒賭幣可無限領）、4（每日任務日期錯位）、12（資料只存在手機）
-- 全部為新增或取代，不會刪除任何現有資料。

-- =====================================================================
-- 12. 雲端備援：整份資料快照（換手機、Safari 清資料後都能還原）
-- =====================================================================
create table if not exists public.app_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1,
  client_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots enable row level security;

drop policy if exists "snapshot owner select" on public.app_snapshots;
create policy "snapshot owner select" on public.app_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "snapshot owner insert" on public.app_snapshots;
create policy "snapshot owner insert" on public.app_snapshots
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "snapshot owner update" on public.app_snapshots;
create policy "snapshot owner update" on public.app_snapshots
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "snapshot owner delete" on public.app_snapshots;
create policy "snapshot owner delete" on public.app_snapshots
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 每次 upsert 自動更新時間
create or replace function public.touch_app_snapshot()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_snapshots_touch on public.app_snapshots;
create trigger app_snapshots_touch before insert or update on public.app_snapshots
  for each row execute function public.touch_app_snapshot();

-- =====================================================================
-- 3 + 4. 每日任務：獎勵金額改由伺服器決定，日期改用台灣時間
-- =====================================================================
create or replace function public.claim_daily_task_v135(task_key text, reward_amount integer)
returns table(tokens integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  current_tokens integer;
  -- 修正：資料庫時區是 UTC，台灣凌晨 0～8 點會被算成前一天。
  local_date date := (now() at time zone 'Asia/Taipei')::date;
  -- 修正：獎勵金額不再相信前端傳來的數字。
  expected integer;
begin
  if uid is null then
    raise exception '尚未登入';
  end if;

  expected := case task_key
    when 'login' then 1
    when 'checkin' then 2
    when 'journal' then 2
    when 'square' then 1
    when 'avatar' then 1
    else null
  end;

  if expected is null then
    raise exception '無效的每日任務';
  end if;

  perform public.ensure_wallet_v134();

  insert into public.daily_task_claims (user_id, task_date, task_key, reward)
  values (uid, local_date, task_key, expected);

  update public.player_wallets
  set tokens = player_wallets.tokens + expected,
      updated_at = now()
  where user_id = uid
  returning player_wallets.tokens into current_tokens;

  insert into public.coin_transactions (user_id, amount, balance_after, reason, operator_type)
  values (uid, expected, current_tokens, '每日任務：' || task_key, 'system');

  return query select current_tokens;

exception
  when unique_violation then
    raise exception '今天已領取此任務';
end;
$function$;

-- =====================================================================
-- 3. 七日簽到獎勵：金額由伺服器推算，且每天只能領一次
-- =====================================================================
create or replace function public.grant_coins_v1317(grant_amount integer, grant_reason text, claim_key text)
returns table(tokens integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  current_tokens integer;
  key text := coalesce(trim(claim_key), '');
  local_date date := (now() at time zone 'Asia/Taipei')::date;
  day_no integer;
  day_in_cycle integer;
  expected integer;
  day_key text;
begin
  if uid is null then
    raise exception '尚未登入';
  end if;

  -- 只接受 signin-<數字>；舊版任何字串都能換一次獎勵。
  if key !~ '^signin-[0-9]{1,6}$' then
    raise exception '獎勵識別碼錯誤';
  end if;

  day_no := split_part(key, '-', 2)::integer;
  if day_no < 1 then
    raise exception '獎勵識別碼錯誤';
  end if;

  day_in_cycle := ((day_no - 1) % 7) + 1;
  expected := case day_in_cycle
    when 7 then 10   -- 第 7 天若限定造型已擁有，改發 10 枚
    when 5 then 3
    when 6 then 3
    when 3 then 2
    when 4 then 2
    else 1
  end;

  perform public.ensure_wallet_v134();

  -- 一天只能領一次簽到獎勵（不論前端送什麼識別碼）。
  day_key := 'signin-day-' || to_char(local_date, 'YYYY-MM-DD');
  insert into public.coin_reward_claims (user_id, claim_key, amount)
  values (uid, day_key, expected);

  update public.player_wallets
  set tokens = player_wallets.tokens + expected,
      updated_at = now()
  where user_id = uid
  returning player_wallets.tokens into current_tokens;

  insert into public.coin_transactions (user_id, amount, balance_after, reason, operator_type)
  values (uid, expected, current_tokens, coalesce(nullif(trim(grant_reason), ''), '系統獎勵'), 'system');

  return query select current_tokens;

exception
  when unique_violation then
    -- 今天已領過：回傳目前餘額，不再加幣。
    select w.tokens into current_tokens from public.player_wallets w where w.user_id = uid;
    return query select current_tokens;
end;
$function$;

-- =====================================================================
-- 12（配套）。管理員完整重置時一併清除雲端快照，
-- 否則重置後重新開啟 App 會被舊快照還原。
-- =====================================================================
create or replace function public.admin_full_reset_user_v1314(admin_password text, reset_reason text, target_user uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  safe_reason text;
  reset_time timestamptz := now();
begin
  if admin_password <> '03070718' then
    raise exception '管理員密碼錯誤';
  end if;

  if target_user is null then
    raise exception '找不到玩家';
  end if;

  if not exists (select 1 from auth.users where id = target_user) then
    raise exception '玩家帳號不存在';
  end if;

  safe_reason := nullif(trim(reset_reason), '');
  if safe_reason is null then
    raise exception '請填寫完整重置原因';
  end if;

  delete from public.transactions where user_id = target_user;
  delete from public.saving_goals where user_id = target_user;
  delete from public.debts where user_id = target_user;
  delete from public.assets where user_id = target_user;

  delete from public.categories where user_id = target_user;
  delete from public.diaries where user_id = target_user;
  delete from public.checkins where user_id = target_user;
  delete from public.relapses where user_id = target_user;
  delete from public.photos where user_id = target_user;
  delete from public.finance_reports where user_id = target_user;
  delete from public.excel_import_logs where user_id = target_user;
  delete from public.daily_task_claims where user_id = target_user;
  delete from public.coin_reward_claims where user_id = target_user;
  delete from public.feedback where user_id = target_user;
  delete from public.square_messages where user_id = target_user;
  delete from public.app_snapshots where user_id = target_user; -- V13.27 新增

  delete from public.coin_transactions where user_id = target_user;

  insert into public.player_wallets (user_id, tokens, updated_at)
  values (target_user, 10, reset_time)
  on conflict (user_id) do update set
    tokens = excluded.tokens,
    updated_at = excluded.updated_at;

  delete from public.settings where user_id = target_user;

  insert into public.settings (
    user_id, home_title, home_subtitle, theme_color, salary_amount, line_url, extra, created_at, updated_at
  ) values (
    target_user,
    '重新開始',
    '今天不賭，因為我值得更好的生活。',
    '#f7f3ed',
    0,
    null,
    jsonb_build_object(
      'admin_full_reset_at', reset_time,
      'admin_full_reset_reason', safe_reason,
      'admin_full_reset_version', 'v13.27',
      'admin_full_reset_requested', true
    ),
    reset_time,
    reset_time
  );

  insert into public.coin_transactions (
    user_id, amount, balance_after, reason, operator_type, created_at
  ) values (
    target_user, 10, 10, '管理員完整重置：' || safe_reason, 'admin', reset_time
  );

  update public.profiles
  set display_name = null,
      avatar_url = null,
      updated_at = reset_time
  where id = target_user;

  return true;
end;
$function$;
