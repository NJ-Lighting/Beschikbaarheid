// js/admin.js
import { supabase } from './supabase.client.js';

function $(sel) {
  return document.querySelector(sel);
}

function setMessage(text, isError = false) {
  const el = $('#admin-message');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('error', !!isError);
}

// ---- Google embed / ID → ICS helper ----

function buildGoogleIcsUrl(raw) {
  if (!raw) return null;
  raw = raw.trim();

  // Als het al een ICS-link is → direct teruggeven
  if (raw.startsWith('http') && raw.includes('/calendar/ical/')) {
    return raw;
  }

  // Volledige Google-URL (embed etc.)
  let calendarId = null;
  if (raw.startsWith('http')) {
    try {
      const url = new URL(raw);
      if (
        url.hostname === 'calendar.google.com' &&
        url.pathname.startsWith('/calendar/embed')
      ) {
        const src = url.searchParams.get('src');
        if (src) {
          calendarId = src;
        }
      }
    } catch (e) {
      console.warn('Kon Google-URL niet parsen', e);
    }
  }

  // Als het geen URL is, behandelen als direct Calendar ID
  if (!calendarId && !raw.startsWith('http')) {
    calendarId = raw;
  }

  if (!calendarId) {
    return null;
  }

  const enc = encodeURIComponent(calendarId);
  return `https://calendar.google.com/calendar/ical/${enc}/public/basic.ics`;
}

// ---- Supabase helpers ----

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    show_summary: !!row.show_summary,
    show_description: !!row.show_description,
    show_location: !!row.show_location,
    show_start: !!row.show_start,
    show_end: !!row.show_end
  };
}

async function loadSources() {
  const { data, error } = await supabase
    .from('ical_sources')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Supabase load error', error);
    throw error;
  }
  return data.map(mapRow);
}

// ⬇️ Hier vereenvoudigen we insert / update (geen select() meer)

async function insertSource(payload) {
  const { error } = await supabase.from('ical_sources').insert(payload);
  if (error) {
    console.error('Insert error', error);
    throw error;
  }
}

async function updateSource(id, payload) {
  const { error } = await supabase
    .from('ical_sources')
    .update(payload)
    .eq('id', id);

  if (error) {
    console.error('Update error', error);
    throw error;
  }
}

async function deleteSource(id) {
  const { error } = await supabase
    .from('ical_sources')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete error', error);
    throw error;
  }
}

// ---- Render overview ----

async function renderSources() {
  const container = $('#links-container');
  if (!container) return;

  container.innerHTML = '<p class="loading">Laden van bronnen…</p>';

  try {
    const sources = await loadSources();

    if (!sources.length) {
      container.innerHTML =
        '<p class="no-links">Er zijn nog geen agenda-bronnen. Voeg er hierboven één toe.</p>';
      return;
    }

    const rows = sources
      .map(src => {
        const fields = [];
        if (src.show_summary) fields.push('Titel');
        if (src.show_description) fields.push('Omschrijving');
        if (src.show_location) fields.push('Locatie');
        if (src.show_start) fields.push('Start');
        if (src.show_end) fields.push('Einde');

        const fieldsText = fields.length ? fields.join(', ') : '—';

        return `
          <tr data-id="${src.id}">
            <td>${escapeHtml(src.name || '')}</td>
            <td>
              <span class="small-url">${escapeHtml(src.url || '')}</span>
            </td>
            <td>${escapeHtml(fieldsText)}</td>
            <td>
              <button class="btn btn-secondary btn-edit" type="button">Bewerken</button>
              <button class="btn btn-danger btn-delete" type="button">Verwijderen</button>
            </td>
          </tr>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="links-table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>URL</th>
              <th>Zichtbare velden</th>
              <th>Acties</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const id = tr?.getAttribute('data-id');
        if (!id) return;
        const src = sources.find(s => String(s.id) === String(id));
        if (src) fillFormForEdit(src);
      });
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const id = tr?.getAttribute('data-id');
        if (!id) return;
        const ok = confirm(
          'Weet je zeker dat je deze agenda-bron wilt verwijderen?'
        );
        if (!ok) return;
        try {
          await deleteSource(id);
          setMessage('Agenda-bron verwijderd.');
          renderSources();
        } catch (err) {
          console.error('Delete error (outer)', err);
          setMessage(
            `Kon agenda-bron niet verwijderen: ${err.message || 'onbekende fout'}`,
            true
          );
        }
      });
    });
  } catch (err) {
    console.error('renderSources error', err);
    container.innerHTML =
      '<p class="error">Kon de iCal-bronnen niet laden uit de database.</p>';
  }
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- Form helpers ----

function resetForm() {
  $('#editing-id').value = '';
  $('#ical-name').value = '';
  $('#ical-url').value = '';
  $('#gcal-raw').value = '';
  $('#field-summary').checked = true;
  $('#field-description').checked = false;
  $('#field-location').checked = true;
  $('#field-start').checked = true;
  $('#field-end').checked = true;
  setMessage('');
}

function fillFormForEdit(src) {
  $('#editing-id').value = src.id;
  $('#ical-name').value = src.name || '';
  $('#ical-url').value = src.url || '';
  $('#gcal-raw').value = '';
  $('#field-summary').checked = !!src.show_summary;
  $('#field-description').checked = !!src.show_description;
  $('#field-location').checked = !!src.show_location;
  $('#field-start').checked = !!src.show_start;
  $('#field-end').checked = !!src.show_end;
  setMessage(`Bewerken: ${src.name || '(naamloos)'}`);
}

// ---- Init ----

async function initAdmin() {
  resetForm();
  renderSources();

  $('#save-source')?.addEventListener('click', async () => {
    const id = $('#editing-id').value || null;
    const name = $('#ical-name').value.trim();
    const url = $('#ical-url').value.trim();

    if (!name || !url) {
      setMessage('Naam en iCal-URL zijn verplicht.', true);
      return;
    }

    const payload = {
      name,
      url,
      show_summary: $('#field-summary').checked,
      show_description: $('#field-description').checked,
      show_location: $('#field-location').checked,
      show_start: $('#field-start').checked,
      show_end: $('#field-end').checked
    };

    try {
      if (id) {
        await updateSource(id, payload);
        setMessage('Agenda-bron bijgewerkt.');
      } else {
        await insertSource(payload);
        setMessage('Agenda-bron toegevoegd.');
      }
      resetForm();
      renderSources();
    } catch (err) {
      console.error('Save error', err);
      setMessage(
        `Fout bij opslaan van agenda-bron: ${err.message || 'onbekende fout'}`,
        true
      );
    }
  });

  $('#reset-form')?.addEventListener('click', () => {
    resetForm();
  });

  // Google embed/ID → ICS
  $('#gcal-convert')?.addEventListener('click', () => {
    const raw = $('#gcal-raw').value.trim();
    if (!raw) {
      setMessage('Plak eerst een Google embed-URL of Calendar ID.', true);
      return;
    }
    const ics = buildGoogleIcsUrl(raw);
    if (!ics) {
      setMessage(
        'Kon hier geen geldige Google Calendar-ID uithalen. Plak de embed-URL of het Calendar ID.',
        true
      );
      return;
    }
    $('#ical-url').value = ics;
    setMessage('iCal-URL gegenereerd uit Google embed / ID.');
  });
}

document.addEventListener('DOMContentLoaded', initAdmin);
