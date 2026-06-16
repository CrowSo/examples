// js/outbound-analytics.js - V3.3 (UI Fixes & BOL Ghost Rows Removed)
(function () {
    // --- 1. INITIALIZATION CHECK ---
    if (document.body.dataset.oaModuleInitialized === "true") return;
    document.body.dataset.oaModuleInitialized = "true";

    console.log("Outbound Analytics V3.3 (Final Fixes) Initialized");

    if (!window.supabase) {
        console.error("Supabase client missing.");
        return;
    }

    const moduleContainer = document.querySelector('.out-analytics-container');
    if (!moduleContainer) return;

    // --- CONFIG & STATE ---
    const ORDERS_TABLE = 'client_orders';
    const CHANNEL_NAME = 'global_orders_tracker_v3';

    // Cache de Datos
    let allOrdersCache = [];

    // Instancias DataTables & Charts
    let historyTableInstance = null;
    let teamTableInstance = null;
    let chartVolumeInstance = null;
    let chartStatusInstance = null;
    let chartEfficiencyInstance = null;
    
    // Realtime Subs
    let realtimeSubscription = null;
    let realtimeDebounceTimer = null;

    // --- 2. DOM ELEMENTS SELECTOR ---
    function getElements() {
        return {
            container: moduleContainer,
            btnRefresh: document.getElementById('oa-refresh-btn'),
            tabs: moduleContainer.querySelectorAll('.oa-tab-button'),
            tabContents: moduleContainer.querySelectorAll('.oa-tab-content'),

            // Charts Canvases
            ctxVolume: document.getElementById('oaShipmentChart'),
            ctxStatus: document.getElementById('oaStatusChart'),
            ctxEfficiency: document.getElementById('oaEfficiencyChart'),

            // KPIs
            kpiOrders: document.getElementById('oa-kpi-orders'),
            kpiPallets: document.getElementById('oa-kpi-pallets'),
            kpiWeight: document.getElementById('oa-kpi-weight'),

            // Filters & Controls (History Tab)
            dateStart: document.getElementById('oa-date-start'),
            dateEnd: document.getElementById('oa-date-end'),
            historySearch: document.getElementById('oa-history-search'),
            btnApplyFilters: document.getElementById('oa-apply-filters'),
            btnExportCsv: document.getElementById('oa-export-csv'),

            // Tables
            tableHistoryEl: document.getElementById('oaHistoryTable'),
            tableTeamEl: document.getElementById('oaTeamTable'),

            // Modal Elements
            // Evidence Modal
            evidenceModal: document.getElementById('oaEvidenceModal'),
            closeEvidenceBtn: document.getElementById('oaCloseEvidenceModal'),
            closeEvidenceFooter: document.getElementById('oaCloseEvidenceFooter'),
            btnLinkToDocs: document.getElementById('oa-btn-link-to-docs'),
            
            evOrderCode: document.getElementById('oa-ev-order-code'),
            evStatusBadge: document.getElementById('oa-ev-status-badge'),
            evTransUnit: document.getElementById('oa-ev-trans-unit'),
            evTransPlate: document.getElementById('oa-ev-trans-plate'),
            evTransSeals: document.getElementById('oa-ev-trans-seals'),
            evPhotoGrid: document.getElementById('oa-ev-photo-grid'),

            // BOL Preview Modal
            bolModal: document.getElementById('oaBolPreviewModal'),
            bolRenderContainer: document.getElementById('oa-bol-render-container'),
            closeBolBtn: document.getElementById('oaCloseBolPreview'),
            closeBolFooter: document.getElementById('oa-btn-bol-modal-close'),
            btnBolPrint: document.getElementById('oa-btn-bol-modal-print'),
            btnBolDownload: document.getElementById('oa-btn-bol-modal-download'),
            btnLinkToEvidence: document.getElementById('oa-btn-link-to-evidence'),

            // Lightbox
            lightboxModal: document.getElementById('oaImageViewerModal'),
            lightboxImg: document.getElementById('oa-lightbox-img'),
            lightboxDownload: document.getElementById('oa-lightbox-download'),
            closeLightboxBtn: document.getElementById('oaCloseImageViewer')
        };
    }

    // --- 3. STARTUP LOGIC ---
    async function init() {
        const DOM = getElements();

        // Default Dates (Last 30 Days)
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        if (DOM.dateStart) DOM.dateStart.value = thirtyDaysAgo.toISOString().split('T')[0];
        if (DOM.dateEnd) DOM.dateEnd.value = today.toISOString().split('T')[0];

        setupTabs(DOM);
        setupEventListeners(DOM);
        setupDataTables(DOM);

        await loadData(DOM);
        subscribeToRealtime();

        // Evento de Limpieza
        document.addEventListener("moduleWillUnload", cleanupModule, { once: true });
    }

    function cleanupModule() {
        console.log("Cleaning up OA Module...");
        if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);

        if (chartVolumeInstance) chartVolumeInstance.destroy();
        if (chartStatusInstance) chartStatusInstance.destroy();
        if (chartEfficiencyInstance) chartEfficiencyInstance.destroy();

        if (historyTableInstance) {
            historyTableInstance.destroy();
            const table = document.getElementById('oaHistoryTable');
            if (table) table.innerHTML = '<thead><tr><th>Order #</th><th>Finish Date</th><th>Duration</th><th>Client</th><th>Items</th><th>Pallets</th><th>User</th><th>Status</th><th>View</th></tr></thead><tbody></tbody>';
        }
        if (teamTableInstance) {
            teamTableInstance.destroy();
            const table = document.getElementById('oaTeamTable');
            if (table) table.innerHTML = '<thead><tr><th>Rank</th><th>Operator / User</th><th>Orders Processed</th><th>Total Pallets</th><th>Last Active</th><th>Performance Rating</th></tr></thead><tbody></tbody>';
        }

        document.body.dataset.oaModuleInitialized = "false";
    }

    // --- 4. REAL-TIME INTELLIGENCE ---
    function subscribeToRealtime() {
        if (realtimeSubscription) return;

        console.log("Starting Global Analytics Realtime Engine...");

        realtimeSubscription = supabase
            .channel(CHANNEL_NAME)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: ORDERS_TABLE },
                (payload) => {
                    clearTimeout(realtimeDebounceTimer);
                    realtimeDebounceTimer = setTimeout(() => {
                        const DOM = getElements();
                        loadData(DOM, true);
                    }, 1000);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') console.log("Analytics: Connected to Stream");
            });
    }

    // --- 5. UI SETUP ---
    function setupTabs(DOM) {
        DOM.tabs.forEach(btn => {
            btn.onclick = () => {
                DOM.tabs.forEach(t => t.classList.remove('active'));
                DOM.tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const target = document.getElementById(btn.dataset.tab);
                if (target) target.classList.add('active');

                setTimeout(() => {
                    if (btn.dataset.tab === 'oa-tab-history' && historyTableInstance) {
                        historyTableInstance.columns.adjust().draw();
                    }
                    if (btn.dataset.tab === 'oa-tab-team' && teamTableInstance) {
                        teamTableInstance.columns.adjust().draw();
                    }
                }, 150);
            };
        });
    }

    function setupDataTables(DOM) {
        const historyDom = 't<"oa-dt-footer"ip>';

        // A. History Table (Master History)
        if ($.fn.DataTable.isDataTable(DOM.tableHistoryEl)) $(DOM.tableHistoryEl).DataTable().destroy();

        historyTableInstance = $(DOM.tableHistoryEl).DataTable({
            dom: historyDom,
            responsive: false,
            scrollY: '60vh',
            scrollCollapse: true,
            paging: true,
            pageLength: 25,
            order: [[1, "desc"]],
            columns: [
                { data: 'unique_order_code', render: d => `<span style="font-weight:700; color:var(--oa-primary); font-family:monospace; letter-spacing:0.5px;">${d}</span>` },
                {
                    data: 'completed_at',
                    render: (d, t, r) => {
                        const dateToUse = d || r.created_at;
                        return dateToUse ? new Date(dateToUse).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
                    }
                },
                {
                    data: null,
                    render: (row) => calculateDurationHtml(row.started_at, row.completed_at)
                },
                {
                    data: 'client_name',
                    width: "15%",
                    render: d => `<span style="font-weight:600; color:#444;">${formatClientName(d)}</span>`
                },
                { data: 'item_count', className: "dt-center" }, 
                { data: 'total_pallets', className: "dt-center", render: d => `<span style="font-weight:700;">${Math.ceil(d)}</span>` },
                { data: 'processed_by', render: d => d ? d.split('@')[0] : 'System' },
                {
                    data: 'status',
                    className: "dt-center",
                    render: s => {
                        let cls = 'badge-pending';
                        if (s === 'shipped') cls = 'badge-shipped';
                        else if (s === 'archived') cls = 'badge-archived';
                        else if (s === 'processing') cls = 'badge-processing';
                        else if (s === 'loading' || s === 'ready_to_load') cls = 'badge-loading';
                        return `<span class="oa-badge ${cls}">${s.toUpperCase()}</span>`;
                    }
                },
                {
                    data: null,
                    orderable: false,
                    className: "dt-center",
                    render: (row) => {
                        const rowStr = encodeURIComponent(JSON.stringify(row));
                        const hasDocs = ['shipped', 'completed', 'archived'].includes(row.status);
                        
                        if(!hasDocs) return '<span style="color:#aaa; font-size:0.8rem;">-</span>';

                        return `
                            <div class="oa-actions-flex">
                                <button class="btn-oa-split-docs" onclick="window.oaViewDocs('${rowStr}')" title="View BOL">
                                    <i class='bx bxs-file-pdf'></i> Docs
                                </button>
                                <button class="btn-oa-split-photos" onclick="window.oaViewEvidence('${rowStr}')" title="View Photos">
                                    <i class='bx bxs-camera'></i> Photos
                                </button>
                            </div>
                        `;
                    }
                }
            ],
            language: { emptyTable: "No records found in this date range." }
        });

        // B. Team Ranking Table
        if ($.fn.DataTable.isDataTable(DOM.tableTeamEl)) $(DOM.tableTeamEl).DataTable().destroy();

        teamTableInstance = $(DOM.tableTeamEl).DataTable({
            dom: 't',
            paging: false,
            scrollY: '55vh',
            scrollCollapse: true,
            order: [[2, "desc"]],
            columns: [
                { data: 'rank', width: "10%", className: "dt-center" }, 
                { data: 'user', width: "30%" }, 
                { data: 'orders', width: "25%" }, 
                { data: 'pallets', className: "dt-center", width: "15%", render: d => `<span style="font-weight:700; color:var(--oa-primary);">${d}</span>` },
                { data: 'last_active', width: "10%", className: "dt-center", render: d => d ? new Date(d).toLocaleDateString() : '-' },
                { data: 'rating', width: "10%", className: "dt-center" }
            ]
        });
    }

    // --- 6. DATA FETCHING ---
    async function loadData(DOM, silentMode = false) {
        if (!silentMode && DOM.btnRefresh) DOM.btnRefresh.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Syncing...";

        try {
            const { data, error } = await supabase
                .from(ORDERS_TABLE)
                .select(`
                    *,
                    production_products (id, name, sku, cases_per_pallet, units_per_case, value_per_piece, unit_of_measure, packaging_weight_g, case_weight_g),
                    profiles (email, address, city, state, zip)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            allOrdersCache = processOrdersData(data || []);

            renderDashboard(allOrdersCache, DOM);
            renderHistoryTable(allOrdersCache, DOM);
            renderTeamStats(allOrdersCache, DOM);

        } catch (err) {
            console.error("OA Data Error:", err);
        } finally {
            if (!silentMode && DOM.btnRefresh) DOM.btnRefresh.innerHTML = "<i class='bx bx-refresh'></i> Refresh";
        }
    }

    function processOrdersData(rawData) {
        const groups = {};
        rawData.forEach(row => {
            const code = row.unique_order_code;
            if (!groups[code]) {
                groups[code] = {
                    ...row,
                    items: [],
                    total_pallets: 0,
                    total_weight: 0,
                    client_name: row.profiles?.email || 'Unknown Client',
                    client_data: row.profiles
                };
            }

            const pallets = parseFloat(row.qty_calculated_pallets || 0);
            const weight = calculateWeightLbs(row.production_products, row.qty_calculated_cases);

            groups[code].items.push({
                ...row, 
                product: row.production_products,
                qty_cases: row.qty_calculated_cases,
                qty_pallets: pallets,
                weight_lbs: weight
            });

            groups[code].total_pallets += pallets;
            groups[code].total_weight += weight;
        });
        return Object.values(groups);
    }

    // --- 7. HELPERS ---
    function calculateDurationHtml(start, end) {
        if (!start || !end) return '<span style="color:#ccc">--</span>';
        const ms = new Date(end) - new Date(start);
        if (ms < 0) return '--';

        const hrs = Math.floor(ms / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        const totalMins = (hrs * 60) + mins;

        let timeStr = "";
        if (hrs === 0) timeStr = `${mins}m`;
        else timeStr = `${hrs}h ${mins}m`;

        let colorClass = "text-normal";
        if (totalMins < 45) colorClass = "text-fast";
        else if (totalMins > 240) colorClass = "text-slow";

        return `<span class="${colorClass}">${timeStr}</span>`;
    }

    function formatClientName(email) {
        if (!email || !email.includes('@')) return email || 'Unknown';
        const namePart = email.split('@')[0];
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    function calculateWeightLbs(product, totalCases) {
        if (!product || !totalCases) return 0;
        let net = parseFloat(product.value_per_piece) || 0;
        if ((product.unit_of_measure || 'g').toLowerCase() === 'kg') net *= 1000;
        else if ((product.unit_of_measure || 'g').toLowerCase() === 'l') net *= 1000;
        const itemWeightG = net + (parseFloat(product.packaging_weight_g) || 0);
        const caseWeightG = (itemWeightG * (product.units_per_case || 1)) + (parseFloat(product.case_weight_g) || 0);
        return (caseWeightG * totalCases) * 0.00220462;
    }

    // --- 8. RENDERERS ---
    function renderDashboard(orders, DOM) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentOrders = orders.filter(o => new Date(o.created_at) >= thirtyDaysAgo);

        DOM.kpiOrders.textContent = recentOrders.length.toLocaleString();
        DOM.kpiPallets.textContent = Math.round(recentOrders.reduce((s, o) => s + o.total_pallets, 0)).toLocaleString();
        DOM.kpiWeight.textContent = Math.round(recentOrders.reduce((s, o) => s + o.total_weight, 0)).toLocaleString();

        const volumeMap = {};
        const statusMap = { pending: 0, processing: 0, loading: 0, shipped: 0, archived: 0 };
        const efficiencyMap = {};

        recentOrders.forEach(o => {
            const dateKey = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            volumeMap[dateKey] = (volumeMap[dateKey] || 0) + o.total_pallets;
            let s = (o.status || 'pending').toLowerCase();
            if (s === 'ready_to_load') s = 'loading';
            if (statusMap[s] !== undefined) statusMap[s]++;
            else if (s === 'completed') statusMap['shipped']++;

            if (o.started_at && o.completed_at) {
                const mins = (new Date(o.completed_at) - new Date(o.started_at)) / 60000;
                if (mins > 0 && mins < 2880) {
                    if (!efficiencyMap[dateKey]) efficiencyMap[dateKey] = { total: 0, count: 0 };
                    efficiencyMap[dateKey].total += mins;
                    efficiencyMap[dateKey].count++;
                }
            }
        });

        const labels = Object.keys(volumeMap).sort((a, b) => new Date(a + " " + new Date().getFullYear()) - new Date(b + " " + new Date().getFullYear()));
        const volData = labels.map(l => volumeMap[l]);
        const effData = labels.map(l => efficiencyMap[l] ? Math.round(efficiencyMap[l].total / efficiencyMap[l].count) : 0);

        renderVolumeChart(DOM.ctxVolume, labels, volData);
        renderStatusChart(DOM.ctxStatus, statusMap);
        renderEfficiencyChart(DOM.ctxEfficiency, labels, effData);
    }

    function renderVolumeChart(ctx, labels, data) {
        if (!ctx) return;
        if (chartVolumeInstance) chartVolumeInstance.destroy();
        chartVolumeInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: 'Pallets', data: data, backgroundColor: 'rgba(14, 44, 76, 0.85)', borderRadius: 4, maxBarThickness: 40 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' } }, x: { grid: { display: false } } } }
        });
    }
    function renderStatusChart(ctx, statusMap) {
        if (!ctx) return;
        if (chartStatusInstance) chartStatusInstance.destroy();
        chartStatusInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Pending', 'Processing', 'Loading', 'Shipped', 'Archived'],
                datasets: [{ data: [statusMap.pending, statusMap.processing, statusMap.loading, statusMap.shipped, statusMap.archived], backgroundColor: ['#f59e0b', '#3b82f6', '#f97316', '#10b981', '#9ca3af'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } }
        });
    }
    function renderEfficiencyChart(ctx, labels, data) {
        if (!ctx) return;
        if (chartEfficiencyInstance) chartEfficiencyInstance.destroy();
        chartEfficiencyInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: [{ label: 'Avg Mins', data: data, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4, pointRadius: 3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' } }, x: { display: false } } }
        });
    }

    function renderHistoryTable(allOrders, DOM) {
        if (!historyTableInstance) return;

        const start = DOM.dateStart.value;
        const end = DOM.dateEnd.value;
        const search = DOM.historySearch ? DOM.historySearch.value.toLowerCase().trim() : "";

        const finalData = allOrders.filter(o => {
            const d = (o.completed_at || o.created_at).split('T')[0];
            const inDate = (!start || d >= start) && (!end || d <= end);

            const client = formatClientName(o.client_name).toLowerCase();
            const code = o.unique_order_code.toLowerCase();
            const user = (o.processed_by || '').toLowerCase();
            const inSearch = !search || client.includes(search) || code.includes(search) || user.includes(search);

            return inDate && inSearch;
        });
        
        const tableRows = finalData.map(o => ({
            ...o, 
            item_count: o.items.length
        }));

        historyTableInstance.clear().rows.add(tableRows).draw();
    }

    function renderTeamStats(orders, DOM) {
        if (!teamTableInstance) return;

        const stats = {};
        orders.forEach(o => {
            if (o.processed_by) {
                const user = o.processed_by.split('@')[0];
                if (o.status === 'shipped' || o.status === 'archived' || o.status === 'completed') {
                    if (!stats[user]) stats[user] = { user, orders: 0, pallets: 0, last_active: o.completed_at || o.updated_at };
                    stats[user].orders++;
                    stats[user].pallets += o.total_pallets;
                    const activeTime = o.completed_at || o.updated_at;
                    if (activeTime && new Date(activeTime) > new Date(stats[user].last_active)) stats[user].last_active = activeTime;
                }
            }
        });

        const sortedStats = Object.values(stats).sort((a, b) => b.orders - a.orders);
        const maxOrders = sortedStats.length > 0 ? sortedStats[0].orders : 1;

        const rows = sortedStats.map((s, index) => {
            const rank = index + 1;
            let rankHtml = `<span class="rank-badge rank-other">#${rank}</span>`;
            if (rank === 1) rankHtml = `<span class="rank-badge rank-1">1</span>`;
            else if (rank === 2) rankHtml = `<span class="rank-badge rank-2">2</span>`;
            else if (rank === 3) rankHtml = `<span class="rank-badge rank-3">3</span>`;

            const userHtml = `
                <div class="user-cell-content">
                    <i class='bx bxs-user-circle' style="font-size:1.6rem;color:var(--oa-text-light);"></i>
                    <span style="font-weight:600; font-size:0.9rem;">${s.user}</span>
                </div>
            `;

            const percentage = Math.round((s.orders / maxOrders) * 100);
            const ordersHtml = `
                <div style="display:flex; flex-direction:column; justify-content:center;">
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:700;">
                        <span>${s.orders} Orders</span>
                        <span style="color:#aaa;">${percentage}%</span>
                    </div>
                    <div class="bar-container">
                        <div class="activity-bar" style="width:${percentage}%"></div>
                    </div>
                </div>
            `;

            let color = '#ccc', label = '-';
            if (s.orders >= 50) { color = '#10b981'; label = 'Elite'; }
            else if (s.orders >= 20) { color = '#3b82f6'; label = 'Pro'; }
            else { color = '#f59e0b'; label = 'Rookie'; }
            const ratingHtml = `<span style="color:${color};font-weight:bold;font-size:0.8rem;">${label}</span>`;

            return {
                rank: rankHtml,
                user: userHtml,
                orders: ordersHtml,
                pallets: Math.ceil(s.pallets),
                last_active: s.last_active,
                rating: ratingHtml
            };
        });

        teamTableInstance.clear().rows.add(rows).draw();
    }

    function exportToCSV(DOM) {
        const start = DOM.dateStart.value;
        const end = DOM.dateEnd.value;

        const filteredForReport = allOrdersCache.filter(o => {
            const d = (o.completed_at || o.created_at).split('T')[0];
            return (!start || d >= start) && (!end || d <= end);
        });

        if (filteredForReport.length === 0) {
            alert("No records found in the selected date range.");
            return;
        }

        let csv = 'Order Code,Date,Time Start,Time End,Duration,Status,Client,User,Transport Unit,Plates,Seals,SKU,Product Name,Line Pallets,Line Cases,Line Weight (Lbs)\n';

        filteredForReport.forEach(o => {
            const dateStr = o.completed_at ? new Date(o.completed_at).toLocaleDateString() : 'N/A';
            const timeStart = o.started_at ? new Date(o.started_at).toLocaleTimeString() : '-';
            const timeEnd = o.completed_at ? new Date(o.completed_at).toLocaleTimeString() : '-';

            let durationStr = '-';
            if (o.started_at && o.completed_at) {
                const ms = new Date(o.completed_at) - new Date(o.started_at);
                const hrs = Math.floor(ms / 3600000);
                const mins = Math.floor((ms % 3600000) / 60000);
                durationStr = `${hrs}h ${mins}m`;
            }

            const client = formatClientName(o.client_name).replace(/,/g, '');
            const user = o.processed_by ? o.processed_by.split('@')[0] : 'System';
            const unit = (o.transport_unit || '').replace(/,/g, ' ');
            const plates = (o.transport_plates || '').replace(/,/g, ' ');
            const seals = (o.transport_seals || '').replace(/,/g, ' ');

            if (o.items && o.items.length > 0) {
                o.items.forEach(item => {
                    const sku = item.product?.sku || 'N/A';
                    const prodName = (item.product?.name || 'Unknown').replace(/,/g, ' ');
                    const pallets = item.qty_pallets || 0;
                    const cases = item.qty_cases || 0;
                    const weight = (item.weight_lbs || 0).toFixed(2);

                    csv += `${o.unique_order_code},${dateStr},${timeStart},${timeEnd},${durationStr},${o.status},${client},${user},${unit},${plates},${seals},${sku},${prodName},${pallets},${cases},${weight}\n`;
                });
            } else {
                csv += `${o.unique_order_code},${dateStr},${timeStart},${timeEnd},${durationStr},${o.status},${client},${user},${unit},${plates},${seals},--,--,0,0,0\n`;
            }
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Detailed_Report_${start}_to_${end}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // --- MODAL FUNCTIONS & LOGIC ---

    // 1. BOL PREVIEW LOGIC
    window.oaViewDocs = function (rowBase64) {
        const DOM = getElements();
        const row = JSON.parse(decodeURIComponent(rowBase64));

        DOM.bolRenderContainer.innerHTML = renderBolHtml(row);

        DOM.closeBolBtn.onclick = () => DOM.bolModal.classList.remove('open');
        DOM.closeBolFooter.onclick = () => DOM.bolModal.classList.remove('open');
        
        DOM.btnBolPrint.onclick = () => {
            const content = DOM.bolRenderContainer.innerHTML;
            const win = window.open("", "", "height=700,width=900");
            win.document.write("<html><head><title>Print BOL</title></head><body>");
            win.document.write(content);
            win.document.write("</body></html>");
            win.document.close();
            win.print();
        };

        DOM.btnBolDownload.onclick = () => downloadBolPdf(row);

        DOM.btnLinkToEvidence.onclick = () => {
            DOM.bolModal.classList.remove('open');
            setTimeout(() => window.oaViewEvidence(rowBase64), 200);
        };

        DOM.bolModal.classList.add('open');
    };

    // 2. EVIDENCE LOGIC
    window.oaViewEvidence = function (rowBase64) {
        const DOM = getElements();
        const row = JSON.parse(decodeURIComponent(rowBase64));

        DOM.evOrderCode.textContent = row.unique_order_code;
        DOM.evStatusBadge.className = `oa-badge badge-${row.status}`;
        DOM.evStatusBadge.textContent = row.status.toUpperCase();
        
        DOM.evTransUnit.textContent = row.transport_unit || "--";
        DOM.evTransPlate.textContent = row.transport_plates || "--";
        DOM.evTransSeals.textContent = row.transport_seals || "--";

        DOM.evPhotoGrid.innerHTML = "";
        if (row.evidence_photos && row.evidence_photos.length > 0) {
            row.evidence_photos.forEach(url => {
                const d = document.createElement('div');
                d.className = 'photo-thumb';
                d.innerHTML = `
                    <img src="${url}">
                    <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.5); padding:5px; text-align:right;">
                        <i class='bx bx-zoom-in' style="color:white; font-size:1.2rem;"></i>
                    </div>
                `;
                d.onclick = () => window.oaOpenLightbox(url);
                DOM.evPhotoGrid.appendChild(d);
            });
        } else {
            DOM.evPhotoGrid.innerHTML = `<p style="grid-column:1/-1; color:#999; text-align:center;">No photos uploaded.</p>`;
        }

        DOM.closeEvidenceBtn.onclick = () => DOM.evidenceModal.classList.remove('open');
        DOM.closeEvidenceFooter.onclick = () => DOM.evidenceModal.classList.remove('open');
        
        DOM.btnLinkToDocs.onclick = () => {
            DOM.evidenceModal.classList.remove('open');
            setTimeout(() => window.oaViewDocs(rowBase64), 200);
        };

        DOM.evidenceModal.classList.add('open');
    };

    // 3. LIGHTBOX LOGIC
    window.oaOpenLightbox = function(url) {
        const DOM = getElements();
        DOM.lightboxImg.src = url;
        DOM.lightboxDownload.href = url;
        DOM.lightboxModal.classList.add('open');
    };
    
    // --- [MODIFIED] BOL RENDER ENGINE (NO GHOST ROWS) ---
    function renderBolHtml(row) {
        const bolNumber = row.bol_number || `PENDING-${row.unique_order_code}`;
        const client = row.client_data || {};
        const fullAddress = `${client.address || ""}<br>${client.city || ""}, ${client.state || ""} ${client.zip || ""}`;
        const clientEmail = client.email ? client.email.split("@")[0].toUpperCase() : "CLIENT";
        const dateObj = row.completed_at ? new Date(row.completed_at) : new Date();
        const todayDate = dateObj.toLocaleDateString("en-US");

        const styles = `
            <style>
                .hoja { width: 100%; background: white; margin: 0; position: relative; box-sizing: border-box; overflow: hidden; }
                .negrita{font-weight:bold}.centro{text-align:center;justify-content:center;display:flex;align-items:center}.texto-fino{font-size:11px;line-height:1.2}.texto-mini{font-size:8px;line-height:1.1;text-align:justify}.header-gris{background-color:#e0e0e0;font-weight:bold;font-size:10px;text-transform:uppercase;padding:3px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid black;width:100%}.celda-sup,.celda-orden,.celda-carrier,.celda-firma{border-right:1px solid black;border-bottom:1px solid black;padding:3px;display:flex;flex-direction:column;overflow:hidden}.fin-fila{border-right:none!important}.titulo-pagina{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;font-weight:bold;padding:0 5px}.titulo-texto{font-size:18px;text-align:center;width:100%;margin-left:60px}.paginacion{font-size:12px;white-space:nowrap}.bloque-superior{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:90px 90px 60px 100px;border:1px solid black;border-bottom:none;box-sizing:border-box}.contenido-celda{padding:5px;flex-grow:1}.celda-partida{padding:0!important}.mitad-arriba{width:100%;height:55%;display:flex;flex-direction:column;align-items:center;justify-content:center;border-bottom:1px solid black;font-size:10px;text-align:center;padding:2px;box-sizing:border-box}.mitad-abajo{width:100%;height:45%;display:flex;align-items:center;justify-content:center;font-size:9px;text-align:center;padding:2px}.bloque-orden{display:grid;grid-template-columns:2.5fr 0.8fr 1fr 0.4fr 0.4fr 3fr;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;box-sizing:border-box}.span-2{grid-column:span 2}.span-3{grid-column:span 3}.span-all{grid-column:1 / -1}.fondo-gris-claro{background-color:#f2f2f2}.bloque-carrier{display:grid;grid-template-columns:0.5fr 0.8fr 0.5fr 0.8fr 1fr 0.4fr 4fr 1fr 0.8fr;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;box-sizing:border-box}.col-desc{flex-direction:column;justify-content:flex-start;text-align:center}.span-handling{grid-column:span 2}.span-package{grid-column:span 2}.span-middle{grid-column:span 3}.span-ltl{grid-column:span 2}.align-left{justify-content:flex-start;text-align:left;padding-left:5px}.bloque-legal{display:flex;justify-content:space-between;align-items:center;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;padding:5px 10px;font-size:10px;min-height:40px;box-sizing:border-box}.legal-izq{width:58%;text-align:justify;line-height:1.2}.legal-der{width:40%;display:flex;flex-direction:column;padding-left:10px}.underlined{border-bottom:1px solid black;display:inline-block;width:60px}.bloque-firmas{display:grid;grid-template-columns:4fr 1fr 2.5fr 2.5fr;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;font-size:10px;box-sizing:border-box}.span-mitad-izq{grid-column:span 2}.span-mitad-der{grid-column:span 2}.titulo-nota{background-color:white;font-weight:bold;font-size:10px;text-align:center;padding:5px;border-bottom:1px solid black}.check-item{margin-bottom:3px;display:block}
            </style>
        `;

        let totalPallets = 0;
        let totalWeight = 0;
        const itemRows = [];

        row.items.forEach(item => {
            const actualPallets = Math.ceil(item.qty_calculated_pallets || item.qty_pallets);
            const actualCases = actualPallets * (item.product?.cases_per_pallet || 1);
            const weightLbs = calculateWeightLbs(item.product, actualCases);
            totalPallets += actualPallets;
            totalWeight += weightLbs;
            itemRows.push({
                palletQty: actualPallets,
                palletType: "Pallet",
                caseQty: actualCases,
                caseType: "Cases",
                weight: weightLbs,
                desc: item.product?.name || "Item",
                nmfc: ""
            });
        });

        const ITEMS_PER_PAGE = 8;
        const totalPages = Math.ceil(itemRows.length / ITEMS_PER_PAGE);
        let pagesHtml = "";

        for (let i = 0; i < totalPages; i++) {
            const pageItems = itemRows.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE);
            let rowsHtml = pageItems.map(r => `
                <div class="celda-carrier align-left">${r.palletQty || ""}</div>
                <div class="celda-carrier align-left">${r.palletType || ""}</div>
                <div class="celda-carrier align-left">${r.caseQty || ""}</div>
                <div class="celda-carrier align-left">${r.caseType || ""}</div>
                <div class="celda-carrier align-left">${r.weight ? Math.round(r.weight).toLocaleString() : ""}</div>
                <div class="celda-carrier"></div>
                <div class="celda-carrier align-left">${r.desc || ""}</div>
                <div class="celda-carrier">${r.nmfc || ""}</div>
                <div class="celda-carrier fin-fila"></div>
            `).join("");

            const pageBreak = i < totalPages - 1 ? 'style="page-break-after: always;"' : "";
            pagesHtml += `
                <div class="hoja" ${pageBreak}>
                    <div class="titulo-pagina">
                        <div class="titulo-texto">BILL OF LADING</div>
                        <div class="paginacion">Page ${i + 1} of ${totalPages}</div>
                    </div>
                    <div class="bloque-superior texto-fino">
                        <div class="celda-sup" style="border-right:1px solid black; border-bottom:1px solid black;">
                            <div class="header-gris">SHIP FROM</div>
                            <div class="contenido-celda">
                                <strong>Goldmex International</strong><br>
                                Blvd. Gustavo Diaz Ordaz 2221<br>
                                Balcon las Huertas 22116 Tijuana B.C.
                            </div>
                        </div>
                        <div class="celda-sup centro" style="border-bottom:1px solid black;">
                            <strong>Bill of Lading Number:</strong><br>
                            <span style="font-size: 14px; margin-top: 5px;">${bolNumber}</span>
                        </div>
                        <div class="celda-sup" style="border-right:1px solid black; border-bottom:1px solid black;">
                            <div class="header-gris">SHIP TO</div>
                            <div class="contenido-celda">
                                <strong>${clientEmail}</strong><br>
                                ${fullAddress}
                            </div>
                        </div>
                        <div class="celda-sup" style="border-bottom:1px solid black; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                            <div><strong>Trailer:</strong> ${row.transport_unit || "--"}</div>
                            <div><strong>Container:</strong> ${row.transport_plates || "--"}</div>
                            <div><strong>Seals:</strong> ${row.transport_seals || "--"}</div>
                        </div>
                        <div class="celda-sup" style="border-right:1px solid black; border-bottom:1px solid black;">
                            <div class="header-gris">THIRD PARTY FREIGHT CHARGES BILL TO</div>
                            <div class="contenido-celda"></div>
                        </div>
                        <div class="celda-sup" style="border-bottom:1px solid black;"></div>
                        <div class="celda-sup contenido-celda" style="border-right:1px solid black;">
                            <strong>Special Instructions:</strong><br>
                            ${row.notes || ""}
                        </div>
                        <div class="celda-sup celda-partida">
                            <div class="mitad-arriba">
                                <span class="negrita" style="margin-bottom: 3px;">Freight Charge Terms (Freight charges are prepaid unless marked otherwise):</span>
                                <div style="width: 100%; display: flex; justify-content: space-around; margin-top: 2px;">
                                    <span>Prepaid</span><span>Collect</span><span>3rd Party</span>
                                </div>
                            </div>
                            <div class="mitad-abajo">
                                () Master bill of lading with attached underlying bills of lading.
                            </div>
                        </div>
                    </div>
                    <div class="bloque-orden texto-fino">
                        <div class="celda-orden span-all header-gris fin-fila">CUSTOMER ORDER INFORMATION</div>
                        <div class="celda-orden negrita centro">Customer Order No.</div>
                        <div class="celda-orden negrita centro"># of<br>Pallets</div>
                        <div class="celda-orden negrita centro">Weight</div>
                        <div class="celda-orden negrita centro span-2">Pallet/Slip<br>(circle one)</div>
                        <div class="celda-orden negrita centro fin-fila">Additional Shipper Information</div>
                        <div class="celda-orden centro" style="height: 30px;">${row.unique_order_code}</div>
                        <div class="celda-orden centro">${totalPallets}</div>
                        <div class="celda-orden centro">${Math.round(totalWeight).toLocaleString()} (LBS)</div>
                        <div class="celda-orden centro">Y</div>
                        <div class="celda-orden centro">N</div>
                        <div class="celda-orden fin-fila"></div>
                        <div class="celda-orden negrita centro">Grand Total</div>
                        <div class="celda-orden fondo-gris-claro"></div>
                        <div class="celda-orden fondo-gris-claro"></div>
                        <div class="celda-orden span-3 fondo-gris-claro fin-fila"></div> 
                    </div>
                    <div class="bloque-carrier texto-fino">
                        <div class="celda-carrier span-all header-gris fin-fila">CARRIER INFORMATION</div>
                        <div class="celda-carrier negrita span-handling">Handling Unit</div>
                        <div class="celda-carrier negrita span-package">Package</div>
                        <div class="celda-carrier span-middle"></div>
                        <div class="celda-carrier negrita span-ltl fin-fila">LTL Only</div>
                        <div class="celda-carrier negrita">Qty</div>
                        <div class="celda-carrier negrita">Type</div>
                        <div class="celda-carrier negrita">Qty</div>
                        <div class="celda-carrier negrita">Type</div>
                        <div class="celda-carrier negrita">Weight<br>( LBS )</div>
                        <div class="celda-carrier negrita">HM (X)</div>
                        <div class="celda-carrier col-desc negrita">
                            Commodity Description
                            <span class="texto-mini" style="font-weight: normal;">
                                Commodities requiring special or additional care or attention in handling or stowing must be so marked and packaged as to ensure safe transportation with ordinary care. See Section 2(e) of NMFC item 360
                            </span>
                        </div>
                        <div class="celda-carrier negrita">NMFC No.</div>
                        <div class="celda-carrier negrita fin-fila">Class</div>
                        ${rowsHtml}
                    </div>
                    <div class="bloque-legal">
                        <div class="legal-izq">
                            Where the rate is dependent on value, shippers are required to state specifically in writing the agreed
                            or declared value of the property as follows: “The agreed or declared value of the property is
                            specifically stated by the shipper to be not exceeding ________ per ________.”
                        </div>
                        <div class="legal-der">
                            <div style="margin-bottom: 5px;">
                                <strong>COD Amount: $</strong> 
                            </div>
                            <div>
                                Fee terms: Collect ( ) &nbsp; Prepaid ( ) &nbsp; Customer check acceptable ( )
                            </div>
                        </div>
                    </div>
                    <div class="bloque-firmas">
                        <div class="celda-firma span-all titulo-nota fin-fila">
                            Note: Liability limitation for loss or damage in this shipment may be applicable. See 49 USC § 14706(c)(1)(A) and (B).
                        </div>
                        <div class="celda-firma span-mitad-izq">
                            <p class="texto-mini" style="margin: 0; font-size: 10px; line-height: 1.25;">
                                Received, subject to individually determined rates or contracts that have been agreed upon in writing between the carrier and shipper, if applicable, otherwise to the rates, classifications, and rules that have been established by the carrier and are available to the shipper, on request, and to all applicable state and federal regulations.
                            </p>
                        </div>
                        <div class="celda-firma span-mitad-der fin-fila" style="justify-content: space-between;">
                            <div class="centro" style="padding: 5px;">
                                The carrier shall not make delivery of this shipment without payment of charges and all other lawful fees.
                            </div>
                            <div style="font-weight: bold; padding: 5px;">
                                Shipper Signature
                            </div>
                        </div>
                        <div class="celda-firma">
                            <div class="negrita" style="margin-bottom: 10px;">Shipper Signature/Date</div>
                            <p class="texto-mini" style="font-size: 10px; line-height: 1.2;">
                                This is to certify that the above named materials are properly classified, packaged, marked, and labeled, and are in proper condition for transportation according to the applicable regulations of the DOT.
                            </p>
                        </div>
                        <div class="celda-firma">
                            <div class="negrita centro">Trailer Loaded:</div>
                            <div style="margin-top: 5px;">
                                <span class="check-item">() By shipper</span>
                                <span class="check-item">() By driver</span>
                            </div>
                        </div>
                        <div class="celda-firma">
                            <div class="negrita centro">Freight Counted:</div>
                            <div style="margin-top: 5px;">
                                <span class="check-item">() By shipper</span>
                                <span class="check-item">() By driver/pallets said to contain</span>
                                <span class="check-item">() By driver/pieces</span>
                            </div>
                        </div>
                        <div class="celda-firma fin-fila">
                            <div class="negrita" style="margin-bottom: 5px;">Carrier Signature/Pickup Date</div>
                            <div style="color: #999; font-size: 10px; margin-bottom: 5px;">${todayDate}</div>
                            <p class="texto-mini">
                                Carrier acknowledges receipt of packages and required placards. Carrier certifies emergency response information was made available and/or carrier has the DOT emergency response guidebook or equivalent documentation in the vehicle. <strong>Property described above is received in good order, except as noted.</strong>
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }
        return styles + pagesHtml;
    }

    function downloadBolPdf(row) {
        const element = document.getElementById("oa-bol-render-container");
        const opt = {
            margin: 0,
            filename: `BOL-${row.unique_order_code}.pdf`,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false,
                letterRendering: true,
            },
            jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        };
        html2pdf().set(opt).from(element).save();
    }

    function setupEventListeners(DOM) {
        if (DOM.btnRefresh) DOM.btnRefresh.onclick = () => loadData(DOM);
        if (DOM.btnApplyFilters) DOM.btnApplyFilters.onclick = () => renderHistoryTable(allOrdersCache, DOM);

        if (DOM.historySearch) DOM.historySearch.onkeyup = (e) => {
            if (e.key === 'Enter') renderHistoryTable(allOrdersCache, DOM);
        };

        if (DOM.btnExportCsv) DOM.btnExportCsv.onclick = () => exportToCSV(DOM);

        if (DOM.closeLightboxBtn) DOM.closeLightboxBtn.onclick = () => DOM.lightboxModal.classList.remove('open');

        // Safety Reconnection on Tab Focus
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                if (!realtimeSubscription || realtimeSubscription.state === 'closed' || realtimeSubscription.state === 'errored') {
                    console.log("Re-activating zombie subscription...");
                    if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
                    realtimeSubscription = null;
                    subscribeToRealtime();
                }
                loadData(DOM, true);
            }
        });
    }

    // Init
    init();
})();