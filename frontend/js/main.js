import * as api from './api.js';
import { DEFAULT_EXCHANGE_RATE } from './config.js';
import { enhanceSelect, refreshGlassSelect, updateGlassSelectConfig } from './dropdown.js';
import { createTranslator } from './i18n.js';
import * as ui from './ui.js';

const STORAGE_KEYS = {
    lang: 'expenseTracker_lang',
    theme: 'expenseTracker_theme',
    rate: 'expenseTracker_dailyRate',
    displayCurrency: 'expenseTracker_displayCurrency',
    page: 'expenseTracker_activePage',
};

const savedRate = Number(localStorage.getItem(STORAGE_KEYS.rate)) || DEFAULT_EXCHANGE_RATE;
const preferredDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const state = {
    lang: localStorage.getItem(STORAGE_KEYS.lang) || 'en',
    theme: localStorage.getItem(STORAGE_KEYS.theme) || (preferredDark ? 'dark' : 'light'),
    displayCurrency: localStorage.getItem(STORAGE_KEYS.displayCurrency) || 'both',
    activePage: localStorage.getItem(STORAGE_KEYS.page) || 'overview',
    dailyRate: savedRate,
    apiOnline: false,
    expenses: [],
    filteredSummary: null,
    summaryData: null,
    breakdownType: 'expense',
    flowMode: 'daily',
    summaryYear: new Date().getUTCFullYear(),
    summaryMonth: new Date().getUTCMonth() + 1,
    activePreset: 'all',
    filters: {
        type: '',
        category: '',
        currency: '',
        search: '',
        startDate: '',
        endDate: '',
        minAmountUSD: '',
        maxAmountUSD: '',
        sort: 'date_desc',
    },
};

const t = () => createTranslator(state.lang);

function isSoftKeyboardInput(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    return !['checkbox', 'radio', 'date', 'hidden', 'button', 'submit'].includes(el.type);
}

function dismissMobileKeyboard() {
    if (isSoftKeyboardInput(document.activeElement)) {
        document.activeElement.blur();
    }
    document.documentElement.classList.remove('keyboard-open');
}

function setupMobileKeyboardHandling() {
    const html = document.documentElement;
    let blurTimer;

    const ENTER_NEXT_MAP = {
        title: 'amount',
        amount: 'create-exchange-rate',
        'initial-convert-usd': 'initial-convert-rate',
        'edit-title': 'edit-amount',
        'edit-amount': 'edit-exchange-rate',
        'convert-usd-amount': 'convert-exchange-rate',
    };

    document.addEventListener('focusin', (e) => {
        if (!isSoftKeyboardInput(e.target)) return;
        clearTimeout(blurTimer);
        html.classList.add('keyboard-open');

        const target = e.target;
        setTimeout(() => {
            if (document.activeElement === target) {
                target.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        }, 180);
    });

    document.addEventListener('focusout', () => {
        clearTimeout(blurTimer);
        blurTimer = setTimeout(() => {
            if (!isSoftKeyboardInput(document.activeElement)) {
                html.classList.remove('keyboard-open');
            }
        }, 120);
    });

    // Tap anywhere on non-interactive background/cards to hide the mobile keyboard without shifting buttons mid-tap
    document.addEventListener('pointerdown', (e) => {
        if (!isSoftKeyboardInput(document.activeElement)) return;
        if (!e.target.closest('input, textarea, label, button, [role="button"], select')) {
            dismissMobileKeyboard();
        }
    });

    // Dismiss keyboard cleanly after tapping navigation/toggle/pill buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-link, .pill-btn, .tab-btn, .curr-btn, .type-btn, .icon-btn');
        if (btn && isSoftKeyboardInput(document.activeElement)) {
            dismissMobileKeyboard();
        }
    });

    // Handle Enter / Next / Search / Done keys cleanly across text and numeric inputs
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;

        const nextId = ENTER_NEXT_MAP[target.id];
        if (nextId) {
            e.preventDefault();
            document.getElementById(nextId)?.focus();
            return;
        }

        if (['filter-search', 'global-exchange-rate', 'summary-year', 'filter-min-usd', 'filter-max-usd'].includes(target.id)) {
            e.preventDefault();
            if (target.id === 'filter-search') {
                state.filters.search = target.value;
                loadExpenses();
            } else if (target.id === 'global-exchange-rate' || target.id === 'summary-year') {
                target.dispatchEvent(new Event('change'));
            }
            dismissMobileKeyboard();
        }
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            const keyboardVisible = window.innerHeight - window.visualViewport.height > 120;
            if (keyboardVisible) {
                html.classList.add('keyboard-open');
            } else if (!isSoftKeyboardInput(document.activeElement)) {
                html.classList.remove('keyboard-open');
            }
        });
    }
}

function getPresetDates(preset) {
    const now = new Date();
    const todayStr = ui.toDateInputValue(now.toISOString());

    if (preset === 'today') {
        return { startDate: todayStr, endDate: todayStr };
    }

    if (preset === 'week') {
        const start = new Date(now);
        const day = start.getUTCDay();
        start.setUTCDate(start.getUTCDate() - day);
        return { startDate: ui.toDateInputValue(start.toISOString()), endDate: todayStr };
    }

    if (preset === 'month') {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
        return {
            startDate: ui.toDateInputValue(start.toISOString()),
            endDate: ui.toDateInputValue(end.toISOString()),
        };
    }

    return { startDate: '', endDate: '' };
}

function findTransactionById(id) {
    return (
        state.expenses.find((tx) => tx._id === id) ||
        state.summaryData?.usdIncomes?.find((tx) => tx._id === id)
    );
}

function syncLanguageAcrossUI() {
    const translate = t();
    ui.applyLanguage(state.lang);
    ui.setApiStatus(state.apiOnline, state.lang);

    ui.populateMonthSelect(document.getElementById('summary-month'), state.summaryMonth, state.lang);
    document.getElementById('summary-year').value = state.summaryYear;

    const createType = document.getElementById('create-type').value;
    ui.syncFormTypeUI('create', createType, state.lang);
    ui.updateConversionPreview('create', state.lang);
    ui.updateInitialConvertPreview(state.lang);

    const filterCatSelect = document.getElementById('filter-category');
    const prevFilterCats = Array.from(filterCatSelect.selectedOptions).map((o) => o.value);
    updateGlassSelectConfig(filterCatSelect, {
        emptyLabel: translate('allCategories'),
        multiCountLabel: (count) => translate('multiCategoriesCount', { count }),
    });
    ui.populateCategorySelect(filterCatSelect, '', state.lang, true, prevFilterCats);

    ['display-currency', 'filter-currency', 'filter-sort'].forEach((id) => {
        refreshGlassSelect(document.getElementById(id));
    });

    if (state.summaryData) {
        ui.renderSummary(
            state.summaryData,
            state.breakdownType,
            state.flowMode,
            state.displayCurrency,
            state.lang
        );
    }
    ui.renderFilteredSummary(state.filteredSummary, state.displayCurrency, state.lang);
    ui.renderExpenses(state.expenses, state.displayCurrency, state.lang);
    ui.renderRecentEntries(state.expenses, state.displayCurrency, state.lang);
}

async function refreshHealth() {
    try {
        await api.checkHealth();
        state.apiOnline = true;
    } catch {
        state.apiOnline = false;
    }
    ui.setApiStatus(state.apiOnline, state.lang);
}

async function loadExpenses() {
    try {
        const res = await api.getExpenses(state.filters);
        state.expenses = res.data;
        state.filteredSummary = res.filteredSummary;
        ui.renderFilteredSummary(state.filteredSummary, state.displayCurrency, state.lang);
        ui.renderExpenses(state.expenses, state.displayCurrency, state.lang);
        ui.renderRecentEntries(state.expenses, state.displayCurrency, state.lang);
    } catch (error) {
        ui.showToast(error.message, 'error');
    }
}

async function loadSummary() {
    try {
        const res = await api.getMonthlySummary(state.summaryYear, state.summaryMonth);
        state.summaryData = res.data;
        ui.renderSummary(
            state.summaryData,
            state.breakdownType,
            state.flowMode,
            state.displayCurrency,
            state.lang
        );
    } catch (error) {
        ui.showToast(error.message, 'error');
    }
}

async function refreshAll() {
    await Promise.all([loadExpenses(), loadSummary()]);
}

function extractFormPayload(formPrefix) {
    const translate = t();
    const isCreate = formPrefix === 'create';

    const title = document.getElementById(isCreate ? 'title' : 'edit-title').value.trim();
    const type = document.getElementById(`${formPrefix}-type`).value;
    const amount = Number(document.getElementById(isCreate ? 'amount' : 'edit-amount').value);
    const currency = document.getElementById(`${formPrefix}-currency`).value;
    const exchangeRate = Number(document.getElementById(`${formPrefix}-exchange-rate`).value);
    const category = document.getElementById(isCreate ? 'category' : 'edit-category').value;
    const date = document.getElementById(isCreate ? 'date' : 'edit-date').value;
    const notes = document.getElementById(isCreate ? 'notes' : 'edit-notes').value.trim();

    if (!title) throw new Error(translate('validationClientTitle'));
    if (!amount || amount <= 0) throw new Error(translate('validationClientAmount'));
    if (!exchangeRate || exchangeRate <= 0) throw new Error(translate('validationClientRate'));

    const payload = { title, type, amount, currency, exchangeRate, category };
    if (date) payload.date = date;
    if (notes || !isCreate) payload.notes = notes;

    // Optional initial USD -> SYP conversion when creating a USD income
    if (isCreate && type === 'income' && currency === 'USD') {
        const convertEnabled = document.getElementById('initial-convert-enabled').checked;
        if (convertEnabled) {
            const convUsd = Number(document.getElementById('initial-convert-usd').value);
            const convRate = Number(document.getElementById('initial-convert-rate').value);
            if (!convUsd || convUsd <= 0) throw new Error(translate('validationClientAmount'));
            if (!convRate || convRate <= 0) throw new Error(translate('validationClientRate'));
            if (convUsd > amount) throw new Error(translate('validationConvertExceeds'));

            payload.conversions = [
                {
                    usdAmount: convUsd,
                    exchangeRate: convRate,
                    date: date || undefined,
                },
            ];
        }
    }

    return payload;
}

async function handleDeleteConversion(id, convId) {
    if (!window.confirm(t()('confirmDeleteConversion'))) return;
    try {
        const res = await api.deleteIncomeConversion(id, convId);
        ui.showToast(t()('toastConversionDeleted'));
        await refreshAll();
        if (!document.getElementById('convert-modal').hidden) {
            ui.openConvertModal(res.data, state.dailyRate, state.lang);
        }
    } catch (error) {
        ui.showToast(error.message, 'error');
    }
}

function bindEvents() {
    const translate = () => t();

    // Navigation Menu (Sidebar / Mobile Bottom Nav)
    const navigateTo = (pageId) => {
        state.activePage = pageId;
        localStorage.setItem(STORAGE_KEYS.page, pageId);
        ui.switchPage(pageId);
        window.scrollTo({ top: 0, behavior: 'auto' });
    };

    document.querySelectorAll('.nav-link[data-page]').forEach((btn) => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    document.getElementById('go-to-transactions-btn').addEventListener('click', () => {
        navigateTo('transactions');
    });

    // Quick-add shortcuts on Overview header
    document.getElementById('quick-add-expense-btn').addEventListener('click', () => {
        ui.syncFormTypeUI('create', 'expense', state.lang);
        navigateTo('add');
        document.getElementById('title').focus();
    });

    document.getElementById('quick-add-income-btn').addEventListener('click', () => {
        ui.syncFormTypeUI('create', 'income', state.lang);
        navigateTo('add');
        document.getElementById('title').focus();
    });

    // Quick Date pills ("Today" / "Yesterday") on Add form
    document.querySelectorAll('[data-quick-date]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const d = new Date();
            if (btn.dataset.quickDate === 'yesterday') {
                d.setUTCDate(d.getUTCDate() - 1);
            }
            document.getElementById('date').value = ui.toDateInputValue(d.toISOString());
        });
    });

    // Clickable Category Breakdown drill-down -> Transactions filtered by category & month
    document.getElementById('category-breakdown').addEventListener('click', async (e) => {
        const drillBtn = e.target.closest('[data-drill-cat]');
        if (!drillBtn) return;

        const cat = drillBtn.dataset.drillCat;
        const filterCatSelect = document.getElementById('filter-category');
        Array.from(filterCatSelect.options).forEach((opt) => {
            opt.selected = opt.value === cat;
        });
        refreshGlassSelect(filterCatSelect);

        const start = new Date(Date.UTC(state.summaryYear, state.summaryMonth - 1, 1));
        const end = new Date(Date.UTC(state.summaryYear, state.summaryMonth, 0));
        const startStr = ui.toDateInputValue(start.toISOString());
        const endStr = ui.toDateInputValue(end.toISOString());

        state.filters.category = cat;
        state.filters.type = state.breakdownType;
        state.filters.startDate = startStr;
        state.filters.endDate = endStr;
        document.getElementById('filter-start-date').value = startStr;
        document.getElementById('filter-end-date').value = endStr;
        document.querySelectorAll('#type-filter-pills .pill-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.filterType === state.breakdownType);
        });
        ui.updateActiveFiltersBadge(state.filters);
        navigateTo('transactions');
        await loadExpenses();
    });

    // Theme Switcher (Light / Dark Mode)
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(STORAGE_KEYS.theme, state.theme);
        ui.applyTheme(state.theme);
        if (state.summaryData) {
            ui.renderSummary(
                state.summaryData,
                state.breakdownType,
                state.flowMode,
                state.displayCurrency,
                state.lang
            );
        }
    });

    // Language Switcher (Unified Liquid Glass Toggle with swipe animation)
    document.getElementById('lang-toggle-btn').addEventListener('click', () => {
        state.lang = state.lang === 'ar' ? 'en' : 'ar';
        localStorage.setItem(STORAGE_KEYS.lang, state.lang);
        syncLanguageAcrossUI();
        ui.triggerLangSwipe(state.lang);
    });

    // Global Daily Exchange Rate (input + custom -/+ steppers)
    const globalRateInput = document.getElementById('global-exchange-rate');
    globalRateInput.value = state.dailyRate;

    const applyNewDailyRate = (nextVal) => {
        const val = Math.round(Number(nextVal));
        if (val > 0) {
            state.dailyRate = val;
            globalRateInput.value = val;
            localStorage.setItem(STORAGE_KEYS.rate, String(val));
            document.getElementById('create-exchange-rate').value = val;
            document.getElementById('initial-convert-rate').value = val;
            ui.updateConversionPreview('create', state.lang);
            ui.updateInitialConvertPreview(state.lang);
            ui.showToast(translate()('toastRateUpdated'));
        } else {
            globalRateInput.value = state.dailyRate;
        }
    };

    globalRateInput.addEventListener('change', () => {
        applyNewDailyRate(globalRateInput.value);
    });

    document.getElementById('rate-dec-btn').addEventListener('click', () => {
        applyNewDailyRate(Math.max(500, state.dailyRate - 500));
    });

    document.getElementById('rate-inc-btn').addEventListener('click', () => {
        applyNewDailyRate(state.dailyRate + 500);
    });

    // Display Currency Switcher
    const displaySelect = document.getElementById('display-currency');
    displaySelect.value = state.displayCurrency;
    displaySelect.addEventListener('change', () => {
        state.displayCurrency = displaySelect.value;
        localStorage.setItem(STORAGE_KEYS.displayCurrency, state.displayCurrency);
        if (state.summaryData) {
            ui.renderSummary(
                state.summaryData,
                state.breakdownType,
                state.flowMode,
                state.displayCurrency,
                state.lang
            );
        }
        ui.renderFilteredSummary(state.filteredSummary, state.displayCurrency, state.lang);
        ui.renderExpenses(state.expenses, state.displayCurrency, state.lang);
        ui.renderRecentEntries(state.expenses, state.displayCurrency, state.lang);
    });

    // Month Navigation
    const summaryMonthSelect = document.getElementById('summary-month');
    const summaryYearInput = document.getElementById('summary-year');

    const updateSummaryDate = async (year, month) => {
        if (month < 1) {
            state.summaryMonth = 12;
            state.summaryYear = year - 1;
        } else if (month > 12) {
            state.summaryMonth = 1;
            state.summaryYear = year + 1;
        } else {
            state.summaryMonth = month;
            state.summaryYear = year;
        }
        summaryMonthSelect.value = state.summaryMonth;
        summaryYearInput.value = state.summaryYear;
        refreshGlassSelect(summaryMonthSelect);
        await loadSummary();
    };

    document.getElementById('prev-month-btn').addEventListener('click', () => {
        updateSummaryDate(state.summaryYear, state.summaryMonth - 1);
    });

    document.getElementById('next-month-btn').addEventListener('click', () => {
        updateSummaryDate(state.summaryYear, state.summaryMonth + 1);
    });

    document.getElementById('current-month-btn').addEventListener('click', () => {
        const now = new Date();
        updateSummaryDate(now.getUTCFullYear(), now.getUTCMonth() + 1);
    });

    summaryMonthSelect.addEventListener('change', (e) => {
        updateSummaryDate(state.summaryYear, Number(e.target.value));
    });

    summaryYearInput.addEventListener('change', (e) => {
        const yr = Number(e.target.value);
        if (yr >= 1970 && yr <= 9999) updateSummaryDate(yr, state.summaryMonth);
    });

    // Cash Flow Mode Tabs (Daily vs 6-Month)
    document.querySelectorAll('.tab-btn[data-flow-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.flowMode = btn.dataset.flowMode;
            if (state.summaryData) {
                ui.renderSummary(
                    state.summaryData,
                    state.breakdownType,
                    state.flowMode,
                    state.displayCurrency,
                    state.lang
                );
            }
        });
    });

    // Breakdown Tabs (Spending vs Income)
    document.querySelectorAll('.tab-btn[data-breakdown]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.breakdownType = btn.dataset.breakdown;
            if (state.summaryData) {
                ui.renderSummary(
                    state.summaryData,
                    state.breakdownType,
                    state.flowMode,
                    state.displayCurrency,
                    state.lang
                );
            }
        });
    });

    // Form Type & Currency Toggles
    document.querySelectorAll('.type-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            ui.syncFormTypeUI(btn.dataset.form, btn.dataset.type, state.lang);
        });
    });

    document.querySelectorAll('.curr-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            ui.syncFormCurrencyUI(btn.dataset.form, btn.dataset.currency, state.lang);
            ui.updateConversionPreview(btn.dataset.form, state.lang);
        });
    });

    // Live Conversion Previews
    ['amount', 'create-exchange-rate'].forEach((id) => {
        document.getElementById(id).addEventListener('input', () => {
            ui.updateConversionPreview('create', state.lang);
            ui.updateInitialConvertPreview(state.lang);
        });
    });

    ['edit-amount', 'edit-exchange-rate'].forEach((id) => {
        document.getElementById(id).addEventListener('input', () => {
            ui.updateConversionPreview('edit', state.lang);
        });
    });

    // Initial USD -> SYP Conversion Toggle inside Add Income
    const initConvCheckbox = document.getElementById('initial-convert-enabled');
    const initConvFields = document.getElementById('initial-convert-fields');
    initConvCheckbox.addEventListener('change', () => {
        initConvFields.hidden = !initConvCheckbox.checked;
        if (initConvCheckbox.checked) {
            document.getElementById('initial-convert-rate').value =
                document.getElementById('create-exchange-rate').value || state.dailyRate;
            ui.updateInitialConvertPreview(state.lang);
        }
    });

    document.querySelectorAll('[data-init-pct]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const totalUsd = Number(document.getElementById('amount').value || 0);
            const pct = Number(btn.dataset.initPct);
            if (totalUsd > 0) {
                document.getElementById('initial-convert-usd').value = Number((totalUsd * pct).toFixed(2));
                ui.updateInitialConvertPreview(state.lang);
            }
        });
    });

    ['initial-convert-usd', 'initial-convert-rate'].forEach((id) => {
        document.getElementById(id).addEventListener('input', () => {
            ui.updateInitialConvertPreview(state.lang);
        });
    });

    // Create Transaction Submit
    const createForm = document.getElementById('create-expense-form');
    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        ui.renderFormErrors('create-form-errors', null);

        try {
            const payload = extractFormPayload('create');
            await api.createExpense(payload);

            const currentType = document.getElementById('create-type').value;
            const currentCurrency = document.getElementById('create-currency').value;
            createForm.reset();
            ui.syncFormTypeUI('create', currentType, state.lang);
            ui.syncFormCurrencyUI('create', currentCurrency, state.lang);
            document.getElementById('create-exchange-rate').value = state.dailyRate;
            document.getElementById('initial-convert-rate').value = state.dailyRate;
            document.getElementById('date').value = ui.toDateInputValue(new Date().toISOString());
            document.getElementById('notes').rows = 2;
            ui.updateConversionPreview('create', state.lang);
            ui.updateInitialConvertPreview(state.lang);

            ui.showToast(translate()('toastAdded'));
            dismissMobileKeyboard();
            await refreshAll();
        } catch (error) {
            ui.renderFormErrors('create-form-errors', error);
        }
    });

    // Collapsible Filters Panel
    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    const filtersPanel = document.getElementById('filters-panel');
    toggleFiltersBtn.addEventListener('click', () => {
        const isHidden = filtersPanel.hidden;
        filtersPanel.hidden = !isHidden;
        toggleFiltersBtn.setAttribute('aria-expanded', String(isHidden));
    });

    // Search & Filters
    let searchTimer;
    document.getElementById('filter-search').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.filters.search = e.target.value;
            loadExpenses();
        }, 250);
    });

    document.querySelectorAll('#type-filter-pills .pill-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#type-filter-pills .pill-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            state.filters.type = btn.dataset.filterType;
            loadExpenses();
        });
    });

    document.querySelectorAll('#date-preset-pills .pill-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#date-preset-pills .pill-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            state.activePreset = btn.dataset.preset;

            const { startDate, endDate } = getPresetDates(state.activePreset);
            state.filters.startDate = startDate;
            state.filters.endDate = endDate;
            document.getElementById('filter-start-date').value = startDate;
            document.getElementById('filter-end-date').value = endDate;
            ui.updateActiveFiltersBadge(state.filters);
            loadExpenses();
        });
    });

    const filterInputMap = [
        ['filter-category', 'category'],
        ['filter-currency', 'currency'],
        ['filter-start-date', 'startDate'],
        ['filter-end-date', 'endDate'],
        ['filter-min-usd', 'minAmountUSD'],
        ['filter-max-usd', 'maxAmountUSD'],
        ['filter-sort', 'sort'],
    ];

    filterInputMap.forEach(([elId, filterKey]) => {
        document.getElementById(elId).addEventListener('change', (e) => {
            if (e.target.multiple) {
                state.filters[filterKey] = Array.from(e.target.selectedOptions)
                    .map((opt) => opt.value)
                    .join(',');
            } else {
                state.filters[filterKey] = e.target.value;
            }
            if (filterKey === 'startDate' || filterKey === 'endDate') {
                document.querySelectorAll('#date-preset-pills .pill-btn').forEach((b) => b.classList.remove('active'));
            }
            ui.updateActiveFiltersBadge(state.filters);
            loadExpenses();
        });
    });

    document.getElementById('reset-filters-btn').addEventListener('click', () => {
        document.getElementById('filter-form').reset();
        Array.from(document.getElementById('filter-category').options).forEach((o) => {
            o.selected = false;
        });
        ['filter-category', 'filter-currency', 'filter-sort'].forEach((id) => {
            refreshGlassSelect(document.getElementById(id));
        });
        document.getElementById('filter-search').value = '';
        state.filters = {
            type: '',
            category: '',
            currency: '',
            search: '',
            startDate: '',
            endDate: '',
            minAmountUSD: '',
            maxAmountUSD: '',
            sort: 'date_desc',
        };
        document.querySelectorAll('#type-filter-pills .pill-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.filterType === '');
        });
        document.querySelectorAll('#date-preset-pills .pill-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.preset === 'all');
        });
        ui.updateActiveFiltersBadge(state.filters);
        loadExpenses();
    });

    // Transaction Actions (Convert, Edit, Delete, Delete Conversion) across Overview & Transactions
    const handleActionClick = async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const { action, id, convId } = button.dataset;

        if (action === 'convert') {
            const item = findTransactionById(id);
            if (item) ui.openConvertModal(item, state.dailyRate, state.lang);
            return;
        }

        if (action === 'delete-conv') {
            await handleDeleteConversion(id, convId);
            return;
        }

        if (action === 'edit') {
            const item = findTransactionById(id);
            if (item) ui.openEditModal(item, state.lang);
            return;
        }

        if (action === 'delete') {
            if (!window.confirm(translate()('confirmDelete'))) return;
            try {
                await api.deleteExpense(id);
                ui.showToast(translate()('toastDeleted'));
                await refreshAll();
            } catch (error) {
                ui.showToast(error.message, 'error');
            }
        }
    };

    document.getElementById('expenses-container').addEventListener('click', handleActionClick);
    document.getElementById('usd-incomes-list').addEventListener('click', handleActionClick);
    document.getElementById('convert-history-list').addEventListener('click', handleActionClick);

    // Edit Modal Submit & Close
    document.getElementById('edit-expense-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        ui.renderFormErrors('edit-form-errors', null);
        const id = document.getElementById('edit-id').value;

        try {
            const payload = extractFormPayload('edit');
            await api.updateExpense(id, payload);
            ui.closeEditModal();
            dismissMobileKeyboard();
            ui.showToast(translate()('toastUpdated'));
            await refreshAll();
        } catch (error) {
            ui.renderFormErrors('edit-form-errors', error);
        }
    });

    document.getElementById('close-modal-btn').addEventListener('click', ui.closeEditModal);
    document.getElementById('cancel-edit-btn').addEventListener('click', ui.closeEditModal);
    document.getElementById('edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-modal') ui.closeEditModal();
    });

    // Convert USD -> SYP Modal Controls
    document.querySelectorAll('[data-conv-pct]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const remaining = Number(document.getElementById('convert-remaining-usd').dataset.remaining || 0);
            const pct = Number(btn.dataset.convPct);
            if (remaining > 0) {
                document.getElementById('convert-usd-amount').value = Number((remaining * pct).toFixed(2));
                ui.updateConvertModalPreview(state.lang);
            }
        });
    });

    ['convert-usd-amount', 'convert-exchange-rate'].forEach((id) => {
        document.getElementById(id).addEventListener('input', () => {
            ui.updateConvertModalPreview(state.lang);
        });
    });

    document.getElementById('convert-income-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        ui.renderFormErrors('convert-form-errors', null);

        const id = document.getElementById('convert-income-id').value;
        const usdAmount = Number(document.getElementById('convert-usd-amount').value);
        const exchangeRate = Number(document.getElementById('convert-exchange-rate').value);
        const date = document.getElementById('convert-date').value;
        const notes = document.getElementById('convert-notes').value.trim();

        try {
            if (!usdAmount || usdAmount <= 0) throw new Error(translate()('validationClientAmount'));
            if (!exchangeRate || exchangeRate <= 0) throw new Error(translate()('validationClientRate'));

            const payload = { usdAmount, exchangeRate };
            if (date) payload.date = date;
            if (notes) payload.notes = notes;

            const res = await api.convertIncomeToSyp(id, payload);
            dismissMobileKeyboard();
            ui.showToast(translate()('toastConverted'));
            await refreshAll();
            ui.openConvertModal(res.data, state.dailyRate, state.lang);
        } catch (error) {
            ui.renderFormErrors('convert-form-errors', error);
        }
    });

    document.getElementById('close-convert-modal-btn').addEventListener('click', ui.closeConvertModal);
    document.getElementById('cancel-convert-btn').addEventListener('click', ui.closeConvertModal);
    document.getElementById('convert-modal').addEventListener('click', (e) => {
        if (e.target.id === 'convert-modal') ui.closeConvertModal();
    });

    // Auto-expand notes textareas cleanly without manual resize handle
    ['notes', 'edit-notes'].forEach((id) => {
        const el = document.getElementById(id);
        el.addEventListener('input', () => {
            const lines = el.value.split('\n').reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 42)), 0);
            el.rows = Math.min(5, Math.max(2, lines));
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            ui.closeEditModal();
            ui.closeConvertModal();
        }
    });
}

async function init() {
    ui.applyTheme(state.theme);
    ui.hydrateStaticIcons();
    document.getElementById('date').value = ui.toDateInputValue(new Date().toISOString());
    document.getElementById('create-exchange-rate').value = state.dailyRate;
    document.getElementById('initial-convert-rate').value = state.dailyRate;

    const translate = t();
    enhanceSelect(document.getElementById('display-currency'), { compact: true, alignEnd: true });
    enhanceSelect(document.getElementById('summary-month'), { compact: true });
    enhanceSelect(document.getElementById('category'));
    enhanceSelect(document.getElementById('edit-category'));
    enhanceSelect(document.getElementById('filter-category'), {
        emptyLabel: translate('allCategories'),
        multiCountLabel: (count) => translate('multiCategoriesCount', { count }),
    });
    enhanceSelect(document.getElementById('filter-currency'));
    enhanceSelect(document.getElementById('filter-sort'));

    ui.switchPage(state.activePage);
    syncLanguageAcrossUI();
    bindEvents();
    setupMobileKeyboardHandling();
    await Promise.all([refreshHealth(), refreshAll()]);
}

init();
