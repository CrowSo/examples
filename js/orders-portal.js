// js/orders-portal.js - V9.4 (Restored from Backup V9.1 + Requested Fixes Only)
(function () {
  // --- 0. PREVENIR DOBLE INICIALIZACIÓN (SINGLETON) ---
  if (document.body.dataset.ordersPortalInitialized === "true") {
    console.warn("Orders Portal already initialized. Skipping re-init.");
    return;
  }
  document.body.dataset.ordersPortalInitialized = "true";

  // --- 1. DEPENDENCY CHECK ---
  if (!window.supabase) {
    console.error("Supabase client missing.");
    return;
  }
  if (typeof Swal === "undefined") {
    console.warn("SweetAlert2 is missing. UI alerts will degrade.");
  }
  if (typeof html2pdf === "undefined") {
    console.warn("html2pdf library is missing. BOL download will not work.");
  }
  if (typeof QRCode === "undefined") {
    console.warn("QRCodeJS library is missing. Inbound Pass generation will fail.");
  }

  const moduleContainer = document.querySelector(".ord-container");
  if (!moduleContainer) return;

  // --- CONFIG ---
  const ATTACHMENT_BUCKET = "order-attachments";
  const ORDERS_TABLE = "client_orders";
  const RECEIVING_LOGS_TABLE = "receiving_logs"; // [ADDED] For Inbound Evidence
  const CHANNEL_NAME = "orders_portal_updates";

  // --- STATE ---
  let currentUser = null;
  let productsCache = [];

  // State for Creation & Editing
  let currentOrderDraft = [];
  let tempConfigProduct = null;
  let editingDraftItemIndex = -1;

  // Editing Mode Flags
  let isEditingMode = false;
  let editingOrderCode = null;
  let editingOrderIsExpedited = false;
  let editingOrderClientId = null;

  // Tables & Subs
  let activeOrdersTable = null;
  let historyOrdersTable = null;
  let realtimeSubscription = null;
  let realtimeDebounceTimer = null;

  // Data Cache
  let groupedActiveOrders = [];
  let groupedHistoryOrders = [];

  // V9.0 Filters State
  let currentPhaseFilter = "all";
  let showOnlyUrgent = false;
  let currentUnitView = "pallets"; // 'pallets', 'cases', 'pieces', 'lbs'

  // --- DOM ELEMENTS ---

  // Scorecards
  const domScorecards = {
    incoming: {
      total: document.getElementById("score-incoming-total"),
      reg: document.getElementById("score-incoming-reg"),
      urg: document.getElementById("score-incoming-urg"),
    },
    receiving: {
      total: document.getElementById("score-receiving-total"),
      reg: document.getElementById("score-receiving-reg"),
      urg: document.getElementById("score-receiving-urg"),
    },
    production: {
      total: document.getElementById("score-production-total"),
      reg: document.getElementById("score-production-reg"),
      urg: document.getElementById("score-production-urg"),
    },
    ready: {
      total: document.getElementById("score-ready-total"),
      reg: document.getElementById("score-ready-reg"),
      urg: document.getElementById("score-ready-urg"),
    },
    dispatching: {
      total: document.getElementById("score-dispatching-total"),
      reg: document.getElementById("score-dispatching-reg"),
      urg: document.getElementById("score-dispatching-urg"),
    },
    shipped: {
      total: document.getElementById("score-shipped-total"),
      reg: document.getElementById("score-shipped-reg"),
      urg: document.getElementById("score-shipped-urg"),
    },
  };

  const tableActiveEl = document.getElementById("ordersTable");
  const tableHistoryEl = document.getElementById("orderHistoryTable");
  const btnRefresh = document.getElementById("btn-refresh-orders");

  // V9.0 Filters Elements
  const filterPhaseSelect = document.getElementById("filter-phase");
  const filterUrgentBtn = document.getElementById("filter-urgent-btn");
  const filterUrgentText = document.getElementById("filter-urgent-text");
  
  const filterDateStart = document.getElementById("filter-date-start");
  const filterDateEnd = document.getElementById("filter-date-end");
  const filterProductSearch = document.getElementById("filter-product-search");
  const unitSwitchButtons = document.querySelectorAll(".btn-unit-switch");

  // Modals & Forms
  const newOrderModal = document.getElementById("newOrderModal");
  const viewOrderModal = document.getElementById("viewOrderModal");
  const productSelectorModal = document.getElementById("productSelectorModal");
  const historyModal = document.getElementById("historyModal");
  const itemConfigModal = document.getElementById("ordItemConfigModal");

  // Inbound Pass Elements
  const inboundPassModal = document.getElementById("inboundPassModal");
  const closeInboundPassBtn = document.getElementById("closeInboundPassModal");
  const btnDownloadPass = document.getElementById("btn-download-pass");
  const inboundQrContainer = document.getElementById("inbound-qr-container");
  const inboundRefCode = document.getElementById("inbound-ref-code");
  const inboundPassDate = document.getElementById("inbound-pass-date");
  const inboundPassSlot = document.getElementById("inbound-pass-slot");

  // Evidence Modal Elements
  const evidenceModal = document.getElementById("evidenceModal");
  const closeEvidenceBtn = document.getElementById("closeEvidenceModal");
  const btnCloseEvidenceFooter = document.getElementById("btnCloseEvidenceFooter");
  const btnLinkToDocs = document.getElementById("btn-link-to-docs");
  
  // [ADDED] Evidence Tabs Elements
  const evModalHeader = document.getElementById("ev-modal-header");
  const btnTabInbound = document.getElementById("btn-tab-inbound");
  const btnTabOutbound = document.getElementById("btn-tab-outbound");
  const evContentInbound = document.getElementById("ev-content-inbound");
  const evContentOutbound = document.getElementById("ev-content-outbound");

  // Evidence Data Elements
  const evOrderCode = document.getElementById("ev-order-code");
  const evStatusContainer = document.getElementById("ev-status-container"); // New container for badge
  
  // Inbound specific fields
  const evInbUser = document.getElementById("ev-inb-user");
  const evInbDate = document.getElementById("ev-inb-date");
  const evInbNotes = document.getElementById("ev-inb-notes");
  const evInbPhotoGrid = document.getElementById("ev-inb-photo-grid");

  // Outbound specific fields
  const evTransUnit = document.getElementById("ev-trans-unit");
  const evTransPlate = document.getElementById("ev-trans-plate");
  const evTransSeals = document.getElementById("ev-trans-seals");
  const evPhotoGrid = document.getElementById("ev-photo-grid"); // Outbound photos

  // BOL Preview Modal Elements
  const bolPreviewModal = document.getElementById("ordBolPreviewModal");
  const bolRenderContainer = document.getElementById("ord-bol-render-container");
  const btnCloseBolPreview = document.getElementById("closeBolPreview");
  const btnBolModalClose = document.getElementById("btn-bol-modal-close");
  const btnBolModalPrint = document.getElementById("btn-bol-modal-print");
  const btnBolModalDownload = document.getElementById("btn-bol-modal-download");
  const btnLinkToEvidence = document.getElementById("btn-link-to-evidence");

  // Lightbox Elements
  const imageViewerModal = document.getElementById("ordImageViewerModal");
  const closeImageViewerBtn = document.getElementById("closeImageViewer");
  const lightboxImg = document.getElementById("ord-lightbox-img");
  const lightboxDownloadLink = document.getElementById("ord-lightbox-download");

  // Buttons - Main
  const btnNewOrder = document.getElementById("btn-new-order");
  const btnHistory = document.getElementById("btn-order-history");

  // Form Elements
  const modalTitle = document.querySelector("#newOrderModal h3");
  const closeNewOrderBtn = document.getElementById("closeNewOrderModal");
  const cancelNewOrderBtn = document.getElementById("cancelNewOrderBtn");
  const submitOrderBtn = document.getElementById("submitNewOrderBtn");

  const ordArrivalDateInput = document.getElementById("ord-arrival-date");
  const ordArrivalSlotInput = document.getElementById("ord-arrival-slot");
  const ordDeliveryDateInput = document.getElementById("ord-delivery-date");

  const ordAttachmentInput = document.getElementById("ord-attachment");
  const draftItemsList = document.getElementById("ord-new-items-list");
  const btnOpenSelector = document.getElementById("btn-open-product-selector");

  const closeSelectorBtn = document.getElementById("closeProductSelector");
  const productSearchInput = document.getElementById("ord-product-search");
  const productGridContainer = document.getElementById("ord-product-grid-container");

  const closeItemConfigBtn = document.getElementById("closeItemConfigModal");
  const cancelItemConfigBtn = document.getElementById("cancelItemConfigBtn");
  const confirmAddItemBtn = document.getElementById("confirmAddItemBtn");
  const btnConfirmText = document.getElementById("btn-confirm-text");

  const confItemName = document.getElementById("conf-item-name");
  const confItemId = document.getElementById("conf-item-id");
  const confItemQty = document.getElementById("conf-item-qty");
  const confItemUnit = document.getElementById("conf-item-unit");
  const confItemCalc = document.getElementById("conf-item-calc");

  const closeViewOrderBtn = document.getElementById("closeViewOrderModal");
  const btnCloseViewFooter = document.getElementById("btnCloseViewFooter");

  // History Filters
  const histMonthSelect = document.getElementById("hist-month");
  const histYearSelect = document.getElementById("hist-year");
  const histSearchInput = document.getElementById("hist-search");
  const btnFilterHistory = document.getElementById("btn-filter-history");

  // --- INITIALIZATION ---
  async function init() {
    console.log("Orders Portal V9.4 (Restored & Fixed): Initializing...");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("No active user found.");
      return;
    }
    currentUser = user;

    setupEventListeners();
    setupDateValidationLogic();
    setMinDate();
    populateHistoryFilters();
    await loadProducts();
    await loadActiveOrders();
    subscribeToRealtime();

    document.addEventListener("moduleWillUnload", cleanupModule, {
      once: true,
    });
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      console.log("Tab became visible. Refreshing data...");
      loadActiveOrders();

      if (
        !realtimeSubscription ||
        realtimeSubscription.state === "closed" ||
        realtimeSubscription.state === "errored"
      ) {
        console.log("Re-activating zombie subscription...");
        if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
        realtimeSubscription = null;
        subscribeToRealtime();
      }
    }
  }

  function cleanupModule() {
    if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.body.dataset.ordersPortalInitialized = "false";
  }

  function setupDateValidationLogic() {
    ordArrivalDateInput.addEventListener("change", () => {
      const arrivalVal = ordArrivalDateInput.value;
      if (!arrivalVal) return;
      ordDeliveryDateInput.min = arrivalVal;
      if (
        ordDeliveryDateInput.value &&
        ordDeliveryDateInput.value < arrivalVal
      ) {
        ordDeliveryDateInput.value = "";
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "info",
          title: "Outbound date reset. Must be after arrival.",
          showConfirmButton: false,
          timer: 3000,
        });
      }
    });
  }

  function setMinDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const minDateStr = `${yyyy}-${mm}-${dd}`;

    if (ordArrivalDateInput) ordArrivalDateInput.min = minDateStr;
    if (ordDeliveryDateInput) ordDeliveryDateInput.min = minDateStr;
  }

  function formatStringDate(dateStr) {
    if (!dateStr) return "-";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
  }

  function subscribeToRealtime() {
    if (
      realtimeSubscription &&
      (realtimeSubscription.state === "joined" ||
        realtimeSubscription.state === "joining")
    ) {
      return;
    }

    console.log("Starting Realtime Subscription...");
    realtimeSubscription = supabase
      .channel(CHANNEL_NAME)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: ORDERS_TABLE },
        () => {
          clearTimeout(realtimeDebounceTimer);
          realtimeDebounceTimer = setTimeout(() => {
            if (document.visibilityState === "visible") {
              loadActiveOrders();
              if (historyModal.classList.contains("open")) loadHistory();
            }
          }, 500);
        },
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });
  }

  // --- DATA LOADING ---
  async function loadProducts() {
    const { data, error } = await supabase
      .from("production_products")
      .select("*")
      .order("name");
    if (error) return console.error("Error loading products:", error);
    productsCache = data || [];
    renderProductGrid(productsCache);
  }

  function calculateWeightLbs(productPartial, totalCases) {
    if (!totalCases) return 0;
    let product = productPartial;
    if (!product || !product.value_per_piece) {
      if (productPartial && productPartial.id) {
        const cached = productsCache.find((p) => p.id === productPartial.id);
        if (cached) product = cached;
      } else if (
        typeof productPartial === "string" ||
        typeof productPartial === "number"
      ) {
        const cached = productsCache.find((p) => p.id === productPartial);
        if (cached) product = cached;
      }
    }
    if (!product) return 0;

    let netContentG = parseFloat(product.value_per_piece) || 0;
    const uom = (product.unit_of_measure || "g").toLowerCase();
    if (uom === "kg" || uom === "l") netContentG *= 1000;

    const pkgWeightG = parseFloat(product.packaging_weight_g) || 0;
    const itemWeightG = netContentG + pkgWeightG;
    const unitsPerCase = parseInt(product.units_per_case) || 1;
    const contentWeightPerCaseG = itemWeightG * unitsPerCase;
    const caseWeightG = parseFloat(product.case_weight_g) || 0;
    const totalWeightPerCaseG = contentWeightPerCaseG + caseWeightG;
    const grandTotalG = totalWeightPerCaseG * totalCases;

    return grandTotalG * 0.00220462;
  }

  async function loadActiveOrders() {
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select(`*, production_products (*), profiles (*)`)
      .neq("status", "cancelled")
      .neq("status", "archived")
      .order("created_at", { ascending: false });

    if (error) return console.error("Error fetching orders:", error);

    const rawData = data || [];
    const groups = {};

    rawData.forEach((row) => {
      const code = row.unique_order_code;
      if (!groups[code]) {
        groups[code] = {
          ...row,
          items: [],
          total_pallets: 0,
          total_cases: 0, 
          total_units: 0, 
          total_weight_lbs: 0,
          is_multi: false,
        };
      }
      groups[code].items.push(row);
      groups[code].total_pallets += row.qty_calculated_pallets || 0;
      groups[code].total_cases += row.qty_calculated_cases || 0;
      
      const unitsPerCase = row.production_products?.units_per_case || 1;
      const actualUnits = (row.qty_calculated_cases || 0) * unitsPerCase;
      groups[code].total_units += actualUnits;

      const itemWeight = calculateWeightLbs(
        row.production_products,
        row.qty_calculated_cases,
      );
      groups[code].total_weight_lbs += itemWeight;
    });

    Object.values(groups).forEach((g) => {
      if (g.items.length > 1) g.is_multi = true;
    });
    groupedActiveOrders = Object.values(groups);

    updateScorecards(groupedActiveOrders);
    applyFiltersAndRender();
  }

  // --- SCORECARDS LOGIC [FIXED FROM BACKUP] ---
  function updateScorecards(groupedOrders) {
    const calcStats = (orders) => {
      const total = orders.length;
      const urg = orders.filter((o) => o.is_expedited).length;
      const reg = total - urg;
      return { total, reg, urg };
    };

    const incomingOrders = groupedOrders.filter((o) =>
      ["waiting_arrival", "pending"].includes(o.status)
    );
    const incomingStats = calcStats(incomingOrders);
    if (domScorecards.incoming.total) {
      domScorecards.incoming.total.textContent = incomingStats.total;
      domScorecards.incoming.reg.textContent = incomingStats.reg;
      domScorecards.incoming.urg.textContent = incomingStats.urg;
    }

    const receivingOrders = groupedOrders.filter((o) =>
      ["receiving_in_progress", "partial_received"].includes(o.status)
    );
    const receivingStats = calcStats(receivingOrders);
    if (domScorecards.receiving.total) {
      domScorecards.receiving.total.textContent = receivingStats.total;
      domScorecards.receiving.reg.textContent = receivingStats.reg;
      domScorecards.receiving.urg.textContent = receivingStats.urg;
    }

    // [FIX APPLIED] Removed 'processing' from here
    const productionOrders = groupedOrders.filter((o) =>
      ["material_received", "production_planned", "production_in_progress"].includes(o.status)
    );
    const productionStats = calcStats(productionOrders);
    if (domScorecards.production.total) {
      domScorecards.production.total.textContent = productionStats.total;
      domScorecards.production.reg.textContent = productionStats.reg;
      domScorecards.production.urg.textContent = productionStats.urg;
    }

    const readyOrders = groupedOrders.filter((o) =>
      ["production_completed", "ready_to_load"].includes(o.status)
    );
    const readyStats = calcStats(readyOrders);
    if (domScorecards.ready.total) {
      domScorecards.ready.total.textContent = readyStats.total;
      domScorecards.ready.reg.textContent = readyStats.reg;
      domScorecards.ready.urg.textContent = readyStats.urg;
    }

    // [FIX APPLIED] Added 'processing' here
    const dispatchingOrders = groupedOrders.filter((o) =>
      ["loading", "processing"].includes(o.status)
    );
    const dispatchingStats = calcStats(dispatchingOrders);
    if (domScorecards.dispatching.total) {
      domScorecards.dispatching.total.textContent = dispatchingStats.total;
      domScorecards.dispatching.reg.textContent = dispatchingStats.reg;
      domScorecards.dispatching.urg.textContent = dispatchingStats.urg;
    }

    const shippedOrders = groupedOrders.filter((o) =>
      ["shipped", "completed"].includes(o.status),
    );
    const shippedStats = calcStats(shippedOrders);
    if (domScorecards.shipped.total) {
      domScorecards.shipped.total.textContent = shippedStats.total;
      domScorecards.shipped.reg.textContent = shippedStats.reg;
      domScorecards.shipped.urg.textContent = shippedStats.urg;
    }
  }

  function applyFiltersAndRender() {
    let filtered = groupedActiveOrders;

    if (showOnlyUrgent) {
      filtered = filtered.filter((o) => o.is_expedited);
    }

    if (currentPhaseFilter !== "all") {
      const phaseMap = {
        inbound: ["waiting_arrival", "pending", "receiving_in_progress", "partial_received"],
        production: ["material_received", "production_planned", "production_in_progress", "processing"],
        outbound: ["production_completed", "ready_to_load", "loading"], 
        shipped: ["shipped", "completed"]
      };
      
      const allowedStatuses = phaseMap[currentPhaseFilter] || [];
      filtered = filtered.filter((o) => allowedStatuses.includes(o.status));
    }

    const searchVal = filterProductSearch && filterProductSearch.value ? filterProductSearch.value.trim().toLowerCase() : "";
    if (searchVal) {
        filtered = filtered.filter(o => {
            const pName = o.production_products?.name?.toLowerCase() || "";
            return pName.includes(searchVal);
        });
    }

    const startVal = filterDateStart && filterDateStart.value ? filterDateStart.value : null;
    const endVal = filterDateEnd && filterDateEnd.value ? filterDateEnd.value : null;

    if (startVal || endVal) {
        filtered = filtered.filter(o => {
            const d = o.created_at.split('T')[0];
            if (startVal && d < startVal) return false;
            if (endVal && d > endVal) return false;
            return true;
        });
    }

    renderActiveTable(filtered);
  }

  // --- ORDER CREATION & EDITING LOGIC ---
  // (Logic preserved from Backup)

  function openItemConfig(product) {
    tempConfigProduct = product;
    editingDraftItemIndex = -1;

    confItemName.value = `${product.sku} - ${product.name}`;
    confItemId.value = product.id;
    confItemQty.value = 1;
    confItemUnit.value = "pallets";

    if (btnConfirmText) btnConfirmText.textContent = "Add to Order";

    calculateConfigConversion();
    closeModal(productSelectorModal);
    openModal(itemConfigModal);
    setTimeout(() => confItemQty.focus(), 100);
  }

  window.ordEditDraftItem = function (index) {
    if (index < 0 || index >= currentOrderDraft.length) return;

    const item = currentOrderDraft[index];
    const product =
      item.product_details ||
      productsCache.find((p) => p.id === item.product_id);

    if (!product) {
      Swal.fire("Error", "Product details not found.", "error");
      return;
    }

    tempConfigProduct = product;
    editingDraftItemIndex = index;

    confItemName.value = `${product.sku} - ${product.name}`;
    confItemId.value = product.id;
    confItemQty.value = item.qty_requested;
    confItemUnit.value = item.unit_type;

    if (btnConfirmText) btnConfirmText.textContent = "Update Item";

    calculateConfigConversion();
    openModal(itemConfigModal);
    setTimeout(() => confItemQty.focus(), 100);
  };

  function calculateConfigConversion() {
    const qty = parseFloat(confItemQty.value);
    const unit = confItemUnit.value;
    const prod = tempConfigProduct;

    if (!prod || !qty || qty <= 0) {
      confItemCalc.value = "0 Cases / 0 Pallets / 0 lbs";
      return;
    }

    const cpp = prod.cases_per_pallet || 1;
    const upc = prod.units_per_case || 1;
    let totalCases = 0,
      totalPallets = 0;

    if (unit === "cases") {
      totalCases = qty;
      totalPallets = qty / cpp;
    } else if (unit === "units") {
      totalCases = qty / upc;
      totalPallets = totalCases / cpp;
    } else if (unit === "pallets") {
      totalPallets = qty;
      totalCases = qty * cpp;
    }

    const estWeight = calculateWeightLbs(prod, totalCases);

    confItemCalc.value = `${
      Number.isInteger(totalCases) ? totalCases : totalCases.toFixed(2)
    } Cases / ${
      Number.isInteger(totalPallets) ? totalPallets : totalPallets.toFixed(2)
    } Plt / ${Math.round(estWeight).toLocaleString()} lbs`;
  }

  function handleAddItemToDraft() {
    if (!tempConfigProduct) return;
    const qty = parseFloat(confItemQty.value);
    const unit = confItemUnit.value;
    if (qty <= 0) {
      Swal.fire(
        "Invalid Quantity",
        "Please enter a valid quantity.",
        "warning",
      );
      return;
    }

    const cpp = tempConfigProduct.cases_per_pallet || 1;
    const upc = tempConfigProduct.units_per_case || 1;
    let calcCases = 0,
      calcPallets = 0;

    if (unit === "cases") {
      calcCases = qty;
      calcPallets = qty / cpp;
    } else if (unit === "units") {
      calcCases = qty / upc;
      calcPallets = calcCases / cpp;
    } else if (unit === "pallets") {
      calcPallets = qty;
      calcCases = qty * cpp;
    }

    const newItemData = {
      product_id: tempConfigProduct.id,
      product_name: tempConfigProduct.name,
      sku: tempConfigProduct.sku,
      qty_requested: qty,
      unit_type: unit,
      qty_calculated_cases: calcCases,
      qty_calculated_pallets: calcPallets,
      product_details: tempConfigProduct,
    };

    if (editingDraftItemIndex > -1) {
      if (currentOrderDraft[editingDraftItemIndex].id) {
        newItemData.id = currentOrderDraft[editingDraftItemIndex].id;
      }
      currentOrderDraft[editingDraftItemIndex] = newItemData;

      editingDraftItemIndex = -1;
    } else {
      currentOrderDraft.push(newItemData);
    }

    closeModal(itemConfigModal);
    renderDraftTable();
    tempConfigProduct = null;
    if (btnConfirmText) btnConfirmText.textContent = "Add to Order";
  }

  function renderDraftTable() {
    draftItemsList.innerHTML = "";

    if (currentOrderDraft.length === 0) {
      draftItemsList.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--color-text-secondary);">No items added yet. Click "Add Product" to begin.</td></tr>`;
      return;
    }

    let grandTotalLbs = 0;

    currentOrderDraft.forEach((item, index) => {
      const tr = document.createElement("tr");
      const pallets = parseFloat(item.qty_calculated_pallets).toFixed(2);
      const cases = parseFloat(item.qty_calculated_cases).toFixed(1);
      
      const unitsPerCase = item.product_details?.units_per_case || 1;
      const totalUnits = Math.round(item.qty_calculated_cases * unitsPerCase);

      const weightLbs = calculateWeightLbs(
        item.product_id,
        item.qty_calculated_cases,
      );
      grandTotalLbs += weightLbs;

      const statusBadge = item.id
        ? `<small style="color:#666;">(Existing)</small>`
        : `<small style="color:#28a745; font-weight:bold;">(New)</small>`;
      const displayStatus = isEditingMode ? statusBadge : "";

      tr.innerHTML = `
            <td><strong>${item.product_name}</strong> ${displayStatus}</td>
            <td>${item.qty_requested} ${item.unit_type}</td>
            <td>${cases}</td>
            <td>${totalUnits}</td>
            <td>${pallets}</td>
            <td style="font-weight:600;">${Math.round(weightLbs).toLocaleString()}</td>
            <td>
                <div class="ord-actions-flex">
                    <button class="btn-action-icon btn-action-edit" title="Edit Quantity" onclick="window.ordEditDraftItem(${index})"><i class='bx bx-pencil'></i></button>
                    <button class="btn-remove-item" title="Remove Item" onclick="window.ordRemoveDraftItem(${index})"><i class='bx bx-trash'></i></button>
                </div>
            </td>
        `;
      draftItemsList.appendChild(tr);
    });

    const totalRow = document.createElement("tr");
    totalRow.style.backgroundColor = "#f0f9ff";
    totalRow.style.fontWeight = "bold";
    totalRow.innerHTML = `
        <td colspan="5" style="text-align:right; padding-right:1rem;">ESTIMATED TOTAL LBS:</td>
        <td style="color:var(--goldmex-primary-color);">${Math.round(grandTotalLbs).toLocaleString()}</td>
        <td></td>
    `;
    draftItemsList.appendChild(totalRow);
  }

  window.ordRemoveDraftItem = function (index) {
    currentOrderDraft.splice(index, 1);
    renderDraftTable();
  };

  // --- SUBMIT HANDLERS ---
  async function handleSubmitOrder(e) {
    if (e) e.preventDefault();

    if (currentOrderDraft.length === 0) {
      return Swal.fire(
        "Empty Order",
        "Please add at least one product.",
        "warning",
      );
    }

    const arrivalDate = ordArrivalDateInput.value;
    const arrivalSlot = ordArrivalSlotInput.value;
    const deliveryDate = ordDeliveryDateInput.value;

    if (!arrivalDate || !arrivalSlot) {
      return Swal.fire(
        "Missing Info",
        "Please select Arrival Date and Slot.",
        "warning",
      );
    }

    if (!deliveryDate) {
      return Swal.fire(
        "Missing Info",
        "Please select a requested outbound/delivery date.",
        "warning",
      );
    }

    if (deliveryDate < arrivalDate) {
      return Swal.fire(
        "Date Error",
        "Outbound date cannot be before Arrival date.",
        "error",
      );
    }

    submitOrderBtn.disabled = true;
    submitOrderBtn.innerHTML =
      "<i class='bx bx-loader-alt bx-spin'></i> Processing...";

    try {
      if (isEditingMode) {
        await processUpdateOrder(deliveryDate, arrivalDate, arrivalSlot);
      } else {
        await processCreateOrder(deliveryDate, arrivalDate, arrivalSlot);
      }
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.message, "error");
    } finally {
      submitOrderBtn.disabled = false;
      submitOrderBtn.textContent = isEditingMode
        ? "Update Order"
        : "Submit Order";
    }
  }

  async function processCreateOrder(deliveryDate, arrivalDate, arrivalSlot) {
    let attachmentUrl = await uploadAttachmentIfPresent();

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("warehouse, full_name")
      .eq("id", currentUser.id)
      .single();

    if (profileError) throw profileError;

    const warehouseCode = profileData.warehouse
      ? profileData.warehouse.toUpperCase()
      : "UNK";

    const clientNameStr = profileData.full_name || "CLIENT";
    const clientCode = clientNameStr.substring(0, 3).toUpperCase();

    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const yy = String(today.getFullYear()).slice(-2);
    const datePart = `${mm}${dd}${yy}`;

    const basePrefix = `${warehouseCode}${clientCode}${datePart}`;

    const { data: lastOrder, error: fetchLastErr } = await supabase
      .from(ORDERS_TABLE)
      .select("unique_order_code, created_at")
      .ilike("unique_order_code", `${basePrefix}-%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchLastErr) throw fetchLastErr;

    let nextSeq = 1;

    if (lastOrder && lastOrder.unique_order_code) {
      const parts = lastOrder.unique_order_code.split("-");
      if (parts.length > 0) {
        const lastSeqStr = parts[parts.length - 1];
        const lastSeqNum = parseInt(lastSeqStr, 10);
        if (!isNaN(lastSeqNum)) {
          nextSeq = lastSeqNum + 1;
        }
      }
    }

    const seqStr = String(nextSeq).padStart(2, "0");
    const orderCode = `${basePrefix}-${seqStr}`;

    const rowsToInsert = currentOrderDraft.map((item) => ({
      unique_order_code: orderCode,
      client_id: currentUser.id,
      product_id: item.product_id,
      qty_requested: item.qty_requested,
      unit_type: item.unit_type,
      qty_calculated_cases: item.qty_calculated_cases,
      qty_calculated_pallets: item.qty_calculated_pallets,
      requested_delivery_date: deliveryDate,

      inbound_arrival_date: arrivalDate,
      inbound_slot: arrivalSlot,
      inbound_checked_in_at: null,

      attachment_url: attachmentUrl,
      status: "waiting_arrival",
      is_expedited: false,
    }));

    const { error } = await supabase.from(ORDERS_TABLE).insert(rowsToInsert);
    if (error) throw error;

    Swal.fire({
      title: "Success!",
      text: `Order ${orderCode} created.`,
      icon: "success",
      confirmButtonColor: "var(--goldmex-primary-color)",
    }).then(() => {
      const tempRow = {
        unique_order_code: orderCode,
        inbound_arrival_date: arrivalDate,
        inbound_slot: arrivalSlot,
      };
      const rowBase64 = encodeURIComponent(JSON.stringify(tempRow));

      closeModal(newOrderModal);
      resetNewOrderForm();

      window.ordViewInboundPass(rowBase64);
    });
  }

  async function processUpdateOrder(deliveryDate, arrivalDate, arrivalSlot) {
    if (!editingOrderCode) throw new Error("Order Code Missing");

    const { data: dbItems, error: fetchErr } = await supabase
      .from(ORDERS_TABLE)
      .select("id")
      .eq("unique_order_code", editingOrderCode);
    if (fetchErr) throw fetchErr;

    const dbIds = dbItems.map((i) => i.id);
    const draftIds = currentOrderDraft.filter((i) => i.id).map((i) => i.id);

    const idsToDelete = dbIds.filter((id) => !draftIds.includes(id));

    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabase
        .from(ORDERS_TABLE)
        .delete()
        .in("id", idsToDelete);
      if (delErr) throw delErr;
    }

    const itemsToInsert = currentOrderDraft.filter((i) => !i.id);
    const itemsToUpdate = currentOrderDraft.filter((i) => i.id);

    if (itemsToInsert.length > 0) {
      let attachmentUrl = await uploadAttachmentIfPresent();

      const insertPayload = itemsToInsert.map((item) => ({
        unique_order_code: editingOrderCode,
        client_id: editingOrderClientId || currentUser.id,
        product_id: item.product_id,
        qty_requested: item.qty_requested,
        unit_type: item.unit_type,
        qty_calculated_cases: item.qty_calculated_cases,
        qty_calculated_pallets: item.qty_calculated_pallets,
        requested_delivery_date: deliveryDate,

        inbound_arrival_date: arrivalDate,
        inbound_slot: arrivalSlot,

        attachment_url: attachmentUrl,
        status: "waiting_arrival", // Assumption
        is_expedited: editingOrderIsExpedited,
      }));

      const { error: insErr } = await supabase
        .from(ORDERS_TABLE)
        .insert(insertPayload);
      if (insErr) throw insErr;
    }

    for (const item of itemsToUpdate) {
      const { error: updErr } = await supabase
        .from(ORDERS_TABLE)
        .update({
          qty_requested: item.qty_requested,
          unit_type: item.unit_type,
          qty_calculated_cases: item.qty_calculated_cases,
          qty_calculated_pallets: item.qty_calculated_pallets,
          requested_delivery_date: deliveryDate,
          inbound_arrival_date: arrivalDate,
          inbound_slot: arrivalSlot,
        })
        .eq("id", item.id);
      if (updErr) throw updErr;
    }

    const { error: globalErr } = await supabase
      .from(ORDERS_TABLE)
      .update({
        requested_delivery_date: deliveryDate,
        inbound_arrival_date: arrivalDate,
        inbound_slot: arrivalSlot,
      })
      .eq("unique_order_code", editingOrderCode);
    if (globalErr) throw globalErr;

    Swal.fire({
      title: "Updated!",
      text: "Order updated successfully.",
      icon: "success",
    });
    closeModal(newOrderModal);
    resetNewOrderForm();
  }

  async function uploadAttachmentIfPresent() {
    if (ordAttachmentInput.files.length > 0) {
      const file = ordAttachmentInput.files[0];
      const fileName = `${currentUser.id}/${Date.now()}.${file.name
        .split(".")
        .pop()}`;
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(fileName, file);
      if (!error) {
        const { data } = supabase.storage
          .from(ATTACHMENT_BUCKET)
          .getPublicUrl(fileName);
        return data.publicUrl;
      }
    }
    return null;
  }

  function resetNewOrderForm() {
    currentOrderDraft = [];
    isEditingMode = false;
    editingOrderCode = null;
    editingOrderIsExpedited = false;
    editingOrderClientId = null;
    editingDraftItemIndex = -1;

    modalTitle.innerHTML = "<i class='bx bxs-cart-add'></i> Create New Order";
    submitOrderBtn.textContent = "Submit Order";
    renderDraftTable();
    ordDeliveryDateInput.value = "";
    ordArrivalDateInput.value = "";
    ordArrivalSlotInput.value = "morning";
    ordAttachmentInput.value = "";
    setMinDate();
  }

  // --- HISTORY LOGIC ---
  function populateHistoryFilters() {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    histMonthSelect.innerHTML = '<option value="">All Months</option>';
    months.forEach((m, i) => {
      histMonthSelect.innerHTML += `<option value="${i + 1}">${m}</option>`;
    });
    const currentYear = new Date().getFullYear();
    histYearSelect.innerHTML = '<option value="">All Years</option>';
    for (let i = 0; i < 5; i++) {
      histYearSelect.innerHTML += `<option value="${currentYear - i}">${currentYear - i}</option>`;
    }
  }

  async function loadHistory() {
    let query = supabase
      .from(ORDERS_TABLE)
      .select(`*, production_products!inner (*), profiles (*)`)
      .or("status.eq.cancelled,status.eq.archived")
      .order("created_at", { ascending: false });

    const month = histMonthSelect.value;
    const year = histYearSelect.value;
    const search = histSearchInput.value.trim().toLowerCase();

    if (year) {
      let startDate, endDate;
      if (month) {
        startDate = new Date(year, month - 1, 1).toISOString();
        endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
      } else {
        startDate = new Date(year, 0, 1).toISOString();
        endDate = new Date(year, 11, 31, 23, 59, 59).toISOString();
      }
      query = query.gte("created_at", startDate).lte("created_at", endDate);
    } else if (month) {
      const currentY = new Date().getFullYear();
      const startDate = new Date(currentY, month - 1, 1).toISOString();
      const endDate = new Date(currentY, month, 0, 23, 59, 59).toISOString();
      query = query.gte("created_at", startDate).lte("created_at", endDate);
    }

    const { data, error } = await query;
    if (error) {
      console.error("History Error", error);
      return;
    }

    let rawData = data || [];
    if (search) {
      rawData = rawData.filter((row) => {
        const code = (row.unique_order_code || "").toLowerCase();
        const prodName = (row.production_products?.name || "").toLowerCase();
        const sku = (row.production_products?.sku || "").toLowerCase();
        return (
          code.includes(search) ||
          prodName.includes(search) ||
          sku.includes(search)
        );
      });
    }

    const groups = {};
    rawData.forEach((row) => {
      const code = row.unique_order_code;
      if (!groups[code]) {
        groups[code] = {
          ...row,
          items: [],
          total_pallets: 0,
          total_weight_lbs: 0,
          is_multi: false,
        };
      }
      groups[code].items.push(row);
      groups[code].total_pallets += row.qty_calculated_pallets || 0;
      const itemWeight = calculateWeightLbs(
        row.production_products,
        row.qty_calculated_cases,
      );
      groups[code].total_weight_lbs += itemWeight;
    });

    Object.values(groups).forEach((g) => {
      if (g.items.length > 1) g.is_multi = true;
    });
    groupedHistoryOrders = Object.values(groups);

    renderHistoryTable(groupedHistoryOrders);
  }

  // --- UI HELPERS ---

  window.ordEdit = async function (id) {
    const { data: targetRow } = await supabase
      .from(ORDERS_TABLE)
      .select("unique_order_code, status, is_expedited, client_id")
      .eq("id", id)
      .single();
    if (!targetRow) return Swal.fire("Error", "Order not found", "error");

    if (
      targetRow.status !== "pending" &&
      targetRow.status !== "waiting_arrival"
    )
      return Swal.fire(
        "Restricted",
        "Only pending orders can be edited.",
        "warning",
      );

    const { data: allItems, error } = await supabase
      .from(ORDERS_TABLE)
      .select(`*, production_products (*), profiles (*)`)
      .eq("unique_order_code", targetRow.unique_order_code);

    if (error || !allItems.length)
      return Swal.fire("Error", "Could not load order details.", "error");

    isEditingMode = true;
    editingOrderCode = targetRow.unique_order_code;
    editingOrderIsExpedited = targetRow.is_expedited || false;
    editingOrderClientId = targetRow.client_id;
    editingDraftItemIndex = -1;

    currentOrderDraft = allItems.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.production_products.name,
      sku: item.production_products.sku,
      qty_requested: item.qty_requested,
      unit_type: item.unit_type,
      qty_calculated_cases: item.qty_calculated_cases,
      qty_calculated_pallets: item.qty_calculated_pallets,
      product_details: item.production_products,
    }));

    // Populate Edit Form
    ordDeliveryDateInput.value = allItems[0].requested_delivery_date;
    ordArrivalDateInput.value = allItems[0].inbound_arrival_date || "";
    ordArrivalSlotInput.value = allItems[0].inbound_slot || "morning";

    if (ordArrivalDateInput.value) {
      ordDeliveryDateInput.min = ordArrivalDateInput.value;
    }

    modalTitle.innerHTML = `<i class='bx bx-edit'></i> Edit Order <span style="font-family:monospace;">${editingOrderCode}</span>`;
    submitOrderBtn.textContent = "Update Order";

    renderDraftTable();
    openModal(newOrderModal);
  };

  function renderProductGrid(products) {
    productGridContainer.innerHTML = "";
    if (products.length === 0) {
      productGridContainer.innerHTML =
        '<p style="grid-column:1/-1; text-align:center; color:#888;">No products found.</p>';
      return;
    }
    products.forEach((p) => {
      const card = document.createElement("div");
      card.className = "ord-prod-card";
      card.dataset.id = p.id;
      // Removed SKU for cleaner look
      card.innerHTML = `<i class='bx bx-package'></i><h5>${p.name}</h5>`;
      card.onclick = () => openItemConfig(p);
      productGridContainer.appendChild(card);
    });
  }

  // --- ACTION HELPERS ---

  window.ordCancel = async function (id) {
    const result = await Swal.fire({
      title: "Cancel Order?",
      text: "This cancels ALL items in the order.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, cancel",
    });
    if (result.isConfirmed) {
      const { data: targetRow } = await supabase
        .from(ORDERS_TABLE)
        .select("unique_order_code")
        .eq("id", id)
        .single();
      if (targetRow) {
        const { error } = await supabase
          .from(ORDERS_TABLE)
          .update({ status: "cancelled" })
          .eq("unique_order_code", targetRow.unique_order_code);
        if (error) Swal.fire("Error", error.message, "error");
        else Swal.fire("Cancelled!", "Order cancelled.", "success");
      }
    }
  };

  window.ordArchive = async function (id) {
    const { data: targetRow } = await supabase
      .from(ORDERS_TABLE)
      .select("unique_order_code")
      .eq("id", id)
      .single();
    if (!targetRow) return;
    const result = await Swal.fire({
      title: "Archive Order?",
      text: "Move entire order to history?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#059669",
      confirmButtonText: "Yes, Archive",
    });
    if (result.isConfirmed) {
      const { error } = await supabase
        .from(ORDERS_TABLE)
        .update({ status: "archived" })
        .eq("unique_order_code", targetRow.unique_order_code);
      if (error) Swal.fire("Error", error.message, "error");
      else Swal.fire("Archived!", "Order moved to history.", "success");
    }
  };

  window.ordExpedite = async function (orderId) {
    const { data: targetRow } = await supabase
      .from(ORDERS_TABLE)
      .select("unique_order_code")
      .eq("id", orderId)
      .single();
    if (!targetRow) return;
    const result = await Swal.fire({
      title: "Mark Urgent?",
      text: "Flag entire order?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Yes",
    });
    if (result.isConfirmed) {
      const { error } = await supabase
        .from(ORDERS_TABLE)
        .update({ is_expedited: true })
        .eq("unique_order_code", targetRow.unique_order_code);
      if (error) Swal.fire("Error", error.message, "error");
      else Swal.fire("Expedited!", "Marked as urgent.", "success");
    }
  };

  window.viewOrderItemsList = function (code) {
    let group = groupedActiveOrders.find((g) => g.unique_order_code === code);
    if (!group)
      group = groupedHistoryOrders.find((g) => g.unique_order_code === code);
    if (!group) return;

    let htmlList = `<div style="max-height: 300px; overflow-y: auto; padding-right: 5px;">
        <ul style="text-align:left; list-style:none; padding:0;">`;

    group.items.forEach((item) => {
      const weight = calculateWeightLbs(
        item.product_id,
        item.qty_calculated_cases,
      );
      htmlList += `
        <li style="padding:5px 0; border-bottom:1px solid #eee;">
            <strong>${item.production_products.name}</strong><br>
            <small>${item.qty_requested} ${item.unit_type} | ${Math.round(weight).toLocaleString()} lbs</small>
        </li>`;
    });
    htmlList += `</ul></div>`;

    Swal.fire({
      title: `Items in ${code}`,
      html: htmlList,
      confirmButtonColor: "var(--goldmex-primary-color)",
    });
  };

  window.ordView = function (rowBase64) {
    const row = JSON.parse(decodeURIComponent(rowBase64));
    document.getElementById("view-code").textContent = row.unique_order_code;

    let statusBadgeHtml = "";
    const rawStatus = row.status;

    if (rawStatus === "receiving_in_progress") {
      statusBadgeHtml = `<span class="ord-status-badge status-receiving_in_progress"><span class="live-dot"></span> LIVE UNLOADING</span>`;
    } else if (rawStatus === "partial_received") {
      statusBadgeHtml = `<span class="ord-status-badge status-partial_received"><i class='bx bx-time-five'></i> PAUSED / PARTIAL</span>`;
    } else if (rawStatus === "production_in_progress") {
      statusBadgeHtml = `<span class="ord-status-badge status-production_in_progress"><span class="live-dot"></span> IN PRODUCTION</span>`;
    } else if (rawStatus === "production_planned") {
      statusBadgeHtml = `<span class="ord-status-badge status-production_planned">PRODUCTION PLANNED</span>`;
    } else if (rawStatus === "processing") {
      statusBadgeHtml = `<span class="ord-status-badge status-processing">OUTBOUND PROCESSING</span>`;
    } else {
      const label = rawStatus.replace(/_/g, " ").toUpperCase();
      statusBadgeHtml = `<span class="ord-status-badge status-${rawStatus}">${label}</span>`;
    }

    document.getElementById("view-status").innerHTML = statusBadgeHtml;

    document.getElementById("view-date").textContent = formatStringDate(
      row.requested_delivery_date,
    );

    const inboundStatusEl = document.getElementById("view-inbound-status");
    const btnViewPass = document.getElementById("btn-view-inbound-pass");

    let inbStatus = "Waiting Arrival";
    let inbColor = "#0c4a6e";

    const now = new Date();
    const arrival = row.inbound_arrival_date
      ? new Date(row.inbound_arrival_date)
      : null;

    if (row.status === "receiving_in_progress") {
      inbStatus = "LIVE OPERATION";
      inbColor = "#2563eb";
    } else if (row.status === "partial_received") {
      inbStatus = "Partial Receipt (Paused)";
      inbColor = "#ea580c";
    } else if (row.inbound_checked_in_at) {
      inbStatus = "Received";
      inbColor = "#15803d";
    } else if (
      arrival &&
      now > arrival &&
      now.toDateString() !== arrival.toDateString()
    ) {
      inbStatus = "Delayed";
      inbColor = "#b91c1c";
    } else if (row.status === "waiting_arrival") {
      inbStatus = "Waiting Arrival";
    }

    if (inboundStatusEl) {
      inboundStatusEl.textContent = `${inbStatus} (${formatStringDate(row.inbound_arrival_date)})`;
      inboundStatusEl.style.color = inbColor;
      if (row.status === "receiving_in_progress") {
        inboundStatusEl.style.fontWeight = "800";
        inboundStatusEl.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> ${inboundStatusEl.textContent}`;
      }
    }

    if (btnViewPass) {
      btnViewPass.onclick = () => window.ordViewInboundPass(rowBase64);
    }

    const dynamicContainer = document.getElementById("view-dynamic-content");

    // [MODIFIED] Detailed table showing SKU, Cases, Units, etc.
    let itemsHtml = `
        <div>
            <h5 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px;">Order Items (Detailed)</h5>
            <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <tr style="background:#f9fafb; color:#666;">
                    <th style="padding:5px; text-align:left;">Product / SKU</th>
                    <th style="padding:5px; text-align:center;">Orig. Qty</th>
                    <th style="padding:5px; text-align:center;">Cases (Calc)</th>
                    <th style="padding:5px; text-align:center;">Pcs (Calc)</th>
                    <th style="padding:5px; text-align:center;">Pallets</th>
                    <th style="padding:5px; text-align:right;">Weight</th>
                </tr>
    `;

    row.items.forEach((item) => {
      const lineWeight = calculateWeightLbs(
        item.product_id,
        item.qty_calculated_cases,
      );
      const unitsPerCase = item.production_products?.units_per_case || 1;
      const totalUnits = Math.round(item.qty_calculated_cases * unitsPerCase);

      itemsHtml += `
            <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:8px 5px;">
                    <strong>${item.production_products?.name}</strong><br>
                    <small style="color:#666;">${item.production_products?.sku || "N/A"}</small>
                </td>
                <td style="padding:8px 5px; text-align:center;">${item.qty_requested} ${item.unit_type}</td>
                <td style="padding:8px 5px; text-align:center;">${parseFloat(item.qty_calculated_cases).toFixed(1)}</td>
                <td style="padding:8px 5px; text-align:center;">${totalUnits}</td>
                <td style="padding:8px 5px; text-align:center;">${parseFloat(item.qty_calculated_pallets).toFixed(2)}</td>
                <td style="padding:8px 5px; text-align:right;">${Math.round(lineWeight).toLocaleString()} lbs</td>
            </tr>
        `;
    });

    itemsHtml += `<tr style="background:#f0f9ff; font-weight:bold;">
        <td style="padding:8px 5px; text-align:right;">TOTALS:</td>
        <td style="padding:8px 5px;">-</td>
        <td style="padding:8px 5px; text-align:center;">${row.total_cases.toLocaleString()}</td>
        <td style="padding:8px 5px; text-align:center;">${row.total_units.toLocaleString()}</td>
        <td style="padding:8px 5px; text-align:center;">${row.total_pallets.toFixed(2)}</td>
        <td style="padding:8px 5px; text-align:right;">${Math.round(row.total_weight_lbs).toLocaleString()} lbs</td>
    </tr></table></div>`;

    dynamicContainer.innerHTML = itemsHtml;

    const docsContainer = document.getElementById("view-docs");
    docsContainer.innerHTML = "";
    if (row.attachment_url)
      docsContainer.innerHTML += `<a href="${row.attachment_url}" target="_blank" style="color:var(--goldmex-primary-color)"><i class='bx bx-file'></i> PO Attachment</a><br>`;
    
    // [MODIFIED V9.4] Dynamic Files Button - Logic restored & enhanced
    if (["shipped", "completed", "archived"].includes(row.status)) {
        docsContainer.innerHTML += `
            <button onclick="window.ordViewEvidence('${rowBase64}', 'outbound')" class="btn-ord-primary" style="margin-top:10px; font-size:0.8rem;">
                <i class='bx bxs-file-pdf'></i> View BOL / Evidence
            </button>
        `;
    } else if (["material_received", "partial_received", "production_planned", "production_in_progress", "production_completed", "ready_to_load", "processing", "loading"].includes(row.status)) {
        docsContainer.innerHTML += `
            <button onclick="window.ordViewEvidence('${rowBase64}', 'inbound')" class="btn-ord-secondary" style="margin-top:10px; font-size:0.8rem; border-color:#0284c7; color:#0284c7;">
                <i class='bx bx-import'></i> View Inbound Evidence
            </button>
        `;
    } else {
        docsContainer.innerHTML += `<small style="color:#999; display:block; margin-top:5px;">* Evidence available after reception.</small>`;
    }

    openModal(viewOrderModal);
  };

  // --- SPLIT VIEW FUNCTIONS (Updated) ---

  window.ordViewDocs = function (rowBase64) {
    const row = JSON.parse(decodeURIComponent(rowBase64));
    bolRenderContainer.innerHTML = renderBolHtml(row);
    btnBolModalClose.onclick = () => closeModal(bolPreviewModal);
    if (btnCloseBolPreview)
      btnCloseBolPreview.onclick = () => closeModal(bolPreviewModal);

    btnBolModalPrint.onclick = () => {
      const content = bolRenderContainer.innerHTML;
      const win = window.open("", "", "height=700,width=900");
      win.document.write("<html><head><title>Print BOL</title></head><body>");
      win.document.write(content);
      win.document.write("</body></html>");
      win.document.close();
      win.print();
    };

    btnBolModalDownload.onclick = () => downloadBolPdf(row);

    btnLinkToEvidence.onclick = () => {
      closeModal(bolPreviewModal);
      setTimeout(() => window.ordViewEvidence(rowBase64, 'outbound'), 200);
    };

    openModal(bolPreviewModal);
  };

  window.ordViewInboundPass = function (rowBase64) {
    const row = JSON.parse(decodeURIComponent(rowBase64));

    inboundRefCode.textContent = row.unique_order_code;
    inboundPassDate.textContent = formatStringDate(row.inbound_arrival_date);
    inboundPassSlot.textContent = (row.inbound_slot || "morning").toUpperCase();

    // [FIX APPLIED] Clear container before new generation
    inboundQrContainer.innerHTML = "";

    if (typeof QRCode !== "undefined") {
      new QRCode(inboundQrContainer, {
        text: row.unique_order_code,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
    } else {
      inboundQrContainer.textContent = "QR Error (Lib Missing)";
    }

    btnDownloadPass.onclick = () => {
      const element = document.getElementById("inbound-pass-card");

      if (
        typeof html2canvas !== "undefined" ||
        typeof html2pdf !== "undefined"
      ) {
        const canvasFunc =
          typeof html2canvas !== "undefined" ? html2canvas : null;

        if (canvasFunc) {
          canvasFunc(element, {
            scale: 2,
            backgroundColor: "#ffffff",
          }).then((canvas) => {
            const link = document.createElement("a");
            link.download = `PASS-${row.unique_order_code}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
          });
        } else {
          const opt = {
            margin: 0.2,
            filename: `PASS-${row.unique_order_code}.pdf`,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
          };
          html2pdf().set(opt).from(element).save();
        }
      } else {
        Swal.fire(
          "Error",
          "Library missing (html2canvas) for image download.",
          "error",
        );
      }
    };

    openModal(inboundPassModal);
  };

  // [MODIFIED] New Evidence Logic with Tabs
  window.ordViewEvidence = async function (rowBase64, activeTab = 'inbound') {
    const row = JSON.parse(decodeURIComponent(rowBase64));
    const orderCode = row.unique_order_code;

    // Set Static Info
    evOrderCode.textContent = orderCode;
    
    // Set Status Badge
    let statusLabel = row.status.replace(/_/g, " ").toUpperCase();
    let statusClass = `status-${row.status}`;
    evStatusContainer.innerHTML = `<span class="ord-status-badge ${statusClass}">${statusLabel}</span>`;

    // 1. Setup Outbound Data (from client_orders)
    evTransUnit.textContent = row.transport_unit || "--";
    evTransPlate.textContent = row.transport_plates || "--";
    evTransSeals.textContent = row.transport_seals || "--";
    
    evPhotoGrid.innerHTML = "";
    if (row.evidence_photos && row.evidence_photos.length > 0) {
      row.evidence_photos.forEach((url) => {
        const imgContainer = document.createElement("div");
        imgContainer.className = "ord-prod-card";
        imgContainer.style.padding = "0";
        imgContainer.style.overflow = "hidden";
        imgContainer.style.height = "120px";
        imgContainer.style.position = "relative";
        imgContainer.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; cursor:pointer;"><div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.5); padding:5px; text-align:right;"><i class='bx bx-zoom-in' style="color:white; font-size:1.2rem;"></i></div>`;
        imgContainer.onclick = () => openLightbox(url);
        evPhotoGrid.appendChild(imgContainer);
      });
    } else {
      evPhotoGrid.innerHTML = `<p style="grid-column:1/-1; color:#999; text-align:center;">No outbound photos.</p>`;
    }

    // 2. Setup Inbound Data (Fetch from RECEIVING_LOGS_TABLE)
    evInbUser.textContent = "Loading...";
    evInbDate.textContent = "--";
    evInbNotes.textContent = "--";
    evInbPhotoGrid.innerHTML = '<p style="grid-column:1/-1; color:#999; text-align:center;">Loading...</p>';

    const { data: logs, error } = await supabase
      .from(RECEIVING_LOGS_TABLE)
      .select("*")
      .eq("order_code", orderCode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logs) {
        evInbUser.textContent = logs.received_by || "Unknown";
        evInbDate.textContent = new Date(logs.created_at).toLocaleString();
        evInbNotes.textContent = logs.notes || "No notes.";
        
        evInbPhotoGrid.innerHTML = "";
        if (logs.evidence_photos && logs.evidence_photos.length > 0) {
            logs.evidence_photos.forEach((url) => {
                const imgContainer = document.createElement("div");
                imgContainer.className = "ord-prod-card";
                imgContainer.style.padding = "0";
                imgContainer.style.overflow = "hidden";
                imgContainer.style.height = "120px";
                imgContainer.style.position = "relative";
                imgContainer.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; cursor:pointer;"><div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.5); padding:5px; text-align:right;"><i class='bx bx-zoom-in' style="color:white; font-size:1.2rem;"></i></div>`;
                imgContainer.onclick = () => openLightbox(url);
                evInbPhotoGrid.appendChild(imgContainer);
            });
        } else {
             evInbPhotoGrid.innerHTML = `<p style="grid-column:1/-1; color:#999; text-align:center;">No inbound photos.</p>`;
        }
    } else {
        evInbUser.textContent = "N/A";
        evInbPhotoGrid.innerHTML = `<p style="grid-column:1/-1; color:#999; text-align:center;">Reception log not found.</p>`;
    }

    // 3. Logic for Tabs
    const setTab = (tabName) => {
        // Reset Styles
        btnTabInbound.style.borderBottomColor = "transparent";
        btnTabInbound.style.fontWeight = "normal";
        btnTabOutbound.style.borderBottomColor = "transparent";
        btnTabOutbound.style.fontWeight = "normal";
        
        evContentInbound.style.display = "none";
        evContentOutbound.style.display = "none";
        
        if (btnLinkToDocs) btnLinkToDocs.style.display = "none";

        if (tabName === 'inbound') {
            btnTabInbound.style.borderBottomColor = "#0284c7";
            btnTabInbound.style.fontWeight = "bold";
            evContentInbound.style.display = "block";
            evModalHeader.style.background = "#0284c7"; 
        } else {
            btnTabOutbound.style.borderBottomColor = "#059669";
            btnTabOutbound.style.fontWeight = "bold";
            evContentOutbound.style.display = "block";
            evModalHeader.style.background = "#059669"; 
            
             if (btnLinkToDocs) {
                 btnLinkToDocs.style.display = "inline-flex";
                 btnLinkToDocs.onclick = () => {
                     closeModal(evidenceModal);
                     setTimeout(() => window.ordViewDocs(rowBase64), 200);
                 };
             }
        }
    };

    btnTabInbound.onclick = () => setTab('inbound');
    btnTabOutbound.onclick = () => setTab('outbound');

    setTab(activeTab);

    if (closeEvidenceBtn)
      closeEvidenceBtn.onclick = () => closeModal(evidenceModal);
    if (btnCloseEvidenceFooter)
      btnCloseEvidenceFooter.onclick = () => closeModal(evidenceModal);
    
    openModal(evidenceModal);
  };

  function openLightbox(url) {
    lightboxImg.src = url;
    lightboxDownloadLink.href = url;
    openModal(imageViewerModal);
  }

  // [MODIFIED] renderBolHtml - KEEPING BACKUP LOGIC (Complex one)
  function renderBolHtml(row) {
    const bolNumber = row.bol_number || `PENDING-${row.unique_order_code}`;
    const client = row.profiles || {};
    const fullAddress = `${client.address || ""}<br>${client.city || ""}, ${client.state || ""} ${client.zip || ""}`;
    const clientEmail = client.email
      ? client.email.split("@")[0].toUpperCase()
      : "CLIENT";
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

    row.items.forEach((item) => {
      const actualPallets = Math.ceil(item.qty_calculated_pallets);
      const actualCases =
        actualPallets * (item.production_products?.cases_per_pallet || 1);
      const weightLbs = calculateWeightLbs(
        item.production_products,
        actualCases,
      );
      totalPallets += actualPallets;
      totalWeight += weightLbs;
      itemRows.push({
        palletQty: actualPallets,
        palletType: "Pallet",
        caseQty: actualCases,
        caseType: "Cases",
        weight: weightLbs,
        desc: item.production_products?.name || "Item",
        nmfc: "",
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

      const pageBreak =
        i < totalPages - 1 ? 'style="page-break-after: always;"' : "";
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
    const element = document.getElementById("ord-bol-render-container");
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

  // [MODIFIED] Render Active Table - Files Button + Scorecards
  function renderActiveTable(data) {
    if ($.fn.DataTable.isDataTable(tableActiveEl)) {
      const dt = $(tableActiveEl).DataTable();
      dt.clear().rows.add(data).draw(false);
      activeOrdersTable = dt;
    } else {
      activeOrdersTable = $(tableActiveEl).DataTable({
        destroy: true,
        data: data,
        dom: '<"ord-dt-header"lf>rt<"ord-dt-footer"ip>',
        scrollY: "50vh",
        scrollCollapse: true,
        responsive: false,
        paging: true,
        pageLength: 10,
        columns: [
          {
            title: "Created",
            data: "created_at",
            className: "dt-center",
            render: (d) => {
                if (!d) return "-";
                const date = new Date(d);
                return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth()+1).padStart(2, '0')}/${date.getFullYear()}`;
            }
          },
          {
            title: "Order #",
            data: "unique_order_code",
            className: "dt-center",
            render: (d) =>
              `<span style="font-weight:700; color:var(--goldmex-primary-color)">${d}</span>`,
          },
          {
            title: "Product",
            data: null,
            className: "dt-center",
            render: (row) =>
              row.is_multi
                ? `<span class="text-link-action" onclick="window.viewOrderItemsList('${row.unique_order_code}')"><i class='bx bx-layer'></i> Multi-Item Order (${row.items.length})</span>`
                : row.production_products.name || "Unknown",
          },
          {
            title: "Schedule (In - Out)",
            data: null,
            className: "dt-center",
            render: (row) => {
                const arr = formatStringDate(row.inbound_arrival_date);
                const dep = formatStringDate(row.requested_delivery_date);
                return `<div style="font-family:monospace; font-size:0.9rem;">${arr} - ${dep}</div>`;
            }
          },
          {
            title: "Request", 
            data: null,
            className: "dt-center",
            render: (row) => {
                if (currentUnitView === 'cases') {
                    return `<strong>${row.total_cases.toLocaleString()}</strong> <small>Cs</small>`;
                } else if (currentUnitView === 'pieces') {
                    return `<strong>${row.total_units.toLocaleString()}</strong> <small>Pcs</small>`;
                } else if (currentUnitView === 'lbs') {
                    return `<strong>${Math.round(row.total_weight_lbs).toLocaleString()}</strong> <small>Lbs</small>`;
                } else {
                    return `<strong>${parseFloat(row.total_pallets).toFixed(1)}</strong> <small>Plts</small>`;
                }
            }
          },
          {
            title: "Status",
            data: "status",
            className: "dt-center",
            render: (status) => {
              if (status === 'receiving_in_progress') {
                return `<span class="ord-status-badge status-receiving_in_progress"><span class="live-dot"></span> LIVE UNLOADING</span>`;
              }
              if (status === 'partial_received') {
                return `<span class="ord-status-badge status-partial_received"><i class='bx bx-time-five'></i> PAUSED</span>`;
              }
              if (status === 'production_in_progress') {
                return `<span class="ord-status-badge status-production_in_progress"><span class="live-dot"></span> IN PROD</span>`;
              }
              const label = status.replace(/_/g, " ").toUpperCase();
              return `<span class="ord-status-badge status-${status}">${label}</span>`;
            }
          },
          // [MODIFIED] Dynamic Files Column (Request)
          {
            title: "Files",
            data: null,
            className: "dt-center",
            render: (row) => {
                const rowStr = encodeURIComponent(JSON.stringify(row));
                // Outbound State (Green) - Shipped
                if (["shipped", "completed", "archived"].includes(row.status)) {
                    return `<button class="btn-view-files" style="color:#059669; border-color:#059669; background:#ecfdf5;" onclick="window.ordViewEvidence('${rowStr}', 'outbound')"><i class='bx bx-export'></i> Outbound</button>`;
                } 
                // Inbound State (Blue) - Shows if already received
                else if (["material_received", "partial_received", "production_planned", "production_in_progress", "production_completed", "ready_to_load", "processing", "loading"].includes(row.status)) {
                    return `<button class="btn-view-files" style="color:#0284c7; border-color:#0284c7; background:#e0f2fe;" onclick="window.ordViewEvidence('${rowStr}', 'inbound')"><i class='bx bx-import'></i> Inbound</button>`;
                }
                // Pre-Receipt
                return "-";
            },
          },
          {
            title: "Urgent",
            data: null,
            className: "dt-center",
            render: (row) =>
              row.is_expedited
                ? `<i class='bx bxs-hot' style="color:#ef4444"></i>`
                : (row.status === "pending" || row.status === "waiting_arrival")
                  ? `<button class="btn-expedite" onclick="window.ordExpedite('${row.id}')"><i class='bx bxs-zap'></i></button>`
                  : "-",
          },
          {
            title: "Actions",
            data: null,
            className: "dt-center",
            render: (row) => {
              const rowStr = encodeURIComponent(JSON.stringify(row));
              let btns = `<div class="ord-actions-flex">`;

              btns += `<button class="btn-action-icon" style="color:#0c4a6e; background:#e0f2fe;" onclick="window.ordViewInboundPass('${rowStr}')" title="Pass"><i class='bx bx-qr'></i></button>`;

              btns += `<button class="btn-action-icon btn-action-view" onclick="window.ordView('${rowStr}')"><i class='bx bx-show'></i></button>`;

              if (row.status === "pending" || row.status === "waiting_arrival") {
                btns += `<button class="btn-action-icon btn-action-edit" onclick="window.ordEdit('${row.id}')"><i class='bx bx-pencil'></i></button><button class="btn-action-icon btn-action-cancel" onclick="window.ordCancel('${row.id}')"><i class='bx bx-x'></i></button>`;
              } 
              
              if (row.status === "shipped" || row.status === "completed")
                btns += `<button class="btn-action-icon btn-action-archive" onclick="window.ordArchive('${row.id}')"><i class='bx bx-check'></i></button>`;

              btns += `</div>`;
              return btns;
            },
          },
        ],
        order: [[0, "desc"]],
      });
    }
  }

  function renderHistoryTable(data) {
    if ($.fn.DataTable.isDataTable(tableHistoryEl)) {
      const dt = $(tableHistoryEl).DataTable();
      dt.clear().rows.add(data).draw(false);
      historyOrdersTable = dt;
    } else {
      historyOrdersTable = $(tableHistoryEl).DataTable({
        destroy: true,
        data: data,
        dom: '<"ord-dt-header"lf>rt<"ord-dt-footer"ip>',
        scrollY: "50vh",
        scrollCollapse: true,
        responsive: false,
        paging: true,
        pageLength: 20,
        columns: [
          { title: "Order #", data: "unique_order_code", className: "dt-center" },
          {
            title: "Date",
            data: "requested_delivery_date",
            className: "dt-center",
            render: (d) => formatStringDate(d),
          },
          {
            title: "Product",
            data: null,
            className: "dt-center",
            render: (row) =>
              row.is_multi
                ? `Multi (${row.items.length})`
                : row.production_products.name,
          },
          {
            title: "Status",
            data: "status",
            className: "dt-center",
            render: (d) =>
              `<span class="ord-status-badge status-${d}">${d}</span>`,
          },
          {
            title: "Docs / Evidence",
            data: null,
            className: "dt-center",
            render: (row) => {
              const rowStr = encodeURIComponent(JSON.stringify(row));
              return `
                  <button class="btn-view-files" onclick="window.ordViewEvidence('${rowStr}', 'outbound')"><i class='bx bxs-file-pdf'></i> View</button>
              `;
            },
          },
          {
            title: "Actions",
            data: null,
            className: "dt-center",
            render: (row) =>
              `<button class="btn-action-icon btn-action-view" onclick="window.ordView('${encodeURIComponent(JSON.stringify(row))}')"><i class='bx bx-show'></i></button>`,
          },
        ],
      });
    }
  }

  function openModal(modal) {
    modal.classList.add("open");
  }
  function closeModal(modal) {
    modal.classList.remove("open");
  }

  function setupEventListeners() {
    btnNewOrder.onclick = () => {
      resetNewOrderForm();
      openModal(newOrderModal);
    };
    closeNewOrderBtn.onclick = () => closeModal(newOrderModal);
    cancelNewOrderBtn.onclick = () => closeModal(newOrderModal);
    submitOrderBtn.onclick = handleSubmitOrder;

    btnOpenSelector.onclick = () => {
      productSearchInput.value = "";
      openModal(productSelectorModal);
      setTimeout(() => productSearchInput.focus(), 100);
    };
    closeSelectorBtn.onclick = () => closeModal(productSelectorModal);
    productSearchInput.oninput = (e) => {
      const term = e.target.value.toLowerCase();
      productGridContainer
        .querySelectorAll(".ord-prod-card")
        .forEach(
          (c) =>
          (c.style.display = c.innerText.toLowerCase().includes(term)
            ? "block"
            : "none"),
        );
    };

    closeItemConfigBtn.onclick = () => closeModal(itemConfigModal);
    if (cancelItemConfigBtn) {
      cancelItemConfigBtn.onclick = () => closeModal(itemConfigModal);
    }

    confirmAddItemBtn.onclick = handleAddItemToDraft;
    confItemQty.oninput = calculateConfigConversion;
    confItemUnit.onchange = calculateConfigConversion;

    btnHistory.onclick = () => {
      openModal(historyModal);
      loadHistory();
    };
    if (document.getElementById("closeHistoryModal"))
      document.getElementById("closeHistoryModal").onclick = () =>
        closeModal(historyModal);
    btnFilterHistory.onclick = loadHistory;

    closeViewOrderBtn.onclick = () => closeModal(viewOrderModal);
    if (btnCloseViewFooter)
      btnCloseViewFooter.onclick = () => closeModal(viewOrderModal);
    btnRefresh.onclick = loadActiveOrders;

    // V9.0 Filter Listeners
    if (filterPhaseSelect) {
        filterPhaseSelect.addEventListener('change', (e) => {
            currentPhaseFilter = e.target.value;
            applyFiltersAndRender();
        });
    }

    if (filterUrgentBtn) {
        filterUrgentBtn.addEventListener('click', () => {
            showOnlyUrgent = !showOnlyUrgent;
            if (showOnlyUrgent) {
                filterUrgentBtn.style.background = '#ef4444';
                filterUrgentBtn.style.color = '#ffffff';
                if(filterUrgentText) filterUrgentText.textContent = "Showing Urgent";
            } else {
                filterUrgentBtn.style.background = '#fef2f2';
                filterUrgentBtn.style.color = '#ef4444';
                if(filterUrgentText) filterUrgentText.textContent = "Show Only Urgent";
            }
            applyFiltersAndRender();
        });
    }

    if (filterDateStart && filterDateEnd) {
        filterDateStart.addEventListener('change', applyFiltersAndRender);
        filterDateEnd.addEventListener('change', applyFiltersAndRender);
    }

    if (filterProductSearch) {
        filterProductSearch.addEventListener('keyup', () => {
            applyFiltersAndRender();
        });
    }

    if (unitSwitchButtons) {
        unitSwitchButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                unitSwitchButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentUnitView = e.target.dataset.unit;
                renderActiveTable(groupedActiveOrders); 
                applyFiltersAndRender(); 
            });
        });
    }

    if (closeEvidenceBtn)
      closeEvidenceBtn.onclick = () => closeModal(evidenceModal);
    if (btnCloseBolPreview)
      btnCloseBolPreview.onclick = () => closeModal(bolPreviewModal);
    if (closeImageViewerBtn)
      closeImageViewerBtn.onclick = () => closeModal(imageViewerModal);
    if (btnBolModalClose)
      btnBolModalClose.onclick = () => closeModal(bolPreviewModal);
    if (closeInboundPassBtn)
      closeInboundPassBtn.onclick = () => closeModal(inboundPassModal);

    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  init();
})();