document.addEventListener('DOMContentLoaded', () => {
    
    // API CONFIG
    const API_URL = 'https://script.google.com/macros/s/AKfycbx_fku9O9Ljbul6DIYuattXyjtu2fH9U_Reb24irImb1vU60jxDJWExv4yy9s1k0w3Q/exec';
    let recipeVault = {};
    let parsedStagingData = []; 

    // HELPERS
    const capitalize = (str) => str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    
    const showLoader = (msg) => {
        document.querySelector('.loader-text').innerText = msg;
        const l = document.getElementById('loader');
        l.style.display = 'flex'; l.style.opacity = '1';
    };
    
    const hideLoader = () => {
        const l = document.getElementById('loader');
        l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 300);
    };

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
            populateScaleDropdowns();
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
            // Sort: Spirits -> Liqueurs -> Syrups
            recipeVault[cocktail].sort((a, b) => {
                const order = { 'amber-glow': 1, 'neon-cyan': 2, 'magenta-glow': 3 };
                return (order[a.color] || 4) - (order[b.color] || 4);
            });

            const vItem = document.createElement('div');
            vItem.className = 'vault-item';
            
            // Build ingredients HTML
            let ingHtml = `<div class="vault-details" id="details-${cocktail.replace(/\s+/g, '')}">`;
            
            // Inject Service Multiplier
            ingHtml += `
                <div class="service-multiplier" onclick="event.stopPropagation()">
                    <span class="text-sm fw-bold">SERVICE MULTIPLIER:</span>
                    <input type="number" value="1" min="1" oninput="multiplyRound('${cocktail}', this.value)">
                </div>
                <div id="recipe-list-${cocktail.replace(/\s+/g, '')}">
            `;

            recipeVault[cocktail].forEach(ing => {
                ingHtml += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount base-amt" data-base="${ing.amount}">${ing.amount}ml</span></div>`;
            });
            ingHtml += '</div></div>'; // Close lists

            vItem.innerHTML = `
                <div class="vault-header">
                    <span class="cocktail-title">${cocktail}</span>
                    <button class="action-btn delete hidden admin-controls" onclick="event.stopPropagation(); deleteSpec('${cocktail}')">DEL</button>
                </div>
                ${ingHtml}
            `;
            
            vItem.addEventListener('click', () => vItem.classList.toggle('expanded'));
            list.appendChild(vItem);
        });
        
        // Re-apply admin visibility if unlocked
        if(document.getElementById('edit-toggle').innerText !== 'LOCKED') {
            document.querySelectorAll('.admin-controls').forEach(el => el.classList.remove('hidden'));
        }
    }

    // LIVE MULTIPLIER (Service Round)
    window.multiplyRound = (cocktail, multiplier) => {
        let mult = parseFloat(multiplier) || 1;
        const container = document.getElementById(`recipe-list-${cocktail.replace(/\s+/g, '')}`);
        const amounts = container.querySelectorAll('.base-amt');
        amounts.forEach(el => {
            const base = parseFloat(el.getAttribute('data-base'));
            el.innerText = `${(base * mult).toFixed(1).replace(/\.0$/, '')}ml`;
        });
    };

    // SEARCH
    document.getElementById('vault-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.vault-item').forEach(item => {
            const title = item.querySelector('.cocktail-title').innerText.toLowerCase();
            item.style.display = title.includes(term) ? 'block' : 'none';
        });
    });

    // DB DELETE
    window.deleteSpec = async (name) => {
        if (!confirm(`Delete '${name}'?`)) return;
        showLoader("DELETING...");
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', cocktailName: name }) });
            await loadVault();
        } catch (e) { hideLoader(); }
    };

    // --- SMART PARSER LOGIC ---
    document.getElementById('parse-btn').addEventListener('click', () => {
        const title = capitalize(document.getElementById('spec-title-input').value.trim());
        const text = document.getElementById('keep-paste-area').value;
        if(!title || !text) return alert("Need Title and Recipe Text.");

        parsedStagingData = [];
        const lines = text.split('\n');
        // Regex looks for a number at start, optional unit, then text.
        const regex = /^(\d+(?:\.\d+)?)\s*(?:ml|g|oz|dash|dashes)?\s+(.+)$/i;

        lines.forEach(line => {
            const match = line.trim().match(regex);
            if (match) {
                const amt = parseFloat(match[1]);
                const name = capitalize(match[2].trim());
                
                // Auto-Guess Category
                let tag = 'amber-glow'; // Default Spirit
                const lowName = name.toLowerCase();
                if (lowName.includes('syrup') || lowName.includes('sugar') || lowName.includes('agave') || lowName.includes('honey')) {
                    tag = 'magenta-glow'; // Syrup
                } else if (lowName.includes('liqueur') || lowName.includes('amaro') || lowName.includes('campari') || lowName.includes('vermouth')) {
                    tag = 'neon-cyan'; // Liqueur/Modifier
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
        const tags = ['amber-glow', 'neon-cyan', 'magenta-glow'];
        let curr = tags.indexOf(parsedStagingData[index].categoryTag);
        let next = (curr + 1) % tags.length;
        parsedStagingData[index].categoryTag = tags[next];
        renderStagingArea();
    };

    document.getElementById('sync-vault-btn').addEventListener('click', async () => {
        if(parsedStagingData.length === 0) return;
        showLoader("PUSHING TO CODEX...");
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(parsedStagingData) });
            
            // Clean up
            document.getElementById('spec-title-input').value = '';
            document.getElementById('keep-paste-area').value = '';
            document.getElementById('staging-area').classList.add('hidden');
            parsedStagingData = [];
            
            await loadVault();
        } catch (e) { hideLoader(); }
    });

    // --- LAB: ACID ADJUSTER ---
    document.getElementById('calc-acid-btn').addEventListener('click', () => {
        const vol = parseFloat(document.getElementById('acid-vol').value) || 0;
        const base = document.getElementById('acid-base').value;
        const target = document.getElementById('acid-target').value;
        const res = document.getElementById('acid-results');
        
        if(!vol) return;

        // Base Acids approximation: OJ 1%, GF 2%, PA 0.8%
        // Target Lemon: 6% Citric. Target Lime: 4% Citric, 2% Malic.
        let cit = 0, mal = 0;

        if (target === 'lemon') {
            if(base === 'orange') cit = vol * 0.05;
            if(base === 'grapefruit') cit = vol * 0.04;
            if(base === 'pineapple') cit = vol * 0.052;
        } else { // Lime
            if(base === 'orange') { cit = vol * 0.03; mal = vol * 0.02; }
            if(base === 'grapefruit') { cit = vol * 0.02; mal = vol * 0.02; }
            if(base === 'pineapple') { cit = vol * 0.032; mal = vol * 0.02; }
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
        modPills.forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        modType = e.target.getAttribute('data-val');
        
        if(modType === 'shrub') document.getElementById('vinegar-matrix').classList.remove('hidden');
        else document.getElementById('vinegar-matrix').classList.add('hidden');
    }));

    document.getElementById('calc-mod-btn').addEventListener('click', () => {
        const weight = parseFloat(document.getElementById('mod-weight').value) || 0;
        const res = document.getElementById('mod-results');
        if(!weight) return;

        if (modType === 'cordial') {
            // 1.5% total acid. 3:1 Citric:Malic
            const totalAcid = weight * 0.015;
            const cit = totalAcid * 0.75;
            const mal = totalAcid * 0.25;
            res.innerHTML = `
                <h3 class="zone-header">CORDIAL POWDERS</h3>
                <div class="result-row amber-glow"><span class="ing-name">Citric Acid</span><span class="ing-amount">${cit.toFixed(1)}g</span></div>
                <div class="result-row magenta-glow"><span class="ing-name">Malic Acid</span><span class="ing-amount">${mal.toFixed(1)}g</span></div>
            `;
        } else {
            // Shrub: Vinegar is 50% of syrup weight
            const vin = weight * 0.5;
            res.innerHTML = `
                <h3 class="zone-header">SHRUB LIQUID</h3>
                <div class="result-row neon-cyan"><span class="ing-name">Vinegar (See Matrix)</span><span class="ing-amount">${vin.toFixed(0)}g</span></div>
            `;
        }
    });

    // --- SCALE: BATCHING ---
    function populateScaleDropdowns() {
        const specs = Object.keys(recipeVault);
        const fSelect = document.getElementById('forward-spec-select');
        const rSelect = document.getElementById('reverse-spec-select');
        
        let opts = '<option value="">Select Spec...</option>';
        specs.forEach(s => opts += `<option value="${s}">${s}</option>`);
        
        fSelect.innerHTML = opts;
        rSelect.innerHTML = opts;
    }

    // Forward Batch
    document.getElementById('calc-forward-btn').addEventListener('click', () => {
        const specName = document.getElementById('forward-spec-select').value;
        const drinks = parseFloat(document.getElementById('forward-drinks').value) || 0;
        const dilPct = parseFloat(document.getElementById('forward-dilution').value) || 0;
        const res = document.getElementById('forward-results');
        
        if(!specName || drinks <= 0) return;
        const spec = recipeVault[specName];
        
        let html = '<h3 class="zone-header">BATCH YIELD</h3>';
        let totalVol = 0;

        spec.forEach(ing => {
            const amt = ing.amount * drinks;
            totalVol += amt;
            html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${amt.toFixed(0)}ml</span></div>`;
        });

        if (dilPct > 0) {
            const water = totalVol * (dilPct / 100);
            totalVol += water;
            html += `<div class="result-row"><span class="ing-name text-muted">Filtered Water (${dilPct}%)</span><span class="ing-amount">${water.toFixed(0)}ml</span></div>`;
        }
        
        html += `<div class="result-row mt-10"><span class="ing-name text-gold fw-bold">TOTAL BATCH VOLUME</span><span class="ing-amount">${totalVol.toFixed(0)}ml</span></div>`;
        res.innerHTML = html;
    });

    // Reverse Batch
    document.getElementById('reverse-spec-select').addEventListener('change', (e) => {
        const specName = e.target.value;
        const ingSelect = document.getElementById('reverse-ing-select');
        const volCont = document.getElementById('reverse-vol-container');
        document.getElementById('reverse-results').innerHTML = '';
        
        if(!specName) { ingSelect.classList.add('hidden'); volCont.classList.add('hidden'); return; }
        
        const spec = recipeVault[specName];
        let opts = '<option value="">Select Limiting Ingredient...</option>';
        spec.forEach(ing => opts += `<option value="${ing.name}" data-amt="${ing.amount}">${ing.name} (${ing.amount}ml)</option>`);
        
        ingSelect.innerHTML = opts;
        ingSelect.classList.remove('hidden');
    });

    document.getElementById('reverse-ing-select').addEventListener('change', (e) => {
        if(e.target.value) document.getElementById('reverse-vol-container').classList.remove('hidden');
        else document.getElementById('reverse-vol-container').classList.add('hidden');
    });

    document.getElementById('calc-reverse-btn').addEventListener('click', () => {
        const specName = document.getElementById('reverse-spec-select').value;
        const sel = document.getElementById('reverse-ing-select');
        const ingName = sel.value;
        const baseAmt = parseFloat(sel.options[sel.selectedIndex].getAttribute('data-amt'));
        const availVol = parseFloat(document.getElementById('reverse-vol').value) || 0;
        const res = document.getElementById('reverse-results');
        
        if(!specName || !ingName || !baseAmt || availVol <= 0) return;

        const maxDrinks = Math.floor(availVol / baseAmt);
        const spec = recipeVault[specName];
        
        let html = `<h3 class="zone-header">MAX YIELD: ${maxDrinks} DRINKS</h3>`;
        
        spec.forEach(ing => {
            const reqAmt = ing.amount * maxDrinks;
            let displayAmt = `${reqAmt.toFixed(0)}ml`;
            if(ing.name === ingName) displayAmt = `${reqAmt.toFixed(0)}ml <span class="text-muted text-sm">(Empty)</span>`;
            
            html += `<div class="result-row ${ing.color}"><span class="ing-name">${ing.name}</span><span class="ing-amount">${displayAmt}</span></div>`;
        });
        
        res.innerHTML = html;
    });


    // --- NAV & LOCK LOGIC ---
    const tabs = document.querySelectorAll('.nav-tab');
    const modules = document.querySelectorAll('.module');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
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
        }
    });
});
