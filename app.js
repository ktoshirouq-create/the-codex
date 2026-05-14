document.addEventListener('DOMContentLoaded', () => {
    
    // --- STATE & CONFIG ---
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    let recipeVault = {};
    let parsedStagingData = []; 
    let editingCocktailName = null;

    window.lastUsedRound = 1;
    let fDrinks = 20; 
    let fDilution = 20;
    let abvDilution = 20;

    let activeSpecSelect = null; 
    let activeRevSpec = null;
    let activeRevIng = null;
    let activeRevIngAmt = 0;
    let activeAbvSpec = null;

   // --- HELPERS ---
    const UNIT_TO_ML = { ml: 1, g: 1, dash: 0.8, squeeze: 15, qty: 0 };
    const capitalize = (str) => str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const triggerHaptic = (t = 'light') => {
        if (!navigator.vibrate) return;
        t === 'heavy' ? navigator.vibrate([80, 40, 80]) : navigator.vibrate(30);
    };

    const showLoader = (m) => {
        const lText = document.querySelector('.loader-text');
        if (lText) lText.innerText = m;
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        }
    };

    const hideLoader = () => {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.opacity = '0'; 
            setTimeout(() => loader.style.display = 'none', 300);
        }
    };

    // --- BOUNCER QUICK CHECK ---
    const updateBouncer = () => {
        const today = new Date();
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        
        const date18 = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        const date20 = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate());
        
        const d18El = document.getElementById('date-18');
        const d20El = document.getElementById('date-20');
        
        if (d18El) d18El.innerText = date18.toLocaleDateString('en-US', options).toUpperCase();
        if (d20El) d20El.innerText = date20.toLocaleDateString('en-US', options).toUpperCase();
    };
    updateBouncer();

    // --- PULL TO REFRESH ---
    let touchStartY = 0;
    const scrollArea = document.getElementById('scroll-area');
    const ptrIndicator = document.getElementById('ptr-indicator');

    if (scrollArea && ptrIndicator) {
        scrollArea.addEventListener('touchstart', e => { if (scrollArea.scrollTop === 0) touchStartY = e.touches[0].clientY; }, {passive: true});
        scrollArea.addEventListener('touchmove', e => {
            if (scrollArea.scrollTop === 0 && touchStartY > 0) {
                const pullDistance = e.touches[0].clientY - touchStartY;
                if (pullDistance > 0 && pullDistance < 120) {
                    ptrIndicator.style.transform = `translateY(${pullDistance * 0.5}px)`;
                    ptrIndicator.style.opacity = pullDistance / 100;
                }
            }
        }, {passive: true});
        scrollArea.addEventListener('touchend', e => {
            if (scrollArea.scrollTop === 0 && touchStartY > 0) {
                const pullDistance = e.changedTouches[0].clientY - touchStartY;
                if (pullDistance > 70) {
                    ptrIndicator.innerText = "REFRESHING...";
                    triggerHaptic('heavy');
                    setTimeout(() => window.location.reload(true), 150); 
                } else {
                    ptrIndicator.style.transform = `translateY(-20px)`;
                    ptrIndicator.style.opacity = 0;
                }
            }
            touchStartY = 0;
        }, {passive: true});
    }

    // --- CUSTOM MODAL & PHYSICS ---
    const modal = document.getElementById('selection-modal');
    const modalContent = document.getElementById('modal-content-area');
    const dragZone = document.getElementById('modal-drag-zone');
    const dragHandle = document.querySelector('.drag-handle');
    let dragStartY = 0; let dragCurrentY = 0; let isDragging = false;

    function openSelectModal(title, options, onSelect, customInput = null) {
        triggerHaptic();
        document.getElementById('selection-modal-title').innerText = title;
        const list = document.getElementById('selection-modal-list');
        list.innerHTML = '';
        
        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'modal-item';
            item.innerText = opt.label;
            item.onclick = () => { triggerHaptic(); onSelect(opt.value, opt.label, opt.data); closeSelectModal(); };
            list.appendChild(item);
        });
        
        if (customInput) {
            const wrap = document.createElement('div');
            wrap.className = 'modal-custom-input';
            wrap.innerHTML = `
                <input type="text" class="premium-text-input" placeholder="${customInput.placeholder || 'Custom...'}" style="margin-bottom: 0;">
                <button class="btn-primary" style="margin-top: 12px;">${customInput.btnLabel || 'ADD'}</button>
            `;
            const input = wrap.querySelector('input');
            const btn = wrap.querySelector('button');
            btn.addEventListener('click', () => {
                const val = input.value.trim();
                if (!val) return;
                triggerHaptic('heavy');
                customInput.onSubmit(val);
                closeSelectModal();
            });
            input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
            list.appendChild(wrap);
            setTimeout(() => input.focus(), 350);
        }
        
        modal.classList.remove('hidden');
    }

    function closeSelectModal() {
        if (!modalContent || !modal) return;
        triggerHaptic('light');
        modalContent.style.transform = `translateY(100%)`;
        setTimeout(() => {
            modal.classList.add('hidden');
            modalContent.style.transform = ''; 
            modalContent.style.transition = '';
        }, 300);
    }

    if (modal) {
        modal.onclick = (e) => { if(e.target === modal) closeSelectModal(); };
        document.getElementById('close-selection-modal').onclick = closeSelectModal;
    }

    function openConfirmModal({ title = 'CONFIRM', message, confirmLabel = 'CONFIRM', cancelLabel = 'CANCEL', danger = false, onConfirm }) {
        triggerHaptic();
        document.getElementById('selection-modal-title').innerText = title;
        const list = document.getElementById('selection-modal-list');
        list.innerHTML = '';
        const messageEl = document.createElement('div');
        messageEl.className = 'modal-message';
        messageEl.innerText = message;
        list.appendChild(messageEl);
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        actions.innerHTML = `
            <button class="btn-secondary">${cancelLabel}</button>
            <button class="btn-primary ${danger ? 'burgundy-btn' : ''}">${confirmLabel}</button>
        `;
        actions.children[0].addEventListener('click', () => { triggerHaptic('light'); closeSelectModal(); });
        actions.children[1].addEventListener('click', () => { triggerHaptic('heavy'); closeSelectModal(); if (onConfirm) onConfirm(); });
        list.appendChild(actions);
        modal.classList.remove('hidden');
    }

    function openAlertModal({ title = 'NOTICE', message, onClose }) {
        triggerHaptic();
        document.getElementById('selection-modal-title').innerText = title;
        const list = document.getElementById('selection-modal-list');
        list.innerHTML = '';
        const messageEl = document.createElement('div');
        messageEl.className = 'modal-message';
        messageEl.innerText = message;
        list.appendChild(messageEl);
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        actions.innerHTML = `<button class="btn-primary">OK</button>`;
        actions.children[0].addEventListener('click', () => { triggerHaptic('light'); closeSelectModal(); if (onClose) onClose(); });
        list.appendChild(actions);
        modal.classList.remove('hidden');
    }

    if (dragZone && dragHandle && modalContent) {
        const startDrag = (e) => { dragStartY = e.touches[0].clientY; isDragging = true; modalContent.style.transition = 'none'; };
        const moveDrag = (e) => {
            if(!isDragging) return;
            const deltaY = e.touches[0].clientY - dragStartY;
            if (deltaY > 0) { dragCurrentY = deltaY; modalContent.style.transform = `translateY(${dragCurrentY}px)`; }
        };
        const endDrag = () => {
            if(!isDragging) return;
            isDragging = false;
            modalContent.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            if (dragCurrentY > 100) closeSelectModal();
            else modalContent.style.transform = 'translateY(0)';
            dragCurrentY = 0;
        };

        dragZone.addEventListener('touchstart', startDrag, {passive: true});
        dragZone.addEventListener('touchmove', moveDrag, {passive: true});
        dragZone.addEventListener('touchend', endDrag);
        dragHandle.addEventListener('touchstart', startDrag, {passive: true});
        dragHandle.addEventListener('touchmove', moveDrag, {passive: true});
        dragHandle.addEventListener('touchend', endDrag);
    }

    // --- DB & VAULT ---
    async function loadVault() {
        showLoader("SYNCING CODEX...");
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error("Network error");
            const data = await res.json();
            recipeVault = {}; 
            data.forEach(row => {
                if(!recipeVault[row.cocktailName]) recipeVault[row.cocktailName] = [];
                recipeVault[row.cocktailName].push({ name: row.ingredientName, amount: row.amount, color: row.categoryTag });
            });
            renderVault();
            hideLoader();
        } catch (e) {
            console.error("Sync Failed:", e);
            const lText = document.querySelector('.loader-text');
            if (lText) lText.innerText = "OFFLINE MODE";
            setTimeout(hideLoader, 1500);
        }
    }
    loadVault();

    function formatAmount(n) {
        return n.toFixed(1).replace(/\.0$/, '');
    }

    function renderVaultContent(container, cocktail, subBatches, round) {
        container.innerHTML = '';
        const mainIngs = recipeVault[cocktail] || [];

        if (mainIngs.length > 0) {
            const mainSection = document.createElement('div');
            mainSection.className = 'vault-main-section';
            let html = '';
            mainIngs.forEach(ing => {
                const amt = ing.amount * round;
                html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${formatAmount(amt)}ml</span></div>`;
            });
            mainSection.innerHTML = html;
            container.appendChild(mainSection);
        }

        if (subBatches.length > 0) {
            if (mainIngs.length > 0) {
                const divider = document.createElement('div');
                divider.className = 'vault-divider';
                container.appendChild(divider);
            }

            subBatches.forEach(sbName => {
                const sbIngs = recipeVault[sbName] || [];
                if (sbIngs.length === 0) return;
                const label = sbName.replace(cocktail + ' — ', '');
                const batchYield = sbIngs.reduce((s, i) => s + (i.amount || 0), 0);
                const mainRef = mainIngs.find(i => i.name === label);
                let yieldLabel = `${formatAmount(batchYield)}ml`;
                if (mainRef && mainRef.amount > 0) {
                    const drinks = Math.floor(batchYield / mainRef.amount);
                    yieldLabel += ` · ${drinks} drinks`;
                }
                const section = document.createElement('div');
                section.className = 'vault-subbatch';
                let html = `<h4 class="vault-subbatch-title">${label.toUpperCase()}<span class="vault-yield-label">${yieldLabel}</span></h4>`;
                sbIngs.forEach(ing => {
                    html += `<div class="subbatch-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${formatAmount(ing.amount)}ml</span></div>`;
                });
                section.innerHTML = html;
                container.appendChild(section);
            });
        }
    }

    function renderVault() {
        const list = document.getElementById('managed-vault-list');
        if (!list) return;
        list.innerHTML = '';
        const specs = Object.keys(recipeVault);
        if (specs.length === 0) { list.innerHTML = '<p class="text-muted text-sm">Database empty.</p>'; return; }

        const catOrder = { 'amber-glow': 1, 'neon-cyan': 2, 'juice-glow': 3, 'magenta-glow': 4 };
        const mains = specs.filter(s => !s.includes(' — '));
        const orphans = specs.filter(s => s.includes(' — ') && !mains.some(m => s.startsWith(m + ' — ')));
        const toRender = [...mains, ...orphans];

        toRender.forEach(cocktail => {
            recipeVault[cocktail].sort((a, b) => (catOrder[a.color] || 5) - (catOrder[b.color] || 5));
            const subBatches = specs.filter(s => s.startsWith(cocktail + ' — '));
            subBatches.forEach(sb => recipeVault[sb].sort((a, b) => (catOrder[a.color] || 5) - (catOrder[b.color] || 5)));

            const id = cocktail.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
            const escapedName = cocktail.replace(/'/g, "\\'");

            const vItem = document.createElement('div');
            vItem.className = 'vault-item';

            const header = document.createElement('div');
            header.className = 'vault-header';
            header.innerHTML = `<span class="cocktail-title">${cocktail}</span>`;
            vItem.appendChild(header);

            const details = document.createElement('div');
            details.className = 'vault-details';
            details.id = `details-${id}`;

            const mult = document.createElement('div');
            mult.className = 'service-multiplier';
            mult.onclick = (e) => e.stopPropagation();
            mult.innerHTML = `
                <span class="text-sm fw-bold text-muted">ROUND MULTIPLIER:</span>
                <div class="stepper-control mini-stepper" style="width: auto;">
                    <button class="stepper-btn" data-action="round-minus">−</button>
                    <span class="stepper-value">1</span>
                    <button class="stepper-btn" data-action="round-plus">+</button>
                </div>
            `;
            details.appendChild(mult);

            const content = document.createElement('div');
            content.className = 'vault-content';
            details.appendChild(content);
            vItem.appendChild(details);

            renderVaultContent(content, cocktail, subBatches, 1);

            const getRound = () => parseInt(mult.querySelector('.stepper-value').innerText) || 1;

            mult.querySelector('[data-action="round-minus"]').addEventListener('click', (e) => {
                e.stopPropagation();
                triggerHaptic('light');
                const valEl = mult.querySelector('.stepper-value');
                const current = getRound();
                if (current > 1) {
                    valEl.innerText = current - 1;
                    renderVaultContent(content, cocktail, subBatches, current - 1);
                }
            });
            mult.querySelector('[data-action="round-plus"]').addEventListener('click', (e) => {
                e.stopPropagation();
                triggerHaptic('light');
                const valEl = mult.querySelector('.stepper-value');
                const next = getRound() + 1;
                valEl.innerText = next;
                renderVaultContent(content, cocktail, subBatches, next);
            });

            // Quick tap → toggle expand. Long-press → action sheet (edit/delete).
            let pressTimer = null;
            let pressStart = null;
            vItem.addEventListener('pointerdown', (e) => {
                if (e.target.closest('button') || e.target.closest('input')) return;
                pressStart = { x: e.clientX, y: e.clientY };
                pressTimer = setTimeout(() => {
                    pressTimer = null;
                    triggerHaptic('medium');
                    if (typeof window.openActionSheet === 'function') window.openActionSheet(cocktail);
                }, 500);
            });
            vItem.addEventListener('pointermove', (e) => {
                if (!pressTimer || !pressStart) return;
                const dx = Math.abs(e.clientX - pressStart.x);
                const dy = Math.abs(e.clientY - pressStart.y);
                if (dx > 10 || dy > 10) { clearTimeout(pressTimer); pressTimer = null; }
            });
            vItem.addEventListener('pointerup', () => {
                if (!pressTimer) return;
                clearTimeout(pressTimer);
                pressTimer = null;
                triggerHaptic('light');
                vItem.classList.toggle('expanded');
            });
            vItem.addEventListener('pointercancel', () => {
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            });
            list.appendChild(vItem);
        });

            }

    window.updateRound = (cocktailId, change) => {
        triggerHaptic('light');
        const valSpan = document.getElementById(`mult-val-${cocktailId}`);
        if (!valSpan) return;
        let next = (parseInt(valSpan.innerText) || 1) + change;
        if(next < 1) next = 1;
        
        valSpan.innerText = next;
        window.lastUsedRound = next; 

        const container = document.getElementById(`recipe-list-${cocktailId}`);
        if (container) {
            container.querySelectorAll('.base-amt').forEach(el => {
                el.innerText = `${(parseFloat(el.getAttribute('data-base')) * next).toFixed(1).replace(/\.0$/, '')}ml`;
            });
            const totalEl = container.querySelector('.base-total');
            if(totalEl) totalEl.innerText = `${(parseFloat(totalEl.getAttribute('data-base')) * next).toFixed(1).replace(/\.0$/, '')}ml`;
        }
    };

    const searchInput = document.getElementById('vault-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('.vault-item').forEach(item => {
                const title = item.querySelector('.cocktail-title').innerText.toLowerCase();
                item.style.display = title.includes(term) ? 'block' : 'none';
            });
        });
    }

    // --- SPEC BUILDER ---
    let builderState = { name: '', sections: [{ name: 'MAIN', ingredients: [] }] };
    const catLabels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'juice-glow': 'JUICE', 'magenta-glow': 'SYRUP' };

    function renderBuilder() {
        const container = document.getElementById('builder-sections');
        if (!container) return;
        container.innerHTML = '';
        builderState.sections.forEach((sec, secIdx) => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'builder-section';
            sectionEl.innerHTML = `
                <div class="builder-section-header">
                    <span class="builder-section-title">${sec.name}</span>
                    ${secIdx > 0 ? '<button class="builder-section-remove">×</button>' : ''}
                </div>
                <div class="builder-rows"></div>
                <button class="builder-add-ing">＋ INGREDIENT</button>
            `;
            const rowsEl = sectionEl.querySelector('.builder-rows');
            sec.ingredients.forEach((ing, ingIdx) => {
                const row = document.createElement('div');
                row.className = 'builder-row';
                row.innerHTML = `
                    <input type="number" class="builder-row-amount" value="${ing.amount || ''}" placeholder="0">
                    <input type="text" class="builder-row-name" value="${(ing.name || '').replace(/"/g, '&quot;')}" placeholder="Ingredient">
                    <button class="builder-row-cat ${ing.cat}">${catLabels[ing.cat] || 'SPIRIT'}</button>
                    <button class="builder-row-remove">×</button>
                `;
                row.querySelector('.builder-row-amount').addEventListener('input', e => {
                    builderState.sections[secIdx].ingredients[ingIdx].amount = parseFloat(e.target.value) || 0;
                });
                row.querySelector('.builder-row-name').addEventListener('input', e => {
                    builderState.sections[secIdx].ingredients[ingIdx].name = e.target.value;
                });
                row.querySelector('.builder-row-cat').addEventListener('click', () => {
                    triggerHaptic('light');
                    const cats = ['amber-glow', 'neon-cyan', 'juice-glow', 'magenta-glow'];
                    const current = builderState.sections[secIdx].ingredients[ingIdx].cat;
                    const next = cats[(cats.indexOf(current) + 1) % cats.length];
                    builderState.sections[secIdx].ingredients[ingIdx].cat = next;
                    const btn = row.querySelector('.builder-row-cat');
                    btn.className = `builder-row-cat ${next}`;
                    btn.innerText = catLabels[next];
                });
                row.querySelector('.builder-row-remove').addEventListener('click', () => {
                    triggerHaptic('light');
                    builderState.sections[secIdx].ingredients.splice(ingIdx, 1);
                    renderBuilder();
                });
                rowsEl.appendChild(row);
            });
            sectionEl.querySelector('.builder-add-ing').addEventListener('click', () => {
                triggerHaptic('light');
                builderState.sections[secIdx].ingredients.push({ amount: 0, name: '', cat: 'amber-glow' });
                renderBuilder();
            });
            if (secIdx > 0) {
                sectionEl.querySelector('.builder-section-remove').addEventListener('click', () => {
                    openConfirmModal({
                        title: 'REMOVE SECTION',
                        message: `Remove "${sec.name}"? Ingredients in it will be lost.`,
                        confirmLabel: 'REMOVE',
                        danger: true,
                        onConfirm: () => {
                            builderState.sections.splice(secIdx, 1);
                            renderBuilder();
                        }
                    });
                });
            }
            container.appendChild(sectionEl);
        });
    }

    function resetBuilder() {
        builderState = { name: '', sections: [{ name: 'MAIN', ingredients: [] }] };
        const nameInput = document.getElementById('builder-name');
        if (nameInput) nameInput.value = '';
        editingCocktailName = null;
        if (typeof closeBatchBuilder === 'function') closeBatchBuilder();
        renderBuilder();
        if (typeof collapseSpecBuilder === 'function') collapseSpecBuilder();
    }

    const addSectionBtn = document.getElementById('add-section-btn');
    if (addSectionBtn) {
        addSectionBtn.addEventListener('click', () => {
            triggerHaptic('light');
            const presets = [
                { label: 'Spirit Batch', value: 'Spirit Batch' },
                { label: 'Juice Batch', value: 'Juice Batch' },
                { label: 'Cream', value: 'Cream' },
                { label: 'Mocktail', value: 'Mocktail' }
            ];
            openSelectModal('ADD SECTION', presets,
                (val) => {
                    builderState.sections.push({ name: val, ingredients: [] });
                    renderBuilder();
                },
                {
                    placeholder: 'Or type custom section name...',
                    btnLabel: 'ADD CUSTOM',
                    onSubmit: (val) => {
                        builderState.sections.push({ name: capitalize(val), ingredients: [] });
                        renderBuilder();
                    }
                }
            );
        });
    }

    const saveSpecBtn = document.getElementById('save-spec-btn');
    if (saveSpecBtn) {
        saveSpecBtn.addEventListener('click', async () => {
            triggerHaptic('heavy');
            const name = capitalize(document.getElementById('builder-name').value.trim());
            if (!name) {
                openAlertModal({ title: 'NAME REQUIRED', message: 'Add a cocktail name before saving.' });
                return;
            }
            const payload = [];
            builderState.sections.forEach(sec => {
                const sectionName = sec.name === 'MAIN' ? name : `${name} — ${sec.name}`;
                sec.ingredients.forEach(ing => {
                    if (!ing.name.trim() || !ing.amount) return;
                    payload.push({
                        cocktailName: sectionName,
                        ingredientName: capitalize(ing.name.trim()),
                        amount: parseFloat(ing.amount),
                        bottleSize: 0,
                        categoryTag: ing.cat
                    });
                });
            });
            if (payload.length === 0) {
                openAlertModal({ title: 'NO INGREDIENTS', message: 'Add at least one ingredient with name and amount.' });
                return;
            }
            showLoader("SAVING SPEC...");
            try {
                if (editingCocktailName) {
                    const toDelete = [editingCocktailName, ...Object.keys(recipeVault).filter(n => n.startsWith(editingCocktailName + ' — '))];
                    for (const n of toDelete) {
                        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: n }) });
                    }
                }
                await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
                resetBuilder();
                await loadVault();
            } catch (e) {
                hideLoader();
                openAlertModal({ title: 'SAVE FAILED', message: 'Something went wrong. Please try again.' });
            }
        });
    }

    const toggleBulkBtn = document.getElementById('toggle-bulk-import');
    if (toggleBulkBtn) {
        toggleBulkBtn.addEventListener('click', () => {
            triggerHaptic('light');
            const ui = document.getElementById('bulk-import-ui');
            if (ui) ui.classList.toggle('hidden');
        });
    }

    // --- BATCH BUILDER (one tap creates sub-section + MAIN reference) ---
    let batchBuilderState = null;

    function openBatchBuilder() {
        batchBuilderState = {
            type: 'Spirit Batch',
            customType: '',
            ingredients: [{ amount: 0, name: '', cat: 'amber-glow' }],
            perDrink: 50
        };
        renderBatchForm();
    }

    function closeBatchBuilder() {
        batchBuilderState = null;
        const c = document.getElementById('batch-form-container');
        if (c) c.innerHTML = '';
    }

    function confirmBatchBuilder() {
        if (!batchBuilderState) return;
        const validIngs = batchBuilderState.ingredients.filter(i => i.name.trim() && i.amount > 0);
        if (validIngs.length === 0) return openAlertModal("Add at least one constituent ingredient with name and amount.");
        const perDrink = batchBuilderState.perDrink;
        if (!perDrink || perDrink <= 0) return openAlertModal("Set a per-drink amount.");
        const batchName = batchBuilderState.type === 'Custom'
            ? capitalize(batchBuilderState.customType.trim())
            : batchBuilderState.type;
        if (!batchName) return openAlertModal("Pick a batch type or enter a custom name.");
        const categoryMap = { 'Spirit Batch': 'amber-glow', 'Juice Batch': 'juice-glow', 'Mocktail': 'juice-glow' };
        const mainCat = categoryMap[batchName] || 'amber-glow';
        let subSection = builderState.sections.find(s => s.name === batchName);
        if (!subSection) {
            subSection = { name: batchName, ingredients: [] };
            builderState.sections.push(subSection);
        }
        validIngs.forEach(i => {
            subSection.ingredients.push({ amount: i.amount, name: capitalize(i.name.trim()), cat: i.cat });
        });
        const mainSection = builderState.sections.find(s => s.name === 'MAIN');
        if (mainSection) {
            const existing = mainSection.ingredients.find(i => i.name && i.name.toLowerCase() === batchName.toLowerCase());
            if (existing) { existing.amount = perDrink; existing.cat = mainCat; }
            else { mainSection.ingredients.push({ amount: perDrink, name: batchName, cat: mainCat }); }
        }
        closeBatchBuilder();
        renderBuilder();
    }

    function renderBatchForm() {
        const container = document.getElementById('batch-form-container');
        if (!container) return;
        if (!batchBuilderState) { container.innerHTML = ''; return; }
        const types = ['Spirit Batch', 'Juice Batch', 'Mocktail', 'Custom'];
        container.innerHTML = `
            <div class="batch-form">
                <h4 class="batch-form-title">NEW BATCH</h4>
                <div class="batch-type-pills">
                    ${types.map(t => `<button class="batch-type-pill ${batchBuilderState.type === t ? 'active' : ''}" data-type="${t}">${t.replace(' Batch', '')}</button>`).join('')}
                </div>
                ${batchBuilderState.type === 'Custom' ? `<input type="text" class="premium-text-input batch-custom-input" placeholder="Batch name" value="${batchBuilderState.customType.replace(/"/g, '&quot;')}">` : ''}
                <h5 class="batch-section-label">CONSTITUENTS (batch recipe amounts)</h5>
                <div id="batch-ingredients-list"></div>
                <button id="batch-add-ing-btn" class="builder-add-ing">＋ INGREDIENT</button>
                <div class="batch-per-drink-row">
                    <span class="batch-per-drink-label">Per drink:</span>
                    <button class="batch-stepper-btn" id="batch-per-drink-minus">−5</button>
                    <input type="number" id="batch-per-drink-input" class="batch-per-drink-input" value="${batchBuilderState.perDrink}">
                    <button class="batch-stepper-btn" id="batch-per-drink-plus">+5</button>
                    <span class="batch-per-drink-suffix">ml</span>
                </div>
                <div id="batch-yield-display" class="batch-yield-display"></div>
                <div class="batch-form-actions">
                    <button id="batch-cancel-btn" class="batch-cancel">CANCEL</button>
                    <button id="batch-create-btn" class="batch-confirm">CREATE BATCH</button>
                </div>
            </div>
        `;
        container.querySelectorAll('.batch-type-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                triggerHaptic('light');
                batchBuilderState.type = pill.getAttribute('data-type');
                if (batchBuilderState.type === 'Mocktail') {
                    batchBuilderState.ingredients.forEach(ing => {
                        if (ing.cat === 'amber-glow' || ing.cat === 'neon-cyan') ing.cat = 'juice-glow';
                    });
                }
                renderBatchForm();
            });
        });
        const customInput = container.querySelector('.batch-custom-input');
        if (customInput) customInput.addEventListener('input', e => { batchBuilderState.customType = e.target.value; });
        renderBatchIngredients();
        document.getElementById('batch-add-ing-btn').addEventListener('click', () => {
            triggerHaptic('light');
            const defaultCat = batchBuilderState.type === 'Mocktail' ? 'juice-glow' : 'amber-glow';
            batchBuilderState.ingredients.push({ amount: 0, name: '', cat: defaultCat });
            renderBatchIngredients();
        });
        document.getElementById('batch-per-drink-input').addEventListener('input', e => {
            batchBuilderState.perDrink = parseFloat(e.target.value) || 0;
            updateBatchYieldDisplay();
        });
        document.getElementById('batch-per-drink-minus').addEventListener('click', () => {
            triggerHaptic('light');
            batchBuilderState.perDrink = Math.max(0, (batchBuilderState.perDrink || 0) - 5);
            document.getElementById('batch-per-drink-input').value = batchBuilderState.perDrink;
            updateBatchYieldDisplay();
        });
        document.getElementById('batch-per-drink-plus').addEventListener('click', () => {
            triggerHaptic('light');
            batchBuilderState.perDrink = (batchBuilderState.perDrink || 0) + 5;
            document.getElementById('batch-per-drink-input').value = batchBuilderState.perDrink;
            updateBatchYieldDisplay();
        });
        document.getElementById('batch-cancel-btn').addEventListener('click', () => { triggerHaptic('light'); closeBatchBuilder(); });
        document.getElementById('batch-create-btn').addEventListener('click', () => { triggerHaptic('heavy'); confirmBatchBuilder(); });
        updateBatchYieldDisplay();
    }

    function renderBatchIngredients() {
        const list = document.getElementById('batch-ingredients-list');
        if (!list || !batchBuilderState) return;
        list.innerHTML = '';
        batchBuilderState.ingredients.forEach((ing, idx) => {
            const row = document.createElement('div');
            row.className = 'builder-row';
            row.innerHTML = `
                <input type="number" class="builder-row-amount" value="${ing.amount || ''}" placeholder="0">
                <input type="text" class="builder-row-name" value="${(ing.name || '').replace(/"/g, '&quot;')}" placeholder="Ingredient">
                <button class="builder-row-cat ${ing.cat}">${catLabels[ing.cat] || 'SPIRIT'}</button>
                <button class="builder-row-remove">×</button>
            `;
            row.querySelector('.builder-row-amount').addEventListener('input', e => {
                batchBuilderState.ingredients[idx].amount = parseFloat(e.target.value) || 0;
                updateBatchYieldDisplay();
            });
            row.querySelector('.builder-row-name').addEventListener('input', e => {
                batchBuilderState.ingredients[idx].name = e.target.value;
            });
            row.querySelector('.builder-row-cat').addEventListener('click', () => {
                triggerHaptic('light');
                const cats = batchBuilderState.type === 'Mocktail'
                    ? ['juice-glow', 'magenta-glow']
                    : ['amber-glow', 'neon-cyan', 'juice-glow', 'magenta-glow'];
                const current = batchBuilderState.ingredients[idx].cat;
                let curIdx = cats.indexOf(current);
                const next = cats[(curIdx + 1) % cats.length];
                batchBuilderState.ingredients[idx].cat = next;
                const btn = row.querySelector('.builder-row-cat');
                btn.className = `builder-row-cat ${next}`;
                btn.innerText = catLabels[next];
            });
            row.querySelector('.builder-row-remove').addEventListener('click', () => {
                triggerHaptic('light');
                batchBuilderState.ingredients.splice(idx, 1);
                if (batchBuilderState.ingredients.length === 0) {
                    const def = batchBuilderState.type === 'Mocktail' ? 'juice-glow' : 'amber-glow';
                    batchBuilderState.ingredients.push({ amount: 0, name: '', cat: def });
                }
                renderBatchIngredients();
                updateBatchYieldDisplay();
            });
            list.appendChild(row);
        });
    }

    function updateBatchYieldDisplay() {
        const display = document.getElementById('batch-yield-display');
        if (!display || !batchBuilderState) return;
        const total = batchBuilderState.ingredients.reduce((s, i) => s + (i.amount || 0), 0);
        const perDrink = batchBuilderState.perDrink || 0;
        if (total === 0) { display.innerText = ''; return; }
        let text = `Yields ${formatAmount(total)}ml`;
        if (perDrink > 0) {
            const drinks = Math.floor(total / perDrink);
            text += ` · ${drinks} drink${drinks !== 1 ? 's' : ''}`;
        }
        display.innerText = text;
    }

    const addBatchBtn = document.getElementById('add-batch-btn');
    if (addBatchBtn) {
        addBatchBtn.addEventListener('click', () => {
            triggerHaptic('light');
            if (batchBuilderState) closeBatchBuilder();
            else openBatchBuilder();
        });
    }

    renderBuilder();

    // Kill the legacy LOCKED toggle
    const legacyLockBtn = document.getElementById('edit-toggle');
    if (legacyLockBtn) legacyLockBtn.remove();

    // Spec Builder: collapsible new/edit flow
    function expandSpecBuilder() {
        document.getElementById('new-spec-btn')?.classList.add('hidden');
        document.getElementById('builder-content')?.classList.remove('hidden');
    }
    function collapseSpecBuilder() {
        document.getElementById('new-spec-btn')?.classList.remove('hidden');
        document.getElementById('builder-content')?.classList.add('hidden');
    }
    window.expandSpecBuilder = expandSpecBuilder;
    window.collapseSpecBuilder = collapseSpecBuilder;
    document.getElementById('new-spec-btn')?.addEventListener('click', () => {
        triggerHaptic('light');
        expandSpecBuilder();
    });
    document.getElementById('cancel-spec-btn')?.addEventListener('click', () => {
        triggerHaptic('light');
        resetBuilder();
    });

    // Inject long-press action sheet modal
    if (!document.getElementById('action-sheet-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="action-sheet-modal" class="modal-overlay hidden">
                <div class="action-sheet">
                    <div class="action-sheet-title"></div>
                    <button class="action-sheet-btn" data-action="edit">EDIT SPEC</button>
                    <button class="action-sheet-btn action-sheet-danger" data-action="delete">DELETE</button>
                    <button class="action-sheet-btn action-sheet-cancel" data-action="cancel">CANCEL</button>
                </div>
            </div>
        `);
        const sheet = document.getElementById('action-sheet-modal');
        sheet.addEventListener('click', (e) => {
            if (e.target === sheet) { sheet.classList.add('hidden'); return; }
            const action = e.target.getAttribute('data-action');
            if (!action) return;
            const cocktailName = sheet.dataset.cocktailName;
            sheet.classList.add('hidden');
            if (action === 'edit' && cocktailName) editSpec(cocktailName);
            else if (action === 'delete' && cocktailName) deleteSpec(cocktailName);
        });
    }
    window.openActionSheet = (cocktailName) => {
        const sheet = document.getElementById('action-sheet-modal');
        if (!sheet) return;
        sheet.dataset.cocktailName = cocktailName;
        sheet.querySelector('.action-sheet-title').innerText = cocktailName;
        sheet.classList.remove('hidden');
    };
    // --- EDIT & DELETE ---
    window.editSpec = (name) => {
        triggerHaptic('heavy');
        editingCocktailName = name;
        const related = [name, ...Object.keys(recipeVault).filter(n => n.startsWith(name + ' — '))];
        builderState = { name: name, sections: [] };
        related.forEach(sectionName => {
            const isMain = sectionName === name;
            const sec = { name: isMain ? 'MAIN' : sectionName.replace(name + ' — ', ''), ingredients: [] };
            (recipeVault[sectionName] || []).forEach(ing => {
                sec.ingredients.push({ amount: ing.amount, name: ing.name, cat: ing.color });
            });
            builderState.sections.push(sec);
        });
        builderState.sections.sort((a, b) => (a.name === 'MAIN' ? -1 : (b.name === 'MAIN' ? 1 : 0)));
        document.getElementById('builder-name').value = name;
        renderBuilder();
        if (typeof expandSpecBuilder === 'function') expandSpecBuilder();
        document.getElementById('scroll-area').scrollTop = 0;
    };

    window.deleteSpec = (name) => {
        openConfirmModal({
            title: 'DELETE SPEC',
            message: `Delete "${name}"? This can't be undone.`,
            confirmLabel: 'DELETE',
            danger: true,
            onConfirm: async () => {
                triggerHaptic('heavy');
                showLoader("DELETING...");
                try {
                    await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: name }) });
                    await loadVault();
                } catch (e) { hideLoader(); }
            }
        });
    };

    // --- SMART PARSER ---
    const parseBtn = document.getElementById('parse-btn');
    if (parseBtn) {
        parseBtn.addEventListener('click', () => {
            triggerHaptic('light');
            const title = capitalize(document.getElementById('spec-title-input').value.trim());
            const text = document.getElementById('keep-paste-area').value;
            if(!title || !text) {                 openAlertModal({ title: 'MISSING INFO', message: 'Need both a cocktail title and recipe text.' });                 return;             }
            if (editingCocktailName && editingCocktailName !== title) editingCocktailName = null;

            parsedStagingData = [];
            const lines = text.split('\n');
            const lineRegex = /^(\d+(?:[.,]\d+)?)\s*(.+)$/;
            const ratioRegex = /^\d+\s*:\s*\d+\s+(.+)$/;
            const unitStrip = /^(?:ml|g|oz|cl|tbsp|tsp|dash(?:es)?|squeeze(?:s)?|pinch(?:es)?|drop(?:s)?|barspoon(?:s)?|bsp|cube(?:s)?|leaves|leaf|shot(?:s)?)\s+/i;
            const underscoreRegex = /^_+\s*(.+?)\s*_+$/;
            // Only EXPLICIT batch patterns count as section headers — everything else is prep/garnish/skip
            const batchHeaderRegex = /^(spirit\s*batch|juice\s*batch|cream(?:\s+batch)?|mocktail|.+\s+batch)\s*:?\s*$/i;
            const syrupKeys = ['syrup', 'sugar', 'agave', 'honey', 'gomme', 'orgeat', 'falernum', 'grenadine', 'cordial'];
            const liqueurKeys = ['liqueur', 'licor', 'amaro', 'campari', 'aperol', 'vermouth', 'cointreau', 'triple sec', 'chartreuse', 'bénédictine', 'benedictine', 'maraschino', 'amaretto', 'disaronno', 'dissarono', 'kahlua', 'tia maria', 'baileys', 'crème de', 'creme de', 'sambuca', 'absinthe', 'pastis', 'sherry', 'port', 'madeira', 'lillet', 'suze', 'fernet', 'jägermeister', 'jagermeister', 'drambuie', 'galliano', 'frangelico', 'midori', 'curaçao', 'curacao', 'st-germain', 'st. germain', 'bitters', 'angostura', 'peychaud', 'wine', 'champagne', 'prosecco', 'cava'];
            const juiceKeys = ['juice', 'puree', 'lemon', 'lime', 'orange', 'grapefruit', 'pineapple', 'cranberry', 'apple', 'tomato', 'water', 'soda', 'tonic', 'cola', 'ginger beer', 'coconut', 'milk', 'cream', 'egg', 'yuzu', 'passion', 'mango', 'raspberry', 'strawberry', 'blackberry', 'blueberry', 'watermelon', 'cucumber', 'kiwi', 'lychee', 'guava', 'peach', 'pear', 'rhubarb', 'beetroot', 'carrot', 'fig'];

            const detectBatchType = (raw) => {
                const low = raw.toLowerCase();
                if (/spirit\s*batch/.test(low)) return 'Spirit Batch';
                if (/juice\s*batch/.test(low)) return 'Juice Batch';
                if (/mocktail/.test(low)) return 'Mocktail';
                if (/cream/.test(low)) return 'Cream';
                return capitalize(raw.replace(/:$/, '').trim());
            };

            const categorize = (name) => {
                const low = name.toLowerCase();
                if (/spirit\s*batch/.test(low)) return 'amber-glow';
                if (/juice\s*batch/.test(low)) return 'juice-glow';
                if (/mocktail/.test(low)) return 'juice-glow';
                if (/cream.*batch/.test(low)) return 'magenta-glow';
                if (syrupKeys.some(k => low.includes(k))) return 'magenta-glow';
                if (liqueurKeys.some(k => low.includes(k))) return 'neon-cyan';
                if (juiceKeys.some(k => low.includes(k))) return 'juice-glow';
                return 'amber-glow';
            };

            let currentSection = title;
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;

                // Underscore section: __Spirit Batch__
                const underscoreMatch = trimmed.match(underscoreRegex);
                if (underscoreMatch) {
                    currentSection = `${title} — ${detectBatchType(underscoreMatch[1])}`;
                    return;
                }

                // Explicit batch header (non-numbered line matching batch pattern)
                if (!/^\d/.test(trimmed) && batchHeaderRegex.test(trimmed)) {
                    currentSection = `${title} — ${detectBatchType(trimmed)}`;
                    return;
                }

                // Ratio line: "1:1 X juice and Y juice" → split into placeholder ingredients (amount 0)
                const ratioMatch = trimmed.match(ratioRegex);
                if (ratioMatch) {
                    const parts = ratioMatch[1].split(/\s+and\s+/i);
                    parts.forEach(p => {
                        const name = capitalize(p.trim());
                        if (!name) return;
                        parsedStagingData.push({ cocktailName: currentSection, ingredientName: name, amount: 0, bottleSize: 0, categoryTag: categorize(name) });
                    });
                    return;
                }

                // Ingredient line (starts with a number)
                const ingMatch = trimmed.match(lineRegex);
                if (ingMatch) {
                    const amt = parseFloat(ingMatch[1].replace(',', '.'));
                    const rest = ingMatch[2].replace(unitStrip, '').trim();
                    if (!rest) return;
                    const name = capitalize(rest);
                    parsedStagingData.push({ cocktailName: currentSection, ingredientName: name, amount: amt, bottleSize: 0, categoryTag: categorize(name) });
                    return;
                }

                // Everything else (prep, garnish, instructions, qualitative ingredients) is skipped
                // — add those manually in staging review after parsing
            });
            renderStagingArea();
        });
    }

    function renderStagingArea() {
        const container = document.getElementById('staging-area');
        const list = document.getElementById('staging-list');
        list.innerHTML = '';
        
        if(parsedStagingData.length === 0) {
            container.classList.add('hidden');
            openAlertModal({ title: 'NO INGREDIENTS', message: "Couldn't find any ingredients. Check your format (e.g., '30ml Gin')." });
            return;
        }

        const labels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'magenta-glow': 'SYRUP', 'juice-glow': 'JUICE' };
        const groups = {};
        parsedStagingData.forEach((ing, i) => {
            if (!groups[ing.cocktailName]) groups[ing.cocktailName] = [];
            groups[ing.cocktailName].push({ ing, originalIndex: i });
        });

        Object.entries(groups).forEach(([sectionName, items]) => {
            const header = document.createElement('div');
            header.className = 'staging-section-header';
            header.innerText = sectionName;
            list.appendChild(header);
            
            items.forEach(({ ing, originalIndex }) => {
                const row = document.createElement('div');
                row.className = 'staging-row';
                row.innerHTML = `
                    <div class="staging-inputs">
                        <input type="number" class="stage-amt" value="${ing.amount}" onchange="updateStaging(${originalIndex}, 'amount', this.value)">
                        <input type="text" class="stage-name" value="${ing.ingredientName}" onchange="updateStaging(${originalIndex}, 'ingredientName', this.value)">
                    </div>
                    <button class="stage-cat ${ing.categoryTag}" onclick="cycleCategory(${originalIndex})">${labels[ing.categoryTag]}</button>
                `;
                list.appendChild(row);
            });
        });
        container.classList.remove('hidden');
    }

    window.updateStaging = (index, field, val) => {
        if(field === 'amount') parsedStagingData[index].amount = parseFloat(val);
        else parsedStagingData[index][field] = capitalize(val);
    };

    window.cycleCategory = (index) => {
        triggerHaptic('light');
        const tags = ['amber-glow', 'neon-cyan', 'magenta-glow', 'juice-glow'];
        const labels = { 'amber-glow': 'SPIRIT', 'neon-cyan': 'LIQUEUR', 'magenta-glow': 'SYRUP', 'juice-glow': 'JUICE' };
        let curr = tags.indexOf(parsedStagingData[index].categoryTag);
        let next = (curr + 1) % tags.length;
        const newTag = tags[next];
        parsedStagingData[index].categoryTag = newTag;
        const rows = document.querySelectorAll('#staging-list .staging-row');
        if (rows[index]) {
            const btn = rows[index].querySelector('.stage-cat');
            if (btn) { btn.className = `stage-cat ${newTag}`; btn.innerText = labels[newTag]; }
        }
    };

    const syncBtn = document.getElementById('sync-vault-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            if(parsedStagingData.length === 0) return;
            triggerHaptic('heavy');
            showLoader("PUSHING TO CODEX...");
            try {
                if (editingCocktailName) {
                    const toDelete = [editingCocktailName, ...Object.keys(recipeVault).filter(n => n.startsWith(editingCocktailName + ' — '))];
                    for (const n of toDelete) {
                        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: n }) });
                    }
                }
                await fetch(API_URL, { method: 'POST', body: JSON.stringify(parsedStagingData) });
                
                document.getElementById('spec-title-input').value = '';
                document.getElementById('keep-paste-area').value = '';
                document.getElementById('staging-area').classList.add('hidden');
                parsedStagingData = [];
                editingCocktailName = null;
                
                await loadVault();
            } catch (e) { hideLoader(); }
        });
    }

    // --- LAB: ABV CALCULATOR ---
    const updateAbvDilUI = () => {
        const valEl = document.getElementById('abv-dil-val');
        if(valEl) valEl.innerText = abvDilution + '%';
    };

    const abvMinus = document.getElementById('abv-dil-minus');
    const abvPlus = document.getElementById('abv-dil-plus');
    if (abvMinus) abvMinus.onclick = () => { triggerHaptic('light'); if(abvDilution > 0) { abvDilution--; updateAbvDilUI(); } };
    if (abvPlus) abvPlus.onclick = () => { triggerHaptic('light'); abvDilution++; updateAbvDilUI(); };

    window.changeAbv = (index, delta) => {
        triggerHaptic('light');
        const el = document.getElementById(`abv-val-${index}`);
        if (!el) return;
        let current = parseFloat(el.getAttribute('data-abv')) || 0;
        let next = current + delta;
        if (next < 0) next = 0;
        if (next > 100) next = 100;
        el.setAttribute('data-abv', next);
        el.innerText = next + '%';
    };

    const btnAbvSpec = document.getElementById('btn-abv-spec');
    if (btnAbvSpec) {
        btnAbvSpec.onclick = () => {
            openSelectModal('SELECT SPEC FOR ABV', Object.keys(recipeVault).map(s => ({label: s, value: s})), (v, l) => {
                activeAbvSpec = v; 
                document.getElementById('btn-abv-spec').innerText = l; 
                document.getElementById('btn-abv-spec').style.color = "var(--text-main)"; 
                document.getElementById('btn-abv-spec').classList.remove('text-muted');
                
                const list = document.getElementById('abv-ing-list'); 
                list.innerHTML = '';
                
                recipeVault[v].forEach((ing, i) => {
                    let defAbv = 0; 
                    if(ing.color === 'amber-glow') defAbv = 40; 
                    if(ing.color === 'neon-cyan') defAbv = 20; 
                    
                    list.innerHTML += `
                        <div class="abv-input-row" style="margin-bottom: 10px;">
                            <span class="abv-ing-name ${ing.color}">${ing.name} <span class="text-muted">(${ing.amount}ml)</span></span>
                            <div class="stepper-control mini-stepper" style="width: 110px;">
                                <button class="stepper-btn" onclick="changeAbv(${i}, -1)">−</button>
                                <span class="stepper-value abv-param" id="abv-val-${i}" data-vol="${ing.amount}" data-abv="${defAbv}">${defAbv}%</span>
                                <button class="stepper-btn" onclick="changeAbv(${i}, 1)">+</button>
                            </div>
                        </div>`;
                });
                document.getElementById('abv-ing-container').classList.remove('hidden'); 
                document.getElementById('abv-results').innerHTML = '';
            });
        };
    }

    const calcAbvBtn = document.getElementById('calc-abv-btn');
    if (calcAbvBtn) {
        calcAbvBtn.onclick = () => {
            triggerHaptic('heavy');
            let totalAlc = 0, totalVol = 0;
            document.querySelectorAll('.abv-param').forEach(el => {
                const v = parseFloat(el.getAttribute('data-vol')); 
                const abv = parseFloat(el.getAttribute('data-abv')) || 0;
                totalVol += v; 
                totalAlc += (v * (abv / 100));
            });
            if (totalVol === 0) return;
            const finalAbv = (totalAlc / (totalVol * (1 + (abvDilution / 100)))) * 100;
            document.getElementById('abv-results').innerHTML = `
                <div class="result-row mt-10"><span class="ing-name text-gold fw-bold">FINAL BATCH ABV</span><span class="ing-amount">${finalAbv.toFixed(1)}%</span></div>
                <div class="result-row"><span class="ing-name text-muted text-sm">After ${abvDilution}% Dilution</span></div>`;
        };
    }

    // --- LAB: FAT & PROTEIN WASHING ---
    let washType = 'milk'; 
    let fatIntensity = 'standard';
    
    document.querySelectorAll('.wash-pill').forEach(p => p.addEventListener('click', (e) => {
        triggerHaptic('light');
        document.querySelectorAll('.wash-pill').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        washType = e.target.getAttribute('data-val');
        
        document.getElementById('ui-milk-wash').classList.toggle('hidden', washType !== 'milk');
        document.getElementById('ui-fat-wash').classList.toggle('hidden', washType !== 'fat');
        document.getElementById('wash-results').innerHTML = '';
    }));

    const btnFatType = document.getElementById('btn-fat-type');
    if (btnFatType) {
        btnFatType.addEventListener('click', () => {
            const opts = [
                { label: 'Standard (Butter / Coconut Oil)', value: 'standard' },
                { label: 'Heavy (Bacon / Sesame / Blue Cheese)', value: 'heavy' }
            ];
            openSelectModal('SELECT FAT INTENSITY', opts, (val, label) => {
                fatIntensity = val;
                document.getElementById('btn-fat-type').innerText = label;
            });
        });
    }

    const calcWashBtn = document.getElementById('calc-wash-btn');
    if (calcWashBtn) {
        calcWashBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            const res = document.getElementById('wash-results');
            if (washType === 'milk') {
                const punchVol = parseFloat(document.getElementById('milk-punch-vol').value) || 0;
                res.innerHTML = `
                    <h3 class="zone-header">CLARIFICATION (4:1 RATIO)</h3>
                    <div class="result-row amber-glow"><span class="ing-name">Whole Milk Required</span><span class="ing-amount">${(punchVol/4).toFixed(0)}ml</span></div>
                    <div class="result-row"><span class="ing-name text-muted text-sm">RULE: Pour Punch INTO the Milk.</span></div>
                `;
            } else {
                const spiritVol = parseFloat(document.getElementById('fat-spirit-vol').value) || 0;
                const ratio = fatIntensity === 'standard' ? (240/700) : (120/700);
                res.innerHTML = `
                    <h3 class="zone-header">FAT EXTRACTION</h3>
                    <div class="result-row neon-cyan"><span class="ing-name">Warm Liquid Fat</span><span class="ing-amount">${(spiritVol * ratio).toFixed(0)}g</span></div>
                    <div class="result-row"><span class="ing-name text-muted text-sm">Infuse at room temp. Freeze overnight. Skim solid fat.</span></div>
                `;
            }
        });
    }

    // --- LAB: ACID ADJUSTER ---
    let activeAcidBase = { val: 'orange' }; 
    let activeAcidTarget = 'lemon';
    
    const btnAcidBase = document.getElementById('btn-acid-base');
    if (btnAcidBase) {
        btnAcidBase.addEventListener('click', () => {
            openSelectModal('SELECT BASE LIQUID', [
                {label: 'Orange Juice (~1%)', value: 'orange'},
                {label: 'Grapefruit (~2%)', value: 'grapefruit'},
                {label: 'Pineapple (~0.8%)', value: 'pineapple'}
            ], (v, l) => {
                activeAcidBase.val = v; 
                document.getElementById('btn-acid-base').innerText = l;
            });
        });
    }

    const btnAcidTarget = document.getElementById('btn-acid-target');
    if (btnAcidTarget) {
        btnAcidTarget.addEventListener('click', () => {
            openSelectModal('SELECT TARGET ACIDITY', [
                {label: 'Lemon (6% Citric)', value: 'lemon'},
                {label: 'Lime (4% Cit, 2% Mal)', value: 'lime'}
            ], (v, l) => {
                activeAcidTarget = v; 
                document.getElementById('btn-acid-target').innerText = l;
            });
        });
    }

    const calcAcidBtn = document.getElementById('calc-acid-btn');
    if (calcAcidBtn) {
        calcAcidBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            const vol = parseFloat(document.getElementById('acid-vol').value) || 0;
            const res = document.getElementById('acid-results');
            if(!vol) return;

            let cit = 0, mal = 0;
            if (activeAcidTarget === 'lemon') {
                if(activeAcidBase.val === 'orange') cit = vol * 0.05;
                if(activeAcidBase.val === 'grapefruit') cit = vol * 0.04;
                if(activeAcidBase.val === 'pineapple') cit = vol * 0.052;
            } else {
                if(activeAcidBase.val === 'orange') { cit = vol * 0.03; mal = vol * 0.02; }
                if(activeAcidBase.val === 'grapefruit') { cit = vol * 0.02; mal = vol * 0.02; }
                if(activeAcidBase.val === 'pineapple') { cit = vol * 0.032; mal = vol * 0.02; }
            }

            res.innerHTML = `
                <div class="result-row amber-glow"><span class="ing-name">Citric Acid Powder</span><span class="ing-amount">${cit.toFixed(1)}g</span></div>
                ${mal > 0 ? `<div class="result-row magenta-glow"><span class="ing-name">Malic Acid Powder</span><span class="ing-amount">${mal.toFixed(1)}g</span></div>` : ''}
            `;
        });
    }

    // --- LAB: MODIFIER ENGINE ---
    let modType = 'cordial';
    document.querySelectorAll('.mod-pill').forEach(p => p.addEventListener('click', (e) => {
        triggerHaptic('light');
        document.querySelectorAll('.mod-pill').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        modType = e.target.getAttribute('data-val');
        const guide = document.getElementById('shrub-guide');
        if (guide) guide.classList.toggle('hidden', modType !== 'shrub');
    }));

    const calcModBtn = document.getElementById('calc-mod-btn');
    if (calcModBtn) {
        calcModBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            const weight = parseFloat(document.getElementById('mod-weight').value) || 0;
            const res = document.getElementById('mod-results');
            if(!weight) return;

            if (modType === 'cordial') {
                const totalAcid = weight * 0.015;
                const cit = totalAcid * 0.75;
                const mal = totalAcid * 0.25;
                res.innerHTML = `
                    <h3 class="zone-header">CORDIAL POWDERS</h3>
                    <div class="result-row amber-glow"><span class="ing-name">Citric Acid</span><span class="ing-amount">${cit.toFixed(1)}g</span></div>
                    <div class="result-row magenta-glow"><span class="ing-name">Malic Acid</span><span class="ing-amount">${mal.toFixed(1)}g</span></div>
                `;
            } else {
                const vin = weight * 0.5;
                res.innerHTML = `
                    <h3 class="zone-header">SHRUB LIQUID</h3>
                    <div class="result-row neon-cyan"><span class="ing-name">Vinegar Weight</span><span class="ing-amount">${vin.toFixed(0)}g</span></div>
                `;
            }
        });
    }

    // --- SCALE: BATCHING & STEPPERS ---
    const updateScaleUI = () => {
        const fdEl = document.getElementById('fd-val');
        const dilEl = document.getElementById('dil-val');
        if (fdEl) fdEl.innerText = fDrinks;
        if (dilEl) dilEl.innerText = fDilution + '%';
    };

    const fdMinus = document.getElementById('fd-minus');
    const fdPlus = document.getElementById('fd-plus');
    const dilMinus = document.getElementById('dil-minus');
    const dilPlus = document.getElementById('dil-plus');
    
    if (fdMinus) fdMinus.addEventListener('click', () => { triggerHaptic('light'); if(fDrinks > 1) { fDrinks--; updateScaleUI(); } });
    if (fdPlus) fdPlus.addEventListener('click', () => { triggerHaptic('light'); fDrinks++; updateScaleUI(); });
    if (dilMinus) dilMinus.addEventListener('click', () => { triggerHaptic('light'); if(fDilution > 0) { fDilution--; updateScaleUI(); } });
    if (dilPlus) dilPlus.addEventListener('click', () => { triggerHaptic('light'); fDilution++; updateScaleUI(); });

    window.updateDilution = (val) => {
        triggerHaptic('light');
        fDilution = val;
        updateScaleUI();
    };

    const btnFwdSpec = document.getElementById('btn-forward-spec');
    if (btnFwdSpec) {
        btnFwdSpec.addEventListener('click', () => {
            const specs = Object.keys(recipeVault).map(s => ({label: s, value: s}));
            openSelectModal('SELECT SPEC FOR BATCH', specs, (val, label) => {
                activeSpecSelect = val;
                document.getElementById('btn-forward-spec').innerText = label;
                document.getElementById('btn-forward-spec').style.color = "var(--text-main)";
                document.getElementById('btn-forward-spec').classList.remove('text-muted');
            });
        });
    }

    const calcFwdBtn = document.getElementById('calc-forward-btn');
    if (calcFwdBtn) {
        calcFwdBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            const res = document.getElementById('forward-results');
            if(!activeSpecSelect || fDrinks <= 0) return;
            
            const spec = recipeVault[activeSpecSelect];
            let html = '<h3 class="zone-header">BATCH YIELD</h3>';
            let totalVol = 0;

            spec.forEach(ing => {
                const amt = ing.amount * fDrinks;
                totalVol += amt;
                html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${amt.toFixed(0)}ml</span></div>`;
            });

            if (fDilution > 0) {
                const water = totalVol * (fDilution / 100);
                totalVol += water;
                html += `<div class="result-row"><span class="ing-name text-muted">Filtered Water (${fDilution}%)</span><span class="ing-amount text-muted">${water.toFixed(0)}ml</span></div>`;
            }
            
            html += `<div class="result-row mt-10"><span class="ing-name text-gold fw-bold">TOTAL BATCH VOLUME</span><span class="ing-amount">${totalVol.toFixed(0)}ml</span></div>`;
            res.innerHTML = html;
        });
    }

    const btnRevSpec = document.getElementById('btn-reverse-spec');
    if (btnRevSpec) {
        btnRevSpec.addEventListener('click', () => {
            const specs = Object.keys(recipeVault).map(s => ({label: s, value: s}));
            openSelectModal('SELECT SPEC', specs, (val, label) => {
                activeRevSpec = val;
                document.getElementById('btn-reverse-spec').innerText = label;
                document.getElementById('btn-reverse-spec').style.color = "var(--text-main)";
                document.getElementById('btn-reverse-spec').classList.remove('text-muted');
                
                activeRevIng = null;
                document.getElementById('btn-reverse-ing').innerText = "Select Limiting Ingredient...";
                document.getElementById('btn-reverse-ing').classList.add('text-muted');
                document.getElementById('btn-reverse-ing').classList.remove('hidden');
                document.getElementById('reverse-vol-container').classList.add('hidden');
            });
        });
    }

    const btnRevIng = document.getElementById('btn-reverse-ing');
    if (btnRevIng) {
        btnRevIng.addEventListener('click', () => {
            if(!activeRevSpec) return;
            const spec = recipeVault[activeRevSpec];
            const ings = spec.map(ing => ({label: `${ing.name} (${ing.amount}ml)`, value: ing.name, data: ing.amount}));
            
            openSelectModal('LIMITING INGREDIENT', ings, (val, label, amt) => {
                activeRevIng = val;
                activeRevIngAmt = amt;
                document.getElementById('btn-reverse-ing').innerText = label;
                document.getElementById('btn-reverse-ing').style.color = "var(--text-main)";
                document.getElementById('btn-reverse-ing').classList.remove('text-muted');
                document.getElementById('reverse-vol-container').classList.remove('hidden');
            });
        });
    }

    const calcRevBtn = document.getElementById('calc-reverse-btn');
    if (calcRevBtn) {
        calcRevBtn.addEventListener('click', () => {
            triggerHaptic('heavy');
            const availVol = parseFloat(document.getElementById('reverse-vol').value) || 0;
            const res = document.getElementById('reverse-results');
            
            if(!activeRevSpec || !activeRevIng || availVol <= 0) return;

            const maxDrinks = Math.floor(availVol / activeRevIngAmt);
            const spec = recipeVault[activeRevSpec];
            
            let html = `<h3 class="zone-header">MAX YIELD: ${maxDrinks} DRINKS</h3>`;
            
            spec.forEach(ing => {
                const reqAmt = ing.amount * maxDrinks;
                let displayAmt = `${reqAmt.toFixed(0)}ml`;
                if(ing.name === activeRevIng) displayAmt = `${reqAmt.toFixed(0)}ml <span class="text-muted text-sm">(Empty)</span>`;
                
                html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${displayAmt}</span></div>`;
            });
            res.innerHTML = html;
        });
    }

    // --- NAV & LOCK LOGIC ---
    const tabs = document.querySelectorAll('.nav-tab');
    const modules = document.querySelectorAll('.module');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            triggerHaptic('light');
            const targetEl = e.currentTarget;
            tabs.forEach(t => t.classList.remove('active'));
            modules.forEach(m => m.classList.remove('active'));
            targetEl.classList.add('active');
            const moduleTarget = document.getElementById(targetEl.getAttribute('data-target'));
            if (moduleTarget) moduleTarget.classList.add('active');
            const scrollArea = document.getElementById('scroll-area');
            if (scrollArea) scrollArea.scrollTop = 0;
        });
    });

    const lockBtn = document.getElementById('edit-toggle');
    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            triggerHaptic('light');
            const isLocked = lockBtn.innerText === 'LOCKED';
            
            lockBtn.innerText = isLocked ? 'EDIT MODE' : 'LOCKED';
            lockBtn.style.color = isLocked ? 'var(--nodee-gold)' : 'var(--text-muted)';
            lockBtn.style.borderColor = isLocked ? 'var(--nodee-gold)' : 'var(--text-muted)';
            
            const parserUI = document.getElementById('admin-parser-ui');
            if(parserUI) parserUI.classList.toggle('hidden', !isLocked);
            
            document.querySelectorAll('.admin-controls').forEach(el => el.classList.toggle('hidden', !isLocked));
            
            if(!isLocked) {
                editingCocktailName = null;
                document.getElementById('spec-title-input').value = '';
                document.getElementById('keep-paste-area').value = '';
                document.getElementById('staging-area').classList.add('hidden');
                parsedStagingData = [];
                resetBuilder();
            }
        });
    }
});
