document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    let recipeVault = {};
    let parsedStagingData = []; 
    let editingCocktailName = null;

    window.lastUsedRound = 1;
    let fDrinks = 20; let fDilution = 20;
    let abvDilution = 20;

    const triggerHaptic = (t = 'light') => {
        if (!navigator.vibrate) return;
        t === 'heavy' ? navigator.vibrate([80, 40, 80]) : navigator.vibrate(30);
    };

    const showLoader = (m) => {
        document.querySelector('.loader-text').innerText = m;
        document.getElementById('loader').style.display = 'flex';
        document.getElementById('loader').style.opacity = '1';
    };

    const hideLoader = () => {
        const l = document.getElementById('loader');
        l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 300);
    };

    // BOUNCER QUICK CHECK
    const updateBouncer = () => {
        const today = new Date();
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        
        const date18 = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        const date20 = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate());
        
        document.getElementById('date-18').innerText = date18.toLocaleDateString('en-US', options).toUpperCase();
        document.getElementById('date-20').innerText = date20.toLocaleDateString('en-US', options).toUpperCase();
    };
    updateBouncer();

    // MODAL
    const modal = document.getElementById('selection-modal');
    const modalContent = document.getElementById('modal-content-area');
    
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
        modalContent.style.transform = 'translateY(100%)';
        setTimeout(() => { modal.classList.add('hidden'); modalContent.style.transform = ''; }, 300);
    }
    modal.onclick = (e) => { if(e.target === modal) closeSelectModal(); };

    // DB
    async function loadVault() {
        showLoader("SYNCING CODEX...");
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            recipeVault = {};
            data.forEach(r => {
                if(!recipeVault[r.cocktailName]) recipeVault[r.cocktailName] = [];
                recipeVault[r.cocktailName].push({ name: r.ingredientName, amount: r.amount, color: r.categoryTag });
            });
            renderVault();
            hideLoader();
        } catch (e) { console.error(e); hideLoader(); }
    }
    loadVault();

    function renderVault() {
        const list = document.getElementById('managed-vault-list');
        list.innerHTML = '';
        Object.keys(recipeVault).forEach(cocktail => {
            const item = document.createElement('div');
            item.className = 'vault-item';
            let ingHtml = `<div class="vault-details">
                <div class="stepper-control" style="margin-bottom:15px;" onclick="event.stopPropagation()">
                    <button class="stepper-btn" onclick="updateRound('${cocktail}', -1)">-</button>
                    <span class="stepper-value" id="mult-${cocktail}">${window.lastUsedRound}</span>
                    <button class="stepper-btn" onclick="updateRound('${cocktail}', 1)">+</button>
                </div>
                <div id="ings-${cocktail}">`;
            
            recipeVault[cocktail].forEach(ing => {
                ingHtml += `<div class="result-row ${ing.color}">
                    <span class="ing-name">${ing.name}</span>
                    <span class="ing-amount" data-base="${ing.amount}">${ing.amount * window.lastUsedRound}ml</span>
                </div>`;
            });
            ingHtml += `</div></div>`;

            item.innerHTML = `<div class="vault-header">
                <span class="cocktail-title">${cocktail}</span>
                <div class="admin-controls hidden">
                    <button class="action-btn text-gold" style="font-size:0.7rem; font-weight:900; margin-right:10px;" onclick="event.stopPropagation(); editSpec('${cocktail}')">EDIT</button>
                    <button class="action-btn" style="color:red; font-size:0.7rem; font-weight:900;" onclick="event.stopPropagation(); deleteSpec('${cocktail}')">DEL</button>
                </div>
            </div>${ingHtml}`;
            item.onclick = () => { triggerHaptic(); item.classList.toggle('expanded'); };
            list.appendChild(item);
        });
    }

    window.updateRound = (c, delta) => {
        triggerHaptic();
        let val = (parseInt(document.getElementById(`mult-${c}`).innerText) || 1) + delta;
        if(val < 1) val = 1;
        document.getElementById(`mult-${c}`).innerText = val;
        window.lastUsedRound = val;
        document.querySelectorAll(`#ings-${c} .ing-amount`).forEach(el => {
            el.innerText = (parseFloat(el.dataset.base) * val).toFixed(0) + 'ml';
        });
    };

    // SEARCH
    document.getElementById('vault-search').oninput = (e) => {
        const t = e.target.value.toLowerCase();
        document.querySelectorAll('.vault-item').forEach(v => {
            v.style.display = v.querySelector('.cocktail-title').innerText.toLowerCase().includes(t) ? 'block' : 'none';
        });
    };

    // PARSER
    document.getElementById('parse-btn').onclick = () => {
        const title = document.getElementById('spec-title-input').value.trim();
        const text = document.getElementById('keep-paste-area').value;
        if(!title || !text) return;
        parsedStagingData = [];
        text.split('\n').forEach(line => {
            const match = line.match(/^(\d+)\s*ml\s+(.+)$/i);
            if(match) {
                let tag = 'amber-glow';
                if(/syrup|sugar|honey/i.test(match[2])) tag = 'magenta-glow';
                if(/liqueur|amaro|vermouth/i.test(match[2])) tag = 'neon-cyan';
                parsedStagingData.push({ cocktailName: title, ingredientName: match[2].trim(), amount: parseInt(match[1]), categoryTag: tag });
            }
        });
        renderStaging();
    };

    function renderStaging() {
        const area = document.getElementById('staging-area');
        const list = document.getElementById('staging-list');
        list.innerHTML = '';
        parsedStagingData.forEach((ing, i) => {
            const row = document.createElement('div');
            row.className = 'law-row';
            row.innerHTML = `<span class="law-tag ${ing.categoryTag}">${ing.amount}</span><span>${ing.ingredientName}</span>`;
            list.appendChild(row);
        });
        area.classList.remove('hidden');
    }

    document.getElementById('sync-vault-btn').onclick = async () => {
        showLoader("PUSHING...");
        if(editingCocktailName) await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: editingCocktailName }) });
        await fetch(API_URL, { method: 'POST', body: JSON.stringify(parsedStagingData) });
        editingCocktailName = null; loadVault();
    };

    window.editSpec = (n) => {
        editingCocktailName = n;
        document.getElementById('spec-title-input').value = n;
        parsedStagingData = recipeVault[n].map(i => ({ cocktailName: n, ingredientName: i.name, amount: i.amount, categoryTag: i.color }));
        renderStaging();
        document.getElementById('scroll-area').scrollTop = 0;
    };

    // --- THE LAB: ABV CALCULATOR WITH STEPPERS ---
    let activeAbvSpec = null;
    const updateAbvDilUI = () => document.getElementById('abv-dil-val').innerText = abvDilution + '%';
    
    document.getElementById('abv-dil-minus').onclick = () => { triggerHaptic('light'); if(abvDilution > 0) { abvDilution--; updateAbvDilUI(); } };
    document.getElementById('abv-dil-plus').onclick = () => { triggerHaptic('light'); abvDilution++; updateAbvDilUI(); };

    window.changeAbv = (index, delta) => {
        triggerHaptic('light');
        const el = document.getElementById(`abv-val-${index}`);
        let current = parseFloat(el.getAttribute('data-abv')) || 0;
        let next = current + delta;
        if (next < 0) next = 0;
        if (next > 100) next = 100;
        el.setAttribute('data-abv', next);
        el.innerText = next + '%';
    };

    document.getElementById('btn-abv-spec').onclick = () => {
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

    document.getElementById('calc-abv-btn').onclick = () => {
        triggerHaptic('heavy');
        let totalAlc = 0, totalVol = 0;
        document.querySelectorAll('.abv-param').forEach(el => {
            const v = parseFloat(el.getAttribute('data-vol')); 
            const abv = parseFloat(el.getAttribute('data-abv')) || 0;
            totalVol += v; 
            totalAlc += (v * (abv / 100));
        });
        const finalAbv = (totalAlc / (totalVol * (1 + (abvDilution / 100)))) * 100;
        document.getElementById('abv-results').innerHTML = `<div class="result-row mt-10"><span class="ing-name text-gold fw-bold">FINAL BATCH ABV</span><span class="ing-amount">${finalAbv.toFixed(1)}%</span></div><div class="result-row"><span class="ing-name text-muted text-sm">After ${abvDilution}% Dilution</span></div>`;
    };

    // LAB MATH
    document.getElementById('calc-wash-btn').onclick = () => {
        triggerHaptic('heavy');
        const res = document.getElementById('wash-results');
        const activeType = document.querySelector('.wash-pill.active').dataset.val;
        if(activeType === 'milk') {
            const vol = parseInt(document.getElementById('milk-punch-vol').value) || 0;
            res.innerHTML = `<div class="result-row amber-glow"><span class="ing-name">Whole Milk (4:1)</span><span class="ing-amount">${(vol/4).toFixed(0)}ml</span></div>`;
        } else {
            const vol = parseInt(document.getElementById('fat-spirit-vol').value) || 0;
            res.innerHTML = `<div class="result-row neon-cyan"><span class="ing-name">Liquid Fat (Butter)</span><span class="ing-amount">${(vol * (240/700)).toFixed(0)}g</span></div>`;
        }
    };

    // NAV
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.onclick = () => {
            triggerHaptic();
            document.querySelectorAll('.nav-tab, .module').forEach(el => el.classList.remove('active'));
            t.classList.add('active');
            document.getElementById(t.dataset.target).classList.add('active');
            document.getElementById('scroll-area').scrollTop = 0;
        };
    });

    document.getElementById('edit-toggle').onclick = () => {
        const isLocked = document.getElementById('edit-toggle').innerText === 'LOCKED';
        document.getElementById('edit-toggle').innerText = isLocked ? 'EDIT MODE' : 'LOCKED';
        document.getElementById('admin-parser-ui').classList.toggle('hidden', !isLocked);
        document.querySelectorAll('.admin-controls').forEach(el => el.classList.toggle('hidden', !isLocked));
    };
});
