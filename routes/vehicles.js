// routes/vehicles.js - Routes pour la gestion des véhicules

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
// GET /api/vehicles - Récupérer TOUS les véhicules
// ========================================
router.get('/vehicles', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vehicles ORDER BY id ASC'
    );
    
    //console.log(`[GET /api/vehicles] Retourne ${result.rows.length} véhicules`);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des véhicules:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des véhicules' });
  }
});

// ========================================
// GET /api/vehicles/user/:userId - Récupérer les véhicules d'UN utilisateur
// ========================================
router.get('/vehicles/user/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM vehicles WHERE user_id = $1 ORDER BY id ASC',
      [userId]
    );
    
    //console.log(`[GET /api/vehicles/user/${userId}] Retourne ${result.rows.length} véhicules`);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des véhicules de l\'utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des véhicules' });
  }
});

// ========================================
// GET /api/vehicles/:id - Récupérer UN véhicule par son ID
// ========================================
router.get('/vehicles/:id', async (req, res) => {
  const { id } = req.params;
  
  // Vérifier que l'ID est un nombre (et non "user")
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID de véhicule invalide' });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Véhicule non trouvé' });
    }
    
    //console.log(`[GET /api/vehicles/${id}] Véhicule trouvé`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération du véhicule:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du véhicule' });
  }
});

// ========================================
// POST /api/vehicles - Créer un nouveau véhicule
// ========================================
router.post('/vehicles', async (req, res) => {
  const { userId, model, batteryCapacity, range, color } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO vehicles (user_id, model, battery_capacity, range, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, model, batteryCapacity, range, color]
    );
    
    //console.log(`[POST /api/vehicles] Véhicule créé pour user ${userId}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la création du véhicule:', error);
    res.status(500).json({ error: 'Erreur lors de la création du véhicule' });
  }
});

// ========================================
// PUT /api/vehicles/:id - Mettre à jour un véhicule
// ========================================
router.put('/vehicles/:id', async (req, res) => {
  const { id } = req.params;
  const { model, batteryCapacity, range, color } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE vehicles 
       SET model = $1, battery_capacity = $2, range = $3, color = $4
       WHERE id = $5
       RETURNING *`,
      [model, batteryCapacity, range, color, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Véhicule non trouvé' });
    }
    
    //console.log(`[PUT /api/vehicles/${id}] Véhicule mis à jour`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du véhicule:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du véhicule' });
  }
});

// ========================================
// DELETE /api/vehicles/:id - Supprimer un véhicule
// ========================================
router.delete('/vehicles/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Vérifier si le véhicule existe
    const vehicleCheck = await pool.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [id]
    );
    
    if (vehicleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Véhicule non trouvé' });
    }
    
    // Supprimer les recharges associées
    await pool.query(
      'DELETE FROM charges WHERE vehicle_id = $1',
      [id]
    );
    
    // Mettre à jour les préférences qui référencent ce véhicule
    await pool.query(
      'UPDATE preferences SET selected_vehicle_id = NULL WHERE selected_vehicle_id = $1',
      [id]
    );
    
    // Supprimer le véhicule
    await pool.query(
      'DELETE FROM vehicles WHERE id = $1',
      [id]
    );
    
    //console.log(`[DELETE /api/vehicles/${id}] Véhicule supprimé`);
    res.json({
      message: 'Véhicule supprimé avec succès',
      id: parseInt(id)
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du véhicule:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du véhicule' });
  }
});

module.exports = router;