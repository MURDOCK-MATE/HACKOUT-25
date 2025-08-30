/* Mangrove Watch – single-file app logic (no backend required for demo)
   Storage: localStorage 'mw_reports'
   Live updates across tabs: BroadcastChannel 'mangrove-events'
   Mapping: Leaflet + OpenStreetMap
   Geocoding: Nominatim API (public, no key) – swap with paid provider if needed
   DB-ready: swap DataStore implementation with Firebase/Firestore later
*/
const MW = (()=>{
  const bc = ('BroadcastChannel' in self) ? new BroadcastChannel('mangrove-events') : null;
  const toastBox = ()=> document.getElementById('toasts');

  // --- Generic helpers ---
  const uid = () => 'r_' + Math.random().toString(36).slice(2,9);
  const nowISO = () => new Date().toISOString();
  const niceDate = (iso) => new Date(iso).toLocaleString();
  const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));

  function toast(msg, type='success'){
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    toastBox().appendChild(t);
    setTimeout(()=> t.remove(), 4200);
  }

  // --- Data store (swap with real DB) ---
  const Store = {
    read(){
      try {
        return JSON.parse(localStorage.getItem('mw_reports')) || [];
      } catch(e){ return [] }
    },
    write(list){
      localStorage.setItem('mw_reports', JSON.stringify(list));
      if(bc) bc.postMessage({type:'sync'});
    },
    upsert(report){
      const list = Store.read();
      const idx = list.findIndex(r=>r.id===report.id);
      if(idx>=0) list[idx]=report; else list.push(report);
      Store.write(list);
    },
    remove(id){
      const list = Store.read().filter(r=>r.id!==id);
      Store.write(list);
    }
  };

  // --- Map helpers ---
  let map, marker, mapAuth, markersLayer;
  function ensureMap(elId, center=[21.641, 72.357], zoom=8){
    const map = L.map(elId, { zoomControl: true }).setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    return map;
  }

  function initCitizenMap(){
    map = ensureMap('map');
    marker = L.marker(map.getCenter(), {draggable:true}).addTo(map);
    marker.on('dragend', ()=>{
      const {lat, lng} = marker.getLatLng();
      setLatLng(lat, lng);
    });
  }

  function initAuthorityMap(){
    mapAuth = ensureMap('mapAuthority');
    markersLayer = L.layerGroup().addTo(mapAuth);
  }

  // Set lat/lng inputs
  function setLatLng(lat, lng){
    document.getElementById('lat').value = lat.toFixed(6);
    document.getElementById('lng').value = lng.toFixed(6);
  }

  // --- Geolocation & Geocoding ---
  async function useMyLocation(){
    if(!navigator.geolocation){ toast('Geolocation not supported', 'warn'); return; }
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude, longitude} = pos.coords;
      setLatLng(latitude, longitude);
      map && map.setView([latitude, longitude], 16);
      marker && marker.setLatLng([latitude, longitude]);
    }, err=> toast('Location error: '+err.message, 'error'), {enableHighAccuracy:true, timeout:10000});
  }

  async function useGeocoding(){
    const q = document.getElementById('locationText').value?.trim();
    if(!q){ toast('Type a location first', 'warn'); return; }
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
    try{
      const res = await fetch(url, {headers:{'Accept':'application/json'}});
      const items = await res.json();
      if(!items.length){ toast('No results. Try a nearby landmark.', 'warn'); return; }
      const best = items[0];
      const lat = parseFloat(best.lat), lng = parseFloat(best.lon);
      setLatLng(lat, lng);
      map && map.setView([lat,lng], 16);
      marker && marker.setLatLng([lat,lng]);
    }catch(e){ toast('Geocoding failed. Check your internet.', 'error'); }
  }

  // --- Photo preview ---
  function bindPhotoPreview(){
    const input = document.getElementById('photo');
    const area = document.getElementById('photoPreview');
    if(!input || !area) return;
    input.addEventListener('change', ()=>{
      area.innerHTML = '';
      [...input.files].forEach(file=>{
        const url = URL.createObjectURL(file);
        const img = document.createElement('img');
        img.src = url; img.alt = 'photo';
        area.appendChild(img);
      });
    });
  }

  // --- Leaderboard ---
  function computeLeaderboard(list){
    const scores = {};
    list.forEach(r=>{
      const key = (r.reporterName||'Anonymous').trim() || 'Anonymous';
      let pts = 10;
      if(r.hasPhoto) pts += 5;
      if(r.status==='resolved') pts += 5;
      scores[key] = (scores[key]||0) + pts;
    });
    const rows = Object.entries(scores).map(([name,score])=>({name, score}))
      .sort((a,b)=> b.score - a.score).slice(0,50);
    return rows;
  }

  function renderLeaderboard(){
    const list = Store.read();
    const rows = computeLeaderboard(list);
    const wrap = document.getElementById('leaderboardList');
    if(!wrap) return;
    const html = [`<table><thead><tr><th>#</th><th>Reporter</th><th>Score</th></tr></thead><tbody>`,
      ...rows.map((r,i)=> `<tr><td>${i+1}</td><td>${r.name}</td><td>${r.score}</td></tr>`),
      `</tbody></table>`].join('');
    wrap.innerHTML = html;
  }

  // --- Citizen: My reports ---
  function renderMyReports(name){
    const list = Store.read().filter(r=> (r.reporterName||'').toLowerCase() === (name||'').toLowerCase());
    const wrap = document.getElementById('myReportsList');
    if(!wrap) return;
    if(!list.length){ wrap.innerHTML = `<div class="muted">No reports yet. Submit one above.</div>`; return; }
    wrap.innerHTML = list.map(r=> card(r)).join('');
  }

  // Report card
  function card(r){
    const badge = r.status==='pending' ? '<span class="badge pending">Pending</span>' :
                 r.status==='acknowledged' ? '<span class="badge ack">Acknowledged</span>' :
                 r.status==='in_progress' ? '<span class="badge progress">In-Progress</span>' :
                 '<span class="badge resolved">Resolved</span>';
    const img = r.photoDataUrl ? `<img src="${r.photoDataUrl}" alt="photo"/>` : '';
    return `<div class="card">
      <div class="row between">
        <strong>${r.incidentType||'Incident'}</strong>
        ${badge}
      </div>
      <div class="small muted">${niceDate(r.createdAt)} • ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}</div>
      <p>${escapeHtml(r.description||'')}</p>
      <div class="photo-preview">${img}</div>
      <div class="report-actions">
        <a class="btn outline" target="_blank" href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=17/${r.lat}/${r.lng}">Open in OSM</a>
        <button class="btn ghost" onclick="MW.copyShare('${r.id}')">Share</button>
      </div>
    </div>`;
  }

  // Escape HTML for safety
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]); }

  async function copyShare(id){
    const url = location.origin + location.pathname + `#report-${id}`;
    try{ await navigator.clipboard.writeText(url); toast('Share link copied'); }catch(e){ toast('Copy failed','warn'); }
  }

  // --- Submit report ---
  function bindForm(){
    const form = document.getElementById('reportForm');
    if(!form) return;
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const name = (fd.get('reporterName')||'').toString().trim();
      const incidentType = fd.get('incidentType');
      const description = fd.get('description');
      const lat = parseFloat(document.getElementById('lat').value);
      const lng = parseFloat(document.getElementById('lng').value);
      if(!name || !incidentType || !description || !isFinite(lat) || !isFinite(lng)){
        toast('Please fill all required fields', 'warn'); return;
      }
      let photoDataUrl = '';
      const file = document.getElementById('photo').files?.[0];
      if(file){
        photoDataUrl = await fileToDataURL(file);
      }
      const report = {
        id: uid(), reporterName: name, incidentType, description,
        lat, lng, status:'pending', createdAt: nowISO(),
        hasPhoto: !!photoDataUrl, photoDataUrl
      };
      Store.upsert(report);
      toast('Report submitted. Authority notified.');
      if(bc) bc.postMessage({type:'new_report', report});
      form.reset();
      setTimeout(()=>{
        // keep marker and map where they are
        renderLeaderboard();
        renderMyReports(name);
      }, 50);
    });
  }

  function fileToDataURL(file){
    return new Promise(res=>{
      const r = new FileReader();
      r.onload = ()=> res(r.result);
      r.readAsDataURL(file);
    });
  }

  // --- Authority rendering & actions ---
  function renderAuthority(){
    const tableEl = document.getElementById('authorityTable');
    if(!tableEl) return;
    const statusFilter = document.getElementById('statusFilter').value;
    const q = (document.getElementById('searchText').value||'').toLowerCase();
    const list = Store.read().filter(r=>{
      const okStatus = statusFilter==='all' || r.status===statusFilter;
      const okSearch = [r.reporterName, r.incidentType].join(' ').toLowerCase().includes(q);
      return okStatus && okSearch;
    }).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));

    // table
    tableEl.innerHTML = [`<table><thead>
      <tr><th>Time</th><th>Reporter</th><th>Type</th><th>Coords</th><th>Status</th><th>Actions</th></tr>
    </thead><tbody>`,
    ...list.map(r=> `<tr onclick="MW.focusOn(${r.lat}, ${r.lng})">
      <td>${niceDate(r.createdAt)}</td>
      <td>${escapeHtml(r.reporterName)}</td>
      <td>${escapeHtml(r.incidentType)}</td>
      <td>${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}</td>
      <td>${r.status.replace('_',' ')}</td>
      <td>
        <button class="btn" onclick="event.stopPropagation(); MW.setStatus('${r.id}','acknowledged')">Acknowledge</button>
        <button class="btn" onclick="event.stopPropagation(); MW.setStatus('${r.id}','in_progress')">In-Progress</button>
        <button class="btn primary" onclick="event.stopPropagation(); MW.setStatus('${r.id}','resolved')">Resolve</button>
      </td>
    </tr>`),
    `</tbody></table>`].join('');

    // markers
    if(mapAuth && markersLayer){
      markersLayer.clearLayers();
      list.forEach(r=>{
        const m = L.marker([r.lat,r.lng]).addTo(markersLayer);
        m.bindPopup(`<strong>${escapeHtml(r.incidentType)}</strong><br>
          ${escapeHtml(r.reporterName)} • ${niceDate(r.createdAt)}<br>
          <em>${escapeHtml(r.description)}</em><br>
          <small>${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}</small>`);
      });
      if(list.length){
        const group = new L.featureGroup(markersLayer.getLayers());
        mapAuth.fitBounds(group.getBounds().pad(0.2));
      }
    }
  }

  function setStatus(id, status){
    const list = Store.read();
    const idx = list.findIndex(r=> r.id===id);
    if(idx<0) return;
    list[idx].status = status;
    Store.write(list);
    renderAuthority();
    renderLeaderboard();
    if(bc) bc.postMessage({type:'status_changed', id, status});
    toast(`Status updated to ${status}`);
  }

  function focusOn(lat,lng){
    if(mapAuth){ mapAuth.setView([lat,lng], 16); }
  }

  function exportReports(){
    const list = Store.read();
    const cols = ['id','createdAt','reporterName','incidentType','description','lat','lng','status','hasPhoto'];
    const csv = [cols.join(',')]
      .concat(list.map(r=> cols.map(k=> JSON.stringify(r[k]??'')).join(',')))
      .join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mangrove-reports.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // --- Page wiring ---
  function onReady(){
    document.getElementById('year').textContent = new Date().getFullYear();
    const role = document.body.getAttribute('data-role');

    // Fake 3D loader hide
    setTimeout(()=>{
      const ld = document.getElementById('loader');
      if(ld){ ld.style.opacity = 0; ld.style.pointerEvents='none'; ld.style.transform='scale(0.98)'; setTimeout(()=> ld.remove(), 600); }
    }, 1100);

    // Fancy hero animation
    paintHero();

    if(role==='citizen'){
      initCitizenMap();
      bindPhotoPreview();
      bindForm();

      const reporterInput = document.getElementById('reporterName');
      reporterInput.addEventListener('input', ()=> renderMyReports(reporterInput.value));
      renderMyReports(reporterInput.value);
      renderLeaderboard();

      if(bc){
        bc.onmessage = (ev)=>{
          if(ev.data?.type==='status_changed'){ renderMyReports(reporterInput.value); renderLeaderboard(); }
          if(ev.data?.type==='new_report'){ renderLeaderboard(); }
          if(ev.data?.type==='sync'){ renderMyReports(reporterInput.value); renderLeaderboard(); }
        };
      }
    }

    if(role==='authority'){
      initAuthorityMap();
      renderAuthority();
      renderLeaderboard(); // could show global stats elsewhere
      if(bc){
        bc.onmessage = (ev)=>{
          if(ev.data?.type==='new_report'){
            toast('New incident received', 'warn');
            renderAuthority();
          }
          if(ev.data?.type==='status_changed' || ev.data?.type==='sync'){
            renderAuthority();
          }
        };
      }
    }
  }

  // Minimal 3D-like animation in hero
  function paintHero(){
    const c = document.getElementById('heroCanvas');
    if(!c) return;
    const n = 24;
    for(let i=0;i<n;i++){
      const bubble = document.createElement('div');
      bubble.style.position='absolute';
      bubble.style.left = (Math.random()*100)+'%';
      bubble.style.bottom = (-20 - Math.random()*80)+'px';
      bubble.style.width = bubble.style.height = (12+Math.random()*22)+'px';
      bubble.style.borderRadius='50%';
      bubble.style.background='radial-gradient(circle, rgba(142,240,209,.4), rgba(142,240,209,0) 70%)';
      bubble.style.animation = `rise ${8+Math.random()*8}s linear ${Math.random()*3}s infinite`;
      c.appendChild(bubble);
    }
  }

  // Smooth scroll
  function scrollToSel(sel){
    const el = document.querySelector(sel);
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }

  // Public API
  return {
    onReady,
    useMyLocation,
    useGeocoding,
    openAuthority: ()=> window.location.href='authority.html',
    openCitizen: ()=> window.location.href='index.html',
    renderAuthority,
    setStatus,
    focusOn,
    exportReports,
    copyShare,
    scrollTo: scrollToSel
  };
})();

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', MW.onReady);

// CSS animations required in JS
const style = document.createElement('style');
style.textContent = `
@keyframes rise{to{transform:translateY(-320px); opacity:.1}}
`;
document.head.appendChild(style);
