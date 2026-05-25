// Admin portal — requires is_admin claim in JWT

const user = getCurrentUser();
if (!user || !user.is_admin) window.location.href = '/';

updateNavbar();

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
      <td><button class="btn btn-ghost btn-sm" onclick="openEditUser('${u.id}')">Bewerken</button></td>
    </tr>
  `).join('');
}

function renderUserPagination() {
  const el = document.getElementById('userPagination');
  const totalPages = Math.ceil(userTotal / USER_LIMIT);
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn btn-ghost btn-sm" ${userPage === 0 ? 'disabled' : ''} onclick="goUserPage(${userPage - 1})">← Vorige</button>
    <span class="text-muted" style="font-size:.85rem">Pagina ${userPage + 1} van ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" ${userPage >= totalPages - 1 ? 'disabled' : ''} onclick="goUserPage(${userPage + 1})">Volgende →</button>
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
  document.getElementById('editUserModal').classList.remove('hidden');
}

function closeEditUser() {
  document.getElementById('editUserModal').classList.add('hidden');
  editingUserId = null;
}

document.getElementById('editUserCancelBtn').addEventListener('click', closeEditUser);
document.getElementById('editUserBackdrop').addEventListener('click', closeEditUser);

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

// ── Organizations ─────────────────────────────────────────────────────────────

let orgList = [];
let editingOrgId = null;
let membersOrgId = null;
const orgMap = new Map();

async function loadOrgs() {
  const tbody = document.getElementById('orgTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="admin-table-empty">Laden…</td></tr>';
  try {
    orgList = await apiFetch('/admin/organizations');
    document.getElementById('orgCount').textContent = `${orgList.length} organisatie${orgList.length !== 1 ? 's' : ''}`;
    renderOrgTable(orgList);
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
        <button class="btn btn-ghost btn-sm" onclick="openOrgModal('${o.id}')">Bewerken</button>
        <button class="btn btn-ghost btn-sm" onclick="openMembers('${o.id}', ${JSON.stringify(o.name)})">Leden</button>
        <button class="btn btn-ghost btn-sm admin-del" onclick="deleteOrg('${o.id}')">Verwijderen</button>
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
  document.getElementById('orgModal').classList.remove('hidden');
}

function closeOrgModal() {
  document.getElementById('orgModal').classList.add('hidden');
  editingOrgId = null;
}

document.getElementById('orgCancelBtn').addEventListener('click', closeOrgModal);
document.getElementById('orgModalBackdrop').addEventListener('click', closeOrgModal);

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
  if (!confirm('Organisatie verwijderen? Dit kan niet ongedaan worden.')) return;
  try {
    await apiFetch(`/admin/organizations/${id}`, { method: 'DELETE' });
    loadOrgs();
  } catch (ex) {
    alert(ex.message);
  }
}

// ── Members modal ─────────────────────────────────────────────────────────────

async function openMembers(orgId, orgName) {
  membersOrgId = orgId;
  document.getElementById('membersModalTitle').textContent = `Leden — ${orgName}`;
  document.getElementById('memberEmail').value = '';
  document.getElementById('membersError').classList.add('hidden');
  document.getElementById('membersModal').classList.remove('hidden');
  await loadMembers();
}

function closeMembers() {
  document.getElementById('membersModal').classList.add('hidden');
  membersOrgId = null;
}

document.getElementById('membersCancelBtn').addEventListener('click', closeMembers);
document.getElementById('membersModalBackdrop').addEventListener('click', closeMembers);

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
        <button class="btn btn-ghost btn-sm admin-del" onclick="removeMember('${m.id}')">Verwijderen</button>
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
  if (!confirm('Lid verwijderen uit organisatie?')) return;
  try {
    await apiFetch(`/admin/organizations/${membersOrgId}/members/${userId}`, { method: 'DELETE' });
    await loadMembers();
    loadOrgs();
  } catch (ex) {
    alert(ex.message);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadUsers();
