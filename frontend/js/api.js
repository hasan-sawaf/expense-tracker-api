import { API_BASE_URL } from './config.js';

/**
 * Shared fetch wrapper that parses JSON and throws structured API errors
 * (including Zod field validation errors when present).
 */
async function request(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const error = new Error(payload?.message || `Request failed (${response.status})`);
        error.status = response.status;
        error.errors = payload?.errors || [];
        throw error;
    }

    return payload;
}

export const checkHealth = () => request('/health');

export const getExpenses = (filters = {}) => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            params.set(key, String(value).trim());
        }
    });

    const query = params.toString();
    return request(`/expenses${query ? `?${query}` : ''}`);
};

export const createExpense = (data) =>
    request('/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
    });

export const updateExpense = (id, data) =>
    request(`/expenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const deleteExpense = (id) =>
    request(`/expenses/${id}`, {
        method: 'DELETE',
    });

export const getMonthlySummary = (year, month) => {
    const params = new URLSearchParams({ year, month });
    return request(`/expenses/summary?${params.toString()}`);
};

export const convertIncomeToSyp = (id, data) =>
    request(`/expenses/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify(data),
    });

export const deleteIncomeConversion = (id, conversionId) =>
    request(`/expenses/${id}/conversions/${conversionId}`, {
        method: 'DELETE',
    });
