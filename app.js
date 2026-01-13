const express = require('express');
const cors = require('cors');
require('dotenv').config();
const userRoutes = require('./routes/users');
const vehicleRoutes = require('./routes/vehicles');
const preferencesRoutes = require('./routes/preferences');
const statsRoutes = require('./routes/stats');
const chargesRoutes = require('./routes/charges');
const { Pool } = require('pg');


const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', userRoutes);
app.use('/api', vehicleRoutes);
app.use('/api', statsRoutes);
app.use('/api', preferencesRoutes);
app.use('/api', chargesRoutes);

console.log({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ? '*****' : undefined, // Masque le mot de passe
  database: process.env.DB_NAME,
});


app.listen(3001, () => {
  console.log('Server running on port 3001');
});
