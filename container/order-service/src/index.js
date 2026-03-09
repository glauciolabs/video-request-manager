import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { ordersRouter } from './routes/orders.js';
import { errorHandler } from './middlewares/error-handler.js';
import { httpLogger } from './lib/logger.js';
import { requireServiceToken } from './middlewares/auth.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(httpLogger);

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'order-service' }));

// All protected routes are expected to come from gateway with service token.
app.use('/orders', requireServiceToken, ordersRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`order-service listening on ${port}`);
});
