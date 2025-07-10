// import express from 'express';
// import dotenv from 'dotenv';
// import cors from 'cors';
// import helmet from 'helmet';
// import rateLimit from 'express-rate-limit';
// import morgan from 'morgan';

// import { testDatabaseConnection } from './config/database';
// import apiRoutes from './routes';

// dotenv.config();

// const app = express();
// const API_PREFIX = process.env.API_PREFIX || '/api';

// app.use(helmet());

// app.use(cors({
//   origin: process.env.CORS_ORIGIN || '*',
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
// }));

// app.use(express.json());

// app.use(morgan('dev'));

// const apiLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100,
//   message: 'Too many requests from this IP, please try again after 15 minutes',
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// app.use(API_PREFIX, apiLimiter);

// app.use(API_PREFIX, apiRoutes);

// app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
//   console.error(err.stack);
//   res.status(500).send('Something broke!');
// });

// export default app;

// testDatabaseConnection().then(() => {
//     console.log("Database connection test completed successfully on Vercel startup.");
// }).catch(error => {
//     console.error("Database connection test FAILED on Vercel startup:", error);
// });

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
const API_PREFIX = process.env.API_PREFIX || '/api';

app.use(helmet());

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.use(morgan('dev'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(API_PREFIX, apiLimiter);

app.use(API_PREFIX, apiRoutes);

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 5000;

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
