const db = require('./config/db');

async function addMarkedColumn() {
    try {
        await db.execute('ALTER TABLE doc_availability_slots ADD COLUMN Marked TINYINT(1) DEFAULT 0');
        console.log('Successfully added Marked column to doc_availability_slots');
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Column Marked already exists');
        } else {
            console.error('Error adding column:', error);
        }
    } finally {
        process.exit();
    }
}

addMarkedColumn();
