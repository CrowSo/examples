/* ================= INICIO ARCHIVO: wst-data.js ================= */

// js/wst-data.js

(function() {
    // --- 1. DEPENDENCY CHECK ---
    if (!window.supabase) {
        console.error("Supabase client not found. Ensure script.js is loaded.");
        return;
    }

    const moduleContainer = document.querySelector('.wst-data-container');
    if (!moduleContainer) return;

    // --- STATE VARIABLES ---
    let productsCache = [];
    let logsCache = [];
    let logsTable = null;
    let productsTable = null;

    // --- DOM ELEMENTS (Tabs) ---
    const tabButtons = document.querySelectorAll('.wst-tab-button');
    const tabContents = document.querySelectorAll('.wst-tab-content');

    // --- DOM ELEMENTS (Product Modal) ---
    const addProductBtn = document.getElementById('wst-add-product-btn');
    const productModal = document.getElementById('wstProductModal');
    const modalCloseX = document.getElementById('wst-modal-close-x');
    const modalCancelBtn = document.getElementById('wst-modal-cancel-btn');
    const productForm = document.getElementById('wstProductForm');
    const modalTitle = document.getElementById('wstModalTitle');
    const inputSku = document.getElementById('wst-prod-sku'); // NEW SKU INPUT
    // UPDATED: Barcode elements
    const inputBarcode = document.getElementById('wst-prod-barcode'); 
    
    // --- DOM ELEMENTS (Calculator) ---
    const inputMinutes = document.getElementById('wst-prod-minutes');
    const inputCases = document.getElementById('wst-prod-cases');
    const calcPreview = document.getElementById('wst-time-calc-preview');

    // --- DOM ELEMENTS (Filters & Actions) ---
    const dateFromInput = document.getElementById('wst-date-from');
    const dateToInput = document.getElementById('wst-date-to');
    const lineFilterInput = document.getElementById('wst-filter-line');
    const applyFiltersBtn = document.getElementById('wst-apply-filters-btn');
    const refreshBtn = document.getElementById('wst-refresh-btn');
    const exportCsvBtn = document.getElementById('wst-export-csv-btn');
    // UPDATED: New Export DB Button
    const exportDbBtn = document.getElementById('wst-export-db-btn');

    // --- 2. INITIALIZATION ---
    async function init() {
        console.log("Initializing WST Data Manager V11 (Auto-Sequence SKU)...");
        
        initTabs();
        initDataTables();
        
        // Default Date: Today (Local Time Fix)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayLocal = `${year}-${month}-${day}`;

        if(dateFromInput) dateFromInput.value = todayLocal;
        if(dateToInput) dateToInput.value = todayLocal;

        // Initial Load
        await loadProducts();
        await loadLogs();

        setupEventListeners();
    }

    // --- 3. TAB LOGIC ---
    function initTabs() {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                document.getElementById(targetId).classList.add('active');

                // Recalculate DataTable layout when tab becomes visible
                if (targetId === 'wst-tab-logs' && logsTable) {
                    logsTable.columns.adjust().draw();
                }
                if (targetId === 'wst-tab-database' && productsTable) {
                    productsTable.columns.adjust().draw();
                }
            });
        });
    }

    // --- 4. DATATABLES CONFIGURATION ---
    function initDataTables() {
        const domConfig = '<"wst-dt-header"lf>rt<"wst-dt-footer"ip>';

        const commonConfig = {
            dom: domConfig,
            responsive: true,
            scrollY: '200px', 
            scrollCollapse: true,
            paging: true,
            layout: {
                topStart: null, topEnd: null, bottomStart: null, bottomEnd: null
            }
        };

        // A. Logs Table
        if ($.fn.DataTable.isDataTable('#wstLogsTable')) {
            $('#wstLogsTable').DataTable().destroy();
        }
        
        logsTable = $('#wstLogsTable').DataTable({
            ...commonConfig,
            order: [[4, "desc"]],
            pageLength: 25,
            lengthMenu: [10, 25, 50, 100],
            columns: [
                { data: 'date' },
                { data: 'line_name' },
                { data: 'product_name' },
                { data: 'crew', className: "dt-center" },    
                { data: 'start_time' },
                { data: 'end_time' },
                { data: 'real_time', className: "dt-right" }, 
                { data: 'adj_target', className: "dt-right" },
                { data: 'diff', className: "dt-center" },     
                { data: 'status', className: "dt-center" }
            ],
            language: {
                emptyTable: "No production records found.",
                search: "",
                searchPlaceholder: "Search logs..."
            }
        });

        // B. Products Table
        if ($.fn.DataTable.isDataTable('#wstProductsTable')) {
            $('#wstProductsTable').DataTable().destroy();
        }
        
        productsTable = $('#wstProductsTable').DataTable({
            ...commonConfig,
            order: [[0, "asc"]], 
            pageLength: 15,
            lengthMenu: [15, 50, 100, 200],
            columns: [
                { data: 'sku', className: "dt-left" },
                { data: 'name', width: "25%" },
                { data: 'cases', className: "dt-center" },
                { data: 'units', className: "dt-center" },
                { data: 'std_time_min', className: "dt-center" },
                { data: 'std_time_sec', className: "dt-center" },
                { data: 'total_time_hrs', className: "dt-center" },
                { data: 'actions', orderable: false, className: "dt-center" }
            ],
            language: {
                search: "",
                searchPlaceholder: "Search products..."
            }
        });
    }

    // --- 5. DATA LOADING ---
    async function loadProducts() {
        try {
            // Note: select('*') will automatically fetch the new 'barcode' column if it exists in DB
            const { data, error } = await supabase.from('production_products').select('*').order('name', { ascending: true });
            if (error) throw error;
            productsCache = data || [];
            renderProductsTable();
        } catch (err) {
            console.error('Error loading products:', err);
        }
    }

    async function loadLogs() {
        const fromDate = dateFromInput.value;
        const toDate = dateToInput.value;
        const lineFilter = lineFilterInput.value;

        let query = supabase.from('production_log').select(`*, warehouse_lines(line_name), production_products(name)`).order('start_time', { ascending: false });

        if (fromDate) query = query.gte('start_time', `${fromDate}T00:00:00`);
        if (toDate) query = query.lte('start_time', `${toDate}T23:59:59`);

        try {
            const { data, error } = await query;
            if (error) throw error;

            let filteredData = data;
            if (lineFilter !== 'all') {
                filteredData = data.filter(row => {
                    const lineName = row.warehouse_lines?.line_name || '';
                    return lineName.includes(lineFilter);
                });
            }
            logsCache = filteredData || [];
            renderLogsTable();
        } catch (err) {
            console.error('Error loading logs:', err);
        }
    }

    // --- 6. FORMAT HELPERS ---
    function formatTime(seconds) {
        if (!seconds && seconds !== 0) return '-';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    }

    // --- 7. RENDER TABLES ---
    function renderProductsTable() {
        const rows = productsCache.map(prod => {
            const secondsPerCase = prod.seconds_per_case;
            const minPerCase = (secondsPerCase / 60).toFixed(2);
            const totalSec = prod.cases_per_pallet * secondsPerCase;
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);

            return {
                // Render SKU with clear formatting
                sku: `<span style="font-family:monospace; font-weight:700; color:var(--wst-primary); background:rgba(0,0,0,0.05); padding:2px 6px; border-radius:4px;">${prod.sku || '---'}</span>`,
                name: `<span style="font-weight:600;">${prod.name}</span>`,
                cases: prod.cases_per_pallet,
                units: prod.units_per_case,
                std_time_min: `<span style="color:#0275d8;">${minPerCase} min</span>`,
                std_time_sec: secondsPerCase + ' s',
                total_time_hrs: `<b>${h}h ${m}m</b>`,
                actions: `<button class="btn-icon-action" onclick="window.wstEditProduct(${prod.id})"><i class='bx bxs-edit'></i></button>
                          <button class="btn-icon-action delete" onclick="window.wstDeleteProduct(${prod.id})"><i class='bx bxs-trash'></i></button>`
            };
        });
        productsTable.clear().rows.add(rows).draw();
    }

    function renderLogsTable() {
        const rows = logsCache.map(log => {
            const start = new Date(log.start_time);
            const dateStr = start.toLocaleDateString();
            const timeStart = start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            let timeEnd = log.warehouse_scan_time ? new Date(log.warehouse_scan_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';

            const crewSize = log.worker_count || 1;
            let adjustedTargetSecs = log.current_target_seconds || Math.ceil((log.standard_time_seconds || 0) / crewSize);
            
            let realSecs = 0;
            const totalPause = log.total_pause_seconds || 0;

            if (log.final_time_seconds !== null) {
                realSecs = log.final_time_seconds;
            } else {
                const elapsedGross = Math.floor((Date.now() - start.getTime()) / 1000);
                realSecs = elapsedGross - totalPause;
                if (realSecs < 0) realSecs = 0;
            }
            
            const diffSecs = adjustedTargetSecs - realSecs;
            const diffMin = Math.floor(Math.abs(diffSecs) / 60);
            
            let diffHtml = '-';
            if (realSecs !== null) {
                const color = diffSecs >= 0 ? '#10b981' : '#ef4444';
                const sign = diffSecs >= 0 ? '+' : '-';
                diffHtml = `<span style="color:${color}; font-weight:bold;">${sign}${diffMin}m</span>`;
            }

            const team = Array.isArray(log.team_members) ? log.team_members.join(', ') : (log.operator_name || 'Op');
            const crewHtml = `<span title="${team}" style="cursor:help; border-bottom:1px dotted #ccc;"><i class='bx bxs-group'></i> ${crewSize}</span>`;

            let badgeClass = 'status-neutral';
            let label = log.status;
            if (log.is_paused) { badgeClass = 'status-warning'; label = 'PAUSED'; }
            else if (log.performance_rating === 'success') { badgeClass = 'status-success'; label = 'Excellent'; }
            else if (log.performance_rating === 'warning') { badgeClass = 'status-warning'; label = 'Regular'; }
            else if (log.performance_rating === 'danger') { badgeClass = 'status-danger'; label = 'Late'; }
            else if (log.status === 'in_progress') { badgeClass = 'status-neutral'; label = 'Running'; }

            return {
                date: dateStr,
                line_name: log.warehouse_lines?.line_name || 'N/A',
                product_name: log.production_products?.name || '-',
                crew: crewHtml,
                start_time: timeStart,
                end_time: timeEnd,
                real_time: formatTime(realSecs),
                adj_target: formatTime(adjustedTargetSecs),
                diff: diffHtml,
                status: `<span class="badge-status ${badgeClass}">${label}</span>`
            };
        });
        logsTable.clear().rows.add(rows).draw();
    }

    // --- 8. MODAL & CALC & LOGIC ---

    function updateTimePreview() {
        if(!inputMinutes || !inputCases || !calcPreview) return;
        
        const m = parseFloat(inputMinutes.value)||0; 
        const c = parseInt(inputCases.value)||0;
        if(m>0){
            const sec = Math.round(m*60);
            const tot = sec*c;
            const h = Math.floor(tot/3600);
            const rm = Math.floor((tot%3600)/60);
            calcPreview.innerHTML = `<b>${m} min/case</b> = ${h}h ${rm}m Total (1 person)`;
        } else {
            calcPreview.innerHTML = 'Preview: 0 sec';
        }
    }

    // UPDATED: Barcode Preview Helper
    function updateBarcodePreview(value) {
        const svgNode = document.getElementById('wst-barcode-preview');
        if(!svgNode) return;
        
        if(!value || value.trim() === "") {
            svgNode.style.display = 'none';
            return;
        }
        
        svgNode.style.display = 'inline';
        try {
            // Check if JsBarcode is loaded
            if (typeof JsBarcode === "function") {
                JsBarcode(svgNode, value, {
                    format: "CODE128", // Default flexible format
                    width: 1.5,
                    height: 35,
                    displayValue: true,
                    fontSize: 12,
                    margin: 0
                });
            } else {
                console.warn("JsBarcode library not loaded.");
            }
        } catch(e) {
            // Handle invalid characters for barcode
            // console.warn("Invalid barcode value", e);
            svgNode.style.display = 'none';
        }
    }

    function openModal(edit) {
        productModal.style.display = 'flex';
        modalTitle.innerHTML = edit ? 'Edit Product' : 'Add New Product';
    }

    function closeModal() {
        productModal.style.display = 'none';
        productForm.reset();
        document.getElementById('wst-prod-id').value = '';
        inputSku.disabled = false; // Reset lock for new add
        inputSku.classList.remove('input-locked'); // Optional styling reset
        if(calcPreview) calcPreview.innerHTML = 'Preview: 0 sec';
        // UPDATED: Clean barcode preview
        updateBarcodePreview("");
    }

    // --- NEW: AUTO-SEQUENCE GENERATOR ---
    function generateNextSku() {
        let maxSeq = 0;
        
        // Loop through existing products to find highest GMXxxxx
        productsCache.forEach(p => {
            if (p.sku && p.sku.startsWith('GMX')) {
                // Remove 'GMX' and parse integer
                const numPart = parseInt(p.sku.replace('GMX', ''), 10);
                if (!isNaN(numPart) && numPart > maxSeq) {
                    maxSeq = numPart;
                }
            }
        });

        // Increment
        const nextSeq = maxSeq + 1;
        // Pad with zeros (e.g., 1 -> '0001')
        const paddedSeq = String(nextSeq).padStart(4, '0');
        
        return `GMX${paddedSeq}`;
    }

    window.wstEditProduct = function(id) {
        const p = productsCache.find(x => x.id === id);
        if(!p) return;
        
        // --- CORE DATA ---
        document.getElementById('wst-prod-id').value = p.id;
        
        // Populate and LOCK the SKU field to prevent breaking traceability
        inputSku.value = p.sku || 'GMX----'; 
        inputSku.disabled = true;

        // UPDATED: Populate Barcode
        const barcodeVal = p.barcode || '';
        inputBarcode.value = barcodeVal;
        updateBarcodePreview(barcodeVal);

        document.getElementById('wst-prod-name').value = p.name;
        
        // Set these first as they are needed for calculation
        document.getElementById('wst-prod-cases').value = p.cases_per_pallet;
        document.getElementById('wst-prod-minutes').value = (p.seconds_per_case/60).toFixed(2);
        document.getElementById('wst-prod-units').value = p.units_per_case;

        // --- WEIGHTS & MEASURES DATA ---
        if(document.getElementById('wst-prod-value')) {
            document.getElementById('wst-prod-value').value = p.value_per_piece || '';
            document.getElementById('wst-prod-uom').value = p.unit_of_measure || 'g';
            document.getElementById('wst-prod-pkg-weight').value = p.packaging_weight_g || '';
            document.getElementById('wst-prod-case-weight').value = p.case_weight_g || '';
        }

        openModal(true);
        updateTimePreview();
    };

    window.wstDeleteProduct = async function(id) {
        if(!confirm("Delete this standard?")) return;
        await supabase.from('production_products').delete().eq('id', id);
        loadProducts();
    };

    function setupEventListeners() {
        if(addProductBtn) addProductBtn.onclick = () => {
            openModal(false);
            
            // --- AUTO GENERATE SKU ON OPEN ---
            const nextSku = generateNextSku();
            inputSku.value = nextSku;
            inputSku.disabled = true; // Lock it so user follows sequence
            
            updateTimePreview(); // Reset preview
            updateBarcodePreview(""); // Reset barcode
        };
        if(modalCloseX) modalCloseX.onclick = closeModal;
        if(modalCancelBtn) modalCancelBtn.onclick = closeModal;
        
        if(inputMinutes) inputMinutes.oninput = updateTimePreview;
        if(inputCases) inputCases.oninput = updateTimePreview;

        // UPDATED: Live Barcode Preview Listener
        if(inputBarcode) {
            inputBarcode.addEventListener('input', (e) => {
                updateBarcodePreview(e.target.value);
            });
        }
        
        if(productForm) productForm.onsubmit = async (e) => {
            e.preventDefault();
            const sec = Math.round(parseFloat(inputMinutes.value)*60);
            
            // Build Data Object
            const data = {
                // Ensure we capture SKU even if disabled
                sku: inputSku.value.trim().toUpperCase(),
                // UPDATED: Capture Barcode
                barcode: inputBarcode.value.trim(),
                name: document.getElementById('wst-prod-name').value,
                cases_per_pallet: parseInt(inputCases.value) || 0,
                units_per_case: parseInt(document.getElementById('wst-prod-units').value) || 0,
                seconds_per_case: sec,
                value_per_piece: parseFloat(document.getElementById('wst-prod-value').value) || 0,
                unit_of_measure: document.getElementById('wst-prod-uom').value,
                packaging_weight_g: parseFloat(document.getElementById('wst-prod-pkg-weight').value) || 0,
                case_weight_g: parseFloat(document.getElementById('wst-prod-case-weight').value) || 0
            };

            const id = document.getElementById('wst-prod-id').value;
            let err;
            if(id) ({error:err} = await supabase.from('production_products').update(data).eq('id', id));
            else ({error:err} = await supabase.from('production_products').insert([data]));
            
            if(err) alert("Error saving product: " + err.message);
            else { loadProducts(); closeModal(); }
        };

        if(applyFiltersBtn) applyFiltersBtn.onclick = loadLogs;
        if(refreshBtn) refreshBtn.onclick = () => { loadLogs(); loadProducts(); };

        if(exportCsvBtn) exportCsvBtn.onclick = () => {
            if(!logsCache.length) return alert("No data to export");
            const csvRows = [['Log ID','Date','SKU','Product','Status','Crew','Target','Real Time','Diff (Secs)']];
            
            logsCache.forEach(l => {
                const crew = l.worker_count || 1;
                const target = l.current_target_seconds || Math.ceil((l.standard_time_seconds || 0) / crew);
                const real = l.final_time_seconds !== null ? l.final_time_seconds : 0;
                // Safely access sku if joined
                const prodSku = l.production_products?.sku || ''; 

                csvRows.push([
                    l.id,
                    new Date(l.start_time).toLocaleDateString(),
                    prodSku, // Added to export
                    `"${(l.production_products?.name || '').replace(/"/g, '""')}"`,
                    l.status,
                    l.worker_count,
                    target,
                    real,
                    target - real
                ].join(','));
            });
            
            const link = document.createElement("a");
            link.href = "data:text/csv;charset=utf-8," + encodeURI(csvRows.join("\n"));
            link.download = `report_wst_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
        };

        // UPDATED: Export Database Logic
        if(exportDbBtn) exportDbBtn.onclick = () => {
            if(!productsCache.length) return alert("No products in database to export");
            
            // Define Headers
            const csvRows = [['ID', 'SKU', 'Barcode', 'Product Name', 'Cases/Pallet', 'Units/Case', 'Std Time (Secs)', 'Net Value', 'UOM', 'Pkg Weight (g)', 'Case Weight (g)']];
            
            productsCache.forEach(p => {
                csvRows.push([
                    p.id,
                    p.sku || '',
                    p.barcode || '', // Include Barcode
                    `"${(p.name || '').replace(/"/g, '""')}"`,
                    p.cases_per_pallet || 0,
                    p.units_per_case || 0,
                    p.seconds_per_case || 0,
                    p.value_per_piece || 0,
                    p.unit_of_measure || '',
                    p.packaging_weight_g || 0,
                    p.case_weight_g || 0
                ].join(','));
            });
            
            const link = document.createElement("a");
            link.href = "data:text/csv;charset=utf-8," + encodeURI(csvRows.join("\n"));
            link.download = `database_master_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
        };
    }

    init();
})();

/* ================= FIN ARCHIVO: wst-data.js ================= */