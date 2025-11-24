// shared/config/cors.config.js

// Parse allowed origins from env
const parseAllowedOrigins = () => {
  const envOrigins = process.env.ALLOWED_ORIGINS;

  if (!envOrigins) {
    // Default para desenvolvimento
    return [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:5173'
    ];
  }

  return envOrigins.split(',').map(origin => origin.trim());
};

const allowedOrigins = parseAllowedOrigins();

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir requests sem origin (mobile apps, postman, etc)
    if (!origin && process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} não permitida por CORS`), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  maxAge: 86400, // 24 horas
  optionsSuccessStatus: 204
};

module.exports = corsOptions;
