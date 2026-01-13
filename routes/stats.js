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

// Récupérer les statistiques pour un utilisateur et un véhicule
router.get('/stats', async (req, res) => {
  const { userId, vehicleId } = req.query;
  try {
    const result = await pool.query(
      `
      SELECT
        AVG(kwh) as avg_consumption,
        AVG(cost) / SUM(kwh) as avg_cost_per_km,
        COUNT(*) as total_charges
      FROM charges
      WHERE user_id = $1 AND vehicle_id = $2
      `,
      [userId, vehicleId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les statistiques de consommation
router.get('/stats/consumption', async (req, res) => {
  const { vehicleId } = req.query;
  try {
    const result = await pool.query(
      `
      SELECT
        AVG(kwh * 100 / (LEAD(mileage) OVER (ORDER BY date) - mileage)) as avg_consumption_per_100km,
        AVG(cost / kwh) as avg_cost_per_kwh
      FROM charges
      WHERE vehicle_id = $1 AND mileage IS NOT NULL
      `,
      [vehicleId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les statistiques globales pour un utilisateur/véhicule
router.get('/stats/global', async (req, res) => {
  const { userId, vehicleId } = req.query;
  try {
    // Utilisation d'une CTE pour calculer les distances et consommations
    const result = await pool.query(
      `
      WITH charge_distances AS (
        SELECT
          date,
          kwh,
          cost,
          mileage,
          LAG(mileage) OVER (ORDER BY date) AS prev_mileage
        FROM charges
        WHERE user_id = $1 AND vehicle_id = $2
      ),
      consumption_data AS (
        SELECT
          (kwh * 100) / NULLIF((mileage - prev_mileage), 0) AS consumption
        FROM charge_distances
        WHERE prev_mileage IS NOT NULL AND (mileage - prev_mileage) > 0
      ),
      cost_data AS (
        SELECT
          cost / NULLIF(kwh, 0) AS cost_per_kwh,
          cost / NULLIF(((mileage - prev_mileage) / 100), 0) AS cost_per_km
        FROM charge_distances
        WHERE prev_mileage IS NOT NULL AND (mileage - prev_mileage) > 0 AND kwh > 0
      )
      SELECT
        AVG(consumption) AS avg_consumption,
        AVG(cost_per_kwh) AS avg_cost_per_kwh,
        AVG(cost_per_km) AS avg_cost_per_km,
        (SELECT COUNT(*) FROM charges WHERE user_id = $1 AND vehicle_id = $2) AS total_charges
      FROM consumption_data, cost_data
      `,
      [userId, vehicleId]
    );

    // Convertir explicitement les valeurs en nombres
    const stats = {
      avgConsumption: parseFloat(result.rows[0].avg_consumption),
      avgCostPerKwh: parseFloat(result.rows[0].avg_cost_per_kwh),
      avgCostPerKm: parseFloat(result.rows[0].avg_cost_per_km),
      totalCharges: parseInt(result.rows[0].total_charges),
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les données des recharges pour les graphiques
router.get('/stats/charges', async (req, res) => {
  const { userId, vehicleId } = req.query;
  try {
    const result = await pool.query(
      `
      SELECT
        date,
        kwh,
        cost,
        mileage,
        LAG(mileage) OVER (ORDER BY date) AS prev_mileage
      FROM charges
      WHERE user_id = $1 AND vehicle_id = $2
      ORDER BY date
      `,
      [userId, vehicleId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les statistiques cumulatives pour un utilisateur/véhicule
router.get('/stats/cumulative', async (req, res) => {
  const { userId, vehicleId } = req.query;
  try {
    // Kilométrage total (dernier kilométrage enregistré)
    const mileageResult = await pool.query(
      'SELECT MAX(mileage) AS total_mileage FROM charges WHERE user_id = $1 AND vehicle_id = $2',
      [userId, vehicleId]
    );

    // kWh total consommés
    const kwhResult = await pool.query(
      'SELECT SUM(kwh) AS total_kwh FROM charges WHERE user_id = $1 AND vehicle_id = $2',
      [userId, vehicleId]
    );

    // Coût total dépensé
    const costResult = await pool.query(
      'SELECT SUM(cost) AS total_cost FROM charges WHERE user_id = $1 AND vehicle_id = $2',
      [userId, vehicleId]
    );

    // Somme des distances parcourues entre chaque recharge (pour les moyennes)
    const distanceResult = await pool.query(
      `
      WITH distances AS (
        SELECT
          mileage - LAG(mileage) OVER (ORDER BY date) AS distance
        FROM charges
        WHERE user_id = $1 AND vehicle_id = $2
      )
      SELECT COALESCE(SUM(distance), 0) AS total_distance
      FROM distances
      WHERE distance IS NOT NULL AND distance > 0
      `,
      [userId, vehicleId]
    );

    // Nombre total de recharges
    const totalChargesResult = await pool.query(
      'SELECT COUNT(*) AS total_charges FROM charges WHERE user_id = $1 AND vehicle_id = $2',
      [userId, vehicleId]
    );

    // Conversion explicite en nombres avec 2 décimales max
    const totalMileage = mileageResult.rows[0].total_mileage ? parseFloat(parseFloat(mileageResult.rows[0].total_mileage).toFixed(2)) : 0;
    const totalKwh = kwhResult.rows[0].total_kwh ? parseFloat(parseFloat(kwhResult.rows[0].total_kwh).toFixed(2)) : 0;
    const totalCost = costResult.rows[0].total_cost ? parseFloat(parseFloat(costResult.rows[0].total_cost).toFixed(2)) : 0;
    const totalDistance = distanceResult.rows[0].total_distance ? parseFloat(parseFloat(distanceResult.rows[0].total_distance).toFixed(2)) : 0;
    const totalCharges = totalChargesResult.rows[0].total_charges ? parseInt(totalChargesResult.rows[0].total_charges) : 0;

    res.json({
      totalMileage,
      totalKwh,
      totalCost,
      totalDistance,
      totalCharges,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;
