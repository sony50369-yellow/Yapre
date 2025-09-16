
const fmtDate = d => d.toISOString().slice(0,10);
const addDays = (d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;}
const parseDate = s => { const d=new Date(s); return isNaN(d)?null:d; };

let DRUGS = [];
let selectedPlans = [];

const drugList = document.getElementById('drugList');
const drugSearch = document.getElementById('drugSearch');
const drugSelect = document.getElementById('drugSelect');
const strengthSelect = document.getElementById('strengthSelect');
const doseMlPerDay = document.getElementById('doseMlPerDay');
const rtmCheckbox = document.getElementById('rtmCheckbox');
const addDrugBtn = document.getElementById('addDrugBtn');

const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const totalDaysInput = document.getElementById('totalDays');

const selectedTbody = document.querySelector('#selectedTable tbody');
const summaryTbody = document.querySelector('#summaryTable tbody');
const rtmNote = document.getElementById('rtmNote');

fetch('drugs.json').then(r=>r.json()).then(d=>{ DRUGS=d; populateSelectors(); });

function syncDates(){
  const s=parseDate(startDateInput.value);
  const e=parseDate(endDateInput.value);
  const days=parseInt(totalDaysInput.value,10);
  if (s && days>0) endDateInput.value = fmtDate(addDays(s, days-1));
  else if (s && e) totalDaysInput.value = Math.round((e-s)/(1000*3600*24))+1;
}
[startDateInput, endDateInput, totalDaysInput].forEach(el => el.addEventListener('input', syncDates));

function populateSelectors(){
  const names = [...new Set(DRUGS.map(d=>d.name))].filter(Boolean);
  drugSelect.innerHTML = names.map(n=>`<option value="${n}">${n}</option>`).join('');
  renderStrengths();
  drugList.innerHTML = names.map(n=>`<option value="${n}">`).join('');
}
function renderStrengths(){
  const name = (drugSelect.value||"").trim();
  const items = DRUGS.filter(d=>d.name===name);
  const strengths=[...new Set(items.map(x=>x.strength||""))];
  strengthSelect.innerHTML = strengths.map(s=>`<option value="${s}">${s||"(ไม่มีระบุ)"}</option>`).join('');
  const canRTM = items.some(x=>x.supports_rtm);
  rtmCheckbox.disabled = !canRTM;
  rtmCheckbox.checked = false;
}
drugSelect.addEventListener('change', renderStrengths);
drugSearch.addEventListener('input', ()=>{
  const q=(drugSearch.value||"").toLowerCase().trim();
  const names=[...new Set(DRUGS.map(d=>d.name))];
  let idx=names.findIndex(n=>n.toLowerCase()===q);
  if (idx<0) idx=names.findIndex(n=>n.toLowerCase().includes(q));
  if (idx>=0){ drugSelect.selectedIndex=idx; renderStrengths(); }
});

function bottlesForDays(days, mlPerDay, bottleMl){ return Math.ceil( (mlPerDay*days) / bottleMl ); }
function chipsHTML(schedule){
  return '<div class="schedule-chips">'+schedule.map(s=>{
    const cls = (s.type==='LIQUID')?'blue':'orange';
    return `<span class="chip ${cls}"><b>${s.date}</b> • ${s.type} • ${s.bottles} ขวด (${s.range})</span>`;
  }).join('')+'</div>';
}
function joinComponentsText(components){
  if (!components||!components.length) return "-";
  return components.map(c=>{
    if (c.ingredient && c.qty_num && c.qty_unit_th) return `${c.ingredient} ${c.qty_num} ${c.qty_unit_th}`;
    if (c.ingredient && c.qty_text) return `${c.ingredient} ${c.qty_text}`;
    return c.ingredient||c.qty_text||"";
  }).join(" + ");
}

// RTM overlap rule: first round gives LIQUID 1..L and RTM 1..S (to minimize visits)
function computePlan(cfg){
  const {name,strength,bottleMl,expiryDays,mlPerDay,startDate,totalDays,components,supportsRTM,rtmShelfDays,useRTM} = cfg;
  const L = expiryDays || 0;
  const S = rtmShelfDays || 0;
  const T = totalDays;
  const schedule=[];

  const liquidDays = Math.min(L, T);
  if (liquidDays>0){
    schedule.push({type:"LIQUID", date:fmtDate(startDate), days:liquidDays, bottles:bottlesForDays(liquidDays,mlPerDay,bottleMl), range:`วัน 1–${liquidDays}`});
  }

  if (useRTM && supportsRTM){
    const firstR = Math.min(S, T);
    schedule.push({type:"RTM", date:fmtDate(startDate), days:firstR, bottles:bottlesForDays(firstR,mlPerDay,bottleMl), range:`วัน 1–${firstR}`});
    let remaining = T - firstR;
    let cursor = addDays(startDate, firstR);
    while(remaining>0){
      const take = Math.min(S, remaining);
      schedule.push({type:"RTM", date:fmtDate(cursor), days:take, bottles:bottlesForDays(take,mlPerDay,bottleMl), range:`วัน ${T-remaining+1}–${T-remaining+take}`});
      remaining -= take; cursor = addDays(cursor, take);
    }
  }else{
    let remaining = T - liquidDays;
    let cursor = addDays(startDate, liquidDays);
    while(remaining>0){
      const take = Math.min(L||T, remaining);
      schedule.push({type:"LIQUID", date:fmtDate(cursor), days:take, bottles:bottlesForDays(take,mlPerDay,bottleMl), range:`วัน ${T-remaining+1}–${T-remaining+take}`});
      remaining -= take; cursor = addDays(cursor, take);
    }
  }

  return {name,strength,mlPerDay,bottleMl,expiryDays,components:(components||[]),supportsRTM,useRTM,rtmShelfDays,schedule};
}

addDrugBtn.addEventListener('click', ()=>{
  const name=(drugSelect.value||"").trim();
  const strength=(strengthSelect.value||"").trim();
  const mlPerDay=parseFloat(doseMlPerDay.value);
  if (!(name && mlPerDay>0)) return alert("กรุณาเลือกยาและกรอก ml/day");
  const items = DRUGS.filter(d=>d.name===name && (d.strength||"")===(strength||""));
  if (!items.length) return alert("ไม่พบรายการยา");
  const d0=items[0];
  const s=parseDate(startDateInput.value);
  const e=parseDate(endDateInput.value);
  let days=parseInt(totalDaysInput.value,10)||0;
  if (!(s && (e || days>0))) return alert("กรุณากรอกวันที่เริ่ม และวันนัดหรือจำนวนวันทั้งหมด");
  if (days<=0 && e) days = Math.round((e-s)/(1000*3600*24))+1;
  const plan = computePlan({
    name:d0.name,strength:d0.strength,bottleMl:d0.bottle_ml,expiryDays:d0.expiry_days,mlPerDay,
    startDate:s,totalDays:days,components:(d0.components||[]),supportsRTM:d0.supports_rtm,rtmShelfDays:d0.rtm_shelf_days,useRTM:rtmCheckbox.checked
  });
  appendSelectedRow(plan);
  refreshSummary();
});

function appendSelectedRow(plan){
  selectedPlans.push(plan);
  const perBottleTxt = joinComponentsText(plan.components);
  const totalBottles = plan.schedule.reduce((a,s)=>a+s.bottles,0);
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td><input type="checkbox" class="pickToggle" checked></td>
    <td>${plan.name}</td>
    <td>${plan.strength||""}</td>
    <td>${plan.mlPerDay}</td>
    <td>${plan.bottleMl}</td>
    <td>${plan.expiryDays}</td>
    <td>${plan.useRTM?'<span class="badge">RTM</span>':'-'}</td>
    <td>${perBottleTxt}</td>
    <td>${totalBottles} ขวด</td>
    <td><button class="delBtn">ลบ</button></td>`;
  selectedTbody.appendChild(tr);
  tr.querySelector('.delBtn').addEventListener('click', ()=>{ 
    const i=[...selectedTbody.children].indexOf(tr);
    selectedPlans.splice(i,1); tr.remove(); refreshSummary();
  });
  tr.querySelector('.pickToggle').addEventListener('change', refreshSummary);
}

function refreshSummary(){
  summaryTbody.innerHTML="";
  let showRTM=false;
  [...selectedTbody.querySelectorAll('tr')].forEach((row,idx)=>{
    if (!row.querySelector('.pickToggle').checked) return;
    const plan=selectedPlans[idx];
    if (plan.useRTM && plan.supportsRTM) showRTM=true;
    const perBottleTxt = joinComponentsText(plan.components);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${plan.name}</td><td>${plan.strength||""}</td><td>${plan.mlPerDay}</td><td>${plan.bottleMl}</td><td>${plan.expiryDays}</td><td>${perBottleTxt}</td>`;
    summaryTbody.appendChild(tr);
    const tr2=document.createElement('tr'); tr2.className='subrow';
    const td=document.createElement('td'); td.colSpan=6; td.innerHTML=chipsHTML(plan.schedule);
    tr2.appendChild(td); summaryTbody.appendChild(tr2);
  });
  rtmNote.textContent = showRTM ? "* RTM (ผง) อยู่ได้ 60 วัน; RTM ที่ผสมแล้ว อายุเท่ายาน้ำ" : "";
}
document.getElementById('printBtn').addEventListener('click', ()=>window.print());
