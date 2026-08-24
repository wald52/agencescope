const fmtMd = n => new Intl.NumberFormat("fr-FR", {maximumFractionDigits:2}).format(n) + " Md€";
const fmtEur = n => new Intl.NumberFormat("fr-FR", {style:"currency", currency:"EUR", maximumFractionDigits:0}).format(n*1e9);
const fmtNum = n => new Intl.NumberFormat("fr-FR").format(n);
const fmtPct = n => (n>0?"+":"")+n.toFixed(1).replace(".",",")+"%";

let agences=[], chiffres={}, perimetres={};
let state = {
  perim: "operateur",
  expert: false,
  search: "",
  mission: "",
  statut: "",
  tri: "ressources_desc",
  fichesMode: "simple",
  cardsShown: 9,
};

let fuse;
let charts={};
let currentModalId=null;
let prog = {vues:new Set(), quiz:0, justeprix:0};

// Load
async function load(){
  const [a, c] = await Promise.all([
    fetch("./data/agences.json").then(r=>r.json()),
    fetch("./data/chiffres-cles.json").then(r=>r.json()),
  ]);
  agences=a; chiffres=c; perimetres=c.perimetres;
  fuse = new Fuse(agences, {keys:["nom","sigle","mission","programme"], threshold:0.32});
  initProg();
  renderAll();
  setupEvents();
  pickDefi();
  pickJustePrix();
}

function filtered(){
  let list = agences.filter(x=> x.perimetres.includes(state.perim));
  if(state.search){
    const res = fuse.search(state.search);
    const ids = new Set(res.map(r=>r.item.id));
    list = list.filter(x=> ids.has(x.id));
  }
  if(state.mission) list = list.filter(x=> x.mission===state.mission);
  if(state.statut) list = list.filter(x=> x.statut===state.statut);
  // tri
  const [k, dir] = state.tri.split("_");
  const keyMap = {ressources:"ressources_totales_Md", financement:"financement_etat_Md", etpt:"etpt", tresorerie:"tresorerie_Md", nom:"nom"};
  const key = keyMap[k]||k;
  list.sort((A,B)=>{
    let va=A[key], vb=B[key];
    if(typeof va==="string") return dir==="asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    return dir==="desc" ? vb-va : va-vb;
  });
  return list;
}

function renderAll(){
  renderHero();
  renderPerimetres();
  renderFilters();
  renderTable();
  renderViz();
  renderCards();
  renderGamif();
  setupProgress();
}

// HERO
function renderHero(){
  const p = perimetres[state.perim];
  const tot = p.financement_Md;
  const count = state.perim==="operateur"? 434 : state.perim==="odac"? 710 : 1244;
  const etpt = state.perim==="operateur"? "482 000" : state.perim==="odac"? "~600 000" : "~750 000";
  const kpisEl = document.getElementById("kpis");
  const top5 = chiffres.top5_subventions;
  kpisEl.innerHTML = `
    <div class="kpi"><div class="label">Agences (périmètre)</div><div class="value numeral">${fmtNum(count)}</div><div class="hint">${p.label}</div><div class="trend">Scope : ${state.perim}</div></div>
    <div class="kpi"><div class="label">Financement État</div><div class="value numeral">${fmtMd(tot)}</div><div class="hint">PLF 2026 · ${state.perim==="operateur"?"33,9 Md subventions + 21,7 taxes":"dont taxes affectées"}</div><div class="trend">${state.perim==="operateur"?"73,3 Md total":"~140 Md large (est.)"}</div></div>
    <div class="kpi"><div class="label">Agents (ETPT)</div><div class="value numeral">${etpt}</div><div class="hint">${state.perim==="operateur"?"401k sous plafond · 34,1 Md masse salariale":"estimation"}</div><div class="trend">Top subvention : ${top5[0].nom} ${top5[0].Md} Md€</div></div>
  `;
  document.getElementById("count-display").textContent = `${fmtNum(filtered().length)} affichées`;
  document.getElementById("liste-sub").innerHTML = `(Périmètre : <strong>${p.label}</strong> — ${fmtNum(filtered().length)} lignes)`;
  // quiz hero
  renderQuiz();
}

function renderQuiz(){
  const choicesEl = document.getElementById("quiz-choices");
  const tops = [...agences].filter(a=>a.perimetres.includes("operateur")).sort((a,b)=>b.financement_etat_Md - a.financement_etat_Md).slice(0,4);
  // shuffle
  const shuffled = tops.sort(()=>Math.random()-0.5);
  const correct = tops.sort((a,b)=>b.financement_etat_Md - a.financement_etat_Md)[0];
  choicesEl.innerHTML = shuffled.map(a=> `<button class="choice" data-id="${a.id}">${a.sigle}<span class="badge">${fmtMd(a.financement_etat_Md)}</span></button>`).join("");
  const resEl = document.getElementById("quiz-result");
  const shareEl = document.getElementById("quiz-share");
  let answered=false;
  choicesEl.querySelectorAll(".choice").forEach(btn=>{
    btn.onclick=()=>{
      if(answered) return;
      answered=true;
      const id = btn.dataset.id;
      const ok = id===correct.id;
      choicesEl.querySelectorAll(".choice").forEach(b=>{
        if(b.dataset.id===correct.id) b.classList.add("correct");
        else if(b===btn && !ok) b.classList.add("wrong");
        b.style.pointerEvents="none";
      });
      resEl.innerHTML = ok
        ? `✅ Bravo ! <strong>${correct.sigle}</strong> est bien #1 avec <strong>${fmtMd(correct.financement_etat_Md)}</strong> (ressources ${fmtMd(correct.ressources_totales_Md)}). <span style="color:var(--muted)">Les 5 plus financés concentrent 59% des subventions.</span>`
        : `Presque ! La bonne réponse est <strong>${correct.sigle} — ${fmtMd(correct.financement_etat_Md)}</strong> (ressources ${fmtMd(correct.ressources_totales_Md)}).`;
      resEl.classList.add("show");
      shareEl.style.display="flex";
      if(ok){ prog.quiz++; saveProg(); renderGamif(); }
      if(navigator.vibrate && ok) navigator.vibrate(40);
    };
  });
  document.getElementById("btn-again").onclick=()=>{
    answered=false; resEl.classList.remove("show"); shareEl.style.display="none";
    choicesEl.querySelectorAll(".choice").forEach(b=>{b.classList.remove("correct","wrong"); b.style.pointerEvents="";});
  };
  document.getElementById("btn-share").onclick=shareSite;
}

async function shareSite(){
  const text = `Agencescope : ${perimetres[state.perim].count} agences, ${fmtMd(perimetres[state.perim].financement_Md)} de financement État. J'ai testé le quiz — et toi ?`;
  const url = location.href;
  if(navigator.share){ try{ await navigator.share({title:document.title, text, url}); }catch{} }
  else if(navigator.clipboard){ await navigator.clipboard.writeText(text+" "+url); alert("Lien copié !"); }
  else prompt("Copie :", text+" "+url);
}

// Perimetres
function renderPerimetres(){
  const ctx = document.getElementById("chart-perimetres");
  if(charts.perim) charts.perim.destroy();
  const labels=["Opérateurs 434","ODAC ~710","Large 1244"];
  const vals=[73.3, 108, 140];
  charts.perim = new Chart(ctx, {
    type:"bar",
    data:{labels, datasets:[{label:"Financement Md€", data:vals, backgroundColor:["#000091","#ff9800","#E1000F"], borderRadius:8}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=> fmtMd(c.raw)}}}, scales:{y:{ticks:{callback:v=>v+" Md€"}}}}
  });
}

// Filters + Table
function renderFilters(){
  const missions = [...new Set(agences.map(a=>a.mission).filter(Boolean))].sort();
  const statuts = [...new Set(agences.map(a=>a.statut).filter(Boolean))].sort();
  const selM = document.getElementById("filter-mission");
  const selS = document.getElementById("filter-statut");
  if(selM.options.length===1){
    missions.forEach(m=> selM.insertAdjacentHTML("beforeend", `<option>${m}</option>`));
    statuts.forEach(s=> selS.insertAdjacentHTML("beforeend", `<option>${s}</option>`));
  }
}

function renderTable(){
  const list = filtered();
  document.getElementById("liste-count").textContent = `${fmtNum(list.length)} agences`;
  document.getElementById("count-display").textContent = `${fmtNum(list.length)} affichées`;
  const thead = document.getElementById("thead");
  const expert = state.expert;
  if(expert){
    thead.innerHTML = `<th>Agence</th><th>Périm.</th><th>Mission</th><th>Statut</th><th style="text-align:right">Ressources</th><th style="text-align:right">État</th><th style="text-align:right">Taxes</th><th style="text-align:right">ETPT</th><th style="text-align:right">Trésorerie</th>`;
  } else {
    thead.innerHTML = `<th>Agence</th><th>Mission</th><th style="text-align:right">Ressources</th><th style="text-align:right">Financement État</th><th style="text-align:right">ETPT</th><th></th>`;
  }
  const tbody = document.getElementById("tbody");
  if(list.length===0){
    tbody.innerHTML=""; document.getElementById("table-empty").style.display="block"; return;
  }
  document.getElementById("table-empty").style.display="none";
  const maxFin = Math.max(...list.map(a=>a.financement_etat_Md),1);
  // helper badges multi-catégories : une agence n'apparaît qu'une fois, ses appartenances sont listées
  const badgeHtml = (a) => a.perimetres.map(p=>{
    if(p==="operateur") return `<span class="badge-perimetre badge-operateur">Opérateur</span>`;
    if(p==="odac") return `<span class="badge-perimetre badge-odac">ODAC</span>`;
    if(p==="agence-large") return `<span class="badge-perimetre badge-large">Large</span>`;
    return `<span class="badge-perimetre">${p}</span>`;
  }).join(" ");
  const multiFlag = (a) => a.perimetres.length>1 ? ` <span class="pill" style="background:#f0f0ff;border-color:#d0d0ff;font-size:.68rem">×${a.perimetres.length}</span>` : "";
  tbody.innerHTML = list.slice(0,80).map(a=>{
    const badges = badgeHtml(a) + multiFlag(a);
    if(expert){
      return `<tr data-id="${a.id}" class="${a.is_categorie?"categorie":""}">
        <td><div style="font-weight:800">${a.nom}</div><div class="etpt">${a.sigle} · ${a.nb_entities>1? a.nb_entities+" entités":""} ${a.is_categorie?"· catégorie":""}</div></td>
        <td>${badges}</td>
        <td style="font-size:.82rem">${a.mission}</td>
        <td><span class="pill">${a.statut}</span></td>
        <td class="numeral" style="text-align:right">${fmtMd(a.ressources_totales_Md)}</td>
        <td class="numeral" style="text-align:right"><strong>${fmtMd(a.financement_etat_Md)}</strong><div class="mini-bar"><span style="width:${(a.financement_etat_Md/maxFin*100).toFixed(0)}%"></span></div></td>
        <td class="numeral" style="text-align:right">${fmtMd(a.taxes_affectees_Md)}</td>
        <td class="numeral" style="text-align:right">${fmtNum(a.etpt)}</td>
        <td class="numeral" style="text-align:right">${fmtMd(a.tresorerie_Md)}</td>
      </tr>`;
    } else {
      return `<tr data-id="${a.id}" class="${a.is_categorie?"categorie":""}">
        <td><div style="font-weight:800">${a.nom}</div><div class="etpt">${a.mission} · ${a.statut}</div><div style="margin-top:4px">${badges}</div></td>
        <td style="font-size:.82rem">${a.mission}</td>
        <td class="numeral" style="text-align:right">${fmtMd(a.ressources_totales_Md)}</td>
        <td class="numeral" style="text-align:right"><strong>${fmtMd(a.financement_etat_Md)}</strong><div class="mini-bar"><span style="width:${(a.financement_etat_Md/maxFin*100).toFixed(0)}%"></span></div></td>
        <td class="numeral" style="text-align:right">${fmtNum(a.etpt)}</td>
        <td><span class="badge-perimetre badge-operateur">${a.part_financement_public_pct}% public</span>${a.perimetres.length>1?`<div style="margin-top:4px;font-size:.68rem;color:var(--muted)">${a.perimetres.length} périmètres</div>`:""}</td>
      </tr>`;
    }
  }).join("");
  tbody.querySelectorAll("tr").forEach(tr=>{
    tr.addEventListener("click", ()=> openModal(tr.dataset.id));
    tr.addEventListener("dblclick", ()=> openModal(tr.dataset.id));
  });
  document.getElementById("vue-indicator").textContent = expert? "Vue experte" : "Vue simple";
}

// Viz
let vizMode="source";
function renderViz(){
  const list = filtered().slice(0,20);
  // top
  const ctxTop = document.getElementById("chart-top");
  if(charts.top) charts.top.destroy();
  const topN = state.expert? 20 : 12;
  const topList = filtered().sort((a,b)=>b.financement_etat_Md - a.financement_etat_Md).slice(0, topN);
  charts.top = new Chart(ctxTop, {
    type:"bar",
    data:{
      labels: topList.map(a=> a.sigle),
      datasets:[
        {label:"Financement État", data: topList.map(a=>a.financement_etat_Md), backgroundColor: topList.map((_,i)=> i<3? "#000091" : i<6? "#3a3aff" : "#a9b4ff"), borderRadius:6},
        ...(state.expert? [{label:"Trésorerie", data: topList.map(a=>a.tresorerie_Md), backgroundColor:"rgba(255,107,53,.55)", borderRadius:6}] : [])
      ]
    },
    options:{
      indexAxis:"y", responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:state.expert}, tooltip:{callbacks:{label:c=> `${c.dataset.label}: ${fmtMd(c.raw)}`}}},
      scales:{x:{ticks:{callback:v=>v+" Md€"}}, y:{ticks:{font:{size:10}}}}
    }
  });
  document.getElementById("top-insight").textContent = `Lecture : ${topList[0].sigle} domine (${fmtMd(topList[0].financement_etat_Md)}). Les 5 premiers = ~60% du financement. En expert, la trésorerie révèle les “coussins” (ex: ADEME 2,8 Md).`;

  // source vs emploi
  const ctxS = document.getElementById("chart-source");
  if(charts.source) charts.source.destroy();
  const sum = (k)=> filtered().reduce((s,a)=>s+a[k],0);
  if(vizMode==="source"){
    const src = [sum("subvention_scp_Md"), sum("transferts_Md"), sum("taxes_affectees_Md"), sum("ressources_propres_Md")];
    charts.source = new Chart(ctxS, {
      type:"doughnut",
      data:{labels:["Subventions SCP","Transferts","Taxes affectées","Ressources propres"], datasets:[{data:src, backgroundColor:["#000091","#3a6cff","#ff6b35","#00c2a8"], borderWidth:2}]},
      options:{responsive:true, maintainAspectRatio:false, cutout:"58%", plugins:{legend:{position:"bottom"}, tooltip:{callbacks:{label:c=> `${c.label}: ${fmtMd(c.raw)} (${(c.raw/src.reduce((a,b)=>a+b,0)*100).toFixed(1)}%)`}}}}
    });
    document.getElementById("viz-insight").textContent = `Source : sur ${fmtMd(src.reduce((a,b)=>a+b,0))} de ressources, ${(src[0]/src.reduce((a,b)=>a+b,0)*100).toFixed(0)}% viennent de subventions. Les taxes pèsent ${(src[2]/src.reduce((a,b)=>a+b,0)*100).toFixed(0)}% (France Compétences 11,3 Md).`;
  } else {
    const emp = [sum("charges_personnel_Md"), sum("charges_fonctionnement_Md"), sum("charges_intervention_Md"), sum("charges_investissement_Md")];
    charts.source = new Chart(ctxS, {
      type:"doughnut",
      data:{labels:["Personnel","Fonctionnement","Intervention","Investissement"], datasets:[{data:emp, backgroundColor:["#000091","#6c8cff","#ff9800","#00c2a8"], borderWidth:2}]},
      options:{responsive:true, maintainAspectRatio:false, cutout:"58%", plugins:{legend:{position:"bottom"}, tooltip:{callbacks:{label:c=> `${c.label}: ${fmtMd(c.raw)}`}}}}
    });
    document.getElementById("viz-insight").textContent = `Emploi : personnel ${fmtMd(emp[0])} (~${(emp[0]/emp.reduce((a,b)=>a+b,0)*100).toFixed(0)}%), intervention ${fmtMd(emp[2])}. En expert, compare avec ETPT.`;
  }

  // mission
  const ctxM = document.getElementById("chart-mission");
  if(charts.mission) charts.mission.destroy();
  const byMission = {};
  filtered().forEach(a=> { byMission[a.mission]=(byMission[a.mission]||0)+a.financement_etat_Md; });
  const sortedM = Object.entries(byMission).sort((a,b)=>b[1]-a[1]).slice(0,8);
  charts.mission = new Chart(ctxM, {
    type:"bar",
    data:{labels: sortedM.map(x=>x[0]), datasets:[{label:"Financement État", data: sortedM.map(x=>x[1]), backgroundColor:"#000091", borderRadius:6}]},
    options:{indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=> fmtMd(c.raw)}}}, scales:{x:{ticks:{callback:v=>v+" Md€"}}}}
  });
  document.getElementById("mission-insight").textContent = `${sortedM[0][0]} concentre ${fmtMd(sortedM[0][1])}. Les 3 premières missions = ${(sortedM.slice(0,3).reduce((s,x)=>s+x[1],0)/sortedM.reduce((s,x)=>s+x[1],0)*100).toFixed(0)}% du périmètre.`;

  // histo
  const ctxH = document.getElementById("chart-histo");
  if(charts.histo) charts.histo.destroy();
  const years=[2007,2012,2019,2023,2025,2026];
  const vals=[19.2,38.9,45, 68, 74.8,73.3];
  charts.histo = new Chart(ctxH, {
    type:"line",
    data:{labels:years, datasets:[{label:"Financement État (Md€)", data:vals, borderColor:"#000091", backgroundColor:"rgba(0,0,145,.08)", fill:true, tension:.3, pointRadius:4}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>v+" Md€"}}}}
  });
}

// Cards
function renderCards(){
  const list = filtered();
  const mode = state.fichesMode;
  const shown = list.slice(0, state.cardsShown);
  document.getElementById("fiches-count").textContent = `${fmtNum(shown.length)} / ${fmtNum(list.length)}`;
  const wrap = document.getElementById("cards");
  wrap.innerHTML = shown.map(a=>{
    const pct = a.part_financement_public_pct;
    const lvl = pct>80? 3 : pct>50? 2 : 1;
    const badges = a.perimetres.map(p=> p==="operateur"?`<span class="badge-perimetre badge-operateur">Opérateur</span>`:p==="odac"?`<span class="badge-perimetre badge-odac">ODAC</span>`:`<span class="badge-perimetre badge-large">Large</span>`).join(" ");
    const multi = a.perimetres.length>1 ? ` <span class="pill" style="font-size:.68rem">×${a.perimetres.length} périmètres</span>` : "";
    if(mode==="simple"){
      return `<div class="agence-card" data-id="${a.id}">
        <div class="head">
          <div class="title">${a.nom}</div>
          <span class="badge-perimetre ${a.perimetres.includes("operateur")?"badge-operateur":"badge-large"}">${a.sigle}</span>
        </div>
        <div class="meta">${a.mission} · ${a.statut} ${a.nb_entities>1? "· "+a.nb_entities+" entités":""} </div>
        <div style="margin:4px 0">${badges}${multi}</div>
        <div class="vals">
          <div class="val"><div class="k">Ressources</div><div class="v">${fmtMd(a.ressources_totales_Md)}</div></div>
          <div class="val"><div class="k">État</div><div class="v">${fmtMd(a.financement_etat_Md)}</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted)"><span>ETPT ${fmtNum(a.etpt)}</span><span>${pct}% public</span></div>
        <div class="level-bar">${[1,2,3].map(i=> `<span class="${i<=lvl?"filled":""}"></span>`).join("")}</div>
      </div>`;
    } else {
      return `<div class="agence-card" data-id="${a.id}" style="border-left:3px solid ${a.perimetres.includes("operateur")?"#000091":"#ff9800"}">
        <div class="head">
          <div class="title">${a.nom}</div>
          <span class="pill">${fmtMd(a.tresorerie_Md)} trésor</span>
        </div>
        <div class="meta">${a.mission} · ${a.programme} · ${a.statut}</div>
        <div class="vals">
          <div class="val"><div class="k">Personnel</div><div class="v">${fmtMd(a.charges_personnel_Md)}</div></div>
          <div class="val"><div class="k">Intervention</div><div class="v">${fmtMd(a.charges_intervention_Md)}</div></div>
        </div>
        <div class="vals">
          <div class="val"><div class="k">Subv. SCP</div><div class="v">${fmtMd(a.subvention_scp_Md)}</div></div>
          <div class="val"><div class="k">Taxes</div><div class="v">${fmtMd(a.taxes_affectees_Md)}</div></div>
        </div>
        <div style="font-size:.75rem;color:var(--muted)">Top10 rémunérations : ${a.top10_remunerations_kE? fmtNum(a.top10_remunerations_kE)+" k€":"—"} · ${a.surface_utile_m2? fmtNum(a.surface_utile_m2)+" m²":""}</div>
      </div>`;
    }
  }).join("");
  wrap.querySelectorAll(".agence-card").forEach(el=> el.addEventListener("click", ()=> openModal(el.dataset.id)));
}

// Gamif
function initProg(){
  try{
    const saved = JSON.parse(localStorage.getItem("agencescope_prog")||"{}");
    prog.vues = new Set(saved.vues||[]);
    prog.quiz = saved.quiz||0;
    prog.justeprix = saved.justeprix||0;
  }catch{}
}
function saveProg(){
  localStorage.setItem("agencescope_prog", JSON.stringify({vues:[...prog.vues], quiz:prog.quiz, justeprix:prog.justeprix}));
}
function levelFromCount(n){
  if(n>=50) return "Expert";
  if(n>=20) return "Éclaireur";
  if(n>=10) return "Enquêteur";
  if(n>=5) return "Curieux";
  if(n>=1) return "Novice";
  return "Curieux";
}
function renderGamif(){
  const total = filtered().length;
  const vues = prog.vues.size;
  const pct = Math.min(100, Math.round(vues/20*100));
  document.getElementById("gamif-progress").textContent = `${vues}/${total} explorées`;
  document.getElementById("gamif-level").textContent = levelFromCount(vues);
  document.getElementById("level-bar").innerHTML = [1,2,3,4,5].map(i=> `<span class="${i<= Math.ceil(pct/20)?"filled":""}"></span>`).join("");
  const badges = [
    {id:"curieux", label:"🔍 Curieux", need:1, earned: vues>=1},
    {id:"enqueteur", label:"🕵️ Enquêteur", need:10, earned: vues>=10},
    {id:"expert", label:"🎓 Expert", need:20, earned: vues>=20},
    {id:"quiz", label:"🏆 Quiz", need:1, earned: prog.quiz>=1, extra:`${prog.quiz}`},
  ];
  document.getElementById("badges-mini").innerHTML = badges.map(b=> `<span class="badge-earn ${b.earned?"earned":"locked"}">${b.label}${b.extra?" ×"+b.extra:""}</span>`).join("");
  document.getElementById("prog-count").textContent = vues;
  document.getElementById("prog-quiz").textContent = prog.quiz;
  document.getElementById("prog-level").textContent = levelFromCount(vues);
  document.getElementById("prog-bar").innerHTML = [1,2,3,4,5].map(i=> `<span class="${i<= Math.ceil(vues/10)?"filled":""}"></span>`).join("");
  document.getElementById("prog-badges").innerHTML = badges.map(b=> `<span class="badge-earn ${b.earned?"earned":"locked"}">${b.label}</span>`).join("");
}

// Juste prix
let jpTarget=null;
function pickJustePrix(){
  const list = filtered().length? filtered() : agences;
  jpTarget = list[Math.floor(Math.random()*Math.min(30,list.length))];
  document.getElementById("jp-nom").textContent = jpTarget.nom;
  document.getElementById("jp-meta").textContent = `${jpTarget.mission} · ${jpTarget.statut} · ${jpTarget.etpt} ETPT`;
  document.getElementById("jp-slider").value=1;
  document.getElementById("jp-value").textContent = fmtMd(1);
  document.getElementById("jp-result").classList.remove("show");
  document.getElementById("jp-vs").textContent="";
  document.getElementById("jp-slider").max = Math.max(5, jpTarget.financement_etat_Md*1.8).toFixed(1);
}
function setupJustePrix(){
  const slider=document.getElementById("jp-slider");
  const valEl=document.getElementById("jp-value");
  slider.addEventListener("input", ()=> valEl.textContent = fmtMd(parseFloat(slider.value)));
  document.getElementById("jp-valider").addEventListener("click", ()=>{
    const guess=parseFloat(slider.value);
    const real=jpTarget.financement_etat_Md;
    const ecart=Math.abs(guess-real);
    const pct= real? (ecart/real*100).toFixed(0):0;
    const ok= pct<15;
    const res=document.getElementById("jp-result");
    res.innerHTML = ok
      ? `✅ Pas loin ! Réel : <strong>${fmtMd(real)}</strong> (ressources ${fmtMd(jpTarget.ressources_totales_Md)}). Écart ${pct}% — <strong>bravo</strong>.`
      : `💡 Réel : <strong>${fmtMd(real)}</strong> (ressources ${fmtMd(jpTarget.ressources_totales_Md)}). Écart ${pct}% — retente !`;
    res.classList.add("show");
    document.getElementById("jp-vs").textContent = `— réel ${fmtMd(real)}`;
    if(ok){ prog.justeprix++; prog.quiz++; saveProg(); renderGamif(); }
  });
  document.getElementById("jp-next").addEventListener("click", pickJustePrix);
}

// Défi
let defiTarget=null;
function pickDefi(){
  const list = agences.filter(a=>a.tresorerie_Md>0.4);
  defiTarget = list[Math.floor(Math.random()*list.length)];
  document.getElementById("defi-nom").textContent = defiTarget.nom;
  document.getElementById("defi-hint").textContent = `${defiTarget.mission} · Essaie de deviner sa trésorerie (indice : ${fmtMd(defiTarget.ressources_totales_Md)} de ressources)`;
  document.getElementById("defi-box").onclick=()=> openModal(defiTarget.id);
}

// Modal
let modalCharts={};
function openModal(id){
  const a = agences.find(x=>x.id===id);
  if(!a) return;
  currentModalId=id;
  prog.vues.add(id); saveProg(); renderGamif();
  document.getElementById("modal-title").textContent = a.nom;
  document.getElementById("modal-meta").textContent = `${a.sigle} · ${a.statut} · ${a.mission} · ${a.programme} ${a.nb_entities>1? "· "+a.nb_entities+" entités":""}`;
  const badgesEl=document.getElementById("modal-badges");
  const labelMap={operateur:"Opérateur de l'État", odac:"ODAC (INSEE)", "agence-large":"Vision large (IGF/iFRAP)"};
  badgesEl.innerHTML = a.perimetres.map(p=> `<span class="badge-perimetre badge-${p}">${labelMap[p]||p}</span>`).join(" ") + (a.perimetres.length>1?` <span class="pill" style="background:#f0f0ff;border-color:#d0d0ff">×${a.perimetres.length} périmètres — une seule fiche</span>`:"") + (a.is_categorie?` <span class="pill">Catégorie (${a.nb_entities} entités)</span>`:"") + ` <span class="pill">${a.part_financement_public_pct}% public</span>`;
  // caractéristique multi-catégories expliquée
  const noteEl=document.getElementById("modal-note");
  if(a.perimetres.length>1){
    noteEl.innerHTML = `ℹ️ <strong>Caractéristique :</strong> cette agence appartient à <strong>${a.perimetres.length} périmètres</strong> (${a.perimetres.map(p=>labelMap[p]).join(" + ")}). Elle n'apparaît qu'<strong>une seule fois</strong> dans Agencescope — c'est un choix pour éviter les doublons.`;
    noteEl.style.display="block"; noteEl.style.background="#f0f0ff"; noteEl.style.borderColor="#d0d0ff"; noteEl.style.color="#1a1a2e";
  } else if(a.note){ noteEl.textContent="⚠️ "+a.note; noteEl.style.display="block"; } else { noteEl.style.display="none"; }
  // kpis
  document.getElementById("modal-kpis").innerHTML = `
    <div class="kpi"><div class="label">Ressources totales</div><div class="value numeral">${fmtMd(a.ressources_totales_Md)}</div><div class="hint">dont ${fmtMd(a.financement_etat_Md)} État</div></div>
    <div class="kpi"><div class="label">Financement État</div><div class="value numeral">${fmtMd(a.financement_etat_Md)}</div><div class="hint">${fmtMd(a.subvention_scp_Md)} subvention · ${fmtMd(a.taxes_affectees_Md)} taxes</div></div>
    <div class="kpi"><div class="label">ETPT / Masse salariale</div><div class="value numeral">${fmtNum(a.etpt)}</div><div class="hint">${fmtMd(a.masse_salariale_Md)} masse salariale</div></div>
  `;
  // donuts
  if(modalCharts.src) modalCharts.src.destroy();
  if(modalCharts.emp) modalCharts.emp.destroy();
  modalCharts.src = new Chart(document.getElementById("modal-donut-source"), {
    type:"doughnut",
    data:{labels:["Subv. SCP","Transferts","Taxes","Propre"], datasets:[{data:[a.subvention_scp_Md, a.transferts_Md, a.taxes_affectees_Md, a.ressources_propres_Md], backgroundColor:["#000091","#3a6cff","#ff6b35","#00c2a8"]}]},
    options:{responsive:true, maintainAspectRatio:false, cutout:"62%", plugins:{legend:{position:"bottom", labels:{boxWidth:10}}}}
  });
  modalCharts.emp = new Chart(document.getElementById("modal-donut-emploi"), {
    type:"doughnut",
    data:{labels:["Personnel","Fonct.","Intervention","Invest."], datasets:[{data:[a.charges_personnel_Md, a.charges_fonctionnement_Md, a.charges_intervention_Md, a.charges_investissement_Md], backgroundColor:["#000091","#6c8cff","#ff9800","#00c2a8"]}]},
    options:{responsive:true, maintainAspectRatio:false, cutout:"62%", plugins:{legend:{position:"bottom", labels:{boxWidth:10}}}}
  });
  document.getElementById("modal-simple-insight").textContent = `${a.sigle} : ${a.part_financement_public_pct}% financé par l'État. Sur 1 Md€ de ressources, ${(a.subvention_scp_Md/a.ressources_totales_Md*100).toFixed(0)}% est de la subvention pour charges de service public.`;

  // expert
  document.getElementById("modal-expert-grid").innerHTML = `
    <div class="detail-box"><div class="k">ETPT sous plafond</div><div class="v">${fmtNum(a.etpt)}</div><div style="font-size:.78rem;color:var(--muted)">${a.statut} · ${a.mission}</div></div>
    <div class="detail-box"><div class="k">Masse salariale</div><div class="v">${fmtMd(a.masse_salariale_Md)}</div><div style="font-size:.78rem;color:var(--muted)">${(a.charges_personnel_Md? (a.masse_salariale_Md/a.charges_personnel_Md*100).toFixed(0):"—")}% des charges de personnel</div></div>
    <div class="detail-box"><div class="k">Trésorerie</div><div class="v">${fmtMd(a.tresorerie_Md)}</div><div style="font-size:.78rem;color:var(--muted)">${(a.tresorerie_Md/a.ressources_totales_Md*100).toFixed(0)}% des ressources — ${a.tresorerie_Md>1?"coussin important":""}</div></div>
    <div class="detail-box"><div class="k">Part État vs propre</div><div class="v">${a.part_financement_public_pct}%</div><div style="font-size:.78rem;color:var(--muted)">${fmtMd(a.financement_etat_Md)} État vs ${fmtMd(a.ressources_propres_Md)} propre</div></div>
  `;
  document.getElementById("modal-surface").textContent = fmtNum(a.surface_utile_m2)+" m² ("+(a.surface_utile_m2/a.etpt).toFixed(1)+" m²/ETPT)";
  document.getElementById("modal-top10").textContent = a.top10_remunerations_kE? fmtNum(a.top10_remunerations_kE)+" k€ brut" : "—";
  document.getElementById("modal-expert-insight").textContent = `Lecture experte : ${a.nom} emploie ${fmtNum(a.etpt)} ETPT pour ${fmtMd(a.ressources_totales_Md)} de ressources. Ratio : ${(a.ressources_totales_Md*1e6/a.etpt).toFixed(0)} k€ par ETPT.`;
  const exEl=document.getElementById("modal-exemples");
  if(a.exemples_entites){
    exEl.innerHTML = `<div style="font-size:.82rem;color:var(--muted)"><strong>Exemples d'entités (${a.nb_entities} au total) :</strong> ${a.exemples_entites.join(" · ")}</div>`;
  } else exEl.innerHTML="";

  // budget tab
  const body=document.getElementById("modal-budget-body");
  const rows=[
    ["Subvention pour charges de service public", a.subvention_scp_Md],
    ["Transferts (interventions)", a.transferts_Md],
    ["Taxes affectées", a.taxes_affectees_Md],
    ["Ressources propres / autres", a.ressources_propres_Md],
    ["— Charges de personnel", a.charges_personnel_Md],
    ["— Charges de fonctionnement", a.charges_fonctionnement_Md],
    ["— Charges d'intervention", a.charges_intervention_Md],
    ["— Charges d'investissement", a.charges_investissement_Md],
  ];
  const totalR = a.ressources_totales_Md || 1;
  body.innerHTML = rows.map(([k,v])=> `<tr><td>${k}</td><td style="text-align:right;font-weight:800">${fmtMd(v)}</td><td style="color:var(--muted)">${(v/totalR*100).toFixed(1)}%</td></tr>`).join("");
  if(modalCharts.bar) modalCharts.bar.destroy();
  modalCharts.bar = new Chart(document.getElementById("modal-bar-budget"), {
    type:"bar",
    data:{labels:["Subv.","Transferts","Taxes","Propre"], datasets:[{label:"Md€", data:[a.subvention_scp_Md,a.transferts_Md,a.taxes_affectees_Md,a.ressources_propres_Md], backgroundColor:["#000091","#3a6cff","#ff6b35","#00c2a8"], borderRadius:6}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>v+" Md€"}}}}
  });
  document.getElementById("modal-budget-insight").textContent = `Budget détaillé (jaune PLF) : ${a.nom} — sources en Md€. En simple tu vois 3 chiffres, ici le détail complet pour vérifier.`;

  document.getElementById("modal").classList.add("open");
  document.getElementById("modal").setAttribute("aria-hidden","false");
}
function closeModal(){
  document.getElementById("modal").classList.remove("open");
  document.getElementById("modal").setAttribute("aria-hidden","true");
  currentModalId=null;
}

// Events
function setupEvents(){
  // perimetre switch
  document.querySelectorAll(".perimetre-switch button").forEach(b=>{
    b.addEventListener("click", ()=>{
      document.querySelectorAll(".perimetre-switch button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      state.perim = b.dataset.perim;
      state.cardsShown=9;
      renderAll();
    });
  });
  // expert toggle
  document.getElementById("expert-toggle").addEventListener("change", e=>{
    state.expert=e.target.checked;
    document.getElementById("simple-hint").style.display = state.expert?"none":"";
    document.getElementById("expert-hint").style.display = state.expert?"":"none";
    renderTable(); renderViz(); renderCards();
  });
  // search
  document.getElementById("search").addEventListener("input", e=>{ state.search=e.target.value; renderTable(); renderCards(); document.getElementById("count-display").textContent=`${fmtNum(filtered().length)} affichées`; });
  document.getElementById("filter-mission").addEventListener("change", e=>{ state.mission=e.target.value; renderTable(); renderCards(); renderViz(); });
  document.getElementById("filter-statut").addEventListener("change", e=>{ state.statut=e.target.value; renderTable(); renderCards(); });
  document.getElementById("filter-tri").addEventListener("change", e=>{ state.tri=e.target.value; renderTable(); });
  document.getElementById("btn-random").addEventListener("click", ()=>{
    const list=filtered();
    const r=list[Math.floor(Math.random()*list.length)];
    if(r) openModal(r.id);
  });
  document.getElementById("btn-export").addEventListener("click", exportCsv);
  document.getElementById("btn-more").addEventListener("click", ()=>{ state.cardsShown+=9; renderCards(); });
  // viz toggle
  document.querySelectorAll("#viz-toggle button").forEach(b=>{
    b.addEventListener("click", ()=>{
      document.querySelectorAll("#viz-toggle button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      vizMode=b.dataset.viz;
      renderViz();
    });
  });
  // fiches toggle
  document.querySelectorAll("#fiches-toggle button").forEach(b=>{
    b.addEventListener("click", ()=>{
      document.querySelectorAll("#fiches-toggle button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      state.fichesMode=b.dataset.fiches;
      renderCards();
    });
  });
  // modal
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", e=>{ if(e.target.id==="modal") closeModal(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeModal(); if(e.key==="ArrowRight" && currentModalId) nextModal(); });
  document.getElementById("modal-next").addEventListener("click", nextModal);
  document.querySelectorAll("#modal-tabs button").forEach(b=>{
    b.addEventListener("click", ()=>{
      document.querySelectorAll("#modal-tabs button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
      document.getElementById("tab-"+b.dataset.tab).classList.add("active");
    });
  });
  document.getElementById("modal-share").addEventListener("click", ()=>{
    const a=agences.find(x=>x.id===currentModalId);
    if(!a) return;
    const text=`Agencescope — ${a.nom} : ${fmtMd(a.financement_etat_Md)} de financement État, ${fmtNum(a.etpt)} ETPT. Et toi, tu connais tes agences ?`;
    if(navigator.share) navigator.share({title:a.nom, text, url:location.href+"#"+a.id});
    else if(navigator.clipboard){ navigator.clipboard.writeText(text+" "+location.href); alert("Lien copié !");}
  });
  document.getElementById("btn-share-site").addEventListener("click", shareSite);
  document.getElementById("btn-share-defi").addEventListener("click", ()=>{
    const txt=`Défi Agencescope : devine la trésorerie de ${defiTarget.nom} !`;
    if(navigator.share) navigator.share({title:"Défi", text:txt, url:location.href});
    else alert(txt+" "+location.href);
  });
  document.getElementById("btn-reset-prog").addEventListener("click", ()=>{ localStorage.removeItem("agencescope_prog"); prog={vues:new Set(),quiz:0,justeprix:0}; renderGamif(); });
  setupJustePrix();
}

function nextModal(){
  const list=filtered();
  const idx=list.findIndex(x=>x.id===currentModalId);
  const nxt=list[(idx+1)%list.length];
  if(nxt) openModal(nxt.id);
}

function exportCsv(){
  const list=filtered();
  const header=["nom","sigle","mission","programme","statut","nb_entities","perimetres","ressources_Md","financement_etat_Md","taxes_Md","etpt","tresorerie_Md"];
  const rows=[header.join(";")].concat(list.map(a=> [a.nom,a.sigle,a.mission,a.programme,a.statut,a.nb_entities,a.perimetres.join("/"),a.ressources_totales_Md,a.financement_etat_Md,a.taxes_affectees_Md,a.etpt,a.tresorerie_Md].map(v=> `"${String(v).replace(/"/g,'""')}"`).join(";")));
  const blob=new Blob([rows.join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`agencescope-${state.perim}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

function setupProgress(){
  const bar=document.getElementById("read-progress");
  const onScroll=()=>{
    const h=document.documentElement;
    const pct=(h.scrollTop/(h.scrollHeight - h.clientHeight))*100;
    bar.style.width=pct+"%";
  };
  addEventListener("scroll", onScroll, {passive:true});
}

load().catch(e=>{
  console.error(e);
  document.body.insertAdjacentHTML("afterbegin", `<div style="background:#fff0f0;border:1px solid #E1000F;padding:10px;text-align:center">Erreur chargement données : ${e.message}</div>`);
});
