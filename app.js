
const $=(s,e=document)=>e.querySelector(s), $$=(s,e=document)=>[...e.querySelectorAll(s)];
const C=window.CATALOGUE||[];
let filter='all', query='', sort='rating', map=null;
let iconCounter=0;

const AIN_PATH=`M120 0 L31 273 L41 312 L10 358 L0 481 L44 498 L44 518 L89 521 L113 597 L233 593 L282 627 L368 533 L524 761 L556 733 L564 678 L607 665 L641 475 L634 346 L674 358 L675 331 L710 320 L730 281 L720 249 L804 222 L798 186 L832 118 L775 83 L654 214 L575 211 L571 173 L532 148 L474 207 L430 209 L430 167 L373 138 L369 106 L333 86 L336 57 L280 38 L270 4 L185 24 Z`;

const AIN_FALLBACK_BOUNDS=[[45.58,4.70],[46.53,6.18]];
const AIN_FALLBACK_OUTLINE=[[46.47115,4.964375],[46.444867,5.065937],[46.46677,5.19875],[46.429535,5.214375],[46.408728,5.301875],[46.376969,5.297187],[46.355066,5.353438],[46.320022,5.359687],[46.288263,5.44875],[46.242268,5.44875],[46.244458,5.5175],[46.309071,5.608125],[46.281692,5.669062],[46.240077,5.675312],[46.236792,5.79875],[46.380254,5.987812],[46.341925,6.076875],[46.267456,6.02375],[46.228031,6.033125],[46.198462,5.901875],[46.163418,5.9175],[46.120708,5.88625],[46.108662,5.831562],[46.079093,5.83],[46.092235,5.7675],[45.950962,5.778437],[45.742887,5.725312],[45.72865,5.658125],[45.668418,5.645625],[45.637754,5.595625],[45.887445,5.351875],[45.784502,5.2175],[45.821737,5.140937],[45.817356,4.953437],[45.900586,4.915938],[45.903872,4.845625],[45.925774,4.845625],[45.944392,4.776875],[46.079093,4.7925],[46.129469,4.840937],[46.172179,4.825312],[46.47115,4.964375]];

function addFallbackDepartmentOutline(map){
  return L.polygon(AIN_FALLBACK_OUTLINE,{
    interactive:false,
    color:'#1e2821',
    weight:5,
    opacity:1,
    fillColor:'#f7f0df',
    fillOpacity:.06,
    lineCap:'round',
    lineJoin:'round',
    className:'ain-department-outline'
  }).addTo(map);
}

// Les 405 fiches portent déjà leur commune officielle et leurs coordonnées :
// aucun appel réseau n'est nécessaire pour les situer. Seule reste utile la
// dispersion des épingles superposées, calculée une fois au chargement.
function normalizePlace(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[’']/g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
}

let pinsSpread=false;

function spreadOverlappingPins(){
  if(pinsSpread) return;
  pinsSpread=true;

  const groups=new Map();
  for(const x of C){
    if(!Number.isFinite(Number(x.lat))||!Number.isFinite(Number(x.lng))) continue;
    const k=normalizePlace(x.city);
    const g=groups.get(k);
    if(g) g.push(x); else groups.set(k,[x]);
  }

  for(const items of groups.values()){
    const n=items.length;
    if(n<2) continue;
    const step=(Math.PI*2)/n;
    for(let i=0;i<n;i++){
      const x=items[i], a=step*i, radius=.0026+((i>>3)*.0012);
      x._mapLat=Number(x.lat)+Math.sin(a)*radius;
      x._mapLng=Number(x.lng)+Math.cos(a)*radius;
    }
  }
}

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function ainIcon(fill=1){
  // Fractional filling from left to right.
  // 0.50 = half-filled department, 0.75 = three quarters, etc.
  const f=clamp(Number(fill)||0,0,1);
  const id=`ain-fill-${++iconCounter}`;
  return `<svg class="ain-icon" viewBox="0 0 832 761" aria-hidden="true">
    <defs>
      <clipPath id="${id}">
        <rect x="0" y="0" width="${(832*f).toFixed(2)}" height="761"></rect>
      </clipPath>
    </defs>
    <path class="ain-rating-empty" d="${AIN_PATH}"></path>
    ${f>0?`<path class="ain-rating-fill" d="${AIN_PATH}" clip-path="url(#${id})"></path>`:''}
  </svg>`;
}

function ratingIcons(value){
  const v=clamp(Number(value)||0,0,5);
  return [0,1,2,3,4].map(i=>ainIcon(clamp(v-i,0,1))).join('');
}

function ratingHTML(v,showNumber=true,showVotes=false,votes=0){
  return `<div class="rating" title="Note du jeu de mot dans le nom">
    ${ratingIcons(v)}
    ${showNumber?`<span class="rating-num">${Number(v).toFixed(1)}/5</span>`:''}
    ${showVotes?`<span class="votes">· ${votes} vote${votes>1?'s':''}</span>`:''}
  </div>`;
}



function populateReportStructures(selectedSlug=''){
  const select=$('#reportStructure');
  if(!select) return;

  const current=selectedSlug || select.value;
  const options=[...C]
    .sort((a,b)=>a.name.localeCompare(b.name,'fr'))
    .map(x=>`<option value="${escapeHTML(x.slug)}" ${x.slug===current?'selected':''}>
      ${escapeHTML(x.name)} — ${escapeHTML(x.city)}
    </option>`).join('');

  select.innerHTML=`<option value="">Choisir une structure…</option>${options}`;
}

function openReportDialog(slug=''){
  const dialog=$('#reportDialog');
  const form=$('#reportForm');
  const thanks=$('#reportThanks');

  if(form){
    form.hidden=false;
    form.reset();
  }
  if(thanks) thanks.hidden=true;

  populateReportStructures(slug);
  if(!dialog.open) dialog.showModal();
}

async function submitReport(form){
  const fd=new FormData(form);
  const slug=String(fd.get('structure')||'');
  const item=C.find(x=>x.slug===slug);

  // On n'envoie que ce qui sert réellement à traiter la correction.
  // L'empreinte du navigateur (navigator.userAgent) n'a pas été retenue :
  // elle identifie le visiteur sans rien apporter au signalement.
  const report={
    structure_slug:slug,
    structure_name:item?.name || '',
    structure_city:item?.city || '',
    error_type:String(fd.get('errorType')||''),
    correction:String(fd.get('correction')||'').trim(),
    source_url:String(fd.get('sourceUrl')||'').trim(),
    contact_email:String(fd.get('email')||'').trim()
  };

  const config=window.AINCROYABLE_CONFIG||{};
  const supabaseUrl=String(config.supabaseUrl||'').replace(/\/+$/,'');
  const supabaseKey=String(config.supabaseAnonKey||'');

  // Production path: direct insert through Supabase REST.
  if(supabaseUrl && supabaseKey){
    // On appelle une fonction plutôt que d'écrire dans la table :
    // c'est elle qui chiffre l'adresse e-mail, avec une clé que le
    // navigateur ne voit jamais.
    const response=await fetch(`${supabaseUrl}/rest/v1/rpc/submit_report`,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':supabaseKey,
        'Authorization':`Bearer ${supabaseKey}`
      },
      body:JSON.stringify({
        p_slug:report.structure_slug,
        p_name:report.structure_name,
        p_city:report.structure_city,
        p_error_type:report.error_type,
        p_correction:report.correction,
        p_source_url:report.source_url,
        p_email:report.contact_email
      })
    });

    if(!response.ok){
      throw new Error(`Erreur d’envoi (${response.status})`);
    }
    return 'sent';
  }

  // Optional e-mail fallback if configured.
  if(config.reportEmail){
    const subject=encodeURIComponent(`Aincroyable — signalement : ${report.structure_name || 'catalogue'}`);
    const body=encodeURIComponent(
      `Structure : ${report.structure_name}\n`+
      `Commune : ${report.structure_city}\n`+
      `Type : ${report.error_type}\n\n`+
      `Correction proposée :\n${report.correction}\n\n`+
      `Lien utile : ${report.source_url || '—'}\n`+
      `Contact : ${report.contact_email || '—'}\n`+
      `Page : ${report.page_url}`
    );
    window.location.href=`mailto:${encodeURIComponent(config.reportEmail)}?subject=${subject}&body=${body}`;
    return 'mail';
  }

  // Preview fallback: copy the report so it is not lost.
  const text=
    `Signalement Aincroyable\n`+
    `Structure : ${report.structure_name} — ${report.structure_city}\n`+
    `Type : ${report.error_type}\n`+
    `Correction : ${report.correction}\n`+
    `Lien : ${report.source_url || '—'}`;

  try{
    await navigator.clipboard.writeText(text);
    showShareToast('Signalement copié — configurez l’envoi automatique pour le transmettre ✓');
  }catch(_){
    showShareToast('Signalement enregistré dans le formulaire ✓');
  }
  return 'preview';
}

function shareBaseUrl(){
  const url=new URL(window.location.href);
  url.search='';
  url.hash='';
  return url.toString();
}

function shareEntryUrl(slug){
  const url=new URL(shareBaseUrl());
  url.searchParams.set('nom',slug);
  url.hash='catalogue';
  return url.toString();
}

let shareToastTimer=null;
function showShareToast(message='Lien copié — vous pouvez le coller où vous voulez ✓'){
  const toast=$('#shareToast');
  if(!toast) return;
  toast.textContent=message;
  toast.hidden=false;
  clearTimeout(shareToastTimer);
  shareToastTimer=setTimeout(()=>{toast.hidden=true},2800);
}

async function fallbackCopyShare(text,url){
  const payload=`${text}\n${url}`;
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(payload);
      showShareToast('Lien copié — vous pouvez le coller où vous voulez ✓');
      return true;
    }
  }catch(_){}
  try{
    const ta=document.createElement('textarea');
    ta.value=payload;
    ta.style.position='fixed';
    ta.style.opacity='0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showShareToast('Lien copié — vous pouvez le coller où vous voulez ✓');
    return true;
  }catch(_){
    window.prompt('Copiez ce lien :',url);
    return false;
  }
}

async function smartShare({title='Aincroyable',text='',url=shareBaseUrl()}={}){
  const payload={title,text,url};
  try{
    if(navigator.share && (!navigator.canShare || navigator.canShare(payload))){
      await navigator.share(payload);
      return;
    }
  }catch(err){
    if(err?.name==='AbortError') return;
  }
  await fallbackCopyShare(text,url);
}

function shareSite(){
  return smartShare({
    title:'Aincroyable',
    text:"Découvre Aincroyable, le grand recensement des noms ainventifs de l'Ain.",
    url:shareBaseUrl()
  });
}

function shareRating(x,score){
  return smartShare({
    title:`${x.name} — Aincroyable`,
    text:`J’ai mis ${score}/5 à ${x.name} sur Aincroyable. Et toi ?`,
    url:shareEntryUrl(x.slug)
  });
}

function statusClass(s){
  return s==='uncertain'?'uncertain':s==='closed'?'closed':'';
}

function markerColor(x){
  if(x.status==='uncertain') return '#c99a2b';
  if(x.status==='closed') return '#77776f';
  return x.type==='Association' ? '#234f3c' : '#d94d2b';
}

function filtered(){
  const q=query.toLocaleLowerCase('fr');
  const a=C.filter(x=>
    `${x.name} ${x.city} ${x.type}`.toLocaleLowerCase('fr').includes(q) &&
    (filter==='all'||x.type===filter||x.status===filter)
  );

  a.sort((x,y)=>
    sort==='name' ? x.name.localeCompare(y.name,'fr') :
    sort==='votes' ? y.votes-x.votes :
    y.rating-x.rating || y.votes-x.votes
  );
  return a;
}

function renderStats(){
  $('#statEntries').textContent=C.length;
  $('#statActive').textContent=C.filter(x=>x.status==='active').length;
  $('#statAssoc').textContent=C.filter(x=>x.type==='Association').length;
}

function tooltipHTML(x){
  return `<div class="leaflet-ain-tooltip">
    <strong>${escapeHTML(x.name)}</strong>
    <span class="leaflet-tooltip-city">${escapeHTML(x.city)}</span>
    ${ratingHTML(x.rating,true,true,x.votes)}
  </div>`;
}


function mapPinGlyph(x){
  if(x.status==='closed'){
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>`;
  }
  if(x.status==='uncertain'){
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3.1 3.1 0 1 1 4.5 2.8c-1.3.7-1.7 1.3-1.7 2.5M12 18.3v.2"/></svg>`;
  }
  if(x.type==='Association'){
    return `<svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="2.4"/><circle cx="16.3" cy="9" r="1.9"/>
      <path d="M4.8 19c.1-3 1.9-5 4.2-5s4.1 2 4.2 5M13.2 15.2c.8-.7 1.8-1.1 2.8-1.1 2 0 3.5 1.5 3.7 4"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.5 20.5V4h9v5h4v11.5M8.5 7.5h2M8.5 11h2M8.5 14.5h2M12.5 12h2M12.5 15.5h2M9 20.5v-3h3v3"/>
  </svg>`;
}

function mapPinClass(x){
  if(x.status==='closed') return 'closed';
  if(x.status==='uncertain') return 'uncertain';
  return x.type==='Association' ? 'association' : 'company';
}

function makeMapPinIcon(x){
  return L.divIcon({
    className:'ain-pin-wrapper',
    html:`<span class="ain-map-pin ${mapPinClass(x)}"><span class="ain-map-pin-glyph">${mapPinGlyph(x)}</span></span>`,
    iconSize:[38,46],
    iconAnchor:[19,45],
    tooltipAnchor:[0,-39]
  });
}

function renderMap(){
  spreadOverlappingPins();
  const el=$('#ainMap');
  if(!el) return;

  if(!window.L){
    el.innerHTML='<div class="map-error">La carte OpenStreetMap n’a pas pu être chargée.</div>';
    return;
  }

  map=L.map(el,{
    zoomControl:true,
    attributionControl:true,
    scrollWheelZoom:true,
    minZoom:7,
    maxZoom:18
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(map);

  const fallback=L.latLngBounds(AIN_FALLBACK_BOUNDS);
  map.fitBounds(fallback,{padding:[18,18]});

  // Exact Ain outline extracted from departements-20180101.shp.
  // This uses the original polygon vertices from the supplied shapefile.
  const originalOutline=window.AIN_EXACT_OUTLINE;
  let departmentLayer=null;
  if(Array.isArray(originalOutline) && originalOutline.length>100){
    departmentLayer=L.polygon(originalOutline,{
      interactive:false,
      color:'#8a8f8c',
      weight:4,
      opacity:1,
      fillColor:'#dfe2e0',
      fillOpacity:.38,
      lineCap:'round',
      lineJoin:'round',
      className:'ain-department-outline original-ain-outline'
    }).addTo(map);

    const bounds=departmentLayer.getBounds();
    map.fitBounds(bounds,{padding:[28,28]});
    map.setMaxBounds(bounds.pad(.65));
    departmentLayer.bringToFront();
  }

  C.forEach(x=>{
    if(!Number.isFinite(Number(x.lat))||!Number.isFinite(Number(x.lng))) return;

    const marker=L.marker(
      [x._mapLat??x.lat,x._mapLng??x.lng],
      {icon:makeMapPinIcon(x),riseOnHover:true}
    ).addTo(map);

    marker.bindTooltip(tooltipHTML(x),{
      direction:'top',
      offset:[0,-8],
      opacity:1,
      sticky:true,
      className:'ain-leaflet-tooltip'
    });

    marker.on({
      mouseover:()=>marker.getElement()?.classList.add('pin-hover'),
      mouseout:()=>marker.getElement()?.classList.remove('pin-hover'),
      click:()=>openDetail(x.slug)
    });
  });

  requestAnimationFrame(()=>map.invalidateSize());
  window.addEventListener('resize',()=>map?.invalidateSize(),{passive:true});
}

function renderCards(){
  const a=filtered();
  $('#resultCount').textContent=`${a.length} résultat${a.length>1?'s':''}`;

  $('#cards').innerHTML=a.map(x=>`
    <article class="card" tabindex="0" data-slug="${x.slug}">
      <div class="card-top">
        <span class="type">${escapeHTML(x.type)}</span>
        <span class="status ${statusClass(x.status)}">${escapeHTML(x.statusLabel)}</span>
      </div>
      <h3>${escapeHTML(x.name)}</h3>
      <div class="city">${escapeHTML(x.city)}</div>
      ${x.status==='closed'?`<div class="archive-mini">Archive</div>`:''}
      ${ratingHTML(x.rating,true,true,x.votes)}
      <span class="card-arrow">↗</span>
    </article>`).join('');

  $$('.card').forEach(c=>{
    c.onclick=()=>openDetail(c.dataset.slug);
    c.onkeydown=e=>{
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        openDetail(c.dataset.slug);
      }
    };
  });
}

function renderPodium(){
  const votes=[...C].filter(x=>x.votes>0);

  // Tant que personne n'a voté, un podium de trois noms à 0,0/5 donne
  // l'impression que le site est cassé : on invite à voter à la place.
  if(!votes.length){
    $('#podium').innerHTML=`<article class="podium-empty">
      <h3>Le classement n’attend que vous</h3>
      <p>Aucun nom ainventif n’a encore été noté. Ouvrez une fiche du catalogue
         et attribuez-lui de 0 à 5&nbsp;départements : le podium se construira
         à partir de vos votes.</p>
      <button class="btn primary" type="button" id="podiumRandom">🎲 Noter un nom au hasard</button>
    </article>`;
    const r=$('#podiumRandom');
    if(r) r.onclick=()=>openDetail(C[Math.floor(Math.random()*C.length)].slug);
    return;
  }

  const top=votes.sort((a,b)=>b.rating-a.rating||b.votes-a.votes).slice(0,3);
  // L'ordre visuel classique est 2e, 1er, 3e. Le rang doit toutefois rester
  // attaché au résultat, notamment lorsqu'il n'y a encore qu'un seul votant.
  const podiumEntries=[
    {entry:top[1],rank:2},
    {entry:top[0],rank:1},
    {entry:top[2],rank:3}
  ].filter(item=>item.entry);

  $('#podium').className=`podium podium-count-${podiumEntries.length}`;
  $('#podium').innerHTML=podiumEntries.map(({entry:x,rank})=>{
    return `<article class="podium-card rank-${rank} ${rank===1?'first':''}" data-slug="${x.slug}">
      ${podiumLaurel(rank)}
      <div class="rank">0${rank}</div>
      <h3>${escapeHTML(x.name)}</h3>
      <div class="city">${escapeHTML(x.city)}</div>
      <div class="podium-rating">${ratingHTML(x.rating,false,false)}</div>
      <div class="podium-score">Note du jeu de mot dans le nom : ${Number(x.rating).toFixed(1)}/5 · ${x.votes} vote${x.votes>1?'s':''}</div>
    </article>`;
  }).join('');

  $$('.podium-card').forEach(c=>c.onclick=()=>openDetail(c.dataset.slug));
}

/* ------------------------------------------------------------------
   VOTES

   Deux niveaux :
   - localStorage garde la note du visiteur, pour réafficher son choix
     et fonctionner même si Supabase n'est pas configuré ;
   - Supabase agrège les votes de tout le monde. Le navigateur ne peut
     pas écrire directement dans la table : il appelle la fonction
     cast_vote(), seule porte d'entrée en écriture (voir supabase.sql).
------------------------------------------------------------------ */

function supabaseConfig(){
  const c = window.AINCROYABLE_CONFIG || {};
  const url = String(c.supabaseUrl || '').replace(/\/+$/, '');
  const key = String(c.supabaseAnonKey || '');
  return (url && key) ? {url, key} : null;
}

function voterToken(){
  let t = localStorage.getItem('aincroyable-voter');
  if(!t){
    t = (crypto.randomUUID && crypto.randomUUID()) ||
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random()*16|0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    localStorage.setItem('aincroyable-voter', t);
  }
  return t;
}

function allVotes(){
  try{return JSON.parse(localStorage.getItem('aincroyable-votes')||'{}')}
  catch{return {}}
}

function userVote(slug){
  return allVotes()[slug]??null;
}

function saveVote(slug,score){
  const votes=allVotes();
  votes[slug]=score;
  localStorage.setItem('aincroyable-votes',JSON.stringify(votes));
}

/* Sans base partagée, la note affichée reflète le vote de ce visiteur,
   pour que l'interaction reste lisible. Dès que Supabase est configuré,
   c'est le serveur qui fait foi et cette fonction n'est plus appelée. */
function applyLocalAggregate(){
  if(supabaseConfig()) return;
  const mine=allVotes();
  C.forEach(x=>{
    const v=mine[x.slug];
    if(v===undefined || v===null){ x.rating=0; x.votes=0; }
    else { x.rating=Number(v); x.votes=1; }
  });
}

/* Charge les moyennes publiques et les applique au catalogue. */
async function loadRatings(){
  const cfg = supabaseConfig();
  if(!cfg) return false;
  try{
    const r = await fetch(`${cfg.url}/rest/v1/rating_summary?select=slug,rating,votes`, {
      headers:{apikey:cfg.key, Authorization:`Bearer ${cfg.key}`}
    });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const rows = await r.json();
    const bySlug = new Map(rows.map(x => [x.slug, x]));
    C.forEach(x => {
      const s = bySlug.get(x.slug);
      x.rating = s ? Number(s.rating) : 0;
      x.votes  = s ? Number(s.votes)  : 0;
      x.demoRating = false;
    });
    return true;
  }catch(err){
    console.warn('Notes indisponibles, affichage des valeurs locales.', err);
    return false;
  }
}

/* Enregistre un vote et renvoie la moyenne à jour. */
async function sendVote(slug, score){
  const cfg = supabaseConfig();
  if(!cfg) return null;
  const r = await fetch(`${cfg.url}/rest/v1/rpc/cast_vote`, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:cfg.key,
      Authorization:`Bearer ${cfg.key}`
    },
    body:JSON.stringify({p_slug:slug, p_token:voterToken(), p_score:score})
  });
  if(!r.ok) throw new Error(`Vote refusé (${r.status})`);
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? {rating:Number(row.rating), votes:Number(row.votes)} : null;
}


/* N'accepte qu'une URL http(s). Bloque notamment les schémas exécutables
   du type javascript: ou data:, au cas où une fiche mal saisie en contiendrait
   un jour — le lien est alors simplement omis plutôt qu'affiché. */
function safeUrl(u){
  try{
    const parsed = new URL(String(u||''), location.href);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : '';
  }catch{ return ''; }
}

function podiumLaurel(rank){
  const src = rank===1
    ? 'laurel-gold.png'
    : rank===2
      ? 'laurel-silver.png'
      : 'laurel-bronze.png';

  const label = rank===1
    ? 'Lauriers or'
    : rank===2
      ? 'Lauriers argent'
      : 'Lauriers bronze';

  return `<div class="podium-laurel" aria-hidden="true">
    <img src="${src}" alt="${label}">
  </div>`;
}

function voteIconButtons(value){
  return `
    <button class="zero-vote ${value===0?'selected':''}" data-score="0" type="button">0</button>
    ${[1,2,3,4,5].map(i=>`
      <button class="vote-btn" data-score="${i}" type="button" aria-label="${i} sur 5">
        ${ainIcon(value!==null && i<=value ? 1 : 0)}
      </button>`).join('')}
  `;
}

function openDetail(slug){
  const x=C.find(v=>v.slug===slug);
  if(!x) return;

  const dialog=$('#detailDialog');
  const mine=userVote(slug);

  const renderDetail=()=>{
    const score=userVote(slug);

    $('#detailContent').innerHTML=`<div class="detail">
      <span class="status ${statusClass(x.status)}">${escapeHTML(x.statusLabel)}</span>
      <h2>${escapeHTML(x.name)}</h2>
      <div class="place">${escapeHTML(x.type)} · ${escapeHTML(x.city)}</div>
      ${x.status==='closed'?`<div class="closed-archive-banner">
        <strong>Archive Aincroyable</strong>
        <span>Cette structure est fermée ou inactive. Son nom est conservé dans le catalogue à titre d’archive.</span>
      </div>`:''}
      <p class="lead">${escapeHTML(x.description)}</p>

      <div class="current-rating">
        <span>Note du jeu de mot dans le nom</span>
        ${ratingHTML(x.rating,true,true,x.votes)}
      </div>

      <div class="vote-box">
        <h4>${score!==null?`Votre note : ${score}/5`:'Donnez votre note'}</h4>
        <div class="vote-controls">${voteIconButtons(score)}</div>
        ${score!==null?`
          <button class="share-rating-btn" type="button" data-share-rating>
            ↗ Partager ma note ${score}/5
          </button>`:''}
      </div>

      <div class="detail-actions">
        ${x.status==='active' && safeUrl(x.publicUrl)?`
          <a class="btn primary" href="${escapeHTML(safeUrl(x.publicUrl))}" target="_blank" rel="noopener noreferrer">Voir la structure ↗</a>`:''}
        <button class="btn ghost detail-share-site" type="button" data-share-entry>
          Partager ce nom ainventif
        </button>
        <button class="btn ghost detail-report-btn" type="button" data-report-entry>
          ⚑ Signaler une erreur
        </button>
      </div>
    </div>`;

    $$('[data-score]',dialog).forEach(btn=>{
      btn.onclick=async ()=>{
        const score=Number(btn.dataset.score);
        saveVote(slug,score);
        applyLocalAggregate();         // affichage immédiat
        renderDetail();
        renderCards();
        renderPodium();

        const box=$('.vote-box',dialog);
        try{
          const fresh=await sendVote(slug,score);
          if(fresh){
            x.rating=fresh.rating;
            x.votes=fresh.votes;
            renderDetail();
            renderCards();
            renderPodium();
            const note=$('.vote-box',dialog);
            if(note) note.insertAdjacentHTML('beforeend',
              '<p class="vote-feedback ok">Vote enregistré, merci&nbsp;!</p>');
          }
        }catch(err){
          console.warn('Vote non enregistré :',err);
          const note=$('.vote-box',dialog);
          if(note) note.insertAdjacentHTML('beforeend',
            '<p class="vote-feedback err">Votre note est gardée sur cet appareil, '+
            'mais elle n’a pas pu être envoyée. Réessayez plus tard.</p>');
        }
      };
    });

    $('[data-share-rating]',dialog)?.addEventListener('click',()=>{
      const score=userVote(slug);
      if(score!==null) shareRating(x,score);
    });

    $('[data-share-entry]',dialog)?.addEventListener('click',()=>{
      smartShare({
        title:`${x.name} — Aincroyable`,
        text:`Découvre ${x.name} sur Aincroyable.`,
        url:shareEntryUrl(x.slug)
      });
    });

    $('[data-report-entry]',dialog)?.addEventListener('click',()=>{
      dialog.close();
      openReportDialog(x.slug);
    });
  };

  renderDetail();

  if(!dialog.open) dialog.showModal();
}
$('#searchInput').oninput=e=>{
  query=e.target.value;
  renderCards();
};

$('#sortSelect').onchange=e=>{
  sort=e.target.value;
  renderCards();
};

$$('.chip').forEach(b=>b.onclick=()=>{
  $$('.chip').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  filter=b.dataset.filter;
  renderCards();
});

$('#randomBtn').onclick=()=>openDetail(C[Math.floor(Math.random()*C.length)].slug);
$$('[data-share-site]').forEach(b=>b.onclick=shareSite);
$$('[data-action="submit"]').forEach(b=>b.onclick=()=>$('#submitDialog').showModal());
$$('[data-action="report"]').forEach(b=>b.onclick=()=>openReportDialog());
$$('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());

/* Envoie une proposition de nouveau nom ainventif.
   Sans Supabase configuré, elle est copiée dans le presse-papiers du
   visiteur avec l'adresse de contact : mieux vaut ça que le remercier
   pour une proposition qui partirait à la poubelle. */
async function submitSuggestion(form){
  const fd=new FormData(form);
  const payload={
    p_name:String(fd.get('name')||'').trim(),
    p_city:String(fd.get('city')||'').trim(),
    p_url:String(fd.get('url')||'').trim()
  };
  const cfg=supabaseConfig();
  if(cfg){
    const r=await fetch(`${cfg.url}/rest/v1/rpc/submit_suggestion`,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:cfg.key,Authorization:`Bearer ${cfg.key}`},
      body:JSON.stringify(payload)
    });
    if(!r.ok) throw new Error(`Envoi refusé (${r.status})`);
    return 'sent';
  }
  const texte=`Nom ainventif proposé : ${payload.p_name}\nCommune : ${payload.p_city}\nLien : ${payload.p_url||'—'}`;
  try{ await navigator.clipboard.writeText(texte); return 'copied'; }
  catch{ return 'manual'; }
}

const submitForm=$('#submitForm');
if(submitForm){
  submitForm.onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    const btn=form.querySelector('button[type="submit"],.btn.primary');
    const label=btn?btn.textContent:'';
    if(btn){ btn.disabled=true; btn.textContent='Envoi…'; }
    try{
      const mode=await submitSuggestion(form);
      form.hidden=true;
      const thanks=$('#submitThanks');
      if(thanks){
        thanks.hidden=false;
        const note=thanks.querySelector('[data-submit-note]');
        if(note){
          note.textContent = mode==='sent'
            ? 'Votre proposition a bien été transmise.'
            : 'Votre proposition a été copiée dans le presse-papiers : collez-la dans un message pour nous la faire parvenir.';
        }
      }
    }catch(err){
      console.warn('Proposition non transmise :',err);
      if(btn){ btn.disabled=false; btn.textContent=label; }
      let note=form.querySelector('.submit-error');
      if(!note){
        note=document.createElement('p');
        note.className='submit-error vote-feedback err';
        form.appendChild(note);
      }
      note.textContent="La proposition n’a pas pu être envoyée. Réessayez dans un instant.";
    }
  };
}

const reportForm=$('#reportForm');
if(reportForm) reportForm.onsubmit=async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const submit=$('.report-submit',form);
  const original=submit.textContent;

  submit.disabled=true;
  submit.textContent='Transmission…';

  try{
    const mode=await submitReport(form);
    if(mode==='sent'){
      form.hidden=true;
      $('#reportThanks').hidden=false;
    }else if(mode==='mail'){
      showShareToast('Votre messagerie va s’ouvrir pour envoyer le signalement.');
    }
  }catch(err){
    console.error(err);
    showShareToast('Impossible de transmettre pour le moment — réessayez plus tard.');
  }finally{
    submit.disabled=false;
    submit.textContent=original;
  }
};

const menuBtn=$('.menu-btn');
if(menuBtn) menuBtn.onclick=()=>$('.nav')?.classList.toggle('open');
$('#demoRating').innerHTML=ratingIcons(5);

async function init(){
  renderStats();
  spreadOverlappingPins();
  const partage = await loadRatings();   // moyennes réelles si Supabase est branché
  if(!partage) applyLocalAggregate();
  renderPodium();
  renderCards();
  renderMap();

  const sharedSlug=new URLSearchParams(location.search).get('nom');
  if(sharedSlug && C.some(x=>x.slug===sharedSlug)){
    setTimeout(()=>openDetail(sharedSlug),120);
  }
}

init();
