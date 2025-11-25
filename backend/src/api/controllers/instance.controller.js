const pool = require('../../infrastructure/database/postgres');
const { AppError } = require('../../shared/errors/AppError');
const logger = require('../../shared/config/logger.config');

const listInstances = async (req, res) => {
    const result = await pool.query(
        'SELECT id, name, instance_key, status, created_at FROM whatsapp_instances ORDER BY created_at ASC'
    );
    res.json(result.rows);
};

const createInstance = async (req, res) => {
    const { name, instanceKey } = req.body;

    if (!name || !instanceKey) {
        throw new AppError('Name and Instance Key are required', 400);
    }

    try {
        const result = await pool.query(
            `INSERT INTO whatsapp_instances (name, instance_key, status)
       VALUES ($1, $2, 'disconnected')
       RETURNING id, name, instance_key, status`,
            [name, instanceKey]
        );

        logger.info('New instance created', { instanceId: result.rows[0].id });
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            throw new AppError('Instance Key already exists', 409);
        }
        throw error;
    }
};

module.exports = {
    listInstances,
    createInstance
};
