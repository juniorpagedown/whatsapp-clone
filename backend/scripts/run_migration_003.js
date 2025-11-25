require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'whatsapp_clone',
    user: 'postgres', // Fallback to default superuser
    password: 'Mr92uc73', // Try the password from docker-compose
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Starting migration 003_multi_instance_schema...');

        const migrationPath = path.join(__dirname, '../migrations/003_multi_instance_schema.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        await client.query(sql);

        console.log('✅ Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
