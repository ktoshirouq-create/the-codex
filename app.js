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

    function openSelectModal(title, options, onSelect) {
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

    function renderVault() {
        const list = document.getElementById('managed-vault-list');
        if (!list) return;
        list.innerHTML = '';
        const specs = Object.keys(recipeVault);
        if (specs.length === 0) { list.innerHTML = '<p class="text-muted text-sm">Database empty.</p>'; return; }

        specs.forEach(cocktail => {
            recipeVault[cocktail].sort((a, b) => {
                const order = { 'amber-glow': 1, 'neon-cyan': 2, 'juice-glow': 3, 'magenta-glow': 4 };
                return (order[a.color] || 5) - (order[b.color] || 5);
            });

            const vItem = document.createElement('div');
            vItem.className = 'vault-item';
            
            let ingHtml = `<div class="vault-details" id="details-${cocktail.replace(/\s+/g, '')}">`;
            ingHtml += `
                <div class="service-multiplier" onclick="event.stopPropagation()">
                    <span class="text-sm fw-bold text-muted">ROUND MULTIPLIER:</span>
                    <div class="stepper-control mini-stepper" style="width: auto;">
                        <button class="stepper-btn" onclick="updateRound('${cocktail.replace(/\s+/g, '')}', -1)">−</button>
                        <span class="stepper-value" id="mult-val-${cocktail.replace(/\s+/g, '')}">${window.lastUsedRound}</span>
                        <button class="stepper-btn" onclick="updateRound('${cocktail.replace(/\s+/g, '')}', 1)">+</button>
                    </div>
                </div>
                <div id="recipe-list-${cocktail.replace(/\s+/g, '')}">
            `;

            let totalBaseYield = 0;
            recipeVault[cocktail].forEach(ing => {
                totalBaseYield += ing.amount;
                const activeAmt = ing.amount * window.lastUsedRound;
                ingHtml += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount base-amt" data-base="${ing.amount}">${activeAmt.toFixed(1).replace(/\.0$/, '')}ml</span></div>`;
            });

            const activeTotal = totalBaseYield * window.lastUsedRound;
            ingHtml += `<div class="result-row mt-10" style="border-top:1px solid #333; padding-top:15px;"><span class="ing-name text-gold fw-bold">TOTAL YIELD</span><span class="ing-amount base-total text-main" data-base="${totalBaseYield}">${activeTotal.toFixed(1).replace(/\.0$/, '')}ml</span></div></div></div>`;

            vItem.innerHTML = `
                <div class="vault-header">
                    <span class="cocktail-title">${cocktail}</span>
                    <div class="admin-controls hidden">
                        <button class="action-btn edit" onclick="event.stopPropagation(); editSpec('${cocktail}')">EDIT</button>
                        <button class="action-btn delete" onclick="event.stopPropagation(); deleteSpec('${cocktail}')">DEL</button>
                    </div>
                </div>
                ${ingHtml}
            `;
            
            vItem.addEventListener('click', () => { triggerHaptic('light'); vItem.classList.toggle('expanded'); });
            list.appendChild(vItem);
        });
        
        const toggleBtn = document.getElementById('edit-toggle');
        if(toggleBtn && toggleBtn.innerText !== 'LOCKED') {
            document.querySelectorAll('.admin-controls').forEach(el => el.classList.remove('hidden'));
        }
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

    // --- EDIT & DELETE ---
    window.editSpec = (name) => {
        triggerHaptic('heavy');
        editingCocktailName = name;
        parsedStagingData = recipeVault[name].map(ing => ({ cocktailName: name, ingredientName: ing.name, amount: ing.amount, bottleSize: 0, categoryTag: ing.color }));
        document.getElementById('spec-title-input').value = name;
        document.getElementById('keep-paste-area').value = '';
        renderStagingArea();
        document.getElementById('scroll-area').scrollTop = 0;
    };

    window.deleteSpec = async (name) => {
        if (!confirm(`Delete '${name}'?`)) return;
        triggerHaptic('heavy');
        showLoader("DELETING...");
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: name }) });
            await loadVault();
        } catch (e) { hideLoader(); }
    };

    // --- SMART PARSER ---
    const parseBtn = document.getElementById('parse-btn');
    if (parseBtn) {
        parseBtn.addEventListener('click', () => {
            triggerHaptic('light');
            const title = capitalize(document.getElementById('spec-title-input').value.trim());
            const text = document.getElementById('keep-paste-area').value;
            if(!title || !text) return alert("Need Title and Recipe Text.");
            if (editingCocktailName && editingCocktailName !== title) editingCocktailName = null;

            parsedStagingData = [];
            const lines = text.split('\n');
            const regex = /^(\d+(?:\.\d+)?)\s*(?:ml|g|oz|dash|dashes)?\s+(.+)$/i;

            lines.forEach(line => {
                const match = line.trim().match(regex);
                if (match) {
                    const amt = parseFloat(match[1]);
                    const name = capitalize(match[2].trim());
                    
                    const lowName = name.toLowerCase();
                    let tag = 'amber-glow'; // default: spirit
                    const syrupKeys = ['syrup', 'sugar', 'agave', 'honey', 'gomme', 'orgeat', 'falernum', 'grenadine', 'cordial'];
                    const liqueurKeys = ['liqueur', 'amaro', 'campari', 'aperol', 'vermouth', 'cointreau', 'triple sec', 'chartreuse', 'bénédictine', 'benedictine', 'maraschino', 'amaretto', 'kahlua', 'baileys', 'crème de', 'creme de', 'sambuca', 'absinthe', 'pastis', 'sherry', 'port', 'madeira', 'lillet', 'suze', 'fernet', 'jägermeister', 'jagermeister', 'drambuie', 'galliano', 'frangelico', 'midori', 'curaçao', 'curacao', 'st-germain', 'st. germain', 'bitters', 'wine', 'champagne', 'prosecco', 'cava'];
                    const juiceKeys = ['juice', 'lemon', 'lime', 'orange', 'grapefruit', 'pineapple', 'cranberry', 'apple', 'tomato', 'water', 'soda', 'tonic', 'cola', 'ginger beer', 'coconut', 'milk', 'cream', 'egg'];
                    if (syrupKeys.some(k => lowName.includes(k))) tag = 'magenta-glow';
                    else if (liqueurKeys.some(k => lowName.includes(k))) tag = 'neon-cyan';
                    else if (juiceKeys.some(k => lowName.includes(k))) tag = 'juice-glow';
                    parsedStagingData.push({ cocktailName: title, ingredientName: name, amount: amt, bottleSize: 0, categoryTag: tag });
                }
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
            triggerHaptic('error');
            return alert("No ingredients found. Check format (e.g., '30ml Gin').");
        }

        parsedStagingData.forEach((ing, i) => {
            const row = document.createElement('div');
            row.className = 'staging-row';
            
            let catName = "SPIRIT";
            if(ing.categoryTag === 'neon-cyan') catName = "LIQUEUR";
            if(ing.categoryTag === 'magenta-glow') catName = "SYRUP";
            if(ing.categoryTag === 'juice-glow') catName = "JUICE";

            row.innerHTML = `
                <div class="staging-inputs">
                    <input type="number" class="stage-amt" value="${ing.amount}" onchange="updateStaging(${i}, 'amount', this.value)">
                    <input type="text" class="stage-name" value="${ing.ingredientName}" onchange="updateStaging(${i}, 'ingredientName', this.value)">
                </div>
                <button class="stage-cat ${ing.categoryTag}" onclick="cycleCategory(${i})">${catName}</button>
            `;
            list.appendChild(row);
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
                    await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: editingCocktailName }) });
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
            }
        });
    }
});
