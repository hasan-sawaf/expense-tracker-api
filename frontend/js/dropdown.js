import { svgIcon } from './icons.js';

/**
 * Custom iOS-style Liquid Glass dropdown enhancer for single and multi-select elements.
 * Keeps the underlying <select> synchronized so native form values and events work cleanly.
 */

const instances = new Map();
let globalListenersBound = false;

function closeAllMenus(exceptSelect = null) {
    instances.forEach((inst, selectEl) => {
        if (selectEl !== exceptSelect) {
            inst.setOpen(false);
        }
    });
}

function bindGlobalListeners() {
    if (globalListenersBound) return;
    globalListenersBound = true;

    document.addEventListener('click', (e) => {
        const insideSelect = e.target.closest('.glass-select');
        if (!insideSelect) {
            closeAllMenus();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllMenus();
        }
    });
}

function renderTriggerContent(triggerTextEl, selectEl, config) {
    if (selectEl.multiple) {
        const selected = Array.from(selectEl.selectedOptions);
        if (selected.length === 0) {
            triggerTextEl.textContent = config.emptyLabel || 'All';
            return;
        }
        if (selected.length <= 2) {
            triggerTextEl.textContent = selected.map((opt) => opt.textContent.trim()).join(' · ');
            return;
        }
        triggerTextEl.textContent = config.multiCountLabel
            ? config.multiCountLabel(selected.length)
            : `${selected.length} selected`;
        return;
    }

    const activeOpt = selectEl.options[selectEl.selectedIndex];
    if (!activeOpt) {
        triggerTextEl.textContent = '';
        return;
    }

    if (activeOpt.dataset.icon) {
        triggerTextEl.innerHTML = `${svgIcon(activeOpt.dataset.icon, 'glass-opt-icon')}<span>${activeOpt.textContent.trim()}</span>`;
    } else {
        triggerTextEl.textContent = activeOpt.textContent.trim();
    }
}

function alignMenuWithinViewport(menu, trigger, config) {
    menu.classList.remove('glass-menu-align-start', 'glass-menu-align-end', 'glass-menu-align-center');

    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const menuWidth = Math.min(Math.max(rect.width, 205), vw - 20);
    const isRtl = document.documentElement.dir === 'rtl';

    const startFits = isRtl
        ? rect.right - menuWidth >= 8
        : rect.left + menuWidth <= vw - 8;
    const endFits = isRtl
        ? rect.left + menuWidth <= vw - 8
        : rect.right - menuWidth >= 8;

    if (config.alignEnd && endFits) {
        menu.classList.add('glass-menu-align-end');
    } else if (!config.alignEnd && startFits) {
        menu.classList.add('glass-menu-align-start');
    } else if (startFits) {
        menu.classList.add('glass-menu-align-start');
    } else if (endFits) {
        menu.classList.add('glass-menu-align-end');
    } else {
        menu.classList.add('glass-menu-align-center');
    }
}

export function enhanceSelect(selectEl, config = {}) {
    if (!selectEl) return;
    bindGlobalListeners();

    if (instances.has(selectEl)) {
        updateGlassSelectConfig(selectEl, config);
        refreshGlassSelect(selectEl);
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'glass-select';
    if (config.alignEnd) wrapper.classList.add('glass-select-end');
    if (selectEl.multiple) wrapper.classList.add('glass-select-multi');
    if (config.compact) wrapper.classList.add('glass-select-compact');

    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    selectEl.classList.add('glass-native-select');
    selectEl.setAttribute('tabindex', '-1');
    selectEl.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'glass-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const triggerText = document.createElement('span');
    triggerText.className = 'glass-trigger-text';

    const chevron = document.createElement('span');
    chevron.className = 'glass-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = svgIcon('chevronDown', 'glass-chevron-svg');

    trigger.append(triggerText, chevron);

    const menu = document.createElement('div');
    menu.className = 'glass-menu';
    menu.setAttribute('role', 'listbox');
    if (selectEl.multiple) {
        menu.setAttribute('aria-multiselectable', 'true');
    }
    menu.hidden = true;

    wrapper.append(trigger, menu);

    const state = {
        config: { ...config },
        wrapper,
        trigger,
        triggerText,
        menu,
        isOpen: false,
        setOpen(open) {
            state.isOpen = open;
            menu.hidden = !open;
            wrapper.classList.toggle('is-open', open);
            trigger.setAttribute('aria-expanded', String(open));

            if (open) {
                alignMenuWithinViewport(menu, trigger, state.config);
            }
        },
    };

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            document.activeElement.blur();
        }
        const nextOpen = !state.isOpen;
        closeAllMenus(nextOpen ? selectEl : null);
        state.setOpen(nextOpen);
    });

    selectEl.addEventListener('change', () => {
        syncSelectionUI(selectEl);
    });

    instances.set(selectEl, state);
    refreshGlassSelect(selectEl);
}

export function updateGlassSelectConfig(selectEl, config = {}) {
    const inst = instances.get(selectEl);
    if (!inst) return;
    inst.config = { ...inst.config, ...config };
}

function syncSelectionUI(selectEl) {
    const inst = instances.get(selectEl);
    if (!inst) return;

    renderTriggerContent(inst.triggerText, selectEl, inst.config);

    if (selectEl.multiple) {
        const hasAnySelected = selectEl.selectedOptions.length > 0;
        const allBtn = inst.menu.querySelector('[data-glass-all="true"]');
        if (allBtn) {
            allBtn.classList.toggle('is-selected', !hasAnySelected);
            allBtn.setAttribute('aria-selected', String(!hasAnySelected));
        }

        inst.menu.querySelectorAll('[data-value]').forEach((optBtn) => {
            const opt = Array.from(selectEl.options).find((o) => o.value === optBtn.dataset.value);
            const selected = Boolean(opt?.selected);
            optBtn.classList.toggle('is-selected', selected);
            optBtn.setAttribute('aria-selected', String(selected));
        });
    } else {
        inst.menu.querySelectorAll('[data-value]').forEach((optBtn) => {
            const selected = optBtn.dataset.value === selectEl.value;
            optBtn.classList.toggle('is-selected', selected);
            optBtn.setAttribute('aria-selected', String(selected));
        });
    }
}

export function refreshGlassSelect(selectEl) {
    const inst = instances.get(selectEl);
    if (!inst) return;

    const { menu, config } = inst;
    menu.innerHTML = '';

    // Add a clear/all row at the top for multi-select dropdowns
    if (selectEl.multiple) {
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'glass-option glass-option-all';
        allBtn.setAttribute('role', 'option');
        allBtn.dataset.glassAll = 'true';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'glass-option-label';
        labelSpan.textContent = config.emptyLabel || 'All';

        const checkSpan = document.createElement('span');
        checkSpan.className = 'glass-option-check';
        checkSpan.setAttribute('aria-hidden', 'true');
        checkSpan.innerHTML = svgIcon('check', 'glass-check-svg');

        allBtn.append(labelSpan, checkSpan);
        allBtn.addEventListener('click', () => {
            Array.from(selectEl.options).forEach((opt) => {
                opt.selected = false;
            });
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            inst.setOpen(false);
        });
        menu.appendChild(allBtn);

        const divider = document.createElement('div');
        divider.className = 'glass-menu-divider';
        menu.appendChild(divider);
    }

    Array.from(selectEl.options).forEach((opt) => {
        const optBtn = document.createElement('button');
        optBtn.type = 'button';
        optBtn.className = 'glass-option';
        optBtn.setAttribute('role', 'option');
        optBtn.dataset.value = opt.value;

        const labelSpan = document.createElement('span');
        labelSpan.className = 'glass-option-label';
        if (opt.dataset.icon) {
            labelSpan.innerHTML = `${svgIcon(opt.dataset.icon, 'glass-opt-icon')}<span>${opt.textContent.trim()}</span>`;
        } else {
            labelSpan.textContent = opt.textContent.trim();
        }

        const checkSpan = document.createElement('span');
        checkSpan.className = 'glass-option-check';
        checkSpan.setAttribute('aria-hidden', 'true');
        checkSpan.innerHTML = svgIcon('check', 'glass-check-svg');

        optBtn.append(labelSpan, checkSpan);

        optBtn.addEventListener('click', () => {
            if (selectEl.multiple) {
                opt.selected = !opt.selected;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                if (selectEl.value !== opt.value) {
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
                inst.setOpen(false);
            }
        });

        menu.appendChild(optBtn);
    });

    syncSelectionUI(selectEl);
}
