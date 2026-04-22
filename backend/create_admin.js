const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'mysql-for-nccecare-malshannandanayaka-3b82.a.aivencloud.com',
    port: process.env.DB_PORT || 19185,
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};

async function createAdmin() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const username = 'nccadmin';
        const password = 'Ncc@12345';
        const role = 'Admin';
        const status = 'Active';

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Check if user exists
        const [rows] = await connection.execute('SELECT * FROM staff WHERE username = ?', [username]);
        if (rows.length > 0) {
            console.log(`User "${username}" already exists.`);
            // Update password just in case
            await connection.execute('UPDATE staff SET password_hash = ? WHERE username = ?', [hashedPassword, username]);
            console.log(`Password updated for "${username}".`);
        } else {
            // Insert user
            await connection.execute(
                'INSERT INTO staff (username, password_hash, role, account_status) VALUES (?, ?, ?, ?)',
                [username, hashedPassword, role, status]
            );
            console.log('Admin user created successfully.');
        }

        console.log('Credentials:');
        console.log(`Username: ${username}`);
        console.log(`Password: ${password}`);

    } catch (error) {
        console.error('Error creating admin:');
        console.error('Code:', error.code);
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        if (connection) await connection.end();
    }
}

createAdmin();
