/* Restart V13.5 - daily tasks */
(function(){
'use strict'; const $=id=>document.getElementById(id); const today=()=>new Date().toLocaleDateString('sv-SE');
const TASKS=[
 {id:'login',icon:'🌞',name:'今日登入',desc:'今天開啟 Restart',reward:1,done:()=>true},
 {id:'checkin',icon:'✅',name:'今日不賭簽到',desc:'按下「今天不賭」',reward:2,done:()=>state.checkins?.includes?.(today())},
 {id:'journal',icon:'📓',name:'完成心情紀錄',desc:'寫一篇今天的日記',reward:2,done:()=>state.journals?.some?.(x=>x.date===today())},
 {id:'square',icon:'🏘️',name:'造訪主城',desc:'進入 Restart 主城一次',reward:1,done:()=>localStorage.getItem('restart-square-visit')===today()},
 {id:'avatar',icon:'👕',name:'查看角色造型',desc:'開啟角色衣櫃',reward:1,done:()=>localStorage.getItem('restart-avatar-visit')===today()}
];
function claimed(){try{return JSON.parse(localStorage.getItem('restart-daily-claimed-'+today())||'[]')}catch{return[]}}
function progress(){return TASKS.filter(t=>t.done()).length}
window.openDailyTasks=async function(){renderDailyTasks();openModal('dailyTasksModal')}
window.renderDailyTasks=function(){const c=claimed(),done=progress();if($('dailyTaskHomeCount'))$('dailyTaskHomeCount').textContent=`${done} / ${TASKS.length}`;if($('dailyTaskHomeText'))$('dailyTaskHomeText').textContent=done===TASKS.length?'今天全部完成！':'完成任務領戒賭幣';if(!$('dailyTaskList'))return;$('dailyTaskSummary').innerHTML=`<strong>今日完成 ${done} / ${TASKS.length}</strong><div class="small muted">已領取 ${c.length} 個任務獎勵</div>`;$('dailyTaskList').innerHTML=TASKS.map(t=>{const d=t.done(),got=c.includes(t.id);return `<article class="daily-task-row ${got?'done':''}"><span class="task-icon">${t.icon}</span><div class="task-copy"><strong>${t.name}</strong><small>${t.desc}・獎勵 ${t.reward} 枚</small></div><button class="btn ${d&&!got?'primary':'ghost'}" ${!d||got?'disabled':''} onclick="claimDailyTask('${t.id}')">${got?'已領取':d?'領取':'未完成'}</button></article>`}).join('')}
window.claimDailyTask=async function(id){const t=TASKS.find(x=>x.id===id);if(!t||!t.done())return;const c=claimed();if(c.includes(id))return;try{const {data:{user}}=await window.cloud.auth.getUser();if(user){const {data,error}=await window.cloud.rpc('claim_daily_task_v135',{task_key:id,reward_amount:t.reward});if(error)throw error;const row=Array.isArray(data)?data[0]:data;if(row?.tokens!=null)state.game.tokens=Number(row.tokens)}else state.game.tokens+=t.reward;c.push(id);localStorage.setItem('restart-daily-claimed-'+today(),JSON.stringify(c));save();renderDailyTasks();renderGameHome();notify(`獲得 ${t.reward} 枚戒賭幣`)}catch(e){notify('領取失敗：'+e.message)}}
const oldSquare=window.openSquare;window.openSquare=async function(){localStorage.setItem('restart-square-visit',today());renderDailyTasks();return oldSquare?.apply(this,arguments)};
const oldGame=window.openGame;window.openGame=function(){localStorage.setItem('restart-avatar-visit',today());renderDailyTasks();return oldGame?.apply(this,arguments)};
window.addEventListener('DOMContentLoaded',()=>setTimeout(renderDailyTasks,800));
})();
