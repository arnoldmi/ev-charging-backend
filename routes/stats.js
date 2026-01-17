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

    const stats = {
      avgConsumption: parseFloat(result.rows[0].avg_consumption) || 0,
      avgCostPerKwh: parseFloat(result.rows[0].avg_cost_per_kwh) || 0,
      avgCostPerKm: parseFloat(result.rows[0].avg_cost_per_km) || 0,
      totalCharges: parseInt(result.rows[0].total_charges) || 0,
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
    const mileageResult = await pool.query(
      'SELECT MAX(mileage) AS total_mileage FROM charges WHERE user_id = $1 AND vehicle_id = $2',
      [userId, vehicleId]
    );

    const kwhResult = await pool.query(
      'SELECT SUM(kwh) AS total_kwh FROM charges WHERE user_id = $1 AND vehicle_id = $2',
      [userId, vehicleId]
    );

    const costResult = await pool.query(
      'SELECT SUM(cost) AS total_cost FROM charges WHERE user_id = $1 AND vehicle_id = $2',
      [userId, vehicleId]
    );

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

    const totalChargesResult = await pool.query(
      'SELECT COUNT(*) AS total_charges FROM charges WHERE user_id = $1 AND vehicle_id = $2',
      [userId, vehicleId]
    );

    const totalMileage = mileageResult.rows[0].total_mileage 
      ? parseFloat(parseFloat(mileageResult.rows[0].total_mileage).toFixed(2)) 
      : 0;
    const totalKwh = kwhResult.rows[0].total_kwh 
      ? parseFloat(parseFloat(kwhResult.rows[0].total_kwh).toFixed(2)) 
      : 0;
    const totalCost = costResult.rows[0].total_cost 
      ? parseFloat(parseFloat(costResult.rows[0].total_cost).toFixed(2)) 
      : 0;
    const totalDistance = distanceResult.rows[0].total_distance 
      ? parseFloat(parseFloat(distanceResult.rows[0].total_distance).toFixed(2)) 
      : 0;
    const totalCharges = totalChargesResult.rows[0].total_charges 
      ? parseInt(totalChargesResult.rows[0].total_charges) 
      : 0;

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

// ========================================
// ENDPOINT 1: Recharges mensuelles (Graphique en barres) - POSTGRESQL
// ========================================
router.get('/stats/monthly-charges', async (req, res) => {
  const { userId, vehicleId } = req.query;

  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // PostgreSQL months are 1-12
    const currentYear = now.getFullYear();

    // Mois précédent
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    // Noms des mois
    const monthNames = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    // Requête pour le mois actuel
    const currentMonthResult = await pool.query(
      `
      SELECT COALESCE(SUM(kwh), 0) as total
      FROM charges
      WHERE user_id = $1 
        AND vehicle_id = $2
        AND EXTRACT(MONTH FROM date) = $3
        AND EXTRACT(YEAR FROM date) = $4
      `,
      [userId, vehicleId, currentMonth, currentYear]
    );

    // Requête pour le mois précédent
    const previousMonthResult = await pool.query(
      `
      SELECT COALESCE(SUM(kwh), 0) as total
      FROM charges
      WHERE user_id = $1 
        AND vehicle_id = $2
        AND EXTRACT(MONTH FROM date) = $3
        AND EXTRACT(YEAR FROM date) = $4
      `,
      [userId, vehicleId, previousMonth, previousYear]
    );

    res.json({
      currentMonth: parseFloat(currentMonthResult.rows[0].total) || 0,
      previousMonth: parseFloat(previousMonthResult.rows[0].total) || 0,
      currentMonthName: monthNames[currentMonth - 1],
      previousMonthName: monthNames[previousMonth - 1]
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des données mensuelles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================================
// ENDPOINT 2: Recharges par localisation (Graphique camembert) - POSTGRESQL
// ========================================
router.get('/stats/charges-by-location', async (req, res) => {
  const { userId, vehicleId } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT 
        location,
        COUNT(*) as count,
        SUM(kwh) as total_kwh
      FROM charges
      WHERE user_id = $1 AND vehicle_id = $2
      GROUP BY location
      ORDER BY count DESC
      `,
      [userId, vehicleId]
    );

    // Formater les résultats
    const locationData = result.rows.map(row => ({
      location: row.location,
      count: parseInt(row.count),
      totalKwh: parseFloat(row.total_kwh) || 0
    }));

    res.json(locationData);

  } catch (error) {
    console.error('Erreur lors de la récupération des données par localisation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================================
// ENDPOINT 3: Recharges hebdomadaires (Graphique linéaire)
// ========================================
router.get('/stats/weekly-charges', async (req, res) => {
  const { userId, vehicleId, weeks = 8 } = req.query; // Par défaut 8 semaines

  try {
    // Récupérer les données des N dernières semaines
    const result = await pool.query(
      `
      SELECT 
        DATE_TRUNC('week', date) as week_start,
        SUM(kwh) as total_kwh,
        COUNT(*) as charge_count,
        SUM(cost) as total_cost
      FROM charges
      WHERE user_id = $1 
        AND vehicle_id = $2
        AND date >= NOW() - INTERVAL '${parseInt(weeks)} weeks'
      GROUP BY DATE_TRUNC('week', date)
      ORDER BY week_start ASC
      `,
      [userId, vehicleId]
    );

    // Formater les résultats avec des noms de semaines lisibles
    const weeklyData = result.rows.map(row => {
      const weekStart = new Date(row.week_start);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      // Format : "14-20 Jan"
      const formatDate = (date) => {
        const day = date.getDate();
        const month = date.toLocaleDateString('fr-FR', { month: 'short' });
        return `${day} ${month}`;
      };

      return {
        weekLabel: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
        weekStart: row.week_start,
        totalKwh: parseFloat(row.total_kwh) || 0,
        chargeCount: parseInt(row.charge_count) || 0,
        totalCost: parseFloat(row.total_cost) || 0,
      };
    });

    res.json(weeklyData);

  } catch (error) {
    console.error('Erreur lors de la récupération des données hebdomadaires:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========================================
// ALTERNATIVE: Par numéro de semaine (Semaine 1, Semaine 2, etc.)
// ========================================
router.get('/stats/weekly-charges-numbered', async (req, res) => {
  const { userId, vehicleId, weeks = 8 } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT 
        EXTRACT(WEEK FROM date) as week_number,
        EXTRACT(YEAR FROM date) as year,
        SUM(kwh) as total_kwh,
        COUNT(*) as charge_count,
        MIN(date) as week_start
      FROM charges
      WHERE user_id = $1 
        AND vehicle_id = $2
        AND date >= NOW() - INTERVAL '${parseInt(weeks)} weeks'
      GROUP BY EXTRACT(WEEK FROM date), EXTRACT(YEAR FROM date)
      ORDER BY year ASC, week_number ASC
      `,
      [userId, vehicleId]
    );

    const weeklyData = result.rows.map(row => ({
      weekLabel: `Semaine ${row.week_number}`,
      weekNumber: parseInt(row.week_number),
      year: parseInt(row.year),
      totalKwh: parseFloat(row.total_kwh) || 0,
      chargeCount: parseInt(row.charge_count) || 0,
      weekStart: row.week_start,
    }));

    res.json(weeklyData);

  } catch (error) {
    console.error('Erreur lors de la récupération des données hebdomadaires:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;