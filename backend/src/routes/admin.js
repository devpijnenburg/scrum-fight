const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAdmin } = require('../auth/adminMiddleware');

router.use(requireAdmin);

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  const search = req.query.search ? `%${req.query.search}%` : '%';
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (parseInt(req.query.page) || 0) * limit;

  const { rows } = await db.query(
    `SELECT id, name, email, plan, is_admin, totp_enabled, oauth_provider, created_at
     FROM users
     WHERE name ILIKE $1 OR email ILIKE $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [search, limit, offset]
  );

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*) FROM users WHERE name ILIKE $1 OR email ILIKE $1`,
    [search]
  );

  res.json({ users: rows, total: parseInt(countRows[0].count) });
});

router.put('/users/:id', async (req, res) => {
  const { name, email, plan, is_admin } = req.body;
  const { id } = req.params;

  const allowed = ['free', 'pro', 'premium', 'org_starter', 'org_enterprise'];
  if (plan && !allowed.includes(plan)) {
    return res.status(400).json({ error: 'Ongeldig plan' });
  }

  if (email) {
    const { rows } = await db.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email.toLowerCase().trim(), id]
    );
    if (rows.length) return res.status(409).json({ error: 'E-mailadres is al in gebruik' });
  }

  const { rows } = await db.query(
    `UPDATE users SET
       name      = COALESCE($1, name),
       email     = COALESCE($2, email),
       plan      = COALESCE($3, plan),
       is_admin  = COALESCE($4, is_admin),
       updated_at = NOW()
     WHERE id = $5
     RETURNING id, name, email, plan, is_admin, totp_enabled, oauth_provider, created_at`,
    [
      name?.trim() || null,
      email ? email.toLowerCase().trim() : null,
      plan || null,
      typeof is_admin === 'boolean' ? is_admin : null,
      id,
    ]
  );

  if (!rows.length) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  res.json(rows[0]);
});

// ── Organizations ─────────────────────────────────────────────────────────────

router.get('/organizations', async (req, res) => {
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
  res.json(rows);
});

router.post('/organizations', async (req, res) => {
  const { name, slug, plan, owner_email } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Naam en slug zijn verplicht' });

  const allowed = ['org_starter', 'org_enterprise'];
  if (plan && !allowed.includes(plan)) {
    return res.status(400).json({ error: 'Ongeldig organisatieplan' });
  }

  const maxMembers = plan === 'org_enterprise' ? 100 : 20;
  let ownerId = null;

  if (owner_email) {
    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [owner_email.toLowerCase().trim()]);
    if (!rows.length) return res.status(404).json({ error: 'Eigenaar niet gevonden' });
    ownerId = rows[0].id;
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO organizations (name, slug, plan, max_members, owner_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), slug.toLowerCase().trim(), plan || 'org_starter', maxMembers, ownerId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug is al in gebruik' });
    throw err;
  }
});

router.put('/organizations/:id', async (req, res) => {
  const { name, slug, plan, owner_email } = req.body;
  const { id } = req.params;

  const allowed = ['org_starter', 'org_enterprise'];
  if (plan && !allowed.includes(plan)) {
    return res.status(400).json({ error: 'Ongeldig organisatieplan' });
  }

  let ownerId;
  if (owner_email !== undefined) {
    if (owner_email === '') {
      ownerId = null;
    } else {
      const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [owner_email.toLowerCase().trim()]);
      if (!rows.length) return res.status(404).json({ error: 'Eigenaar niet gevonden' });
      ownerId = rows[0].id;
    }
  }

  const maxMembers = plan === 'org_enterprise' ? 100 : plan === 'org_starter' ? 20 : undefined;

  try {
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
      [
        name?.trim() || null,
        slug ? slug.toLowerCase().trim() : null,
        plan || null,
        maxMembers || null,
        ownerId !== undefined,
        ownerId !== undefined ? ownerId : null,
        id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Organisatie niet gevonden' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug is al in gebruik' });
    throw err;
  }
});

router.delete('/organizations/:id', async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM organizations WHERE id = $1 RETURNING id',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Organisatie niet gevonden' });
  res.json({ ok: true });
});

// ── Organization members ──────────────────────────────────────────────────────

router.get('/organizations/:id/members', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.plan, om.role, om.joined_at
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1
     ORDER BY om.joined_at ASC`,
    [req.params.id]
  );
  res.json(rows);
});

router.post('/organizations/:id/members', async (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mailadres is verplicht' });

  const { rows: userRows } = await db.query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  if (!userRows.length) return res.status(404).json({ error: 'Gebruiker niet gevonden' });

  const { rows: orgRows } = await db.query(
    'SELECT max_members FROM organizations WHERE id = $1',
    [req.params.id]
  );
  if (!orgRows.length) return res.status(404).json({ error: 'Organisatie niet gevonden' });

  const { rows: countRows } = await db.query(
    'SELECT COUNT(*) FROM organization_members WHERE organization_id = $1',
    [req.params.id]
  );
  if (parseInt(countRows[0].count) >= orgRows[0].max_members) {
    return res.status(409).json({ error: 'Organisatie heeft het maximale aantal leden bereikt' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, userRows[0].id, role || 'member']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Gebruiker is al lid' });
    throw err;
  }
});

router.delete('/organizations/:id/members/:userId', async (req, res) => {
  const { rows } = await db.query(
    'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.params.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Lid niet gevonden' });
  res.json({ ok: true });
});

module.exports = router;
