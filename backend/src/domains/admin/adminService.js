// Admin portal: user management, organizations and their members.

const repo = require('./adminRepository');
const users = require('../identity/userRepository');
const { PLAN_LIMITS, VALID_PLANS, ORG_PLANS } = require('../billing/plans');
const { badRequest, notFound, conflict, isUniqueViolation } = require('../../shared/errors');

const DEFAULT_ORG_PLAN = 'org_starter';
const MAX_PAGE_SIZE = 100;

const normalizeEmail = (email) => email.toLowerCase().trim();
const orgMaxMembers = (plan) => PLAN_LIMITS[plan]?.orgMaxMembers;

function assertOrgPlan(plan) {
  if (plan && !ORG_PLANS.includes(plan)) throw badRequest('INVALID_ORG_PLAN', 'Ongeldig organisatieplan');
}

async function ownerIdByEmail(email) {
  const id = await users.findIdByEmail(email);
  if (!id) throw notFound('OWNER_NOT_FOUND', 'Eigenaar niet gevonden');
  return id;
}

function translateSlugConflict(err) {
  if (isUniqueViolation(err)) return conflict('SLUG_IN_USE', 'Slug is al in gebruik');
  return err;
}

// ── Users ───────────────────────────────────────────────────────────────────

function searchUsers({ search, limit, page }) {
  const size = Math.min(parseInt(limit, 10) || 20, MAX_PAGE_SIZE);
  const offset = (parseInt(page, 10) || 0) * size;
  return repo.searchUsers({ search, limit: size, offset });
}

async function updateUser(id, { name, email, plan, is_admin: isAdmin }) {
  if (plan && !VALID_PLANS.includes(plan)) throw badRequest('INVALID_PLAN', 'Ongeldig plan');

  const normalizedEmail = email ? normalizeEmail(email) : null;
  if (normalizedEmail && (await repo.emailTakenByOther(normalizedEmail, id))) {
    throw conflict('EMAIL_IN_USE', 'E-mailadres is al in gebruik');
  }

  const user = await repo.updateUser(id, {
    name: name?.trim() || null,
    email: normalizedEmail,
    plan: plan || null,
    isAdmin: typeof isAdmin === 'boolean' ? isAdmin : null,
  });
  if (!user) throw notFound('USER_NOT_FOUND', 'Gebruiker niet gevonden');
  return user;
}

function deleteUser(id) {
  return repo.deleteUser(id);
}

// ── Organizations ───────────────────────────────────────────────────────────

function listOrganizations() {
  return repo.listOrganizations();
}

async function createOrganization({ name, slug, plan, owner_email: ownerEmail }) {
  if (!name || !slug) throw badRequest('ORG_FIELDS_REQUIRED', 'Naam en slug zijn verplicht');
  assertOrgPlan(plan);

  const orgPlan = plan || DEFAULT_ORG_PLAN;
  const ownerId = ownerEmail ? await ownerIdByEmail(ownerEmail) : null;

  try {
    return await repo.insertOrganization({
      name: name.trim(),
      slug: slug.toLowerCase().trim(),
      plan: orgPlan,
      maxMembers: orgMaxMembers(orgPlan),
      ownerId,
    });
  } catch (err) {
    throw translateSlugConflict(err);
  }
}

// owner_email: undefined = keep owner, '' = remove owner, address = new owner.
async function updateOrganization(id, { name, slug, plan, owner_email: ownerEmail }) {
  assertOrgPlan(plan);

  const setOwner = ownerEmail !== undefined;
  const ownerId = setOwner && ownerEmail !== '' ? await ownerIdByEmail(ownerEmail) : null;

  let org;
  try {
    org = await repo.updateOrganization(id, {
      name: name?.trim() || null,
      slug: slug ? slug.toLowerCase().trim() : null,
      plan: plan || null,
      maxMembers: plan ? orgMaxMembers(plan) : null,
      setOwner,
      ownerId,
    });
  } catch (err) {
    throw translateSlugConflict(err);
  }
  if (!org) throw notFound('ORG_NOT_FOUND', 'Organisatie niet gevonden');
  return org;
}

async function deleteOrganization(id) {
  if (!(await repo.deleteOrganization(id))) throw notFound('ORG_NOT_FOUND', 'Organisatie niet gevonden');
}

// ── Members ─────────────────────────────────────────────────────────────────

function listMembers(organizationId) {
  return repo.listMembers(organizationId);
}

async function addMember(organizationId, { email, role }) {
  if (!email) throw badRequest('EMAIL_REQUIRED', 'E-mailadres is verplicht');

  const userId = await users.findIdByEmail(email);
  if (!userId) throw notFound('USER_NOT_FOUND', 'Gebruiker niet gevonden');

  const capacity = await repo.getOrganizationCapacity(organizationId);
  if (!capacity) throw notFound('ORG_NOT_FOUND', 'Organisatie niet gevonden');
  if (capacity.member_count >= capacity.max_members) {
    throw conflict('ORG_FULL', 'Organisatie heeft het maximale aantal leden bereikt');
  }

  try {
    return await repo.insertMember(organizationId, userId, role || 'member');
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('ALREADY_MEMBER', 'Gebruiker is al lid');
    throw err;
  }
}

async function removeMember(organizationId, userId) {
  if (!(await repo.deleteMember(organizationId, userId))) {
    throw notFound('MEMBER_NOT_FOUND', 'Lid niet gevonden');
  }
}

module.exports = {
  searchUsers,
  updateUser,
  deleteUser,
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  listMembers,
  addMember,
  removeMember,
};
