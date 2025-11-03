// backend/controllers/api.js

const pool = require('../db/pg');

// ---------- Validation helpers ----------
const CODE_RE = /^[A-Za-z0-9-]{3,}$/;

async function isCodeTaken(code, uuidToExclude = null) {
  const q = `
    SELECT 1
    FROM cat1__nomenclature
    WHERE cat1__deleted = false
      AND cat1__code = $1
      AND ($2::uuid IS NULL OR cat1__uuid <> $2::uuid)
    LIMIT 1`;
  const { rows } = await pool.query(q, [code, uuidToExclude]);
  return rows.length > 0;
}

// ---------- List with search, pagination, sorting ----------
const SORT_WHITELIST = new Set([
  'cat1__id',
  'cat1__code',
  'cat1__represent',
  'cat1__insertdate',
  'cat1__updatedate',
]);

exports.list = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const sort = SORT_WHITELIST.has(req.query.sort) ? req.query.sort : 'cat1__id';
    const dir = (req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const showDeleted = req.query.deleted === 'true';
    const offset = (page - 1) * limit;

    const where = [];
    const args = [];

    if (!showDeleted) where.push('cat1__deleted = false');

    if (q) {
      // Use parameter indices based on current args length
      const p1 = args.length + 1;
      const p2 = args.length + 2;
      where.push(`(cat1__code ILIKE $${p1} OR cat1__represent ILIKE $${p2})`);
      args.push(`%${q}%`, `%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const listSql = `
      SELECT *
      FROM cat1__nomenclature
      ${whereSql}
      ORDER BY ${sort} ${dir}
      LIMIT $${args.length + 1} OFFSET $${args.length + 2}
    `;
    const countSql = `SELECT COUNT(*)::int AS cnt FROM cat1__nomenclature ${whereSql}`;

    const [{ rows }, countRes] = await Promise.all([
      pool.query(listSql, [...args, limit, offset]),
      pool.query(countSql, args),
    ]);

    res.json({
      items: rows,
      page,
      limit,
      total: countRes.rows[0].cnt,
      sort,
      dir,
    });
  } catch (e) {
    next(e);
  }
};

// ---------- Existence check for live validation ----------
exports.codeExists = async (req, res, next) => {
  try {
    const { code, exclude } = req.query;
    if (!code) return res.json({ exists: false });
    const exists = await isCodeTaken(code, exclude || null);
    res.json({ exists });
  } catch (e) {
    next(e);
  }
};

// ---------- Create / Update with validation ----------
exports.createItem = async (req, res, next) => {
  try {
    const { code, represent, isfolder = false, folder = null } = req.body;

    if (code && !CODE_RE.test(code)) {
      return res.status(400).json({ error: 'Код: минимум 3 символа, только латиница/цифры/дефис.' });
    }
    if (code && await isCodeTaken(code, null)) {
      return res.status(409).json({ error: 'Код уже используется.' });
    }

    const insert = `
      INSERT INTO cat1__nomenclature (cat1__code, cat1__represent, cat1__isfolder, cat1_cat1__folder)
      VALUES ($1,$2,$3,$4)
      RETURNING *`;
    const { rows } = await pool.query(insert, [code || null, represent, isfolder, folder]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
};

exports.updateItem = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const { code, represent, isfolder, folder } = req.body;

    if (code && !CODE_RE.test(code)) {
      return res.status(400).json({ error: 'Код: минимум 3 символа, только латиница/цифры/дефис.' });
    }
    if (code && await isCodeTaken(code, uuid)) {
      return res.status(409).json({ error: 'Код уже используется.' });
    }

    const upd = `
      UPDATE cat1__nomenclature
      SET
        cat1__code = $1,
        cat1__represent = $2,
        cat1__isfolder = $3,
        cat1_cat1__folder = $4,
        cat1__updatedate = now()
      WHERE cat1__uuid = $5
      RETURNING *`;
    const { rows } = await pool.query(upd, [code || null, represent, isfolder, folder, uuid]);
    if (!rows[0]) return res.status(404).json({ error: 'Не найдено' });
    res.json(rows[0]);
  } catch (e) { next(e); }
};

// ---------- Soft Delete & Restore ----------
exports.softDelete = async (req, res, next) => {
  try {
    const { uuid } = req.params;

    const sql = `
      UPDATE cat1__nomenclature
      SET
        cat1__deleted = true,
        cat1__deletedate = now(),
        cat1__updatedate = now()
      WHERE cat1__uuid = $1
      AND cat1__deleted = false
      RETURNING *;
    `;

    const { rows } = await pool.query(sql, [uuid]);
    if (!rows[0]) return res.status(404).json({ error: 'Не найдено или уже удалено' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
};

exports.restoreItem = async (req, res, next) => {
  try {
    const { uuid } = req.params;

    // Ensure code won't conflict with an existing active row when restoring
    const { rows: cur } = await pool.query(
      `SELECT cat1__code FROM cat1__nomenclature WHERE cat1__uuid = $1`,
      [uuid]
    );
    if (!cur[0]) return res.status(404).json({ error: 'Не найдено' });

    const code = cur[0].cat1__code;
    if (code && await isCodeTaken(code, uuid)) {
      return res.status(409).json({ error: 'Код конфликтует с существующей записью' });
    }

    const sql = `
      UPDATE cat1__nomenclature
      SET
        cat1__deleted = false,
        cat1__deletedate = NULL,
        cat1__updatedate = now()
      WHERE cat1__uuid = $1
      RETURNING *;
    `;

    const { rows } = await pool.query(sql, [uuid]);
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
};

// ---------- Individuals (cat2__) ----------
exports.individualsList = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '20', 10));
    const deleted = req.query.deleted === 'true';
    const sort = ['cat2__id','cat2__represent','cat2__insertdate','cat2__updatedate'].includes(req.query.sort)
      ? req.query.sort : 'cat2__id';
    const dir = (req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (!deleted) where.push('cat2__deleted = false');
    if (q) {
      params.push(`%${q}%`);
      where.push(`(cat2__iin ILIKE $${params.length} OR cat2__represent ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalSql = `SELECT COUNT(*)::int AS cnt FROM cat2__individuals ${whereSql}`;
    const { rows: tot } = await pool.query(totalSql, params);

    params.push(limit, offset);
    const dataSql = `
      SELECT *
      FROM cat2__individuals
      ${whereSql}
      ORDER BY ${sort} ${dir}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const { rows } = await pool.query(dataSql, params);

    res.json({ items: rows, total: tot[0]?.cnt || 0, page, limit, sort, dir });
  } catch (e) { next(e); }
};

exports.iinExists = async (req, res, next) => {
  try {
    const iin = (req.query.iin || '').trim();
    if (!/^\d{12}$/.test(iin)) return res.json({ exists: false, valid: false });
    const { rows } = await pool.query(
      `SELECT 1 FROM cat2__individuals WHERE cat2__iin = $1 AND cat2__deleted = false LIMIT 1`,
      [iin]
    );
    res.json({ exists: !!rows[0], valid: true });
  } catch (e) { next(e); }
};

exports.individualsCreate = async (req, res, next) => {
  try {
    const { cat2__iin, cat2__lastname, cat2__firstname, cat2__middlename } = req.body || {};
    if (!/^\d{12}$/.test(cat2__iin || '')) {
      return res.status(400).json({ error: 'ИИН должен быть 12 цифр' });
    }
    const { rows: exist } = await pool.query(
      `SELECT 1 FROM cat2__individuals WHERE cat2__iin = $1`,
      [cat2__iin]
    );
    if (exist[0]) return res.status(409).json({ error: 'ИИН уже существует' });

    const { rows } = await pool.query(
      `INSERT INTO cat2__individuals
        (cat2__iin, cat2__lastname, cat2__firstname, cat2__middlename)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [cat2__iin, cat2__lastname, cat2__firstname, cat2__middlename]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
};

exports.individualsUpdate = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const { cat2__iin, cat2__lastname, cat2__firstname, cat2__middlename } = req.body || {};

    if (cat2__iin && !/^\d{12}$/.test(cat2__iin)) {
      return res.status(400).json({ error: 'ИИН должен быть 12 цифр' });
    }
    if (cat2__iin) {
      const { rows: exist } = await pool.query(
        `SELECT 1 FROM cat2__individuals WHERE cat2__iin = $1 AND cat2__uuid <> $2`,
        [cat2__iin, uuid]
      );
      if (exist[0]) return res.status(409).json({ error: 'ИИН уже существует' });
    }

    const { rows } = await pool.query(
      `UPDATE cat2__individuals
       SET cat2__iin = COALESCE($1, cat2__iin),
           cat2__lastname = COALESCE($2, cat2__lastname),
           cat2__firstname = COALESCE($3, cat2__firstname),
           cat2__middlename = COALESCE($4, cat2__middlename),
           cat2__updatedate = now()
       WHERE cat2__uuid = $5
       RETURNING *`,
      [cat2__iin, cat2__lastname, cat2__firstname, cat2__middlename, uuid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Не найдено' });
    res.json(rows[0]);
  } catch (e) { next(e); }
};

exports.individualsSoftDelete = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const { rows } = await pool.query(
      `UPDATE cat2__individuals
       SET cat2__deleted = true, cat2__deletedate = now(), cat2__updatedate = now()
       WHERE cat2__uuid = $1 AND cat2__deleted = false
       RETURNING *`,
      [uuid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Не найдено или уже удалено' });
    res.json(rows[0]);
  } catch (e) { next(e); }
};

exports.individualsRestore = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const { rows } = await pool.query(
      `UPDATE cat2__individuals
       SET cat2__deleted = false, cat2__deletedate = NULL, cat2__updatedate = now()
       WHERE cat2__uuid = $1
       RETURNING *`,
      [uuid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Не найдено' });
    res.json(rows[0]);
  } catch (e) { next(e); }
};

// ---------- Staffers (cat3__) ----------
exports.staffersList = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '20', 10));
    const deleted = req.query.deleted === 'true';
    const sort = ['cat3__id','cat3__tabno','cat3__insertdate','cat3__updatedate'].includes(req.query.sort)
      ? req.query.sort : 'cat3__id';
    const dir = (req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (!deleted) where.push('s.cat3__deleted = false');

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalSql = `SELECT COUNT(*)::int AS cnt FROM cat3__staffers s ${whereSql}`;
    const { rows: tot } = await pool.query(totalSql, params);

    params.push(limit, offset);
    const dataSql = `
      SELECT s.*, i.cat2__represent AS person_fio, i.cat2__iin
      FROM cat3__staffers s
      LEFT JOIN cat2__individuals i ON i.cat2__uuid = s.cat3_cat2__person
      ${whereSql}
      ORDER BY ${sort} ${dir}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const { rows } = await pool.query(dataSql, params);

    res.json({ items: rows, total: tot[0]?.cnt || 0, page, limit, sort, dir });
  } catch (e) { next(e); }
};

exports.staffersCreate = async (req, res, next) => {
  try {
    const { cat3__tabno, cat3_cat2__person } = req.body || {};
    if (!cat3__tabno || !cat3_cat2__person) {
      return res.status(400).json({ error: 'tabno и person обязательны' });
    }
    const { rows: exist } = await pool.query(
      `SELECT 1 FROM cat3__staffers WHERE cat3__tabno = $1`,
      [cat3__tabno]
    );
    if (exist[0]) return res.status(409).json({ error: 'Табельный уже существует' });

    const { rows } = await pool.query(
      `INSERT INTO cat3__staffers (cat3__tabno, cat3_cat2__person)
       VALUES ($1,$2) RETURNING *`,
      [cat3__tabno, cat3_cat2__person]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
};

exports.staffersUpdate = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const { cat3__tabno, cat3_cat2__person } = req.body || {};

    if (cat3__tabno) {
      const { rows: exist } = await pool.query(
        `SELECT 1 FROM cat3__staffers WHERE cat3__tabno = $1 AND cat3__uuid <> $2`,
        [cat3__tabno, uuid]
      );
      if (exist[0]) return res.status(409).json({ error: 'Табельный уже существует' });
    }

    const { rows } = await pool.query(
      `UPDATE cat3__staffers
       SET cat3__tabno = COALESCE($1, cat3__tabno),
           cat3_cat2__person = COALESCE($2, cat3_cat2__person),
           cat3__updatedate = now()
       WHERE cat3__uuid = $3
       RETURNING *`,
      [cat3__tabno, cat3_cat2__person, uuid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Не найдено' });
    res.json(rows[0]);
  } catch (e) { next(e); }
};

exports.staffersSoftDelete = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const { rows } = await pool.query(
      `UPDATE cat3__staffers
       SET cat3__deleted = true, cat3__deletedate = now(), cat3__updatedate = now()
       WHERE cat3__uuid = $1 AND cat3__deleted = false
       RETURNING *`,
      [uuid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Не найдено или уже удалено' });
    res.json(rows[0]);
  } catch (e) { next(e); }
};

exports.staffersRestore = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const { rows } = await pool.query(
      `UPDATE cat3__staffers
       SET cat3__deleted = false, cat3__deletedate = NULL, cat3__updatedate = now()
       WHERE cat3__uuid = $1
       RETURNING *`,
      [uuid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Не найдено' });
    res.json(rows[0]);
  } catch (e) { next(e); }
};
