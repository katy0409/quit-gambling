const CLOUD_SETTINGS_DEFAULTS = Object.freeze({
  home_title: '重新開始',
  home_subtitle: '今天不賭，因為我值得更好的生活。',
  theme_color: '#f47a5a',
  salary_amount: 0,
  salary_day: 10,
  line_url: 'https://line.me/ti/g2/LGgd7--YIY2SE05Euo2Cgf5Dt12XgXeA-i5VqA?utm_source=invitation&utm_medium=link_copy&utm_campaign=default',
  extra: {
    background_color: '#f7f6f3',
    reason: '',
    forecasts: { current: {}, next: {} },
    font_scale: 1,
    schema_version: 1
  }
});

async function cloudCurrentUser() {
  const { data, error } = await cloud.auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

function localStateToCloudPayload(userId, source) {
  const state = source || window.RestartApp?.getState?.() || {};
  const currentForecast = state.forecasts?.current || {};
  const salaryDate = String(currentForecast.salaryDate || '');
  const salaryDay = salaryDate ? Number(salaryDate.slice(-2)) : 10;
  return {
    user_id: userId,
    home_title: state.heroTitle || CLOUD_SETTINGS_DEFAULTS.home_title,
    home_subtitle: state.heroText || CLOUD_SETTINGS_DEFAULTS.home_subtitle,
    theme_color: state.themeColor || CLOUD_SETTINGS_DEFAULTS.theme_color,
    salary_amount: Number(currentForecast.salary || 0),
    salary_day: Number.isFinite(salaryDay) && salaryDay > 0 ? salaryDay : 10,
    line_url: state.lineUrl || CLOUD_SETTINGS_DEFAULTS.line_url,
    extra: {
      background_color: state.bgColor || CLOUD_SETTINGS_DEFAULTS.extra.background_color,
      reason: state.reason || '',
      forecasts: state.forecasts || { current: {}, next: {} },
      font_scale: Number(state.fontScale || 1),
      schema_version: 1,
      migrated_from_local: true
    }
  };
}

function applyCloudRowToLocal(row) {
  if (!row || !window.RestartApp) return;
  const state = window.RestartApp.getState();
  state.heroTitle = row.home_title || CLOUD_SETTINGS_DEFAULTS.home_title;
  state.heroText = row.home_subtitle || CLOUD_SETTINGS_DEFAULTS.home_subtitle;
  state.themeColor = row.theme_color || CLOUD_SETTINGS_DEFAULTS.theme_color;
  state.bgColor = row.extra?.background_color || state.bgColor || CLOUD_SETTINGS_DEFAULTS.extra.background_color;
  state.reason = row.extra?.reason ?? state.reason ?? '';
  state.fontScale = Number(row.extra?.font_scale || state.fontScale || 1);
  state.lineUrl = row.line_url || CLOUD_SETTINGS_DEFAULTS.line_url;
  state.forecasts = row.extra?.forecasts || state.forecasts || { current: {}, next: {} };
  state.forecasts.current = state.forecasts.current || {};
  state.forecasts.next = state.forecasts.next || {};
  if (!state.forecasts.current.salary && Number(row.salary_amount || 0) > 0) {
    state.forecasts.current.salary = Number(row.salary_amount);
  }
  window.RestartApp.persistLocal();
}

async function loadOrCreateCloudSettings() {
  const user = await cloudCurrentUser();
  if (!user) return null;

  const { data, error } = await cloud
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    applyCloudRowToLocal(data);
    return data;
  }

  // 第一次使用雲端版：以手機現有設定建立雲端資料，避免舊設定被覆蓋。
  const payload = localStateToCloudPayload(user.id);
  const { data: created, error: createError } = await cloud
    .from('settings')
    .insert(payload)
    .select()
    .single();
  if (createError) throw createError;
  applyCloudRowToLocal(created);
  return created;
}

async function saveCurrentSettingsToCloud() {
  const user = await cloudCurrentUser();
  if (!user) return null;
  const payload = localStateToCloudPayload(user.id);
  const { data, error } = await cloud
    .from('settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function clearResettableLocalData() {
  const exactKeys = new Set([
    'restart-square-position',
    'restart-square-visit',
    'restart-avatar-visit',
    'restart-daily-v135',
    'restart-daily-task-state',
    'restart-signin-state'
  ]);
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (exactKeys.has(key) || key.startsWith('restart-daily-claimed-') || key.startsWith('restart-daily-') || key.startsWith('restart-task-')) {
      localStorage.removeItem(key);
    }
  }
}

async function initializeCloudSettings() {
  const badge = document.getElementById('cloudStatus');
  try {
    if (badge) badge.textContent = '● 設定同步中';
    const user = await cloudCurrentUser();
    const row = await loadOrCreateCloudSettings();
    const resetAt = row?.extra?.admin_full_reset_at || (row?.extra?.admin_full_reset_requested ? row?.updated_at : '');
    const appliedKey = user ? `restart-admin-reset-applied-${user.id}` : 'restart-admin-reset-applied';
    if (resetAt && localStorage.getItem(appliedKey) !== String(resetAt)) {
      window.RestartApp?.resetLocal?.();
      clearResettableLocalData();
      localStorage.setItem(appliedKey, String(resetAt));

      // 先在本機記錄已套用，再回寫雲端。即使網路暫時失敗，也不會反覆把戒賭幣重設成 10。
      if (user) {
        const nextExtra = {
          ...(row.extra || {}),
          admin_full_reset_requested: false,
          admin_full_reset_applied_at: new Date().toISOString()
        };
        const { error: resetAckError } = await cloud
          .from('settings')
          .update({ extra: nextExtra })
          .eq('user_id', user.id);
        if (resetAckError) console.warn('完整重置回寫失敗', resetAckError);
      }

      window.renderDailyTasks?.();
      window.renderGameHome?.();
      if (typeof notify === 'function') notify('管理員已完整重置此帳戶，所有資料已回到新帳戶狀態');
    }
    if (user && window.cloud?.rpc) {
      try {
        const { data: wallet, error: walletError } = await window.cloud.rpc('ensure_wallet_v134');
        if (!walletError && wallet != null && window.RestartApp) {
          const value = Array.isArray(wallet) ? wallet[0] : wallet;
          const tokens = Number(value?.tokens ?? value);
          if (Number.isFinite(tokens)) {
            const local = window.RestartApp.getState();
            local.game = local.game || {};
            local.game.tokens = tokens;
            window.RestartApp.persistLocal();
            window.renderGameHome?.();
          }
        }
      } catch (walletSyncError) { console.warn('戒賭幣同步失敗', walletSyncError); }
    }
    if (badge) badge.textContent = row ? '● 設定已同步' : '● 尚未登入';
    return row;
  } catch (error) {
    console.error('雲端設定同步失敗', error);
    if (badge) badge.textContent = '● 雲端暫時無法同步';
    return null;
  }
}

window.RestartCloudSettings = {
  defaults: CLOUD_SETTINGS_DEFAULTS,
  initialize: initializeCloudSettings,
  load: loadOrCreateCloudSettings,
  save: saveCurrentSettingsToCloud,
  apply: applyCloudRowToLocal,
  payload: localStateToCloudPayload
};
