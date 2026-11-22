const db = require('../../shared/database');

// Persistence for the admin portal: user management and organizations.

const USER_COLUMNS = 'id, name, email, plan, is_admin, totp_enabled, oauth_provider, created_at';

// ── Users ───────────────────────────────────────────────────────────────────

async function searchUsers({ search, limit, offset }) {
  const pattern = search ? `%${search}%` : '%';
  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query(
      `SELECT ${USER_COLUMNS}
       FROM users
       WHERE name ILIKE $1 OR email ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [pattern, limit, offset]
    ),
    db.query('SELECT COUNT(*) FROM users WHERE name ILIKE $1 OR email ILIKE $1', [pattern]),
  ]);
  return { users: rows, total: parseInt(countRows[0].count, 10) };
}

async function emailTakenByOther(email, userId) {
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
  return rows.length > 0;
}

// Updates only the given fields (null = keep); returns the user or null.
async function updateUser(id, { name, email, plan, isAdmin }) {
  const { rows } = await db.query(
    `UPDATE users SET
       name       = COALESCE($1, name),
       email      = COALESCE($2, email),
       plan       = COALESCE($3, plan),
       is_admin   = COALESCE($4, is_admin),
       updated_at = NOW()
     WHERE id = $5
     RETURNING ${USER_COLUMNS}`,
    [name, email, plan, isAdmin, id]
  );
  return rows[0] || null;
}

async function deleteUser(id) {
  await db.query('DELETE FROM users WHERE id = $1', [id]);
}

// ── Organizations ───────────────────────────────────────────────────────────

async function listOrganizations() {
  const { rows } = await db.query(
    `SELECT o.id, o.name, o.slug, o.plan, o.max_members, o.created_at,
            u.name AS owner_name, u.email AS owner_email,
            COUNT(om.id)::int AS member_count
     FROM organizations o
     LEFT JOIN users u ON u.id = o.owner_id
     LEFT JOIN organization_members om ON om.organization_id = o.id
     GROUP BY o.id, u.name, u.email
     ORDER BY o.created_at DESC`
  );
  return rows;
}

async function insertOrganization({ name, slug, plan, maxMembers, ownerId }) {
  const { rows } = await db.query(
    `INSERT INTO organizations (name, slug, plan, max_members, owner_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, slug, plan, maxMembers, ownerId]
  );
  return rows[0];
}

// Fields that are null are kept; ownerId is only changed when setOwner is true.
async function updateOrganization(id, { name, slug, plan, maxMembers, setOwner, ownerId }) {
  const { rows } = await db.query(
    `UPDATE organizations SET
       name        = COALESCE($1, name),
       slug        = COALESCE($2, slug),
       plan        = COALESCE($3, plan),
       max_members = COALESCE($4, max_members),
       owner_id    = CASE WHEN $5::boolean THEN $6 ELSE owner_id END,
       updated_at  = NOW()
     WHERE id = $7
     RETURNING *`,
    [name, slug, plan, maxMembers, setOwner, ownerId, id]
  );
  return rows[0] || null;
}

async function deleteOrganization(id) {
  const { rows } = await db.query('DELETE FROM organizations WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

async function getOrganizationCapacity(id) {
  const { rows } = await db.query(
    `SELECT o.max_members,
            (SELECT COUNT(*)::int FROM organization_members WHERE organization_id = o.id) AS member_count
     FROM organizations o WHERE o.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// ── Members ─────────────────────────────────────────────────────────────────

async function listMembers(organizationId) {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.plan, om.role, om.joined_at
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1
     ORDER BY om.joined_at ASC`,
    [organizationId]
  );
  return rows;
}

async function insertMember(organizationId, userId, role) {
  const { rows } = await db.query(
    `INSERT INTO organization_members (organization_id, user_id, role)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [organizationId, userId, role]
  );
  return rows[0];
}

async function deleteMember(organizationId, userId) {
  const { rows } = await db.query(
    'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2 RETURNING id',
    [organizationId, userId]
  );
  return rows.length > 0;
}

module.exports = {
  searchUsers,
  emailTakenByOther,
  updateUser,
  deleteUser,
  listOrganizations,
  insertOrganization,
  updateOrganization,
  deleteOrganization,
  getOrganizationCapacity,
  listMembers,
  insertMember,
  deleteMember,
};
