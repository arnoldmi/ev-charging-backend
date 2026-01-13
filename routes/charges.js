const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Enregistrer une recharge
router.post('/charges', async (req, res) => {
  const { userId, vehicleId, date, kwh, cost, mileage, location } = req.body;

  // Conversion explicite en nombres avec 2 décimales max
  const parsedKwh = parseFloat(parseFloat(kwh).toFixed(2));
  const parsedCost = parseFloat(parseFloat(cost).toFixed(2));
  const parsedMileage = parseFloat(parseFloat(mileage).toFixed(2));

  try {
    const result = await pool.query(
      'INSERT INTO charges (user_id, vehicle_id, date, kwh, cost, mileage, location) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [userId, vehicleId, date, kwh, cost, mileage, location]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les recharges d'un utilisateur/véhicule
router.get('/charges', async (req, res) => {
  const { userId, vehicleId } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM charges WHERE user_id = $1 AND vehicle_id = $2 ORDER BY date DESC',
      [userId, vehicleId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;