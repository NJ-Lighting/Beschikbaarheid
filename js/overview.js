// js/overview.js

const STORAGE_KEY_OV = 'ical_links_config_v1';

function loadConfigs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OV);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Kan iCal-config niet laden', e);
    return [];
  }
}

// ICS helpers

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
  const m =
    str.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
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

function formatDateTime(dt) {
  if (!dt) return '';
  return dt.toLocaleString('nl-NL', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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

async function fetchEventsFromConfig(config) {
  if (!config.url) return [];
  const res = await fetch(config.url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  const events = parseICS(text);

  events.sort((a, b) => {
    const ta = a.startDate ? a.startDate.getTime() : 0;
    const tb = b.startDate ? b.startDate.getTime() : 0;
    return ta - tb;
  });

  return events;
}

function renderEvent(ev, cfg) {
  const f = cfg.fields || {};
  const parts = [];

  if (f.summary !== false && ev.summary) {
    parts.push(
      `<div class="ev-title">${escapeHtml(ev.summary)}</div>`
    );
  }

  const metaPieces = [];
  if (f.start !== false && ev.startDate) {
    metaPieces.push(`Start: ${escapeHtml(formatDateTime(ev.startDate))}`);
  }
  if (f.end !== false && ev.endDate) {
    metaPieces.push(`Einde: ${escapeHtml(formatDateTime(ev.endDate))}`);
  }

  if (metaPieces.length) {
    parts.push(`<div class="ev-meta">${metaPieces.join(' • ')}</div>`);
  }

  if (f.location !== false && ev.location) {
    parts.push(
      `<div class="ev-location">Locatie: ${escapeHtml(ev.location)}</div>`
    );
  }

  if (f.description && ev.description) {
    parts.push(
      `<div class="ev-description">${escapeHtml(ev.description)}</div>`
    );
  }

  if (!parts.length) {
    parts.push(
      '<div class="ev-meta">Geen zichtbare velden voor dit item.</div>'
    );
  }

  return `<div class="event">${parts.join('')}</div>`;
}

async function initOverview() {
  const container = document.getElementById('events-container');
  const configs = loadConfigs();

  if (!configs.length) {
    container.innerHTML =
      '<p class="error">Er zijn nog geen iCal-links geconfigureerd. Ga eerst naar de iCal Admin-pagina.</p>';
    return;
  }

  container.textContent = 'Agenda’s worden geladen…';

  const sections = [];

  for (const cfg of configs) {
    const name = cfg.naam || 'Kalender';
    try {
      const events = await fetchEventsFromConfig(cfg);
      const eventsHtml = events.length
        ? events.map(ev => renderEvent(ev, cfg)).join('')
        : '<p class="ev-meta">Geen events gevonden in deze iCal.</p>';

      sections.push(`
        <section class="calendar">
          <h2>${escapeHtml(name)}</h2>
          ${eventsHtml}
        </section>
      `);
    } catch (err) {
      console.error('Fout bij laden iCal', cfg, err);
      sections.push(`
        <section class="calendar">
          <h2>${escapeHtml(name)}</h2>
          <p class="error">Kon deze iCal niet laden (${escapeHtml(
            err.message || 'onbekende fout'
          )}).</p>
        </section>
      `);
    }
  }

  container.innerHTML = sections.join('');
}

document.addEventListener('DOMContentLoaded', initOverview);
