require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─── DB Init ────────────────────────────────────────────────────────────────

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spots (
      id        INTEGER PRIMARY KEY,
      number    TEXT UNIQUE NOT NULL,
      owner_name TEXT,
      pin_hash  TEXT
    );
    CREATE TABLE IF NOT EXISTS availabilities (
      id         SERIAL PRIMARY KEY,
      spot_id    INTEGER REFERENCES spots(id) ON DELETE CASCADE,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id             SERIAL PRIMARY KEY,
      spot_id        INTEGER REFERENCES spots(id) ON DELETE CASCADE,
      availability_id INTEGER REFERENCES availabilities(id) ON DELETE CASCADE,
      reserver_name  TEXT NOT NULL,
      reserver_apt   TEXT,
      start_time     TEXT NOT NULL,
      end_time       TEXT NOT NULL
    );
  `);
  for (let i = 1; i <= 12; i++) {
    await pool.query(
      'INSERT INTO spots (id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [i, String(i).padStart(2, '0')]
    );
  }
}

// Dates are stored as "YYYY-MM-DDTHH:MM" text — ISO string comparison works correctly.
function hasOverlap(s1, e1, s2, e2) {
  return s2 < e1 && e2 > s1;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/data?date=YYYY-MM-DD
app.get('/api/data', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Paramètre date manquant' });
  try {
    const spots = await pool.query(
      'SELECT id, number, owner_name, (pin_hash IS NOT NULL) AS claimed FROM spots ORDER BY id'
    );
    const avails = await pool.query(
      "SELECT * FROM availabilities WHERE start_time LIKE $1 ORDER BY spot_id, start_time",
      [date + '%']
    );
    const reservs = await pool.query(
      "SELECT * FROM reservations WHERE start_time LIKE $1 ORDER BY spot_id, start_time",
      [date + '%']
    );
    res.json({ spots: spots.rows, availabilities: avails.rows, reservations: reservs.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spots/:id/setup — first-time PIN setup
app.post('/api/spots/:id/setup', async (req, res) => {
  const { id } = req.params;
  const { owner_name, pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Le PIN doit contenir exactement 4 chiffres' });
  }
  try {
    const { rows } = await pool.query('SELECT pin_hash FROM spots WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Place introuvable' });
    if (rows[0].pin_hash) return res.status(409).json({ error: 'Cette place est déjà configurée' });
    const hash = await bcrypt.hash(pin, 10);
    await pool.query(
      'UPDATE spots SET owner_name = $1, pin_hash = $2 WHERE id = $3',
      [owner_name || null, hash, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spots/:id/availability — add availability window
app.post('/api/spots/:id/availability', async (req, res) => {
  const { id } = req.params;
  const { pin, start_time, end_time } = req.body;
  if (!start_time || !end_time || start_time >= end_time) {
    return res.status(400).json({ error: 'Créneau invalide' });
  }
  try {
    const { rows } = await pool.query('SELECT pin_hash FROM spots WHERE id = $1', [id]);
    if (!rows[0]?.pin_hash) return res.status(400).json({ error: 'Place non configurée' });
    if (!await bcrypt.compare(pin, rows[0].pin_hash)) {
      return res.status(401).json({ error: 'PIN incorrect' });
    }
    const existing = await pool.query(
      'SELECT start_time, end_time FROM availabilities WHERE spot_id = $1', [id]
    );
    for (const a of existing.rows) {
      if (hasOverlap(a.start_time, a.end_time, start_time, end_time)) {
        return res.status(409).json({ error: 'Ce créneau chevauche une disponibilité existante' });
      }
    }
    const { rows: [avail] } = await pool.query(
      'INSERT INTO availabilities (spot_id, start_time, end_time) VALUES ($1, $2, $3) RETURNING *',
      [id, start_time, end_time]
    );
    res.json(avail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/availability/:id — remove availability (and its reservations)
app.delete('/api/availability/:id', async (req, res) => {
  const { id } = req.params;
  const { pin } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT a.*, s.pin_hash FROM availabilities a JOIN spots s ON a.spot_id = s.id WHERE a.id = $1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Disponibilité introuvable' });
    if (!await bcrypt.compare(pin, rows[0].pin_hash)) {
      return res.status(401).json({ error: 'PIN incorrect' });
    }
    await pool.query('DELETE FROM availabilities WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reserve — make a reservation
app.post('/api/reserve', async (req, res) => {
  const { availability_id, reserver_name, reserver_apt, start_time, end_time } = req.body;
  if (!reserver_name?.trim()) return res.status(400).json({ error: 'Nom requis' });
  if (!start_time || !end_time || start_time >= end_time) {
    return res.status(400).json({ error: 'Créneau invalide' });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM availabilities WHERE id = $1', [availability_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Disponibilité introuvable' });
    const avail = rows[0];
    if (start_time < avail.start_time || end_time > avail.end_time) {
      return res.status(400).json({ error: 'Le créneau dépasse la fenêtre de disponibilité' });
    }
    const existing = await pool.query(
      'SELECT start_time, end_time FROM reservations WHERE availability_id = $1', [availability_id]
    );
    for (const r of existing.rows) {
      if (hasOverlap(r.start_time, r.end_time, start_time, end_time)) {
        return res.status(409).json({ error: 'Ce créneau est déjà réservé' });
      }
    }
    const { rows: [reservation] } = await pool.query(
      `INSERT INTO reservations (spot_id, availability_id, reserver_name, reserver_apt, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [avail.spot_id, availability_id, reserver_name.trim(), reserver_apt?.trim() || null, start_time, end_time]
    );
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reservation/:id — cancel a reservation (spot owner PIN)
app.delete('/api/reservation/:id', async (req, res) => {
  const { id } = req.params;
  const { pin } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT r.*, s.pin_hash FROM reservations r JOIN spots s ON r.spot_id = s.id WHERE r.id = $1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Réservation introuvable' });
    if (!await bcrypt.compare(pin, rows[0].pin_hash)) {
      return res.status(401).json({ error: 'PIN incorrect' });
    }
    await pool.query('DELETE FROM reservations WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`)))
  .catch(err => { console.error('Erreur initialisation DB :', err); process.exit(1); });
