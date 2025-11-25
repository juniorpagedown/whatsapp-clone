require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'whatsapp_clone',
    user: 'whatsapp_user',
    password: 'Mr92uc73',
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Running migration 004_add_instance_indices.sql...');
        const sql = fs.readFileSync(path.join(__dirname, '../database/migrations/004_add_instance_indices.sql'), 'utf8');
        await client.query(sql);
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
