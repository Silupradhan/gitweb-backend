import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import notFound from './middlewares/notFound.js';
import errorHandler from './middlewares/errorHandler.js';
import routes from './routes/index.js';
import healthRoutes from './modules/health/health.routes.js';
import webhookRoutes from './modules/webhooks/webhook.routes.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Webhook deliveries endpoint (mounted before global express.json to preserve raw bytes for HMAC check)
app.use('/webhooks', webhookRoutes);

app.use(express.json());
app.use(express.static('public'));

app.use('/health', healthRoutes);
app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
