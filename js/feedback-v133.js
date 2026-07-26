/* Restart V13.3 — Supabase feedback center */
(function(){
  'use strict';
  const VERSION='13.17';
  const CATEGORY_LABELS={bug:'Bug／異常',feature:'功能建議',avatar:'角色／換裝',shop:'商城／衣櫃',square:'線上廣場',other:'其他'};
  const STATUS_LABELS={open:'未處理',processing:'處理中',done:'已完成'};
  let loaded=false;

  function el(id){return document.getElementById(id)}
  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
  function formatDate(value){try{return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}catch(_){return value||''}}
  function showMessage(text,type=''){
    const box=el('feedbackSubmitMessage'); if(!box)return;
    box.textContent=text||''; box.className='feedback-submit-message'+(text?` show ${type}`:'');
  }
  async function getUser(){
    if(!window.cloud?.auth)throw new Error('Supabase 尚未連線');
    const {data,error}=await window.cloud.auth.getUser();
    if(error)throw error;
    if(!data?.user)throw new Error('請先登入後再送出回饋');
    return data.user;
  }
  window.openFeedback=function(){
    if(typeof openModal==='function')openModal('feedbackModal');
    showFeedbackTab('write');
    const textarea=el('feedbackMessage');
    if(textarea&&!textarea.dataset.counterReady){
      textarea.dataset.counterReady='1';
      textarea.addEventListener('input',()=>{const c=el('feedbackCount');if(c)c.textContent=String(textarea.value.length)});
    }
    if(textarea){const c=el('feedbackCount');if(c)c.textContent=String(textarea.value.length)}
  };
  window.showFeedbackTab=function(tab){
    const history=tab==='history';
    el('feedbackWriteTab')?.classList.toggle('active',!history);
    el('feedbackHistoryTab')?.classList.toggle('active',history);
    el('feedbackWritePanel')?.classList.toggle('hidden',history);
    el('feedbackHistoryPanel')?.classList.toggle('hidden',!history);
    if(history)loadMyFeedback(false);
  };
  window.submitFeedback=async function(){
    const btn=el('feedbackSubmitBtn');
    const category=el('feedbackCategory')?.value||'other';
    const message=el('feedbackMessage')?.value.trim()||'';
    if(!message){showMessage('請輸入意見內容','error');el('feedbackMessage')?.focus();return}
    if(message.length>2000){showMessage('意見內容最多 2000 字','error');return}
    if(btn){btn.disabled=true;btn.textContent='送出中…'}showMessage('');
    try{
      const user=await getUser();
      const {error}=await window.cloud.from('feedback').insert({user_id:user.id,category,message,app_version:VERSION});
      if(error)throw error;
      el('feedbackMessage').value='';
      if(el('feedbackCount'))el('feedbackCount').textContent='0';
      loaded=false;
      showMessage('已成功送出，謝謝你的回饋！','success');
      if(typeof notify==='function')notify('回饋已送出');
    }catch(error){
      console.error('submit feedback failed',error);
      const text=/row-level security/i.test(error?.message||'')?'送出失敗：請確認已登入，或檢查 feedback 的 RLS 權限。':`送出失敗：${error?.message||'請稍後再試'}`;
      showMessage(text,'error');
    }finally{if(btn){btn.disabled=false;btn.textContent='送出回饋'}}
  };
  window.loadMyFeedback=async function(force=false){
    const list=el('feedbackHistoryList'); if(!list)return;
    if(loaded&&!force)return;
    list.innerHTML='<div class="feedback-empty">正在載入…</div>';
    try{
      const user=await getUser();
      const {data,error}=await window.cloud.from('feedback').select('id,category,message,status,admin_reply,app_version,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false});
      if(error)throw error;
      loaded=true;
      if(!data?.length){list.innerHTML='<div class="feedback-empty">目前還沒有回饋紀錄</div>';return}
      list.innerHTML=data.map(item=>`<article class="feedback-record"><div class="feedback-record-head"><span class="feedback-category">${escapeHtml(CATEGORY_LABELS[item.category]||'其他')}</span><span class="feedback-status status-${escapeHtml(item.status||'open')}">${escapeHtml(STATUS_LABELS[item.status]||item.status||'未處理')}</span></div><div class="feedback-record-message">${escapeHtml(item.message).replace(/\n/g,'<br>')}</div><div class="feedback-record-meta">${escapeHtml(formatDate(item.created_at))} · V${escapeHtml(item.app_version||'—')}</div>${item.admin_reply?`<div class="feedback-admin-reply"><strong>管理員回覆</strong><div>${escapeHtml(item.admin_reply).replace(/\n/g,'<br>')}</div></div>`:''}</article>`).join('');
    }catch(error){console.error('load feedback failed',error);list.innerHTML=`<div class="feedback-empty error">載入失敗：${escapeHtml(error?.message||'請稍後再試')}</div>`}
  };
})();
