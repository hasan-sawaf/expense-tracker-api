import { z } from 'zod';
import {
    ALL_CATEGORIES,
    CURRENCIES,
    TRANSACTION_TYPES,
} from '../models/expense.model.js';
import { DEFAULT_EXCHANGE_RATE } from '../utils/currency.js';

export const conversionSchema = z.object({
    usdAmount: z.number().positive('Converted USD amount must be greater than 0'),
    exchangeRate: z.number().positive('Exchange rate must be greater than 0'),
    date: z.coerce.date().optional(),
    notes: z.string().trim().max(200, 'Notes cannot exceed 200 characters').optional(),
});

const baseExpenseFields = {
    title: z.string().trim().min(1, 'Title is required'),
    type: z.enum(TRANSACTION_TYPES),
    amount: z.number().positive('Amount must be greater than 0'),
    currency: z.enum(CURRENCIES),
    exchangeRate: z.number().positive('Exchange rate must be greater than 0'),
    category: z.enum(ALL_CATEGORIES, {
        message: `Category must be one of: ${ALL_CATEGORIES.join(', ')}`,
    }),
    date: z.coerce.date().optional(),
    notes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').optional(),
};

export const createExpenseSchema = z.object({
    ...baseExpenseFields,
    type: baseExpenseFields.type.default('expense'),
    currency: baseExpenseFields.currency.default('USD'),
    exchangeRate: baseExpenseFields.exchangeRate.default(DEFAULT_EXCHANGE_RATE),
    conversions: z.array(conversionSchema).optional(),
});

// Keep fields truly optional without re-applying defaults during PATCH updates
export const updateExpenseSchema = z.object(baseExpenseFields).partial();
