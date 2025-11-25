const pool = require('../../infrastructure/database/postgres');
const { AppError } = require('../../shared/errors/AppError');
const logger = require('../../shared/config/logger.config');

/**
 * Middleware to extract and validate the instance ID from headers.
 * Header format: x-instance-id: <uuid>
 */
const instanceMiddleware = async (req, res, next) => {
    try {
        const instanceId = req.headers['x-instance-id'];

        if (!instanceId) {
            // For backward compatibility or public routes, we might allow missing instance
            // But for protected routes, we should enforce it.
            // For now, let's just log and maybe set a default if we want to be nice,
            // but strict mode is better for multi-tenancy.
            // However, some routes (like login) might not have it yet.
            // We will assume this middleware is applied to routes that NEED context.
            throw new AppError('Instance ID header (x-instance-id) is missing', 400);
        }

        // Validate UUID format (basic check)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(instanceId)) {
            throw new AppError('Invalid Instance ID format', 400);
        }

        const result = await pool.query(
            'SELECT * FROM whatsapp_instances WHERE id = $1',
            [instanceId]
        );

        if (result.rows.length === 0) {
            throw new AppError('Instance not found', 404);
        }

        req.instance = result.rows[0];
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = { instanceMiddleware };
