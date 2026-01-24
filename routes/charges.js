// routes/charges.js - Routes pour la gestion des recharges

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

// ========================================
// GET /api/charges - Récupérer les recharges
// ========================================
router.get('/charges', async (req, res) => {
  const { userId, vehicleId } = req.query;
  
  try {
    let query = 'SELECT * FROM charges';
    let params = [];
    let conditions = [];
    
    // Filtrer par userId si fourni
    if (userId) {
      conditions.push(`user_id = $${conditions.length + 1}`);
      params.push(userId);
    }
    
    // Filtrer par vehicleId si fourni
    if (vehicleId) {
      conditions.push(`vehicle_id = $${conditions.length + 1}`);
      params.push(vehicleId);
    }
    
    // Ajouter les conditions WHERE si nécessaire
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Trier par date décroissante
    query += ' ORDER BY date DESC';
    
    const result = await pool.query(query, params);
    
    // console.log(`[GET /api/charges] Retourne ${result.rows.length} recharges`);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des recharges:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des recharges' });
  }
});

// ========================================
// GET /api/charges/:id - Récupérer UNE recharge
// ========================================
router.get('/charges/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM charges WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recharge non trouvée' });
    }
    
    // console.log(`[GET /api/charges/${id}] Recharge trouvée`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération de la recharge:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la recharge' });
  }
});

// ========================================
// GET /api/charges/latest/:vehicleId - Dernière recharge d'un véhicule
// ========================================
router.get('/charges/latest/:vehicleId', async (req, res) => {
  const { vehicleId } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT * FROM charges 
       WHERE vehicle_id = $1 
       ORDER BY date DESC, id DESC 
       LIMIT 1`,
      [vehicleId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aucune recharge trouvée pour ce véhicule' });
    }
    
    // console.log(`[GET /api/charges/latest/${vehicleId}] Dernière recharge trouvée`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération de la dernière recharge:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la dernière recharge' });
  }
});

// ========================================
// POST /api/charges - Créer une nouvelle recharge
// ========================================
router.post('/charges', async (req, res) => {
  const { userId, vehicleId, date, kwh, cost, mileage, location } = req.body;
  
  // Validation des données
  if (!userId || !vehicleId || !date || !kwh || !cost || !mileage || !location) {
    return res.status(400).json({ 
      error: 'Tous les champs sont requis (userId, vehicleId, date, kwh, cost, mileage, location)' 
    });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO charges (user_id, vehicle_id, date, kwh, cost, mileage, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, vehicleId, date, kwh, cost, mileage, location]
    );
    
    // console.log(`[POST /api/charges] Recharge créée pour user ${userId}, vehicle ${vehicleId}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la création de la recharge:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la recharge' });
  }
});

// ========================================
// PUT /api/charges/:id - Mettre à jour une recharge
// ========================================
router.put('/charges/:id', async (req, res) => {
  const { id } = req.params;
  const { date, kwh, cost, mileage, location } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE charges 
       SET date = $1, kwh = $2, cost = $3, mileage = $4, location = $5
       WHERE id = $6
       RETURNING *`,
      [date, kwh, cost, mileage, location, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recharge non trouvée' });
    }
    
    // console.log(`[PUT /api/charges/${id}] Recharge mise à jour`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la recharge:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la recharge' });
  }
});

// ========================================
// DELETE /api/charges/:id - Supprimer une recharge
// ========================================
router.delete('/charges/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Vérifier si la recharge existe
    const chargeCheck = await pool.query(
      'SELECT * FROM charges WHERE id = $1',
      [id]
    );
    
    if (chargeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Recharge non trouvée' });
    }
    
    // Supprimer la recharge
    await pool.query(
      'DELETE FROM charges WHERE id = $1',
      [id]
    );
    
    // console.log(`[DELETE /api/charges/${id}] Recharge supprimée`);
    res.json({
      message: 'Recharge supprimée avec succès',
      id: parseInt(id)
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la recharge:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la recharge' });
  }
});


module.exports = router;