import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import notFound from './middlewares/notFound.js';
import errorHandler from './middlewares/errorHandler.js';
import routes from './routes/index.js';
import healthRoutes from './modules/health/health.routes.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.static('public'));

app.use('/health', healthRoutes);
app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
