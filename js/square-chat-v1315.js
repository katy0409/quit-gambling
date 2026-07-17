(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let channel=null,lastSent=0,user=null,nickname='';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function loadNickname(){
    if(!user||!window.cloud)return '';
    const {data}=await cloud.from('profiles').select('display_name').eq('id',user.id).maybeSingle();
    nickname=String(data?.display_name||'').trim();
    return nickname;
  }

  function render(rows){
    const box=$('squareChatMessages');if(!box)return;
    box.innerHTML=(rows||[]).slice().reverse().map(x=>`<article class="square-chat-message"><div class="square-chat-line"><span><strong>暱稱：${esc(x.display_name||'玩家')}</strong><em>${esc(x.message)}</em></span><time>${new Date(x.created_at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</time></div></article>`).join('')||'<div class="small muted">目前沒有訊息</div>';
    box.scrollTop=box.scrollHeight;
  }

  function announce(row){
    if(!row)return;
    window.dispatchEvent(new CustomEvent('restart:square-speech',{detail:{user_id:row.user_id,message:row.message,display_name:row.display_name}}));
  }

  async function load(){
    if(!window.cloud)return;
    const {data}=await cloud.from('square_messages').select('*').order('created_at',{ascending:false}).limit(50);
    render(data||[]);
  }

  async function start(){
    if(!window.cloud)return;
    const r=await cloud.auth.getUser();user=r.data?.user;if(!user)return;
    await loadNickname();
    await load();
    if(channel)return;
    channel=cloud.channel('square-chat-v136')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'square_messages'},payload=>{load();announce(payload.new)})
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'square_messages'},()=>load())
      .subscribe();
  }

  async function send(e){
    e.preventDefault();
    const input=$('squareChatInput'),msg=input?.value.trim();
    if(!msg)return;
    if(Date.now()-lastSent<3000)return notify('請稍候再發送');
    if(msg.length>200)return notify('訊息最多 200 字');
    if(!nickname)await loadNickname();
    if(!nickname){notify('請先到「更多」設定玩家暱稱');return;}
    lastSent=Date.now();
    const {data,error}=await cloud.from('square_messages').insert({user_id:user.id,display_name:nickname,message:msg}).select().single();
    if(error)return notify('訊息送出失敗：'+error.message);
    input.value='';
    announce(data);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    $('squareChatForm')?.addEventListener('submit',send);
    $('squareChatInput')?.addEventListener('focus',()=>document.body.classList.add('square-keyboard-open'));
    $('squareChatInput')?.addEventListener('blur',()=>document.body.classList.remove('square-keyboard-open'));
  });
  window.addEventListener('restart:nickname-changed',e=>{nickname=e.detail?.nickname||nickname});
  window.RestartSquareChat={start,load};
})();
