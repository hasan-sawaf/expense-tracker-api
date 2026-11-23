import { CATEGORY_META } from './config.js';
import { createTranslator, TRANSLATIONS } from './i18n.js';

let cashFlowChartInstance = null;
let categoryDonutInstance = null;

const compactFmt = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

const fullUsdFmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const numFmt = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
});

function formatCompactAxis(val, isSyp) {
    if (val === 0) return isSyp ? '0' : '$0';
    return isSyp ? compactFmt.format(val) : `$${compactFmt.format(val)}`;
}

function formatTooltipAmount(usd, syp, displayCurrency, lang) {
    const sypSym = TRANSLATIONS[lang]?.sypSymbol || 'SYP';
    const usdStr = fullUsdFmt.format(usd);
    const sypStr = `${numFmt.format(Math.round(syp))} ${sypSym}`;

    if (displayCurrency === 'SYP') return sypStr;
    if (displayCurrency === 'USD') return usdStr;
    return `${usdStr} (${sypStr})`;
}

function createAreaGradient(ctx, topColor, bottomColor) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    return gradient;
}

/**
 * Renders the Cash Flow chart using Chart.js:
 * - Daily mode: smooth dual-area flow chart with gradient fills
 * - 6-Month Trend mode: rounded grouped bars + Net flow line
 */
export function renderCashFlowChart(summary, flowMode, displayCurrency, lang) {
    const ChartLib = window.Chart;
    const canvas = document.getElementById('cashflow-canvas');
    const wrap = document.getElementById('cashflow-canvas-wrap');
    const emptyEl = document.getElementById('cashflow-empty');

    if (!ChartLib || !canvas) return;

    const t = createTranslator(lang);
    const useSypAxis = displayCurrency === 'SYP';
    const monthsShort = TRANSLATIONS[lang]?.monthsShort || TRANSLATIONS.en.monthsShort;
    const isRtl = lang === 'ar';

    const series = flowMode === 'monthly'
        ? (summary.monthlyTrend || []).map((m) => ({
            label: `${monthsShort[m.month - 1]} ${m.year}`,
            incomeUSD: m.incomeUSD,
            spentUSD: m.spentUSD,
            netUSD: m.netUSD,
            incomeSYP: m.incomeSYP,
            spentSYP: m.spentSYP,
            netSYP: m.netSYP,
            incomeVal: useSypAxis ? m.incomeSYP : m.incomeUSD,
            spentVal: useSypAxis ? m.spentSYP : m.spentUSD,
            netVal: useSypAxis ? m.netSYP : m.netUSD,
        }))
        : (summary.dailyFlow || []).map((d) => ({
            label: String(d.day),
            fullDate: d.date,
            incomeUSD: d.incomeUSD,
            spentUSD: d.spentUSD,
            netUSD: Number((d.incomeUSD - d.spentUSD).toFixed(2)),
            incomeSYP: d.incomeSYP,
            spentSYP: d.spentSYP,
            netSYP: d.incomeSYP - d.spentSYP,
            incomeVal: useSypAxis ? d.incomeSYP : d.incomeUSD,
            spentVal: useSypAxis ? d.spentSYP : d.spentUSD,
            netVal: useSypAxis ? (d.incomeSYP - d.spentSYP) : (d.incomeUSD - d.spentUSD),
        }));

    const hasData = series.some((s) => s.incomeVal > 0 || s.spentVal > 0);
    if (!hasData || series.length === 0) {
        if (cashFlowChartInstance) {
            cashFlowChartInstance.destroy();
            cashFlowChartInstance = null;
        }
        wrap.hidden = true;
        emptyEl.hidden = false;
        return;
    }

    wrap.hidden = false;
    emptyEl.hidden = true;

    const ctx = canvas.getContext('2d');
    if (cashFlowChartInstance) {
        cashFlowChartInstance.destroy();
    }

    const labels = series.map((s) => s.label);
    const incomeData = series.map((s) => s.incomeVal);
    const spentData = series.map((s) => s.spentVal);
    const netData = series.map((s) => s.netVal);

    const isDaily = flowMode === 'daily';
    const isDark = document.documentElement.dataset.theme === 'dark';
    const legendColor = isDark ? '#cbd5e1' : '#475569';
    const tickColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.26)';
    const tooltipBg = isDark ? 'rgba(2, 6, 23, 0.94)' : 'rgba(15, 23, 42, 0.92)';

    const datasets = isDaily
        ? [
            {
                label: t('flowIncomeLegend'),
                data: incomeData,
                borderColor: '#059669',
                backgroundColor: createAreaGradient(ctx, 'rgba(5, 150, 105, 0.24)', 'rgba(5, 150, 105, 0.01)'),
                borderWidth: 2.5,
                fill: true,
                tension: 0.36,
                pointRadius: incomeData.map((v) => (v > 0 ? 4 : 0)),
                pointHoverRadius: 6,
                pointBackgroundColor: '#059669',
            },
            {
                label: t('flowSpentLegend'),
                data: spentData,
                borderColor: '#e11d48',
                backgroundColor: createAreaGradient(ctx, 'rgba(225, 29, 72, 0.22)', 'rgba(225, 29, 72, 0.01)'),
                borderWidth: 2.5,
                fill: true,
                tension: 0.36,
                pointRadius: spentData.map((v) => (v > 0 ? 4 : 0)),
                pointHoverRadius: 6,
                pointBackgroundColor: '#e11d48',
            },
            {
                label: t('flowNetLabel'),
                data: netData,
                borderColor: '#2563eb',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 4],
                fill: false,
                tension: 0.36,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointBackgroundColor: '#2563eb',
            },
        ]
        : [
            {
                type: 'line',
                label: t('flowNetLabel'),
                data: netData,
                borderColor: '#2563eb',
                backgroundColor: '#2563eb',
                borderWidth: 2.5,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                order: 0,
            },
            {
                type: 'bar',
                label: t('flowIncomeLegend'),
                data: incomeData,
                backgroundColor: 'rgba(5, 150, 105, 0.85)',
                hoverBackgroundColor: '#059669',
                borderRadius: 7,
                maxBarThickness: 28,
                order: 1,
            },
            {
                type: 'bar',
                label: t('flowSpentLegend'),
                data: spentData,
                backgroundColor: 'rgba(225, 29, 72, 0.85)',
                hoverBackgroundColor: '#e11d48',
                borderRadius: 7,
                maxBarThickness: 28,
                order: 2,
            },
        ];

    cashFlowChartInstance = new ChartLib(ctx, {
        type: isDaily ? 'line' : 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 12, right: 8, left: 4, bottom: 2 },
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: isRtl ? 'start' : 'end',
                    rtl: isRtl,
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        boxHeight: 8,
                        padding: 16,
                        font: { size: 12, weight: '600' },
                        color: legendColor,
                    },
                },
                tooltip: {
                    rtl: isRtl,
                    backgroundColor: tooltipBg,
                    padding: 11,
                    cornerRadius: 12,
                    titleFont: { size: 12, weight: '700' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        title(items) {
                            const idx = items[0]?.dataIndex;
                            const item = series[idx];
                            return item?.fullDate || item?.label || '';
                        },
                        label(context) {
                            const idx = context.dataIndex;
                            const s = series[idx];
                            if (!s) return '';

                            if (context.dataset.label === t('flowIncomeLegend')) {
                                return `${t('flowIncomeLegend')}: ${formatTooltipAmount(s.incomeUSD, s.incomeSYP, displayCurrency, lang)}`;
                            }
                            if (context.dataset.label === t('flowSpentLegend')) {
                                return `${t('flowSpentLegend')}: ${formatTooltipAmount(s.spentUSD, s.spentSYP, displayCurrency, lang)}`;
                            }
                            const netSign = s.netUSD > 0 ? '+' : s.netUSD < 0 ? '−' : '';
                            return `${t('flowNetLabel')}: ${netSign}${formatTooltipAmount(Math.abs(s.netUSD), Math.abs(s.netSYP), displayCurrency, lang)}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: isDaily ? 10 : 6,
                        color: tickColor,
                        font: { size: 11, weight: '600' },
                    },
                },
                y: {
                    grace: '18%',
                    beginAtZero: true,
                    border: {
                        display: false,
                        dash: [4, 4],
                    },
                    grid: {
                        color: gridColor,
                    },
                    ticks: {
                        padding: 8,
                        color: tickColor,
                        font: { size: 11, weight: '600' },
                        callback: (value) => formatCompactAxis(value, useSypAxis),
                    },
                },
            },
        },
    });
}

/**
 * Renders the Category Breakdown Doughnut chart using Chart.js.
 */
export function renderCategoryDonutChart(items, totalUSD, totalSYP, displayCurrency, lang) {
    const ChartLib = window.Chart;
    const wrapper = document.getElementById('category-donut');
    const canvas = document.getElementById('category-donut-canvas');
    const centerEl = document.getElementById('donut-center-total');

    if (!ChartLib || !canvas || !items || items.length === 0 || totalUSD <= 0) {
        if (categoryDonutInstance) {
            categoryDonutInstance.destroy();
            categoryDonutInstance = null;
        }
        if (wrapper) wrapper.hidden = true;
        return;
    }

    wrapper.hidden = false;
    const t = createTranslator(lang);
    const categoriesMap = t('categories');
    const isRtl = lang === 'ar';

    centerEl.textContent = displayCurrency === 'SYP'
        ? formatCompactAxis(totalSYP, true)
        : fullUsdFmt.format(totalUSD);

    const labels = items.map((item) => categoriesMap[item.category] || item.category);
    const data = items.map((item) => (displayCurrency === 'SYP' ? item.totalSYP : item.totalUSD));
    const colors = items.map((item) => CATEGORY_META[item.category]?.color || CATEGORY_META.other.color);

    if (categoryDonutInstance) {
        categoryDonutInstance.destroy();
    }

    const isDark = document.documentElement.dataset.theme === 'dark';
    const donutBorder = isDark ? 'rgba(15, 23, 42, 0.85)' : '#ffffff';

    categoryDonutInstance = new ChartLib(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    data,
                    backgroundColor: colors,
                    borderColor: donutBorder,
                    borderWidth: 2,
                    borderRadius: 5,
                    spacing: 2,
                    hoverOffset: 6,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    rtl: isRtl,
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    padding: 10,
                    cornerRadius: 10,
                    callbacks: {
                        label(ctx) {
                            const item = items[ctx.dataIndex];
                            if (!item) return '';
                            const pct = totalUSD > 0 ? Math.round((item.totalUSD / totalUSD) * 100) : 0;
                            return `${formatTooltipAmount(item.totalUSD, item.totalSYP, displayCurrency, lang)} · ${pct}%`;
                        },
                    },
                },
            },
        },
    });
}
