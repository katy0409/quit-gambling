/* Restart V13.30 — 分月查詢：記帳、日記、圖表分析共用同一個月份選擇 */
(function(){
'use strict';
const ALL='all';
let viewMonth=today().slice(0,7);
let analysisType='all';
const origRenderAnalysis=window.renderAnalysis;
const origRenderFinance=window.renderFinance;
const origBuildInsights=window.buildInsights;

/* ---------- 月份工具 ---------- */
const ym=s=>String(s||'').slice(0,7);
const isYm=s=>/^\d{4}-\d{2}$/.test(s);
const curMonth=()=>today().slice(0,7);
// SOS 成功紀錄存的是 ISO（UTC）時間，要換回本機日期再取月份。
const sosDate=x=>{const d=new Date(x?.date);return isNaN(d)?'':localDateStr(d)};
const inMonth=(date,m)=>m===ALL||ym(date)===m;
function shiftMonth(m,delta){const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+delta,1);return localDateStr(d).slice(0,7)}
function monthName(m){if(m===ALL)return'全部期間';if(m===curMonth())return'本月';const [y,mo]=m.split('-').map(Number);return `${y}年${mo}月`}
function monthFull(m){const [y,mo]=m.split('-').map(Number);return `${y}年${mo}月`}
function daysOfMonth(m){const [y,mo]=m.split('-').map(Number);return new Date(y,mo,0).getDate()}
function monthList(){
 const set=new Set([curMonth()]);
 state.transactions.forEach(x=>isYm(ym(x.date))&&set.add(ym(x.date)));
 state.journals.forEach(x=>isYm(ym(x.date))&&set.add(ym(x.date)));
 state.relapses.forEach(x=>isYm(ym(x.date))&&set.add(ym(x.date)));
 state.checkins.forEach(x=>isYm(ym(x))&&set.add(ym(x)));
 state.sosSuccess.forEach(x=>{const k=ym(sosDate(x));if(isYm(k))set.add(k)});
 snapshots().forEach(x=>set.add(x.month));
 const list=[...set].sort().reverse();
 // 補齊中間沒有資料的月份，切換時才不會跳月。
 const out=[];let m=list[0];const last=list[list.length-1];
 while(m>=last&&out.length<240){out.push(m);m=shiftMonth(m,-1)}
 return out;
}

/* ---------- 月份選擇列 ---------- */
function monthBarHtml(){
 const list=monthList();
 const m=viewMonth;
 const idx=list.indexOf(m);
 const prevOk=m===ALL||idx<list.length-1;
 const nextOk=m!==ALL&&idx>0;
 const opts=[`<option value="${ALL}"${m===ALL?' selected':''}>全部期間</option>`,...list.map(x=>`<option value="${x}"${x===m?' selected':''}>${monthFull(x)}${x===curMonth()?'（本月）':''}</option>`)].join('');
 return `<div class="month-bar"><button type="button" class="month-step" aria-label="上個月" ${prevOk?'':'disabled'} onclick="stepViewMonth(-1)">‹</button><select class="month-select" aria-label="選擇月份" onchange="setViewMonth(this.value)">${opts}</select><button type="button" class="month-step" aria-label="下個月" ${nextOk?'':'disabled'} onclick="stepViewMonth(1)">›</button>${m!==curMonth()?`<button type="button" class="month-today" onclick="setViewMonth('${curMonth()}')">回本月</button>`:''}</div>`;
}
function renderMonthBars(){['ledgerMonthBar','journalMonthBar','analysisMonthBar'].forEach(id=>{const el=$(id);if(el)el.innerHTML=monthBarHtml()})}
window.setViewMonth=function(m){
 viewMonth=(m===ALL||isYm(m))?m:curMonth();
 renderLedger();renderJournals();
 if($('analysisModal')?.classList.contains('open'))renderAnalysis(analysisType);
};
window.stepViewMonth=function(delta){
 const list=monthList();
 if(viewMonth===ALL)return setViewMonth(curMonth());
 const idx=list.indexOf(viewMonth);
 const next=list[idx-delta];
 if(next)setViewMonth(next);
};
window.getViewMonth=()=>viewMonth;

/* ---------- 記帳 ---------- */
function sumTx(type,m){return state.transactions.filter(x=>x.type===type&&inMonth(x.date,m)).reduce((s,x)=>s+Number(x.amount||0),0)}
window.renderLedgerSummary=function(){
 const el=$('ledgerSummary');if(!el)return;
 const m=viewMonth,name=monthName(m),isCur=m===curMonth(),t=today();
 const inc=sumTx('income',m),exp=sumTx('expense',m),sav=sumTx('saving',m),net=inc-exp-sav;
 const used=inc>0?Math.min(100,Math.round((exp+sav)/inc*100)):0;
 const usedRaw=inc>0?Math.round((exp+sav)/inc*100):0;
 const byCat={};
 state.transactions.filter(x=>x.type==='expense'&&inMonth(x.date,m)).forEach(x=>{const k=x.category||'未分類';byCat[k]=(byCat[k]||0)+Number(x.amount||0)});
 const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,5);
 const maxCat=cats.length?cats[0][1]:0;
 const catHtml=cats.length?`<div class="snap-block"><div class="snap-label">${name}支出前 ${cats.length} 名</div>${cats.map(([c,v])=>`<div class="cat-row"><div class="cat-name">${esc(c)}</div><div class="cat-bar"><i style="width:${maxCat?Math.round(v/maxCat*100):0}%"></i></div><div class="cat-value">${fmt(v)}<span class="muted small">　${exp?Math.round(v/exp*100):0}%</span></div></div>`).join('')}</div>`:'';
 let sub='';
 if(isCur){const todayExp=sumTx('expense',t),todayCount=state.transactions.filter(x=>x.date===t&&x.type!=='transfer').length;sub=`今天支出 ${fmt(todayExp)}${todayCount?`，共 ${todayCount} 筆`:'，還沒有記帳'}`}
 if(m!==ALL){
  const prev=shiftMonth(m,-1),pExp=sumTx('expense',prev);
  const count=state.transactions.filter(x=>inMonth(x.date,m)&&x.type!=='transfer').length;
  const cmp=pExp>0?`，支出比${monthName(prev)}${exp>=pExp?'多':'少'} ${fmt(Math.abs(exp-pExp))}`:'';
  sub=[sub,`${isCur?'本月':'這個月'}共 ${count} 筆${cmp}`].filter(Boolean).join('｜');
 }else{
  const count=state.transactions.filter(x=>x.type!=='transfer').length;
  sub=`全部共 ${count} 筆`;
 }
 el.innerHTML=`<div class="card snapshot">
  <div class="snap-top"><div class="snap-net"><small>${name}結餘（收入 − 支出 − 存款）</small><strong class="${net<0?'bad-text':'good-text'}">${fmt(net)}</strong></div></div>
  <div class="ledger-figures"><div><small>收入</small><b class="income">${fmt(inc)}</b></div><div><small>支出</small><b class="expense">${fmt(exp)}</b></div><div><small>存款</small><b class="saving">${fmt(sav)}</b></div></div>
  ${inc>0?`<div class="snap-block"><div class="snap-label">收入已用掉 <span class="muted small">${usedRaw}%</span></div><div class="snap-bar"><i class="${usedRaw>100?'bad':usedRaw>80?'warn':''}" style="width:${used}%"></i></div></div>`:''}
  <div class="snap-sub muted small">${sub}</div>
  ${catHtml}
 </div>`;
};
window.renderLedger=function(){
 renderMonthBars();renderLedgerSummary();
 const q=($('txSearch')?.value||'').trim().toLowerCase();
 let xs=state.transactions.filter(x=>inMonth(x.date,viewMonth)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||String(b.id).localeCompare(String(a.id)));
 if(ledgerFilter!=='all')xs=xs.filter(x=>x.type===ledgerFilter);
 if(q)xs=xs.filter(x=>(x.category+' '+x.note+' '+x.amount).toLowerCase().includes(q));
 const empty=viewMonth===ALL?'尚無記帳資料':`${monthName(viewMonth)}沒有${q||ledgerFilter!=='all'?'符合的':''}記帳資料`;
 $('transactionList').innerHTML=xs.length?renderTransactionGroups(xs):`<div class="empty">${esc(empty)}</div>`;
};

/* ---------- 日記 ---------- */
window.renderJournals=function(){
 renderMonthBars();
 const m=viewMonth;
 const xs=state.journals.filter(x=>inMonth(x.date,m)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 const strong=xs.filter(x=>['強烈','復賭'].includes(x.urge)).length;
 const moods=MOODS.map(([n,e])=>[e,xs.filter(x=>x.mood===n).length]).filter(x=>x[1]>0);
 const summary=xs.length?`<div class="card journal-month-summary"><div><small class="muted">${monthName(m)}日記</small><strong>${xs.length} 篇</strong></div><div><small class="muted">強烈想賭／復賭</small><strong class="${strong?'bad-text':''}">${strong} 次</strong></div><div class="journal-moods">${moods.map(([e,n])=>`<span>${e} ${n}</span>`).join('')}</div></div>`:'';
 const list=xs.map(x=>`<div class="card"><div class="item-head"><div><strong>${MOODS.find(mm=>mm[0]===x.mood)?.[1]||'😐'} ${esc(x.mood)}</strong><div class="muted small">${esc(x.date)}｜想賭：${esc(x.urge)}</div></div><div class="actions"><button class="tiny edit" onclick="openJournal('${esc(x.id)}')">編輯</button><button class="tiny delete" onclick="deleteJournal('${esc(x.id)}')">刪除</button></div></div><p>${esc(x.text)}</p></div>`).join('');
 $('journalList').innerHTML=xs.length?summary+list:`<div class="empty">${m===ALL?'尚無日記紀錄':esc(monthName(m))+'沒有日記'}</div>`;
};

/* ---------- 每月財務快照（負債／資產沒有歷史，只能從現在開始記） ---------- */
function snapshots(){return Array.isArray(state.snapshots)?state.snapshots.filter(x=>x&&isYm(x.month)):[]}
function recordMonthSnapshot(){
 try{
  if(!Array.isArray(state.snapshots))state.snapshots=[];
  const t=totals(),m=curMonth();
  const goal=state.goals.reduce((s,g)=>s+Number(g.current||0),0);
  const snap={month:m,assets:Math.round(t.assets),debt:Math.round(t.debt),goal:Math.round(goal)};
  const i=state.snapshots.findIndex(x=>x?.month===m);
  const old=i>=0?state.snapshots[i]:null;
  if(old&&old.assets===snap.assets&&old.debt===snap.debt&&old.goal===snap.goal)return;
  snap.updatedAt=new Date().toISOString();
  if(i>=0)state.snapshots[i]=snap;else state.snapshots.push(snap);
  state.snapshots.sort((a,b)=>String(a.month).localeCompare(String(b.month)));
  // 不呼叫 save()，避免重畫迴圈；直接寫本機並標記待同步。
  writeStore(state);markSyncDirty();
 }catch(e){console.warn('月快照記錄失敗',e)}
}
window.renderFinance=function(){const r=origRenderFinance.apply(this,arguments);recordMonthSnapshot();return r};

/* ---------- 圖表分析 ---------- */
const TABS=['all','finance','ledger','recovery','mood','cross'];
function setActiveTab(type,btn){document.querySelectorAll('.analysis-tabs button').forEach((x,i)=>x.classList.toggle('active',btn?x===btn:TABS[i]===type))}
function sixMonths(end){return[5,4,3,2,1,0].map(i=>shiftMonth(end,-i))}
const shortM=m=>Number(m.slice(5))+'月';

window.renderAnalysis=function(type='all',btn){
 analysisType=TABS.includes(type)?type:'all';
 renderMonthBars();
 const m=viewMonth;
 const sub=document.querySelector('#analysisModal .sheet-head .small');
 if(sub)sub.textContent=m===ALL?'依目前財務、記帳、戒賭與日記資料整理':`${monthFull(m)}的記帳、戒賭與日記；負債與資產結構為目前狀態`;
 if(m===ALL){origRenderAnalysis(analysisType,btn);setActiveTab(analysisType,btn);return}
 setActiveTab(analysisType,btn);
 const t=totals(),h=calcHealth(),months=sixMonths(m);
 const tx=state.transactions.filter(x=>inMonth(x.date,m));
 const js=state.journals.filter(x=>inMonth(x.date,m));
 const rel=state.relapses.filter(x=>inMonth(x.date,m));
 const sos=state.sosSuccess.filter(x=>inMonth(sosDate(x),m));
 const chk=state.checkins.filter(x=>inMonth(x,m));
 const goal=state.goals[0],goalPct=goal?Math.min(100,goal.current/Math.max(1,goal.target)*100):0;
 const debtTypes=Object.entries(state.debts.reduce((o,x)=>(o[x.type]=(o[x.type]||0)+Number(x.amount||0),o),{}));
 const assetTypes=Object.entries(state.assets.reduce((o,x)=>(o[x.type]=(o[x.type]||0)+Number(x.amount||0),o),{}));
 const expenseCats=Object.entries(tx.filter(x=>x.type==='expense').reduce((o,x)=>(o[x.category||'未分類']=(o[x.category||'未分類']||0)+Number(x.amount||0),o),{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
 const nd=daysOfMonth(m),marks=new Set([1,5,10,15,20,25,nd]);
 const daily=[...Array(nd)].map((_,i)=>{const k=`${m}-${String(i+1).padStart(2,'0')}`;return[marks.has(i+1)?String(i+1):'',tx.filter(x=>x.type==='expense'&&x.date===k).reduce((s,x)=>s+Number(x.amount||0),0)]});
 const snaps=snapshots(),snapOf=k=>snaps.find(x=>x.month===k);
 const netTrend=months.filter(k=>snapOf(k)).map(k=>{const s=snapOf(k);return[shortM(k),Math.max(0,s.assets-s.debt)]});
 const thisSnap=snapOf(m);
 const snapCard=thisSnap?chart(`${monthFull(m)}財務快照`,m===curMonth()?'本月最新數字':'該月最後一次記錄的數字',`<div class="month-snap-figures"><div><small>可用資產</small><b>${fmt(thisSnap.assets)}</b></div><div><small>總負債</small><b>${fmt(thisSnap.debt)}</b></div><div><small>淨資產</small><b class="${thisSnap.assets-thisSnap.debt<0?'bad-text':'good-text'}">${fmt(thisSnap.assets-thisSnap.debt)}</b></div><div><small>已存</small><b>${fmt(thisSnap.goal)}</b></div></div>`):chart(`${monthFull(m)}財務快照`,'',`<div class="empty">這個月還沒有快照。從 V13.30 起，每月會自動記錄資產與負債。</div>`);
 const relLoss=rel.reduce((s,x)=>s+Number(x.loss||0),0);
 const recSum=`<div class="month-snap-figures"><div><small>簽到天數</small><b>${chk.length} 天</b></div><div><small>SOS 忍住</small><b class="good-text">${sos.length} 次</b></div><div><small>復賭</small><b class="${rel.length?'bad-text':''}">${rel.length} 次</b></div><div><small>復賭損失</small><b class="${relLoss?'bad-text':''}">${fmt(relLoss)}</b></div></div>${state.relapses.length?'<div class="chart-note" style="margin-top:8px">簽到紀錄在復賭時會重新計算，較早月份的簽到天數可能少算。</div>':''}`;
 const cards={
  finance:[snapCard,chart('淨資產月變化','近六個月的資產 − 負債（負值以 0 顯示）',netTrend.length>=2?line(netTrend):'<div class="empty">累積兩個月以上的快照後顯示</div>'),chart('負債結構','目前各類負債占比',pie(debtTypes)),chart('資產結構','目前各類資產占比',pie(assetTypes)),chart('財務健康度','目前分數與主要風險',bars([['健康度',h.score],['資產覆蓋',Math.min(100,t.assets/Math.max(1,t.debt)*100)],['目標進度',goalPct]]))],
  ledger:[chart('支出分類',`${monthFull(m)}支出依分類統計`,pie(expenseCats)),chart('每日支出',`${monthFull(m)}每天的支出`,line(daily)),chart('近六個月收入與支出',`截至${monthFull(m)}`,bars(months.flatMap(k=>[[shortM(k)+'收',sumTx('income',k)],[shortM(k)+'支',sumTx('expense',k)]]))),chart('近六個月存款','實際轉入存錢目標的金額',bars(months.map(k=>[shortM(k),sumTx('saving',k)])))],
  recovery:[chart(`${monthFull(m)}戒賭紀錄`,'',recSum),chart('SOS 與復賭',`${monthFull(m)}忍住與復賭次數`,pie([['忍住',sos.length],['復賭',rel.length]])),chart('近六個月復賭次數',`截至${monthFull(m)}`,bars(months.map(k=>[shortM(k),state.relapses.filter(x=>ym(x.date)===k).length])))],
  mood:[chart('心情分布',`${monthFull(m)}日記的心情比例`,pie(MOODS.map(([n])=>[n,js.filter(x=>x.mood===n).length]))),chart('想賭程度',`${monthFull(m)}日記的想賭等級`,bars(URGES.map(([u])=>[u,js.filter(x=>x.urge===u).length])))],
  cross:[chart('心情 × 強烈想賭','各心情下「強烈／復賭」次數',bars(MOODS.map(([n])=>[n,js.filter(x=>x.mood===n&&['強烈','復賭'].includes(x.urge)).length]))),chart('心情 × 當日支出','各心情當日平均支出',bars(MOODS.map(([n])=>{const jj=js.filter(x=>x.mood===n);const val=jj.length?jj.reduce((s,j)=>s+state.transactions.filter(x=>x.type==='expense'&&x.date===j.date).reduce((a,b)=>a+Number(b.amount||0),0),0)/jj.length:0;return[n,Math.round(val)]})))]
 };
 const list=analysisType==='all'?[...cards.finance,...cards.ledger,...cards.recovery,...cards.mood,...cards.cross]:(cards[analysisType]||cards.finance);
 $('analysisCharts').innerHTML=list.join('');
 $('analysisInsights').innerHTML=monthInsights(m,h,t,{tx,js,rel,sos}).map(x=>`<div class="insight">${esc(x)}</div>`).join('');
};
function monthInsights(m,h,t,d){
 const out=[],name=monthName(m);
 const low=d.js.filter(x=>['低落','很痛苦'].includes(x.mood)&&['強烈','復賭'].includes(x.urge)).length;
 if(low)out.push(`${name}有 ${low} 次在低落或痛苦時出現強烈賭博衝動，這是較明顯的高風險情境。`);
 const inc=sumTx('income',m),exp=sumTx('expense',m),sav=sumTx('saving',m),pExp=sumTx('expense',shiftMonth(m,-1));
 if(sav>0)out.push(`${name}已轉入存錢目標 ${fmt(sav)}。`);
 if(inc>0&&exp>inc)out.push(`${name}支出高於收入 ${fmt(exp-inc)}，建議先暫停非必要支出。`);
 if(pExp>0&&exp>pExp*1.2)out.push(`${name}支出比前一個月多 ${Math.round((exp/pExp-1)*100)}%。`);
 if(d.rel.length)out.push(`${name}復賭 ${d.rel.length} 次，同期 SOS 忍住 ${d.sos.length} 次。願意誠實記錄，就是在往前走。`);
 else if(d.sos.length)out.push(`${name}靠 SOS 忍住了 ${d.sos.length} 次，沒有復賭紀錄。`);
 if(m===curMonth()&&t.cards>t.assets&&t.cards>0)out.push('信用卡卡費高於可用資產，建議優先避免新增刷卡並安排還款。');
 if(!out.length)out.push(`${name}的資料顯示方向穩定。持續記帳與日記後，交叉分析會更準確。`);
 return out;
}
// 保留原本的 buildInsights 給「全部期間」使用。
window.buildInsights=origBuildInsights;

/* 開啟分析時保留目前選的月份 */
window.openAnalysis=function(){try{analysisType='all';renderAnalysis('all');openModal('analysisModal')}catch(e){console.error('[Restart analysis]',e);notify('圖表分析載入失敗，請重新整理後再試')}};

// app.js 在 DOMContentLoaded 已經畫過一次，這裡補畫月份列。
window.addEventListener('DOMContentLoaded',()=>{try{renderLedger();renderJournals()}catch(e){console.warn(e)}});
})();
