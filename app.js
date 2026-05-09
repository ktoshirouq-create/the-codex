document.addEventListener('DOMContentLoaded', () => {
    
    // API CONFIG
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    let recipeVault = {};
    let parsedStagingData = []; 
    let editingCocktailName = null;

    // Global Memory States
    window.lastUsedRound = 1;
    let fDrinks = 20;
    let fDilution = 20;
    let activeSpecSelect = null; 
    let activeRevSpec = null;
    let activeRevIng = null;
    let activeRevIngAmt = 0;

    // HELPERS
    const capitalize = (str) => str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const triggerHaptic = (type = 'light') => {
        if (!navigator.vibrate) return;
        if (type === 'light') navigator.vibrate(30);
        if (type === 'heavy') navigator.vibrate([80, 40, 80]);
        if (type === 'error') navigator.vibrate([50, 50, 50, 50]);
    };
    
    const showLoader = (msg) => {
        document.querySelector('.loader-text').innerText = msg;
        const l = document.getElementById('loader');
        l.style.display = 'flex'; l.style.opacity = '1';
    };
    const hideLoader = () => {
        const l = document.getElementById('loader');
        l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 300);
    };

    // PULL TO REFRESH
    let touchStartY = 0;
    const scrollArea = document.getElementById('scroll-area');
    const ptrIndicator = document.getElementById('ptr-indicator');

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

    // CUSTOM MODAL LOGIC
    const modalWrapper = document.getElementById('selection-modal');
    const modalContent = document.getElementById('modal-content-area');
    const dragZone = document.getElementById('modal-drag-zone');
    const dragHandle = document.querySelector('.drag-handle');
    let dragStartY = 0; let dragCurrentY = 0; let isDragging = false;

    function openSelectModal(title, options, onSelect) {
        triggerHaptic('light');
        document.getElementById('selection-modal-title').innerText = title;
        const list = document.getElementById('selection-modal-list');
        list.innerHTML = '';
        
        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'modal-item';
            item.innerText = opt.label;
            item.addEventListener('click', () => {
                triggerHaptic('light');
                onSelect(opt.value, opt.label, opt.data);
                closeSelectionModal();
            });
            list.appendChild(item);
        });
        modalWrapper.classList.remove('hidden');
    }

    function closeSelectionModal() {
        triggerHaptic('light');
        modalContent.style.transform = `translateY(100%)`;
        setTimeout(() => {
            modalWrapper.classList.add('hidden');
            modalContent.style.transform = ''; 
            modalContent.style.transition = '';
        }, 300);
    }

    modalWrapper.addEventListener('click', (e) => { if (e.target.id === 'selection-modal') closeSelectionModal(); });
    document.getElementById('close-selection-modal').addEventListener('click', closeSelectionModal);

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
        if (dragCurrentY > 100) closeSelectionModal();
        else modalContent.style.transform = 'translateY(0)';
        dragCurrentY = 0;
    };

    dragZone.addEventListener('touchstart', startDrag, {passive: true});
    dragZone.addEventListener('touchmove', moveDrag, {passive: true});
    dragZone.addEventListener('touchend', endDrag);
    dragHandle.addEventListener('touchstart', startDrag, {passive: true});
    dragHandle.addEventListener('touchmove', moveDrag, {passive: true});
    dragHandle.addEventListener('touchend', endDrag);

    // INIT DB
    async function loadVault() {
        showLoader("SYNCING CODEX...");
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            recipeVault = {}; 
            data.forEach(row => {
                if(!recipeVault[row.cocktailName]) recipeVault[row.cocktailName] = [];
                recipeVault[row.cocktailName].push({ name: row.ingredientName, amount: row.amount, color: row.categoryTag });
            });
            renderVault();
            hideLoader();
        } catch (e) {
            console.error(e);
            document.querySelector('.loader-text').innerText = "SYNC FAILED.";
        }
    }
    loadVault();

    // RENDER VAULT
    function renderVault() {
        const list = document.getElementById('managed-vault-list');
        list.innerHTML = '';
        const specs = Object.keys(recipeVault);
        if (specs.length === 0) { list.innerHTML = '<p class="text-muted text-sm">Database empty.</p>'; return; }

        specs.forEach(cocktail => {
            recipeVault[cocktail].sort((a, b) => {
                const order = { 'amber-glow': 1, 'neon-cyan': 2, 'magenta-glow': 3 };
                return (order[a.color] || 4) - (order[b.color] || 4);
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
        
        if(document.getElementById('edit-toggle').innerText !== 'LOCKED') {
            document.querySelectorAll('.admin-controls').forEach(el => el.classList.remove('hidden'));
        }
    }

    // MULTIPLIER
    window.updateRound = (cocktailId, change) => {
        triggerHaptic('light');
        const valSpan = document.getElementById(`mult-val-${cocktailId}`);
        let next = (parseInt(valSpan.innerText) || 1) + change;
        if(next < 1) next = 1;
        valSpan.innerText = next;
        window.lastUsedRound = next; 

        const container = document.getElementById(`recipe-list-${cocktailId}`);
        container.querySelectorAll('.base-amt').forEach(el => {
            el.innerText = `${(parseFloat(el.getAttribute('data-base')) * next).toFixed(1).replace(/\.0$/, '')}ml`;
        });
        const totalEl = container.querySelector('.base-total');
        if(totalEl) totalEl.innerText = `${(parseFloat(totalEl.getAttribute('data-base')) * next).toFixed(1).replace(/\.0$/, '')}ml`;
    };

    // SEARCH & DB ADMIN
    document.getElementById('vault-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.vault-item').forEach(item => {
            item.style.display = item.querySelector('.cocktail-title').innerText.toLowerCase().includes(term) ? 'block' : 'none';
        });
    });

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
        triggerHaptic('heavy'); showLoader("DELETING...");
        try { await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: name }) }); await loadVault(); } 
        catch (e) { hideLoader(); }
    };

    // SMART PARSER
    document.getElementById('parse-btn').addEventListener('click', () => {
        triggerHaptic('light');
        const title = capitalize(document.getElementById('spec-title-input').value.trim());
        const text = document.getElementById('keep-paste-area').value;
        if(!title || !text) return alert("Need Title and Recipe Text.");

        parsedStagingData = [];
        text.split('\n').forEach(line => {
            const match = line.trim().match(/^(\d+(?:\.\d+)?)\s*(?:ml|g|oz|dash|dashes)?\s+(.+)$/i);
            if (match) {
                const name = capitalize(match[2].trim());
                let tag = 'amber-glow'; 
                const low = name.toLowerCase();
                if (low.includes('syrup') || low.includes('sugar') || low.includes('agave') || low.includes('honey')) tag = 'magenta-glow'; 
                else if (low.includes('liqueur') || low.includes('amaro') || low.includes('campari') || low.includes('vermouth')) tag = 'neon-cyan'; 
                parsedStagingData.push({ cocktailName: title, ingredientName: name, amount: parseFloat(match[1]), bottleSize: 0, categoryTag: tag });
            }
        });
        renderStagingArea();
    });

    function renderStagingArea() {
        const container = document.getElementById('staging-area');
        const list = document.getElementById('staging-list');
        list.innerHTML = '';
        if(parsedStagingData.length === 0) { container.classList.add('hidden'); triggerHaptic('error'); return alert("No ingredients found."); }

        parsedStagingData.forEach((ing, i) => {
            const row = document.createElement('div'); row.className = 'staging-row';
            let catName = "SPIRIT"; if(ing.categoryTag === 'neon-cyan') catName = "LIQUEUR"; if(ing.categoryTag === 'magenta-glow') catName = "SYRUP";
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

    window.updateStaging = (i, field, val) => { field === 'amount' ? parsedStagingData[i].amount = parseFloat(val) : parsedStagingData[i][field] = capitalize(val); };
    window.cycleCategory = (i) => {
        triggerHaptic('light');
        const tags = ['amber-glow', 'neon-cyan', 'magenta-glow'];
        parsedStagingData[i].categoryTag = tags[(tags.indexOf(parsedStagingData[i].categoryTag) + 1) % tags.length];
        renderStagingArea();
    };

    document.getElementById('sync-vault-btn').addEventListener('click', async () => {
        if(parsedStagingData.length === 0) return;
        triggerHaptic('heavy'); showLoader("PUSHING TO CODEX...");
        try {
            if (editingCocktailName) await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: editingCocktailName }) });
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(parsedStagingData) });
            document.getElementById('spec-title-input').value = ''; document.getElementById('keep-paste-area').value = '';
            document.getElementById('staging-area').classList.add('hidden');
            parsedStagingData = []; editingCocktailName = null;
            await loadVault();
        } catch (e) { hideLoader(); }
    });


    // --- THE LAB: ABV CALCULATOR ---
    let activeAbvSpec = null;
    let abvDilution = 20;

    const updateAbvDilUI = () => document.getElementById('abv-dil-val').innerText = abvDilution + '%';
    document.getElementById('abv-dil-minus').addEventListener('click', () => { triggerHaptic('light'); if(abvDilution > 0) { abvDilution--; updateAbvDilUI(); } });
    document.getElementById('abv-dil-plus').addEventListener('click', () => { triggerHaptic('light'); abvDilution++; updateAbvDilUI(); });

    document.getElementById('btn-abv-spec').addEventListener('click', () => {
        const specs = Object.keys(recipeVault).map(s => ({label: s, value: s}));
        openSelectModal('SELECT SPEC FOR ABV', specs, (val, label) => {
            activeAbvSpec = val;
            document.getElementById('btn-abv-spec').innerText = label;
            document.getElementById('btn-abv-spec').style.color = "var(--text-main)";
            document.getElementById('btn-abv-spec').classList.remove('text-muted');
            
            const list = document.getElementById('abv-ing-list');
            list.innerHTML = '';
            recipeVault[val].forEach((ing, i) => {
                let defAbv = 0; // Syrup default
                if(ing.color === 'amber-glow') defAbv = 40; // Spirit default
                if(ing.color === 'neon-cyan') defAbv = 20;  // Liqueur default
                
                list.innerHTML += `
                    <div class="abv-input-row">
                        <span class="abv-ing-name ${ing.color}">${ing.name} <span class="text-muted">(${ing.amount}ml)</span></span>
                        <div><input type="number" class="abv-number-input abv-param" data-vol="${ing.amount}" value="${defAbv}"> %</div>
                    </div>`;
            });
            document.getElementById('abv-ing-container').classList.remove('hidden');
            document.getElementById('abv-results').innerHTML = '';
        });
    });

    document.getElementById('calc-abv-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const inputs = document.querySelectorAll('.abv-param');
        let totalAlcoholVol = 0;
        let baseTotalVol = 0;

        inputs.forEach(input => {
            const vol = parseFloat(input.getAttribute('data-vol'));
            const abv = parseFloat(input.value) || 0;
            baseTotalVol += vol;
            totalAlcoholVol += (vol * (abv / 100));
        });

        const finalVol = baseTotalVol * (1 + (abvDilution / 100));
        const finalAbv = (totalAlcoholVol / finalVol) * 100;

        document.getElementById('abv-results').innerHTML = `
            <div class="result-row mt-10"><span class="ing-name text-gold fw-bold">FINAL BATCH ABV</span><span class="ing-amount">${finalAbv.toFixed(1)}%</span></div>
            <div class="result-row"><span class="ing-name text-muted text-sm">After ${abvDilution}% Dilution</span></div>
        `;
    });


    // --- THE LAB: FAT & PROTEIN WASHING ---
    let washType = 'milk';
    let fatIntensity = 'standard';
    
    document.querySelectorAll('.wash-pill').forEach(p => p.addEventListener('click', (e) => {
        triggerHaptic('light');
        document.querySelectorAll('.wash-pill').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        washType = e.target.getAttribute('data-val');
        
        if(washType === 'milk') {
            document.getElementById('ui-milk-wash').classList.remove('hidden');
            document.getElementById('ui-fat-wash').classList.add('hidden');
        } else {
            document.getElementById('ui-milk-wash').classList.add('hidden');
            document.getElementById('ui-fat-wash').classList.remove('hidden');
        }
        document.getElementById('wash-results').innerHTML = '';
    }));

    document.getElementById('btn-fat-type').addEventListener('click', () => {
        const opts = [
            { label: 'Standard (Butter / Coconut Oil)', value: 'standard' },
            { label: 'Heavy (Bacon / Sesame / Blue Cheese)', value: 'heavy' }
        ];
        openSelectModal('SELECT FAT INTENSITY', opts, (val, label) => {
            fatIntensity = val;
            document.getElementById('btn-fat-type').innerText = label;
        });
    });

    document.getElementById('calc-wash-btn').addEventListener('click', () => {
        triggerHaptic('heavy');
        const res = document.getElementById('wash-results');
        
        if (washType === 'milk') {
            const punchVol = parseFloat(document.getElementById('milk-punch-vol').value) || 0;
            const milkVol = punchVol / 4;
            res.innerHTML = `
                <h3 class="zone-header">CLARIFICATION (4:1 RATIO)</h3>
                <div class="result-row amber-glow"><span class="ing-name">Whole Milk Required</span><span class="ing-amount">${milkVol.toFixed(0)}ml</span></div>
                <div class="result-row"><span class="ing-name text-muted text-sm">RULE: Pour Punch INTO the Milk. Ensure punch pH is below 4.6.</span></div>
            `;
        } else {
            const spiritVol = parseFloat(document.getElementById('fat-spirit-vol').value) || 0;
            const ratio = fatIntensity === 'standard' ? (240/700) : (120/700);
            const fatGrams = spiritVol * ratio;
            res.innerHTML = `
                <h3 class="zone-header">FAT EXTRACTION</h3>
                <div class="result-row neon-cyan"><span class="ing-name">Warm Liquid Fat</span><span class="ing-amount">${fatGrams.toFixed(0)}g</span></div>
                <div class="result-row"><span class="ing-name text-muted text-sm">Infuse at room temp. Freeze overnight. Skim solid fat.</span></div>
            `;
        }
    });

    // --- LAB: ACID ADJUSTER & MODIFIERS (Existing logic retained) ---
    let activeAcidBase = { val: 'orange' }; let activeAcidTarget = 'lemon';
    document.getElementById('btn-acid-base').addEventListener('click', () => { openSelectModal('BASE LIQUID', [{label:'Orange (~1%)',value:'orange'},{label:'Grapefruit (~2%)',value:'grapefruit'},{label:'Pineapple (~0.8%)',value:'pineapple'}], (v,l) => { activeAcidBase.val = v; document.getElementById('btn-acid-base').innerText = l; }); });
    document.getElementById('btn-acid-target').addEventListener('click', () => { openSelectModal('TARGET ACIDITY', [{label:'Lemon (6% Citric)',value:'lemon'},{label:'Lime (4% Cit, 2% Mal)',value:'lime'}], (v,l) => { activeAcidTarget = v; document.getElementById('btn-acid-target').innerText = l; }); });
    
    document.getElementById('calc-acid-btn').addEventListener('click', () => {
        triggerHaptic('heavy'); const vol = parseFloat(document.getElementById('acid-vol').value) || 0; const res = document.getElementById('acid-results'); if(!vol) return;
        let cit = 0, mal = 0;
        if (activeAcidTarget === 'lemon') { if(activeAcidBase.val==='orange') cit=vol*0.05; if(activeAcidBase.val==='grapefruit') cit=vol*0.04; if(activeAcidBase.val==='pineapple') cit=vol*0.052; } 
        else { if(activeAcidBase.val==='orange') { cit=vol*0.03; mal=vol*0.02; } if(activeAcidBase.val==='grapefruit') { cit=vol*0.02; mal=vol*0.02; } if(activeAcidBase.val==='pineapple') { cit=vol*0.032; mal=vol*0.02; } }
        res.innerHTML = `<div class="result-row amber-glow"><span class="ing-name">Citric Powder</span><span class="ing-amount">${cit.toFixed(1)}g</span></div>${mal>0?`<div class="result-row magenta-glow"><span class="ing-name">Malic Powder</span><span class="ing-amount">${mal.toFixed(1)}g</span></div>`:''}`;
    });

    let modType = 'cordial';
    document.querySelectorAll('.mod-pill').forEach(p => p.addEventListener('click', (e) => { triggerHaptic('light'); document.querySelectorAll('.mod-pill').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); modType = e.target.getAttribute('data-val'); document.getElementById('vinegar-matrix').classList.toggle('hidden', modType !== 'shrub'); }));
    document.getElementById('calc-mod-btn').addEventListener('click', () => {
        triggerHaptic('heavy'); const w = parseFloat(document.getElementById('mod-weight').value) || 0; const res = document.getElementById('mod-results'); if(!w) return;
        if (modType === 'cordial') res.innerHTML = `<h3 class="zone-header">CORDIAL POWDERS</h3><div class="result-row amber-glow"><span class="ing-name">Citric Acid</span><span class="ing-amount">${(w*0.015*0.75).toFixed(1)}g</span></div><div class="result-row magenta-glow"><span class="ing-name">Malic Acid</span><span class="ing-amount">${(w*0.015*0.25).toFixed(1)}g</span></div>`;
        else res.innerHTML = `<h3 class="zone-header">SHRUB LIQUID</h3><div class="result-row neon-cyan"><span class="ing-name">Vinegar</span><span class="ing-amount">${(w*0.5).toFixed(0)}g</span></div>`;
    });

    // --- SCALE: BATCHING ---
    const updateScaleUI = () => { document.getElementById('fd-val').innerText = fDrinks; document.getElementById('dil-val').innerText = fDilution + '%'; };
    document.getElementById('fd-minus').addEventListener('click', () => { triggerHaptic('light'); if(fDrinks > 1) { fDrinks--; updateScaleUI(); } });
    document.getElementById('fd-plus').addEventListener('click', () => { triggerHaptic('light'); fDrinks++; updateScaleUI(); });
    document.getElementById('dil-minus').addEventListener('click', () => { triggerHaptic('light'); if(fDilution > 0) { fDilution--; updateScaleUI(); } });
    document.getElementById('dil-plus').addEventListener('click', () => { triggerHaptic('light'); fDilution++; updateScaleUI(); });
    window.updateDilution = (val) => { triggerHaptic('light'); fDilution = val; updateScaleUI(); };

    document.getElementById('btn-forward-spec').addEventListener('click', () => { openSelectModal('SELECT SPEC', Object.keys(recipeVault).map(s => ({label: s, value: s})), (v, l) => { activeSpecSelect = v; document.getElementById('btn-forward-spec').innerText = l; document.getElementById('btn-forward-spec').classList.remove('text-muted'); }); });
    document.getElementById('calc-forward-btn').addEventListener('click', () => {
        triggerHaptic('heavy'); const res = document.getElementById('forward-results'); if(!activeSpecSelect || fDrinks <= 0) return;
        let html = '<h3 class="zone-header">BATCH YIELD</h3>'; let tVol = 0;
        recipeVault[activeSpecSelect].forEach(ing => { const amt = ing.amount * fDrinks; tVol += amt; html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${amt.toFixed(0)}ml</span></div>`; });
        if (fDilution > 0) { const w = tVol * (fDilution / 100); tVol += w; html += `<div class="result-row"><span class="ing-name text-muted">Filtered Water (${fDilution}%)</span><span class="ing-amount text-muted">${w.toFixed(0)}ml</span></div>`; }
        res.innerHTML = html + `<div class="result-row mt-10"><span class="ing-name text-gold fw-bold">TOTAL BATCH VOLUME</span><span class="ing-amount">${tVol.toFixed(0)}ml</span></div>`;
    });

    document.getElementById('btn-reverse-spec').addEventListener('click', () => {
        openSelectModal('SELECT SPEC', Object.keys(recipeVault).map(s => ({label: s, value: s})), (v, l) => {
            activeRevSpec = v; document.getElementById('btn-reverse-spec').innerText = l; document.getElementById('btn-reverse-spec').classList.remove('text-muted');
            activeRevIng = null; document.getElementById('btn-reverse-ing').innerText = "Select Limiting Ingredient..."; document.getElementById('btn-reverse-ing').classList.remove('hidden'); document.getElementById('reverse-vol-container').classList.add('hidden');
        });
    });
    document.getElementById('btn-reverse-ing').addEventListener('click', () => {
        if(!activeRevSpec) return;
        openSelectModal('LIMITING INGREDIENT', recipeVault[activeRevSpec].map(ing => ({label: `${ing.name} (${ing.amount}ml)`, value: ing.name, data: ing.amount})), (v, l, a) => {
            activeRevIng = v; activeRevIngAmt = a; document.getElementById('btn-reverse-ing').innerText = l; document.getElementById('btn-reverse-ing').classList.remove('text-muted'); document.getElementById('reverse-vol-container').classList.remove('hidden');
        });
    });
    document.getElementById('calc-reverse-btn').addEventListener('click', () => {
        triggerHaptic('heavy'); const avail = parseFloat(document.getElementById('reverse-vol').value) || 0; const res = document.getElementById('reverse-results'); if(!activeRevSpec || !activeRevIng || avail <= 0) return;
        const max = Math.floor(avail / activeRevIngAmt);
        let html = `<h3 class="zone-header">MAX YIELD: ${max} DRINKS</h3>`;
        recipeVault[activeRevSpec].forEach(ing => { html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${(ing.amount * max).toFixed(0)}ml ${ing.name === activeRevIng ? '<span class="text-muted text-sm">(Empty)</span>' : ''}</span></div>`; });
        res.innerHTML = html;
    });

    // NAV & LOCK
    const tabs = document.querySelectorAll('.nav-tab'); const modules = document.querySelectorAll('.module');
    tabs.forEach(tab => { tab.addEventListener('click', (e) => { triggerHaptic('light'); tabs.forEach(t => t.classList.remove('active')); modules.forEach(m => m.classList.remove('active')); e.currentTarget.classList.add('active'); document.getElementById(e.currentTarget.getAttribute('data-target')).classList.add('active'); document.getElementById('scroll-area').scrollTop = 0; }); });

    const lockBtn = document.getElementById('edit-toggle');
    lockBtn.addEventListener('click', () => {
        triggerHaptic('light');
        const isLocked = lockBtn.innerText === 'LOCKED';
        lockBtn.innerText = isLocked ? 'EDIT MODE' : 'LOCKED';
        lockBtn.style.color = isLocked ? 'var(--nodee-gold)' : 'var(--text-muted)';
        lockBtn.style.borderColor = isLocked ? 'var(--nodee-gold)' : 'var(--text-muted)';
        document.getElementById('admin-parser-ui').classList.toggle('hidden', !isLocked);
        document.querySelectorAll('.admin-controls').forEach(el => el.classList.toggle('hidden', !isLocked));
        if(!isLocked) { editingCocktailName = null; document.getElementById('spec-title-input').value = ''; document.getElementById('keep-paste-area').value = ''; document.getElementById('staging-area').classList.add('hidden'); parsedStagingData = []; }
    });
});
