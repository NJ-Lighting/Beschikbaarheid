import { supabase } from './supabase.client.js';

// Globale state
let allEvents = [];      // [{ cfg, calendarName, ev }]
let loadErrors = [];     // string[]
let currentView = 'agenda';
let referenceDate = new Date(); // bepaalt week / maand

// ---- Configs uit Supabase ----

function mapRowToConfig(row) {
  return {
    id: row.id,
    naam: row.name,
    url: row.url,
    fields: {
      summary: row.show_summary,
      description: row.show_description,
      location: row.show_location,
      start: row.show_start,
      end: row.show_end
    }
  };
}

async function loadConfigs() {
  const { data, error } = await supabase
    .from('ical_sources')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Supabase load error', error);
    throw error;
  }
  return data.map(mapRowToConfig);
}

// ---------- ICS helpers ----------

function unfoldLines(text) {
  const rawLines = text.split(/\r?\n/);
  const lines = [];
  for (const line of rawLines) {
    if (!line) continue;
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      }
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseICalDate(str) {
  if (!str) return null;
  const m = str.match(
    /^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2}))?(Z)?$/
  );
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hasTime = !!m[4];
  const hour = hasTime ? Number(m[5]) : 0;
  const min = hasTime ? Number(m[6]) : 0;
  const sec = hasTime ? Number(m[7]) : 0;
  const isUTC = !!m[8];

  if (isUTC) {
    return new Date(Date.UTC(year, month, day, hour, min, sec));
  }
  return new Date(year, month, day, hour, min, sec);
}

function formatTime(dt) {
  if (!dt) return '';
  return dt.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDayHeading(dt) {
  return dt.toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function dateKey(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseICS(text) {
  const lines = unfoldLines(text);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;

    const prop = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name] = prop.split(';');

    if (name === 'SUMMARY') {
      current.summary = value;
    } else if (name === 'DESCRIPTION') {
      current.description = value;
    } else if (name === 'LOCATION') {
      current.location = value;
    } else if (name.startsWith('DTSTART')) {
      current.startRaw = value;
      current.startDate = parseICalDate(value);
    } else if (name.startsWith('DTEND')) {
      current.endRaw = value;
      current.endDate = parseICalDate(value);
    }
  }

  return events;
}

// ---------- Date helpers voor week/maand ----------

function cloneDate(d) {
  return new Date(d.getTime());
}

function startOfWeek(date) {
  const d = cloneDate(date);
  const day = d.getDay(); // 0 = zondag, 1 = maandag, ...
  const diff = day === 0 ? -6 : 1 - day; // maandag als start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = cloneDate(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMonth(date) {
  const d = cloneDate(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date) {
  const d = startOfMonth(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // laatste dag vorige maand
  d.setHours(23, 59, 59, 999);
  return d;
}

// ISO-weeknummer (NL-stijl)
function getIsoWeek(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

// ---------- Fetch via Vercel proxy ----------

async function fetchEventsFromConfig(config) {
  if (!config.url) return [];

  const proxiedUrl = `/api/ical-proxy?url=${encodeURIComponent(config.url)}`;

  const res = await fetch(proxiedUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const text = await res.text();
  const events = parseICS(text);

  return events
    .filter(ev => ev.startDate)
    .map(ev => ({
      cfg: config,
      calendarName: config.naam || 'Kalender',
      ev
    }));
}

// ---------- Views: Agenda / Week / Maand ----------

function renderAgendaView(items) {
  if (!items.length) {
    return '<p class="ev-meta">Geen events gevonden.</p>';
  }

  items.sort((a, b) => {
    const ta = a.ev.startDate ? a.ev.startDate.getTime() : 0;
    const tb = b.ev.startDate ? b.ev.startDate.getTime() : 0;
    return ta - tb;
  });

  const byDay = new Map();
  for (const item of items) {
    const key = dateKey(item.ev.startDate);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(item);
  }

  const dayKeys = Array.from(byDay.keys()).sort();

  const sections = dayKeys.map(key => {
    const dayItems = byDay.get(key);
    const dayDate = dayItems[0].ev.startDate;
    const heading = formatDayHeading(dayDate);

    const rows = dayItems
      .map(({ ev, cfg, calendarName }) => {
        const f = cfg.fields || {};
        const parts = [];

        if (f.start && ev.startDate) {
          let timeRange = formatTime(ev.startDate);
          if (f.end && ev.endDate) {
            timeRange += ` – ${formatTime(ev.endDate)}`;
          }
          parts.push(
            `<div class="agenda-time">${escapeHtml(timeRange)}</div>`
          );
        }

        if (f.summary && ev.summary) {
          parts.push(
            `<div class="agenda-title">${escapeHtml(ev.summary)}</div>`
          );
        }

        parts.push(
          `<div class="agenda-cal-tag">${escapeHtml(calendarName)}</div>`
        );

        if (f.location && ev.location) {
          parts.push(
            `<div class="agenda-location">${escapeHtml(
              ev.location
            )}</div>`
          );
        }

        if (f.description && ev.description) {
          parts.push(
            `<div class="agenda-description">${escapeHtml(
              ev.description
            )}</div>`
          );
        }

        return `<div class="agenda-item">${parts.join('')}</div>`;
      })
      .join('');

    return `
      <section class="agenda-day">
        <h2 class="agenda-day-header">${escapeHtml(heading)}</h2>
        <div class="agenda-day-items">
          ${rows}
        </div>
      </section>
    `;
  });

  return sections.join('');
}

function renderWeekView(items, refDate) {
  const start = startOfWeek(refDate);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(start, i);
    const key = dateKey(dayDate);
    const dayItems = items
      .filter(x => dateKey(x.ev.startDate) === key)
      .sort((a, b) => a.ev.startDate - b.ev.startDate);

    days.push({ date: dayDate, items: dayItems });
  }

  const weekdayLabels = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  const weekNo = getIsoWeek(start);
  const weekTitle = `<p class="info info-range">Week ${weekNo}</p>`;

  const cols = days
    .map((day, idx) => {
      const label = weekdayLabels[idx];
      const dateLabel = day.date.toLocaleDateString('nl-NL', {
        day: '2-digit',
        month: '2-digit'
      });

      const evHtml = day.items
        .map(({ ev, cfg, calendarName }) => {
          const f = cfg.fields || {};
          const parts = [];

          if (f.start && ev.startDate) {
            let timeRange = formatTime(ev.startDate);
            if (f.end && ev.endDate) {
              timeRange += `–${formatTime(ev.endDate)}`;
            }
            parts.push(
              `<div class="week-event-time">${escapeHtml(timeRange)}</div>`
            );
          }

          if (f.summary && ev.summary) {
            parts.push(
              `<div class="week-event-title">${escapeHtml(
                ev.summary
              )}</div>`
            );
          }

          parts.push(
            `<div class="week-event-cal">${escapeHtml(calendarName)}</div>`
          );

          return `<div class="week-event">${parts.join('')}</div>`;
        })
        .join('');

      return `
        <div class="week-day-col">
          <div class="week-day-label">${escapeHtml(label)}</div>
          <div class="week-day-date">${escapeHtml(dateLabel)}</div>
          ${evHtml || '<div class="week-event-cal">—</div>'}
        </div>
      `;
    })
    .join('');

  return `${weekTitle}<div class="week-grid">${cols}</div>`;
}

function renderMonthView(items, refDate) {
  const startMonth = startOfMonth(refDate);
  const endMonthDate = endOfMonth(refDate);

  const gridStart = startOfWeek(startMonth);
  const gridEnd = addDays(startOfWeek(endMonthDate), 6);

  const days = [];
  let cursor = cloneDate(gridStart);
  while (cursor <= gridEnd) {
    days.push(cloneDate(cursor));
    cursor = addDays(cursor, 1);
  }

  const weekdayLabels = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

  const headerRow = weekdayLabels
    .map(label => `<div class="month-weekday-header">${label}</div>`)
    .join('');

  const cells = days
    .map(dayDate => {
      const inMonth =
        dayDate.getMonth() === refDate.getMonth() &&
        dayDate.getFullYear() === refDate.getFullYear();

      const key = dateKey(dayDate);
      const dayItems = items
        .filter(x => dateKey(x.ev.startDate) === key)
        .sort((a, b) => a.ev.startDate - b.ev.startDate);

      const dayNum = dayDate.getDate();

      const evHtml = dayItems
        .slice(0, 3)
        .map(({ ev, cfg }) => {
          const f = cfg.fields || {};
          const pieces = [];

          if (f.start && ev.startDate) {
            let timeRange = formatTime(ev.startDate);
            if (f.end && ev.endDate) {
              timeRange += `–${formatTime(ev.endDate)}`;
            }
            pieces.push(
              `<span class="month-event-time">${escapeHtml(
                timeRange
              )}</span>`
            );
          }

          if (f.summary && ev.summary) {
            pieces.push(
              `<span class="month-event-title">${escapeHtml(
                ev.summary
              )}</span>`
            );
          }

          return `<div class="month-event">${pieces.join(' ')}</div>`;
        })
        .join('');

      const extra =
        dayItems.length > 3
          ? `<div class="month-event">+${dayItems.length - 3} meer…</div>`
          : '';

      return `
        <div class="month-cell ${inMonth ? '' : 'month-cell-outside'}">
          <div class="month-day-number">${dayNum}</div>
          ${evHtml || ''}
          ${extra}
        </div>
      `;
    })
    .join('');

  return `<div class="month-grid">
    ${headerRow}
    ${cells}
  </div>`;
}

// ---------- View switching & range label ----------

function updateRangeLabel() {
  const el = document.getElementById('current-range-label');
  if (!el) return;

  if (currentView === 'agenda') {
    el.textContent = 'Alle events gecombineerd (op datum gesorteerd).';
    return;
  }

  if (currentView === 'week') {
    const start = startOfWeek(referenceDate);
    const end = addDays(start, 6);
    const startLabel = start.toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const endLabel = end.toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const weekNo = getIsoWeek(start);
    el.textContent = `Week ${weekNo}: ${startLabel} t/m ${endLabel}`;
    return;
  }

  if (currentView === 'month') {
    const label = referenceDate.toLocaleDateString('nl-NL', {
      month: 'long',
      year: 'numeric'
    });
    el.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    return;
  }
}

function renderCurrentView() {
  const container = document.getElementById('events-container');
  if (!container) return;

  let html = '';

  if (loadErrors.length) {
    html += `<div class="error">${loadErrors
      .map(escapeHtml)
      .join('<br>')}</div>`;
  }

  if (!allEvents.length) {
    html += '<p class="ev-meta">Geen events gevonden in de beschikbare kalenders.</p>';
    container.innerHTML = html;
    updateRangeLabel();
    return;
  }

  if (currentView === 'agenda') {
    html += renderAgendaView([...allEvents]);
  } else if (currentView === 'week') {
    html += renderWeekView([...allEvents], referenceDate);
  } else if (currentView === 'month') {
    html += renderMonthView([...allEvents], referenceDate);
  }

  container.innerHTML = html;
  updateRangeLabel();
}

function setView(view) {
  currentView = view;
  if (view === 'week' || view === 'month') {
    referenceDate = new Date();
  }

  const views = ['agenda', 'week', 'month'];
  views.forEach(v => {
    const btn = document.getElementById(`view-${v}`);
    if (btn) {
      btn.classList.toggle('is-active', v === view);
    }
  });

  renderCurrentView();
}

function shiftReference(direction) {
  if (currentView === 'week') {
    referenceDate = addDays(referenceDate, direction * 7);
  } else if (currentView === 'month') {
    const d = cloneDate(referenceDate);
    d.setMonth(d.getMonth() + direction);
    referenceDate = d;
  } else {
    return;
  }
  renderCurrentView();
}

// ---------- Init ----------

async function initOverview() {
  const container = document.getElementById('events-container');
  container.textContent = 'Agenda’s worden geladen…';

  try {
    const configs = await loadConfigs();

    if (!configs.length) {
      container.innerHTML =
        '<p class="error">Er zijn nog geen iCal-links geconfigureerd. Ga eerst naar de iCal Admin-pagina.</p>';
      return;
    }

    allEvents = [];
    loadErrors = [];

    for (const cfg of configs) {
      try {
        const items = await fetchEventsFromConfig(cfg);
        allEvents.push(...items);
      } catch (err) {
        console.error('Fout bij laden iCal', cfg, err);
        loadErrors.push(
          `Kon iCal van "${cfg.naam || 'Kalender'}" niet laden: ${
            err.message || 'onbekende fout'
          }`
        );
      }
    }

    setView('agenda');

    document
      .getElementById('view-agenda')
      ?.addEventListener('click', () => setView('agenda'));
    document
      .getElementById('view-week')
      ?.addEventListener('click', () => setView('week'));
    document
      .getElementById('view-month')
      ?.addEventListener('click', () => setView('month'));

    document
      .getElementById('nav-prev')
      ?.addEventListener('click', () => shiftReference(-1));
    document
      .getElementById('nav-next')
      ?.addEventListener('click', () => shiftReference(1));
    document
      .getElementById('nav-today')
      ?.addEventListener('click', () => {
        referenceDate = new Date();
        renderCurrentView();
      });
  } catch (err) {
    console.error('Fout bij loadConfigs', err);
    container.innerHTML =
      '<p class="error">Kon de iCal-config niet laden uit de database.</p>';
  }
}

document.addEventListener('DOMContentLoaded', initOverview);
