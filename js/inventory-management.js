// js/inventory-management.js
// V8.8 - Fixed: "Planned" status visualization logic.
// Uses explicit order status from DB as a visual fallback for planning stage.

(() => {
  // --- 1. INITIALIZATION & SAFETY CHECKS ---
  if (document.body.dataset.inventoryModuleInitialized === "true") return;
  document.body.dataset.inventoryModuleInitialized = "true";
  console.log("Inventory Management V8.8 Loaded - Status Logic Fixed.");

  if (typeof supabase === "undefined" || !supabase) {
    console.error("Supabase client is not available.");
    return;
  }

  // --- CONFIGURATION ---
  const PRODUCTION_TABLE = "production_log";
  const PRODUCTS_TABLE = "production_products";
  const RAW_INVENTORY_TABLE = "raw_inventory";
  const ORDERS_TABLE = "client_orders";
  const LINES_TABLE = "warehouse_lines";
  const TICKETS_TABLE = "job_tickets";
  const ACTIVE_STATUS = "completed";

  // --- STATE VARIABLES ---
  let currentUserInv = null;

  // Data Tables
  let inventoryTableInstance = null;
  let rawTableInstance = null;
  let kardexTableInstance = null;
  let rawHistoryTableInstance = null;

  // Data Caches
  let activeRawData = [];
  let historyRawData = [];
  let allInventoryData = [];
  let currentKardexData = [];

  // Context vars
  let currentPalletData = null;
  let currentRawData = null;
  let currentPcpStats = { total: 0, assigned: 0, remaining: 0 };
  let inventorySubscription = null;
  let rawInventorySubscription = null;

  // --- DOM ELEMENTS ---
  const tabButtons = document.querySelectorAll(".inv-tab-button");
  const tabContents = document.querySelectorAll(".inv-tab-content");
  const headerKardexWidget = document.getElementById(
    "headerKardexSearchWidget",
  );
  const btnExportMain = document.getElementById("inv-export-btn");

  // Tab 1: Raw Materials (Planning)
  const rawTableElement = document.getElementById("rawInventoryTable");
  const invRawTotalCount = document.getElementById("inv-raw-total-count");
  const invRawPendingCount = document.getElementById("inv-raw-pending-count");

  // Raw Filters
  const rawFilterSearch = document.getElementById("rawFilterSearch");
  const rawFilterClient = document.getElementById("rawFilterClient");
  const rawFilterProduct = document.getElementById("rawFilterProduct");
  const rawFilterStatus = document.getElementById("rawFilterStatus");
  const btnRawFilter = document.getElementById("rawApplyFiltersBtn");
  const btnOpenRawHistory = document.getElementById("btnOpenRawHistory");

  // Raw History Modal
  const rawHistoryModal = document.getElementById("invRawHistoryModal");
  const closeRawHistoryBtn = document.getElementById("closeRawHistoryBtn");
  const closeRawHistoryFooterBtn = document.getElementById(
    "closeRawHistoryFooterBtn",
  );
  const rawHistoryTableElement = document.getElementById("rawHistoryTable");
  const rawHistorySearch = document.getElementById("rawHistorySearch");
  const btnRawHistoryRefresh = document.getElementById("btnRawHistoryRefresh");

  // Tab 2: Finished Goods
  const dbTotalPallets = document.getElementById("inv-db-total-pallets");
  const dbUniqueProducts = document.getElementById("inv-db-unique-products");
  const dbReceivedToday = document.getElementById("inv-db-received-today");
  const btnRefresh = document.getElementById("inv-refresh-btn");
  const filterSearch = document.getElementById("invFilterSearch");
  const filterSku = document.getElementById("invFilterSku");
  const filterStart = document.getElementById("invFilterStart");
  const filterEnd = document.getElementById("invFilterEnd");
  const btnApplyFilters = document.getElementById("invApplyFiltersBtn");
  const tableElement = document.getElementById("inventoryTable");

  // Tab 3: Kardex
  const kardexSkuInput = document.getElementById("kardexSkuInput");
  const kardexSearchBtn = document.getElementById("kardexSearchBtn");
  const kardexClearBtn = document.getElementById("kardexClearBtn");
  const kardexProductInfo = document.getElementById("kardexProductInfo");
  const kardexProductName = document.getElementById("kardexProductName");
  const kardexProductSku = document.getElementById("kardexProductSku");
  const kardexDashboard = document.getElementById("kardexDashboard");
  const kardexDbIn = document.getElementById("kardex-db-in");
  const kardexDbOut = document.getElementById("kardex-db-out");
  const kardexDbBalance = document.getElementById("kardex-db-balance");
  const kardexDbTransit = document.getElementById("kardex-db-transit");
  const kardexTableSection = document.getElementById("kardexTableSection");
  const kardexTableEl = document.getElementById("kardexTable");
  const kardexEmptyState = document.getElementById("kardexEmptyState");
  const kardexFilterStart = document.getElementById("kardexFilterStart");
  const kardexFilterEnd = document.getElementById("kardexFilterEnd");
  const kardexApplyFilter = document.getElementById("kardexApplyFilter");
  const kardexExportBtn = document.getElementById("kardexExportBtn");

  // Job Ticket Modal
  const jobTicketModal = document.getElementById("jobTicketModal");
  const closeJobTicketBtn = document.getElementById("closeJobTicketBtn");
  const cancelJobTicketBtn = document.getElementById("cancelJobTicketBtn");
  const jobTicketForm = document.getElementById("jobTicketForm");
  const pcpTotalOrder = document.getElementById("pcp-total-order");
  const pcpAssigned = document.getElementById("pcp-assigned");
  const pcpRemaining = document.getElementById("pcp-remaining");
  const ticketHistoryTable = document.getElementById("ticketHistoryTable");
  const ticketProductName = document.getElementById("ticket-product-name");
  const ticketProductSku = document.getElementById("ticket-product-sku");
  const ticketOrderRef = document.getElementById("ticket-order-ref");
  const ticketClientName = document.getElementById("ticket-client-name");
  const ticketTargetPallets = document.getElementById("ticket-target-pallets");
  const ticketLineSelect = document.getElementById("ticket-line-select");
  const ticketRawId = document.getElementById("ticket-raw-id");

  // Details Modal
  const detailsModal = document.getElementById("invDetailsModal");
  const btnCloseDetails = document.getElementById("invCloseDetailsBtn");
  const btnCloseDetailsFooter = document.getElementById(
    "invCloseDetailsFooterBtn",
  );
  const detProduct = document.getElementById("inv-det-product");
  const detSku = document.getElementById("inv-det-sku");
  const detQr = document.getElementById("inv-det-qr");
  const detConfig = document.getElementById("inv-det-config");
  const detLine = document.getElementById("inv-det-line");
  const detOperator = document.getElementById("inv-det-operator");
  const detDate = document.getElementById("inv-det-date");
  const btnPrintLabel = document.getElementById("inv-btn-print");
  const btnOpenAdjust = document.getElementById("inv-btn-adjust");
  const btnKardexShortcut = document.getElementById("inv-btn-kardex-shortcut");

  // Adjust Modal
  const adjustModal = document.getElementById("invAdjustModal");
  const btnCloseAdjust = document.getElementById("invCloseAdjustBtn");
  const btnCancelAdjust = document.getElementById("invCancelAdjustBtn");
  const adjustForm = document.getElementById("invAdjustForm");
  const adjustReasonInput = document.getElementById("inv-adjust-reason");
  const adjustNotesInput = document.getElementById("inv-adjust-notes");
  const adjustIdInput = document.getElementById("inv-adjust-id");

  // --- 0. TOAST NOTIFICATION SYSTEM & CUSTOM STYLES ---
  function injectModuleStyles() {
    if (!document.getElementById("inv-custom-styles")) {
      const style = document.createElement("style");
      style.id = "inv-custom-styles";
      style.innerHTML = `
            .inv-toast {
                position: fixed; top: 20px; right: 20px; z-index: 9999;
                padding: 12px 20px; border-radius: 8px; color: white;
                font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: flex; align-items: center; gap: 10px;
                animation: slideInToast 0.3s ease-out; font-family: sans-serif;
            }
            @keyframes slideInToast {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .inv-confirm-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); z-index: 10000;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(2px);
            }
            .inv-confirm-box {
                background: white; padding: 2rem; border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                max-width: 400px; text-align: center;
            }
            .inv-confirm-actions {
                display: flex; gap: 10px; justify-content: center; margin-top: 1.5rem;
            }
            button.btn-archive-row:hover {
                color: #14532d !important;
                background-color: #bbf7d0 !important;
                border-color: #14532d !important;
                filter: brightness(0.95);
            }
            button.btn-archive-row:disabled:hover {
                 background: transparent !important;
                 color: #999 !important;
            }
        `;
      document.head.appendChild(style);
    }
  }

  function showToast(message, type = "info") {
    injectModuleStyles();
    const toast = document.createElement("div");
    toast.className = "inv-toast";

    const colors = {
      success: "#10b981",
      error: "#ef4444",
      warning: "#f59e0b",
      info: "#3b82f6",
    };
    toast.style.backgroundColor = colors[type] || colors.info;

    const icons = {
      success: "<i class='bx bx-check-circle'></i>",
      error: "<i class='bx bx-x-circle'></i>",
      warning: "<i class='bx bx-error'></i>",
      info: "<i class='bx bx-info-circle'></i>",
    };

    toast.innerHTML = `${icons[type] || icons.info} <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
      toast.style.transition = "all 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function showCustomConfirm(message, onConfirm) {
    injectModuleStyles();
    const overlay = document.createElement("div");
    overlay.className = "inv-confirm-overlay";
    overlay.innerHTML = `
        <div class="inv-confirm-box">
            <i class='bx bx-question-mark' style="font-size:3rem; color:#f59e0b; margin-bottom:1rem;"></i>
            <p style="font-size:1.1rem; color:#333; margin:0;">${message}</p>
            <div class="inv-confirm-actions">
                <button id="btn-cancel-confirm" class="btn-goldmex-secondary">Cancel</button>
                <button id="btn-ok-confirm" class="btn-goldmex-primary">Confirm</button>
            </div>
        </div>
      `;
    document.body.appendChild(overlay);

    document.getElementById("btn-cancel-confirm").onclick = () =>
      overlay.remove();
    document.getElementById("btn-ok-confirm").onclick = () => {
      overlay.remove();
      onConfirm();
    };
  }

  // --- 2. TAB LOGIC ---
  function initTabs() {
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabButtons.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));

        btn.classList.add("active");
        const targetId = btn.getAttribute("data-tab");
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.classList.add("active");

        if (targetId === "inv-tab-kardex") {
          if (headerKardexWidget) headerKardexWidget.style.display = "flex";
          if (btnRefresh) btnRefresh.style.display = "none";
          if (btnExportMain) btnExportMain.style.display = "none";
          if (kardexTableInstance) kardexTableInstance.columns.adjust().draw();
        } else if (targetId === "inv-tab-raw") {
          if (headerKardexWidget) headerKardexWidget.style.display = "none";
          if (btnRefresh) btnRefresh.style.display = "flex";
          if (btnExportMain) btnExportMain.style.display = "none";
          fetchRawInventory();
        } else {
          if (headerKardexWidget) headerKardexWidget.style.display = "none";
          if (btnRefresh) btnRefresh.style.display = "flex";
          if (btnExportMain) btnExportMain.style.display = "flex";
          fetchFinishedInventory();
        }
      });
    });

    const activeTab = document.querySelector(".inv-tab-button.active");
    if (activeTab && activeTab.dataset.tab === "inv-tab-raw" && btnExportMain) {
      btnExportMain.style.display = "none";
    }
  }

  // --- 3. RAW INVENTORY (PLANNING VIEW) ---
  function setupRawInventoryRealtime() {
    if (rawInventorySubscription) return;
    rawInventorySubscription = supabase
      .channel("raw-progress-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: PRODUCTION_TABLE },
        (payload) => {
          const activeTab = document.querySelector(".inv-tab-button.active");
          if (activeTab && activeTab.dataset.tab === "inv-tab-raw") {
            fetchRawInventory();
            if (jobTicketModal.classList.contains("open") && currentRawData) {
              calculatePcpMetrics(
                currentRawData.order_ref,
                currentRawData.product_id,
              );
            }
          }
        },
      )
      .subscribe();
  }

  async function fetchRawInventory() {
    if (rawTableElement) rawTableElement.style.opacity = "0.5";
    setupRawInventoryRealtime();

    const { data: rawData, error } = await supabase
      .from(RAW_INVENTORY_TABLE)
      .select(
        `*, production_products (id, name, sku, units_per_case, cases_per_pallet)`,
      )
      .order("received_at", { ascending: false });

    if (error) {
      console.error("Error fetching raw inventory:", error);
      showToast("Error loading inventory", "error");
      if (rawTableElement) rawTableElement.style.opacity = "1";
      return;
    }

    const consolidatedMap = {};
    rawData.forEach((item) => {
      const key = `${item.order_ref}-${item.product_id}`;
      if (!consolidatedMap[key]) {
        consolidatedMap[key] = { ...item };
      } else {
        consolidatedMap[key].qty_on_hand =
          (parseFloat(consolidatedMap[key].qty_on_hand) || 0) +
          (parseFloat(item.qty_on_hand) || 0);
        if (
          new Date(item.received_at) >
          new Date(consolidatedMap[key].received_at)
        ) {
          consolidatedMap[key].received_at = item.received_at;
        }
        if (item.archived === true) consolidatedMap[key].archived = true;
      }
    });

    const consolidatedRawData = Object.values(consolidatedMap);
    const orderRefs = [...new Set(consolidatedRawData.map((i) => i.order_ref))];

    let ordersMap = {};
    let orderStatusMap = {};
    let demandMap = {};
    let assignedMap = {};
    let activeTicketsMap = {};
    let finishedPalletsMap = {};
    let activeProductionMap = {};

    if (orderRefs.length > 0) {
      const { data: ordersData } = await supabase
        .from(ORDERS_TABLE)
        .select(
          "unique_order_code, status, product_id, qty_calculated_pallets, profiles(full_name)",
        )
        .in("unique_order_code", orderRefs);
      if (ordersData) {
        ordersData.forEach((o) => {
          if (!ordersMap[o.unique_order_code])
            ordersMap[o.unique_order_code] = o.profiles?.full_name || "Unknown";
          // Store Order Status for Visual Logic
          orderStatusMap[o.unique_order_code] = o.status;

          const key = `${o.unique_order_code}-${o.product_id}`;
          if (!demandMap[key]) demandMap[key] = 0;
          demandMap[key] += o.qty_calculated_pallets || 0;
        });
      }
      const { data: ticketData } = await supabase
        .from(TICKETS_TABLE)
        .select("order_ref, product_id, target_pallets, status")
        .in("order_ref", orderRefs)
        .neq("status", "cancelled");
      if (ticketData) {
        ticketData.forEach((t) => {
          const key = `${t.order_ref}-${t.product_id}`;
          if (!assignedMap[key]) assignedMap[key] = 0;
          assignedMap[key] += t.target_pallets || 0;
          if (
            t.status === "pending" ||
            t.status === "in_progress" ||
            t.status === "active"
          ) {
            if (!activeTicketsMap[key]) activeTicketsMap[key] = true;
          }
        });
      }
      const { data: realLogs } = await supabase
        .from(PRODUCTION_TABLE)
        .select(`id, status, job_tickets!inner (order_ref, product_id)`)
        .in("status", [
          "waiting_for_scan",
          "completed",
          "shipped",
          "adjusted",
          "in_progress",
        ]);
      if (realLogs) {
        realLogs.forEach((log) => {
          const t = log.job_tickets;
          if (t) {
            const key = `${t.order_ref}-${t.product_id}`;
            if (log.status === "in_progress") activeProductionMap[key] = true;
            else {
              if (!finishedPalletsMap[key]) finishedPalletsMap[key] = 0;
              finishedPalletsMap[key]++;
            }
          }
        });
      }
    }

    activeRawData = [];
    historyRawData = [];

    consolidatedRawData.forEach((item) => {
      const currentStatus = orderStatusMap[item.order_ref];

      // Filter visible statuses
      if (
        currentStatus !== "material_received" &&
        currentStatus !== "partial_received" && // Support partial
        currentStatus !== "production_planned" &&
        currentStatus !== "production_in_progress"
      )
        return;

      const key = `${item.order_ref}-${item.product_id}`;
      const totalDemand = demandMap[key] || 0;
      const totalAssigned = assignedMap[key] || 0;
      const totalFinishedReal = finishedPalletsMap[key] || 0;
      const isPhysicallyRunning = activeProductionMap[key] || false;
      const remaining = Math.max(0, Math.ceil(totalDemand - totalAssigned));
      const hasPendingWork = activeTicketsMap[key] || false;

      const processedItem = {
        ...item,
        client_name: ordersMap[item.order_ref] || "Unknown Client",
        // [UPDATED V8.8] Include DB Status in object for rendering logic
        order_status_db: currentStatus,
        is_in_production: totalAssigned > 0,
        pcp_demand: totalDemand,
        pcp_assigned: totalAssigned,
        pcp_remaining: remaining,
        pcp_finished_real: totalFinishedReal,
        is_physically_running: isPhysicallyRunning,
        has_pending_work: hasPendingWork,
      };

      if (item.archived === true) historyRawData.push(processedItem);
      else activeRawData.push(processedItem);
    });

    if (rawTableElement) rawTableElement.style.opacity = "1";
    if (invRawTotalCount) invRawTotalCount.textContent = activeRawData.length;
    if (invRawPendingCount)
      invRawPendingCount.textContent = activeRawData.filter(
        (i) => i.pcp_finished_real < i.pcp_demand,
      ).length;

    populateRawFilters(activeRawData);
    applyRawFilters();
  }

  function populateRawFilters(data) {
    if (!rawFilterClient || !rawFilterProduct) return;
    const currentClient = rawFilterClient.value;
    const currentProd = rawFilterProduct.value;
    const clients = [...new Set(data.map((i) => i.client_name))].sort();
    const products = [
      ...new Set(data.map((i) => i.production_products?.name || "Unknown")),
    ].sort();

    rawFilterClient.innerHTML = '<option value="all">All Clients</option>';
    clients.forEach(
      (c) =>
        (rawFilterClient.innerHTML += `<option value="${c}">${c}</option>`),
    );
    rawFilterProduct.innerHTML = '<option value="all">All Products</option>';
    products.forEach(
      (p) =>
        (rawFilterProduct.innerHTML += `<option value="${p}">${p}</option>`),
    );

    if (clients.includes(currentClient)) rawFilterClient.value = currentClient;
    if (products.includes(currentProd)) rawFilterProduct.value = currentProd;
  }

  function applyRawFilters() {
    const search = rawFilterSearch ? rawFilterSearch.value.toLowerCase() : "";
    const client = rawFilterClient ? rawFilterClient.value : "all";
    const product = rawFilterProduct ? rawFilterProduct.value : "all";
    const status = rawFilterStatus ? rawFilterStatus.value : "all";

    const filtered = activeRawData.filter((item) => {
      const matchSearch =
        !search ||
        item.order_ref.toLowerCase().includes(search) ||
        (item.production_products?.sku || "").toLowerCase().includes(search);
      const matchClient = client === "all" || item.client_name === client;
      const matchProduct =
        product === "all" ||
        (item.production_products?.name || "Unknown") === product;
      let matchStatus = true;
      const isFinished = item.pcp_finished_real >= item.pcp_demand;
      const hasActivity =
        item.pcp_finished_real > 0 || item.is_physically_running;
      if (status === "pending") matchStatus = !hasActivity;
      if (status === "production") matchStatus = hasActivity && !isFinished;
      return matchSearch && matchClient && matchProduct && matchStatus;
    });
    renderRawTable(filtered);
  }

  function renderRawTable(data) {
    if (!rawTableElement) return;
    injectModuleStyles();

    if ($.fn.DataTable.isDataTable(rawTableElement)) {
      rawTableInstance.destroy();
      $(rawTableElement).empty();
    }

    rawTableInstance = $(rawTableElement).DataTable({
      data: data,
      dom: '<"inv-dt-header"lf>rt<"inv-dt-footer"ip>',
      scrollY: "50vh",
      scrollCollapse: true,
      responsive: false,
      paging: true,
      columns: [
        {
          title: "Order / Client",
          data: null,
          render: (row) =>
            `<div><strong>${row.order_ref}</strong><br><small style="color:#666;">${row.client_name}</small></div>`,
        },
        {
          title: "Product",
          data: null,
          render: (row) =>
            `<div><span style="font-weight:700;">${row.production_products?.sku || "N/A"}</span><br><span style="font-size:0.85rem;">${row.production_products?.name || "Unknown"}</span></div>`,
        },
        {
          title: "Rec. Cases",
          data: "qty_on_hand",
          className: "dt-center",
          render: (d, type, row) => {
            const totalUnits = parseFloat(d) || 0;
            const unitsPerCase =
              parseFloat(row.production_products?.units_per_case) || 1;
            const realCases = totalUnits / unitsPerCase;
            return `<strong>${Math.round(realCases)}</strong> cases`;
          },
        },
        {
          title: "Est. Pallets",
          data: null,
          className: "dt-center",
          render: (row) => {
            const totalUnits = parseFloat(row.qty_on_hand) || 0;
            const unitsPerCase =
              parseFloat(row.production_products?.units_per_case) || 1;
            const casesPerPallet =
              parseFloat(row.production_products?.cases_per_pallet) || 1;
            const realCases = totalUnits / unitsPerCase;
            const pallets = (realCases / casesPerPallet).toFixed(1);
            return `<span style="color:var(--goldmex-primary-color); font-weight:bold;">${pallets}</span> plts`;
          },
        },
        {
          title: "Status / Progress",
          data: null,
          className: "dt-center",
          render: (row) => {
            const finishedReal = row.pcp_finished_real || 0;
            const total = row.pcp_demand || 1;
            const assigned = row.pcp_assigned || 0;
            const isRunning = row.is_physically_running;
            // [UPDATED V8.8] Grab explicit DB status for fallback visualization
            const dbStatus = row.order_status_db;

            const pct = Math.min(100, Math.round((finishedReal / total) * 100));

            let statusText = "Ready to Plan";
            let badgeClass = "status-available";
            let barColor = "#e5e7eb";

            // LOGIC FLOW UPDATED to catch "Planned" correctly
            if ((finishedReal > 0 && finishedReal < total) || isRunning) {
              // Active Production is highest priority
              statusText = "In Progress";
              badgeClass = "status-shipped";
              barColor = "#3b82f6";
            } else if (finishedReal >= total && total > 0) {
              // Completion
              statusText = "Production Complete";
              badgeClass = "status-on-hand";
              barColor = "#10b981";
            } else {
              // Not Started / Planning Phase
              // If tickets exist OR DB says planned, show planned.
              if (assigned > 0 || dbStatus === "production_planned") {
                statusText = "Planned / Waiting";
                badgeClass = "status-allocated"; // Amber/Orange
                barColor = "#93c5fd";
              } else {
                // Fallback to Ready (Material Received)
                statusText = "Ready to Plan";
                badgeClass = "status-available"; // Greenish
                barColor = "#e5e7eb";
              }
            }

            return `
                <div style="width:100%; background:#f3f4f6; height:8px; border-radius:4px; margin-top:5px; margin-bottom:5px; overflow:hidden;">
                    <div style="width:${pct}%; background:${barColor}; height:100%; border-radius:4px; transition: width 0.5s ease;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="inv-status-badge ${badgeClass}" style="font-size:0.7rem;">${statusText}</span>
                    <span style="font-size:0.75rem; font-weight:bold;">${finishedReal} / ${total}</span>
                </div>`;
          },
        },
        {
          title: "Actions",
          data: null,
          className: "dt-center",
          render: (data, type, row) => {
            let planBtnText = `<i class='bx bxs-coupon'></i> Plan / Ticket`;
            let planBtnClass = `btn-goldmex-primary`;

            if (row.pcp_remaining <= 0) {
              planBtnText = `<i class='bx bx-show'></i> View / Reprint`;
              planBtnClass = `btn-goldmex-secondary`;
            }

            const isProductionComplete =
              row.pcp_finished_real >= row.pcp_demand;
            const isPlanningComplete = row.pcp_remaining <= 0;
            let canArchive =
              isProductionComplete &&
              isPlanningComplete &&
              !row.is_physically_running;

            let archiveBtnHtml = "";
            if (!canArchive) {
              archiveBtnHtml = `<button class="btn-goldmex-secondary btn-sm btn-archive-row" disabled title="Finish planning and production to archive" style="opacity:0.5; cursor:not-allowed; border-color:#ccc; color:#999;"><i class='bx bx-archive-in'></i></button>`;
            } else {
              archiveBtnHtml = `<button class="btn-goldmex-secondary btn-sm btn-archive-row" data-id="${row.id}" title="Archive Order (Move to History)" style="color:#15803d; border-color:#15803d; background:#dcfce7;"><i class='bx bx-archive-in'></i></button>`;
            }

            return `<div style="display:flex; gap:5px; justify-content:center;"><button class="${planBtnClass} btn-sm btn-job-ticket" data-id="${row.id}">${planBtnText}</button>${archiveBtnHtml}</div>`;
          },
        },
      ],
      language: { emptyTable: "No active orders. Check History." },
    });

    $(rawTableElement)
      .off("click", ".btn-job-ticket")
      .on("click", ".btn-job-ticket", function (e) {
        e.stopPropagation();
        const id = $(this).data("id");
        const rowData = activeRawData.find((i) => i.id == id);
        openJobTicketModal(rowData);
      });

    $(rawTableElement)
      .off("click", ".btn-archive-row")
      .on("click", ".btn-archive-row", function (e) {
        e.stopPropagation();
        const id = $(this).data("id");
        handleArchiveRow(id);
      });
  }

  async function handleArchiveRow(id) {
    showCustomConfirm(
      "Are you sure you want to archive this order? It will move to history.",
      async () => {
        const rowData = activeRawData.find((i) => i.id == id);
        if (!rowData) return;
        try {
          const { error } = await supabase
            .from(RAW_INVENTORY_TABLE)
            .update({ archived: true })
            .eq("order_ref", rowData.order_ref)
            .eq("product_id", rowData.product_id);
          if (error) throw error;
          showToast("Order archived successfully", "success");
          fetchRawInventory();
        } catch (err) {
          console.error(err);
          showToast("Error archiving order", "error");
        }
      },
    );
  }

  // --- HISTORY MODAL LOGIC ---
  function openRawHistory() {
    if (!rawHistoryModal) return;
    rawHistoryModal.style.display = "flex";
    setTimeout(() => {
      rawHistoryModal.classList.add("open");
      renderHistoryTable();
      if (rawHistoryTableInstance) {
        setTimeout(() => rawHistoryTableInstance.columns.adjust().draw(), 200);
      }
    }, 10);
  }

  function renderHistoryTable() {
    if (!rawHistoryTableElement) return;
    if ($.fn.DataTable.isDataTable(rawHistoryTableElement)) {
      rawHistoryTableInstance.destroy();
      $(rawHistoryTableElement).empty();
    }

    const searchTerm = rawHistorySearch
      ? rawHistorySearch.value.toLowerCase()
      : "";
    const dataToRender = historyRawData.filter(
      (item) =>
        !searchTerm ||
        item.order_ref.toLowerCase().includes(searchTerm) ||
        (item.production_products?.name || "")
          .toLowerCase()
          .includes(searchTerm),
    );

    rawHistoryTableInstance = $(rawHistoryTableElement).DataTable({
      data: dataToRender,
      dom: 'rt<"inv-dt-footer"ip>',
      scrollY: "40vh",
      scrollCollapse: true,
      responsive: false,
      paging: true,
      pageLength: 10,
      columns: [
        {
          title: "Order Ref",
          data: "order_ref",
          className: "font-weight-bold",
        },
        { title: "Product", data: "production_products.name" },
        {
          title: "Status",
          data: null,
          className: "dt-center",
          render: () =>
            `<span class="inv-status-badge status-consumed">Archived / Consumed</span>`,
        },
        {
          title: "Date Rcvd",
          data: "received_at",
          render: (d) => new Date(d).toLocaleDateString(),
        },
        {
          title: "Action",
          data: null,
          render: (row) =>
            `<button class="btn-goldmex-secondary btn-sm btn-history-details" data-id="${row.id}" title="View Details"><i class='bx bx-show'></i></button>`,
        },
      ],
    });

    $(rawHistoryTableElement)
      .off("click", ".btn-history-details")
      .on("click", ".btn-history-details", function () {
        const id = $(this).data("id");
        const row = historyRawData.find((r) => r.id == id);
        openDetailsModalForHistory(row);
      });
  }

  async function openDetailsModalForHistory(item) {
    if (!item) return;
    detailsModal.style.zIndex = "1600";
    const title = document.getElementById("invDetailsTitle");
    if (title)
      title.innerHTML =
        "<i class='bx bx-history'></i> Production History Details";

    const standardGrid = detailsModal.querySelector(".inv-details-grid");
    const standardActions = detailsModal.querySelector(".inv-actions-section");
    if (standardGrid) standardGrid.style.display = "none";
    if (standardActions) standardActions.style.display = "none";

    let historyContainer = document.getElementById(
      "inv-history-dynamic-container",
    );
    if (!historyContainer) {
      historyContainer = document.createElement("div");
      historyContainer.id = "inv-history-dynamic-container";
      historyContainer.className = "inv-table-container";
      historyContainer.style.marginTop = "1rem";
      const body = detailsModal.querySelector(".inv-modal-body");
      body.appendChild(historyContainer);
    }
    historyContainer.style.display = "block";
    historyContainer.innerHTML =
      '<div style="padding:2rem; text-align:center;"><i class="bx bx-loader-alt bx-spin" style="font-size:2rem;"></i><p>Loading production logs...</p></div>';

    detailsModal.style.display = "flex";
    setTimeout(() => detailsModal.classList.add("open"), 10);

    const restoreModal = () => {
      if (title)
        title.innerHTML = "<i class='bx bx-barcode'></i> Pallet Details";
      if (standardGrid) standardGrid.style.display = "grid";
      if (standardActions) standardActions.style.display = "block";
      if (historyContainer) historyContainer.style.display = "none";
      detailsModal.style.zIndex = "";
      btnCloseDetails.removeEventListener("click", restoreModal);
      btnCloseDetailsFooter.removeEventListener("click", restoreModal);
    };
    btnCloseDetails.addEventListener("click", restoreModal);
    btnCloseDetailsFooter.addEventListener("click", restoreModal);

    try {
      const { data: tickets } = await supabase
        .from(TICKETS_TABLE)
        .select("id")
        .eq("order_ref", item.order_ref);
      const ticketIds = tickets ? tickets.map((t) => t.id) : [];

      if (ticketIds.length === 0) {
        historyContainer.innerHTML =
          '<p style="text-align:center; padding:1rem;">No production records found (No tickets linked).</p>';
        return;
      }

      const { data: logs, error } = await supabase
        .from(PRODUCTION_TABLE)
        .select(
          `pallet_qr_id, warehouse_scan_time, operator_name, warehouse_lines(line_name), final_time_seconds`,
        )
        .in("job_ticket_id", ticketIds)
        .order("warehouse_scan_time", { ascending: false });

      if (error) throw error;
      if (!logs || logs.length === 0) {
        historyContainer.innerHTML =
          '<p style="text-align:center; padding:1rem;">No finished pallets found for this order.</p>';
        return;
      }

      let html = `
               <div style="margin-bottom:1rem;">
                   <h4 style="margin:0;">${item.production_products?.name || "Product"}</h4>
                   <small style="color:var(--color-text-secondary)">Order: ${item.order_ref} | Total Pallets: ${logs.length}</small>
               </div>
               <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                   <thead style="background:#f1f5f9; border-bottom:2px solid #e2e8f0;">
                       <tr>
                           <th style="padding:10px; text-align:left;">Date</th>
                           <th style="padding:10px; text-align:left;">QR ID</th>
                           <th style="padding:10px; text-align:left;">Line</th>
                           <th style="padding:10px; text-align:left;">Operator / Crew</th>
                           <th style="padding:10px; text-align:right;">Duration</th>
                       </tr>
                   </thead>
                   <tbody>
           `;

      logs.forEach((log) => {
        const dateStr = new Date(log.warehouse_scan_time).toLocaleString();
        const mins = Math.floor((log.final_time_seconds || 0) / 60);
        const secs = (log.final_time_seconds || 0) % 60;
        html += `
                   <tr style="border-bottom:1px solid #f1f5f9;">
                       <td style="padding:10px;">${dateStr}</td>
                       <td style="padding:10px; font-family:monospace; color:var(--goldmex-primary-color); font-weight:bold;">${log.pallet_qr_id}</td>
                       <td style="padding:10px;">${log.warehouse_lines?.line_name || "N/A"}</td>
                       <td style="padding:10px;">${log.operator_name || "Unknown"}</td>
                       <td style="padding:10px; text-align:right;">${mins}m ${secs}s</td>
                   </tr>`;
      });
      html += `</tbody></table>`;
      historyContainer.innerHTML = html;
    } catch (e) {
      console.error(e);
      historyContainer.innerHTML =
        '<p style="color:red; text-align:center; padding:1rem;">Error loading details.</p>';
    }
  }

  // --- 4. SMART JOB TICKET MODAL (PCP LOGIC) ---
  async function openJobTicketModal(rawData) {
    currentRawData = rawData;
    if (ticketProductName)
      ticketProductName.textContent =
        rawData.production_products?.name || "Unknown Product";
    if (ticketProductSku)
      ticketProductSku.textContent = rawData.production_products?.sku || "N/A";
    if (ticketOrderRef) ticketOrderRef.textContent = rawData.order_ref || "N/A";
    if (ticketClientName)
      ticketClientName.textContent = rawData.client_name || "Unknown";
    if (ticketRawId) ticketRawId.value = rawData.id;
    if (ticketTargetPallets) {
      ticketTargetPallets.value = "";
      ticketTargetPallets.removeAttribute("max");
    }

    await calculatePcpMetrics(rawData.order_ref, rawData.product_id);

    const { data: lines } = await supabase
      .from(LINES_TABLE)
      .select("id, line_name")
      .order("id");
    if (ticketLineSelect) {
      ticketLineSelect.innerHTML = '<option value="">-- Any Line --</option>';
      if (lines)
        lines.forEach(
          (l) =>
            (ticketLineSelect.innerHTML += `<option value="${l.id}">${l.line_name}</option>`),
        );
    }
    if (jobTicketModal) {
      jobTicketModal.style.display = "flex";
      setTimeout(() => jobTicketModal.classList.add("open"), 10);
    }
  }

  async function calculatePcpMetrics(orderRef, productId) {
    let totalOrdered = 0;
    const { data: orderRows } = await supabase
      .from(ORDERS_TABLE)
      .select("product_id, qty_calculated_pallets")
      .eq("unique_order_code", orderRef);
    if (orderRows) {
      const relevantRows = orderRows.filter((r) => r.product_id === productId);
      totalOrdered = relevantRows.reduce(
        (sum, r) => sum + Math.ceil(r.qty_calculated_pallets || 0),
        0,
      );
    }

    let totalAssigned = 0;
    let tickets = [];

    try {
      const { data, error } = await supabase
        .from(TICKETS_TABLE)
        .select("*")
        .eq("order_ref", orderRef)
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (!error && data) {
        tickets = data;
        totalAssigned = tickets
          .filter((t) => t.status !== "cancelled")
          .reduce((sum, t) => sum + (t.target_pallets || 0), 0);
        const ticketIds = tickets.map((t) => t.id);
        if (ticketIds.length > 0) {
          const { data: logs } = await supabase
            .from(PRODUCTION_TABLE)
            .select("job_ticket_id, status")
            .in("job_ticket_id", ticketIds)
            .neq("status", "cancelled");
          const logMap = {};
          if (logs) {
            logs.forEach((log) => {
              if (!logMap[log.job_ticket_id])
                logMap[log.job_ticket_id] = { count: 0, running: false };
              if (log.status === "in_progress")
                logMap[log.job_ticket_id].running = true;
              else if (
                [
                  "completed",
                  "shipped",
                  "waiting_for_scan",
                  "adjusted",
                ].includes(log.status)
              )
                logMap[log.job_ticket_id].count++;
            });
          }
          tickets = tickets.map((t) => {
            const stats = logMap[t.id] || { count: 0, running: false };
            let dynamicStatus = t.status;
            if (t.status === "cancelled") return t;
            if (stats.count >= t.target_pallets) dynamicStatus = "completed";
            else if (stats.count > 0 || stats.running)
              dynamicStatus = "in_progress";
            else dynamicStatus = "pending";
            return {
              ...t,
              dynamicStatus: dynamicStatus,
              realCount: stats.count,
            };
          });
        }
      }
    } catch (e) {
      console.warn("Skipping ticket history check", e);
    }

    let remaining = totalOrdered - totalAssigned;
    if (remaining < 0) remaining = 0;
    currentPcpStats = {
      total: totalOrdered,
      assigned: totalAssigned,
      remaining: remaining,
    };

    if (pcpTotalOrder) pcpTotalOrder.textContent = totalOrdered;
    if (pcpAssigned) pcpAssigned.textContent = totalAssigned;
    if (pcpRemaining) pcpRemaining.textContent = remaining;

    const pcpCardRemaining = document.getElementById("pcp-card-remaining");
    const formBtn = jobTicketForm.querySelector("button[type='submit']");

    if (remaining === 0) {
      if (pcpCardRemaining) {
        pcpCardRemaining.style.backgroundColor = "#dcfce7";
        pcpCardRemaining.style.borderColor = "#10b981";
        if (pcpRemaining) pcpRemaining.style.color = "#15803d";
        if (pcpRemaining) pcpRemaining.textContent = "Done";
      }
      if (ticketTargetPallets) {
        ticketTargetPallets.disabled = true;
        ticketTargetPallets.value = "";
        ticketTargetPallets.placeholder = "Full";
      }
      if (ticketLineSelect) ticketLineSelect.disabled = true;
      if (formBtn) {
        formBtn.disabled = true;
        formBtn.innerHTML = "<i class='bx bx-check-circle'></i> Plan Completed";
        formBtn.style.backgroundColor = "#ccc";
        formBtn.style.borderColor = "#ccc";
      }
    } else {
      if (pcpCardRemaining) {
        pcpCardRemaining.style.backgroundColor = "#eff6ff";
        pcpCardRemaining.style.borderColor = "#3b82f6";
        if (pcpRemaining) pcpRemaining.style.color = "#1d4ed8";
      }
      if (ticketTargetPallets) {
        ticketTargetPallets.disabled = false;
        ticketTargetPallets.placeholder = "0";
        ticketTargetPallets.max = remaining;
        ticketTargetPallets.min = 1;
      }
      if (ticketLineSelect) ticketLineSelect.disabled = false;
      if (formBtn) {
        formBtn.disabled = false;
        formBtn.innerHTML =
          "<i class='bx bxs-printer'></i> Generate & Print Ticket";
        formBtn.style.backgroundColor = "";
        formBtn.style.borderColor = "";
      }
    }
    renderTicketHistory(tickets || []);
  }

  function renderTicketHistory(tickets) {
    const tbody = document.getElementById("ticketHistoryTable");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (tickets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1rem; color:#999;">No tickets generated yet.</td></tr>`;
      return;
    }
    tickets.forEach((t) => {
      const tr = document.createElement("tr");
      const ticketStr = encodeURIComponent(JSON.stringify(t));
      const style =
        t.status === "cancelled"
          ? "text-decoration:line-through; color:#999;"
          : "";
      const displayStatus = t.dynamicStatus || t.status;
      const displayCount =
        t.realCount !== undefined ? `(${t.realCount}/${t.target_pallets})` : "";

      let statusBadge = `<span class="inv-status-badge status-available">${displayStatus}</span>`;
      if (displayStatus === "in_progress")
        statusBadge = `<span class="inv-status-badge status-shipped">In Progress ${displayCount}</span>`;
      if (displayStatus === "completed")
        statusBadge = `<span class="inv-status-badge status-on-hand">Completed</span>`;
      if (displayStatus === "pending")
        statusBadge = `<span class="inv-status-badge status-allocated">Pending</span>`;

      tr.innerHTML = `
                <td style="padding:8px; font-family:monospace; font-weight:bold; ${style}">${t.id}</td>
                <td style="padding:8px;">${t.line_id ? "Line " + t.line_id : "Any"}</td>
                <td style="padding:8px; text-align:center; font-weight:700;">${t.target_pallets}</td>
                <td style="padding:8px; text-align:center;">${statusBadge}</td>
                <td style="padding:8px; text-align:center;">
                    <button class="btn-goldmex-secondary btn-sm" onclick="window.reprintTicket('${ticketStr}')" title="Reprint">
                        <i class='bx bx-printer'></i>
                    </button>
                </td>
            `;
      tbody.appendChild(tr);
    });
  }

  async function handleGenerateTicket(e) {
    e.preventDefault();
    if (!currentRawData) return;
    const targetInput = parseInt(ticketTargetPallets.value);
    const lineId = ticketLineSelect.value || null;
    if (isNaN(targetInput) || targetInput <= 0)
      return showToast("Invalid quantity. Must be at least 1.", "error");
    if (targetInput > currentPcpStats.remaining && currentPcpStats.total > 0) {
      showToast(
        `Error: Only ${currentPcpStats.remaining} pallets remaining.`,
        "error",
      );
      ticketTargetPallets.value = currentPcpStats.remaining;
      return;
    }
    const btn = jobTicketForm.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Generating...";
    try {
      const newTicket = {
        order_ref: currentRawData.order_ref,
        product_id: currentRawData.product_id,
        line_id: lineId ? parseInt(lineId) : null,
        target_pallets: targetInput,
        status: "pending",
        created_by: currentUserInv?.email,
      };
      const { data, error } = await supabase
        .from(TICKETS_TABLE)
        .insert(newTicket)
        .select()
        .single();
      if (error) throw error;

      // [MODIFIED V8.7] - LOGIC TO UPDATE ORDER STATUS TO 'production_planned'
      const { data: orderCheck } = await supabase
        .from(ORDERS_TABLE)
        .select("status")
        .eq("unique_order_code", currentRawData.order_ref)
        .single();

      if (
        orderCheck &&
        (orderCheck.status === "material_received" ||
          orderCheck.status === "partial_received")
      ) {
        await supabase
          .from(ORDERS_TABLE)
          .update({ status: "production_planned" })
          .eq("unique_order_code", currentRawData.order_ref);
      }

      showToast("Job Ticket Created Successfully", "success");
      printTicketDocument(data, currentRawData);
      await calculatePcpMetrics(
        currentRawData.order_ref,
        currentRawData.product_id,
      );
      ticketTargetPallets.value = "";
      fetchRawInventory();
    } catch (err) {
      console.error(err);
      showToast("Error: " + err.message, "error");
    } finally {
      if (currentPcpStats.remaining > 0) {
        btn.disabled = false;
        btn.innerHTML =
          "<i class='bx bxs-printer'></i> Generate & Print Ticket";
      }
    }
  }

  window.reprintTicket = function (ticketStr) {
    const ticket = JSON.parse(decodeURIComponent(ticketStr));
    if (currentRawData) {
      showToast("Reprinting Ticket...", "info");
      printTicketDocument(ticket, currentRawData);
    } else {
      showToast("Context lost. Please re-open the modal.", "error");
    }
  };

  function printTicketDocument(ticket, rawContext) {
    const qrData = {
      type: "job_ticket",
      ticket_id: ticket.id,
      order: ticket.order_ref,
      product_id: ticket.product_id,
      target: ticket.target_pallets,
      line: ticket.line_id,
    };
    const qrString = JSON.stringify(qrData);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrString)}`;
    const lineName = ticket.line_id ? `LINE ${ticket.line_id}` : "ANY LINE";

    const win = window.open("", "_blank", "width=800,height=900");
    win.document.write(`
            <html>
            <head>
                <title>JOB TICKET #${ticket.id}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; text-align: center; border: 4px solid #000; margin: 10px; height: 95vh; box-sizing: border-box; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                    h1 { font-size: 40px; margin: 0; text-transform: uppercase; }
                    .ticket-id { font-size: 20px; color: #555; }
                    .main-content { display: flex; flex-direction: column; align-items: center; }
                    .sku-box { font-size: 50px; font-weight: 900; background: #000; color: #fff; padding: 15px 40px; margin: 10px 0; border-radius: 8px; }
                    .prod-name { font-size: 24px; margin-bottom: 20px; font-weight: bold; }
                    .qr-box img { width: 300px; height: 300px; border: 1px solid #ddd; }
                    .grid-info { display: grid; grid-template-columns: 1fr 1fr; width: 100%; margin-top: 30px; border: 2px solid #000; }
                    .cell { padding: 15px; border: 1px solid #000; text-align: left; }
                    .cell label { display: block; font-size: 12px; text-transform: uppercase; color: #666; font-weight: bold; }
                    .cell span { font-size: 22px; font-weight: bold; }
                    .footer { margin-top: auto; padding-top: 20px; font-size: 14px; color: #888; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>PRODUCTION AUTHORIZATION</div>
                    <div class="ticket-id">ID: ${ticket.id}</div>
                </div>
                <h1>JOB TICKET</h1>
                <div class="main-content">
                    <div class="sku-box">${rawContext.production_products?.sku || "N/A"}</div>
                    <div class="prod-name">${rawContext.production_products?.name || "Unknown"}</div>
                    <div class="qr-box">
                        <img src="${qrUrl}" />
                        <p style="font-family:monospace;">SCAN AT WORKSTATION</p>
                    </div>
                </div>
                <div class="grid-info">
                    <div class="cell">
                        <label>Order Reference</label>
                        <span>${ticket.order_ref}</span>
                    </div>
                    <div class="cell">
                        <label>Client</label>
                        <span>${rawContext.client_name || "Unknown"}</span>
                    </div>
                    <div class="cell" style="background:#efefef;">
                        <label>TARGET PRODUCTION</label>
                        <span style="font-size:30px;">${ticket.target_pallets} PALLETS</span>
                    </div>
                    <div class="cell">
                        <label>Assigned Line</label>
                        <span>${lineName}</span>
                    </div>
                </div>
                <div class="footer">
                    Issued: ${new Date().toLocaleString()} by ${currentUserInv?.email}<br>
                    Goldmex WMS - Internal Use Only
                </div>
                <script>window.onload = function() { window.print(); }</script>
            </body>
            </html>
        `);
    win.document.close();
  }

  // --- FINISHED GOODS (TAB 2) ---
  async function fetchFinishedInventory() {
    if (tableElement) tableElement.style.opacity = "0.5";
    const { data, error } = await supabase
      .from(PRODUCTION_TABLE)
      .select(
        `id, pallet_qr_id, status, warehouse_scan_time, operator_name, warehouse_lines (line_name), production_products (id, name, sku, units_per_case, cases_per_pallet)`,
      )
      .eq("status", ACTIVE_STATUS)
      .order("warehouse_scan_time", { ascending: false })
      .limit(2000);

    if (tableElement) tableElement.style.opacity = "1";
    if (error)
      return console.error("Error fetching finished inventory:", error);

    allInventoryData = data || []; // Cache data for Export
    updateDashboardMetrics();
    renderFinishedTable(allInventoryData);
  }

  function updateDashboardMetrics() {
    if (dbTotalPallets) dbTotalPallets.textContent = allInventoryData.length;
    if (dbUniqueProducts) {
      const uniqueProducts = new Set(
        allInventoryData.map((item) => item.production_products?.id),
      );
      dbUniqueProducts.textContent = uniqueProducts.size;
    }
    if (dbReceivedToday) {
      const today = new Date().toISOString().split("T")[0];
      const receivedToday = allInventoryData.filter(
        (item) =>
          item.warehouse_scan_time &&
          item.warehouse_scan_time.startsWith(today),
      ).length;
      dbReceivedToday.textContent = receivedToday;
    }
  }

  function renderFinishedTable(data) {
    if (!tableElement) return;
    if ($.fn.DataTable.isDataTable(tableElement)) {
      inventoryTableInstance.destroy();
      $(tableElement).empty();
    }
    inventoryTableInstance = $(tableElement).DataTable({
      data: data,
      dom: '<"inv-dt-header"lf>rt<"inv-dt-footer"ip>',
      scrollY: "50vh",
      scrollCollapse: true,
      responsive: false,
      paging: true,
      pageLength: 25,
      columns: [
        {
          title: "QR ID",
          data: "pallet_qr_id",
          className: "dt-left font-mono",
          render: (d) =>
            `<span style="font-family:monospace; color:var(--goldmex-primary-color); font-weight:600;">${d}</span>`,
        },
        {
          title: "SKU",
          data: "production_products.sku",
          render: (d) => `<span style="font-weight:700;">${d || "N/A"}</span>`,
        },
        {
          title: "Product",
          data: "production_products.name",
          defaultContent: "Unknown Product",
        },
        {
          title: "Scan Time",
          data: "warehouse_scan_time",
          className: "dt-center",
          render: (d) => (d ? new Date(d).toLocaleString() : "-"),
        },
        {
          title: "Status",
          data: null,
          className: "dt-center",
          render: () =>
            `<span class="inv-status-badge status-on-hand">Finished</span>`,
        },
        {
          title: "Actions",
          data: null,
          orderable: false,
          className: "dt-center",
          render: (data, type, row) => `
                        <button class="btn-goldmex-secondary btn-sm inv-action-btn" data-action="view" data-id="${row.id}">
                            <i class='bx bx-show'></i> View
                        </button>
                    `,
        },
      ],
    });
    $(tableElement)
      .off("click", ".inv-action-btn")
      .on("click", ".inv-action-btn", function (e) {
        e.stopPropagation();
        const id = $(this).data("id");
        const rowData = allInventoryData.find((i) => i.id == id);
        openDetailsModal(rowData);
      });
  }

  // [MODIFIED] Logic to handle date filtering in Finished Goods
  function applyFinishedFilters() {
    const search = filterSearch ? filterSearch.value.toLowerCase() : "";
    const skuFilterVal = filterSku ? filterSku.value.toLowerCase() : "";

    // Get date values
    const dateStart =
      filterStart && filterStart.value ? new Date(filterStart.value) : null;
    const dateEnd =
      filterEnd && filterEnd.value ? new Date(filterEnd.value) : null;

    // Set end date to end of day for correct comparison
    if (dateEnd) {
      dateEnd.setHours(23, 59, 59, 999);
    }

    const filtered = allInventoryData.filter((item) => {
      const qr = (item.pallet_qr_id || "").toLowerCase();
      const prodName = (item.production_products?.name || "").toLowerCase();
      const prodSku = (item.production_products?.sku || "").toLowerCase();

      // Date Logic
      let matchDate = true;
      if (item.warehouse_scan_time) {
        const itemDate = new Date(item.warehouse_scan_time);
        if (dateStart && itemDate < dateStart) matchDate = false;
        if (dateEnd && itemDate > dateEnd) matchDate = false;
      }

      return (
        matchDate &&
        (!search || qr.includes(search) || prodName.includes(search)) &&
        (!skuFilterVal || prodSku.includes(skuFilterVal))
      );
    });
    renderFinishedTable(filtered);
  }

  function openDetailsModal(item) {
    currentPalletData = item;
    if (adjustIdInput) adjustIdInput.value = item.id;
    if (detProduct)
      detProduct.textContent = item.production_products?.name || "N/A";
    if (detSku) detSku.textContent = item.production_products?.sku || "N/A";
    if (detQr) detQr.textContent = item.pallet_qr_id;
    if (detConfig)
      detConfig.textContent = `${item.production_products?.cases_per_pallet || 0} Cases`;
    if (detLine) detLine.textContent = item.warehouse_lines?.line_name || "N/A";
    if (detOperator) detOperator.textContent = item.operator_name || "Unknown";
    if (detDate)
      detDate.textContent = item.warehouse_scan_time
        ? new Date(item.warehouse_scan_time).toLocaleString()
        : "--";
    if (detailsModal) {
      detailsModal.style.display = "flex";
      setTimeout(() => detailsModal.classList.add("open"), 10);
    }
  }

  // --- RESTORED LOGIC FROM V5.2 (ACTIONS) ---

  // 1. Export CSV
  function exportCsv() {
    if (allInventoryData.length === 0)
      return showToast("No data to export", "warning");
    const headers = ["QR ID", "SKU", "Product", "Line", "Scan Time", "Status"];
    const rows = allInventoryData.map((item) => [
      item.pallet_qr_id,
      item.production_products?.sku || "",
      `"${item.production_products?.name || ""}"`,
      item.warehouse_lines?.line_name || "",
      item.warehouse_scan_time,
      "On-Hand",
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encodedUri;
    link.download = `inventory_onhand_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 2. Print Label
  function handlePrintLabel() {
    if (!currentPalletData) return;
    const qr = currentPalletData.pallet_qr_id;
    const prod = currentPalletData.production_products?.name;

    const win = window.open("", "_blank", "width=400,height=500");
    win.document.write(`
        <div style="text-align:center; font-family:sans-serif; padding:20px;">
            <h2>${prod}</h2>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qr}" />
            <h3>${qr}</h3>
            <p>REPRINT COPY - INVENTORY</p>
            <button onclick="window.print()">Print</button>
        </div>
    `);
  }

  // 3. Inventory Adjustment (Remove)
  async function handleAdjustment(e) {
    e.preventDefault();
    if (!currentPalletData) return;

    const reason = adjustReasonInput.value;
    const notes = adjustNotesInput.value;

    if (!reason) {
      showToast("Please select a reason.", "error");
      return;
    }

    const recordId = parseInt(currentPalletData.id, 10);
    const auditNote = `Adjustment: ${reason}. Notes: ${notes} (User: ${currentUserInv?.email || "unknown"})`;

    const btn = document.getElementById("invConfirmAdjustBtn");
    btn.disabled = true;
    btn.textContent = "Processing...";

    const { error } = await supabase
      .from(PRODUCTION_TABLE)
      .update({
        status: "adjusted",
        notes: auditNote,
      })
      .eq("id", recordId);

    btn.disabled = false;
    btn.textContent = "Confirm Removal";

    if (error) {
      console.error("Supabase Error:", error);
      showToast("Error updating record.", "error");
      return;
    }

    showToast("Pallet removed successfully", "success");
    adjustForm.reset();
    adjustModal.classList.remove("open");
    setTimeout(() => (adjustModal.style.display = "none"), 300);

    detailsModal.classList.remove("open");
    setTimeout(() => (detailsModal.style.display = "none"), 300);

    // Refresh Table
    fetchFinishedInventory();
  }

  // --- KARDEX & OTHER UTILS ---
  async function handleKardexSearch() {
    if (!kardexSkuInput) return;
    const sku = kardexSkuInput.value.trim().toUpperCase();
    if (!sku) return showToast("Please enter a SKU", "warning");
    if (kardexSearchBtn) {
      kardexSearchBtn.disabled = true;
      kardexSearchBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
    }
    try {
      const { data: product, error: prodError } = await supabase
        .from(PRODUCTS_TABLE)
        .select("id, name, sku")
        .eq("sku", sku)
        .single();
      if (prodError || !product) {
        showToast("Product SKU not found.", "error");
        handleKardexClear();
        return;
      }
      let logsQuery = supabase
        .from(PRODUCTION_TABLE)
        .select(
          `id, status, warehouse_scan_time, pallet_qr_id, operator_name, notes, warehouse_lines (line_name)`,
        )
        .eq("product_id", product.id)
        .not("warehouse_scan_time", "is", null)
        .order("warehouse_scan_time", { ascending: false })
        .limit(1000);
      let balanceQuery = supabase
        .from(PRODUCTION_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("product_id", product.id)
        .eq("status", "completed");
      const [logsResult, balanceResult] = await Promise.all([
        logsQuery,
        balanceQuery,
      ]);

      // [MODIFIED] Store logs in global variable for filtering
      currentKardexData = logsResult.data || [];

      updateKardexUI(product, currentKardexData, balanceResult.count || 0);
    } catch (e) {
      console.error("Kardex Error:", e);
      showToast("System error searching Kardex", "error");
    } finally {
      if (kardexSearchBtn) {
        kardexSearchBtn.disabled = false;
        kardexSearchBtn.textContent = "Search";
      }
    }
  }

  function updateKardexUI(product, logs, realBalance) {
    if (kardexEmptyState) kardexEmptyState.style.display = "none";
    if (kardexProductInfo) kardexProductInfo.style.display = "flex";
    if (kardexDashboard) kardexDashboard.style.display = "grid";
    if (kardexTableSection) kardexTableSection.style.display = "flex";
    if (kardexProductSku) kardexProductSku.textContent = product.sku;
    if (kardexProductName) kardexProductName.textContent = product.name;
    if (kardexDbBalance) kardexDbBalance.textContent = realBalance;
    if (kardexDbIn) kardexDbIn.textContent = logs.length;
    if (kardexDbOut)
      kardexDbOut.textContent = logs.filter(
        (l) => l.status === "shipped" || l.status === "adjusted",
      ).length;
    renderKardexTable(logs);
  }

  function renderKardexTable(data) {
    if (!kardexTableEl) return;
    if ($.fn.DataTable.isDataTable(kardexTableEl)) {
      kardexTableInstance.destroy();
      $(kardexTableEl).empty();
    }
    kardexTableInstance = $(kardexTableEl).DataTable({
      data: data,
      dom: '<"inv-dt-header"lf>rt<"inv-dt-footer"ip>',
      scrollY: "45vh",
      scrollCollapse: true,
      responsive: false,
      paging: true,
      columns: [
        {
          title: "Date/Time",
          data: "warehouse_scan_time",
          render: (d) => (d ? new Date(d).toLocaleString() : "-"),
        },
        { title: "Transaction", data: "status", className: "dt-center" },
        { title: "Pallet ID", data: "pallet_qr_id" },
        {
          title: "Line",
          data: null,
          render: (row) => row.warehouse_lines?.line_name || "N/A",
        },
      ],
    });
  }

  // [MODIFIED] Function to Apply Kardex Date Filters
  function applyKardexFilters() {
    if (!currentKardexData || currentKardexData.length === 0) return;

    const start =
      kardexFilterStart && kardexFilterStart.value
        ? new Date(kardexFilterStart.value)
        : null;
    const end =
      kardexFilterEnd && kardexFilterEnd.value
        ? new Date(kardexFilterEnd.value)
        : null;

    if (end) {
      end.setHours(23, 59, 59, 999);
    }

    const filteredLogs = currentKardexData.filter((log) => {
      if (!log.warehouse_scan_time) return false;
      const logDate = new Date(log.warehouse_scan_time);
      let valid = true;
      if (start && logDate < start) valid = false;
      if (end && logDate > end) valid = false;
      return valid;
    });

    // Update filtered stats briefly (optional) but mainly update table
    renderKardexTable(filteredLogs);
  }

  // [MODIFIED] Function to Export Kardex CSV
  function exportKardexCsv() {
    // Export what is currently visible/filtered in the table instance
    if (!kardexTableInstance) return showToast("No data to export", "warning");

    // Get filtered data from DataTable
    const rowsData = kardexTableInstance
      .rows({ search: "applied" })
      .data()
      .toArray();

    if (rowsData.length === 0) return showToast("No data to export", "warning");

    const headers = ["Date/Time", "Transaction", "Pallet ID", "Line", "Notes"];
    const rows = rowsData.map((item) => [
      item.warehouse_scan_time || "",
      item.status || "",
      item.pallet_qr_id || "",
      item.warehouse_lines?.line_name || "",
      `"${(item.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      rows.map((e) => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const sku = kardexProductSku ? kardexProductSku.textContent : "KARDEX";
    link.href = encodedUri;
    link.download = `kardex_${sku}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleKardexClear() {
    if (kardexSkuInput) kardexSkuInput.value = "";
    if (kardexProductInfo) kardexProductInfo.style.display = "none";
    if (kardexDashboard) kardexDashboard.style.display = "none";
    if (kardexTableSection) kardexTableSection.style.display = "none";
    if (kardexEmptyState) kardexEmptyState.style.display = "flex";
    currentKardexData = []; // Clear local cache
  }

  // --- EVENT SETUP ---
  function setupEventListeners() {
    // Buttons (Raw)
    if (btnRawFilter) btnRawFilter.addEventListener("click", applyRawFilters);
    if (btnOpenRawHistory)
      btnOpenRawHistory.addEventListener("click", openRawHistory);
    if (rawFilterClient)
      rawFilterClient.addEventListener("change", applyRawFilters);
    if (rawFilterProduct)
      rawFilterProduct.addEventListener("change", applyRawFilters);
    if (rawFilterStatus)
      rawFilterStatus.addEventListener("change", applyRawFilters);

    // Buttons (History Modal)
    if (closeRawHistoryBtn)
      closeRawHistoryBtn.addEventListener("click", () => {
        rawHistoryModal.classList.remove("open");
        setTimeout(() => (rawHistoryModal.style.display = "none"), 300);
      });
    if (closeRawHistoryFooterBtn)
      closeRawHistoryFooterBtn.addEventListener("click", () => {
        rawHistoryModal.classList.remove("open");
        setTimeout(() => (rawHistoryModal.style.display = "none"), 300);
      });
    if (btnRawHistoryRefresh)
      btnRawHistoryRefresh.addEventListener("click", () =>
        renderHistoryTable(),
      );
    if (rawHistorySearch)
      rawHistorySearch.addEventListener("input", () => renderHistoryTable());

    // Buttons (Finished)
    if (btnApplyFilters)
      btnApplyFilters.addEventListener("click", applyFinishedFilters);
    if (btnRefresh)
      btnRefresh.addEventListener("click", () => {
        const activeTab = document.querySelector(".inv-tab-button.active");
        if (activeTab && activeTab.dataset.tab === "inv-tab-raw")
          fetchRawInventory();
        else fetchFinishedInventory();
      });

    // RESTORED: Export Listener
    if (btnExportMain) btnExportMain.addEventListener("click", exportCsv);

    // Job Tickets
    if (closeJobTicketBtn)
      closeJobTicketBtn.addEventListener("click", () => {
        jobTicketModal.classList.remove("open");
        setTimeout(() => (jobTicketModal.style.display = "none"), 300);
      });
    if (cancelJobTicketBtn)
      cancelJobTicketBtn.addEventListener("click", () => {
        jobTicketModal.classList.remove("open");
        setTimeout(() => (jobTicketModal.style.display = "none"), 300);
      });
    if (jobTicketForm)
      jobTicketForm.addEventListener("submit", handleGenerateTicket);

    // Details Modal
    if (btnCloseDetails)
      btnCloseDetails.addEventListener("click", () => {
        detailsModal.classList.remove("open");
        setTimeout(() => (detailsModal.style.display = "none"), 300);
      });
    if (btnCloseDetailsFooter)
      btnCloseDetailsFooter.addEventListener("click", () => {
        detailsModal.classList.remove("open");
        setTimeout(() => (detailsModal.style.display = "none"), 300);
      });

    // RESTORED: Print Label Listener
    if (btnPrintLabel)
      btnPrintLabel.addEventListener("click", handlePrintLabel);

    // RESTORED: Kardex Shortcut from Details
    if (btnKardexShortcut) {
      btnKardexShortcut.addEventListener("click", () => {
        if (currentPalletData && currentPalletData.production_products?.sku) {
          // Close details modal
          detailsModal.classList.remove("open");
          setTimeout(() => (detailsModal.style.display = "none"), 300);

          // Click Kardex Tab
          const kardexTabBtn = document.querySelector(
            '.inv-tab-button[data-tab="inv-tab-kardex"]',
          );
          if (kardexTabBtn) kardexTabBtn.click();

          // Set value and search
          kardexSkuInput.value = currentPalletData.production_products.sku;
          handleKardexSearch();
        } else {
          showToast("This product has no SKU assigned.", "warning");
        }
      });
    }

    // Adjustment Modal
    if (btnOpenAdjust)
      btnOpenAdjust.addEventListener("click", () => {
        adjustForm.reset();
        adjustModal.style.display = "flex";
        setTimeout(() => adjustModal.classList.add("open"), 10);
      });
    if (btnCloseAdjust)
      btnCloseAdjust.addEventListener("click", () => {
        adjustModal.classList.remove("open");
        setTimeout(() => (adjustModal.style.display = "none"), 300);
      });
    if (btnCancelAdjust)
      btnCancelAdjust.addEventListener("click", () => {
        adjustModal.classList.remove("open");
        setTimeout(() => (adjustModal.style.display = "none"), 300);
      });

    // RESTORED: Adjustment Submit Listener
    if (adjustForm) adjustForm.addEventListener("submit", handleAdjustment);

    // Kardex
    if (kardexSearchBtn)
      kardexSearchBtn.addEventListener("click", handleKardexSearch);
    if (kardexClearBtn)
      kardexClearBtn.addEventListener("click", handleKardexClear);
    if (kardexSkuInput) {
      kardexSkuInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleKardexSearch();
      });
      kardexSkuInput.addEventListener("input", (e) => {
        if (kardexClearBtn)
          kardexClearBtn.style.display = e.target.value ? "block" : "none";
      });
    }

    // [MODIFIED] Added Event Listeners for Kardex Filter & Export
    if (kardexApplyFilter) {
      kardexApplyFilter.addEventListener("click", applyKardexFilters);
    }
    if (kardexExportBtn) {
      kardexExportBtn.addEventListener("click", exportKardexCsv);
    }

    window.onclick = function (event) {
      if (event.target == detailsModal) {
        detailsModal.classList.remove("open");
        setTimeout(() => (detailsModal.style.display = "none"), 300);
      }
      if (event.target == jobTicketModal) {
        jobTicketModal.classList.remove("open");
        setTimeout(() => (jobTicketModal.style.display = "none"), 300);
      }
      if (event.target == rawHistoryModal) {
        rawHistoryModal.classList.remove("open");
        setTimeout(() => (rawHistoryModal.style.display = "none"), 300);
      }
      if (event.target == adjustModal) {
        adjustModal.classList.remove("open");
        setTimeout(() => (adjustModal.style.display = "none"), 300);
      }
    };
  }

  function init() {
    initTabs();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        currentUserInv = session.user;
        fetchRawInventory();
      }
    });
    setupEventListeners();
    document.addEventListener(
      "moduleWillUnload",
      () => {
        if (inventorySubscription)
          supabase.removeChannel(inventorySubscription);
        if (rawInventorySubscription)
          supabase.removeChannel(rawInventorySubscription);
        if (inventoryTableInstance) inventoryTableInstance.destroy();
        if (rawTableInstance) rawTableInstance.destroy();
        if (rawHistoryTableInstance) rawHistoryTableInstance.destroy();
        document.body.dataset.inventoryModuleInitialized = "false";
      },
      { once: true },
    );
  }

  init();
})();
