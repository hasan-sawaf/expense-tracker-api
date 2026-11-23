import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import expenseRoutes from './routes/expense.route.js';
import { errorHandler } from './middlewares/error.middleware.js';
import AppError from './utils/appError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../frontend');

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'API is running' });
});

app.use('/api/v1/expenses', expenseRoutes);

// Serve Frontend UI statically on the same server
app.use(express.static(frontendDir));

// Catch-all for undefined routes (must come after all valid routes)
app.use((req, res, next) => {
    next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

// Centralized Error Handler (must be the very last middleware)
app.use(errorHandler);

export default app;
