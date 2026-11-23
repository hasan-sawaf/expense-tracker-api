import Expense from '../models/expense.model.js';
import AppError from '../utils/appError.js';
import {
    calculateCurrencyValues,
    DEFAULT_EXCHANGE_RATE,
} from '../utils/currency.js';

const SORT_OPTIONS = {
    date_desc: { date: -1, createdAt: -1 },
    date_asc: { date: 1, createdAt: 1 },
    amount_desc: { amountUSD: -1, amount: -1 },
    amount_asc: { amountUSD: 1, amount: 1 },
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Normalize legacy documents created before type/currency/exchangeRate fields existed
const normalizeTransactionAmounts = (doc) => {
    const rate = doc.exchangeRate || DEFAULT_EXCHANGE_RATE;
    const currency = doc.currency || 'USD';
    const usd = doc.amountUSD ?? (currency === 'SYP' ? (doc.amount ?? 0) / rate : (doc.amount ?? 0));
    const syp = doc.amountSYP ?? (currency === 'SYP' ? (doc.amount ?? 0) : Math.round((doc.amount ?? 0) * rate));

    return {
        type: doc.type || 'expense',
        currency,
        usd,
        syp,
    };
};

// POST /api/v1/expenses - Create a new income or expense transaction
export const createExpense = async (req, res, next) => {
    const { amount, currency, exchangeRate, type, conversions } = req.body;
    const { amountUSD, amountSYP } = calculateCurrencyValues(
        amount,
        currency,
        exchangeRate
    );

    let normalizedConversions = [];
    if (conversions && conversions.length > 0) {
        if (type !== 'income' || currency !== 'USD') {
            return next(new AppError('Currency conversions only apply to USD income', 400));
        }

        const totalConverted = conversions.reduce((sum, c) => sum + c.usdAmount, 0);
        if (totalConverted > amount + 0.001) {
            return next(new AppError('Converted USD amount cannot exceed total income amount', 400));
        }

        normalizedConversions = conversions.map((c) => ({
            usdAmount: Number(c.usdAmount.toFixed(2)),
            exchangeRate: c.exchangeRate,
            sypAmount: Math.round(c.usdAmount * c.exchangeRate),
            date: c.date || req.body.date || new Date(),
            notes: c.notes || '',
        }));
    }

    const expense = await Expense.create({
        ...req.body,
        amountUSD,
        amountSYP,
        conversions: normalizedConversions,
    });

    res.status(201).json({
        status: 'success',
        data: expense,
    });
};

// GET /api/v1/expenses - Filter, search, sort, and summarize transactions
export const getExpenses = async (req, res, next) => {
    const {
        type,
        category,
        currency,
        search,
        startDate,
        endDate,
        minAmountUSD,
        maxAmountUSD,
        sort = 'date_desc',
    } = req.query;

    const conditions = [];

    if (type) {
        const normalizedType = type.toLowerCase();
        if (normalizedType === 'expense') {
            conditions.push({
                $or: [{ type: 'expense' }, { type: { $exists: false } }],
            });
        } else if (normalizedType === 'income') {
            conditions.push({ type: 'income' });
        } else {
            return next(new AppError('Type must be expense or income', 400));
        }
    }

    if (category) {
        const categories = category
            .split(',')
            .map((c) => c.trim().toLowerCase())
            .filter(Boolean);
        if (categories.length === 1) {
            conditions.push({ category: categories[0] });
        } else if (categories.length > 1) {
            conditions.push({ category: { $in: categories } });
        }
    }

    if (currency) {
        const normalizedCurrency = currency.toUpperCase();
        if (normalizedCurrency === 'USD') {
            conditions.push({
                $or: [{ currency: 'USD' }, { currency: { $exists: false } }],
            });
        } else if (normalizedCurrency === 'SYP') {
            conditions.push({ currency: 'SYP' });
        } else {
            return next(new AppError('Currency must be USD or SYP', 400));
        }
    }

    if (search && search.trim()) {
        const regex = new RegExp(escapeRegex(search.trim()), 'i');
        conditions.push({
            $or: [{ title: regex }, { notes: regex }],
        });
    }

    if (startDate || endDate) {
        const dateFilter = {};
        if (startDate) {
            const start = new Date(startDate);
            if (Number.isNaN(start.getTime())) {
                return next(new AppError('Invalid startDate format', 400));
            }
            dateFilter.$gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            if (Number.isNaN(end.getTime())) {
                return next(new AppError('Invalid endDate format', 400));
            }
            end.setUTCHours(23, 59, 59, 999);
            dateFilter.$lte = end;
        }
        conditions.push({ date: dateFilter });
    }

    if (minAmountUSD !== undefined || maxAmountUSD !== undefined) {
        const range = {};
        if (minAmountUSD !== undefined && minAmountUSD !== '') {
            const minVal = Number(minAmountUSD);
            if (Number.isNaN(minVal) || minVal < 0) {
                return next(new AppError('Invalid minAmountUSD', 400));
            }
            range.$gte = minVal;
        }
        if (maxAmountUSD !== undefined && maxAmountUSD !== '') {
            const maxVal = Number(maxAmountUSD);
            if (Number.isNaN(maxVal) || maxVal < 0) {
                return next(new AppError('Invalid maxAmountUSD', 400));
            }
            range.$lte = maxVal;
        }
        if (Object.keys(range).length > 0) {
            conditions.push({
                $or: [
                    { amountUSD: range },
                    { amountUSD: { $exists: false }, amount: range },
                ],
            });
        }
    }

    const filter = conditions.length > 0 ? { $and: conditions } : {};
    const sortOrder = SORT_OPTIONS[sort] || SORT_OPTIONS.date_desc;

    const expenses = await Expense.find(filter).sort(sortOrder);

    const totals = expenses.reduce(
        (acc, doc) => {
            const { type: txType, usd, syp } = normalizeTransactionAmounts(doc);
            if (txType === 'income') {
                acc.totalIncomeUSD += usd;
                acc.totalIncomeSYP += syp;
            } else {
                acc.totalSpentUSD += usd;
                acc.totalSpentSYP += syp;
            }
            return acc;
        },
        {
            totalIncomeUSD: 0,
            totalIncomeSYP: 0,
            totalSpentUSD: 0,
            totalSpentSYP: 0,
        }
    );

    const totalIncomeUSD = Number(totals.totalIncomeUSD.toFixed(2));
    const totalSpentUSD = Number(totals.totalSpentUSD.toFixed(2));
    const totalIncomeSYP = Math.round(totals.totalIncomeSYP);
    const totalSpentSYP = Math.round(totals.totalSpentSYP);

    res.status(200).json({
        status: 'success',
        results: expenses.length,
        filteredSummary: {
            totalIncomeUSD,
            totalIncomeSYP,
            totalSpentUSD,
            totalSpentSYP,
            netBalanceUSD: Number((totalIncomeUSD - totalSpentUSD).toFixed(2)),
            netBalanceSYP: totalIncomeSYP - totalSpentSYP,
        },
        data: expenses,
    });
};

// GET /api/v1/expenses/summary?year=2026&month=11
export const getMonthlySummary = async (req, res, next) => {
    const now = new Date();
    const year = req.query.year !== undefined
        ? parseInt(req.query.year, 10)
        : now.getUTCFullYear();
    const month = req.query.month !== undefined
        ? parseInt(req.query.month, 10)
        : now.getUTCMonth() + 1;

    if (Number.isNaN(year) || year < 1970 || year > 9999) {
        return next(new AppError('Invalid year', 400));
    }

    if (Number.isNaN(month) || month < 1 || month > 12) {
        return next(new AppError('Month must be between 1 and 12', 400));
    }

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const startOfNextMonth = new Date(Date.UTC(year, month, 1));
    const startOf6MonthWindow = new Date(Date.UTC(year, month - 6, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const [[monthAgg], trendDocs, monthDocs] = await Promise.all([
        Expense.aggregate([
            {
                $match: {
                    date: { $gte: startOfMonth, $lt: startOfNextMonth },
                },
            },
            {
                $addFields: {
                    txType: { $ifNull: ['$type', 'expense'] },
                    usdValue: { $ifNull: ['$amountUSD', '$amount'] },
                    sypValue: {
                        $ifNull: [
                            '$amountSYP',
                            {
                                $multiply: [
                                    '$amount',
                                    { $ifNull: ['$exchangeRate', DEFAULT_EXCHANGE_RATE] },
                                ],
                            },
                        ],
                    },
                },
            },
            {
                $facet: {
                    totalsByType: [
                        {
                            $group: {
                                _id: '$txType',
                                totalUSD: { $sum: '$usdValue' },
                                totalSYP: { $sum: '$sypValue' },
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    expenseByCategory: [
                        { $match: { txType: 'expense' } },
                        {
                            $group: {
                                _id: '$category',
                                totalUSD: { $sum: '$usdValue' },
                                totalSYP: { $sum: '$sypValue' },
                                count: { $sum: 1 },
                            },
                        },
                        { $sort: { totalUSD: -1 } },
                        {
                            $project: {
                                _id: 0,
                                category: '$_id',
                                totalUSD: { $round: ['$totalUSD', 2] },
                                totalSYP: { $round: ['$totalSYP', 0] },
                                count: 1,
                            },
                        },
                    ],
                    incomeByCategory: [
                        { $match: { txType: 'income' } },
                        {
                            $group: {
                                _id: '$category',
                                totalUSD: { $sum: '$usdValue' },
                                totalSYP: { $sum: '$sypValue' },
                                count: { $sum: 1 },
                            },
                        },
                        { $sort: { totalUSD: -1 } },
                        {
                            $project: {
                                _id: 0,
                                category: '$_id',
                                totalUSD: { $round: ['$totalUSD', 2] },
                                totalSYP: { $round: ['$totalSYP', 0] },
                                count: 1,
                            },
                        },
                    ],
                },
            },
        ]),
        // 6-month trend aggregation
        Expense.aggregate([
            {
                $match: {
                    date: { $gte: startOf6MonthWindow, $lt: startOfNextMonth },
                },
            },
            {
                $addFields: {
                    txType: { $ifNull: ['$type', 'expense'] },
                    usdValue: { $ifNull: ['$amountUSD', '$amount'] },
                    sypValue: {
                        $ifNull: [
                            '$amountSYP',
                            {
                                $multiply: [
                                    '$amount',
                                    { $ifNull: ['$exchangeRate', DEFAULT_EXCHANGE_RATE] },
                                ],
                            },
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$date' },
                        month: { $month: '$date' },
                        txType: '$txType',
                    },
                    totalUSD: { $sum: '$usdValue' },
                    totalSYP: { $sum: '$sypValue' },
                },
            },
        ]),
        // Individual docs for the requested month (to compute daily flow + real USD/SYP wallets)
        Expense.find({
            date: { $gte: startOfMonth, $lt: startOfNextMonth },
        }).sort({ date: -1 }),
    ]);

    const incomeStats = monthAgg.totalsByType.find((t) => t._id === 'income') || {
        totalUSD: 0,
        totalSYP: 0,
        count: 0,
    };
    const expenseStats = monthAgg.totalsByType.find((t) => t._id === 'expense') || {
        totalUSD: 0,
        totalSYP: 0,
        count: 0,
    };

    const totalIncomeUSD = Number(incomeStats.totalUSD.toFixed(2));
    const totalIncomeSYP = Math.round(incomeStats.totalSYP);
    const totalSpentUSD = Number(expenseStats.totalUSD.toFixed(2));
    const totalSpentSYP = Math.round(expenseStats.totalSYP);
    const netBalanceUSD = Number((totalIncomeUSD - totalSpentUSD).toFixed(2));
    const netBalanceSYP = totalIncomeSYP - totalSpentSYP;
    const spentPercentage = totalIncomeUSD > 0
        ? Number(((totalSpentUSD / totalIncomeUSD) * 100).toFixed(1))
        : null;

    // Build daily flow & real USD/SYP wallet balances (accounting for partial USD -> SYP conversions)
    const dailyMap = new Map();
    for (let day = 1; day <= daysInMonth; day += 1) {
        const isoDate = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
        dailyMap.set(day, {
            day,
            date: isoDate,
            incomeUSD: 0,
            spentUSD: 0,
            incomeSYP: 0,
            spentSYP: 0,
        });
    }

    let usdIncomeTotal = 0;
    let sypIncomeTotal = 0;
    let convertedUSD = 0;
    let convertedSYP = 0;
    let usdExpensesTotal = 0;
    let sypExpensesTotal = 0;
    const usdIncomes = [];

    monthDocs.forEach((doc) => {
        const { type: txType, currency, usd, syp } = normalizeTransactionAmounts(doc);
        const day = new Date(doc.date).getUTCDate();
        const entry = dailyMap.get(day);

        if (txType === 'income') {
            if (entry) {
                entry.incomeUSD = Number((entry.incomeUSD + usd).toFixed(2));
                entry.incomeSYP = Math.round(entry.incomeSYP + syp);
            }
            if (currency === 'USD') {
                usdIncomeTotal += doc.amount;
                const docConvertedUSD = (doc.conversions || []).reduce((sum, c) => sum + c.usdAmount, 0);
                const docConvertedSYP = (doc.conversions || []).reduce((sum, c) => sum + c.sypAmount, 0);
                convertedUSD += docConvertedUSD;
                convertedSYP += docConvertedSYP;
                usdIncomes.push(doc);
            } else {
                sypIncomeTotal += doc.amount;
            }
        } else {
            if (entry) {
                entry.spentUSD = Number((entry.spentUSD + usd).toFixed(2));
                entry.spentSYP = Math.round(entry.spentSYP + syp);
            }
            if (currency === 'USD') {
                usdExpensesTotal += doc.amount;
            } else {
                sypExpensesTotal += doc.amount;
            }
        }
    });

    // Build contiguous 6-month trend array
    const monthlyTrend = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
        const d = new Date(Date.UTC(year, month - 1 - offset, 1));
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1;
        const inc = trendDocs.find((t) => t._id.year === y && t._id.month === m && t._id.txType === 'income');
        const exp = trendDocs.find((t) => t._id.year === y && t._id.month === m && t._id.txType === 'expense');

        const incUSD = Number((inc?.totalUSD || 0).toFixed(2));
        const expUSD = Number((exp?.totalUSD || 0).toFixed(2));
        const incSYP = Math.round(inc?.totalSYP || 0);
        const expSYP = Math.round(exp?.totalSYP || 0);

        monthlyTrend.push({
            year: y,
            month: m,
            incomeUSD: incUSD,
            spentUSD: expUSD,
            netUSD: Number((incUSD - expUSD).toFixed(2)),
            incomeSYP: incSYP,
            spentSYP: expSYP,
            netSYP: incSYP - expSYP,
        });
    }

    const wallet = {
        usdIncomeTotal: Number(usdIncomeTotal.toFixed(2)),
        sypIncomeTotal: Math.round(sypIncomeTotal),
        convertedUSD: Number(convertedUSD.toFixed(2)),
        convertedSYP: Math.round(convertedSYP),
        remainingUnconvertedUSD: Number((usdIncomeTotal - convertedUSD).toFixed(2)),
        usdExpensesTotal: Number(usdExpensesTotal.toFixed(2)),
        sypExpensesTotal: Math.round(sypExpensesTotal),
        walletUSD: Number((usdIncomeTotal - convertedUSD - usdExpensesTotal).toFixed(2)),
        walletSYP: Math.round(sypIncomeTotal + convertedSYP - sypExpensesTotal),
    };

    res.status(200).json({
        status: 'success',
        data: {
            year,
            month,
            grandTotal: totalSpentUSD,
            totalIncomeUSD,
            totalIncomeSYP,
            incomeCount: incomeStats.count,
            totalSpentUSD,
            totalSpentSYP,
            expenseCount: expenseStats.count,
            netBalanceUSD,
            netBalanceSYP,
            spentPercentage,
            totalTransactions: incomeStats.count + expenseStats.count,
            wallet,
            usdIncomes,
            dailyFlow: Array.from(dailyMap.values()),
            monthlyTrend,
            byCategory: monthAgg.expenseByCategory,
            incomeByCategory: monthAgg.incomeByCategory,
        },
    });
};

// POST /api/v1/expenses/:id/convert - Convert part (or all) of a USD income into SYP at that day's rate
export const addIncomeConversion = async (req, res, next) => {
    const income = await Expense.findById(req.params.id);
    if (!income) {
        return next(new AppError('Transaction not found', 404));
    }

    if (income.type !== 'income' || income.currency !== 'USD') {
        return next(new AppError('Only USD income transactions can be converted to SYP', 400));
    }

    const { usdAmount, exchangeRate, date, notes } = req.body;
    const alreadyConverted = (income.conversions || []).reduce(
        (sum, c) => sum + c.usdAmount,
        0
    );

    if (alreadyConverted + usdAmount > income.amount + 0.001) {
        const remaining = Number(Math.max(0, income.amount - alreadyConverted).toFixed(2));
        return next(
            new AppError(
                `Cannot convert $${usdAmount}. Remaining unconverted balance is $${remaining}`,
                400
            )
        );
    }

    income.conversions.push({
        usdAmount: Number(usdAmount.toFixed(2)),
        exchangeRate,
        sypAmount: Math.round(usdAmount * exchangeRate),
        date: date || new Date(),
        notes: notes || '',
    });

    await income.save();

    res.status(201).json({
        status: 'success',
        data: income,
    });
};

// DELETE /api/v1/expenses/:id/conversions/:conversionId - Remove a recorded USD -> SYP conversion
export const deleteIncomeConversion = async (req, res, next) => {
    const income = await Expense.findById(req.params.id);
    if (!income) {
        return next(new AppError('Transaction not found', 404));
    }

    const existingConv = income.conversions.id(req.params.conversionId);
    if (!existingConv) {
        return next(new AppError('Conversion record not found', 404));
    }

    existingConv.deleteOne();
    await income.save();

    res.status(200).json({
        status: 'success',
        data: income,
    });
};

// GET /api/v1/expenses/:id - Get a single transaction by ID
export const getExpenseById = async (req, res, next) => {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
        return next(new AppError('Expense not found', 404));
    }
    res.status(200).json({
        status: 'success',
        data: expense,
    });
};

// PATCH /api/v1/expenses/:id - Update a transaction and recompute USD/SYP values
export const updateExpense = async (req, res, next) => {
    const existing = await Expense.findById(req.params.id);
    if (!existing) {
        return next(new AppError('Expense not found', 404));
    }

    const amount = req.body.amount ?? existing.amount;
    const currency = req.body.currency ?? existing.currency ?? 'USD';
    const exchangeRate = req.body.exchangeRate ?? existing.exchangeRate ?? DEFAULT_EXCHANGE_RATE;
    const { amountUSD, amountSYP } = calculateCurrencyValues(
        amount,
        currency,
        exchangeRate
    );

    const updated = await Expense.findByIdAndUpdate(
        req.params.id,
        {
            ...req.body,
            currency,
            exchangeRate,
            amountUSD,
            amountSYP,
        },
        {
            new: true,
            runValidators: true,
        }
    );

    res.status(200).json({
        status: 'success',
        data: updated,
    });
};

// DELETE /api/v1/expenses/:id - Delete a transaction by ID
export const deleteExpense = async (req, res, next) => {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) {
        return next(new AppError('Expense not found', 404));
    }
    res.status(200).json({
        status: 'success',
        data: null,
    });
};
