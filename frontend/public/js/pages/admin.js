// Admin portal — requires is_admin claim in JWT (entry module of admin.html).

import '../components/siteChrome.js';
import { apiFetch } from '../core/api.js';
import { getCurrentUser } from '../core/auth.js';
import { escapeHtml } from '../core/html.js';
import { openModal, closeModal, confirmDialog } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

const user = getCurrentUser();

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.admin-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.admin-tab-content').forEach((c) => c.classList.add('hidden'));
    document.getElementById(`tab${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`).classList.remove('hidden');
    if (tab.dataset.tab === 'users') loadUsers();
    if (tab.dataset.tab === 'organizations') loadOrgs();
  });
});

// ── Users ─────────────────────────────────────────────────────────────────────

let userPage = 0;
let userSearch = '';
let userTotal = 0;
const USER_LIMIT = 20;
const userMap = new Map();

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const showConfirm = (message) => confirmDialog(message);

// Buttons inside rendered tables/lists carry data-action (+ data-id);
// one delegated listener per container handles them.
function onAction(containerId, handlers) {
  document.getElementById(containerId).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn && !btn.disabled && handlers[btn.dataset.action]) handlers[btn.dataset.action](btn.dataset);
  });
}

document.getElementById('userSearch').addEventListener('input', debounce((e) => {
  userSearch = e.target.value.trim();
  userPage = 0;
  loadUsers();
}, 300));

async function loadUsers() {
  const tbody = document.getElementById('userTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="admin-table-empty">Laden…</td></tr>';
  try {
    const params = new URLSearchParams({ search: userSearch, page: userPage, limit: USER_LIMIT });
    const data = await apiFetch(`/admin/users?${params}`);
    userTotal = data.total;
    document.getElementById('userCount').textContent = `${data.total} gebruiker${data.total !== 1 ? 's' : ''}`;
    renderUserTable(data.users);
    renderUserPagination();
  } catch (ex) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-table-empty">${escapeHtml(ex.message)}</td></tr>`;
  }
}

function renderUserTable(users) {
  const tbody = document.getElementById('userTableBody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="admin-table-empty">Geen gebruikers gevonden.</td></tr>';
    return;
  }
  users.forEach((u) => userMap.set(u.id, u));
  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>${escapeHtml(u.name)}${u.is_admin ? ' <span class="admin-badge">admin</span>' : ''}</td>
      <td>${escapeHtml(u.email || '—')}</td>
      <td><span class="plan-badge plan-badge-${u.plan}">${u.plan}</span></td>
      <td>${u.oauth_provider ? escapeHtml(u.oauth_provider) : 'e-mail'}</td>
      <td>${u.totp_enabled ? '✓' : '—'}</td>
      <td>${new Date(u.created_at).toLocaleDateString('nl-NL')}</td>
      <td><button class="btn btn-ghost btn-sm" data-action="edit" data-id="${escapeHtml(u.id)}">Bewerken</button></td>
    </tr>
  `).join('');
}

function renderUserPagination() {
  const el = document.getElementById('userPagination');
  const totalPages = Math.ceil(userTotal / USER_LIMIT);
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn btn-ghost btn-sm" ${userPage === 0 ? 'disabled' : ''} data-action="page" data-page="${userPage - 1}">← Vorige</button>
    <span class="text-muted" style="font-size:.85rem">Pagina ${userPage + 1} van ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" ${userPage >= totalPages - 1 ? 'disabled' : ''} data-action="page" data-page="${userPage + 1}">Volgende →</button>
  `;
}

function goUserPage(page) {
  userPage = page;
  loadUsers();
}

// ── Edit user modal ───────────────────────────────────────────────────────────

let editingUserId = null;

function openEditUser(id) {
  const u = userMap.get(id);
  if (!u) return;
  editingUserId = u.id;
  document.getElementById('editUserName').value = u.name;
  document.getElementById('editUserEmail').value = u.email || '';
  document.getElementById('editUserPlan').value = u.plan;
  document.getElementById('editUserAdmin').checked = u.is_admin;
  document.getElementById('editUserError').classList.add('hidden');
  openModal('editUserModal');
}

function closeEditUser() {
  closeModal('editUserModal');
}

document.getElementById('editUserModal').addEventListener('modal:close', () => { editingUserId = null; });

document.getElementById('editUserSaveBtn').addEventListener('click', async () => {
  const err = document.getElementById('editUserError');
  err.classList.add('hidden');
  try {
    await apiFetch(`/admin/users/${editingUserId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('editUserName').value.trim(),
        email: document.getElementById('editUserEmail').value.trim() || undefined,
        plan: document.getElementById('editUserPlan').value,
        is_admin: document.getElementById('editUserAdmin').checked,
      }),
    });
    closeEditUser();
    loadUsers();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

document.getElementById('editUserDeleteBtn').addEventListener('click', async () => {
  const u = userMap.get(editingUserId);
  if (!await showConfirm(`Gebruiker "${u?.name}" verwijderen? Dit kan niet ongedaan worden.`)) return;
  const err = document.getElementById('editUserError');
  err.classList.add('hidden');
  try {
    await apiFetch(`/admin/users/${editingUserId}`, { method: 'DELETE' });
    closeEditUser();
    loadUsers();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

// ── Organizations ─────────────────────────────────────────────────────────────

let orgList = [];
let orgSearch = '';
let editingOrgId = null;
let membersOrgId = null;
const orgMap = new Map();

function filterOrgs(orgs, search) {
  if (!search) return orgs;
  const q = search.toLowerCase();
  return orgs.filter((o) =>
    o.name.toLowerCase().includes(q) ||
    o.slug.toLowerCase().includes(q) ||
    (o.owner_name && o.owner_name.toLowerCase().includes(q))
  );
}

function applyOrgFilter() {
  renderOrgTable(filterOrgs(orgList, orgSearch));
}

document.getElementById('orgSearch').addEventListener('input', debounce((e) => {
  orgSearch = e.target.value.trim();
  applyOrgFilter();
}, 300));

async function loadOrgs() {
  const tbody = document.getElementById('orgTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="admin-table-empty">Laden…</td></tr>';
  try {
    orgList = await apiFetch('/admin/organizations');
    document.getElementById('orgCount').textContent = `${orgList.length} organisatie${orgList.length !== 1 ? 's' : ''}`;
    applyOrgFilter();
  } catch (ex) {
    tbody.innerHTML = `<tr><td colspan="5" class="admin-table-empty">${escapeHtml(ex.message)}</td></tr>`;
  }
}

function renderOrgTable(orgs) {
  const tbody = document.getElementById('orgTableBody');
  if (!orgs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-table-empty">Geen organisaties gevonden.</td></tr>';
    return;
  }
  orgs.forEach((o) => orgMap.set(o.id, o));
  tbody.innerHTML = orgs.map((o) => `
    <tr>
      <td>${escapeHtml(o.name)} <small class="text-muted">${escapeHtml(o.slug)}</small></td>
      <td><span class="plan-badge plan-badge-org">${o.plan === 'org_enterprise' ? 'Enterprise' : 'Starter'}</span></td>
      <td>${o.member_count} / ${o.max_members}</td>
      <td>${o.owner_name ? escapeHtml(o.owner_name) : '—'}</td>
      <td class="admin-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${escapeHtml(o.id)}">Bewerken</button>
        <button class="btn btn-ghost btn-sm" data-action="members" data-id="${escapeHtml(o.id)}">Leden</button>
        <button class="btn btn-ghost btn-sm admin-del" data-action="delete" data-id="${escapeHtml(o.id)}">Verwijderen</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('newOrgBtn').addEventListener('click', () => openOrgModal());

function openOrgModal(id) {
  const o = id ? orgMap.get(id) : null;
  editingOrgId = o?.id || null;
  document.getElementById('orgModalTitle').textContent = o ? 'Organisatie bewerken' : 'Nieuwe organisatie';
  document.getElementById('orgName').value = o?.name || '';
  document.getElementById('orgSlug').value = o?.slug || '';
  document.getElementById('orgPlan').value = o?.plan || 'org_starter';
  document.getElementById('orgOwnerEmail').value = o?.owner_email || '';
  document.getElementById('orgModalError').classList.add('hidden');
  openModal('orgModal');
}

function closeOrgModal() {
  closeModal('orgModal');
}

document.getElementById('orgModal').addEventListener('modal:close', () => { editingOrgId = null; });

document.getElementById('orgSaveBtn').addEventListener('click', async () => {
  const err = document.getElementById('orgModalError');
  err.classList.add('hidden');
  const body = {
    name: document.getElementById('orgName').value.trim(),
    slug: document.getElementById('orgSlug').value.trim(),
    plan: document.getElementById('orgPlan').value,
    owner_email: document.getElementById('orgOwnerEmail').value.trim() || '',
  };
  try {
    if (editingOrgId) {
      await apiFetch(`/admin/organizations/${editingOrgId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await apiFetch('/admin/organizations', { method: 'POST', body: JSON.stringify(body) });
    }
    closeOrgModal();
    loadOrgs();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

async function deleteOrg(id) {
  if (!await showConfirm('Organisatie verwijderen? Dit kan niet ongedaan worden.')) return;
  try {
    await apiFetch(`/admin/organizations/${id}`, { method: 'DELETE' });
    loadOrgs();
  } catch (ex) {
    showToast(ex.message, { icon: '⚠️' });
  }
}

// ── Members modal ─────────────────────────────────────────────────────────────

async function openMembers(orgId, orgName) {
  membersOrgId = orgId;
  document.getElementById('membersModalTitle').textContent = `Leden — ${orgName}`;
  document.getElementById('memberEmail').value = '';
  document.getElementById('membersError').classList.add('hidden');
  openModal('membersModal', { focus: '#memberEmail' });
  await loadMembers();
}

document.getElementById('membersModal').addEventListener('modal:close', () => { membersOrgId = null; });

async function loadMembers() {
  const list = document.getElementById('membersList');
  list.innerHTML = '<p class="text-muted" style="font-size:.85rem">Laden…</p>';
  try {
    const members = await apiFetch(`/admin/organizations/${membersOrgId}/members`);
    if (!members.length) {
      list.innerHTML = '<p class="text-muted" style="font-size:.85rem">Nog geen leden.</p>';
      return;
    }
    list.innerHTML = members.map((m) => `
      <div class="member-row">
        <span>${escapeHtml(m.name)} <small class="text-muted">${escapeHtml(m.email || '')}</small></span>
        <button class="btn btn-ghost btn-sm admin-del" data-action="remove" data-id="${escapeHtml(m.id)}">Verwijderen</button>
      </div>
    `).join('');
  } catch (ex) {
    list.innerHTML = `<p class="form-error">${escapeHtml(ex.message)}</p>`;
  }
}

document.getElementById('addMemberBtn').addEventListener('click', async () => {
  const err = document.getElementById('membersError');
  err.classList.add('hidden');
  const email = document.getElementById('memberEmail').value.trim();
  if (!email) return;
  try {
    await apiFetch(`/admin/organizations/${membersOrgId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    document.getElementById('memberEmail').value = '';
    await loadMembers();
    loadOrgs();
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

async function removeMember(userId) {
  if (!await showConfirm('Lid verwijderen uit organisatie?')) return;
  try {
    await apiFetch(`/admin/organizations/${membersOrgId}/members/${userId}`, { method: 'DELETE' });
    await loadMembers();
    loadOrgs();
  } catch (ex) {
    showToast(ex.message, { icon: '⚠️' });
  }
}

// ── Delegated actions ─────────────────────────────────────────────────────────

onAction('userTableBody', { edit: ({ id }) => openEditUser(id) });
onAction('userPagination', { page: ({ page }) => goUserPage(Number(page)) });
onAction('orgTableBody', {
  edit: ({ id }) => openOrgModal(id),
  members: ({ id }) => openMembers(id, orgMap.get(id)?.name || ''),
  delete: ({ id }) => deleteOrg(id),
});
onAction('membersList', { remove: ({ id }) => removeMember(id) });

// Exported for unit tests.
export {
  filterOrgs,
  openEditUser, closeEditUser, renderUserTable,
  openOrgModal, closeOrgModal, renderOrgTable,
  applyOrgFilter, loadOrgs, loadUsers,
};

// ── Start ─────────────────────────────────────────────────────────────────────

if (!user || !user.is_admin) window.location.href = '/';
else loadUsers();
