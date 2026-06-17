const API_URL = 'https://www.raydelto.org/agenda.php';
const STORAGE_KEY = 'nexus_agenda_state_v1';

let allContacts = [];
let editingId = null;

let appState = {
  localContacts: [],
  updatedContacts: {},
  deletedIds: [],
  cachedApiContacts: []
};

const palettes = [
  ['#6C63FF', '#A78BFA'],
  ['#EC4899', '#F472B6'],
  ['#10B981', '#34D399'],
  ['#F59E0B', '#FCD34D'],
  ['#3B82F6', '#93C5FD'],
  ['#EF4444', '#F87171'],
  ['#8B5CF6', '#C4B5FD'],
  ['#14B8A6', '#5EEAD4'],
  ['#F97316', '#FED7AA'],
  ['#06B6D4', '#67E8F9']
];

function getEl(id) {
  return document.getElementById(id);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function hashText(value) {
  let hash = 0;
  const text = normalizeText(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function contactSignature(contact) {
  return normalizeText(`${contact.nombre}|${contact.apellido}|${contact.telefono}`);
}

function makeContact(rawContact, source = 'api') {
  const nombre = String(rawContact.nombre || '').trim();
  const apellido = String(rawContact.apellido || '').trim();
  const telefono = String(rawContact.telefono || '').trim();
  const signature = contactSignature({ nombre, apellido, telefono });
  const id = rawContact.id || `${source}-${hashText(signature)}`;

  return {
    id,
    source,
    nombre,
    apellido,
    telefono,
    createdAt: rawContact.createdAt || Date.now()
  };
}

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      appState = {
        localContacts: Array.isArray(saved.localContacts) ? saved.localContacts : [],
        updatedContacts: saved.updatedContacts || {},
        deletedIds: Array.isArray(saved.deletedIds) ? saved.deletedIds : [],
        cachedApiContacts: Array.isArray(saved.cachedApiContacts) ? saved.cachedApiContacts : []
      };
    }
  } catch (error) {
    console.warn('No se pudo leer localStorage:', error);
  }
}

function persistLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function avatarStyle(nombre) {
  const code = (nombre || 'A').charCodeAt(0);
  const [a, b] = palettes[code % palettes.length];
  return `background: linear-gradient(135deg, ${a}, ${b}); color: #fff;`;
}

function initials(nombre, apellido) {
  return ((nombre?.[0] || '') + (apellido?.[0] || '')).toUpperCase() || '?';
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function iconButton(name, iconPath) {
  return `
    <button class="card-action" type="button" data-action="${name}" aria-label="${name}" title="${name}">
      <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        ${iconPath}
      </svg>
    </button>
  `;
}

function mergeContacts(apiContacts) {
  const deleted = new Set(appState.deletedIds);
  const signatures = new Set();
  const merged = [];

  apiContacts.forEach((contact) => {
    if (deleted.has(contact.id)) return;

    const updated = appState.updatedContacts[contact.id];
    const finalContact = updated ? { ...contact, ...updated, id: contact.id, source: contact.source } : contact;
    signatures.add(contactSignature(finalContact));
    merged.push(finalContact);
  });

  appState.localContacts.forEach((contact) => {
    if (deleted.has(contact.id)) return;
    if (signatures.has(contactSignature(contact))) return;
    signatures.add(contactSignature(contact));
    merged.unshift(contact);
  });

  return merged;
}

function updateStats(list) {
  getEl('statTotal').textContent = allContacts.length;
  getEl('statVisible').textContent = list.length;
}

function renderContacts(list) {
  const container = getEl('contactList');
  container.innerHTML = '';
  updateStats(list);

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="big-icon">Sin resultados</div>
        <p>No se encontraron contactos.</p>
      </div>`;
    return;
  }

  list.forEach((contacto, index) => {
    const card = document.createElement('article');
    card.className = 'contact-card';
    card.dataset.id = contacto.id;
    card.style.animationDelay = `${Math.min(index * 35, 350)}ms`;
    card.innerHTML = `
      <div class="avatar" style="${avatarStyle(contacto.nombre)}">${initials(contacto.nombre, contacto.apellido)}</div>
      <div class="contact-info">
        <div class="contact-name">${esc(contacto.nombre)} ${esc(contacto.apellido)}</div>
        <div class="contact-phone">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.09 3h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11l-1.25 1.27a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
          ${esc(contacto.telefono)}
        </div>
      </div>
      <div class="contact-actions">
        ${iconButton('editar', '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>')}
        ${iconButton('eliminar', '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path>')}
      </div>`;
    container.appendChild(card);
  });
}

function filterContacts() {
  const query = normalizeText(getEl('searchInput').value);
  const filtered = allContacts.filter((contact) =>
    normalizeText(`${contact.nombre} ${contact.apellido} ${contact.telefono}`).includes(query)
  );
  renderContacts(filtered);
}

function updatePreview() {
  const nombre = getEl('fNombre').value.trim();
  const apellido = getEl('fApellido').value.trim();
  const telefono = getEl('fTelefono').value.trim();
  const avatar = getEl('prevAvatar');

  avatar.textContent = initials(nombre, apellido);
  avatar.style.cssText = avatarStyle(nombre || 'A');
  getEl('prevName').textContent = `${nombre || 'Nombre'} ${apellido || 'Apellido'}`;
  getEl('prevPhone').textContent = telefono || 'Telefono';
}

function setLoading(isLoading, label = 'Guardando') {
  const btn = getEl('btnSave');
  const btnInner = getEl('btnInner');
  btn.disabled = isLoading;

  if (isLoading) {
    btnInner.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" class="spin-icon">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
      </svg>
      ${label}`;
    return;
  }

  btnInner.innerHTML = editingId ? `
    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5"></path>
    </svg>
    Actualizar contacto` : `
    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14"></path>
    </svg>
    Guardar contacto`;
}

function showToast(message, type = 'success') {
  const toast = getEl('toast');
  toast.textContent = message;
  toast.className = `show ${type}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.className = '';
  }, 3200);
}

function validateForm() {
  const fields = [
    { inputId: 'fNombre', errorId: 'eNombre', value: getEl('fNombre').value.trim() },
    { inputId: 'fApellido', errorId: 'eApellido', value: getEl('fApellido').value.trim() },
    { inputId: 'fTelefono', errorId: 'eTelefono', value: getEl('fTelefono').value.trim() }
  ];

  let isValid = true;

  fields.forEach(({ inputId, errorId, value }) => {
    const input = getEl(inputId);
    const error = getEl(errorId);
    const hasError = !value;

    input.classList.toggle('error', hasError);
    error.classList.toggle('show', hasError);
    if (hasError) isValid = false;
  });

  return isValid;
}

function getFormContact() {
  return {
    nombre: getEl('fNombre').value.trim(),
    apellido: getEl('fApellido').value.trim(),
    telefono: getEl('fTelefono').value.trim()
  };
}

async function fetchApiContacts() {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(`GET ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('La API no devolvio una lista valida');
  }

  return data.map((contact) => makeContact(contact, 'api'));
}

async function postApiContact(contact) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact)
  });

  if (!response.ok) {
    throw new Error(`POST ${response.status}`);
  }
}

async function loadContacts({ silent = false } = {}) {
  try {
    const apiContacts = await fetchApiContacts();
    appState.cachedApiContacts = apiContacts;
    allContacts = mergeContacts(apiContacts);
    persistLocalState();
    filterContacts();
    if (!silent) showToast('Contactos actualizados', 'success');
  } catch (error) {
    console.error('Error al cargar contactos:', error);
    allContacts = mergeContacts(appState.cachedApiContacts);
    filterContacts();

    if (!allContacts.length) {
      getEl('contactList').innerHTML = `
        <div class="empty-state">
          <div class="big-icon">Sin conexion</div>
          <p>No se pudo conectar al servidor.</p>
        </div>`;
      updateStats([]);
    }

    if (!silent) showToast('Usando datos guardados localmente', 'error');
  }
}

function resetForm() {
  editingId = null;
  getEl('contactForm').reset();
  getEl('formMode').textContent = 'Nuevo contacto';
  getEl('btnCancelEdit').classList.add('hidden');
  document.querySelectorAll('input.error').forEach((input) => input.classList.remove('error'));
  document.querySelectorAll('.err-msg.show').forEach((error) => error.classList.remove('show'));
  updatePreview();
  setLoading(false);
}

function saveEditedContact(contact) {
  const index = appState.localContacts.findIndex((item) => item.id === editingId);

  if (index >= 0) {
    appState.localContacts[index] = { ...appState.localContacts[index], ...contact };
  } else {
    const original = allContacts.find((item) => item.id === editingId);
    appState.updatedContacts[editingId] = {
      ...original,
      ...contact,
      id: editingId,
      source: original?.source || 'api'
    };
  }

  persistLocalState();
  allContacts = mergeContacts(appState.cachedApiContacts);
  filterContacts();
  resetForm();
  showToast('Contacto actualizado', 'success');
}

async function saveContact(event) {
  event.preventDefault();
  if (!validateForm()) return;

  const contact = getFormContact();

  if (editingId) {
    saveEditedContact(contact);
    return;
  }

  setLoading(true, 'Guardando');

  try {
    await postApiContact(contact);
    appState.localContacts.unshift(makeContact(contact, 'local'));
    persistLocalState();
    await loadContacts({ silent: true });
    resetForm();
    showToast('Contacto guardado con exito', 'success');
  } catch (error) {
    console.error('Error al guardar en API:', error);
    appState.localContacts.unshift(makeContact(contact, 'local'));
    persistLocalState();
    allContacts = mergeContacts(appState.cachedApiContacts);
    filterContacts();
    resetForm();
    showToast('Guardado localmente; revisa tu conexion', 'error');
  } finally {
    setLoading(false);
  }
}

function editContact(id) {
  const contact = allContacts.find((item) => item.id === id);
  if (!contact) return;

  editingId = id;
  getEl('fNombre').value = contact.nombre;
  getEl('fApellido').value = contact.apellido;
  getEl('fTelefono').value = contact.telefono;
  getEl('formMode').textContent = 'Editando contacto';
  getEl('btnCancelEdit').classList.remove('hidden');
  updatePreview();
  setLoading(false);
  getEl('fNombre').focus();
}

function deleteContact(id) {
  appState.localContacts = appState.localContacts.filter((contact) => contact.id !== id);
  delete appState.updatedContacts[id];

  if (!appState.deletedIds.includes(id)) {
    appState.deletedIds.push(id);
  }

  persistLocalState();
  allContacts = mergeContacts(appState.cachedApiContacts);
  filterContacts();

  if (editingId === id) resetForm();
  showToast('Contacto eliminado de esta agenda', 'success');
}

function handleContactAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const card = button.closest('.contact-card');
  const id = card?.dataset.id;
  if (!id) return;

  if (button.dataset.action === 'editar') {
    editContact(id);
    return;
  }

  if (button.dataset.action === 'eliminar') {
    deleteContact(id);
  }
}

function clearFieldError(event) {
  const input = event.target;
  if (!input.value.trim()) return;

  input.classList.remove('error');
  const errorId = input.id.replace('f', 'e');
  getEl(errorId)?.classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  loadLocalState();

  getEl('searchInput').addEventListener('input', filterContacts);
  getEl('contactForm').addEventListener('submit', saveContact);
  getEl('btnRefresh').addEventListener('click', () => loadContacts());
  getEl('btnCancelEdit').addEventListener('click', resetForm);
  getEl('contactList').addEventListener('click', handleContactAction);

  ['fNombre', 'fApellido', 'fTelefono'].forEach((id) => {
    getEl(id).addEventListener('input', updatePreview);
    getEl(id).addEventListener('input', clearFieldError);
  });

  updatePreview();
  loadContacts({ silent: true });
});
