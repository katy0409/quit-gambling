/* Restart V13.4 — 管理員後台與戒賭幣紀錄 */
(function(){
'use strict';
const ADMIN_PASSWORD='03070718';
let adminSession=false;
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
window.openAdminLogin=function(){if(typeof openModal==='function')openModal('adminLoginModal');setTimeout(()=>$('adminPassword')?.focus(),100)};
window.loginAdmin=async function(){const pass=$('adminPassword')?.value||'';const msg=$('adminLoginMessage');if(pass!==ADMIN_PASSWORD){msg.textContent='管理員密碼錯誤';msg.className='auth-message show err';return}adminSession=true;sessionStorage.setItem('restart-admin-v134','1');msg.textContent='登入成功';msg.className='auth-message show ok';saveLocalHistory(Math.max(0,100-Number(state.game.tokens||0)),'管理員初始戒賭幣','admin');setTimeout(()=>{closeModal('adminLoginModal');openAdminPanel()},250)};
window.openAdminPanel=async function(){if(!adminSession&&sessionStorage.getItem('restart-admin-v134')!=='1'){openAdminLogin();return}adminSession=true;if(typeof openModal==='function')openModal('adminPanelModal');await Promise.all([loadAdminPlayers(),loadAdminFeedback()])};
window.adminLogout=function(){adminSession=false;sessionStorage.removeItem('restart-admin-v134');closeModal('adminPanelModal');if(typeof notify==='function')notify('已登出管理員')};
window.showAdminTab=function(tab){['players','feedback'].forEach(x=>{$(`admin-${x}`)?.classList.toggle('hidden',x!==tab);$(`adminTab-${x}`)?.classList.toggle('active',x===tab)});if(tab==='players')loadAdminPlayers();else loadAdminFeedback()};
async function rpc(name,args){if(!window.cloud)throw new Error('Supabase 尚未連線');const {data,error}=await window.cloud.rpc(name,{admin_password:ADMIN_PASSWORD,...args});if(error)throw error;return data}
window.loadAdminPlayers=async function(){const box=$('adminPlayerList');if(!box)return;box.innerHTML='<div class="feedback-empty">正在載入玩家…</div>';try{const data=await rpc('admin_list_players_v134',{});box.innerHTML=(data||[]).map(p=>`<article class="admin-row"><div><strong>${esc(p.display_name||p.email||'玩家')}</strong><small>${esc(p.email||'')} · 餘額 ${Number(p.tokens)||0}</small></div><button class="btn ghost" onclick="editPlayerCoins('${esc(p.user_id)}','${esc(p.display_name||p.email||'玩家')}',${Number(p.tokens)||0})">修改戒賭幣</button></article>`).join('')||'<div class="feedback-empty">尚無玩家資料</div>'}catch(e){box.innerHTML=`<div class="feedback-empty error">${esc(e.message)}<br><small>請先執行 V13.4 Supabase SQL。</small></div>`}};
window.editPlayerCoins=function(userId,name,current){$('adminCoinUserId').value=userId;$('adminCoinPlayer').textContent=name;$('adminCoinCurrent').textContent=current;$('adminCoinAmount').value='';$('adminCoinReason').value='';openModal('adminCoinModal')};
window.submitAdminCoins=async function(){const id=$('adminCoinUserId').value, amount=Number($('adminCoinAmount').value), reason=$('adminCoinReason').value.trim();if(!Number.isFinite(amount)||amount===0)return notify('請輸入非 0 的增減數量');try{await rpc('admin_adjust_coins_v134',{target_user:id,coin_delta:amount,change_reason:reason||'管理員調整'});closeModal('adminCoinModal');notify('戒賭幣已更新');loadAdminPlayers()}catch(e){notify('修改失敗：'+e.message)}};
window.loadAdminFeedback=async function(){const box=$('adminFeedbackList');if(!box)return;box.innerHTML='<div class="feedback-empty">正在載入回饋…</div>';try{const data=await rpc('admin_list_feedback_v134',{});box.innerHTML=(data||[]).map(f=>`<article class="feedback-record"><div class="feedback-record-head"><span class="feedback-category">${esc(f.category)}</span><span class="feedback-status status-${esc(f.status||'open')}">${esc(f.status||'open')}</span></div><strong>${esc(f.display_name||f.email||'玩家')}</strong><div class="feedback-record-message">${esc(f.message).replace(/\n/g,'<br>')}</div>${f.admin_reply?`<div class="feedback-admin-reply"><strong>目前回覆</strong><div>${esc(f.admin_reply)}</div></div>`:''}<button class="btn primary wide" onclick="replyFeedback('${esc(f.id)}',${JSON.stringify(f.message)},${JSON.stringify(f.admin_reply||'')})">回覆／更新狀態</button></article>`).join('')||'<div class="feedback-empty">目前沒有回饋</div>'}catch(e){box.innerHTML=`<div class="feedback-empty error">${esc(e.message)}<br><small>請先執行 V13.4 Supabase SQL。</small></div>`}};
window.replyFeedback=function(id,message,reply){$('adminFeedbackId').value=id;$('adminFeedbackOriginal').textContent=message;$('adminFeedbackReply').value=reply;openModal('adminReplyModal')};
window.submitAdminReply=async function(){try{await rpc('admin_reply_feedback_v134',{feedback_id:$('adminFeedbackId').value,reply_text:$('adminFeedbackReply').value.trim(),new_status:$('adminFeedbackStatus').value});closeModal('adminReplyModal');notify('回覆已送出');loadAdminFeedback()}catch(e){notify('回覆失敗：'+e.message)}};
window.addEventListener('DOMContentLoaded',()=>setTimeout(syncCloudWallet,1200));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCloudWallet()});
})();
