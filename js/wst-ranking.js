(function () {
    // --- DEPENDENCY CHECK ---
    if (!window.supabase) {
        console.error("Supabase client missing.");
        return;
    }

    const moduleContainer = document.querySelector('.wst-ranking-container');
    if (!moduleContainer) return;

    // --- DOM ELEMENTS ---
    const rankList = document.getElementById('wst-rank-list');
    const totalPalletsEl = document.getElementById('wst-rank-total-pallets');
    const globalTimeEl = document.getElementById('wst-rank-global-time');

    // --- STATE ---
    let realtimeSubscription = null;
    let localTimerInterval = null;
    let activeLinesData = [];
    
    // Store DOM elements for FLIP Animation
    let cardElementsMap = new Map();

    // --- INITIALIZATION ---
    function init() {
        console.log("GMX Performance Board V8 (Sort Logic Fixed): Initialized");
        loadRankingData();
        setupRealtimeSubscription();
        startLocalTick();
    }

    // --- DATA FETCHING & PROCESSING ---
    async function loadRankingData() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayLocal = `${year}-${month}-${day}`;
        const startOfDayISO = `${todayLocal}T00:00:00`;

        const { data: logs, error } = await window.supabase
            .from('production_log')
            .select(`
                *,
                warehouse_lines (id, line_name, current_operator, current_team),
                production_products (name)
            `)
            .or(`status.eq.in_progress,status.eq.waiting_for_scan,warehouse_scan_time.gte.${startOfDayISO},start_time.gte.${startOfDayISO}`)
            .order('start_time', { ascending: true });

        if (error) {
            console.error("Error fetching ranking data:", error);
            return;
        }

        if (!logs || logs.length === 0) {
            renderEmptyState();
            return;
        }

        const todayLogs = logs.filter(log => {
            if (log.status === 'in_progress' || log.status === 'waiting_for_scan') return true;
            if (log.warehouse_scan_time) {
                const scanDate = new Date(log.warehouse_scan_time);
                return scanDate.getFullYear() === now.getFullYear() &&
                       scanDate.getMonth() === now.getMonth() &&
                       scanDate.getDate() === now.getDate();
            }
            const startDate = new Date(log.start_time);
            return startDate.getFullYear() === now.getFullYear() &&
                   startDate.getMonth() === now.getMonth() &&
                   startDate.getDate() === now.getDate();
        });

        if (todayLogs.length === 0) {
            renderEmptyState();
            return;
        }

        processRankingData(todayLogs);
    }

    function processRankingData(logs) {
        const linesMap = {};
        let grandTotalPallets = 0;
        let grandTotalDeviation = 0; // Tracks only "Banked" (Completed) efficiency for Global Header

        logs.forEach(log => {
            if (!log.warehouse_lines) return;

            const lineId = log.warehouse_lines.id;
            const lineName = log.warehouse_lines.line_name;

            let opLabel = 'Unknown';
            if (log.worker_count > 1) {
                opLabel = `Team of ${log.worker_count}`;
            } else {
                opLabel = log.operator_name || log.warehouse_lines.current_operator || 'Unknown';
            }

            if (!linesMap[lineId]) {
                linesMap[lineId] = {
                    id: lineId,
                    name: lineName,
                    operator: opLabel,
                    pallets: 0,
                    totalTargetSeconds: 0,
                    totalRealSeconds: 0,
                    currentStatus: 'idle',
                    isPaused: false,
                    totalPauseSeconds: 0,
                    currentStartTime: null,
                    currentProduct: null,
                    currentAdjTargetSecs: 0, 
                    hasActiveLog: false,
                    isWaitingScan: false,
                    deviationSeconds: 0 
                };
            }

            // 1. COMPLETED & SCANNED
            if (log.status === 'completed' && log.warehouse_scan_time) { 
                linesMap[lineId].pallets += 1;
                grandTotalPallets += 1;

                const finalTarget = log.current_target_seconds 
                    ? log.current_target_seconds 
                    : (log.standard_time_seconds / (log.worker_count || 1));

                linesMap[lineId].totalTargetSeconds += finalTarget;
                linesMap[lineId].totalRealSeconds += (log.final_time_seconds || 0);
            }
            
            // 2. IN PROGRESS
            if (log.status === 'in_progress') {
                linesMap[lineId].currentStatus = 'active';
                linesMap[lineId].isPaused = log.is_paused || false;
                linesMap[lineId].totalPauseSeconds = log.total_pause_seconds || 0;
                linesMap[lineId].currentStartTime = new Date(log.start_time).getTime();
                linesMap[lineId].currentProduct = log.production_products?.name || 'Unknown Item';
                linesMap[lineId].operator = opLabel;
                linesMap[lineId].currentAdjTargetSecs = log.current_target_seconds || 0;
                linesMap[lineId].hasActiveLog = true;
            }

            // 3. WAITING FOR SCAN
            if (log.status === 'waiting_for_scan') {
                linesMap[lineId].currentStatus = 'active'; 
                linesMap[lineId].isWaitingScan = true; 
                linesMap[lineId].currentProduct = log.production_products?.name || 'Unknown Item';
                linesMap[lineId].operator = opLabel;
                
                // Add to calculations so sorting works for waiting lines
                linesMap[lineId].totalRealSeconds += (log.final_time_seconds || 0); 
                
                // CRITICAL FIX: Also add the target, otherwise deviation is negative!
                const waitingTarget = log.current_target_seconds 
                    ? log.current_target_seconds 
                    : (log.standard_time_seconds / (log.worker_count || 1));
                linesMap[lineId].totalTargetSeconds += waitingTarget;
            }
        });

        // Calculate Global (Banked only)
        Object.values(linesMap).forEach(line => {
             grandTotalDeviation += (line.totalTargetSeconds - line.totalRealSeconds);
        });

        const nowMs = Date.now();
        const rankingArray = Object.values(linesMap).map(line => {
            // Start with historical deviation
            let scoreDeviation = line.totalTargetSeconds - line.totalRealSeconds;

            // IF ACTIVE: Project the "Live" deviation into the score so sorting is correct
            if (line.hasActiveLog && line.currentStartTime && line.currentAdjTargetSecs > 0) {
                 const elapsed = Math.floor((nowMs - line.currentStartTime) / 1000) - line.totalPauseSeconds;
                 const validElapsed = elapsed > 0 ? elapsed : 0;
                 const liveDev = line.currentAdjTargetSecs - validElapsed;
                 
                 // Add live stats to the sorting score
                 scoreDeviation += liveDev;
            }

            // We use scoreDeviation for sorting, but keep deviationSeconds for initial render if needed
            return { ...line, sortingDeviation: scoreDeviation, deviationSeconds: scoreDeviation };
        });

        // SORT BY PROJECTED DEVIATION
        rankingArray.sort((a, b) => b.sortingDeviation - a.sortingDeviation);
        
        activeLinesData = rankingArray;

        renderDashboard(rankingArray, grandTotalPallets, grandTotalDeviation);
    }

    // --- RENDER DASHBOARD (DOM MANIPULATION) ---
    function renderDashboard(rankingData, totalPallets, totalDeviationSecs) {
        totalPalletsEl.textContent = totalPallets;
        
        const globalTimeData = formatTimeDiff(totalDeviationSecs);
        const globalFace = getFaceIcon(totalDeviationSecs);
        
        globalTimeEl.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <i class='bx ${globalFace.icon} global-face-icon' style="color:${globalFace.color}"></i>
                ${globalTimeData.html}
            </div>
        `;

        const prevPositions = new Map();
        rankingData.forEach(line => {
            const el = cardElementsMap.get(line.id);
            if (el && el.isConnected) {
                prevPositions.set(line.id, el.getBoundingClientRect().top);
            }
        });

        const currentElements = [];
        
        rankingData.forEach((line, index) => {
            const rankPosition = index + 1;
            let card = cardElementsMap.get(line.id);

            if (!card) {
                card = document.createElement('div');
                card.id = `line-card-${line.id}`;
                cardElementsMap.set(line.id, card);
            }

            // Use the projected deviation for the initial render colors/text
            let formattedTime = formatTimeDiff(line.sortingDeviation);
            let faceData = getFaceIcon(line.sortingDeviation);
            
            if (line.hasActiveLog) {
                 // Placeholders for active log, local timer will update text immediately
                 formattedTime = { text: 'Calc...', class: 'diff-neutral' }; 
                 faceData = { icon: 'bx-loader-alt bx-spin', color: 'var(--rank-text-muted)' };
            } else if (line.pallets === 0 && !line.isWaitingScan) {
                 formattedTime = { text: '--', class: 'diff-neutral' };
                 faceData = { icon: 'bx-moon', color: 'var(--rank-text-muted)' };
            }

            const statusStyle = getStatusConfig(line.sortingDeviation, line.hasActiveLog || line.isWaitingScan);
            card.className = `rank-card pos-${rankPosition} ${statusStyle.borderClass}`;

            let productHtml, statusBadgeHtml, timerHtml;
            const timerId = `timer-${line.id}`;
            const targetTimerId = `target-timer-${line.id}`;
            const faceId = `face-icon-${line.id}`;

            if (line.hasActiveLog) {
                productHtml = `<div class="current-item-name" title="${line.currentProduct}">${line.currentProduct}</div>`;
                if (line.isPaused) {
                    statusBadgeHtml = `<div class="rank-status-badge status-paused"><i class='bx bx-pause-circle'></i> PAUSED</div>`;
                    timerHtml = `<div id="${timerId}" class="live-timer-display" style="color:var(--rank-paused)">PAUSED</div>`;
                    faceData = { icon: 'bx-time-five', color: 'var(--rank-paused)' };
                } else {
                    statusBadgeHtml = `<div class="rank-status-badge status-active"><i class='bx bx-loader-alt bx-spin'></i> Processing</div>`;
                    timerHtml = `<div id="${timerId}" class="live-timer-display">00:00</div>`;
                }
            } else if (line.isWaitingScan) {
                productHtml = `<div class="current-item-name" title="${line.currentProduct}">${line.currentProduct}</div>`;
                statusBadgeHtml = `<div class="rank-status-badge status-paused" style="border-color:var(--rank-blue); color:var(--rank-blue); background:rgba(14,44,76,0.1);"><i class='bx bx-barcode'></i> Scanning...</div>`;
                timerHtml = `<div class="live-timer-display" style="color:var(--rank-blue); font-size:1rem;">Ready</div>`;
            } else {
                productHtml = `<div class="current-item-name" style="color:var(--rank-text-muted);">--</div>`;
                statusBadgeHtml = `<div class="rank-status-badge status-idle"><i class='bx bx-coffee'></i> Idle</div>`;
                timerHtml = `<div class="live-timer-display" style="opacity:0;">--:--</div>`;
            }

            card.innerHTML = `
                <div class="rank-pos">#${rankPosition}</div>
                <div class="rank-info">
                    <div class="line-name">${line.name}</div>
                    <div class="line-op"><i class='bx bxs-user'></i> ${line.operator}</div>
                </div>
                ${productHtml}
                ${statusBadgeHtml}
                <div class="rank-stat">
                    <span class="timer-header">REAL TIME</span>
                    ${timerHtml}
                </div>
                <div class="rank-stat">
                    <span class="timer-header">TARGET TIME</span>
                    <div id="${targetTimerId}" class="target-time-display">${line.hasActiveLog ? '--:--' : '--'}</div>
                </div>
                <div class="rank-stat">
                    <span class="timer-header">EFFICIENCY</span>
                    <div class="efficiency-wrapper">
                        <div class="time-diff ${formattedTime.class}">${formattedTime.text}</div>
                        <div class="rank-face-icon">
                            <i class='bx ${faceData.icon}' id="${faceId}" style="color:${faceData.color}"></i>
                        </div>
                    </div>
                </div>
            `;
            currentElements.push(card);
        });

        rankList.innerHTML = ''; 
        currentElements.forEach(el => rankList.appendChild(el));

        currentElements.forEach(card => {
            const lineId = parseInt(card.id.replace('line-card-', ''));
            const oldTop = prevPositions.get(lineId);
            
            if (oldTop !== undefined) {
                const newTop = card.getBoundingClientRect().top;
                const delta = oldTop - newTop;
                if (delta !== 0) {
                    requestAnimationFrame(() => {
                        card.style.transition = 'none';
                        card.style.transform = `translateY(${delta}px)`;
                        requestAnimationFrame(() => {
                            card.style.transition = 'transform 0.5s ease-in-out';
                            card.style.transform = '';
                        });
                    });
                }
            } else {
                card.style.animation = 'slideIn 0.5s ease-out';
            }
        });

        updateLocalTimers();
    }

    // --- HELPERS ---
    function getFaceIcon(seconds) {
        if (seconds >= 0) return { icon: 'bx-happy-heart-eyes', color: 'var(--rank-green)' };
        else if (seconds > -900) return { icon: 'bx-meh', color: 'var(--rank-yellow)' };
        else return { icon: 'bx-sad', color: 'var(--rank-red)' };
    }

    function formatTimeDiff(seconds) {
        const isNegative = seconds < 0;
        const m = Math.floor(Math.abs(seconds) / 60);
        const sign = isNegative ? '-' : '+';
        const text = `${sign} ${m} min`;
        let cssClass = 'diff-neutral';

        if (!isNegative && m > 0) cssClass = 'diff-positive';
        else if (isNegative) cssClass = 'diff-negative';

        return { text, class: cssClass, html: `<span class="time-diff ${cssClass}">${text}</span>` };
    }

    function getStatusConfig(seconds, isActive) {
        if(isActive) return { borderClass: 'status-active-pulse' };
        if (seconds >= 0) return { borderClass: 'status-good' };
        else if (seconds > -900) return { borderClass: 'status-warn' };
        else return { borderClass: 'status-bad' };
    }

    // --- LOCAL TIMER LOGIC ---
    function startLocalTick() {
        if (localTimerInterval) clearInterval(localTimerInterval);
        localTimerInterval = setInterval(updateLocalTimers, 1000);
    }

    function updateLocalTimers() {
        const now = Date.now();
        activeLinesData.forEach(line => {
            if (line.hasActiveLog && line.currentStartTime) {
                const timerEl = document.getElementById(`timer-${line.id}`);
                const targetEl = document.getElementById(`target-timer-${line.id}`);
                const card = document.getElementById(`line-card-${line.id}`);
                
                if (!timerEl || !targetEl || !card) return;

                const diffEl = card.querySelector('.time-diff');
                const faceEl = document.getElementById(`face-icon-${line.id}`);

                if (line.isPaused) {
                    if (faceEl) { 
                        faceEl.className = 'bx bx-time-five'; 
                        faceEl.style.color = 'var(--rank-paused)'; 
                    }
                    if (diffEl) diffEl.textContent = "PAUSED";
                    return; 
                }

                const elapsedSecs = Math.floor((now - line.currentStartTime) / 1000) - line.totalPauseSeconds;
                const validSecs = elapsedSecs > 0 ? elapsedSecs : 0;
                
                const hrs = Math.floor(validSecs / 3600);
                const mins = Math.floor((validSecs % 3600) / 60);
                const secs = (validSecs % 60);
                const pad = (n) => n.toString().padStart(2, '0');

                let timeString = (hrs > 0) ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
                timerEl.textContent = timeString;

                if (line.currentAdjTargetSecs > 0) {
                    const tHrs = Math.floor(line.currentAdjTargetSecs / 3600);
                    const tMins = Math.floor((line.currentAdjTargetSecs % 3600) / 60);
                    const tSecs = (line.currentAdjTargetSecs % 60);
                    let targetString = (tHrs > 0) ? `${tHrs}:${pad(tMins)}:${pad(tSecs)}` : `${pad(tMins)}:${pad(tSecs)}`;
                    targetEl.textContent = targetString;
                } else {
                    targetEl.textContent = "--:--";
                }

                if (diffEl && line.currentAdjTargetSecs > 0) {
                    // Update efficiency in real-time on the card
                    const timeLeftSecs = line.currentAdjTargetSecs - validSecs;
                    // Note: This matches the calculation used for sorting in 'processRankingData'
                    const timeLeftMins = Math.floor(timeLeftSecs / 60);

                    let trtClass = 'diff-positive';
                    let trtFace = 'bx-happy-heart-eyes';
                    let trtColor = 'var(--rank-green)';
                    let trtText = `+ ${timeLeftMins} min`;

                    if (timeLeftSecs < 0) {
                        trtClass = 'diff-negative';
                        trtFace = 'bx-sad';
                        trtColor = 'var(--rank-red)';
                        trtText = `${timeLeftMins} min`; 
                    } else if (timeLeftSecs <= 300) { 
                        trtClass = 'diff-neutral';
                        trtFace = 'bx-meh';
                        trtColor = 'var(--rank-yellow)';
                    }

                    diffEl.textContent = trtText;
                    diffEl.className = `time-diff ${trtClass}`;
                    if (faceEl) {
                        faceEl.className = `bx ${trtFace}`;
                        faceEl.style.color = trtColor;
                    }
                    if (validSecs > line.currentAdjTargetSecs) {
                        timerEl.style.color = 'var(--rank-red)';
                    } else {
                        timerEl.style.removeProperty('color');
                    }
                }
            }
        });
    }

    function renderEmptyState() {
        totalPalletsEl.textContent = "0";
        globalTimeEl.textContent = "--";
        rankList.innerHTML = `
            <div style="text-align:center; padding:3rem; opacity:0.6;">
                <i class='bx bx-sleep-y' style="font-size:3rem; margin-bottom:1rem;"></i>
                <h3>No production data for today yet.</h3>
                <p>Waiting for the first pallet to be scanned...</p>
            </div>
        `;
    }

    function setupRealtimeSubscription() {
        if (realtimeSubscription) return;
        realtimeSubscription = window.supabase
            .channel('public:production_log_ranking')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'production_log' },
                (payload) => {
                    loadRankingData();
                }
            )
            .subscribe();
    }

    document.addEventListener('moduleWillUnload', () => {
        if (realtimeSubscription) {
            window.supabase.removeChannel(realtimeSubscription);
            realtimeSubscription = null;
        }
        if (localTimerInterval) clearInterval(localTimerInterval);
    }, { once: true });

    init();
})();
