// js/admin.js

const STORAGE_KEY = 'ical_links_config_v1';

function loadLinks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Kan iCal-config niet laden', e);
    return [];
  }
}

function saveLinks(links) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

function createId() {
  return 'ical-' + Math.random().toString(36).slice(2, 10);
}

function renderLinks() {
  const container = document.getElementById('links-container');
  const links = loadLinks();

  if (!links.length) {
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

  const rows = links
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
            <label><input type="checkbox" data-field="summary" ${f.summary !== false ? 'checked' : ''}> Titel</label>
            <label><input type="checkbox" data-field="description" ${f.description ? 'checked' : ''}> Omschrijving</label>
            <label><input type="checkbox" data-field="location" ${f.location !== false ? 'checked' : ''}> Locatie</label>
            <label><input type="checkbox" data-field="start" ${f.start !== false ? 'checked' : ''}> Starttijd</label>
            <label><input type="checkbox" data-field="end" ${f.end !== false ? 'checked' : ''}> Eindtijd</label>
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

  attachRowEvents();
}

function attachRowEvents() {
  const container = document.getElementById('links-container');
  const links = loadLinks();

  container.querySelectorAll('tr[data-id]').forEach(row => {
    const id = row.getAttribute('data-id');
    const linkIdx = links.findIndex(l => l.id === id);
    if (linkIdx === -1) return;

    // Opslaan
    row.querySelector('.btn-save')?.addEventListener('click', () => {
      const updated = { ...links[linkIdx] };
      const nameInput = row.querySelector('input[data-field="naam"]');
      const urlInput = row.querySelector('input[data-field="url"]');

      updated.naam = nameInput.value.trim();
      updated.url = urlInput.value.trim();

      const fields = updated.fields || {};
      ['summary', 'description', 'location', 'start', 'end'].forEach(key => {
        const cb = row.querySelector(
          `input[type="checkbox"][data-field="${key}"]`
        );
        if (cb) fields[key] = cb.checked;
      });
      updated.fields = fields;

      links[linkIdx] = updated;
      saveLinks(links);
      alert('Opgeslagen 👍');
    });

    // Verwijderen
    row.querySelector('.btn-delete')?.addEventListener('click', () => {
      if (!confirm('Deze iCal-link verwijderen?')) return;
      const newLinks = links.filter(l => l.id !== id);
      saveLinks(newLinks);
      renderLinks();
    });

    // Kopieer iCal-link
    row.querySelector('.btn-copy')?.addEventListener('click', async () => {
      const url = links[linkIdx].url || '';
      if (!url) {
        alert('Geen URL ingesteld voor deze link.');
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        alert('iCal-link gekopieerd naar klembord 📋');
      } catch (e) {
        console.error(e);
        alert(
          'Kon niet naar klembord kopiëren, selecteer de link handmatig.'
        );
      }
    });
  });
}

function handleAddLink() {
  const nameInput = document.getElementById('new-name');
  const urlInput = document.getElementById('new-url');
  const naam = nameInput.value.trim();
  const url = urlInput.value.trim();

  if (!naam || !url) {
    alert('Vul zowel een naam als een iCal-URL in.');
    return;
  }

  const links = loadLinks();
  links.push({
    id: createId(),
    naam,
    url,
    fields: {
      summary: true,
      description: true,
      location: true,
      start: true,
      end: true
    }
  });
  saveLinks(links);

  nameInput.value = '';
  urlInput.value = '';
  renderLinks();
}

document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('add-link')
    ?.addEventListener('click', handleAddLink);
  renderLinks();
});
