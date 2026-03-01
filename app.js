const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { Pool } = require('pg');


const app = express();

// CORS - Autoriser votre domaine frontend
const corsOptions = {
  origin: [
    'https://evcdashboard.mongo-ibara.fr',
    'https://www.evcdashboard.mongo-ibara.fr',
    'http://localhost:3000' // Pour dev local
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors());
app.use(express.json());


// Configuration PostgreSQL O2Switch
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: false // O2Switch ne nécessite pas SSL pour localhost
});

// Test de connexion
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Erreur connexion BDD:', err);
  } else {
    console.log('✅ Connecté à PostgreSQL:', res.rows[0]);
  }
});

// Routes
const userRoutes = require('./routes/users');
const vehicleRoutes = require('./routes/vehicles');
const preferencesRoutes = require('./routes/preferences');
const statsRoutes = require('./routes/stats');
const chargesRoutes = require('./routes/charges');

app.use('/api', userRoutes);
app.use('/api', vehicleRoutes);
app.use('/api', statsRoutes);
app.use('/api', preferencesRoutes);
app.use('/api', chargesRoutes);

/* console.log({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ? '*****' : undefined, // Masque le mot de passe
  database: process.env.DB_NAME,
}); */

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'Connected'
  });
});

// Gestion 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Port assigné par O2Switch
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend démarré sur le port ${PORT}`);
});