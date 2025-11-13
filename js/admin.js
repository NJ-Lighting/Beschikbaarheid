// js/admin.js
import { supabase } from './supabase.client.js';

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

async function loadLinks() {
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

function renderLinksTable(configs) {
  const container = document.getElementById('links-container');

  if (!configs.length) {
    container.innerHTML = '<p class="no-links">Nog geen iCal-links toegevoegd.</p>';
    return;
  }

  const headerRow = `
    <tr>
      <th style="width: 18%;">Naam</th>
      <th style="width: 32%;">iCal-URL</th>
      <th style="width: 30%;">Zichtbare info</th>
      <th style="width: 20%;">Acties</th>
    </tr>`;

  const rows = configs
    .map(link => {
      const f = link.fields || {};
      return `
        <tr data-id="${link.id}">
          <td>
            <input
              type="text"
              class="small-input"
              value="${link.naam || ''}"
              data-field="naam"
            />
          </td>
          <td>
            <input
              type="url"
              class="small-input"
              value="${link.url || ''}"
              data-field="url"
            />
          </td>
          <td class="field-checkboxes">
            <label><input type="checkbox" data-field="summary" ${f.summary ? 'checked' : ''}> Titel</label>
            <label><input type="checkbox" data-field="description" ${f.description ? 'checked' : ''}> Omschrijving</label>
            <label><input type="checkbox" data-field="location" ${f.location ? 'checked' : ''}> Locatie</label>
            <label><input type="checkbox" data-field="start" ${f.start ? 'checked' : ''}> Starttijd</label>
            <label><input type="checkbox" data-field="end" ${f.end ? 'checked' : ''}> Eindtijd</label>
          </td>
          <td>
            <button class="btn btn-secondary btn-copy">Kopieer iCal-link</button><br>
            <button class="btn btn-secondary btn-save">Opslaan</button>
            <button class="btn btn-danger btn-delete">Verwijderen</button>
          </td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <table class="links-table">
      <thead>${headerRow}</thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  attachRowEvents(configs);
}

function attachRowEvents(configs) {
  const container = document.getElementById('links-container');

  container.querySelectorAll('tr[data-id]').forEach(row => {
    const id = row.getAttribute('data-id');
    const link = configs.find(l => l.id === id);
    if (!link) return;

    // Opslaan
    row.querySelector('.btn-save')?.addEventListener('click', async () => {
      const nameInput = row.querySelector('input[data-field="naam"]');
      const urlInput = row.querySelector('input[data-field="url"]');

      const naam = nameInput.value.trim();
      const url = urlInput.value.trim();

      const fields = {};
      ['summary', 'description', 'location', 'start', 'end'].forEach(key => {
        const cb = row.querySelector(
          `input[type="checkbox"][data-field="${key}"]`
        );
        fields[key] = cb ? cb.checked : false;
      });

      const { error } = await supabase
        .from('ical_sources')
        .update({
          name: naam,
          url,
          show_summary: fields.summary,
          show_description: fields.description,
          show_location: fields.location,
          show_start: fields.start,
          show_end: fields.end
        })
        .eq('id', id);

      if (error) {
        console.error('Supabase update error', error);
        alert('Opslaan mislukt 😢');
      } else {
        alert('Opgeslagen 👍');
      }
    });

    // Verwijderen
    row.querySelector('.btn-delete')?.addEventListener('click', async () => {
      if (!confirm('Deze iCal-link verwijderen?')) return;

      const { error } = await supabase
        .from('ical_sources')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase delete error', error);
        alert('Verwijderen mislukt 😢');
      } else {
        await refreshLinks();
      }
    });

    // Kopieer iCal-link
    row.querySelector('.btn-copy')?.addEventListener('click', async () => {
      const url = link.url || '';
      if (!url) {
        alert('Geen URL ingesteld voor deze link.');
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        alert('iCal-link gekopieerd naar klembord 📋');
      } catch (e) {
        console.error(e);
        alert('Kon niet naar klembord kopiëren, selecteer de link handmatig.');
      }
    });
  });
}

async function handleAddLink() {
  const nameInput = document.getElementById('new-name');
  const urlInput = document.getElementById('new-url');
  const naam = nameInput.value.trim();
  const url = urlInput.value.trim();

  if (!naam || !url) {
    alert('Vul zowel een naam als een iCal-URL in.');
    return;
  }

  const { error } = await supabase.from('ical_sources').insert({
    name: naam,
    url,
    show_summary: true,
    show_description: true,
    show_location: true,
    show_start: true,
    show_end: true
  });

  if (error) {
    console.error('Supabase insert error', error);
    alert('Toevoegen mislukt 😢');
    return;
  }

  nameInput.value = '';
  urlInput.value = '';
  await refreshLinks();
}

async function refreshLinks() {
  const configs = await loadLinks();
  renderLinksTable(configs);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-link')?.addEventListener('click', handleAddLink);
  refreshLinks();
});
