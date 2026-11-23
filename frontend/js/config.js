const isStaticPreviewPort = ['5500', '5501', '3000', '4173', '5173', '8080'].includes(window.location.port);

export const API_BASE_URL =
    window.location.protocol.startsWith('http') && !isStaticPreviewPort
        ? '/api/v1'
        : 'http://localhost:5000/api/v1';

export const DEFAULT_EXCHANGE_RATE = 15000;

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

export const CATEGORY_META = {
    food: { icon: '🍽️', color: '#f59e0b' },
    transport: { icon: '🚕', color: '#3b82f6' },
    utilities: { icon: '💡', color: '#6366f1' },
    entertainment: { icon: '🎬', color: '#c026d3' },
    shopping: { icon: '🛍️', color: '#ec4899' },
    health: { icon: '🩺', color: '#14b8a6' },
    education: { icon: '📚', color: '#8b5cf6' },
    salary: { icon: '💼', color: '#10b981' },
    freelance: { icon: '💻', color: '#06b6d4' },
    business: { icon: '🏢', color: '#0ea5e9' },
    gift: { icon: '🎁', color: '#f43f5e' },
    investment: { icon: '📈', color: '#22c55e' },
    other: { icon: '📌', color: '#64748b' },
};
