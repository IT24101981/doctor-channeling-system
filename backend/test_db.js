const { query } = require('./config/db');

async function testConnection() {
    try {
        console.log('Testing database connection...');
        const result = await query('SELECT 1 + 1 AS solution');
        console.log('Database connection successful!');
        console.log('Result:', result[0]);
        
        console.log('\nChecking tables...');
        const [tables] = await query('SHOW TABLES');
        console.log('Tables found in database:', tables.map(t => Object.values(t)[0]));
        
        process.exit(0);
    } catch (error) {
        console.error('Database connection failed!');
        console.error('Error Details:', error.message);
        console.error('Error Code:', error.code);
        process.exit(1);
    }
}

testConnection();
