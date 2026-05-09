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
    let activeIngSelect = null;

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

    // PULL TO REFRESH (Hard Reload)
    let touchStartY = 0;
    const scrollArea = document.getElementById('scroll-area');
    const ptrIndicator = document.getElementById('ptr-indicator');

    scrollArea.addEventListener('touchstart', e => {
        if (scrollArea.scrollTop === 0) touchStartY = e.touches[0].clientY;
    }, {passive: true});
    
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
                setTimeout(() => window.location.reload(true), 150); // Hard reload
            } else {
                ptrIndicator.style.transform = `translateY(-20px)`;
                ptrIndicator.style.opacity = 0;
            }
        }
        touchStartY = 0;
    }, {passive: true});

    // CUSTOM MODAL LOGIC (Drag & Ghost Click)
    const modalWrapper = document.getElementById('selection-modal');
    const modalContent = document.getElementById('modal-content-area');
    const dragZone = document.getElementById('modal-drag-zone');
    const dragHandle = document.querySelector('.drag-handle');
    
    let dragStartY = 0;
    let dragCurrentY = 0;
    let isDragging = false;

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
            modalContent.style.transform = ''; // reset for next open
            modalContent.style.transition = '';
        }, 300);
    }

    // Modal Ghost Click
    modalWrapper.addEventListener('click', (e) => {
        if (e.target.id === 'selection-modal') closeSelectionModal();
    });
    
    // Modal 'X' Button
    document.getElementById('close-selection-modal').addEventListener('click', closeSelectionModal);

    // Modal Physics Drag
    const startDrag = (e) => {
        dragStartY = e.touches[0].clientY;
        isDragging = true;
        modalContent.style.transition = 'none'; // Disable CSS transition for 1:1 drag
    };
    const moveDrag = (e) => {
        if(!isDragging) return;
        const deltaY = e.touches[0].clientY - dragStartY;
        if (deltaY > 0) { // Only allow dragging down
            dragCurrentY = deltaY;
            modalContent.style.transform = `translateY(${dragCurrentY}px)`;
        }
    };
    const endDrag = () => {
        if(!isDragging) return;
        isDragging = false;
        modalContent.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        
        if (dragCurrentY > 100) { // Snap away
            closeSelectionModal();
        } else { // Snap back
            modalContent.style.transform = 'translateY(0)';
        }
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
                recipeVault[row.cocktailName].push({
                    name: row.ingredientName,
                    amount: row.amount,
                    color: row.categoryTag
                });
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
        if (specs.length === 0) {
            list.innerHTML = '<p class="text-muted text-sm">Database empty.</p>';
            return;
        }

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

            // The Total Yield Engine
            const activeTotal = totalBaseYield * window.lastUsedRound;
            ingHtml += `<div class="result-row mt-10" style="border-top:1px solid #333; padding-top:15px;"><span class="ing-name text-gold fw-bold">TOTAL YIELD</span><span class="ing-amount base-total text-main" data-base="${totalBaseYield}">${activeTotal.toFixed(1).replace(/\.0$/, '')}ml</span></div>`;

            ingHtml += '</div></div>';

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
            
            vItem.addEventListener('click', () => {
                triggerHaptic('light');
                vItem.classList.toggle('expanded');
            });
            list.appendChild(vItem);
        });
        
        if(document.getElementById('edit-toggle').innerText !== 'LOCKED') {
            document.querySelectorAll('.admin-controls').forEach(el => el.classList.remove('hidden'));
        }
    }

    // LIVE MULTIPLIER (Service Round Stepper Engine)
    window.updateRound = (cocktailId, change) => {
        triggerHaptic('light');
        const valSpan = document.getElementById(`mult-val-${cocktailId}`);
        let current = parseInt(valSpan.innerText) || 1;
        let next = current + change;
        if(next < 1) next = 1;
        
        valSpan.innerText = next;
        window.lastUsedRound = next; 

        const container = document.getElementById(`recipe-list-${cocktailId}`);
        const amounts = container.querySelectorAll('.base-amt');
        amounts.forEach(el => {
            const base = parseFloat(el.getAttribute('data-base'));
            el.innerText = `${(base * next).toFixed(1).replace(/\.0$/, '')}ml`;
        });

        // Update Total Yield Display
        const totalEl = container.querySelector('.base-total');
        if(totalEl) {
            const baseTotal = parseFloat(totalEl.getAttribute('data-base'));
            totalEl.innerText = `${(baseTotal * next).toFixed(1).replace(/\.0$/, '')}ml`;
        }
    };

    // SEARCH
    document.getElementById('vault-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.vault-item').forEach(item => {
            const title = item.querySelector('.cocktail-title').innerText.toLowerCase();
            item.style.display = title.includes(term) ? 'block' : 'none';
        });
    });

    // DB EDIT
    window.editSpec = (name) => {
        triggerHaptic('heavy');
        editingCocktailName = name;
        const spec = recipeVault[name];
        
        parsedStagingData = spec.map(ing => ({
            cocktailName: name,
            ingredientName: ing.name,
            amount: ing.amount,
            bottleSize: 0,
            categoryTag: ing.color
        }));

        document.getElementById('spec-title-input').value = name;
        document.getElementById('keep-paste-area').value = '';
        renderStagingArea();
        document.getElementById('scroll-area').scrollTop = 0;
    };

    // DB DELETE
    window.deleteSpec = async (name) => {
        if (!confirm(`Delete '${name}'?`)) return;
        triggerHaptic('heavy');
        showLoader("DELETING...");
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: name }) });
            await loadVault();
        } catch (e) { hideLoader(); }
    };

    // --- SMART PARSER LOGIC ---
    document.getElementById('parse-btn').addEventListener('click', () => {
        triggerHaptic('light');
        const title = capitalize(document.getElementById('spec-title-input').value.trim());
        const text = document.getElementById('keep-paste-area').value;
        if(!title || !text) return alert("Need Title and Recipe Text.");

        parsedStagingData = [];
        const lines = text.split('\n');
        const regex = /^(\d+(?:\.\d+)?)\s*(?:ml|g|oz|dash|dashes)?\s+(.+)$/i;

        lines.forEach(line => {
            const match = line.trim().match(regex);
            if (match) {
                const amt = parseFloat(match[1]);
                const name = capitalize(match[2].trim());
                
                let tag = 'amber-glow'; 
                const lowName = name.toLowerCase();
                if (lowName.includes('syrup') || lowName.includes('sugar') || lowName.includes('agave') || lowName.includes('honey')) {
                    tag = 'magenta-glow'; 
                } else if (lowName.includes('liqueur') || lowName.includes('amaro') || lowName.includes('campari') || lowName.includes('vermouth')) {
                    tag = 'neon-cyan'; 
                }

                parsedStagingData.push({ cocktailName: title, ingredientName: name, amount: amt, bottleSize: 0, categoryTag: tag });
            }
        });

        renderStagingArea();
    });

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
        const tags = ['amber-glow', 'neon-cyan', 'magenta-glow'];
        let curr = tags.indexOf(parsedStagingData[index].categoryTag);
        let next = (curr + 1) % tags.length;
        parsedStagingData[index].categoryTag = tags[next];
        renderStagingArea();
    };

    document.getElementById('sync-vault-btn').addEventListener('click', async () => {
        if(parsedStagingData.length === 0) return;
        triggerHaptic('heavy');
        showLoader("PUSHING TO CODEX...");
        try {
            // If editing, delete old version first
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

    // --- LAB: CUSTOM DROPDOWNS ---
    let activeAcidBase = { val: 'orange', multCitric: 0.05, multMalic: 0 };
    let activeAcidTarget = 'lemon';

    document.getElementById('btn-acid-base').addEventListener('click', () => {
        const opts = [
            { label: 'Orange Juice (~1%)', value: 'orange' },
            { label: 'Grapefruit (~2%)', value: 'grapefruit' },
            { label: 'Pineapple (~0.8%)', value: 'pineapple' }
        ];
        openSelectModal('SELECT BASE LIQUID', opts, (val, label) => {
            activeAcidBase.val = val;
            document.getElementById('btn-acid-base').innerText = label;
            document.getElementById('btn-acid-base').style.color = "var(--text-main)";
        });
    });

    document.getElementById('btn-acid-target').addEventListener('click', () => {
        const opts = [
            { label: 'Lemon (6% Citric)', value: 'lemon' },
            { label: 'Lime (4% Cit, 2% Mal)', value: 'lime' }
        ];
        openSelectModal('SELECT TARGET ACIDITY', opts, (val, label) => {
            activeAcidTarget = val;
            document.getElementById('btn-acid-target').innerText = label;
            document.getElementById('btn-acid-target').style.color = "var(--text-main)";
        });
    });

    // --- LAB: ACID ADJUSTER MATH ---
    document.getElementById('calc-acid-btn').addEventListener('click', () => {
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

    // --- LAB: MODIFIER ENGINE ---
    const modPills = document.querySelectorAll('.mod-pill');
    let modType = 'cordial';
    modPills.forEach(p => p.addEventListener('click', (e) => {
        triggerHaptic('light');
        modPills.forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        modType = e.target.getAttribute('data-val');
        
        if(modType === 'shrub') document.getElementById('vinegar-matrix').classList.remove('hidden');
        else document.getElementById('vinegar-matrix').classList.add('hidden');
    }));

    document.getElementById('calc-mod-btn').addEventListener('click', () => {
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
                <div class="result-row neon-cyan"><span class="ing-name">Vinegar (See Matrix)</span><span class="ing-amount">${vin.toFixed(0)}g</span></div>
            `;
        }
    });

    // --- SCALE: BATCHING & STEPPERS ---
    const updateScaleUI = () => {
        document.getElementById('fd-val').innerText = fDrinks;
        document.getElementById('dil-val').innerText = fDilution + '%';
    };

    document.getElementById('fd-minus').addEventListener('click', () => { triggerHaptic('light'); if(fDrinks > 1) { fDrinks--; updateScaleUI(); } });
    document.getElementById('fd-plus').addEventListener('click', () => { triggerHaptic('light'); fDrinks++; updateScaleUI(); });
    
    document.getElementById('dil-minus').addEventListener('click', () => { triggerHaptic('light'); if(fDilution > 0) { fDilution--; updateScaleUI(); } });
    document.getElementById('dil-plus').addEventListener('click', () => { triggerHaptic('light'); fDilution++; updateScaleUI(); });

    window.updateDilution = (val) => {
        triggerHaptic('light');
        fDilution = val;
        updateScaleUI();
    };

    // Forward Batch Logic
    document.getElementById('btn-forward-spec').addEventListener('click', () => {
        const specs = Object.keys(recipeVault).map(s => ({label: s, value: s}));
        openSelectModal('SELECT SPEC FOR BATCH', specs, (val, label) => {
            activeSpecSelect = val;
            document.getElementById('btn-forward-spec').innerText = label;
            document.getElementById('btn-forward-spec').style.color = "var(--text-main)";
            document.getElementById('btn-forward-spec').classList.remove('text-muted');
        });
    });

    document.getElementById('calc-forward-btn').addEventListener('click', () => {
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

    // Reverse Batch Logic
    let activeRevSpec = null;
    let activeRevIng = null;
    let activeRevIngAmt = 0;

    document.getElementById('btn-reverse-spec').addEventListener('click', () => {
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

    document.getElementById('btn-reverse-ing').addEventListener('click', () => {
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

    document.getElementById('calc-reverse-btn').addEventListener('click', () => {
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
            document.getElementById(targetEl.getAttribute('data-target')).classList.add('active');
            document.getElementById('scroll-area').scrollTop = 0;
        });
    });

    const lockBtn = document.getElementById('edit-toggle');
    lockBtn.addEventListener('click', () => {
        triggerHaptic('light');
        if (lockBtn.innerText === 'LOCKED') {
            lockBtn.innerText = 'EDIT MODE';
            lockBtn.style.color = 'var(--nodee-gold)';
            lockBtn.style.borderColor = 'var(--nodee-gold)';
            document.getElementById('admin-parser-ui').classList.remove('hidden');
            document.querySelectorAll('.admin-controls').forEach(el => el.classList.remove('hidden'));
        } else {
            lockBtn.innerText = 'LOCKED';
            lockBtn.style.color = 'var(--text-muted)';
            lockBtn.style.borderColor = 'var(--text-muted)';
            document.getElementById('admin-parser-ui').classList.add('hidden');
            document.querySelectorAll('.admin-controls').forEach(el => el.classList.add('hidden'));
            
            // Clear Edit State if cancelling
            editingCocktailName = null;
            document.getElementById('spec-title-input').value = '';
            document.getElementById('keep-paste-area').value = '';
            document.getElementById('staging-area').classList.add('hidden');
            parsedStagingData = [];
        }
    });
});
