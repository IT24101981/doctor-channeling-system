const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const dotenv = require('dotenv');
// Always load backend/.env regardless of CWD (root scripts vs backend scripts).
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// SSL configuration for Aiven cloud database
let sslConfig = false;
if (process.env.DB_SSL === 'true') {
    const caPath = path.join(__dirname, '..', 'ca.pem');
    if (fs.existsSync(caPath)) {
        sslConfig = {
            ca: fs.readFileSync(caPath),
            rejectUnauthorized: true
        };
    } else {
        sslConfig = {
            rejectUnauthorized: false
        };
    }
}

const poolConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: sslConfig,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 30000,
};

const pool = mysql.createPool(poolConfig);

// Silently handle idle connection drops (Aiven drops inactive connections)
// Session timezone: Sri Lanka (UTC+5:30) so NOW() / TIMESTAMP display match local standard time.
pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+05:30'", () => {});
    connection.on('error', (err) => {
        if (err.code !== 'ECONNRESET' && err.code !== 'PROTOCOL_CONNECTION_LOST') {
            console.error('Unexpected DB connection error:', err);
        }
    });
});

// Retry execute/query once on ECONNRESET so the pool can grab a fresh connection
const promisePool = pool.promise();

const retryOnReset = (method) => async (...args) => {
    try {
        return await promisePool[method](...args);
    } catch (err) {
        if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.log(`[DB] Connection reset, retrying ${method}...`);
            return await promisePool[method](...args);
        }
        throw err;
    }
};

module.exports = {
    execute: retryOnReset('execute'),
    query: retryOnReset('query'),
    getConnection: () => promisePool.getConnection(),
};