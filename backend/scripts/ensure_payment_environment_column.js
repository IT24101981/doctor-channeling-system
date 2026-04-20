require('dotenv').config();
const db = require('../config/db');

(async () => {
    try {
        const [rows] = await db.execute(
            `SELECT COUNT(*) AS c
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'payments'
               AND COLUMN_NAME = 'payment_environment'`
        );
        if (Number(rows[0].c) === 0) {
            await db.execute(
                `ALTER TABLE payments
                 ADD COLUMN payment_environment VARCHAR(20) NULL DEFAULT NULL AFTER payment_status`
            );
            console.log('Added column payments.payment_environment');
        } else {
            console.log('Column payments.payment_environment already exists');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
