// js/wst-scan.js
// V9.2 - Updated: Fixed Order Completion Trigger (Multi-product Math Validation)

(function() {
    // --- DEPENDENCY CHECK ---
    if (!window.supabase) {
        console.error("Supabase client missing. Ensure script.js is loaded.");
        return;
    }
    
    const moduleContainer = document.querySelector('.wst-scan-container');
    if (!moduleContainer) return;

    // --- DOM ELEMENTS ---
    const inputSection = document.getElementById('wst-input-section');
    const cameraWrapper = document.getElementById('wst-camera-wrapper');
    const scanInput = document.getElementById('wst-scan-input');
    
    // Buttons
    const openCameraBtn = document.getElementById('wst-open-camera-btn');
    const closeCameraBtn = document.getElementById('wst-close-camera-btn');
    const manualSearchBtn = document.getElementById('wst-manual-search-btn');
    
    // Result Areas
    const resultCard = document.getElementById('wst-scan-result');
    const resSuccess = document.getElementById('wst-res-success');
    const resError = document.getElementById('wst-res-error');
    const resLoading = document.getElementById('wst-res-loading');
    
    // Success Data Fields
    const resProduct = document.getElementById('res-product');
    const resQrIdDisplay = document.getElementById('res-qr-id-display');
    const resLine = document.getElementById('res-line-op');
    const resTime = document.getElementById('res-time');
    
    // Action Buttons
    const nextBtn = document.getElementById('wst-next-scan-btn');
    const retryBtn = document.getElementById('wst-retry-btn');
    
    // History
    const historyBody = document.getElementById('wst-scan-history-body');
    const refreshHistoryBtn = document.getElementById('wst-refresh-history');

    let html5QrCode = null;

    // --- INITIALIZATION ---
    function init() {
        console.log("Scanner Module V9.2 (Gatekeeper Logic Fixed): Initialized");
        loadHistory();
        
        // Auto-focus logic for USB scanners
        setTimeout(() => {
            if (scanInput && !isMobileDevice()) scanInput.focus();
        }, 500);

        // Keep focus on input unless interacting with UI
        document.addEventListener('click', (e) => {
            if(cameraWrapper.classList.contains('hidden') 
               && !e.target.closest('button') 
               && !e.target.closest('input')
               && !isMobileDevice()) {
                scanInput.focus();
            }
        });
    }

    // --- EVENT LISTENERS ---
    if(scanInput) {
        scanInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const code = scanInput.value.trim();
                if(code) handleScan(code);
            }
        });
    }

    if(manualSearchBtn) {
        manualSearchBtn.onclick = () => {
            const code = scanInput.value.trim();
            if(code) handleScan(code);
        };
    }

    if(openCameraBtn) openCameraBtn.onclick = startCamera;
    if(closeCameraBtn) closeCameraBtn.onclick = stopCamera;
    
    if(nextBtn) nextBtn.onclick = resetUI;
    if(retryBtn) retryBtn.onclick = resetUI;
    if(refreshHistoryBtn) refreshHistoryBtn.onclick = loadHistory;

    // --- CAMERA LOGIC ---
    async function startCamera() {
        inputSection.classList.add('hidden');
        cameraWrapper.classList.remove('hidden');
        resultCard.classList.add('hidden');

        // Initialize Html5Qrcode
        html5QrCode = new Html5Qrcode("wst-reader");
        try {
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    stopCamera();
                    handleScan(decodedText);
                },
                (errorMessage) => {
                    // Scanning...
                }
            );
        } catch (err) {
            console.error("Camera start error:", err);
            alert("Error starting camera. Please ensure permissions are granted.");
            stopCamera();
        }
    }

    function stopCamera() {
        if(html5QrCode) {
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
                closeCameraUI();
            }).catch(err => {
                console.error("Failed to stop camera", err);
                closeCameraUI();
            });
        } else {
            closeCameraUI();
        }
    }

    function closeCameraUI() {
        cameraWrapper.classList.add('hidden');
        inputSection.classList.remove('hidden');
        if(!isMobileDevice()) scanInput.focus();
    }

    // --- CORE SCAN LOGIC (V5 IMPLEMENTATION) ---
    async function handleScan(qrCode) {
        showState('loading');
        scanInput.value = '';
        scanInput.blur(); 

        try {
            // 1. Search Pallet in DB
            const { data: pallet, error } = await supabase
                .from('production_log')
                .select(`
                    *,
                    production_products (name, cases_per_pallet, seconds_per_case),
                    warehouse_lines (line_name),
                    job_tickets (order_ref)
                `)
                .eq('pallet_qr_id', qrCode)
                .single();

            if(error || !pallet) throw new Error("Pallet ID not found in system.");
            
            // 2. Status Validation
            // Allow re-scanning only if status is NOT completed yet (e.g. waiting_for_scan)
            if(pallet.status === 'completed' || pallet.status === 'shipped') {
                const scannedAt = new Date(pallet.warehouse_scan_time || Date.now()).toLocaleTimeString();
                throw new Error(`Pallet ALREADY verified at ${scannedAt}.`);
            }

            // 3. V5 LOGIC: Calculate Real Time & Target
            
            // A. Real Time (Net)
            const now = new Date();
            const start = new Date(pallet.start_time);
            const totalPause = pallet.total_pause_seconds || 0;
            
            // Formula: (Clock Time) - (Pauses)
            const grossDuration = Math.floor((now - start) / 1000);
            const netRealSecs = grossDuration - totalPause;
            
            // Safety check: time cannot be negative
            const validRealSecs = netRealSecs > 0 ? netRealSecs : 0;

            // B. Target Time (Weighted)
            let targetSecs = 0;
            
            if (pallet.current_target_seconds && pallet.current_target_seconds > 0) {
                // Use the precise weighted target calculated by SQL during crew changes
                targetSecs = pallet.current_target_seconds;
            } else {
                // Fallback: If no changes occurred, calculate basic standard
                const baseStd = pallet.production_products.cases_per_pallet * pallet.production_products.seconds_per_case;
                const workers = pallet.worker_count || 1;
                targetSecs = Math.ceil(baseStd / workers);
            }
            
            console.log(`Scan Eval: Target=${targetSecs}s, Real=${validRealSecs}s, Pauses=${totalPause}s`);

            // 4. Rating Logic (Success/Warning/Danger)
            let rating = 'success';
            
            // If taking 25% longer than target -> Danger
            if(validRealSecs > targetSecs * 1.25) rating = 'danger'; 
            // If taking longer than target -> Warning
            else if(validRealSecs > targetSecs) rating = 'warning'; 

            // 5. Update Database
            const { error: updateError } = await supabase
                .from('production_log')
                .update({
                    warehouse_scan_time: now.toISOString(),
                    final_time_seconds: validRealSecs, // Store the NET time
                    performance_rating: rating,
                    status: 'completed' // This is the trigger
                })
                .eq('id', pallet.id);

            if(updateError) throw new Error("Database update failed. Check connection.");

            // [MODIFIED] - Trigger Order Completion Check
            if (pallet.job_tickets && pallet.job_tickets.order_ref) {
                // We await this to ensure consistency, but failures here shouldn't block the UI success
                await checkAndFinalizeOrder(pallet.job_tickets.order_ref);
            }

            // 6. Update UI
            displaySuccess(pallet, validRealSecs, targetSecs);
            loadHistory();

        } catch (err) {
            showError(err.message);
        }
    }

    // [MODIFIED] - Helper: Fixed to support multi-product orders without throwing .single() errors
    async function checkAndFinalizeOrder(orderRef) {
        if (!orderRef) return;
        
        try {
            // 1. Get Total Requested from Master Order (Fetch all rows for this order)
            // We removed .single() because an order can have multiple products/rows
            const { data: orderRows, error: orderError } = await supabase
                .from('client_orders')
                .select('qty_calculated_pallets, status')
                .eq('unique_order_code', orderRef);

            if (orderError || !orderRows || orderRows.length === 0) return;

            // Check if it's already fully completed to avoid redundant database calls
            const alreadyCompleted = orderRows.every(r => r.status === 'production_completed' || r.status === 'shipped');
            if (alreadyCompleted) return;

            // Sum total pallets needed across all products in this order
            let totalRequired = 0;
            orderRows.forEach(row => {
                totalRequired += Math.ceil(row.qty_calculated_pallets || 0);
            });

            // 2. Count Total VERIFIED (Completed) Pallets for this specific order
            const { data: tickets } = await supabase
                .from('job_tickets')
                .select('id')
                .eq('order_ref', orderRef);

            if (!tickets || tickets.length === 0) return;
            const ticketIds = tickets.map(t => t.id);

            // We count 'completed', 'shipped', 'adjusted' as "Finished" pallets
            const { count, error: countError } = await supabase
                .from('production_log')
                .select('id', { count: 'exact', head: true })
                .in('job_ticket_id', ticketIds)
                .in('status', ['completed', 'shipped', 'adjusted']);

            if (countError) return;

            console.log(`Order Check [${orderRef}]: ${count} verified / ${totalRequired} required`);

            // 3. Final Decision
            if (count >= totalRequired && totalRequired > 0) {
                // Mark ALL rows of this Order as Completed
                await supabase
                    .from('client_orders')
                    .update({ status: 'production_completed' })
                    .eq('unique_order_code', orderRef);
                
                console.log(`>> Order ${orderRef} FINALIZED by Scanner.`);

                // Visual confirmation for the scanner operator
                if (window.Swal) {
                    Swal.fire({
                        title: 'Order Complete!',
                        text: `All pallets for ${orderRef} are now verified.`,
                        icon: 'success',
                        timer: 3000,
                        showConfirmButton: false
                    });
                } else {
                    alert(`✅ ORDER COMPLETE: ${orderRef}`);
                }
            }

        } catch (e) {
            console.warn("Finalization check warning:", e);
        }
    }

    // --- UI HELPERS ---
    function showState(state) {
        resultCard.classList.remove('hidden');
        resLoading.classList.add('hidden');
        resSuccess.classList.add('hidden');
        resError.classList.add('hidden');

        if(state === 'loading') resLoading.classList.remove('hidden');
        if(state === 'success') resSuccess.classList.remove('hidden');
        if(state === 'error') resError.classList.remove('hidden');
    }

    function displaySuccess(pallet, realSeconds, targetSeconds) {
        showState('success');
        
        // Fill Data
        resProduct.textContent = pallet.production_products?.name || 'Unknown Product';
        resQrIdDisplay.textContent = pallet.pallet_qr_id || 'N/A';
        
        const lineName = pallet.warehouse_lines?.line_name || 'Unknown Line';
        const workers = pallet.worker_count || 1;
        const opDisplay = workers > 1 ? `Team of ${workers}` : (pallet.operator_name || 'Operator');
        
        resLine.textContent = `${lineName} (${opDisplay})`;
        
        // Format Time
        const h = Math.floor(realSeconds/3600);
        const m = Math.floor((realSeconds%3600)/60);
        
        // Calculate Efficiency Display
        const diff = targetSeconds - realSeconds;
        const diffM = Math.floor(Math.abs(diff) / 60);
        
        let statusText = '';
        let statusColor = '';

        if (diff >= 0) {
            statusText = `Saved ${diffM} min`;
            statusColor = 'var(--scan-success)';
        } else {
            statusText = `Late ${diffM} min`;
            statusColor = 'var(--scan-error)';
        }
        
        resTime.innerHTML = `${h}h ${m}m <br><small style="font-size:0.9rem; color:${statusColor}; font-weight:bold;">${statusText}</small>`;
    }

    function showError(msg) {
        showState('error');
        document.getElementById('wst-error-message').textContent = msg;
    }

    function resetUI() {
        resultCard.classList.add('hidden');
        scanInput.value = '';
        if(!isMobileDevice()) scanInput.focus();
    }

    function isMobileDevice() {
        return window.innerWidth <= 768;
    }

    // --- HISTORY TABLE ---
    async function loadHistory() {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
            .from('production_log')
            .select('*, production_products(name)')
            .not('warehouse_scan_time', 'is', null)
            .gte('warehouse_scan_time', `${today} 00:00:00`)
            .order('warehouse_scan_time', { ascending: false })
            .limit(10); 

        historyBody.innerHTML = '';

        if(error || !data || data.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:#999;">No scans recorded today.</td></tr>';
            return;
        }

        data.forEach(log => {
            const tr = document.createElement('tr');
            
            const timeObj = new Date(log.warehouse_scan_time);
            const timeStr = timeObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            
            let iconColor = 'var(--scan-success)';
            if(log.performance_rating === 'warning') iconColor = '#f59e0b';
            if(log.performance_rating === 'danger') iconColor = 'var(--scan-error)';

            const qrDisplay = log.pallet_qr_id; 

            tr.innerHTML = `
                <td style="font-family:monospace; font-weight:bold;">${timeStr}</td>
                <td class="col-qr-id" style="font-family:monospace; color:var(--scan-primary); font-size:0.85rem; word-break:break-all;">
                    ${qrDisplay}
                </td>
                <td style="font-size:0.9rem;">${log.production_products?.name || 'Deleted Product'}</td>
                <td style="text-align:center;">
                    <i class='bx bxs-circle' style="color:${iconColor}; font-size:1rem;"></i>
                </td>
            `;
            historyBody.appendChild(tr);
        });
    }

    init();
})();