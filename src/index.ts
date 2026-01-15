import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import { testDatabaseConnection } from './config/database';
import apiRoutes from './routes';

dotenv.config();

const app = express();

// --- FIX: Trust the Vercel Proxy ---
// This is required because Vercel puts your app behind a proxy.
// Without this, express-rate-limit crashes because it sees the proxy's IP.
app.set('trust proxy', 1);
// -----------------------------------

const API_PREFIX = process.env.API_PREFIX || '/api';

// Security middleware
app.use(helmet());

// CORS configuration updated to allow the custom idempotency header
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'], 
}));

// Body parser
app.use(express.json());

// Logger
app.use(morgan('dev'));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, 
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiter to all API routes
app.use(API_PREFIX, apiLimiter);

// Main API routes
app.use(API_PREFIX, apiRoutes);

// Generic error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 5000;

// Test database connection and start server
testDatabaseConnection()
  .then(() => {
    console.log("Database connection test completed successfully.");
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database connection test FAILED:", error);
    process.exit(1);
  });

export default app;