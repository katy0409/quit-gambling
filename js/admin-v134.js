/* Restart V13.4 — 管理員後台與戒賭幣紀錄 */
(function(){
'use strict';
const ADMIN_PASSWORD='03070718';
let adminSession=false;let adminPlayersCache=[];let adminFeedbackCache=[];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>{try{return new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return v||''}};

async function syncCloudWallet(){
 try{
  if(!window.cloud?.auth)return;
  const {data:{user}}=await window.cloud.auth.getUser(); if(!user)return;
  const {data:wallet,error}=await window.cloud.rpc('ensure_wallet_v134'); if(error)throw error;
  const row=Array.isArray(wallet)?wallet[0]:wallet;
  if(row&&Number.isFinite(Number(row.tokens))){state.game.tokens=Number(row.tokens)}
  const {data:history,error:historyError}=await window.cloud.from('coin_transactions').select('id,amount,balance_after,reason,operator_type,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
  if(historyError)throw historyError;
  state.game.coinHistory=(history||[]).map(r=>({id:r.id,amount:r.amount,balance:r.balance_after,reason:r.reason,type:r.operator_type,created_at:r.created_at}));
  if(typeof save==='function')save(); if(typeof renderGameHome==='function')renderGameHome(); if(typeof renderGame==='function')renderGame();
 }catch(e){console.warn('wallet sync skipped',e?.message||e)}
}
function localHistory(){if(typeof ensureGameState==='function')ensureGameState();return state.game.coinHistory||[]}
function saveLocalHistory(amount,reason,type='system'){
 const n=Number(amount)||0; state.game.tokens=Math.max(0,Number(state.game.tokens||0)+n);
 state.game.coinHistory=localHistory(); state.game.coinHistory.unshift({id:'local-'+Date.now(),amount:n,balance:state.game.tokens,type,reason:reason||'戒賭幣異動',created_at:new Date().toISOString()});
 if(typeof save==='function')save(); if(typeof renderGameHome==='function')renderGameHome(); if(typeof renderGame==='function')renderGame();
}
window.openCoinHistory=async function(){await syncCloudWallet();renderCoinHistory();if(typeof openModal==='function')openModal('coinHistoryModal')};
window.renderCoinHistory=function(){const box=$('coinHistoryList');if(!box)return;const rows=localHistory();box.innerHTML=rows.length?rows.map(r=>`<article class="coin-record"><div><strong class="${Number(r.amount)>=0?'coin-plus':'coin-minus'}">${Number(r.amount)>=0?'+':''}${Number(r.amount)}</strong><span>${esc(r.reason)}</span></div><small>${esc(fmt(r.created_at))} · 餘額 ${Number(r.balance)||0}</small></article>`).join(''):'<div class="feedback-empty">目前沒有戒賭幣紀錄</div>'};
window.openAdminLogin=function(){const gate=$('authGate');if(gate&&getComputedStyle(gate).display==='none')return; if(typeof openModal==='function')openModal('adminLoginModal');setTimeout(()=>$('adminPassword')?.focus(),100)};
window.loginAdmin=async function(){const pass=$('adminPassword')?.value||'';const msg=$('adminLoginMessage');if(pass!==ADMIN_PASSWORD){msg.textContent='管理員密碼錯誤';msg.className='auth-message show err';return}adminSession=true;sessionStorage.setItem('restart-admin-v135','1');msg.textContent='登入成功';msg.className='auth-message show ok';setTimeout(()=>{closeModal('adminLoginModal');const gate=$('authGate');if(gate)gate.style.display='none';document.querySelector('main.app')?.classList.add('admin-mode-hidden');openAdminPanel()},250)};
window.openAdminPanel=async function(){if(!adminSession&&sessionStorage.getItem('restart-admin-v135')!=='1'){openAdminLogin();return}adminSession=true;if(typeof openModal==='function')openModal('adminPanelModal');await Promise.all([loadAdminPlayers(),loadAdminFeedback()])};
window.adminLogout=function(){adminSession=false;sessionStorage.removeItem('restart-admin-v135');closeModal('adminPanelModal');document.querySelector('main.app')?.classList.remove('admin-mode-hidden');document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));const gate=$('authGate');if(gate)gate.style.display='flex';window.scrollTo(0,0);if(typeof notify==='function')notify('已登出管理員')};
window.requestAdminExit=function(){if(confirm('要離開管理員後台嗎？'))adminLogout()};
window.showAdminTab=function(tab){['players','feedback'].forEach(x=>{$(`admin-${x}`)?.classList.toggle('hidden',x!==tab);$(`adminTab-${x}`)?.classList.toggle('active',x===tab)});if(tab==='players')loadAdminPlayers();else loadAdminFeedback()};
async function rpc(name,args){if(!window.cloud)throw new Error('Supabase 尚未連線');const {data,error}=await window.cloud.rpc(name,{admin_password:ADMIN_PASSWORD,...args});if(error)throw error;return data}
window.loadAdminPlayers=async function(){const box=$('adminPlayerList');if(!box)return;box.innerHTML='<div class="feedback-empty">正在載入玩家…</div>';try{adminPlayersCache=await rpc('admin_list_players_v134',{})||[];renderAdminPlayers()}catch(e){box.innerHTML=`<div class="feedback-empty error">${esc(e.message)}</div>`}};
window.renderAdminPlayers=function(){const box=$('adminPlayerList');if(!box)return;const q=($('adminPlayerSearch')?.value||'').toLowerCase(),sort=$('adminPlayerSort')?.value||'new';let rows=adminPlayersCache.filter(p=>`${p.display_name||''} ${p.email||''}`.toLowerCase().includes(q));if(sort==='coins-desc')rows.sort((a,b)=>Number(b.tokens)-Number(a.tokens));if(sort==='coins-asc')rows.sort((a,b)=>Number(a.tokens)-Number(b.tokens));if(sort==='name')rows.sort((a,b)=>String(a.display_name||a.email).localeCompare(String(b.display_name||b.email),'zh-Hant'));$('adminStatPlayers').textContent=adminPlayersCache.length;$('adminStatCoins').textContent=adminPlayersCache.reduce((s,p)=>s+Number(p.tokens||0),0);box.innerHTML=rows.map(p=>`<article class="admin-player-card"><div class="admin-player-main"><div class="admin-avatar">👤</div><div><strong>${esc(p.display_name||p.email||'玩家')}</strong><small>${esc(p.email||'')}</small></div><b class="admin-balance">🪙 ${Number(p.tokens)||0}</b></div><div class="admin-player-actions"><button onclick="editPlayerCoins('${esc(p.user_id)}','${esc(p.display_name||p.email||'玩家')}',${Number(p.tokens)||0})">調整戒賭幣</button><button onclick="openAdminCoinReset('${esc(p.user_id)}','${esc(p.display_name||p.email||'玩家')}',${Number(p.tokens)||0})">重置戒賭幣</button><button class="danger" onclick="openAdminFullReset('${esc(p.user_id)}','${esc(p.display_name||p.email||'玩家')}')">全部重置</button></div></article>`).join('')||'<div class="feedback-empty">找不到符合的玩家</div>'};
window.setAdminCoinAmount=function(n){$('adminCoinAmount').value=n};
window.editPlayerCoins=function(userId,name,current){$('adminCoinUserId').value=userId;$('adminCoinPlayer').textContent=name;$('adminCoinCurrent').textContent=current;$('adminCoinAmount').value='';$('adminCoinReason').value='';openModal('adminCoinModal')};

window.openAdminCoinReset=function(userId,name,current){
 $('adminResetCoinUserId').value=userId;
 $('adminResetCoinPlayer').textContent=name;
 $('adminResetCoinCurrent').textContent=Number(current)||0;
 $('adminResetCoinReason').value='';
 openModal('adminResetCoinModal');
 setTimeout(()=>$('adminResetCoinReason')?.focus(),120);
};
window.submitAdminCoinReset=async function(){
 const id=$('adminResetCoinUserId').value;
 const current=Number($('adminResetCoinCurrent').textContent)||0;
 const reason=$('adminResetCoinReason').value.trim();
 if(!reason)return notify('請填寫重置原因');
 if(!confirm(`確認將玩家戒賭幣從 ${current} 枚重置為 10 枚？`))return;
 const delta=10-current;
 try{
  if(delta!==0){
   await rpc('admin_adjust_coins_v134',{target_user:id,coin_delta:delta,change_reason:`重置戒賭幣：${reason}`});
  }else{
   // 餘額已是 10 時不製造 0 元交易；仍明確告知管理員。
   closeModal('adminResetCoinModal');
   notify('玩家戒賭幣目前已是 10 枚');
   return;
  }
  closeModal('adminResetCoinModal');
  notify('玩家戒賭幣已重置為 10 枚，交易紀錄已保留');
  loadAdminPlayers();
 }catch(e){notify('重置失敗：'+e.message)}
};

window.openAdminFullReset=function(userId,name){
 $('adminFullResetUserId').value=userId;
 $('adminFullResetPlayer').textContent=name;
 $('adminFullResetReason').value='';
 openModal('adminFullResetModal');
 setTimeout(()=>$('adminFullResetReason')?.focus(),120);
};
window.submitAdminFullReset=async function(){
 const id=$('adminFullResetUserId').value;
 const name=$('adminFullResetPlayer').textContent||'玩家';
 const reason=$('adminFullResetReason').value.trim();
 if(!reason)return notify('請填寫完整重置原因');
 if(!confirm(`確定要將「${name}」的所有資料全部重置？此操作無法復原。`))return;
 try{
  await rpc('admin_full_reset_user_v1314',{target_user:id,reset_reason:reason});
  closeModal('adminFullResetModal');
  notify('該角色所有資料已重置；玩家下次開啟程式時會同步清除本機角色資料');
  loadAdminPlayers();
 }catch(e){notify('全部重置失敗：'+e.message)}
};

window.submitAdminCoins=async function(){const id=$('adminCoinUserId').value, amount=Number($('adminCoinAmount').value), reason=$('adminCoinReason').value;if(!Number.isFinite(amount)||amount===0)return notify('請輸入非 0 的增減數量');try{await rpc('admin_adjust_coins_v134',{target_user:id,coin_delta:amount,change_reason:reason||'管理員調整'});closeModal('adminCoinModal');notify('戒賭幣已更新');loadAdminPlayers()}catch(e){notify('修改失敗：'+e.message)}};
window.loadAdminFeedback=async function(){const box=$('adminFeedbackList');if(!box)return;box.innerHTML='<div class="feedback-empty">正在載入回饋…</div>';try{adminFeedbackCache=await rpc('admin_list_feedback_v134',{})||[];$('adminStatFeedback').textContent=adminFeedbackCache.filter(f=>(f.status||'open')!=='done').length;box.innerHTML=adminFeedbackCache.map(f=>`<article class="feedback-record admin-feedback-card"><div class="feedback-record-head"><span class="feedback-category">${esc(f.category).toUpperCase()}</span><span class="feedback-status status-${esc(f.status||'open')}">${f.status==='done'?'已完成':f.status==='processing'?'處理中':'未處理'}</span></div><strong>${esc(f.display_name||f.email||'玩家')}</strong><div class="feedback-record-message">${esc(f.message).replace(/\n/g,'<br>')}</div>${f.admin_reply?`<div class="feedback-admin-reply"><strong>目前回覆</strong><div>${esc(f.admin_reply)}</div></div>`:''}<button class="btn primary wide" type="button" data-feedback-id="${esc(f.id)}" onclick="replyFeedbackById(this.dataset.feedbackId)">回覆／更新狀態</button></article>`).join('')||'<div class="feedback-empty">目前沒有回饋</div>'}catch(e){box.innerHTML=`<div class="feedback-empty error">${esc(e.message)}</div>`}};
window.replyFeedbackById=function(id){const f=adminFeedbackCache.find(item=>String(item.id)===String(id));if(!f){if(typeof notify==='function')notify('找不到這筆玩家意見');return}$('adminFeedbackId').value=f.id;$('adminFeedbackOriginal').textContent=f.message||'';$('adminFeedbackReply').value=f.admin_reply||'';$('adminFeedbackStatus').value=f.status||'processing';openModal('adminReplyModal')};
window.submitAdminReply=async function(){try{await rpc('admin_reply_feedback_v134',{feedback_id:$('adminFeedbackId').value,reply_text:$('adminFeedbackReply').value.trim(),new_status:$('adminFeedbackStatus').value});closeModal('adminReplyModal');notify('回覆已送出');loadAdminFeedback()}catch(e){notify('回覆失敗：'+e.message)}};
window.addEventListener('DOMContentLoaded',()=>setTimeout(syncCloudWallet,1200));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCloudWallet()});
})();
