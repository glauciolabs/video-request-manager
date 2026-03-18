import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { notificationsRouter } from './routes/notifications.js';
import { requireServiceToken } from './middlewares/auth.js';
import { errorHandler } from './middlewares/error-handler.js';
import { httpLogger } from './lib/logger.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3003);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(httpLogger);

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'notification-service' }));
app.use('/notifications', requireServiceToken, notificationsRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`notification-service listening on ${port}`);
});
