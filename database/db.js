const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conexión a la base de datos logistica.db
const dbPath = path.resolve(__dirname, 'logistica.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con la base de datos:', err.message);
    } else {
        console.log('Conectado exitosamente a la base de datos SQLite.');
    }
});

// Activar soporte de claves foráneas
db.run('PRAGMA foreign_keys = ON;');

module.exports = db;