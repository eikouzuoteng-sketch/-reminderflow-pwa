'use strict';
const KEY='reminderflow.pwa.v020';
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseLocal=(date,time='00:00')=>{const [y,m,day]=date.split('-').map(Number);const [h,min]=time.split(':').map(Number);return new Date(y,m-1,day,h||0,min||0,0,0)};
const fmtDate=d=>new Intl.DateTimeFormat('ja-JP',{month:'short',day:'numeric',weekday:'short'}).format(d);
const fmtDateTime=d=>new Intl.DateTimeFormat('ja-JP',{month:'short',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'}).format(d);
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const addMonths=(d,n)=>{const x=new Date(d);const day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+n);const max=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();x.setDate(Math.min(day,max));return x};
const startDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());

let db=load();
let currentFilter='today';
let calCursor=new Date();calCursor.setDate(1);
let selectedDate=ymd(new Date());
let notificationTick=null;

function emptyDB(){return {version:2,tasks:[],repeats:[],skips:[],settings:{defaultPriority:'medium',autoMaintenance:true,lastNotifications:{}}}}
function load(){try{const x=JSON.parse(localStorage.getItem(KEY));return x&&x.tasks&&x.repeats?{...emptyDB(),...x,settings:{...emptyDB().settings,...x.settings}}:emptyDB()}catch{return emptyDB()}}
function save(){localStorage.setItem(KEY,JSON.stringify(db));}
function priorityLabel(v){return v==='high'?'高':v==='low'?'低':'中'}
function normalizeTask(t){return {...t,priority:t.priority||db.settings.defaultPriority||'medium',completed:!!t.completed}}
function allTasks(){materializeRepeats();maintenance();return db.tasks.map(normalizeTask).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt))}

function occurrenceDates(rule,until){
  const start=parseLocal(rule.startDate,'00:00'); const end=rule.endDate?parseLocal(rule.endDate,'23:59'):until; const cap=until<end?until:end; const out=[]; const interval=Math.max(1,Number(rule.interval)||1);
  if(rule.unit==='day'){
    for(let d=new Date(start);d<=cap;d=addDays(d,interval))out.push(new Date(d));
  } else if(rule.unit==='month'){
    for(let d=new Date(start);d<=cap;d=addMonths(d,interval))out.push(new Date(d));
  } else {
    const days=(rule.weekdays&&rule.weekdays.length)?rule.weekdays:[start.getDay()];
    for(let d=new Date(startDay(start));d<=cap;d=addDays(d,1)){
      if(d<start)continue; const diff=Math.floor((startDay(d)-startDay(start))/86400000); const week=Math.floor(diff/7);
      if(week%interval===0&&days.includes(d.getDay()))out.push(new Date(d));
    }
  }
  return out;
}
function materializeRepeats(){
  const horizon=addDays(new Date(),120); let changed=false;
  for(const r of db.repeats.filter(x=>x.enabled!==false)){
    for(const occ of occurrenceDates(r,horizon)){
      const occurrence=ymd(occ); const key=`${r.id}:${occurrence}`;
      if(db.skips.includes(key)||db.tasks.some(t=>t.repeatKey===key))continue;
      const dueDate=addDays(occ,Number(r.dueOffsetDays)||0); const due=parseLocal(ymd(dueDate),r.dueTime||'18:00');
      db.tasks.push({id:uid(),title:r.title,note:r.note||'',dueAt:due.toISOString(),priority:r.priority||db.settings.defaultPriority,completed:false,repeatId:r.id,repeatKey:key,occurrenceDate:occurrence,deleteExpired:!!r.deleteExpired,notifications:r.notifications||{}}); changed=true;
    }
  }
  if(changed)save();
}
function maintenance(){
  if(!db.settings.autoMaintenance)return; const now=new Date(); const kept=[]; let changed=false;
  for(const t of db.tasks){
    if(t.deleteExpired&&!t.completed&&new Date(t.dueAt)<now){
      if(t.repeatKey&&!db.skips.includes(t.repeatKey))db.skips.push(t.repeatKey);
      changed=true;
    }else kept.push(t);
  }
  if(changed){db.tasks=kept;save();}
}
function isSameDay(a,b){return ymd(a)===ymd(b)}
function filteredTasks(){const now=new Date(),today=startDay(now);return allTasks().filter(t=>{const d=new Date(t.dueAt);if(currentFilter==='today')return isSameDay(d,now);if(currentFilter==='upcoming')return d>=today&&!isSameDay(d,now)&&!t.completed;if(currentFilter==='overdue')return d<now&&!t.completed;return true})}

function render(){document.getElementById('todayLabel').textContent=new Intl.DateTimeFormat('ja-JP',{dateStyle:'full'}).format(new Date());renderTasks();renderCalendar();renderRepeats();renderSettings();}
function taskHTML(t){const due=new Date(t.dueAt),over=due<new Date()&&!t.completed;return `<article class="task-card" data-id="${t.id}"><button class="complete-btn ${t.completed?'done':''}" data-action="complete" aria-label="完了">${t.completed?'✓':''}</button><div><div class="task-title ${t.completed?'done':''}">${esc(t.title)}</div><div class="task-meta"><span class="pill p-${t.priority}">${priorityLabel(t.priority)}</span><span class="${over?'overdue':''}">${over?'期限切れ · ':''}${fmtDateTime(due)}</span>${t.repeatId?'<span class="pill">繰り返し</span>':''}</div>${t.note?`<div class="muted small">${esc(t.note)}</div>`:''}</div><button class="task-menu" data-action="menu">•••</button></article>`}
function renderTasks(){const list=document.getElementById('taskList'),tasks=filteredTasks();list.innerHTML=tasks.map(taskHTML).join('');document.getElementById('emptyTasks').classList.toggle('hidden',tasks.length>0)}
function renderCalendar(){
  const y=calCursor.getFullYear(),m=calCursor.getMonth();document.getElementById('monthLabel').textContent=`${y}年 ${m+1}月`;const first=new Date(y,m,1),start=addDays(first,-first.getDay());const tasks=allTasks();let html='';
  for(let i=0;i<42;i++){const d=addDays(start,i),ds=ymd(d),n=tasks.filter(t=>ymd(new Date(t.dueAt))===ds).length;html+=`<button class="calendar-day ${d.getMonth()!==m?'other':''} ${ds===ymd(new Date())?'current':''} ${ds===selectedDate?'selected':''}" data-date="${ds}">${d.getDate()}${n?`<span class="dots"><i class="dot"></i>${n>1?'<i class="dot"></i>':''}${n>3?'<i class="dot"></i>':''}</span>`:''}</button>`}document.getElementById('calendarGrid').innerHTML=html;const sd=parseLocal(selectedDate);document.getElementById('selectedDateLabel').textContent=fmtDate(sd);document.getElementById('calendarTaskList').innerHTML=tasks.filter(t=>ymd(new Date(t.dueAt))===selectedDate).map(taskHTML).join('')||'<div class="empty">この日のタスクはありません。</div>';
}
function renderRepeats(){const el=document.getElementById('repeatList');el.innerHTML=db.repeats.map(r=>`<article class="repeat-card" data-repeat="${r.id}"><strong>${esc(r.title)}</strong><div class="task-meta"><span class="pill p-${r.priority||db.settings.defaultPriority}">${priorityLabel(r.priority||db.settings.defaultPriority)}</span><span>${repeatSummary(r)}</span><span>${r.deleteExpired?'期限後削除':'期限後も残す'}</span></div><div class="repeat-actions"><button class="secondary" data-ra="toggle">${r.enabled===false?'有効化':'停止'}</button><button class="secondary" data-ra="edit">編集</button><button class="secondary danger-text" data-ra="delete">削除</button></div></article>`).join('');document.getElementById('emptyRepeat').classList.toggle('hidden',db.repeats.length>0)}
function repeatSummary(r){const n=Math.max(1,Number(r.interval)||1);if(r.unit==='day')return `${n===1?'毎日':`${n}日ごと`}`;if(r.unit==='month')return `${n===1?'毎月':`${n}か月ごと`}`;const names=['日','月','火','水','木','金','土'];const ds=(r.weekdays||[]).map(x=>names[x]).join('・');return `${n===1?'毎週':`${n}週ごと`} ${ds}`}
function renderSettings(){document.getElementById('defaultPriority').value=db.settings.defaultPriority;document.getElementById('autoMaintenance').checked=!!db.settings.autoMaintenance;document.getElementById('notifyStatus').textContent=('Notification'in window)?`現在の通知権限: ${Notification.permission}`:'この環境では通知APIを利用できません。'}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function openTask(t=null){const f=document.getElementById('taskForm');f.reset();document.getElementById('taskId').value=t?.id||'';document.getElementById('taskDialogTitle').textContent=t?'タスクを編集':'タスクを追加';document.getElementById('taskTitle').value=t?.title||'';document.getElementById('taskNote').value=t?.note||'';const due=t?new Date(t.dueAt):addDays(new Date(),0);document.getElementById('taskDate').value=ymd(due);document.getElementById('taskTime').value=t?`${pad(due.getHours())}:${pad(due.getMinutes())}`:'18:00';document.getElementById('taskPriority').value=t?.priority||'';const n=t?.notifications||{};document.getElementById('notifyAtDeadline').checked=!!n.atDeadline;document.getElementById('notifyBeforeEnabled').checked=!!n.beforeEnabled;document.getElementById('notifyBeforeValue').value=n.beforeDays??1;document.getElementById('dailyNotifyEnabled').checked=!!n.dailyEnabled;document.getElementById('dailyNotifyTime').value=n.dailyTime||'20:00';document.getElementById('thresholdNotifyEnabled').checked=!!n.thresholdEnabled;document.getElementById('thresholdDays').value=n.thresholdDays??1;document.getElementById('thresholdTime').value=n.thresholdTime||'20:00';document.getElementById('taskDialog').showModal()}
function saveTask(){const id=document.getElementById('taskId').value;const due=parseLocal(document.getElementById('taskDate').value,document.getElementById('taskTime').value);const data={title:document.getElementById('taskTitle').value.trim(),note:document.getElementById('taskNote').value.trim(),dueAt:due.toISOString(),priority:document.getElementById('taskPriority').value||db.settings.defaultPriority,notifications:{atDeadline:document.getElementById('notifyAtDeadline').checked,beforeEnabled:document.getElementById('notifyBeforeEnabled').checked,beforeDays:Number(document.getElementById('notifyBeforeValue').value)||1,dailyEnabled:document.getElementById('dailyNotifyEnabled').checked,dailyTime:document.getElementById('dailyNotifyTime').value,thresholdEnabled:document.getElementById('thresholdNotifyEnabled').checked,thresholdDays:Number(document.getElementById('thresholdDays').value)||0,thresholdTime:document.getElementById('thresholdTime').value}};if(id){const i=db.tasks.findIndex(x=>x.id===id);db.tasks[i]={...db.tasks[i],...data}}else db.tasks.push({id:uid(),completed:false,...data});save();render()}
function deleteTask(t){if(t.repeatKey&&!db.skips.includes(t.repeatKey))db.skips.push(t.repeatKey);db.tasks=db.tasks.filter(x=>x.id!==t.id);save();render()}
function taskAction(id,action){const t=db.tasks.find(x=>x.id===id);if(!t)return;if(action==='complete'){t.completed=!t.completed;save();render()}else if(action==='menu'){const a=prompt('操作を入力してください： edit / delete', 'edit');if(a==='edit')openTask(t);if(a==='delete'&&confirm('このタスクを削除しますか？'))deleteTask(t)}}

function openRepeat(r=null){document.getElementById('repeatForm').reset();document.getElementById('repeatId').value=r?.id||'';document.getElementById('repeatDialogTitle').textContent=r?'繰り返しを編集':'繰り返しを追加';document.getElementById('repeatTitle').value=r?.title||'';document.getElementById('repeatNote').value=r?.note||'';document.getElementById('repeatStart').value=r?.startDate||ymd(new Date());document.getElementById('repeatEnd').value=r?.endDate||'';document.getElementById('repeatUnit').value=r?.unit||'week';document.getElementById('repeatInterval').value=r?.interval||1;document.getElementById('dueOffsetDays').value=r?.dueOffsetDays??0;document.getElementById('repeatDueTime').value=r?.dueTime||'18:00';document.getElementById('repeatPriority').value=r?.priority||'';document.getElementById('deleteExpired').checked=!!r?.deleteExpired;document.getElementById('repeatNotifyDeadline').checked=!!r?.notifications?.atDeadline;document.getElementById('repeatNotifyBefore').checked=!!r?.notifications?.beforeEnabled;document.getElementById('repeatNotifyBeforeDays').value=r?.notifications?.beforeDays??1;document.querySelectorAll('#weekdayPicker input').forEach(x=>x.checked=(r?.weekdays||[new Date().getDay()]).includes(Number(x.value)));updateWeekdays();document.getElementById('repeatDialog').showModal()}
function updateWeekdays(){document.getElementById('weekdayPicker').classList.toggle('hidden',document.getElementById('repeatUnit').value!=='week')}
function saveRepeat(){const id=document.getElementById('repeatId').value;const data={title:document.getElementById('repeatTitle').value.trim(),note:document.getElementById('repeatNote').value.trim(),startDate:document.getElementById('repeatStart').value,endDate:document.getElementById('repeatEnd').value,unit:document.getElementById('repeatUnit').value,interval:Number(document.getElementById('repeatInterval').value)||1,weekdays:[...document.querySelectorAll('#weekdayPicker input:checked')].map(x=>Number(x.value)),dueOffsetDays:Number(document.getElementById('dueOffsetDays').value)||0,dueTime:document.getElementById('repeatDueTime').value||'18:00',priority:document.getElementById('repeatPriority').value||db.settings.defaultPriority,deleteExpired:document.getElementById('deleteExpired').checked,notifications:{atDeadline:document.getElementById('repeatNotifyDeadline').checked,beforeEnabled:document.getElementById('repeatNotifyBefore').checked,beforeDays:Number(document.getElementById('repeatNotifyBeforeDays').value)||1},enabled:true};if(data.unit==='week'&&!data.weekdays.length)data.weekdays=[parseLocal(data.startDate).getDay()];if(id){const i=db.repeats.findIndex(x=>x.id===id);db.repeats[i]={...db.repeats[i],...data,id};db.tasks=db.tasks.filter(t=>t.repeatId!==id)}else db.repeats.push({id:uid(),...data});save();materializeRepeats();render()}

async function requestNotifications(){if(!('Notification'in window))return alert('この環境では通知APIを利用できません。');try{const p=await Notification.requestPermission();renderSettings();if(p==='granted')new Notification('ReminderFlow',{body:'通知が許可されました。ローカル版ではアプリ起動中のルール確認に使用します。'})}catch(e){alert(`通知設定に失敗しました: ${e.message}`)}}
function checkForegroundNotifications(){if(!('Notification'in window)||Notification.permission!=='granted')return;const now=new Date(),minuteKey=`${ymd(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;for(const t of allTasks().filter(x=>!x.completed)){
  const due=new Date(t.dueAt),n=t.notifications||{};const triggers=[];
  if(n.atDeadline&&Math.abs(due-now)<60000)triggers.push('期限です');
  if(n.beforeEnabled){const target=addDays(due,-Number(n.beforeDays||1));if(Math.abs(target-now)<60000)triggers.push(`期限まで${n.beforeDays||1}日です`)}
  if(n.dailyEnabled&&`${pad(now.getHours())}:${pad(now.getMinutes())}`===n.dailyTime)triggers.push('未完了です');
  if(n.thresholdEnabled&&`${pad(now.getHours())}:${pad(now.getMinutes())}`===n.thresholdTime){const days=(due-now)/86400000;if(days>=0&&days<=Number(n.thresholdDays||0)+1/1440)triggers.push(`期限まで${Math.ceil(days)}日以内です`)}
  for(const reason of triggers){const k=`${t.id}|${reason}|${minuteKey}`;if(db.settings.lastNotifications[k])continue;db.settings.lastNotifications[k]=Date.now();new Notification(t.title,{body:reason,icon:'icons/icon-192.png'})}
  }
  const cutoff=Date.now()-7*86400000;for(const[k,v]of Object.entries(db.settings.lastNotifications))if(v<cutoff)delete db.settings.lastNotifications[k];save();
}

function exportData(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ReminderFlow-backup-${ymd(new Date())}.json`;a.click();URL.revokeObjectURL(a.href)}
async function importData(file){try{const x=JSON.parse(await file.text());if(!x.tasks||!x.repeats)throw new Error('形式が違います');db={...emptyDB(),...x,settings:{...emptyDB().settings,...x.settings}};save();render();alert('バックアップを読み込みました。')}catch(e){alert(`読み込み失敗: ${e.message}`)}}

function wire(){
  document.getElementById('addTaskTop').onclick=()=>openTask();document.getElementById('taskForm').addEventListener('submit',e=>{if(e.submitter?.value==='save')saveTask()});document.getElementById('addRepeat').onclick=()=>openRepeat();document.getElementById('repeatForm').addEventListener('submit',e=>{if(e.submitter?.value==='save')saveRepeat()});document.getElementById('repeatUnit').onchange=updateWeekdays;
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
  document.querySelectorAll('.tabbar button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabbar button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.getElementById(`view-${b.dataset.view}`).classList.add('active');render()});
  document.getElementById('taskFilter').onclick=e=>{const b=e.target.closest('button');if(!b)return;currentFilter=b.dataset.filter;document.querySelectorAll('#taskFilter button').forEach(x=>x.classList.toggle('active',x===b));renderTasks()};
  const taskClick=e=>{const c=e.target.closest('.task-card');const a=e.target.closest('[data-action]');if(c&&a)taskAction(c.dataset.id,a.dataset.action)};document.getElementById('taskList').onclick=taskClick;document.getElementById('calendarTaskList').onclick=taskClick;
  document.getElementById('prevMonth').onclick=()=>{calCursor.setMonth(calCursor.getMonth()-1);renderCalendar()};document.getElementById('nextMonth').onclick=()=>{calCursor.setMonth(calCursor.getMonth()+1);renderCalendar()};document.getElementById('calendarGrid').onclick=e=>{const b=e.target.closest('[data-date]');if(b){selectedDate=b.dataset.date;renderCalendar()}};
  document.getElementById('repeatList').onclick=e=>{const card=e.target.closest('[data-repeat]'),b=e.target.closest('[data-ra]');if(!card||!b)return;const r=db.repeats.find(x=>x.id===card.dataset.repeat);if(b.dataset.ra==='edit')openRepeat(r);if(b.dataset.ra==='toggle'){r.enabled=r.enabled===false?true:false;save();render()}if(b.dataset.ra==='delete'&&confirm('この繰り返し設定を削除しますか？')){db.repeats=db.repeats.filter(x=>x.id!==r.id);db.tasks=db.tasks.filter(t=>t.repeatId!==r.id);save();render()}};
  document.getElementById('defaultPriority').onchange=e=>{db.settings.defaultPriority=e.target.value;save();render()};document.getElementById('autoMaintenance').onchange=e=>{db.settings.autoMaintenance=e.target.checked;save();render()};document.getElementById('requestNotify').onclick=requestNotifications;document.getElementById('exportData').onclick=exportData;document.getElementById('importData').onchange=e=>e.target.files[0]&&importData(e.target.files[0]);document.getElementById('clearCompleted').onclick=()=>{if(confirm('完了済みタスクを削除しますか？')){db.tasks=db.tasks.filter(t=>!t.completed);save();render()}};
}

async function boot(){wire();materializeRepeats();maintenance();render();if('serviceWorker'in navigator){try{await navigator.serviceWorker.register('./sw.js')}catch(e){console.warn('SW registration failed',e)}}notificationTick=setInterval(checkForegroundNotifications,30000);checkForegroundNotifications()}
boot();
