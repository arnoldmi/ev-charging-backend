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

// Enregistrer ou mettre à jour les préférences utilisateur
router.post('/preferences', async (req, res) => {
  const { userId, selectedVehicleId, electricityPrice, alertThreshold } = req.body;

  // Vérifie que userId et selectedVehicleId sont fournis
  if (!userId) {
    //console.log("ERR preferences: userID absent");
    return res.status(400).json({ error: "L'ID de l'utilisateur est requis." });
  }

  try {
    //console.log("on tente l insertion");
    const result = await pool.query(
      `
      INSERT INTO user_preferences (id, user_id, selected_vehicle_id, electricity_price, alert_threshold)
      VALUES (1, $1, $2, $3, $4)
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = $1,
        selected_vehicle_id = $2,
        electricity_price = COALESCE($3, user_preferences.electricity_price),
        alert_threshold = COALESCE($4, user_preferences.alert_threshold),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [userId, selectedVehicleId, electricityPrice, alertThreshold]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.log("ERR preferences: lors de l'insert");
    res.status(500).json({ error: error.message });
  }
});


// Récupérer les préférences de l'utilisateur (incluant le véhicule sélectionné)
router.get('/preferences', async (req, res) => {
  try {
    const preferencesResult = await pool.query(
      `
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        v.id AS vehicle_id,
        v.model AS vehicle_model,
        v.color AS vehicle_color
      FROM user_preferences up
      JOIN users u ON up.user_id = u.id
      LEFT JOIN vehicles v ON up.selected_vehicle_id = v.id
      `
    );
    res.json(preferencesResult.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Récupérer les préférences de l'utilisateur (incluant le véhicule sélectionné)
router.get('/preferences/user', async (req, res) => {
  const { userId } = req.query;
  try {
    const preferencesResult = await pool.query(
      `
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        v.id AS vehicle_id,
        v.model AS vehicle_model,
        v.color AS vehicle_color
      FROM user_preferences up
      JOIN users u ON up.user_id = u.id
      LEFT JOIN vehicles v ON up.selected_vehicle_id = v.id
      WHERE u.id = $1
      `,
      [userId]
    );
    res.json(preferencesResult.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




module.exports = router;