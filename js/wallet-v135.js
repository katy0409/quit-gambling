/* Restart V13.5 - cloud wallet purchase */
(function(){
'use strict';
async function cloudUser(){if(!window.cloud?.auth)return null;const {data}=await window.cloud.auth.getUser();return data?.user||null}
window.confirmShopPurchase=async function(){
 const id=shopPreviewItemId,item=typeof itemById==='function'?itemById(id):null;if(!item)return;
 if(state.game.owned.includes(id)){cancelShopPreview();return}
 if(Number(state.game.tokens||0)<Number(item.price||0))return notify('戒賭幣不足');
 const btn=document.getElementById('confirmPurchaseBtn');if(btn){btn.disabled=true;btn.textContent='處理中…'}
 try{
  const user=await cloudUser();
  if(user){
   const {data,error}=await window.cloud.rpc('spend_coins_v135',{spend_amount:Number(item.price),spend_reason:`購買：${item.name}`});
   if(error)throw error;const row=Array.isArray(data)?data[0]:data;if(row?.tokens!=null)state.game.tokens=Number(row.tokens);
  }else state.game.tokens-=Number(item.price);
  state.game.owned.push(id);equipGameItem(item.slot,id,false);shopPreviewItemId='';save();renderGame();notify(`已購買 ${item.name}`);
 }catch(e){notify('購買失敗：'+(e.message||'請稍後再試'))}
 finally{if(btn){btn.disabled=false;btn.textContent='確認購買'}}
};
})();
