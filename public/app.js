// ─── Constants & State ───────────────────────────────────────────────────────

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7h → 23h (last slot 23:00–24:00)

let currentDate = new Date();
currentDate.setHours(0, 0, 0, 0);

let state = { spots: [], availabilities: [], reservations: [] };
let mySpotId = parseInt(localStorage.getItem('mySpotId')) || null;

// ─── Utilities ───────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

/** Returns "YYYY-MM-DD" */
function dateStr(d = currentDate) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Returns "YYYY-MM-DDTHH:MM" for a given hour */
function dtStr(hour, d = currentDate) {
  return `${dateStr(d)}T${pad(hour)}:00`;
}

/** Formats a date in French (e.g. "lundi 15 mars 2024") */
function frDate(d = currentDate) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Formats a datetime string "YYYY-MM-DDTHH:MM" → "9h" or "9h30" */
function timeLabel(dt) {
  const [, time] = dt.split('T');
  const [h, m] = time.split(':');
  return m === '00' ? `${parseInt(h)}h` : `${parseInt(h)}h${m}`;
}

/** Returns an array of hours in a time range (e.g. ["08:00", "09:00", ...]) from start to end */
function timeOptions(availStart, availEnd) {
  const [, s] = availStart.split('T');
  const [, e] = availEnd.split('T');
  const sh = parseInt(s), eh = parseInt(e);
  const opts = [];
  for (let h = sh; h <= eh; h++) opts.push(`${pad(h)}:00`);
  return opts;
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

async function loadData() {
  try {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('calendar-scroll').classList.add('hidden');
    state = await api('GET', `/api/data?date=${dateStr()}`);
    renderCalendar();
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('calendar-scroll').classList.remove('hidden');
  } catch (err) {
    document.getElementById('loading').innerHTML =
      `<div class="text-red-500">❌ Erreur : ${err.message}</div>`;
  }
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

function getStatus(spotId, hour) {
  const start = dtStr(hour);
  const end = dtStr(hour + 1);

  const reservation = state.reservations.find(
    r => r.spot_id == spotId && r.start_time <= start && r.end_time >= end
  );
  if (reservation) return { type: 'reserved', item: reservation };

  const avail = state.availabilities.find(
    a => a.spot_id == spotId && a.start_time <= start && a.end_time >= end
  );
  if (avail) return { type: 'available', item: avail };

  return { type: 'none', item: null };
}

function renderCalendar() {
  const cal = document.getElementById('calendar');
  const cols = `grid-template-columns: 100px repeat(${HOURS.length}, minmax(44px, 1fr))`;

  // Header row
  let html = `<div class="grid gap-px bg-slate-200" style="${cols}; position:relative">`;
  html += `<div class="bg-slate-50 cal-cell flex items-end px-2 pb-1.5 text-xs font-semibold text-slate-400 sticky-col">Place</div>`;
  for (const h of HOURS) {
    html += `<div data-hour-header="${h}" class="bg-slate-50 cal-cell flex items-end justify-center pb-1.5 text-xs text-slate-400 font-medium">${h}h</div>`;
  }

  // Spot rows
  for (const spot of state.spots) {
    const isPinned = mySpotId == spot.id;
    const nameHtml = spot.owner_name
      ? `<span class="text-xs text-slate-400 truncate leading-none">${spot.owner_name}</span>`
      : `<span class="text-xs text-slate-300 italic leading-none">À configurer</span>`;

    html += `
      <div class="${isPinned ? 'bg-indigo-50 border-l-2 border-indigo-400' : 'bg-white'} cal-cell flex flex-col justify-center px-2 gap-0.5 cursor-pointer hover:bg-indigo-50 transition-colors select-none group sticky-col"
           data-action="manage" data-spot-id="${spot.id}">
        <div class="flex items-center justify-between gap-1">
          <span class="text-sm font-bold text-indigo-700 leading-none">N°${spot.number}</span>
          <div class="flex items-center gap-1">
            <svg data-action="pin" data-spot-id="${spot.id}"
              class="w-3.5 h-3.5 flex-shrink-0 transition-colors ${isPinned ? 'text-amber-400' : 'text-slate-200 group-hover:text-slate-300'}"
              fill="${isPinned ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
            <svg class="w-3 h-3 flex-shrink-0 text-slate-300 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
            </svg>
          </div>
        </div>
        ${nameHtml}
      </div>`;

    for (const h of HOURS) {
      const { type, item } = getStatus(spot.id, h);

      if (type === 'available') {
        html += `<div class="bg-green-100 hover:bg-green-200 cal-cell cursor-pointer transition-colors"
                      data-action="reserve"
                      data-avail-id="${item.id}"
                      data-spot-id="${spot.id}"
                      data-hour="${h}"
                      data-avail-start="${item.start_time}"
                      data-avail-end="${item.end_time}"></div>`;
      } else if (type === 'reserved') {
        html += `<div class="bg-amber-100 hover:bg-amber-200 cal-cell cursor-pointer transition-colors flex items-center justify-center"
                      data-action="view-res"
                      data-res-id="${item.id}">
                   <div class="w-2 h-2 rounded-full bg-amber-400"></div>
                 </div>`;
      } else {
        html += `<div class="bg-white cal-cell"></div>`;
      }
    }
  }

  html += '</div>';
  cal.innerHTML = html;
  updateDateDisplay();
  renderTimeMarker();
}

function updateDateDisplay() {
  document.getElementById('date-display').textContent = frDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = currentDate.getTime() === today.getTime();
  document.getElementById('today-chip').classList.toggle('hidden', isToday);
}

// ─── Time marker ──────────────────────────────────────────────────────────────

function renderTimeMarker() {
  document.getElementById('time-marker')?.remove();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (currentDate.getTime() !== today.getTime()) return;
  const now = new Date();
  const h = now.getHours(), mins = now.getMinutes();
  if (h < HOURS[0] || h > HOURS[HOURS.length - 1]) return;
  const headerCell = document.querySelector(`[data-hour-header="${h}"]`);
  const gridDiv = document.querySelector('#calendar > div');
  if (!headerCell || !gridDiv) return;
  const gLeft = gridDiv.getBoundingClientRect().left;
  const cRect = headerCell.getBoundingClientRect();
  const left = (cRect.left - gLeft) + (mins / 60) * cRect.width;
  const marker = document.createElement('div');
  marker.id = 'time-marker';
  marker.style.cssText = `position:absolute;top:0;bottom:0;left:${left}px;width:2px;background:#ef4444;opacity:0.55;pointer-events:none;z-index:6;`;
  const dot = document.createElement('div');
  dot.style.cssText = 'position:absolute;top:2px;left:-3px;width:8px;height:8px;border-radius:50%;background:#ef4444;opacity:0.9;';
  marker.appendChild(dot);
  gridDiv.appendChild(marker);
}

// ─── Toast notifications ──────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const colors = { success: 'bg-green-600', error: 'bg-red-500', info: 'bg-indigo-600' };
  const toast = document.createElement('div');
  toast.className = `${colors[type] || colors.success} text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg pointer-events-auto opacity-0 transition-opacity duration-300`;
  toast.textContent = msg;
  document.getElementById('toast-container').appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.replace('opacity-0', 'opacity-100')));
  setTimeout(() => {
    toast.classList.replace('opacity-100', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Modal system ─────────────────────────────────────────────────────────────

function showModal(title, bodyHtml, buttons = []) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;

  const actionsEl = document.getElementById('modal-actions');
  actionsEl.innerHTML = '';
  for (const btn of buttons) {
    const b = document.createElement('button');
    b.textContent = btn.label;
    b.className = btn.primary
      ? 'flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors'
      : 'flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors';
    if (btn.danger) b.className = 'flex-1 bg-red-50 text-red-600 py-2.5 rounded-xl font-semibold text-sm hover:bg-red-100 transition-colors';
    b.addEventListener('click', btn.action);
    actionsEl.appendChild(b);
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function showError(msg) {
  let el = document.getElementById('modal-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modal-error';
    el.className = 'mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2';
    document.getElementById('modal-body').appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() {
  const el = document.getElementById('modal-error');
  if (el) el.classList.add('hidden');
}

const inputClass = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide';

// ─── Manage / Setup modal ─────────────────────────────────────────────────────

function showManageModal(spotId) {
  const spot = state.spots.find(s => s.id == spotId);
  if (!spot) return;

  if (!spot.claimed) {
    // ── First-time setup ──
    showModal(`Configurer la place N°${spot.number}`, `
      <p class="text-slate-500 mb-4 text-sm">
        Cette place n'est pas encore configurée. Définissez votre prénom et un code PIN à 4 chiffres pour la gérer.
      </p>
      <div class="space-y-4">
        <div>
          <label class="${labelClass}">Votre prénom</label>
          <input id="setup-name" type="text" placeholder="Ex : Marie, Jean-Pierre…" class="${inputClass}" autocomplete="off" />
        </div>
        <div>
          <label class="${labelClass}">Code PIN (4 chiffres)</label>
          <input id="setup-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="${inputClass}" />
        </div>
        <div>
          <label class="${labelClass}">Confirmer le PIN</label>
          <input id="setup-pin2" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="${inputClass}" />
        </div>
      </div>
    `, [
      { label: 'Configurer', primary: true, action: () => submitSetup(spotId) },
      { label: 'Annuler', action: closeModal },
    ]);
  } else {
    // ── Manage availability ──
    const todayAvails = state.availabilities.filter(a => a.spot_id == spotId);
    const todayReservs = state.reservations.filter(r => r.spot_id == spotId);

    const availsHtml = todayAvails.length === 0
      ? `<p class="text-slate-400 italic text-sm py-2">Aucune disponibilité pour ce jour.</p>`
      : todayAvails.map(a => {
          const resForAvail = todayReservs.filter(r => r.availability_id == a.id);
          const resHtml = resForAvail.length
            ? resForAvail.map(r => `
                <div class="flex items-center justify-between text-xs bg-amber-50 rounded-lg px-3 py-2 mt-1">
                  <span>🚗 <strong>${r.reserver_name}</strong>${r.reserver_apt ? ` · Apt ${r.reserver_apt}` : ''} — ${timeLabel(r.start_time)}–${timeLabel(r.end_time)}</span>
                  <button class="text-red-400 hover:text-red-600 font-medium ml-2" data-cancel-res="${r.id}">✕</button>
                </div>`).join('')
            : '';
          return `
            <div class="bg-green-50 rounded-xl p-3 mb-2">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-green-700 text-sm">${timeLabel(a.start_time)} – ${timeLabel(a.end_time)}</span>
                <button class="text-red-400 hover:text-red-600 text-xs font-medium" data-del-avail="${a.id}">Supprimer</button>
              </div>
              ${resHtml}
            </div>`;
        }).join('');

    showModal(`Place N°${spot.number}${spot.owner_name ? ' · ' + spot.owner_name : ''}`, `
      <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Disponibilités — ${frDate()}</h3>
      ${availsHtml}
      <hr class="my-4 border-slate-100" />
      <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Ajouter une disponibilité</h3>
      <div class="space-y-3">
        <div>
          <label class="${labelClass}">Date</label>
          <input id="avail-date" type="date" value="${dateStr()}"
            min="${dateStr(new Date())}" class="${inputClass}" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="${labelClass}">De</label>
            <input id="avail-start" type="time" value="09:00" step="3600" class="${inputClass}" />
          </div>
          <div>
            <label class="${labelClass}">À</label>
            <input id="avail-end" type="time" value="18:00" step="3600" class="${inputClass}" />
          </div>
        </div>
        <div>
          <label class="${labelClass}">Code PIN</label>
          <input id="avail-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="${inputClass}" />
        </div>
      </div>
      <hr class="my-4 border-slate-100" />
      <details class="group">
        <summary class="cursor-pointer list-none flex items-center justify-between py-1">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">⚙️ Modifier mon profil</span>
          <span class="text-slate-300 text-xs group-open:hidden">▼</span>
          <span class="text-slate-300 text-xs hidden group-open:inline">▲</span>
        </summary>
        <div class="space-y-3 mt-3">
          <div>
            <label class="${labelClass}">Prénom affiché</label>
            <input id="profile-name" type="text" placeholder="Ex : Marie" value="${spot.owner_name || ''}" class="${inputClass}" autocomplete="off" />
          </div>
          <div>
            <label class="${labelClass}">Nouveau PIN (laisser vide pour ne pas changer)</label>
            <input id="profile-new-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="${inputClass}" />
          </div>
          <div>
            <label class="${labelClass}">PIN actuel (requis)</label>
            <input id="profile-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="${inputClass}" />
          </div>
          <button onclick="submitUpdateProfile(${spot.id})"
            class="w-full bg-slate-800 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-700 transition-colors">
            Sauvegarder
          </button>
        </div>
      </details>
    `, [
      { label: 'Ajouter', primary: true, action: () => submitAvailability(spotId) },
      { label: 'Fermer', action: closeModal },
    ]);

    // Attach delete handlers
    document.querySelectorAll('[data-del-avail]').forEach(btn => {
      btn.addEventListener('click', () => deleteAvailability(btn.dataset.delAvail, spotId));
    });
    document.querySelectorAll('[data-cancel-res]').forEach(btn => {
      btn.addEventListener('click', () => cancelReservation(btn.dataset.cancelRes, spotId));
    });
  }
}

// ─── Reserve modal ────────────────────────────────────────────────────────────

function showReserveModal(availId, spotId, hour, availStart, availEnd) {
  const spot = state.spots.find(s => s.id == spotId);
  const opts = timeOptions(availStart, availEnd);
  const defaultEnd = opts[Math.min(opts.indexOf(pad(hour) + ':00') + 1, opts.length - 1)];

  const makeSelect = (id, selectedVal) =>
    `<select id="${id}" class="${inputClass}">` +
    opts.map(t => `<option value="${t}" ${t === selectedVal ? 'selected' : ''}>${parseInt(t)}h</option>`).join('') +
    `</select>`;

  showModal(`Réserver la place N°${spot.number}`, `
    <p class="text-slate-500 text-sm mb-4">
      Disponible de <strong>${timeLabel(availStart)}</strong> à <strong>${timeLabel(availEnd)}</strong>.
    </p>
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="${labelClass}">De</label>
          ${makeSelect('res-start', pad(hour) + ':00')}
        </div>
        <div>
          <label class="${labelClass}">À</label>
          ${makeSelect('res-end', defaultEnd)}
        </div>
      </div>
      <div>
        <label class="${labelClass}">Votre prénom</label>
        <input id="res-name" type="text" placeholder="Ex : Thomas" class="${inputClass}" autocomplete="off" />
      </div>
      <div>
        <label class="${labelClass}">N° appartement (optionnel)</label>
        <input id="res-apt" type="text" placeholder="Ex : 3B" class="${inputClass}" autocomplete="off" />
      </div>
    </div>
  `, [
    { label: 'Réserver', primary: true, action: () => submitReservation(availId, spotId, availStart, availEnd) },
    { label: 'Annuler', action: closeModal },
  ]);
}

// ─── Reservation info modal ───────────────────────────────────────────────────

function showReservationModal(resId) {
  const res = state.reservations.find(r => r.id == resId);
  const spot = state.spots.find(s => s.id == res.spot_id);

  showModal(`Réservation · Place N°${spot.number}`, `
    <div class="space-y-2 text-sm mb-4">
      <div class="flex justify-between py-2 border-b border-slate-100">
        <span class="text-slate-500">Réservé par</span>
        <span class="font-semibold">${res.reserver_name}${res.reserver_apt ? ` (Apt ${res.reserver_apt})` : ''}</span>
      </div>
      <div class="flex justify-between py-2 border-b border-slate-100">
        <span class="text-slate-500">Créneau</span>
        <span class="font-semibold">${timeLabel(res.start_time)} – ${timeLabel(res.end_time)}</span>
      </div>
      <div class="flex justify-between py-2">
        <span class="text-slate-500">Date</span>
        <span class="font-semibold capitalize">${frDate()}</span>
      </div>
    </div>
    <hr class="my-3 border-slate-100" />
    <p class="text-xs text-slate-400 mb-3">Propriétaire de la place : annulez avec votre PIN.</p>
    <div>
      <label class="${labelClass}">Code PIN du propriétaire</label>
      <input id="cancel-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="${inputClass}" />
    </div>
  `, [
    { label: 'Annuler la réservation', danger: true, action: () => submitCancelReservation(resId) },
    { label: 'Fermer', action: closeModal },
  ]);
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function submitSetup(spotId) {
  clearError();
  const name = document.getElementById('setup-name').value.trim();
  const pin = document.getElementById('setup-pin').value;
  const pin2 = document.getElementById('setup-pin2').value;
  if (pin !== pin2) return showError('Les deux PIN ne correspondent pas.');
  if (!/^\d{4}$/.test(pin)) return showError('Le PIN doit contenir exactement 4 chiffres.');
  try {
    await api('POST', `/api/spots/${spotId}/setup`, { owner_name: name || null, pin });
    closeModal();
    showToast('✓ Place configurée !');
    await loadData();
  } catch (err) {
    showError(err.message);
  }
}

async function submitAvailability(spotId) {
  clearError();
  const date = document.getElementById('avail-date').value;
  const start = document.getElementById('avail-start').value;
  const end = document.getElementById('avail-end').value;
  const pin = document.getElementById('avail-pin').value;
  if (!date || !start || !end) return showError('Veuillez remplir tous les champs.');
  if (start >= end) return showError('L\'heure de fin doit être après l\'heure de début.');
  try {
    await api('POST', `/api/spots/${spotId}/availability`, {
      pin,
      start_time: `${date}T${start}`,
      end_time: `${date}T${end}`,
    });
    closeModal();
    showToast('✓ Disponibilité ajoutée');
    await loadData();
  } catch (err) {
    showError(err.message);
  }
}

async function deleteAvailability(availId, spotId) {
  const pin = prompt('Entrez votre PIN pour supprimer cette disponibilité :');
  if (!pin) return;
  try {
    await api('DELETE', `/api/availability/${availId}`, { pin });
    showToast('Disponibilité supprimée', 'info');
    await loadData();
    showManageModal(spotId);
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  }
}

async function submitReservation(availId, spotId, availStart, availEnd) {
  clearError();
  const startTime = document.getElementById('res-start').value;
  const endTime = document.getElementById('res-end').value;
  const name = document.getElementById('res-name').value.trim();
  const apt = document.getElementById('res-apt').value.trim();
  if (!name) return showError('Votre prénom est requis.');
  if (startTime >= endTime) return showError('L\'heure de fin doit être après l\'heure de début.');
  const date = availStart.split('T')[0];
  try {
    await api('POST', '/api/reserve', {
      availability_id: availId,
      reserver_name: name,
      reserver_apt: apt || null,
      start_time: `${date}T${startTime}`,
      end_time: `${date}T${endTime}`,
    });
    closeModal();
    showToast('✓ Réservation confirmée !');
    await loadData();
  } catch (err) {
    showError(err.message);
  }
}

async function cancelReservation(resId, spotId) {
  const pin = prompt('Entrez votre PIN pour annuler cette réservation :');
  if (!pin) return;
  try {
    await api('DELETE', `/api/reservation/${resId}`, { pin });
    showToast('Réservation annulée', 'info');
    await loadData();
    showManageModal(spotId);
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  }
}

async function submitUpdateProfile(spotId) {
  clearError();
  const new_name = document.getElementById('profile-name')?.value.trim() || null;
  const new_pin = document.getElementById('profile-new-pin')?.value || undefined;
  const pin = document.getElementById('profile-pin')?.value;
  if (!pin) return showError('Le PIN actuel est requis.');
  if (new_pin && !/^\d{4}$/.test(new_pin)) return showError('Le nouveau PIN doit contenir 4 chiffres.');
  try {
    const body = { pin, new_name };
    if (new_pin) body.new_pin = new_pin;
    await api('PATCH', `/api/spots/${spotId}`, body);
    closeModal();
    showToast('✓ Profil mis à jour');
    await loadData();
  } catch (err) {
    showError(err.message);
  }
}

async function submitCancelReservation(resId) {
  clearError();
  const pin = document.getElementById('cancel-pin').value;
  if (!pin) return showError('Veuillez entrer votre PIN.');
  try {
    await api('DELETE', `/api/reservation/${resId}`, { pin });
    closeModal();
    showToast('Réservation annulée', 'info');
    await loadData();
  } catch (err) {
    showError(err.message);
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.getElementById('prev-day').addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() - 1);
  loadData();
});

document.getElementById('next-day').addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() + 1);
  loadData();
});

document.getElementById('today-chip').addEventListener('click', () => {
  currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  loadData();
});

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// Delegated click on calendar
document.getElementById('calendar-scroll').addEventListener('click', e => {
  const cell = e.target.closest('[data-action]');
  if (!cell) return;

  const { action } = cell.dataset;
  if (action === 'pin') {
    const id = parseInt(cell.dataset.spotId);
    mySpotId = mySpotId === id ? null : id;
    mySpotId ? localStorage.setItem('mySpotId', mySpotId) : localStorage.removeItem('mySpotId');
    renderCalendar();
    return;
  }
  if (action === 'manage') showManageModal(cell.dataset.spotId);
  if (action === 'reserve') showReserveModal(
    cell.dataset.availId,
    cell.dataset.spotId,
    parseInt(cell.dataset.hour),
    cell.dataset.availStart,
    cell.dataset.availEnd
  );
  if (action === 'view-res') showReservationModal(cell.dataset.resId);
});

// ─── Swipe navigation (mobile) ────────────────────────────────────────────────

let touchStartX = 0, touchStartY = 0;
document.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (e.target.closest('#calendar-scroll')) return; // laisser le scroll horizontal intact
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0) currentDate.setDate(currentDate.getDate() + 1);
    else currentDate.setDate(currentDate.getDate() - 1);
    loadData();
  }
}, { passive: true });

// Rafraîchit le marqueur d'heure toutes les minutes
setInterval(renderTimeMarker, 60_000);

// ─── Init ─────────────────────────────────────────────────────────────────────

loadData();
