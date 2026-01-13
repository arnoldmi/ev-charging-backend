const express = require('express');
const router = express.Router();
//require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Enregistrer un nouveau véhicule
router.post('/vehicles', async (req, res) => {
  const { userId, model, batteryCapacity, range, color } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO vehicles (user_id, model, battery_capacity, range, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, model, batteryCapacity, range, color]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les véhicules d'un utilisateur
router.get('/vehicles', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM vehicles WHERE user_id = $1',
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;
