import mongoose from 'mongoose';
import { DEFAULT_EXCHANGE_RATE } from '../utils/currency.js';

export const TRANSACTION_TYPES = ['expense', 'income'];
export const CURRENCIES = ['USD', 'SYP'];

export const EXPENSE_CATEGORIES = [
    'food',
    'transport',
    'utilities',
    'entertainment',
    'shopping',
    'health',
    'education',
    'other',
];

export const INCOME_CATEGORIES = [
    'salary',
    'freelance',
    'business',
    'gift',
    'investment',
    'other',
];

export const ALL_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])];

const conversionSchema = new mongoose.Schema(
    {
        usdAmount: {
            type: Number,
            required: true,
            min: [0.01, 'Converted USD amount must be greater than 0'],
        },
        exchangeRate: {
            type: Number,
            required: true,
            min: [1, 'Exchange rate must be positive'],
        },
        sypAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        date: {
            type: Date,
            default: Date.now,
        },
        notes: {
            type: String,
            trim: true,
            default: '',
        },
    },
    { _id: true }
);

const expenseSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Title is required'],
            trim: true,
        },
        type: {
            type: String,
            enum: TRANSACTION_TYPES,
            default: 'expense',
        },
        amount: {
            type: Number,
            required: [true, 'Amount is required'],
            min: [0, 'Amount must be a positive number'],
        },
        currency: {
            type: String,
            enum: CURRENCIES,
            default: 'USD',
            uppercase: true,
        },
        exchangeRate: {
            type: Number,
            min: [1, 'Exchange rate must be positive'],
            default: DEFAULT_EXCHANGE_RATE,
        },
        amountUSD: {
            type: Number,
            min: 0,
        },
        amountSYP: {
            type: Number,
            min: 0,
        },
        // Partial or full USD -> SYP exchanges recorded for USD income entries
        conversions: {
            type: [conversionSchema],
            default: [],
        },
        category: {
            type: String,
            required: [true, 'Category is required'],
            enum: ALL_CATEGORIES,
            lowercase: true,
        },
        date: {
            type: Date,
            default: Date.now,
        },
        notes: {
            type: String,
            trim: true,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

const Expense = mongoose.model('Expense', expenseSchema);

export default Expense;
