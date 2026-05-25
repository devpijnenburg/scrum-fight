'use strict';

const fs   = require('fs');
const path = require('path');

// ── Parse admin.html (strip scripts so we control loading order) ──────────────

const adminHtml = fs.readFileSync(
  path.resolve(__dirname, '../public/admin.html'), 'utf8'
);
const bodyContent = adminHtml
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

// ── Global mocks (must be in place BEFORE admin.js is required) ──────────────

global.getCurrentUser   = jest.fn(() => ({ id: 'u-admin', name: 'Admin', plan: 'free', is_admin: true }));
global.updateNavbar     = jest.fn();
global.applyTranslations  = jest.fn();
global.buildLangDropdown  = jest.fn();
global.logout           = jest.fn();
global.openSettingsModal  = jest.fn();
global.escapeHtml = (s) =>
  String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
global.apiFetch = jest.fn().mockResolvedValue({ total: 0, users: [] });

// ── DOM setup (must exist BEFORE admin.js runs its top-level listeners) ───────

document.body.innerHTML = bodyContent;

// ── Load admin.js once — module cache keeps a single instance ─────────────────

const {
  filterOrgs,
  openEditUser, closeEditUser, renderUserTable,
  openOrgModal,  closeOrgModal,  renderOrgTable,
  applyOrgFilter, loadOrgs,
} = require('../public/js/admin.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'uuid-user-1',
  name: 'Rob Pijnenburg',
  email: 'rob@test.com',
  plan: 'free',
  is_admin: true,
  totp_enabled: false,
  oauth_provider: null,
  created_at: '2024-01-15T10:00:00Z',
};

const MOCK_ORGS = [
  {
    id: 'org-1', name: 'Acme Corp', slug: 'acme-corp',
    plan: 'org_starter', max_members: 20,
    owner_name: 'Alice', owner_email: 'alice@test.com', member_count: 5,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'org-2', name: 'Brightcubes', slug: 'brightcubes',
    plan: 'org_enterprise', max_members: 100,
    owner_name: 'Bob', owner_email: 'bob@test.com', member_count: 30,
    created_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'org-3', name: 'Test Org', slug: 'test-org',
    plan: 'org_starter', max_members: 20,
    owner_name: null, owner_email: null, member_count: 0,
    created_at: '2024-01-03T00:00:00Z',
  },
];

afterEach(() => jest.clearAllMocks());

// ── filterOrgs — pure function ────────────────────────────────────────────────

describe('filterOrgs', () => {
  test('empty search returns all orgs', () => {
    expect(filterOrgs(MOCK_ORGS, '')).toHaveLength(3);
  });

  test('filters by name (case-insensitive, partial)', () => {
    expect(filterOrgs(MOCK_ORGS, 'acme')).toHaveLength(1);
    expect(filterOrgs(MOCK_ORGS, 'BRIGHT')).toHaveLength(1);
    expect(filterOrgs(MOCK_ORGS, 'Corp')).toHaveLength(1);
  });

  test('filters by slug', () => {
    const result = filterOrgs(MOCK_ORGS, 'test-org');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('org-3');
  });

  test('filters by owner name', () => {
    expect(filterOrgs(MOCK_ORGS, 'alice')).toHaveLength(1);
    expect(filterOrgs(MOCK_ORGS, 'bob')).toHaveLength(1);
  });

  test('returns empty array when nothing matches', () => {
    expect(filterOrgs(MOCK_ORGS, 'zzz-bestaat-niet')).toHaveLength(0);
  });

  test('does not crash on orgs without owner_name', () => {
    expect(() => filterOrgs(MOCK_ORGS, 'test')).not.toThrow();
  });
});

// ── User edit modal ───────────────────────────────────────────────────────────

describe('User edit modal', () => {
  beforeEach(() => {
    document.getElementById('editUserModal').classList.add('hidden');
  });

  test('openEditUser opens modal and populates all fields', () => {
    renderUserTable([MOCK_USER]);
    openEditUser(MOCK_USER.id);

    expect(document.getElementById('editUserModal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('editUserName').value).toBe('Rob Pijnenburg');
    expect(document.getElementById('editUserEmail').value).toBe('rob@test.com');
    expect(document.getElementById('editUserPlan').value).toBe('free');
    expect(document.getElementById('editUserAdmin').checked).toBe(true);
  });

  test('openEditUser with unknown id leaves modal hidden', () => {
    openEditUser('does-not-exist');
    expect(document.getElementById('editUserModal').classList.contains('hidden')).toBe(true);
  });

  test('closeEditUser hides the modal', () => {
    renderUserTable([MOCK_USER]);
    openEditUser(MOCK_USER.id);
    expect(document.getElementById('editUserModal').classList.contains('hidden')).toBe(false);

    closeEditUser();
    expect(document.getElementById('editUserModal').classList.contains('hidden')).toBe(true);
  });
});

// ── Org edit modal ────────────────────────────────────────────────────────────

describe('Org edit modal', () => {
  beforeEach(() => {
    renderOrgTable(MOCK_ORGS); // populate orgMap
    document.getElementById('orgModal').classList.add('hidden');
  });

  test('openOrgModal() with no arg shows empty new-org form', () => {
    openOrgModal();
    expect(document.getElementById('orgModal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('orgModalTitle').textContent).toBe('Nieuwe organisatie');
    expect(document.getElementById('orgName').value).toBe('');
    expect(document.getElementById('orgSlug').value).toBe('');
  });

  test('openOrgModal(id) populates form with existing org data', () => {
    openOrgModal('org-1');
    expect(document.getElementById('orgModal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('orgModalTitle').textContent).toBe('Organisatie bewerken');
    expect(document.getElementById('orgName').value).toBe('Acme Corp');
    expect(document.getElementById('orgSlug').value).toBe('acme-corp');
    expect(document.getElementById('orgPlan').value).toBe('org_starter');
    expect(document.getElementById('orgOwnerEmail').value).toBe('alice@test.com');
  });

  test('closeOrgModal hides the modal', () => {
    openOrgModal('org-2');
    expect(document.getElementById('orgModal').classList.contains('hidden')).toBe(false);

    closeOrgModal();
    expect(document.getElementById('orgModal').classList.contains('hidden')).toBe(true);
  });
});

// ── Org search / filter ───────────────────────────────────────────────────────

describe('Org search filter', () => {
  describe('renderOrgTable + filterOrgs (direct)', () => {
    test('renders all orgs without filter', () => {
      renderOrgTable(MOCK_ORGS);
      expect(document.querySelectorAll('#orgTableBody tr')).toHaveLength(3);
    });

    test('renders pre-filtered subset correctly', () => {
      renderOrgTable(filterOrgs(MOCK_ORGS, 'acme'));
      const rows = document.querySelectorAll('#orgTableBody tr');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('Acme Corp');
    });

    test('shows empty message when filter matches nothing', () => {
      renderOrgTable(filterOrgs(MOCK_ORGS, 'zzz'));
      expect(document.querySelector('#orgTableBody td').textContent).toMatch(/geen/i);
    });
  });

  describe('search input → debounce → filter', () => {
    afterEach(() => jest.useRealTimers());

    test('typing in #orgSearch filters table after debounce', async () => {
      global.apiFetch = jest.fn().mockResolvedValue(MOCK_ORGS);
      await loadOrgs(); // populates orgList

      jest.useFakeTimers();
      const el = document.getElementById('orgSearch');
      el.value = 'bright';
      el.dispatchEvent(new Event('input'));
      jest.runAllTimers();

      const rows = document.querySelectorAll('#orgTableBody tr');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('Brightcubes');
    });

    test('clearing search restores full list', async () => {
      global.apiFetch = jest.fn().mockResolvedValue(MOCK_ORGS);
      await loadOrgs();

      jest.useFakeTimers();
      const el = document.getElementById('orgSearch');

      el.value = 'acme';
      el.dispatchEvent(new Event('input'));
      jest.runAllTimers();
      expect(document.querySelectorAll('#orgTableBody tr')).toHaveLength(1);

      el.value = '';
      el.dispatchEvent(new Event('input'));
      jest.runAllTimers();
      expect(document.querySelectorAll('#orgTableBody tr')).toHaveLength(3);
    });

    test('search by owner name works through debounce', async () => {
      global.apiFetch = jest.fn().mockResolvedValue(MOCK_ORGS);
      await loadOrgs();

      jest.useFakeTimers();
      const el = document.getElementById('orgSearch');
      el.value = 'alice';
      el.dispatchEvent(new Event('input'));
      jest.runAllTimers();

      const rows = document.querySelectorAll('#orgTableBody tr');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('Acme Corp');
    });
  });
});
