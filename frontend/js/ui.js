import {
    ALL_CATEGORIES,
    DEFAULT_EXCHANGE_RATE,
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
} from './config.js';
import { renderCashFlowChart, renderCategoryDonutChart } from './charts.js';
import { refreshGlassSelect } from './dropdown.js';
import { createTranslator, TRANSLATIONS } from './i18n.js';
import { svgIcon } from './icons.js';

export function hydrateStaticIcons() {
    document.querySelectorAll('[data-icon]').forEach((el) => {
        el.innerHTML = svgIcon(el.dataset.icon, 'ui-svg');
    });
}

const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const sypFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
});

export const formatUSD = (amount) => usdFormatter.format(Number(amount || 0));

export const formatSYP = (amount, lang = 'en') => {
    const symbol = TRANSLATIONS[lang]?.sypSymbol || 'SYP';
    return `${sypFormatter.format(Math.round(Number(amount || 0)))} ${symbol}`;
};

export const formatRate = (rate) => sypFormatter.format(Number(rate || DEFAULT_EXCHANGE_RATE));

export const formatDate = (isoString, lang = 'en') => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString(lang === 'ar' ? 'ar-SY' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    });
};

export const toDateInputValue = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toISOString().slice(0, 10);
};

export const normalizeItem = (item) => {
    const rate = Number(item.exchangeRate || DEFAULT_EXCHANGE_RATE);
    const currency = item.currency || 'USD';
    const usd = item.amountUSD ?? (currency === 'SYP' ? item.amount / rate : item.amount);
    const syp = item.amountSYP ?? (currency === 'SYP' ? item.amount : item.amount * rate);
    const conversions = Array.isArray(item.conversions) ? item.conversions : [];
    const convertedUSD = Number(
        conversions.reduce((sum, c) => sum + Number(c.usdAmount || 0), 0).toFixed(2)
    );
    const convertedSYP = Math.round(
        conversions.reduce((sum, c) => sum + Number(c.sypAmount || 0), 0)
    );

    return {
        ...item,
        type: item.type || 'expense',
        currency,
        exchangeRate: rate,
        amountUSD: Number(usd),
        amountSYP: Math.round(syp),
        conversions,
        convertedUSD,
        convertedSYP,
        remainingUSD: Number(Math.max(0, Number(item.amount || 0) - convertedUSD).toFixed(2)),
    };
};

const escapeHtml = (str) =>
    String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

function formatDualAmounts(usd, syp, displayCurrency, lang) {
    if (displayCurrency === 'USD') {
        return { primary: formatUSD(usd), secondary: formatSYP(syp, lang) };
    }
    if (displayCurrency === 'SYP') {
        return { primary: formatSYP(syp, lang), secondary: formatUSD(usd) };
    }
    return { primary: formatUSD(usd), secondary: formatSYP(syp, lang) };
}

export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-pressed', String(theme === 'dark'));
    }
}

export function triggerLangSwipe(lang) {
    const mainEl = document.getElementById('main-page-container');
    if (!mainEl) return;

    mainEl.classList.remove('lang-swipe-rtl', 'lang-swipe-ltr');
    // Force reflow so rapid EN <-> AR clicks replay the swipe cleanly
    void mainEl.offsetWidth;
    mainEl.classList.add(lang === 'ar' ? 'lang-swipe-rtl' : 'lang-swipe-ltr');
}

export function switchPage(pageId) {
    document.querySelectorAll('.nav-link[data-page]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.page === pageId);
    });

    document.querySelectorAll('.app-page').forEach((section) => {
        const isTarget = section.id === `page-${pageId}`;
        section.hidden = !isTarget;
        if (isTarget) {
            section.classList.remove('page-entering');
            void section.offsetWidth;
            section.classList.add('page-entering');
        }
    });
}

export function applyLanguage(lang) {
    const t = createTranslator(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });

    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });

    const langToggleBtn = document.getElementById('lang-toggle-btn');
    if (langToggleBtn) {
        langToggleBtn.setAttribute('aria-pressed', String(lang === 'ar'));
    }

    const notesEl = document.getElementById('notes');
    if (notesEl) notesEl.placeholder = t('notesPlaceholder');
}

export function setApiStatus(isOnline, lang) {
    const t = createTranslator(lang);
    const pill = document.getElementById('api-status');
    const text = pill.querySelector('.status-text');
    pill.className = `status-pill ${isOnline ? 'status-online' : 'status-offline'}`;
    text.textContent = isOnline ? t('apiOnline') : t('apiOffline');
}

export function populateMonthSelect(selectEl, selectedMonth, lang) {
    const months = TRANSLATIONS[lang]?.months || TRANSLATIONS.en.months;
    selectEl.innerHTML = months
        .map(
            (name, index) =>
                `<option value="${index + 1}" ${index + 1 === selectedMonth ? 'selected' : ''}>${name}</option>`
        )
        .join('');
    refreshGlassSelect(selectEl);
}

export function populateCategorySelect(selectEl, type, lang, includeAll = false, selectedValue = '') {
    const t = createTranslator(lang);
    const categoriesMap = t('categories');
    const list = includeAll
        ? ALL_CATEGORIES
        : type === 'income'
            ? INCOME_CATEGORIES
            : EXPENSE_CATEGORIES;

    const selectedSet = new Set(Array.isArray(selectedValue) ? selectedValue : [selectedValue]);
    const options = [];
    if (includeAll && !selectEl.multiple) {
        options.push(`<option value="">${escapeHtml(t('allCategories'))}</option>`);
    }

    list.forEach((cat) => {
        const label = categoriesMap[cat] || cat;
        const selected = selectedSet.has(cat) ? 'selected' : '';
        options.push(`<option value="${cat}" data-icon="${cat}" ${selected}>${escapeHtml(label)}</option>`);
    });

    selectEl.innerHTML = options.join('');
    refreshGlassSelect(selectEl);
}

export function syncInitialConvertVisibility(lang) {
    const type = document.getElementById('create-type').value;
    const currency = document.getElementById('create-currency').value;
    const box = document.getElementById('initial-convert-box');
    const isUsdIncome = type === 'income' && currency === 'USD';

    box.hidden = !isUsdIncome;
    if (!isUsdIncome) {
        document.getElementById('initial-convert-enabled').checked = false;
        document.getElementById('initial-convert-fields').hidden = true;
        document.getElementById('initial-convert-usd').value = '';
        document.getElementById('initial-convert-preview').textContent = '';
    } else {
        updateInitialConvertPreview(lang);
    }
}

export function updateInitialConvertPreview(lang) {
    const t = createTranslator(lang);
    const previewEl = document.getElementById('initial-convert-preview');
    const totalUsd = Number(document.getElementById('amount').value || 0);
    const convUsd = Number(document.getElementById('initial-convert-usd').value || 0);
    const rate = Number(document.getElementById('initial-convert-rate').value || 0);

    if (!convUsd || convUsd <= 0 || !rate || rate <= 0) {
        previewEl.textContent = '';
        return;
    }

    const syp = convUsd * rate;
    const rem = Math.max(0, totalUsd - convUsd);
    previewEl.textContent = t('initialConvertSummary', {
        usd: formatUSD(convUsd),
        syp: formatSYP(syp, lang),
        rem: formatUSD(rem),
    });
}

export function syncFormTypeUI(formPrefix, type, lang) {
    const t = createTranslator(lang);
    document.getElementById(`${formPrefix}-type`).value = type;

    document.querySelectorAll(`.type-btn[data-form="${formPrefix}"]`).forEach((btn) => {
        btn.classList.remove('active-expense', 'active-income');
        if (btn.dataset.type === type) {
            btn.classList.add(type === 'income' ? 'active-income' : 'active-expense');
        }
    });

    const catSelect = document.getElementById(formPrefix === 'create' ? 'category' : 'edit-category');
    const prevValue = catSelect.value;
    populateCategorySelect(catSelect, type, lang, false, prevValue);

    if (formPrefix === 'create') {
        const titleInput = document.getElementById('title');
        titleInput.placeholder = type === 'income'
            ? t('titlePlaceholderIncome')
            : t('titlePlaceholderExpense');

        const submitBtn = document.getElementById('create-submit-btn');
        const submitText = document.getElementById('create-submit-text');
        if (submitText) {
            submitText.textContent = type === 'income' ? t('saveIncomeBtn') : t('saveExpenseBtn');
        }
        submitBtn.className = `btn btn-full ${type === 'income' ? 'btn-income' : 'btn-primary'}`;

        syncInitialConvertVisibility(lang);
    }
}

export function syncFormCurrencyUI(formPrefix, currency, lang = 'en') {
    document.getElementById(`${formPrefix}-currency`).value = currency;
    document.querySelectorAll(`.curr-btn[data-form="${formPrefix}"]`).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.currency === currency);
    });

    if (formPrefix === 'create') {
        syncInitialConvertVisibility(lang);
    }
}

export function updateConversionPreview(formPrefix, lang) {
    const t = createTranslator(lang);
    const amountEl = document.getElementById(formPrefix === 'create' ? 'amount' : 'edit-amount');
    const currencyEl = document.getElementById(`${formPrefix}-currency`);
    const rateEl = document.getElementById(`${formPrefix}-exchange-rate`);
    const previewEl = document.getElementById(`${formPrefix}-conversion-preview`);

    const amount = Number(amountEl.value);
    const rate = Number(rateEl.value);
    const currency = currencyEl.value;

    if (!amount || amount <= 0 || !rate || rate <= 0) {
        previewEl.textContent = '';
        return;
    }

    if (currency === 'SYP') {
        const usd = amount / rate;
        previewEl.textContent = `${t('equivalentPrefix')} ${formatUSD(usd)}`;
    } else {
        const syp = amount * rate;
        previewEl.textContent = `${t('equivalentPrefix')} ${formatSYP(syp, lang)}`;
    }
}

function renderUsdIncomesPanel(usdIncomes, lang) {
    const t = createTranslator(lang);
    const listEl = document.getElementById('usd-incomes-list');

    if (!usdIncomes || usdIncomes.length === 0) {
        listEl.innerHTML = `<p class="empty-state">${escapeHtml(t('noUsdIncomes'))}</p>`;
        return;
    }

    listEl.innerHTML = usdIncomes
        .map((raw) => {
            const item = normalizeItem(raw);
            const pct = item.amount > 0 ? Math.min(100, Math.round((item.convertedUSD / item.amount) * 100)) : 0;

            const chipsHtml = item.conversions.length > 0
                ? `<div class="conversion-chips">
                    ${item.conversions.map((c) => `
                        <span class="conv-chip">
                            <span class="num-ltr">${escapeHtml(formatUSD(c.usdAmount))} @ ${escapeHtml(formatRate(c.exchangeRate))}</span>
                            <span>→ ${escapeHtml(formatSYP(c.sypAmount, lang))}</span>
                        </span>
                    `).join('')}
                   </div>`
                : '';

            return `
                <article class="usd-income-card">
                    <div class="usd-income-top">
                        <strong>${escapeHtml(item.title)}</strong>
                        <button type="button" class="btn btn-secondary btn-sm" data-action="convert" data-id="${escapeHtml(item._id)}">
                            ${svgIcon('swap', 'btn-svg')}
                            <span>${escapeHtml(t('convertActionBtn'))}</span>
                        </button>
                    </div>
                    <progress class="breakdown-bar cat-bar-salary" max="100" value="${pct}" aria-label="${escapeHtml(item.title)}"></progress>
                    <div class="usd-income-stats">
                        <span>${escapeHtml(t('convertedSummary', {
                            converted: formatUSD(item.convertedUSD),
                            total: formatUSD(item.amount),
                            syp: formatSYP(item.convertedSYP, lang),
                        }))}</span>
                        <strong class="text-income">${escapeHtml(t('remainingUsdLabel', {
                            remaining: formatUSD(item.remainingUSD),
                        }))}</strong>
                    </div>
                    ${chipsHtml}
                </article>
            `;
        })
        .join('');
}

export function renderSummary(summary, breakdownType, flowMode, displayCurrency, lang) {
    const t = createTranslator(lang);

    const income = formatDualAmounts(summary.totalIncomeUSD, summary.totalIncomeSYP, displayCurrency, lang);
    const spent = formatDualAmounts(summary.totalSpentUSD, summary.totalSpentSYP, displayCurrency, lang);

    document.getElementById('summary-income-primary').textContent = income.primary;
    document.getElementById('summary-income-secondary').textContent =
        displayCurrency === 'both' ? income.secondary : '';

    document.getElementById('summary-spent-primary').textContent = spent.primary;
    document.getElementById('summary-spent-secondary').textContent =
        displayCurrency === 'both' ? spent.secondary : '';

    const balanceCard = document.querySelector('.kpi-balance');
    balanceCard.classList.toggle('is-positive', summary.netBalanceUSD >= 0);
    balanceCard.classList.toggle('is-negative', summary.netBalanceUSD < 0);

    const balancePrefix = summary.netBalanceUSD > 0 ? '+' : summary.netBalanceUSD < 0 ? '−' : '';
    const absUsd = formatUSD(Math.abs(summary.netBalanceUSD));
    const absSyp = formatSYP(Math.abs(summary.netBalanceSYP), lang);
    const balPrimary = displayCurrency === 'SYP'
        ? `<span class="num-ltr">${balancePrefix}</span>${escapeHtml(absSyp)}`
        : `<span class="num-ltr">${balancePrefix}${escapeHtml(absUsd)}</span>`;
    const balSecondary = displayCurrency === 'both'
        ? `<span class="num-ltr">${balancePrefix}</span>${escapeHtml(absSyp)}`
        : '';

    document.getElementById('summary-balance-primary').innerHTML = balPrimary;
    document.getElementById('summary-balance-secondary').innerHTML = balSecondary;

    // Cash Wallets (USD Cash vs SYP Cash)
    const wallet = summary.wallet || { walletUSD: 0, walletSYP: 0 };
    const walletUsdEl = document.getElementById('wallet-usd');
    const walletSypEl = document.getElementById('wallet-syp');
    const wUsdPrefix = wallet.walletUSD < 0 ? '−' : '';
    const wSypPrefix = wallet.walletSYP < 0 ? '−' : '';
    walletUsdEl.textContent = `${wUsdPrefix}${formatUSD(Math.abs(wallet.walletUSD))}`;
    walletSypEl.innerHTML = `<span class="num-ltr">${wSypPrefix}</span>${escapeHtml(formatSYP(Math.abs(wallet.walletSYP), lang))}`;

    // Spent % progress bar
    const ratioBar = document.getElementById('spent-ratio-bar');
    const ratioText = document.getElementById('spent-ratio-text');
    if (summary.spentPercentage !== null && summary.spentPercentage !== undefined) {
        ratioBar.value = Math.min(summary.spentPercentage, 100);
        ratioBar.classList.toggle('over-budget', summary.spentPercentage > 100);
        ratioText.textContent = t('incomeVsSpentHint', { pct: summary.spentPercentage });
    } else {
        ratioBar.value = 0;
        ratioBar.classList.remove('over-budget');
        ratioText.textContent = t('noIncomeRecorded');
    }

    const countBadge = document.getElementById('summary-count-badge');
    countBadge.textContent = summary.totalTransactions;
    countBadge.title = t('incomeExpenseCount', {
        income: summary.incomeCount,
        expense: summary.expenseCount,
    });

    // Cash Flow Tabs + Chart
    document.querySelectorAll('.tab-btn[data-flow-mode]').forEach((btn) => {
        const isActive = btn.dataset.flowMode === flowMode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    renderCashFlowChart(summary, flowMode, displayCurrency, lang);

    // Category Breakdown Tabs + Donut + Bars
    document.querySelectorAll('.tab-btn[data-breakdown]').forEach((btn) => {
        const isActive = btn.dataset.breakdown === breakdownType;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    const items = breakdownType === 'income' ? summary.incomeByCategory : summary.byCategory;
    const totalBaseUSD = breakdownType === 'income' ? summary.totalIncomeUSD : summary.totalSpentUSD;
    const totalBaseSYP = breakdownType === 'income' ? summary.totalIncomeSYP : summary.totalSpentSYP;
    const breakdownEl = document.getElementById('category-breakdown');

    breakdownEl.setAttribute(
        'aria-labelledby',
        breakdownType === 'income' ? 'tab-breakdown-income' : 'tab-breakdown-expense'
    );

    renderCategoryDonutChart(items, totalBaseUSD, totalBaseSYP, displayCurrency, lang);

    if (!items || items.length === 0) {
        breakdownEl.innerHTML = `<p class="empty-state">${escapeHtml(t('noBreakdownData'))}</p>`;
    } else {
        const categoriesMap = t('categories');
        breakdownEl.innerHTML = items
            .map((item) => {
                const pct = totalBaseUSD > 0 ? Math.round((item.totalUSD / totalBaseUSD) * 100) : 0;
                const label = categoriesMap[item.category] || item.category;
                const dual = formatDualAmounts(item.totalUSD, item.totalSYP, displayCurrency, lang);
                const amountText = displayCurrency === 'both'
                    ? `${dual.primary} (${dual.secondary})`
                    : dual.primary;

                return `
                    <button type="button" class="breakdown-item breakdown-item-btn" data-drill-cat="${escapeHtml(item.category)}">
                        <div class="breakdown-meta">
                            <span class="breakdown-cat">
                                <span class="cat-icon-pill cat-pill-${escapeHtml(item.category)}">${svgIcon(item.category, 'cat-svg')}</span>
                                <span>${escapeHtml(label)} · ${pct}%</span>
                            </span>
                            <span class="breakdown-amounts">${escapeHtml(amountText)}</span>
                        </div>
                        <progress class="breakdown-bar cat-bar-${escapeHtml(item.category)}" max="100" value="${pct}" aria-label="${escapeHtml(label)}"></progress>
                    </button>
                `;
            })
            .join('');
    }

    renderUsdIncomesPanel(summary.usdIncomes, lang);
}

export function renderRecentEntries(rawExpenses, displayCurrency, lang) {
    const t = createTranslator(lang);
    const listEl = document.getElementById('recent-entries-list');
    const recent = (rawExpenses || []).slice(0, 5);

    if (recent.length === 0) {
        listEl.innerHTML = `<p class="empty-state">${escapeHtml(t('emptyExpenses'))}</p>`;
        return;
    }

    listEl.innerHTML = recent
        .map((raw) => {
            const item = normalizeItem(raw);
            const isIncome = item.type === 'income';
            const sign = isIncome ? '+' : '−';
            const amtHtml = item.currency === 'SYP'
                ? `<span class="num-ltr">${sign}</span>${escapeHtml(formatSYP(item.amountSYP, lang))}`
                : `<span class="num-ltr">${sign}${escapeHtml(formatUSD(item.amountUSD))}</span>`;

            return `
                <div class="recent-row">
                    <div class="recent-row-left">
                        <span class="cat-icon-pill cat-pill-${escapeHtml(item.category)}">${svgIcon(item.category, 'cat-svg')}</span>
                        <div class="recent-row-info">
                            <span class="recent-row-title">${escapeHtml(item.title)}</span>
                            <span class="recent-row-date">${escapeHtml(formatDate(item.date, lang))}</span>
                        </div>
                    </div>
                    <span class="recent-row-amt ${isIncome ? 'text-income' : 'text-expense'}">${amtHtml}</span>
                </div>
            `;
        })
        .join('');
}

export function renderFilteredSummary(filteredSummary, displayCurrency, lang) {
    const t = createTranslator(lang);
    const strip = document.getElementById('filtered-summary-strip');

    if (!filteredSummary) {
        strip.innerHTML = '';
        return;
    }

    const inc = formatDualAmounts(filteredSummary.totalIncomeUSD, filteredSummary.totalIncomeSYP, displayCurrency, lang);
    const exp = formatDualAmounts(filteredSummary.totalSpentUSD, filteredSummary.totalSpentSYP, displayCurrency, lang);
    const netSign = filteredSummary.netBalanceUSD > 0 ? '+' : filteredSummary.netBalanceUSD < 0 ? '−' : '';
    const absNet = formatDualAmounts(
        Math.abs(filteredSummary.netBalanceUSD),
        Math.abs(filteredSummary.netBalanceSYP),
        displayCurrency,
        lang
    );

    const fmt = (obj) =>
        displayCurrency === 'both' ? `${obj.primary} (${obj.secondary})` : obj.primary;

    strip.innerHTML = `
        <span class="strip-metric">
            <span>${escapeHtml(t('filteredIncome'))}</span>
            <strong class="text-income num-ltr">${escapeHtml(fmt(inc))}</strong>
        </span>
        <span class="strip-metric">
            <span>${escapeHtml(t('filteredSpent'))}</span>
            <strong class="text-expense num-ltr">${escapeHtml(fmt(exp))}</strong>
        </span>
        <span class="strip-metric">
            <span>${escapeHtml(t('filteredNet'))}</span>
            <strong class="text-primary num-ltr">${netSign}${escapeHtml(fmt(absNet))}</strong>
        </span>
    `;
}

export function renderExpenses(rawExpenses, displayCurrency, lang) {
    const t = createTranslator(lang);
    const categoriesMap = t('categories');
    const container = document.getElementById('expenses-container');
    document.getElementById('expense-results-badge').textContent = rawExpenses.length;

    if (rawExpenses.length === 0) {
        container.innerHTML = `<p class="empty-state">${escapeHtml(t('emptyExpenses'))}</p>`;
        return;
    }

    container.innerHTML = rawExpenses
        .map((raw) => {
            const item = normalizeItem(raw);
            const isIncome = item.type === 'income';
            const isUsdIncome = isIncome && item.currency === 'USD';
            const catLabel = categoriesMap[item.category] || item.category;
            const sign = isIncome ? '+' : '−';

            let mainAmountHtml;
            let subAmountHtml;
            if (item.currency === 'SYP') {
                mainAmountHtml = `<span class="num-ltr">${sign}</span>${escapeHtml(formatSYP(item.amountSYP, lang))}`;
                subAmountHtml = `≈ <span class="num-ltr">${escapeHtml(formatUSD(item.amountUSD))}</span>`;
            } else {
                mainAmountHtml = `<span class="num-ltr">${sign}${escapeHtml(formatUSD(item.amountUSD))}</span>`;
                subAmountHtml = displayCurrency === 'USD' ? '' : `≈ ${escapeHtml(formatSYP(item.amountSYP, lang))}`;
            }

            const notesHtml = item.notes
                ? `<p class="expense-notes">${escapeHtml(item.notes)}</p>`
                : '';

            let conversionBlockHtml = '';
            if (isUsdIncome) {
                const convChips = item.conversions
                    .map((c) => `
                        <span class="conv-chip">
                            <span class="num-ltr">${escapeHtml(formatUSD(c.usdAmount))} @ ${escapeHtml(formatRate(c.exchangeRate))}</span>
                            <span>→ ${escapeHtml(formatSYP(c.sypAmount, lang))}</span>
                            <button type="button" class="conv-chip-del" data-action="delete-conv" data-id="${escapeHtml(item._id)}" data-conv-id="${escapeHtml(c._id)}" aria-label="${escapeHtml(t('removeConversionAria'))}">&times;</button>
                        </span>
                    `)
                    .join('');

                conversionBlockHtml = `
                    <div class="income-conv-block">
                        <span>${escapeHtml(t('convertedSummary', {
                            converted: formatUSD(item.convertedUSD),
                            total: formatUSD(item.amount),
                            syp: formatSYP(item.convertedSYP, lang),
                        }))} · <strong>${escapeHtml(t('remainingUsdLabel', { remaining: formatUSD(item.remainingUSD) }))}</strong></span>
                        ${convChips ? `<div class="conversion-chips">${convChips}</div>` : ''}
                    </div>
                `;
            }

            const convertBtnHtml = isUsdIncome
                ? `<button type="button" class="btn btn-secondary btn-sm" data-action="convert" data-id="${escapeHtml(item._id)}">${svgIcon('swap', 'btn-svg')}<span>${escapeHtml(t('convertActionBtn'))}</span></button>`
                : '';

            return `
                <article class="expense-item ${isIncome ? 'is-income' : 'is-expense'}" data-id="${escapeHtml(item._id)}">
                    <div class="expense-main">
                        <div class="expense-title-row">
                            <span class="expense-title">${escapeHtml(item.title)}</span>
                            <span class="category-badge cat-pill-${escapeHtml(item.category)}">${svgIcon(item.category, 'cat-svg')}<span>${escapeHtml(catLabel)}</span></span>
                        </div>
                        ${notesHtml}
                        <div class="expense-meta-row">
                            <span class="meta-with-icon">${svgIcon('calendar', 'meta-svg')}<span>${escapeHtml(formatDate(item.date, lang))}</span></span>
                            <span class="rate-chip">${escapeHtml(t('rateTag', { rate: formatRate(item.exchangeRate) }))}</span>
                        </div>
                        ${conversionBlockHtml}
                    </div>

                    <div class="expense-right">
                        <div class="expense-amounts">
                            <span class="expense-amount-main ${isIncome ? 'text-income' : 'text-expense'}">${mainAmountHtml}</span>
                            ${subAmountHtml ? `<span class="expense-amount-sub">${subAmountHtml}</span>` : ''}
                        </div>
                        <div class="expense-actions">
                            ${convertBtnHtml}
                            <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${escapeHtml(item._id)}">${svgIcon('edit', 'btn-svg')}<span>${escapeHtml(t('editBtn'))}</span></button>
                            <button type="button" class="btn btn-danger-ghost btn-sm" data-action="delete" data-id="${escapeHtml(item._id)}">${svgIcon('trash', 'btn-svg')}<span>${escapeHtml(t('deleteBtn'))}</span></button>
                        </div>
                    </div>
                </article>
            `;
        })
        .join('');
}

export function renderFormErrors(containerId, error) {
    const container = document.getElementById(containerId);
    if (!error) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    const items = error.errors?.length
        ? error.errors.map((e) => `<li>${e.field ? `<strong>${escapeHtml(e.field)}:</strong> ` : ''}${escapeHtml(e.message)}</li>`).join('')
        : `<li>${escapeHtml(error.message)}</li>`;

    container.innerHTML = `<ul>${items}</ul>`;
    container.hidden = false;
}

export function openEditModal(rawExpense, lang) {
    const item = normalizeItem(rawExpense);

    document.getElementById('edit-id').value = item._id;
    syncFormTypeUI('edit', item.type, lang);
    syncFormCurrencyUI('edit', item.currency, lang);

    document.getElementById('edit-title').value = item.title;
    document.getElementById('edit-amount').value = item.amount;
    document.getElementById('edit-exchange-rate').value = item.exchangeRate;
    const editCategorySelect = document.getElementById('edit-category');
    editCategorySelect.value = item.category;
    refreshGlassSelect(editCategorySelect);
    document.getElementById('edit-date').value = toDateInputValue(item.date);
    const editNotesEl = document.getElementById('edit-notes');
    editNotesEl.value = item.notes || '';
    const noteLines = editNotesEl.value.split('\n').reduce((acc, l) => acc + Math.max(1, Math.ceil(l.length / 42)), 0);
    editNotesEl.rows = Math.min(5, Math.max(2, noteLines));

    updateConversionPreview('edit', lang);
    renderFormErrors('edit-form-errors', null);
    document.getElementById('edit-modal').hidden = false;
}

export function closeEditModal() {
    document.getElementById('edit-modal').hidden = true;
}

export function updateConvertModalPreview(lang) {
    const t = createTranslator(lang);
    const usd = Number(document.getElementById('convert-usd-amount').value || 0);
    const rate = Number(document.getElementById('convert-exchange-rate').value || 0);
    const previewEl = document.getElementById('convert-modal-preview');

    if (!usd || usd <= 0 || !rate || rate <= 0) {
        previewEl.textContent = '';
        return;
    }

    previewEl.textContent = t('convertReceivePreview', {
        syp: formatSYP(usd * rate, lang),
    });
}

export function openConvertModal(rawIncome, defaultRate, lang) {
    const t = createTranslator(lang);
    const item = normalizeItem(rawIncome);

    document.getElementById('convert-income-id').value = item._id;
    document.getElementById('convert-income-title').textContent = `${item.title} (${formatUSD(item.amount)})`;
    document.getElementById('convert-remaining-usd').textContent = formatUSD(item.remainingUSD);
    document.getElementById('convert-remaining-usd').dataset.remaining = String(item.remainingUSD);

    document.getElementById('convert-usd-amount').value = item.remainingUSD > 0 ? item.remainingUSD : '';
    document.getElementById('convert-exchange-rate').value = defaultRate;
    document.getElementById('convert-date').value = toDateInputValue(new Date().toISOString());
    document.getElementById('convert-notes').value = '';
    renderFormErrors('convert-form-errors', null);
    updateConvertModalPreview(lang);

    const historyEl = document.getElementById('convert-history-list');
    if (item.conversions.length === 0) {
        historyEl.innerHTML = `<p class="empty-state">${escapeHtml(t('noBreakdownData'))}</p>`;
    } else {
        historyEl.innerHTML = item.conversions
            .map((c) => `
                <div class="convert-history-item">
                    <div>
                        <strong class="num-ltr">${escapeHtml(formatUSD(c.usdAmount))} @ ${escapeHtml(formatRate(c.exchangeRate))}</strong>
                        <span> → ${escapeHtml(formatSYP(c.sypAmount, lang))}</span>
                        <div class="recent-row-date">${escapeHtml(formatDate(c.date, lang))}${c.notes ? ` · ${escapeHtml(c.notes)}` : ''}</div>
                    </div>
                    <button type="button" class="btn btn-danger-ghost btn-sm" data-action="delete-conv" data-id="${escapeHtml(item._id)}" data-conv-id="${escapeHtml(c._id)}">${escapeHtml(t('deleteBtn'))}</button>
                </div>
            `)
            .join('');
    }

    document.getElementById('convert-modal').hidden = false;
}

export function closeConvertModal() {
    document.getElementById('convert-modal').hidden = true;
}

export function updateActiveFiltersBadge(filters) {
    const keys = ['category', 'currency', 'startDate', 'endDate', 'minAmountUSD', 'maxAmountUSD'];
    let count = keys.filter((k) => String(filters[k] || '').trim() !== '').length;
    if (filters.sort && filters.sort !== 'date_desc') count += 1;

    const badge = document.getElementById('active-filters-badge');
    badge.textContent = count;
    badge.hidden = count === 0;
}

let toastTimer;
export function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type}`;
    toast.hidden = false;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 3000);
}
