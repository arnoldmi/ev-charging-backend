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

// ─── Helper : construit la clause WHERE avec filtre de dates optionnel ─────────
// Retourne { clause, params } en ajoutant $N, $N+1 si les dates sont présentes.
// baseParams : tableau des paramètres déjà existants (ex: [userId, vehicleId])
function buildDateFilter(startDate, endDate, baseParams, dateColumn = 'date') {
  const params = [...baseParams];
  const conditions = [];

  if (startDate) {
    params.push(startDate);
    conditions.push(`${dateColumn} >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`${dateColumn} <= $${params.length}`);
  }

  return {
    clause: conditions.length ? ' AND ' + conditions.join(' AND ') : '',
    params,
  };
}

// ─── Statistiques globales ────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const { userId, vehicleId } = req.query;
  try {
    const result = await pool.query(
      `SELECT
        (SUM(kwh)*100)/(max(mileage)-min(mileage)) as avg_consumption,
        SUM(cost)/(max(mileage)-min(mileage)) as avg_cost_per_km,
        COUNT(*) as total_charges
      FROM charges
      WHERE user_id = $1 AND vehicle_id = $2`,
      [userId, vehicleId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Statistiques de consommation ────────────────────────────────────────────
router.get('/stats/consumption', async (req, res) => {
  const { vehicleId } = req.query;
  try {
    const result = await pool.query(
      `SELECT
        (SUM(kwh)*100)/(max(mileage)-min(mileage)) as avg_consumption_per_100km,
        SUM(cost)/SUM(kwh) as avg_cost_per_kwh
      FROM charges
      WHERE vehicle_id = $1 AND mileage IS NOT NULL`,
      [vehicleId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Statistiques globales (dashboard) ───────────────────────────────────────
router.get('/stats/global', async (req, res) => {
  const { userId, vehicleId } = req.query;
  try {
    const result = await pool.query(
      `SELECT
        (SUM(kwh)*100)/(max(mileage)-min(mileage)) as avg_consumption,
        SUM(cost)/SUM(kwh) AS avg_cost_per_kwh,
        SUM(cost)/(max(mileage)-min(mileage)) as avg_cost_per_km,
        COUNT(*) as total_charges
      FROM charges
      WHERE user_id = $1 AND vehicle_id = $2`,
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

// ─── Données brutes des recharges ─────────────────────────────────────────────
router.get('/stats/charges', async (req, res) => {
  const { userId, vehicleId } = req.query;
  try {
    const result = await pool.query(
      `SELECT
        date, kwh, cost, mileage,
        LAG(mileage) OVER (ORDER BY date) AS prev_mileage
      FROM charges
      WHERE user_id = $1 AND vehicle_id = $2
      ORDER BY date`,
      [userId, vehicleId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Statistiques cumulatives ─────────────────────────────────────────────────
router.get('/stats/cumulative', async (req, res) => {
  const { userId, vehicleId } = req.query;
  try {
    const [mileageResult, kwhResult, costResult, distanceResult, totalChargesResult] =
      await Promise.all([
        pool.query(
          'SELECT MAX(mileage) AS total_mileage FROM charges WHERE user_id = $1 AND vehicle_id = $2',
          [userId, vehicleId]
        ),
        pool.query(
          'SELECT SUM(kwh) AS total_kwh FROM charges WHERE user_id = $1 AND vehicle_id = $2',
          [userId, vehicleId]
        ),
        pool.query(
          'SELECT SUM(cost) AS total_cost FROM charges WHERE user_id = $1 AND vehicle_id = $2',
          [userId, vehicleId]
        ),
        pool.query(
          `WITH distances AS (
            SELECT mileage - LAG(mileage) OVER (ORDER BY date) AS distance
            FROM charges
            WHERE user_id = $1 AND vehicle_id = $2
          )
          SELECT COALESCE(SUM(distance), 0) AS total_distance
          FROM distances
          WHERE distance IS NOT NULL AND distance > 0`,
          [userId, vehicleId]
        ),
        pool.query(
          'SELECT COUNT(*) AS total_charges FROM charges WHERE user_id = $1 AND vehicle_id = $2',
          [userId, vehicleId]
        ),
      ]);

    res.json({
      totalMileage: mileageResult.rows[0].total_mileage
        ? parseFloat(parseFloat(mileageResult.rows[0].total_mileage).toFixed(2)) : 0,
      totalKwh: kwhResult.rows[0].total_kwh
        ? parseFloat(parseFloat(kwhResult.rows[0].total_kwh).toFixed(2)) : 0,
      totalCost: costResult.rows[0].total_cost
        ? parseFloat(parseFloat(costResult.rows[0].total_cost).toFixed(2)) : 0,
      totalDistance: distanceResult.rows[0].total_distance
        ? parseFloat(parseFloat(distanceResult.rows[0].total_distance).toFixed(2)) : 0,
      totalCharges: totalChargesResult.rows[0].total_charges
        ? parseInt(totalChargesResult.rows[0].total_charges) : 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Recharges mensuelles (barres) — avec filtre de période ──────────────────
router.get('/stats/monthly-charges', async (req, res) => {
  const { userId, vehicleId, startDate, endDate } = req.query;

  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    const monthNames = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
    ];

    // Pour ce graphique on filtre toujours sur les 2 derniers mois visibles
    // mais on applique quand même le filtre de période pour borner l'historique
    const { clause: dateClause, params: currentParams } = buildDateFilter(
      startDate, endDate, [userId, vehicleId, currentMonth, currentYear]
    );
    const { clause: dateClauses2, params: prevParams } = buildDateFilter(
      startDate, endDate, [userId, vehicleId, previousMonth, previousYear]
    );

    const [currentResult, previousResult] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(kwh), 0) as total
        FROM charges
        WHERE user_id = $1 AND vehicle_id = $2
          AND EXTRACT(MONTH FROM date) = $3
          AND EXTRACT(YEAR FROM date) = $4
          ${dateClause}`,
        currentParams
      ),
      pool.query(
        `SELECT COALESCE(SUM(kwh), 0) as total
        FROM charges
        WHERE user_id = $1 AND vehicle_id = $2
          AND EXTRACT(MONTH FROM date) = $3
          AND EXTRACT(YEAR FROM date) = $4
          ${dateClauses2}`,
        prevParams
      ),
    ]);

    res.json({
      currentMonth: parseFloat(currentResult.rows[0].total) || 0,
      previousMonth: parseFloat(previousResult.rows[0].total) || 0,
      currentMonthName: monthNames[currentMonth - 1],
      previousMonthName: monthNames[previousMonth - 1],
    });
  } catch (error) {
    console.error('Erreur monthly-charges:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Recharges par localisation (camembert) — avec filtre de période ─────────
router.get('/stats/charges-by-location', async (req, res) => {
  const { userId, vehicleId, startDate, endDate } = req.query;

  try {
    const { clause: dateClause, params } = buildDateFilter(
      startDate, endDate, [userId, vehicleId]
    );

    const result = await pool.query(
      `SELECT
        location,
        COUNT(*) as count,
        SUM(kwh) as total_kwh
      FROM charges
      WHERE user_id = $1 AND vehicle_id = $2
        ${dateClause}
      GROUP BY location
      ORDER BY count DESC`,
      params
    );

    res.json(
      result.rows.map((row) => ({
        location: row.location,
        count: parseInt(row.count),
        totalKwh: parseFloat(row.total_kwh) || 0,
      }))
    );
  } catch (error) {
    console.error('Erreur charges-by-location:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Recharges hebdomadaires ──────────────────────────────────────────────────
router.get('/stats/weekly-charges', async (req, res) => {
  const { userId, vehicleId, weeks = 8 } = req.query;

  try {
    const result = await pool.query(
      `SELECT
        DATE_TRUNC('week', date) as week_start,
        SUM(kwh) as total_kwh,
        COUNT(*) as charge_count,
        SUM(cost) as total_cost
      FROM charges
      WHERE user_id = $1
        AND vehicle_id = $2
        AND date >= NOW() - INTERVAL '${parseInt(weeks)} weeks'
      GROUP BY DATE_TRUNC('week', date)
      ORDER BY week_start ASC`,
      [userId, vehicleId]
    );

    const weeklyData = result.rows.map((row) => {
      const weekStart = new Date(row.week_start);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const fmt = (d) => `${d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'short' })}`;
      return {
        weekLabel: `${fmt(weekStart)} - ${fmt(weekEnd)}`,
        weekStart: row.week_start,
        totalKwh: parseFloat(row.total_kwh) || 0,
        chargeCount: parseInt(row.charge_count) || 0,
        totalCost: parseFloat(row.total_cost) || 0,
      };
    });

    res.json(weeklyData);
  } catch (error) {
    console.error('Erreur weekly-charges:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Recharges hebdomadaires numérotées ───────────────────────────────────────
router.get('/stats/weekly-charges-numbered', async (req, res) => {
  const { userId, vehicleId, weeks = 8 } = req.query;

  try {
    const result = await pool.query(
      `SELECT
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
      ORDER BY year ASC, week_number ASC`,
      [userId, vehicleId]
    );

    res.json(
      result.rows.map((row) => ({
        weekLabel: `Semaine ${row.week_number}`,
        weekNumber: parseInt(row.week_number),
        year: parseInt(row.year),
        totalKwh: parseFloat(row.total_kwh) || 0,
        chargeCount: parseInt(row.charge_count) || 0,
        weekStart: row.week_start,
      }))
    );
  } catch (error) {
    console.error('Erreur weekly-charges-numbered:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── NOUVEAU : Évolution de la consommation moyenne par semaine ou par mois ───
//
// Params: userId, vehicleId, granularity ('week'|'month'), startDate?, endDate?
//
// Pour calculer la consommation kWh/100km on a besoin du kilométrage entre deux
// recharges successives. On utilise une fenêtre LAG pour obtenir le delta de
// kilométrage, puis on agrège par période.
//
router.get('/stats/consumption-evolution', async (req, res) => {
  const { userId, vehicleId, granularity = 'month', startDate, endDate } = req.query;

  // Validation de la granularité pour éviter toute injection
  const safeGranularity = granularity === 'week' ? 'week' : 'month';

  // Format d'affichage selon la granularité
  const labelFormat =
    safeGranularity === 'week'
      ? `TO_CHAR(period_start, 'DD Mon')`
      : `TO_CHAR(period_start, 'Mon YYYY')`;

  try {
    const { clause: dateClause, params } = buildDateFilter(
      startDate, endDate, [userId, vehicleId]
    );

    // Étape 1 : calculer le delta km entre chaque recharge consécutive
    // Étape 2 : agréger par période (semaine ou mois)
    const result = await pool.query(
      `WITH charges_with_delta AS (
        SELECT
          date,
          kwh,
          cost,
          mileage,
          mileage - LAG(mileage) OVER (ORDER BY date) AS delta_km
        FROM charges
        WHERE user_id = $1 AND vehicle_id = $2
          ${dateClause}
      ),
      by_period AS (
        SELECT
          DATE_TRUNC('${safeGranularity}', date) AS period_start,
          SUM(kwh)                                AS total_kwh,
          SUM(CASE WHEN delta_km > 0 THEN delta_km ELSE NULL END) AS total_km,
          SUM(cost)                               AS total_cost,
          COUNT(*)                                AS charge_count
        FROM charges_with_delta
        GROUP BY DATE_TRUNC('${safeGranularity}', date)
        ORDER BY period_start ASC
      )
      SELECT
        period_start,
        ${labelFormat} AS label,
        total_kwh,
        total_km,
        total_cost,
        charge_count,
        CASE WHEN total_km > 0 THEN (total_kwh * 100.0 / total_km) ELSE NULL END AS avg_consumption,
        CASE WHEN total_kwh > 0 THEN (total_cost / total_kwh)        ELSE NULL END AS avg_cost_per_kwh
      FROM by_period`,
      params
    );

    const evolution = result.rows
      .filter((row) => row.avg_consumption !== null)
      .map((row) => ({
        label: row.label,
        periodStart: row.period_start,
        avgConsumption: parseFloat(parseFloat(row.avg_consumption).toFixed(2)),
        avgCostPerKwh: parseFloat(parseFloat(row.avg_cost_per_kwh || 0).toFixed(4)),
        totalKwh: parseFloat(parseFloat(row.total_kwh).toFixed(2)),
        chargeCount: parseInt(row.charge_count),
      }));

    res.json(evolution);
  } catch (error) {
    console.error('Erreur consumption-evolution:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
