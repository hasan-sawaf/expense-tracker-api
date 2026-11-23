export const DEFAULT_EXCHANGE_RATE = 15000;

/**
 * Computes equivalent USD and SYP totals for a transaction using its daily exchange rate.
 * @param {number} amount - Transaction amount in the given currency.
 * @param {'USD' | 'SYP'} currency - Currency of the entered amount.
 * @param {number} exchangeRate - SYP per 1 USD on the transaction date.
 */
export function calculateCurrencyValues(amount, currency = 'USD', exchangeRate = DEFAULT_EXCHANGE_RATE) {
    if (currency === 'SYP') {
        return {
            amountSYP: Number(amount.toFixed(2)),
            amountUSD: Number((amount / exchangeRate).toFixed(2)),
        };
    }

    return {
        amountUSD: Number(amount.toFixed(2)),
        amountSYP: Math.round(amount * exchangeRate),
    };
}
