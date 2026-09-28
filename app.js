// ═══════════════════════════════════════════════════════════════
// DATA & STATE – nutzt den ORIGINALEN localStorage Key
// ═══════════════════════════════════════════════════════════════
let data = JSON.parse(localStorage.getItem('studydesk_pro') || '{"lectures":[],"schedule":[],"todos":[],"notes":[],"subjectQueue":[],"weekPlanSlots":[],"weekPlanDays":{},"weekPlanAnchor":null}');
if (!data.schedule) data.schedule = [];
if (!data.notes) data.notes = [];
if (!data.todos) data.todos = [];
if (!data.lectures) data.lectures = [];
if (!data.subjectQueue) data.subjectQueue = [];
if (!data.weekPlanSlots) data.weekPlanSlots = [];
if (!data.weekPlanDays) data.weekPlanDays = {};
if (!data.weekPlanAnchor) data.weekPlanAnchor = null;
if (!data.weekPlanClasses) data.weekPlanClasses = [];

let currentWeekStart = null;
let lernplanSubjectEditId = null;
let currentNote = null, lecEditId = null, lecFilter = 'all', todoFilter = 'all', noteFilter = '', saveTimer = null;
let currentDetailId = null, currentDetailType = null, draggedQueueId = null;

const TYPE_LABELS = { rechtsgebiet: 'Thema nacharbeiten', klausur: 'Klausur schreiben', karteikarten: 'Karteikarten lernen', frei: 'Frei / Sonstiges' };
const WEEKDAY_NAMES = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const SECTION_TITLES = { dashboard:'Übersicht', lectures:'Vorlesungen', schedule:'Stundenplan', lernplan:'Lernplan', notes:'Notizen', todos:'Aufgaben' };
const SECTION_ACTIONS = { dashboard:null, lectures:'openLecModal', schedule:'openScheduleModal', lernplan:'toggleBlockCreation', notes:'newNote', todos:'addTodo' };

function saveToLocal() { localStorage.setItem('studydesk_pro', JSON.stringify(data)); updateDash(); }
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }
function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function fmtDate(d) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function getMonday(d) { const date=new Date(d); const day=date.getDay(); const diff=(day===0?-6:1-day); date.setDate(date.getDate()+diff); date.setHours(0,0,0,0); return date; }
function addDays(d, n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function initializeCurrentPage() {
  const section = document.body.dataset.section;
  document.getElementById('page-title').textContent = SECTION_TITLES[section];
  const btn = document.getElementById('topbar-action-btn');
  if (SECTION_ACTIONS[section]) {
    btn.style.display = 'inline-flex'; btn.onclick = new Function(SECTION_ACTIONS[section]+'()');
    const labels = { openLecModal:'+ Vorlesung', openScheduleModal:'+ Termin', toggleBlockCreation:'+ Block', newNote:'+ Notiz', addTodo:'+ Aufgabe' };
    btn.textContent = labels[SECTION_ACTIONS[section]];
  } else { btn.style.display = 'none'; }

  updateDate();
  if (section === 'dashboard') updateDash();
  if (section === 'lectures') renderLectures();
  if (section === 'schedule') renderSchedule();
  if (section === 'notes') renderNotesList();
  if (section === 'todos') { renderTodos(); populateTodoSubject(); }
  if (section === 'lernplan') { if(!currentWeekStart) currentWeekStart = getMonday(new Date()); renderWeekCalendar(); renderClassList(); }
}
function updateDate() { document.getElementById('date-display').textContent = new Date().toLocaleDateString('de-DE', {weekday:'long', day:'numeric', month:'long', year:'numeric'}); }
function triggerTopAction() { const fn = SECTION_ACTIONS[document.body.dataset.section]; if(fn) new Function(fn+'()')(); }

// ── Export / Import ──
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `studydesk_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url); toast('Export erfolgreich ✓');
}
function openImportModal() { openModal('import-modal'); }
function closeImportModal() { closeModal('import-modal'); document.getElementById('import-file-input').value = ''; }
function handleImportFile(input) {
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Ungültig');
      if (!confirm('Alle aktuellen Daten werden überschrieben. Fortfahren?')) return;
      data = { lectures:parsed.lectures||[], schedule:parsed.schedule||[], todos:parsed.todos||[], notes:parsed.notes||[],
        subjectQueue:parsed.subjectQueue||[], weekPlanSlots:parsed.weekPlanSlots||[], weekPlanDays:parsed.weekPlanDays||{}, weekPlanAnchor:parsed.weekPlanAnchor||null,
        weekPlanClasses:parsed.weekPlanClasses||[] };
      migrateLearningPlanData();
      saveToLocal(); initializeCurrentPage();
      closeImportModal(); toast('Import erfolgreich ✓');
    } catch(err) { toast('Fehler: Ungültige JSON-Datei'); }
  };
  reader.readAsText(file);
}
document.addEventListener('DOMContentLoaded', () => {
  const drop = document.getElementById('import-drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; });
  drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
  drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = '';
    const file = e.dataTransfer.files[0]; if(!file) return; handleImportFile({files:[file]});
  });
});

// ── Dashboard ──
function updateDash() {
  if (!document.getElementById('dash-total')) return;
  const visibleLec = data.lectures.filter(l => !l.cancelled);
  const done = visibleLec.filter(l => l.done).length;
  document.getElementById('dash-total').innerText = visibleLec.length;
  document.getElementById('dash-done-text').innerHTML = done + ' nachgeholt';
  const pct = visibleLec.length ? (done/visibleLec.length)*100 : 0;
  document.getElementById('dash-prog').style.width = pct+'%';
  const openTodos = data.todos.filter(t => !t.done).length;
  const doneTodos = data.todos.filter(t => t.done).length;
  document.getElementById('dash-tasks').innerText = openTodos;
  document.getElementById('dash-done-tasks').innerHTML = doneTodos + ' erledigt';
  document.getElementById('dash-notes').innerText = data.notes.length;
  document.getElementById('dash-research').innerText = data.notes.flatMap(n => n.tags || []).length;
  const pendingLec = visibleLec.filter(l => !l.done).sort((a,b) => (a.date||'').localeCompare(b.date||'')).slice(0,15);
  document.getElementById('dash-next-list').innerHTML = pendingLec.length
    ? pendingLec.map(l => `<div class="list-item" onclick="showLectureDetail('${l.id}')" style="padding:10px 14px;margin-bottom:6px;"><div class="item-check ${l.done?'checked':''}" style="margin-top:0;" onclick="event.stopPropagation();toggleLec('${l.id}')"></div><div class="item-body"><div class="item-title">${escapeHtml(l.title)}</div><div class="item-meta">${l.date||'kein Datum'}</div></div></div>`).join('')
    : '<div class="empty-state"><div class="empty-state-icon">✅</div>Alle Vorlesungen nachgeholt</div>';
  const allOpenTodos = data.todos.filter(t => !t.done).slice(0,6);
  document.getElementById('dash-todos-list').innerHTML = allOpenTodos.length
    ? allOpenTodos.map(t => `<div class="list-item" onclick="showTodoDetail('${t.id}')" style="padding:10px 14px;margin-bottom:6px;"><div class="item-check ${t.done?'checked':''}" style="margin-top:0;" onclick="event.stopPropagation();toggleTodo('${t.id}')"></div><div class="item-body"><div class="item-title">${escapeHtml(t.text)}</div><div class="item-meta">${t.subject||'kein Fach'}</div></div></div>`).join('')
    : '<div class="empty-state"><div class="empty-state-icon">✅</div>Keine offenen Aufgaben</div>';
  renderDashboardLearningPlan();
}
function renderDashboardLearningPlan() {
  const container = document.getElementById('dash-plan-calendar');
  if (!container) return;
  const today = new Date();
  const todayStr = fmtDate(today);
  const previousPlan = JSON.stringify({days:data.weekPlanDays,classes:data.weekPlanClasses});
  const occurrences = lpOccurrencesForDate(todayStr);
  lpRefreshAssignments();
  if (JSON.stringify({days:data.weekPlanDays,classes:data.weekPlanClasses}) !== previousPlan) {
    localStorage.setItem('studydesk_pro',JSON.stringify(data));
  }

  const blocks = data.weekPlanSlots
    .filter(block => block.day === lpDateDay(today))
    .sort((a,b) => lpTimeMinutes(a.startTime) - lpTimeMinutes(b.startTime));
  let html = `<div class="dash-day-calendar"><div class="dash-day-head">${escapeHtml(today.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'}))}</div><div class="dash-time-axis">`;
  for (let hour = 8; hour < 20; hour++) {
    html += `<span class="dash-hour-label" style="top:${(hour - 8) * 60}px">${String(hour).padStart(2,'0')}:00</span>`;
  }
  html += '</div><div class="dash-day-column today">';
  blocks.forEach(block => {
    const occurrence = occurrences.find(item => item.templateId === block.id);
    if (!occurrence) return;
    const start = lpTimeMinutes(block.startTime);
    const end = lpTimeMinutes(block.endTime);
    const task = data.weekPlanClasses.find(cls => cls.id === block.classId)?.tasks.find(item => item.id === occurrence.assignedTaskId);
    const status = occurrence.done ? 'done' : occurrence.missed ? 'missed' : '';
    const statusMarkup = occurrence.done
      ? '<span class="dash-plan-status done">✓ Erledigt</span>'
      : occurrence.missed
        ? '<span class="dash-plan-status missed">↷ Nicht geschafft</span>'
        : `<div class="dash-plan-actions"><button title="Als erledigt markieren" aria-label="${escapeHtml(block.name)} als erledigt markieren" onclick="completeOccurrence('${todayStr}','${block.id}')">✓</button><button title="Als nicht geschafft markieren" aria-label="${escapeHtml(block.name)} als nicht geschafft markieren" onclick="missOccurrence('${todayStr}','${block.id}')">↷</button></div>`;
    const taskMarkup = task && end - start >= 48 ? `<div class="dash-plan-task">${escapeHtml(task.title)}</div>` : '';
    html += `<div class="dash-plan-block ${status}" style="top:${start - 480}px;height:${end - start}px;background:${escapeHtml(block.color)}"><div class="dash-plan-header"><div class="dash-plan-title">${escapeHtml(block.name)}</div>${statusMarkup}</div><div class="dash-plan-time">${escapeHtml(block.startTime)}–${escapeHtml(block.endTime)}</div>${taskMarkup}</div>`;
  });
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  if (nowMinutes >= 480 && nowMinutes <= 1200) html += `<div class="dash-now-line" style="top:${nowMinutes - 480}px"></div>`;
  if (!blocks.length) html += '<div class="dash-plan-empty">Für heute sind keine Lernblöcke geplant.</div>';
  html += '</div></div>';
  container.innerHTML = html;
}

// ── Lectures ──
function renumberSubjectLectures(subject) {
  const relevant = data.lectures.filter(l => l.subject === subject && !l.cancelled).sort((a,b) => (a.date||'').localeCompare(b.date||''));
  relevant.forEach((lec, idx) => { const newNum = idx+1; const datePart = lec.date ? ` (${lec.date})` : ''; lec.title = `${lec.subject} - ${newNum}${datePart}`; });
  data.lectures.filter(l => l.subject === subject && l.cancelled).forEach(lec => { const datePart = lec.date ? ` (${lec.date})` : ''; lec.title = `${lec.subject} - ausgefallen${datePart}`; });
}
function updateSubjectDatalist() {
  const subjects = [...new Set(data.lectures.map(l => l.subject).filter(Boolean))];
  const datalist = document.getElementById('subject-datalist');
  if (datalist) datalist.innerHTML = subjects.map(s => `<option value="${escapeHtml(s)}">`).join('');
}
function renderLectures() {
  const container = document.getElementById('lecture-list');
  if (!container) return;
  let list = data.lectures.filter(l => !l.cancelled);
  const search = document.getElementById('lec-search')?.value.toLowerCase() || '';
  const subjectF = document.getElementById('lec-filter-subject')?.value || '';
  if (search) list = list.filter(l => l.title.toLowerCase().includes(search) || (l.subject||'').toLowerCase().includes(search));
  if (subjectF) list = list.filter(l => l.subject === subjectF);
  if (lecFilter === 'todo') list = list.filter(l => !l.done);
  if (lecFilter === 'done') list = list.filter(l => l.done);
  if (lecFilter === 'prio') list = list.filter(l => l.prio);
  if (lecFilter === 'cancelled') { list = data.lectures.filter(l => l.cancelled); }
  if (!list.length) { container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div>Keine Vorlesungen</div>'; return; }
  container.innerHTML = list.map(l => `<div class="list-item ${l.done?'done':''} ${l.cancelled?'cancelled':''}">
    <div class="item-check ${l.done?'checked':''}" onclick="event.stopPropagation();toggleLec('${l.id}')"></div>
    <div class="item-body" onclick="showLectureDetail('${l.id}')">
      <div class="item-title">${escapeHtml(l.title)}</div>
      <div class="item-meta">${escapeHtml(l.subject||'')} ${l.date?'· '+l.date:''}</div>
      <div class="item-tags">${!l.done&&!l.cancelled?'<span class="tag accent">nachholen</span>':''}${l.prio?'<span class="tag danger">Priorität</span>':''}${l.cancelled?'<span class="tag danger">ausgefallen</span>':''}${l.done&&!l.cancelled?'<span class="tag success">erledigt</span>':''}</div>
    </div>
    <div class="item-actions">
      <button class="btn small" onclick="event.stopPropagation();openLecModal('${l.id}')">✎</button>
      <button class="btn small danger" onclick="event.stopPropagation();deleteLec('${l.id}')">✕</button>
    </div>
  </div>`).join('');
  const subjects = [...new Set(data.lectures.map(l => l.subject).filter(Boolean))];
  const sel = document.getElementById('lec-filter-subject'); if(sel) sel.innerHTML = '<option value="">Alle Themen</option>' + subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  updateSubjectDatalist();
}
function openLecModal(id) {
  lecEditId = id || null; openModal('lec-modal');
  if (id) {
    const l = data.lectures.find(x => x.id === id);
    document.getElementById('lec-modal-title').innerText = 'Vorlesung bearbeiten';
    document.getElementById('lec-m-subject').value = l.subject || '';
    document.getElementById('lec-m-date').value = l.date || '';
    document.getElementById('lec-m-link').value = l.link || '';
    document.getElementById('lec-m-note').value = l.note || '';
    document.getElementById('lec-m-prio').checked = !!l.prio;
    document.getElementById('lec-m-cancelled').checked = !!l.cancelled;
  } else {
    document.getElementById('lec-modal-title').innerText = 'Neue Vorlesung';
    document.getElementById('lec-m-subject').value = '';
    document.getElementById('lec-m-date').value = '';
    document.getElementById('lec-m-link').value = '';
    document.getElementById('lec-m-note').value = '';
    document.getElementById('lec-m-prio').checked = false;
    document.getElementById('lec-m-cancelled').checked = false;
  }
  updateSubjectDatalist();
}
function closeLecModal() { closeModal('lec-modal'); lecEditId = null; }
function saveLec() {
  const subject = document.getElementById('lec-m-subject').value.trim();
  if (!subject) { toast('Bitte ein Thema eingeben.'); return; }
  const dateRaw = document.getElementById('lec-m-date').value;
  const cancelled = document.getElementById('lec-m-cancelled').checked;
  if (lecEditId) {
    const l = data.lectures.find(x => x.id === lecEditId);
    if (l) { const oldSubject = l.subject; l.subject = subject; l.date = dateRaw; l.link = document.getElementById('lec-m-link').value.trim(); l.note = document.getElementById('lec-m-note').value.trim(); l.prio = document.getElementById('lec-m-prio').checked; l.cancelled = cancelled; renumberSubjectLectures(subject); if (oldSubject !== subject && oldSubject) renumberSubjectLectures(oldSubject); toast('Gespeichert'); }
  } else {
    if (cancelled) { const datePart = dateRaw ? ` (${dateRaw})` : ''; data.lectures.push({id:Date.now().toString(), title:`${subject} - ausgefallen${datePart}`, subject, date:dateRaw, link:document.getElementById('lec-m-link').value.trim(), note:document.getElementById('lec-m-note').value.trim(), prio:document.getElementById('lec-m-prio').checked, done:false, cancelled:true}); }
    else { data.lectures.push({id:Date.now().toString(), title:'', subject, date:dateRaw, link:document.getElementById('lec-m-link').value.trim(), note:document.getElementById('lec-m-note').value.trim(), prio:document.getElementById('lec-m-prio').checked, done:false, cancelled:false}); renumberSubjectLectures(subject); }
    toast('Vorlesung hinzugefügt');
  }
  saveToLocal(); closeLecModal(); renderLectures();
}
function toggleLec(id) {
  const l = data.lectures.find(x => x.id === id);
  if (l && !l.cancelled) { l.done = !l.done; saveToLocal(); renderLectures(); updateDash(); toast(l.done ? 'Nachgeholt ✓' : 'Wieder offen'); }
  else if (l?.cancelled) { toast('Ausgefallene Vorlesungen können nicht nachgeholt werden'); }
}
function deleteLec(id) {
  if (confirm('Vorlesung löschen?')) {
    const lec = data.lectures.find(x => x.id === id); const subject = lec?.subject;
    data.lectures = data.lectures.filter(x => x.id !== id);
    if (subject) renumberSubjectLectures(subject);
    saveToLocal(); renderLectures(); toast('Gelöscht');
  }
}
function setLecFilter(btn, val) { lecFilter = val; document.querySelectorAll('.chip[data-lf]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderLectures(); }

// ── Detail Modal ──
function showLectureDetail(id) {
  const lec = data.lectures.find(l => l.id === id); if(!lec) return;
  currentDetailId = id; currentDetailType = 'lecture';
  document.getElementById('detail-title').innerText = '📘 Vorlesungsdetails';
  document.getElementById('detail-content').innerHTML = `
    <div class="detail-row"><div class="detail-label">Titel</div><div style="font-size:16px;color:var(--accent);font-weight:600;">${escapeHtml(lec.title)}</div></div>
    <div class="detail-row"><div class="detail-label">Thema / Vorlesung</div><div class="detail-value">${escapeHtml(lec.subject)||'—'}</div></div>
    <div class="detail-row"><div class="detail-label">Datum</div><div class="detail-value">${lec.date||'Kein Datum'}</div></div>
    <div class="detail-row"><div class="detail-label">Priorität</div><div class="detail-value">${lec.prio?'⭐ Hoch':'Normal'}</div></div>
    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value">${lec.cancelled?'🚫 Ausgefallen':(lec.done?'✅ Erledigt':'⏳ Offen')}</div></div>
    <div class="detail-row"><div class="detail-label">Erledigt?</div><label class="checkbox-label"><input type="checkbox" id="detail-done-checkbox" ${lec.done&&!lec.cancelled?'checked':''} ${lec.cancelled?'disabled':''} onchange="toggleDoneFromDetail('${lec.id}')"> ${lec.cancelled?'(Ausgefallen)':'Als nachgeholt markieren'}</label></div>
    ${lec.link?`<div class="detail-row"><div class="detail-label">Link</div><div><a href="${lec.link}" target="_blank" style="color:var(--accent);font-weight:500;">Öffnen ↗</a></div></div>`:''}
    ${lec.note?`<div class="detail-row"><div class="detail-label">Notiz</div><div class="detail-box">${escapeHtml(lec.note)}</div></div>`:''}`;
  document.getElementById('detail-modal-actions').innerHTML = `<button class="btn" onclick="closeDetailModal()">Schließen</button><button class="btn primary" onclick="editFromDetail()">✎ Bearbeiten</button>`;
  openModal('detail-modal');
}
function toggleDoneFromDetail(id) {
  const lec = data.lectures.find(l => l.id === id);
  if (lec && !lec.cancelled) { lec.done = !lec.done; saveToLocal(); renderLectures(); showLectureDetail(id); toast(lec.done ? 'Als nachgeholt markiert ✓' : 'Als offen markiert'); }
}
function showTodoDetail(id) {
  const todo = data.todos.find(t => t.id === id); if(!todo) return;
  currentDetailId = id; currentDetailType = 'todo';
  document.getElementById('detail-title').innerText = '✅ Aufgabendetails';
  document.getElementById('detail-content').innerHTML = `
    <div class="detail-row"><div class="detail-label">Aufgabe</div><div style="font-size:16px;color:var(--accent);font-weight:600;">${escapeHtml(todo.text)}</div></div>
    <div class="detail-row"><div class="detail-label">Fach</div><div class="detail-value">${escapeHtml(todo.subject)||'—'}</div></div>
    <div class="detail-row"><div class="detail-label">Priorität</div><div class="detail-value">${todo.prio==='high'?'⭐ Hoch':'Normal'}</div></div>
    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value">${todo.done?'✅ Erledigt':'⏳ Offen'}</div></div>
    <div class="detail-row"><div class="detail-label">Erledigt?</div><label class="checkbox-label"><input type="checkbox" ${todo.done?'checked':''} onchange="toggleTodoDoneFromDetail('${todo.id}')"> Als erledigt markieren</label></div>
    <div class="detail-row"><div class="detail-label">Erstellt am</div><div class="detail-value">${todo.date||''}</div></div>`;
  document.getElementById('detail-modal-actions').innerHTML = `<button class="btn" onclick="closeDetailModal()">Schließen</button>`;
  openModal('detail-modal');
}
function toggleTodoDoneFromDetail(id) {
  const todo = data.todos.find(t => t.id === id);
  if (todo) { todo.done = !todo.done; saveToLocal(); renderTodos(); showTodoDetail(id); toast(todo.done ? 'Aufgabe erledigt ✓' : 'Aufgabe wieder offen'); }
}
function closeDetailModal() { closeModal('detail-modal'); currentDetailId = null; currentDetailType = null; }
function editFromDetail() { const id = currentDetailId; closeDetailModal(); if(id) openLecModal(id); }

// ── Schedule ──
function renderSchedule() {
  const days = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  const container = document.getElementById('schedule-container');
  container.innerHTML = days.map(day => {
    const items = data.schedule.filter(e => e.day === day);
    return `<div class="schedule-day" ondragover="event.preventDefault()" ondrop="handleScheduleDrop(event,'${day}')"><h4>${day}</h4>${items.length?items.map(item=>`<div class="schedule-slot" draggable="true" ondragstart="startScheduleDrag(event,'${item.id}')"><div class="slot-time">${escapeHtml(item.time||'')}</div><div class="slot-subject">${escapeHtml(item.subject)}</div><div class="slot-meta"><span class="text-muted" style="font-size:11px;font-family:'JetBrains Mono',monospace;">${item.startDate||'?'} – ${item.endDate||'?'}</span><button class="btn small danger" onclick="event.stopPropagation();deleteScheduleEntry('${item.id}')">✕</button></div></div>`).join(''):'<div class="schedule-empty">— Kein Termin —</div>'}</div>`;
  }).join('');
}
function startScheduleDrag(event, id) { event.dataTransfer.setData('text/plain', id); }
function handleScheduleDrop(event, day) {
  event.preventDefault();
  const id = event.dataTransfer.getData('text/plain');
  const entry = data.schedule.find(e => e.id === id);
  if (!entry) return;
  entry.day = day; saveToLocal(); renderSchedule(); toast(`Termin nach ${day} verschoben`);
}
function openScheduleModal() { openModal('schedule-modal'); document.getElementById('sched-start').value = ''; document.getElementById('sched-end').value = ''; }
function closeScheduleModal() { closeModal('schedule-modal'); }
function saveScheduleEntry() {
  const subject = document.getElementById('sched-subject').value.trim();
  if (!subject) { toast('Thema oder Vorlesung erforderlich'); return; }
  const startDate = document.getElementById('sched-start').value;
  const endDate = document.getElementById('sched-end').value;
  if (!startDate || !endDate) { toast('Bitte Start- und Enddatum angeben'); return; }
  data.schedule.push({id:Date.now().toString(), day:document.getElementById('sched-day').value, subject, time:document.getElementById('sched-time').value.trim(), startDate, endDate});
  saveToLocal(); renderSchedule(); closeScheduleModal(); toast('Termin hinzugefügt');
}
function deleteScheduleEntry(id) { if(confirm('Termin löschen?')) { data.schedule = data.schedule.filter(e => e.id !== id); saveToLocal(); renderSchedule(); toast('Entfernt'); } }

function generatePastLecturesFromSchedule(quiet = false) {
  const today = new Date(); today.setHours(0,0,0,0);
  const weekdays = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  let created = 0;
  for (const entry of data.schedule) {
    if (!entry.startDate || !entry.endDate) continue;
    const [sy,sm,sd] = entry.startDate.split('-').map(Number);
    const [ey,em,ed] = entry.endDate.split('-').map(Number);
    const start = new Date(sy, sm-1, sd);
    const end = new Date(ey, em-1, ed);
    let current = new Date(start);
    while (current <= end && current <= today) {
      const dayName = weekdays[current.getDay()];
      if (dayName === entry.day) {
        const y = current.getFullYear(), m = String(current.getMonth()+1).padStart(2,'0'), d = String(current.getDate()).padStart(2,'0');
        const dateStr = `${y}-${m}-${d}`;
        const alreadyExists = data.lectures.some(l => l.subject === entry.subject && l.date === dateStr);
        if (!alreadyExists) {
          data.lectures.push({id:Date.now().toString()+Math.random(), title:'', subject:entry.subject, date:dateStr, link:'', note:`Generiert aus Stundenplan (${entry.day}, ${entry.startDate} bis ${entry.endDate})`, prio:false, done:false, cancelled:false});
          created++; renumberSubjectLectures(entry.subject);
        }
      }
      current.setDate(current.getDate()+1);
    }
  }
  saveToLocal();
  if (document.getElementById('lecture-list')) renderLectures();
  if (!quiet) toast(`${created} neue Vorlesungen generiert.`);
}

// ═══════════════════════════════════════════════════════════════
// LERNPLAN – KORREKTUR
// ═══════════════════════════════════════════════════════════════
// NEUE LOGIK:
// 1. 4 Wochen im Voraus generieren
// 2. Einheiten strikt einhalten – nie mehr zuweisen als verfügbar
// 3. NUR erledigte Slots zählen als verbraucht
// 4. Nicht-erledigte Slots verschieben den Plan automatisch
// 5. Queue-remaining wird NICHT vorab dekrementiert, sondern nur
//    durch done-Markierung
// ═══════════════════════════════════════════════════════════════

let lernplanTab = 'queue';

function setLernplanTab(btn, val) {
  lernplanTab = val;
  if (val !== 'week' && lpCreateMode) {
    lpCreateMode = false;
    document.getElementById('lp-add-block-btn').textContent = '＋ Block hinzufügen';
    document.getElementById('lp-add-block-btn').classList.remove('success');
    document.getElementById('lp-create-hint').style.display = 'none';
  }
  document.querySelectorAll('.chip[data-lp]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('lp-queue-view').style.display = val === 'queue' ? 'block' : 'none';
  document.getElementById('lp-week-view').style.display = val === 'week' ? 'block' : 'none';
  if (val === 'queue') renderSubjectQueue();
  if (val === 'week') { if(!currentWeekStart) currentWeekStart = getMonday(new Date()); renderWeekCalendar(); }
}

// ── Hilfsfunktion: Wie viele erledigte Slots hat ein Fach? ──
function countDoneSlotsForSubject(subject) {
  let count = 0;
  Object.values(data.weekPlanDays).forEach(slots => {
    slots.forEach(s => { if (s.type === 'rechtsgebiet' && s.subject === subject && s.done) count++; });
  });
  return count;
}

// ── Hilfsfunktion: Queue-remaining neu berechnen aus erledigten Slots ──
function recalcQueueRemaining() {
  data.subjectQueue.forEach(entry => {
    const doneCount = countDoneSlotsForSubject(entry.subject);
    entry.remaining = Math.max(0, entry.units - doneCount);
  });
}

// ── Queue ──
function openSubjectQueueModal() {
  lernplanSubjectEditId = null;
  document.getElementById('sq-modal-title').innerText = 'Thema zur Warteschlange';
  document.getElementById('sq-subject').value = '';
  document.getElementById('sq-units').value = 1;
  openModal('subject-queue-modal');
  updateSubjectDatalist();
}
function closeSubjectQueueModal() { closeModal('subject-queue-modal'); }
function editSubjectQueueEntry(id) {
  const e = data.subjectQueue.find(x => x.id === id); if(!e) return;
  lernplanSubjectEditId = id;
  document.getElementById('sq-modal-title').innerText = 'Thema bearbeiten';
  document.getElementById('sq-subject').value = e.subject;
  document.getElementById('sq-units').value = e.units;
  openModal('subject-queue-modal');
}
function saveSubjectQueueEntry() {
  const subject = document.getElementById('sq-subject').value.trim();
  const units = parseInt(document.getElementById('sq-units').value, 10);
  if (!subject) { toast('Bitte ein Thema eingeben.'); return; }
  if (!units || units < 1) { toast('Bitte gültige Anzahl eingeben.'); return; }
  if (lernplanSubjectEditId) {
    const e = data.subjectQueue.find(x => x.id === lernplanSubjectEditId);
    e.subject = subject; e.units = units;
    // remaining neu berechnen basierend auf bereits erledigten Slots
    const doneCount = countDoneSlotsForSubject(subject);
    e.remaining = Math.max(0, units - doneCount);
  } else {
    data.subjectQueue.push({id:Date.now().toString(), subject, units, remaining:units});
  }
  saveToLocal(); closeSubjectQueueModal(); renderSubjectQueue();
  if (lernplanTab === 'week') renderWeekCalendar();
  toast('Gespeichert');
}
function deleteSubjectQueueEntry(id) {
  if (!confirm('Thema entfernen?')) return;
  data.subjectQueue = data.subjectQueue.filter(x => x.id !== id);
  saveToLocal(); renderSubjectQueue(); toast('Entfernt');
}
function moveQueueEntry(id, dir) {
  const idx = data.subjectQueue.findIndex(x => x.id === id);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= data.subjectQueue.length) return;
  const arr = data.subjectQueue;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  saveToLocal(); renderSubjectQueue();
}
function dragQueueEntry(id) { draggedQueueId = id; }
function dropQueueEntry(targetId) {
  if (!draggedQueueId || draggedQueueId === targetId) return;
  const fromIdx = data.subjectQueue.findIndex(x => x.id === draggedQueueId);
  const toIdx = data.subjectQueue.findIndex(x => x.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = data.subjectQueue.splice(fromIdx, 1);
  data.subjectQueue.splice(toIdx, 0, moved);
  saveToLocal(); renderSubjectQueue(); draggedQueueId = null; toast('Reihenfolge angepasst');
}
function renderSubjectQueue() {
  recalcQueueRemaining(); // immer aktuell halten
  const container = document.getElementById('subject-queue-list');
  if (!data.subjectQueue.length) { container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div>Keine Themen in der Warteschlange</div>'; return; }
  container.innerHTML = data.subjectQueue.map((e, i) => {
    const isActive = e.remaining > 0 && data.subjectQueue.slice(0, i).every(prev => prev.remaining <= 0);
    const pct = e.units ? ((e.units - e.remaining) / e.units) * 100 : 0;
    return `<div class="queue-item ${isActive?'active-item':''}" draggable="true" ondragstart="dragQueueEntry('${e.id}')" ondragover="event.preventDefault()" ondrop="dropQueueEntry('${e.id}')">
      <div class="queue-pos">${i+1}</div>
      <div class="queue-info">
        <div class="queue-subject">${escapeHtml(e.subject)} ${isActive?'⏳':(e.remaining<=0?'✅':'')}</div>
        <div class="queue-units">${e.units - e.remaining} / ${e.units} Einheiten erledigt · ${e.remaining} offen</div>
        <div class="queue-progress-outer"><div class="queue-progress-inner" style="width:${pct}%"></div></div>
      </div>
      <div class="item-actions" style="opacity:1;">
        <button class="btn small" onclick="event.stopPropagation();moveQueueEntry('${e.id}',-1)">↑</button>
        <button class="btn small" onclick="event.stopPropagation();moveQueueEntry('${e.id}',1)">↓</button>
        <button class="btn small" onclick="event.stopPropagation();editSubjectQueueEntry('${e.id}')">✎</button>
        <button class="btn small danger" onclick="event.stopPropagation();deleteSubjectQueueEntry('${e.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// ZUWEISUNGS-LOGIK (KERN)
// ═══════════════════════════════════════════════════════════════
// Wir gehen chronologisch durch ALLE Tage (heute + 4 Wochen).
// Für jeden "rechtsgebiet"-Slot:
//   - Hat er schon ein subject? → behalten (wenn nicht erledigt)
//   - Hat er keins? → nimm das nächste Fach aus der Queue mit remaining>0
//   - Aber: niemals mehr zuweisen als die Einheiten erlauben!
// Die remaining-Werte werden aus den DONE-Slots berechnet, nicht
// durch Vorab-Dekrementierung.
// ═══════════════════════════════════════════════════════════════

function getAllRechtsgebietSlots() {
  // Alle existierenden rechtsgebiet-Slots chronologisch
  const all = [];
  Object.keys(data.weekPlanDays).sort().forEach(dateStr => {
    data.weekPlanDays[dateStr].forEach((slot, idx) => {
      if (slot.type === 'rechtsgebiet') {
        all.push({ dateStr, slot, index: idx });
      }
    });
  });
  return all;
}

function assignSubjectsToAllSlots() {
  recalcQueueRemaining();
  const slots = getAllRechtsgebietSlots();
  // Slots, die bereits ein subject haben UND done sind → behalten
  // Slots, die ein subject haben UND NICHT done → behalten (wird später neu bewertet)
  // Slots ohne subject → neu zuweisen

  // Zuerst: zähle wie viele Slots pro Fach bereits zugewiesen sind (egal ob done oder nicht)
  const assignedCounts = {};
  slots.forEach(({slot}) => {
    if (slot.subject) {
      assignedCounts[slot.subject] = (assignedCounts[slot.subject] || 0) + 1;
    }
  });

  // Slots ohne subject oder mit subject, das über dem Limit liegt
  const openSlots = slots.filter(({slot}) => {
    if (!slot.subject) return true;
    const entry = data.subjectQueue.find(e => e.subject === slot.subject);
    if (!entry) return true; // Fach nicht mehr in Queue
    // Wenn das Fach schon mehr Slots zugewiesen hat als Einheiten, und der Slot ist nicht done
    // → kann neu zugewiesen werden
    const doneCount = countDoneSlotsForSubject(slot.subject);
    const assignedCount = assignedCounts[slot.subject] || 0;
    // Wenn assigned > units und nicht done → freigeben
    if (assignedCount > entry.units && !slot.done) return true;
    return false;
  });

  // Nun weise die offenen Slots neu zu
  // Wir verwenden einen lokalen Zustand der Queue
  let queueState = data.subjectQueue.map(e => ({...e}));
  let lastAssignedId = null;

  openSlots.forEach(({dateStr, slot, index}) => {
    // Finde das nächste Fach mit freien Einheiten
    // "Freie Einheiten" = units - (bereits erledigte + bereits zugewiesene in diesem Durchlauf)
    const candidates = queueState.filter(e => {
      const done = countDoneSlotsForSubject(e.subject);
      const alreadyAssignedInThisRun = queueState.filter(q => q.subject === e.subject).reduce((sum, q) => sum + (q._assigned||0), 0);
      // Wie viele sind insgesamt zugewiesen (inkl. bestehende nicht-done)?
      const totalAssigned = (assignedCounts[e.subject] || 0) + alreadyAssignedInThisRun;
      // Aber: wenn der aktuelle Slot dieses Fachs schon hat, zählt er nicht doppelt
      const currentSlotHasThis = slot.subject === e.subject ? 1 : 0;
      const effectiveAssigned = totalAssigned - currentSlotHasThis;
      return (done + effectiveAssigned) < e.units;
    });

    if (!candidates.length) {
      slot.subject = null;
      return;
    }

    // Abwechselnd die ersten beiden
    let next;
    if (candidates.length === 1) {
      next = candidates[0];
    } else {
      const first = candidates[0];
      const second = candidates[1];
      if (!lastAssignedId || !candidates.some(x => x.id === lastAssignedId)) {
        next = first;
      } else {
        next = lastAssignedId === first.id ? second : first;
      }
    }

    slot.subject = next.subject;
    lastAssignedId = next.id;
    if (!next._assigned) next._assigned = 0;
    next._assigned++;
  });
}

// ── Wochenplan-Vorlage ──
function setupWeekPlanTemplate() { renderWeekPlanTemplateList(); openModal('weekplan-template-modal'); }
function closeWeekPlanTemplateModal() { closeModal('weekplan-template-modal'); }
function addWeekPlanTemplateSlot() {
  const day = document.getElementById('wpt-day').value;
  const time = document.getElementById('wpt-time').value.trim();
  const type = document.getElementById('wpt-type').value;
  const label = document.getElementById('wpt-label').value.trim();
  if (!time) { toast('Bitte eine Uhrzeit angeben.'); return; }
  data.weekPlanSlots.push({id:Date.now().toString(), day, time, type, label:label || TYPE_LABELS[type]});
  data.weekPlanSlots.sort((a,b) => { const dayA=WEEKDAY_NAMES.indexOf(a.day); const dayB=WEEKDAY_NAMES.indexOf(b.day); return dayA-dayB || a.time.localeCompare(b.time); });
  saveToLocal(); renderWeekPlanTemplateList();
  if (lernplanTab === 'week') renderWeekCalendar();
  document.getElementById('wpt-time').value = ''; document.getElementById('wpt-label').value = '';
  toast('Slot zur Vorlage hinzugefügt');
}
function deleteWeekPlanTemplateSlot(id) {
  data.weekPlanSlots = data.weekPlanSlots.filter(s => s.id !== id);
  saveToLocal(); renderWeekPlanTemplateList();
  if (lernplanTab === 'week') renderWeekCalendar();
}

// Generiere Tage aus der Vorlage – für 4 Wochen im Voraus
function ensureDayGenerated(dateStr) {
  const dateObj = new Date(dateStr + 'T00:00:00');
  if (isNaN(dateObj)) return false;
  const dayName = WEEKDAY_NAMES[dateObj.getDay()];
  const templateSlots = data.weekPlanSlots.filter(s => s.day === dayName).sort((a,b) => a.time.localeCompare(b.time));
  if (!templateSlots.length) return false;

  if (!data.weekPlanDays[dateStr] || !data.weekPlanDays[dateStr].length) {
    data.weekPlanDays[dateStr] = templateSlots.map(s => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      time: s.time, type: s.type, label: s.label,
      subject: null, done: false, shifted: false
    }));
    return true;
  }
  // Sync: füge fehlende Template-Slots hinzu
  let added = false;
  const existing = data.weekPlanDays[dateStr];
  templateSlots.forEach(t => {
    const exists = existing.some(s => s.time === t.time && s.type === t.type);
    if (!exists) {
      existing.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        time: t.time, type: t.type, label: t.label,
        subject: null, done: false, shifted: false
      });
      added = true;
    }
  });
  if (added) existing.sort((a,b) => a.time.localeCompare(b.time));
  return added;
}

// Generiere 4 Wochen im Voraus
function generateFourWeeksAhead() {
  const today = new Date(); today.setHours(0,0,0,0);
  let changed = false;
  for (let i = 0; i < 28; i++) {
    const d = addDays(today, i);
    const dateStr = fmtDate(d);
    if (ensureDayGenerated(dateStr)) changed = true;
  }
  return changed;
}

function renderWeekPlanTemplateList() {
  const container = document.getElementById('wpt-list');
  const days = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  if (!data.weekPlanSlots.length) { container.innerHTML = '<div class="empty-state">Noch keine Vorlagen-Slots</div>'; return; }
  container.innerHTML = days.map(day => {
    const items = data.weekPlanSlots.filter(s => s.day === day);
    if (!items.length) return '';
    return `<div style="margin-bottom:10px;"><div style="font-size:12px;color:var(--accent);font-weight:600;margin-bottom:4px;">${day}</div>` +
      items.map(s => `<div class="schedule-slot" style="cursor:default;display:flex;justify-content:space-between;align-items:center;">
        <span><strong>${escapeHtml(s.label)}</strong><br><span class="slot-time">${escapeHtml(s.time)}</span></span>
        <button class="btn small danger" onclick="deleteWeekPlanTemplateSlot('${s.id}')">✕</button>
      </div>`).join('') + `</div>`;
  }).join('');
}
function regenerateFromTemplate() {
  if (!confirm('Der Kalender wird für 4 Wochen im Voraus neu aus der Vorlage generiert. Bereits bearbeitete Tage bleiben erhalten. Fortfahren?')) return;
  closeWeekPlanTemplateModal();
  generateFourWeeksAhead();
  assignSubjectsToAllSlots();
  saveToLocal();
  if (!currentWeekStart) currentWeekStart = getMonday(new Date());
  renderWeekCalendar(); renderSubjectQueue();
  toast('Kalender aktualisiert');
}

// ── Wochenkalender ──
function shiftWeekView(delta) {
  currentWeekStart = addDays(currentWeekStart, delta * 7);
  renderWeekCalendar();
}
function jumpToTodayWeek() { currentWeekStart = getMonday(new Date()); renderWeekCalendar(); }

function renderWeekCalendar() {
  if (!currentWeekStart) currentWeekStart = getMonday(new Date());

  // Immer 4 Wochen im Voraus generieren
  generateFourWeeksAhead();
  assignSubjectsToAllSlots();
  saveToLocal();

  const container = document.getElementById('week-calendar');
  const todayStr = fmtDate(new Date());
  const weekEnd = addDays(currentWeekStart, 6);
  document.getElementById('week-range-label').textContent = `${fmtDate(currentWeekStart)} – ${fmtDate(weekEnd)}`;

  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(currentWeekStart, i);
    const dateStr = fmtDate(d);
    const slots = data.weekPlanDays[dateStr] || [];
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const isToday = dateStr === todayStr;
    html += `<div class="schedule-day week-day-col"><h4 ${isToday?'style="color:var(--accent);"':''}>${dayName}<span class="day-date">${dateStr}</span></h4>`;
    if (!slots.length) {
      html += `<div style="color:var(--ink-tertiary);padding:8px;font-size:12px;">— keine Slots —</div>`;
    } else {
      html += slots.map(s => {
        const label = s.type === 'rechtsgebiet' 
          ? (s.subject ? `Nacharbeiten: ${escapeHtml(s.subject)}` : 'Thema nacharbeiten (Warteschlange leer)')
          : escapeHtml(s.label);
        const typeClass = s.type === 'klausur' ? 'type-klausur' : s.type === 'karteikarten' ? 'type-karteikarten' : s.type === 'frei' ? 'type-frei' : '';
        return `<div class="week-slot ${typeClass} ${s.done?'slot-done':''}" onclick="openSlotDetail('${dateStr}','${s.id}')">
          ${s.shifted?'<span class="slot-shifted-badge" title="verschoben">↷</span>':''}
          <div class="slot-time">${escapeHtml(s.time)}</div>
          <div class="slot-label" style="font-weight:600;">${label}</div>
        </div>`;
      }).join('');
    }
    html += `</div>`;
  }
  container.innerHTML = html;
}

// ── Slot Detail ──
let currentSlotDate = null, currentSlotId = null;
function openSlotDetail(dateStr, slotId) {
  currentSlotDate = dateStr; currentSlotId = slotId;
  const slot = data.weekPlanDays[dateStr]?.find(s => s.id === slotId);
  if (!slot) return;
  document.getElementById('slot-detail-info').textContent = `${dateStr} · ${WEEKDAY_NAMES[new Date(dateStr+'T00:00:00').getDay()]}`;
  document.getElementById('slot-m-time').value = slot.time;
  document.getElementById('slot-m-type').value = slot.type;
  document.getElementById('slot-m-label').value = slot.type === 'rechtsgebiet' ? (slot.subject || '') : slot.label;
  document.getElementById('slot-m-done').checked = !!slot.done;
  toggleSlotLabelField();
  openModal('slot-detail-modal');
}
function toggleSlotLabelField() {
  const type = document.getElementById('slot-m-type').value;
  document.getElementById('slot-m-label-wrap').textContent = type === 'rechtsgebiet' ? 'Zugewiesenes Thema' : 'Bezeichnung';
}
function closeSlotDetailModal() { closeModal('slot-detail-modal'); currentSlotDate = null; currentSlotId = null; }

function saveSlotDetail() {
  const slot = data.weekPlanDays[currentSlotDate]?.find(s => s.id === currentSlotId);
  if (!slot) return;
  slot.time = document.getElementById('slot-m-time').value.trim();
  slot.type = document.getElementById('slot-m-type').value;
  const nowDone = document.getElementById('slot-m-done').checked;

  if (slot.type === 'rechtsgebiet') {
    slot.subject = document.getElementById('slot-m-label').value.trim() || slot.subject;
  } else {
    slot.label = document.getElementById('slot-m-label').value.trim() || TYPE_LABELS[slot.type];
  }

  slot.done = nowDone;
  data.weekPlanDays[currentSlotDate].sort((a,b) => a.time.localeCompare(b.time));

  // Queue-remaining neu berechnen
  recalcQueueRemaining();

  // Wenn ein Slot als nicht-erledigt markiert wird, könnte das die Zuweisung
  // anderer Slots beeinflussen → neu zuweisen
  assignSubjectsToAllSlots();

  saveToLocal(); closeSlotDetailModal(); renderWeekCalendar(); renderSubjectQueue();
  toast('Gespeichert');
}

// ── Verschieben (Kartenstapel) ──
// Wenn ein Slot "nicht geschafft" wird, verschieben sich ALLE nachfolgenden
// Slots um EINE Position nach hinten. Der aktuelle Slot wird FREI.
// Die Queue-remaining bleibt unverändert, da keine Einheit verbraucht wurde.
function markSlotNotDoneAndShift() {
  if (!currentSlotDate || !currentSlotId) return;
  if (!confirm('Dieser Slot und alle nachfolgenden Termine rutschen jeweils einen Slot nach hinten. Fortfahren?')) return;

  // Sammle alle Slots chronologisch
  const allDates = Object.keys(data.weekPlanDays).sort();
  const flat = [];
  allDates.forEach(ds => {
    data.weekPlanDays[ds].forEach(s => {
      if (s.type === 'rechtsgebiet') flat.push({ dateStr: ds, slot: s });
    });
  });

  // Finde Position des aktuellen Slots
  const pos = flat.findIndex(f => f.dateStr === currentSlotDate && f.slot.id === currentSlotId);
  if (pos === -1) return;

  // Sicherstellen, dass genug Folgetage existieren
  const lastDate = new Date(allDates[allDates.length-1] + 'T00:00:00');
  for (let i = 1; i <= 7; i++) {
    const d = addDays(lastDate, i);
    ensureDayGenerated(fmtDate(d));
  }
  // Nochmal alle Slots sammeln (inkl. neu generierter)
  const allDates2 = Object.keys(data.weekPlanDays).sort();
  const flat2 = [];
  allDates2.forEach(ds => {
    data.weekPlanDays[ds].forEach(s => {
      if (s.type === 'rechtsgebiet') flat2.push({ dateStr: ds, slot: s });
    });
  });
  const pos2 = flat2.findIndex(f => f.dateStr === currentSlotDate && f.slot.id === currentSlotId);
  if (pos2 === -1) return;

  const tail = flat2.slice(pos2); // ab aktuellem Slot (inkl.)
  const contents = tail.map(f => ({ type: f.slot.type, label: f.slot.label, subject: f.slot.subject, done: f.slot.done, shifted: f.slot.shifted }));

  // Rotiere nach hinten: jeder Slot bekommt den Inhalt des VORGÄNGERS
  for (let i = tail.length - 1; i > 0; i--) {
    tail[i].slot.type = contents[i-1].type;
    tail[i].slot.label = contents[i-1].label;
    tail[i].slot.subject = contents[i-1].subject;
    tail[i].slot.done = contents[i-1].done;
    tail[i].slot.shifted = true;
  }
  // Erster Slot (der markierte) wird FREI
  tail[0].slot.type = 'frei';
  tail[0].slot.label = TYPE_LABELS.frei;
  tail[0].slot.subject = null;
  tail[0].slot.done = false;
  tail[0].slot.shifted = true;

  // Neu zuweisen, da sich alles verschoben hat
  assignSubjectsToAllSlots();
  recalcQueueRemaining();

  const targetDateStr = tail[tail.length-1].dateStr;
  saveToLocal(); closeSlotDetailModal();
  currentWeekStart = getMonday(new Date(targetDateStr + 'T00:00:00'));
  renderWeekCalendar(); renderSubjectQueue();
  toast(`Verschoben – Termin jetzt am ${targetDateStr}`);
}

// ── Lernplan: Kalender, wiederkehrende Blöcke und Klassen ──
const LP_DAY_NAMES = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const LP_GRID_START = 8 * 60;
const LP_GRID_END = 20 * 60;
const LP_MINUTES_PER_PIXEL = 1;
lernplanTab = 'week';
let lpCreateMode = false;
let lpBlockEditId = null;
let lpBlockEditDate = null;
let lpClassEditId = null;
let lpSuppressClickUntil = 0;
let lpInteraction = null;

function migrateLearningPlanData() {
  if (!Array.isArray(data.weekPlanClasses)) data.weekPlanClasses = [];
  const makeSafeId = (value,prefix) => /^[A-Za-z0-9_-]+$/.test(String(value || ''))
    ? String(value)
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const oldQueue = Array.isArray(data.subjectQueue) ? data.subjectQueue : [];
  if (data.weekPlanClasses.length === 0) {
    oldQueue.forEach(entry => {
      if (data.weekPlanClasses.some(c => c.name === entry.subject)) return;
      const completedUnits = Math.max(0, Number(entry.units || 1) - Number(entry.remaining ?? entry.units ?? 1));
      data.weekPlanClasses.push({
        id: `legacy-${entry.id || Date.now()}`,
        name: entry.subject || 'Alte Klasse',
        description: '',
        color: '#f3d8cb',
        tasks: [{id:`legacy-task-${entry.id || Date.now()}`, title:entry.subject || 'Lerneinheit', description:'', units:Math.max(1, Number(entry.units || 1)), completedUnits}]
      });
    });
  }
  data.weekPlanClasses.forEach(cls => {
    cls.id = makeSafeId(cls.id,'class');
    cls.name = String(cls.name || 'Unbenannte Klasse');
    cls.description = String(cls.description || '');
    cls.color = /^#[0-9a-f]{6}$/i.test(String(cls.color || '')) ? cls.color : '#f3d8cb';
    cls.loop = !!cls.loop;
    if (!Array.isArray(cls.tasks)) cls.tasks = [];
    cls.tasks.forEach(task => {
      task.id = makeSafeId(task.id,'task');
      task.title = String(task.title || 'Unbenannte Teilaufgabe');
      task.description = String(task.description || '');
      const units = Number(task.units);
      task.units = Number.isInteger(units) && units > 0 ? units : 1;
      const completed = Number(task.completedUnits);
      task.completedUnits = Number.isInteger(completed) ? Math.min(task.units,Math.max(0,completed)) : 0;
    });
  });

  const toMinutes = value => {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 9 * 60;
  };
  const formatTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
  data.weekPlanSlots = (Array.isArray(data.weekPlanSlots) ? data.weekPlanSlots : []).map(slot => {
    const legacyStart = toMinutes(slot.startTime || slot.time);
    const rangeEnd = String(slot.time || '').match(/(?:–|-|—)\s*(\d{1,2}:\d{2})/);
    const start = Math.max(LP_GRID_START, Math.min(LP_GRID_END - 30, legacyStart));
    const end = Math.max(start + 30, Math.min(LP_GRID_END, Number(slot.endTime ? toMinutes(slot.endTime) : (rangeEnd ? toMinutes(rangeEnd[1]) : start + 60))));
    const linkedClass = slot.classId ? data.weekPlanClasses.find(c => c.id === slot.classId) : null;
    const legacyClass = slot.type === 'rechtsgebiet' && data.weekPlanClasses.length === 1 ? data.weekPlanClasses[0] : null;
    return {
      id: makeSafeId(slot.id,'block'),
      day: LP_DAY_NAMES.includes(slot.day) ? slot.day : 'Montag',
      startTime: formatTime(start),
      endTime: formatTime(end),
      name: String(slot.name || slot.label || (slot.type === 'rechtsgebiet' ? 'Thema nacharbeiten' : TYPE_LABELS[slot.type] || 'Lernblock')),
      description: String(slot.description || ''),
      color: /^#[0-9a-f]{6}$/i.test(slot.color || '') ? slot.color : '#f3d8cb',
      classId: linkedClass?.id || legacyClass?.id || ''
    };
  });
  if (!data.weekPlanDays || typeof data.weekPlanDays !== 'object') data.weekPlanDays = {};
  Object.entries(data.weekPlanDays).forEach(([date, entries]) => {
    if (!Array.isArray(entries)) { data.weekPlanDays[date] = []; return; }
    data.weekPlanDays[date] = entries.map(entry => {
      if (entry.templateId) return entry;
      const start = toMinutes(entry.startTime || entry.time);
      const block = data.weekPlanSlots.find(template =>
        template.day === WEEKDAY_NAMES[new Date(`${date}T00:00:00`).getDay()] &&
        Math.abs(toMinutes(template.startTime) - start) < 30
      );
      return {
        id: entry.id || `occurrence-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        templateId: block?.id || '',
        done: !!entry.done,
        missed: !!entry.missed,
        assignedTaskId: entry.assignedTaskId || ''
      };
    }).filter(entry => entry.templateId);
  });
  if (!data._learningPlanCalendarVersion) data._learningPlanCalendarVersion = 1;
}

function setLernplanTab(btn, val) {
  lernplanTab = val;
  if (val !== 'week' && lpCreateMode) {
    lpCreateMode = false;
    document.getElementById('lp-add-block-btn').textContent = '＋ Block hinzufügen';
    document.getElementById('lp-add-block-btn').classList.remove('success');
    document.getElementById('lp-create-hint').style.display = 'none';
  }
  document.querySelectorAll('.chip[data-lp]').forEach(button => button.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('lp-week-view').style.display = val === 'week' ? 'block' : 'none';
  document.getElementById('lp-classes-view').style.display = val === 'classes' ? 'block' : 'none';
  if (val === 'week') renderWeekCalendar();
  else renderClassList();
}

function lpTimeMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return hours * 60 + minutes;
}
function lpFormatTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
}
function lpDateDay(date) { return LP_DAY_NAMES[(date.getDay() + 6) % 7]; }
function lpOccurrencesForDate(dateStr) {
  if (!Array.isArray(data.weekPlanDays[dateStr])) data.weekPlanDays[dateStr] = [];
  const date = new Date(`${dateStr}T00:00:00`);
  const blocks = data.weekPlanSlots.filter(block => block.day === lpDateDay(date));
  blocks.forEach(block => {
    if (!data.weekPlanDays[dateStr].some(item => item.templateId === block.id)) {
      data.weekPlanDays[dateStr].push({
        id:`occurrence-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        templateId:block.id, done:false, missed:false, assignedTaskId:''
      });
    }
  });
  data.weekPlanDays[dateStr] = data.weekPlanDays[dateStr].filter(item => blocks.some(block => block.id === item.templateId));
  return data.weekPlanDays[dateStr];
}
function lpEnsureOccurrences(throughDate) {
  const today = new Date(); today.setHours(0,0,0,0);
  const end = new Date(`${throughDate}T00:00:00`);
  end.setDate(end.getDate() + 56);
  const cursor = new Date(today);
  while (cursor <= end) {
    lpOccurrencesForDate(fmtDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const visibleStart = new Date(currentWeekStart || getMonday(new Date()));
  for (let i = 0; i < 7; i++) lpOccurrencesForDate(fmtDate(addDays(visibleStart, i)));
}
function lpTaskProgressDisplay(task) {
  if (!task || !Number.isFinite(task.units) || task.units < 1) return '0/0';
  const currentUnit = Math.min(task.units, Math.max(1, (Number(task.completedUnits) || 0) + 1));
  return `${currentUnit}/${task.units}`;
}
function lpClassLoopCompleted(cls) {
  if (!cls || !Array.isArray(cls.tasks) || !cls.tasks.length || !cls.loop) return false;
  return cls.tasks.every(task => (Number(task.completedUnits) || 0) >= (Number(task.units) || 1));
}
function lpResetClassLoop(cls) {
  if (!lpClassLoopCompleted(cls)) return false;
  cls.tasks.forEach(task => { task.completedUnits = 0; });
  return true;
}
function lpTaskForUnit(cls, unitIndex) {
  let remainingIndex = unitIndex;
  for (const task of cls.tasks) {
    const remaining = Math.max(0, task.units - (Number(task.completedUnits) || 0));
    if (remainingIndex < remaining) return task;
    remainingIndex -= remaining;
  }
  return null;
}
function lpRefreshAssignments() {
  const todayStr = fmtDate(new Date());
  const occurrences = [];
  Object.keys(data.weekPlanDays).sort().forEach(dateStr => {
    if (dateStr < todayStr) return;
    (data.weekPlanDays[dateStr] || []).forEach(item => {
      const block = data.weekPlanSlots.find(candidate => candidate.id === item.templateId);
      const cls = block?.classId ? data.weekPlanClasses.find(candidate => candidate.id === block.classId) : null;
      if (block && cls) occurrences.push({dateStr,item,block,cls});
    });
  });
  occurrences.sort((a,b) => a.dateStr.localeCompare(b.dateStr) || lpTimeMinutes(a.block.startTime) - lpTimeMinutes(b.block.startTime));
  data.weekPlanClasses.forEach(cls => {
    lpResetClassLoop(cls);
    let unitIndex = 0;
    occurrences.filter(occurrence => occurrence.cls.id === cls.id).forEach(({item}) => {
      if (item.done) return;
      const task = lpTaskForUnit(cls, unitIndex);
      item.assignedTaskId = task?.id || '';
      if (!item.missed && task) unitIndex++;
    });
  });
}

function renderWeekCalendar() {
  if (!currentWeekStart) currentWeekStart = getMonday(new Date());
  const weekEnd = addDays(currentWeekStart, 6);
  lpEnsureOccurrences(fmtDate(weekEnd));
  lpRefreshAssignments();
  document.getElementById('week-range-label').textContent = `${fmtDate(currentWeekStart)} – ${fmtDate(weekEnd)}`;
  const todayStr = fmtDate(new Date());
  let html = '<div class="lp-calendar" id="lp-calendar-grid">';
  html += '<div class="lp-calendar-head"></div>';
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const date = addDays(currentWeekStart, dayIndex);
    const dateStr = fmtDate(date);
    html += `<div class="lp-calendar-head ${dateStr === todayStr ? 'today' : ''}">${lpDateDay(date)}<small>${dateStr.slice(5)}</small></div>`;
  }
  html += '<div class="lp-time-axis">';
  for (let hour = 8; hour <= 20; hour++) {
    const minuteOffset = hour * 60 - LP_GRID_START;
    html += `<span class="lp-hour-label" style="top:${minuteOffset * LP_MINUTES_PER_PIXEL}px">${String(hour).padStart(2,'0')}:00</span>`;
  }
  html += '</div>';
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const date = addDays(currentWeekStart, dayIndex);
    const dateStr = fmtDate(date);
    const dayName = lpDateDay(date);
    const isToday = dateStr === todayStr;
    html += `<div class="lp-day-column ${isToday ? 'today' : ''} ${lpCreateMode ? 'adding' : ''}" data-day-index="${dayIndex}" data-day="${dayName}" data-date="${dateStr}" onpointerdown="beginCalendarPointer(event,'${dayName}')">`;
    const blocks = data.weekPlanSlots.filter(block => block.day === dayName).sort((a,b) => lpTimeMinutes(a.startTime) - lpTimeMinutes(b.startTime));
    blocks.forEach(block => {
      const occurrence = data.weekPlanDays[dateStr]?.find(item => item.templateId === block.id);
      const cls = data.weekPlanClasses.find(candidate => candidate.id === block.classId);
      const task = cls?.tasks.find(candidate => candidate.id === occurrence?.assignedTaskId);
      const start = lpTimeMinutes(block.startTime);
      const end = lpTimeMinutes(block.endTime);
      const top = (start - LP_GRID_START) * LP_MINUTES_PER_PIXEL;
      const height = (end - start) * LP_MINUTES_PER_PIXEL;
      const escapedName = escapeHtml(block.name);
      const classCompleted = cls && cls.tasks.length > 0 && cls.tasks.every(item => item.completedUnits >= item.units);
      const taskMarkup = task ? `<div class="lp-block-task">${escapeHtml(task.title)} · ${lpTaskProgressDisplay(task)}</div>` : (classCompleted ? '<div class="lp-block-task">Klasse abgeschlossen</div>' : '');
      const action = cls && task && occurrence && !occurrence.done
        ? `<div class="lp-block-actions"><button onclick="event.stopPropagation();completeOccurrence('${dateStr}','${block.id}')">✓ Erledigt</button><button onclick="event.stopPropagation();missOccurrence('${dateStr}','${block.id}')">↷ Verschieben</button></div>`
        : '';
      html += `<div class="lp-block ${occurrence?.done ? 'done' : ''}" data-template-id="${block.id}" data-date="${dateStr}" style="top:${top}px;height:${height}px;background:${escapeHtml(block.color)}" onpointerdown="beginBlockPointer(event,'${block.id}')" onclick="handleBlockClick('${block.id}','${dateStr}')">
        <div class="lp-block-title">${escapedName}</div><div class="lp-block-time">${block.startTime}–${block.endTime}</div>
        ${block.description ? `<div class="lp-block-description">${escapeHtml(block.description)}</div>` : ''}${taskMarkup}${action}
        <span class="lp-resize-handle top" onpointerdown="beginBlockResize(event,'${block.id}','start')"></span><span class="lp-resize-handle" onpointerdown="beginBlockResize(event,'${block.id}','end')"></span></div>`;
    });
    if (isToday) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (nowMinutes >= LP_GRID_START && nowMinutes <= LP_GRID_END) html += `<div class="lp-now-line" style="top:${(nowMinutes - LP_GRID_START) * LP_MINUTES_PER_PIXEL}px"></div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  document.getElementById('week-calendar').innerHTML = html;
  saveToLocal();
}
function updateCurrentTimeLine() {
  const line = document.querySelector('.lp-day-column.today .lp-now-line');
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (line) {
    line.style.display = minutes >= LP_GRID_START && minutes <= LP_GRID_END ? '' : 'none';
    line.style.top = `${(minutes - LP_GRID_START) * LP_MINUTES_PER_PIXEL}px`;
  }
  const dashboardLine = document.querySelector('.dash-day-column.today .dash-now-line');
  if (dashboardLine) {
    dashboardLine.style.display = minutes >= 480 && minutes <= 1200 ? '' : 'none';
    dashboardLine.style.top = `${minutes - 480}px`;
  } else if (minutes >= 480 && minutes <= 1200) {
    const dashboardColumn = document.querySelector('.dash-day-column.today');
    if (dashboardColumn) {
      const newLine = document.createElement('div');
      newLine.className = 'dash-now-line';
      newLine.style.top = `${minutes - 480}px`;
      dashboardColumn.appendChild(newLine);
    }
  }
}
function shiftWeekView(delta) { currentWeekStart = addDays(currentWeekStart || getMonday(new Date()), delta * 7); renderWeekCalendar(); }
function jumpToTodayWeek() { currentWeekStart = getMonday(new Date()); renderWeekCalendar(); }

function toggleBlockCreation() {
  lpCreateMode = !lpCreateMode;
  const button = document.getElementById('lp-add-block-btn');
  const hint = document.getElementById('lp-create-hint');
  if (button) button.textContent = lpCreateMode ? '× Abbrechen' : '＋ Block hinzufügen';
  if (button) button.classList.toggle('success', lpCreateMode);
  if (hint) hint.style.display = lpCreateMode ? 'inline' : 'none';
  if (lernplanTab !== 'week') {
    document.querySelector('.chip[data-lp="week"]').click();
    lpCreateMode = true;
    document.getElementById('lp-add-block-btn').classList.add('success');
    document.getElementById('lp-create-hint').style.display = 'inline';
  }
  renderWeekCalendar();
}
function lpSnapMinutes(value) { return Math.max(LP_GRID_START, Math.min(LP_GRID_END, Math.round(value / 30) * 30)); }
function lpPointerMinutes(event, column) {
  const rect = column.getBoundingClientRect();
  return lpSnapMinutes(LP_GRID_START + (event.clientY - rect.top) / LP_MINUTES_PER_PIXEL);
}
function beginCalendarPointer(event, day) {
  if (!lpCreateMode || event.button !== 0 || event.target.closest('.lp-block')) return;
  event.preventDefault();
  const column = event.currentTarget;
  const start = lpPointerMinutes(event, column);
  lpInteraction = {mode:'create',day,start,end:Math.min(LP_GRID_END,start + 30),originY:event.clientY,column, moved:false};
  lpShowSelection(lpInteraction);
}
function beginBlockPointer(event, blockId) {
  if (lpCreateMode) return;
  if (event.button !== 0 || event.target.closest('.lp-resize-handle') || event.target.closest('button')) return;
  const block = data.weekPlanSlots.find(item => item.id === blockId);
  if (!block) return;
  const dayColumn = event.currentTarget.parentElement;
  lpInteraction = {mode:'move',blockId,day:block.day,start:lpTimeMinutes(block.startTime),end:lpTimeMinutes(block.endTime),originalStart:lpTimeMinutes(block.startTime),duration:lpTimeMinutes(block.endTime)-lpTimeMinutes(block.startTime),originY:event.clientY,originX:event.clientX,dayIndex:Number(dayColumn.dataset.dayIndex),column:dayColumn,blockColor:block.color,moved:false};
  lpShowSelection(lpInteraction);
  window.addEventListener('pointermove', handleCalendarPointerMove);
  window.addEventListener('pointerup', finishCalendarPointer, {once:true});
}
function beginBlockResize(event, blockId, edge) {
  event.stopPropagation();
  event.preventDefault();
  const block = data.weekPlanSlots.find(item => item.id === blockId);
  if (!block) return;
  const dayColumn = event.currentTarget.closest('.lp-day-column');
  lpInteraction = {mode:edge === 'start' ? 'resize-start' : 'resize-end',blockId,day:block.day,start:lpTimeMinutes(block.startTime),end:lpTimeMinutes(block.endTime),originalStart:lpTimeMinutes(block.startTime),originalEnd:lpTimeMinutes(block.endTime),originY:event.clientY,column:dayColumn,blockColor:block.color,moved:false};
  lpShowSelection(lpInteraction);
  window.addEventListener('pointermove', handleCalendarPointerMove);
  window.addEventListener('pointerup', finishCalendarPointer, {once:true});
}
function lpShowSelection(interaction) {
  document.querySelector('.lp-selection')?.remove();
  document.querySelector('.lp-block-preview')?.remove();
  const column = interaction.column || document.querySelector(`.lp-day-column[data-day="${interaction.day}"]`);
  if (!column) return;
  const preview = document.createElement('div');
  preview.className = interaction.mode === 'create' ? 'lp-selection' : 'lp-block-preview';
  const top = Math.min(interaction.start, interaction.end) - LP_GRID_START;
  const height = Math.max(30, Math.abs(interaction.end - interaction.start));
  preview.style.top = `${Math.max(0, top)}px`;
  preview.style.height = `${height}px`;
  if (interaction.blockColor) preview.style.background = interaction.blockColor;
  if (interaction.mode === 'move' || interaction.mode === 'resize-start' || interaction.mode === 'resize-end') {
    preview.style.left = '4px';
    preview.style.right = '4px';
    preview.style.border = '2px dashed rgba(31,28,26,0.35)';
    preview.style.opacity = '0.8';
  }
  column.appendChild(preview);
}
function handleCalendarPointerMove(event) {
  if (!lpInteraction) return;
  const interaction = lpInteraction;
  const delta = Math.round((event.clientY - interaction.originY) / 30) * 30;
  if (Math.abs(delta) >= 4 || (interaction.originX !== undefined && Math.abs(event.clientX - interaction.originX) > 8)) interaction.moved = true;
  if (interaction.mode === 'create') {
    interaction.end = lpPointerMinutes(event,interaction.column);
    lpShowSelection(interaction);
  } else if (interaction.mode === 'resize-end') {
    interaction.end = Math.max(interaction.start + 30, Math.min(LP_GRID_END, lpSnapMinutes(interaction.originalEnd + delta)));
    lpShowSelection(interaction);
  } else if (interaction.mode === 'resize-start') {
    interaction.start = Math.max(LP_GRID_START,Math.min(interaction.originalEnd - 30,lpSnapMinutes(interaction.originalStart + delta)));
    interaction.end = interaction.originalEnd;
    lpShowSelection(interaction);
  } else {
    const target = document.elementFromPoint(event.clientX,event.clientY)?.closest('.lp-day-column');
    if (target) {
      interaction.day = target.dataset.day;
      interaction.column = target;
    }
    interaction.start = Math.max(LP_GRID_START,Math.min(LP_GRID_END - interaction.duration,lpSnapMinutes(interaction.originalStart + delta)));
    interaction.end = interaction.start + interaction.duration;
    lpShowSelection(interaction);
  }
}
function finishCalendarPointer(event) {
  const interaction = lpInteraction;
  if (!interaction) return;
  document.querySelector('.lp-selection')?.remove();
  document.querySelector('.lp-block-preview')?.remove();
  window.removeEventListener('pointermove',handleCalendarPointerMove);
  lpInteraction = null;
  if (interaction.mode === 'create') {
    const start = interaction.start === interaction.end ? interaction.start : Math.min(interaction.start,interaction.end);
    const end = interaction.start === interaction.end ? Math.min(LP_GRID_END,start + 30) : Math.max(interaction.start,interaction.end);
    if (end > start && !lpHasOverlap(interaction.day,start,end)) {
      const block = {id:`block-${Date.now()}-${Math.random().toString(36).slice(2)}`,day:interaction.day,startTime:lpFormatTime(start),endTime:lpFormatTime(end),name:'Lernblock',description:'',color:'#f3d8cb',classId:''};
      data.weekPlanSlots.push(block);
      lpCreateMode = false;
      document.getElementById('lp-create-hint').style.display = 'none';
      document.getElementById('lp-add-block-btn').textContent = '＋ Block hinzufügen';
      document.getElementById('lp-add-block-btn').classList.remove('success');
      saveToLocal(); renderWeekCalendar(); openBlockModal(block.id,fmtDate(addDays(currentWeekStart,LP_DAY_NAMES.indexOf(block.day))));
    } else if (end > start) toast('Dieser Zeitraum ist bereits belegt.');
    else renderWeekCalendar();
    return;
  }
  if (!interaction.moved) return;
  lpSuppressClickUntil = Date.now() + 250;
  const block = data.weekPlanSlots.find(item => item.id === interaction.blockId);
  if (!block) return;
  const start = lpTimeMinutes(block.startTime);
  const end = lpTimeMinutes(block.endTime);
  const nextStart = interaction.mode === 'resize-start' ? interaction.start : interaction.mode === 'resize-end' ? start : interaction.start;
  const nextEnd = interaction.mode === 'resize-start' ? interaction.originalEnd : interaction.end;
  if (lpHasOverlap(interaction.day,nextStart,nextEnd,block.id)) { toast('Dieser Zeitraum ist bereits belegt.'); renderWeekCalendar(); return; }
  block.day = interaction.day;
  block.startTime = lpFormatTime(nextStart);
  block.endTime = lpFormatTime(nextEnd);
  saveToLocal(); renderWeekCalendar();
}
function lpHasOverlap(day,start,end,excludeId='') {
  return data.weekPlanSlots.some(block => block.id !== excludeId && block.day === day &&
    start < lpTimeMinutes(block.endTime) && end > lpTimeMinutes(block.startTime));
}
window.addEventListener('pointermove',handleCalendarPointerMove);
window.addEventListener('pointerup',finishCalendarPointer);

function lpSyncBlockFromClass(block, classId) {
  if (!block) return;
  const cls = data.weekPlanClasses.find(item => item.id === classId);
  if (!cls) return;
  block.classId = classId;
  block.name = cls.name;
  block.description = cls.description || '';
  block.color = cls.color || '#f3d8cb';
  return cls;
}
function openBlockModal(blockId,dateStr) {
  if (Date.now() < lpSuppressClickUntil) return;
  lpBlockEditId = blockId; lpBlockEditDate = dateStr;
  const block = data.weekPlanSlots.find(item => item.id === blockId);
  if (!block) return;
  document.getElementById('block-modal-title').textContent = 'Lernblock bearbeiten';
  document.getElementById('block-start').value = block.startTime;
  document.getElementById('block-end').value = block.endTime;
  const select = document.getElementById('block-class');
  select.innerHTML = '<option value="">Keine Klasse</option>' + data.weekPlanClasses.map(cls => `<option value="${escapeHtml(cls.id)}">${escapeHtml(cls.name)}</option>`).join('');
  select.value = block.classId || '';
  const classMatch = data.weekPlanClasses.find(candidate => candidate.id === block.classId);
  if (classMatch) {
    document.getElementById('block-name').value = classMatch.name;
    document.getElementById('block-description').value = classMatch.description || '';
    document.getElementById('block-color').value = classMatch.color || '#f3d8cb';
  } else {
    document.getElementById('block-name').value = block.name;
    document.getElementById('block-description').value = block.description || '';
    document.getElementById('block-color').value = block.color;
  }
  select.onchange = () => {
    const selectedClass = data.weekPlanClasses.find(candidate => candidate.id === select.value);
    if (selectedClass) {
      document.getElementById('block-name').value = selectedClass.name;
      document.getElementById('block-description').value = selectedClass.description || '';
      document.getElementById('block-color').value = selectedClass.color || '#f3d8cb';
    }
  };
  const occurrence = data.weekPlanDays[dateStr]?.find(item => item.templateId === blockId);
  const cls = data.weekPlanClasses.find(candidate => candidate.id === block.classId);
  const task = cls?.tasks.find(candidate => candidate.id === occurrence?.assignedTaskId);
  const actions = document.getElementById('block-occurrence-actions');
  actions.style.display = cls && task && occurrence && !occurrence.done ? 'block' : 'none';
  document.getElementById('block-assignment').textContent = task ? `Lerneinheit: ${task.title} (${lpTaskProgressDisplay(task)})` : '';
  document.getElementById('block-delete-btn').style.display = 'inline-flex';
  openModal('block-modal');
}
function handleBlockClick(blockId,dateStr) { if (!lpCreateMode) openBlockModal(blockId,dateStr); }
function closeBlockModal() { closeModal('block-modal'); lpBlockEditId = null; lpBlockEditDate = null; }
function saveBlock() {
  const block = data.weekPlanSlots.find(item => item.id === lpBlockEditId);
  if (!block) return;
  const selectedClassId = document.getElementById('block-class').value;
  const selectedClass = data.weekPlanClasses.find(item => item.id === selectedClassId);
  const name = selectedClass ? selectedClass.name : document.getElementById('block-name').value.trim();
  const start = lpTimeMinutes(document.getElementById('block-start').value);
  const end = lpTimeMinutes(document.getElementById('block-end').value);
  if (!name) { toast('Bitte einen Namen für den Block eingeben.'); return; }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < LP_GRID_START || end > LP_GRID_END || end - start < 30) { toast('Bitte einen gültigen Zeitraum zwischen 06:00 und 24:00 wählen (mindestens 30 Minuten).'); return; }
  if (lpHasOverlap(block.day,start,end,block.id)) { toast('Dieser Zeitraum ist bereits belegt.'); return; }
  block.name = name;
  block.description = selectedClass ? (selectedClass.description || '') : document.getElementById('block-description').value.trim();
  block.startTime = lpFormatTime(start);
  block.endTime = lpFormatTime(end);
  block.color = selectedClass ? (selectedClass.color || '#f3d8cb') : document.getElementById('block-color').value;
  block.classId = selectedClassId;
  saveToLocal(); closeBlockModal(); renderWeekCalendar(); renderClassList(); toast('Block gespeichert');
}
function deleteCurrentBlock() {
  if (!lpBlockEditId || !confirm('Diesen wiederkehrenden Block aus dem Wochenplan entfernen?')) return;
  const id = lpBlockEditId;
  data.weekPlanSlots = data.weekPlanSlots.filter(block => block.id !== id);
  Object.keys(data.weekPlanDays).forEach(date => { data.weekPlanDays[date] = data.weekPlanDays[date].filter(item => item.templateId !== id); });
  saveToLocal(); closeBlockModal(); renderWeekCalendar(); toast('Block entfernt');
}
function completeCurrentOccurrence() { if (lpBlockEditDate && lpBlockEditId) completeOccurrence(lpBlockEditDate,lpBlockEditId); closeBlockModal(); }
function missCurrentOccurrence() { if (lpBlockEditDate && lpBlockEditId) missOccurrence(lpBlockEditDate,lpBlockEditId); closeBlockModal(); }
function completeOccurrence(dateStr,blockId) {
  const block = data.weekPlanSlots.find(item => item.id === blockId);
  const occurrence = data.weekPlanDays[dateStr]?.find(item => item.templateId === blockId);
  const cls = data.weekPlanClasses.find(candidate => candidate.id === block?.classId);
  const task = cls?.tasks.find(candidate => candidate.id === occurrence?.assignedTaskId);
  if (!block || !occurrence || occurrence.done || occurrence.missed) return;
  if (cls && task) {
    if (task.completedUnits >= task.units) { lpRefreshAssignments(); toast('Diese Teilaufgabe ist bereits abgeschlossen.'); return; }
    task.completedUnits++;
    if (cls.loop) lpResetClassLoop(cls);
  }
  occurrence.done = true;
  occurrence.missed = false;
  lpRefreshAssignments(); saveToLocal();
  if (document.getElementById('sec-lernplan')) { renderWeekCalendar(); renderClassList(); }
  toast('Lernblock erledigt ✓');
}
function missOccurrence(dateStr,blockId) {
  const block = data.weekPlanSlots.find(item => item.id === blockId);
  const occurrence = data.weekPlanDays[dateStr]?.find(item => item.templateId === blockId);
  if (!occurrence || occurrence.done || occurrence.missed) return;
  occurrence.missed = true;
  lpRefreshAssignments(); saveToLocal();
  if (document.getElementById('sec-lernplan')) { renderWeekCalendar(); renderClassList(); }
  toast(block?.classId ? 'Nicht geschafft – die Klasse rückt einen Termin weiter.' : 'Lernblock als nicht geschafft markiert.');
}

function openClassModal(classId='') {
  lpClassEditId = classId || null;
  const cls = data.weekPlanClasses.find(item => item.id === classId);
  document.getElementById('class-modal-title').textContent = cls ? 'Klasse bearbeiten' : 'Klasse anlegen';
  document.getElementById('class-name').value = cls?.name || '';
  document.getElementById('class-description').value = cls?.description || '';
  document.getElementById('class-color').value = cls?.color || '#f3d8cb';
  document.getElementById('class-loop').checked = !!cls?.loop;
  document.getElementById('class-delete-btn').style.display = cls ? 'inline-flex' : 'none';
  const editor = document.getElementById('class-task-editor');
  editor.innerHTML = '';
  (cls?.tasks || []).forEach(task => addClassTaskRow(task));
  if (!cls) addClassTaskRow();
  openModal('class-modal');
}
function closeClassModal() { closeModal('class-modal'); lpClassEditId = null; }
function addClassTaskRow(task={}) {
  const row = document.createElement('div');
  row.className = 'lp-task-row';
  row.dataset.taskId = task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  row.dataset.completed = String(task.completedUnits || 0);
  row.innerHTML = `<div style="flex:1;min-width:0"><input class="task-title" maxlength="100" placeholder="Teilaufgabe / Thema" value="${escapeHtml(task.title || '')}"><input class="task-description" maxlength="300" placeholder="Beschreibung (optional)" value="${escapeHtml(task.description || '')}" style="margin-top:6px"></div><div style="width:95px"><label style="margin-top:0">Einheiten</label><input class="task-units" type="number" min="1" value="${Math.max(1,Number(task.units || 1))}"><small style="color:var(--ink-tertiary)">${Number(task.completedUnits || 0)} erledigt</small></div><div style="display:flex;flex-direction:column;gap:4px"><button class="btn small" type="button" onclick="moveClassTaskRow(this,-1)" aria-label="Teilaufgabe nach oben">↑</button><button class="btn small" type="button" onclick="moveClassTaskRow(this,1)" aria-label="Teilaufgabe nach unten">↓</button><button class="btn small danger" type="button" onclick="this.parentElement.parentElement.remove()" aria-label="Teilaufgabe entfernen">×</button></div>`;
  document.getElementById('class-task-editor').appendChild(row);
}
function moveClassTaskRow(button,direction) {
  const row = button.closest('.lp-task-row');
  if (!row) return;
  const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling) return;
  if (direction < 0) row.parentElement.insertBefore(row,sibling);
  else row.parentElement.insertBefore(sibling,row);
}
function saveClass() {
  const name = document.getElementById('class-name').value.trim();
  if (!name) { toast('Bitte einen Namen für die Klasse eingeben.'); return; }
  if (data.weekPlanClasses.some(cls => cls.name.toLowerCase() === name.toLowerCase() && cls.id !== lpClassEditId)) { toast('Eine Klasse mit diesem Namen gibt es bereits.'); return; }
  const rows = [...document.querySelectorAll('#class-task-editor .lp-task-row')];
  const tasks = [];
  for (const row of rows) {
    const title = row.querySelector('.task-title').value.trim();
    if (!title) continue;
    const units = Number(row.querySelector('.task-units').value);
    const completedUnits = Number(row.dataset.completed || 0);
    if (!Number.isInteger(units) || units < 1 || units < completedUnits) { toast(`Die Einheiten für „${title}“ müssen mindestens ${completedUnits} betragen.`); return; }
    tasks.push({id:row.dataset.taskId,title,description:row.querySelector('.task-description').value.trim(),units,completedUnits});
  }
  const existing = data.weekPlanClasses.find(cls => cls.id === lpClassEditId);
  const cls = {id:existing?.id || `class-${Date.now()}-${Math.random().toString(36).slice(2)}`,name,description:document.getElementById('class-description').value.trim(),color:document.getElementById('class-color').value,tasks,loop:document.getElementById('class-loop').checked};
  if (existing) Object.assign(existing,cls); else data.weekPlanClasses.push(cls);
  data.weekPlanSlots.forEach(block => {
    if (block.classId === cls.id) {
      block.name = cls.name;
      block.description = cls.description || '';
      block.color = cls.color || '#f3d8cb';
    }
  });
  saveToLocal(); closeClassModal(); renderClassList(); renderWeekCalendar(); toast('Klasse gespeichert');
}
function deleteCurrentClass() {
  if (!lpClassEditId || !confirm('Klasse und ihre Teilaufgaben löschen? Die Lernblöcke bleiben im Kalender, verlieren aber ihre Klassenzuordnung.')) return;
  const deletedClass = data.weekPlanClasses.find(cls => cls.id === lpClassEditId);
  data.weekPlanClasses = data.weekPlanClasses.filter(cls => cls.id !== lpClassEditId);
  data.subjectQueue = data.subjectQueue.filter(entry => !deletedClass || entry.subject !== deletedClass.name);
  data.weekPlanSlots.forEach(block => { if (block.classId === lpClassEditId) block.classId = ''; });
  saveToLocal(); closeClassModal(); renderClassList(); renderWeekCalendar(); toast('Klasse entfernt');
}
function renderClassList() {
  const container = document.getElementById('lp-class-list');
  if (!container) return;
  if (!data.weekPlanClasses.length) { container.innerHTML = '<div class="lp-empty">Noch keine Klassen. Lege eine Klasse mit wiederkehrenden Teilaufgaben an.</div>'; return; }
  container.innerHTML = data.weekPlanClasses.map(cls => {
    const completed = cls.tasks.reduce((sum,task) => sum + task.completedUnits,0);
    const total = cls.tasks.reduce((sum,task) => sum + task.units,0);
    const tasks = cls.tasks.length ? cls.tasks.map(task => `<div class="item-meta" style="margin-top:8px">${escapeHtml(task.title)} · ${task.completedUnits}/${task.units} Einheiten${task.description ? ` — ${escapeHtml(task.description)}` : ''}</div>`).join('') : '<div class="item-meta" style="margin-top:8px">Noch keine Teilaufgaben</div>';
    const loopTag = cls.loop ? '<span class="tag accent" style="margin-top:8px;display:inline-flex;">Loop</span>' : '';
    return `<div class="lp-class-card" style="border-left-color:${escapeHtml(cls.color)}"><div class="lp-class-head"><div><strong>${escapeHtml(cls.name)}</strong><div class="item-meta">${completed} von ${total} Lerneinheiten erledigt${cls.description ? ` · ${escapeHtml(cls.description)}` : ''}</div>${loopTag}${tasks}</div><button class="btn small" onclick="openClassModal('${cls.id}')">Bearbeiten</button></div></div>`;
  }).join('');
}

// ── Notes ──
function renderNotesList() {
  let notes = data.notes;
  if (noteFilter) notes = notes.filter(n => (n.title||'').toLowerCase().includes(noteFilter));
  const container = document.getElementById('notes-list');
  if (!notes.length) { container.innerHTML = '<div style="padding:20px;color:var(--ink-tertiary);">Keine Notizen</div>'; return; }
  container.innerHTML = notes.map(n => `<div class="note-list-item ${currentNote&&currentNote.id===n.id?'active':''}" onclick="openNote('${n.id}')"><div class="note-list-title">${escapeHtml(n.title||'Ohne Titel')}</div><div class="note-list-date">${n.date||''}</div></div>`).join('');
}
function filterNotes(val) { noteFilter = val.toLowerCase(); renderNotesList(); }
function newNote() {
  const n = {id:Date.now().toString(), title:'', body:'', tags:[], date:new Date().toLocaleDateString('de-DE')};
  data.notes.unshift(n); saveToLocal(); openNote(n.id); renderNotesList();
}
function openNote(id) {
  currentNote = data.notes.find(n => n.id === id); if(!currentNote) return;
  document.getElementById('note-content-area').style.display = 'flex';
  document.querySelector('.note-editor-toolbar').innerHTML = `<span style="font-size:12px;color:var(--ink-tertiary);">${currentNote.date||''}</span>`;
  document.getElementById('note-title').value = currentNote.title || '';
  document.getElementById('note-body').value = currentNote.body || '';
  renderResearchTags(); renderNotesList();
}
function saveNoteDebounced() {
  if (!currentNote) return;
  currentNote.title = document.getElementById('note-title').value;
  currentNote.body = document.getElementById('note-body').value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveToLocal();
    document.getElementById('note-saved-hint').textContent = 'gespeichert ✓';
    setTimeout(() => { const el = document.getElementById('note-saved-hint'); if(el) el.textContent = ''; }, 1500);
  }, 600);
}
function extractTagsFromBody() {
  if (!currentNote) return;
  const body = document.getElementById('note-body').value;
  const found = [...body.matchAll(/#(\w+)/g)].map(m => m[1]);
  currentNote.tags = [...new Set(found)];
  renderResearchTags();
}
function renderResearchTags() {
  const area = document.getElementById('research-tags-list');
  if (!area) return;
  const tags = currentNote ? (currentNote.tags || []) : [];
  area.innerHTML = tags.map((t,i) => `<div class="tag accent">${escapeHtml(t)}<button onclick="removeTag(${i})" style="background:none;border:none;color:var(--accent);cursor:pointer;margin-left:4px;font-weight:700;">×</button></div>`).join('');
}
function removeTag(i) { if(currentNote) { currentNote.tags.splice(i,1); saveToLocal(); renderResearchTags(); } }
function deleteCurrentNote() {
  if (currentNote && confirm('Notiz löschen?')) {
    data.notes = data.notes.filter(n => n.id !== currentNote.id);
    currentNote = null;
    document.getElementById('note-content-area').style.display = 'none';
    document.querySelector('.note-editor-toolbar').innerHTML = '<span style="font-size:12px;color:var(--ink-tertiary);">Notiz auswählen oder neu erstellen</span>';
    saveToLocal(); renderNotesList(); toast('Gelöscht');
  }
}

// ── Todos ──
function populateTodoSubject() {
  const subjects = [...new Set(data.lectures.map(l => l.subject).filter(Boolean))];
  const sel = document.getElementById('todo-subject');
  if (sel) sel.innerHTML = '<option value="">Kein Fach</option>' + subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}
function addTodo() {
  const val = document.getElementById('todo-input').value.trim();
  if (!val) return;
  data.todos.push({id:Date.now().toString(), text:val, subject:document.getElementById('todo-subject').value, prio:document.getElementById('todo-prio').value, done:false, date:new Date().toLocaleDateString('de-DE')});
  document.getElementById('todo-input').value = '';
  saveToLocal(); renderTodos(); toast('Aufgabe hinzugefügt');
}
function renderTodos() {
  const container = document.getElementById('todo-list');
  if (!container) return;
  let todos = [...data.todos];
  if (todoFilter === 'open') todos = todos.filter(t => !t.done);
  if (todoFilter === 'done') todos = todos.filter(t => t.done);
  todos.sort((a,b) => { if(a.done!==b.done) return a.done?1:-1; if(a.prio!==b.prio) return a.prio==='high'?-1:1; return 0; });
  if (!todos.length) { container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div>Keine Aufgaben</div>'; return; }
  container.innerHTML = todos.map(t => `<div class="list-item ${t.done?'done':''}" onclick="showTodoDetail('${t.id}')">
    <div class="item-check ${t.done?'checked':''}" onclick="event.stopPropagation();toggleTodo('${t.id}')"></div>
    <div class="item-body">
      <div class="item-title">${escapeHtml(t.text)}</div>
      <div class="item-meta">${t.subject?escapeHtml(t.subject)+' · ':''}${t.date||''}</div>
      ${t.prio==='high'?'<div class="item-tags"><span class="tag danger">hohe Priorität</span></div>':''}
      ${t.done?'<div class="item-tags"><span class="tag success">erledigt</span></div>':''}
    </div>
    <div class="item-actions"><button class="btn small danger" onclick="event.stopPropagation();deleteTodo('${t.id}')">✕</button></div>
  </div>`).join('');
}
function toggleTodo(id) {
  const t = data.todos.find(x => x.id === id);
  if (t) { t.done = !t.done; saveToLocal(); renderTodos(); updateDash(); }
}
function deleteTodo(id) { data.todos = data.todos.filter(x => x.id !== id); saveToLocal(); renderTodos(); toast('Gelöscht'); }
function setTodoFilter(btn, val) { todoFilter = val; document.querySelectorAll('.chip[data-tf]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderTodos(); }

// ── Modal backdrop clicks ──
['lec-modal','detail-modal','schedule-modal','block-modal','class-modal','import-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) {
      closeModal(id);
      if (id === 'lec-modal') lecEditId = null;
      if (id === 'detail-modal') { currentDetailId = null; currentDetailType = null; }
      if (id === 'block-modal') { lpBlockEditId = null; lpBlockEditDate = null; }
      if (id === 'class-modal') lpClassEditId = null;
    }
  });
});

// ── Init ──
 migrateLearningPlanData();
currentWeekStart = getMonday(new Date());
initializeCurrentPage();
generatePastLecturesFromSchedule(true);
setInterval(updateCurrentTimeLine,60000);
