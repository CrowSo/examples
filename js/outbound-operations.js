// js/outbound-operations.js - V8.1 (Fixed: Disappearing Claimed Orders & Strict Gatekeeper)
(function () {
  // --- 1. CONFIG & DEPENDENCIES ---
  if (!window.supabase) return console.error("Supabase missing");
  if (typeof Swal === "undefined") console.warn("SweetAlert2 missing");

  // Check for Html5Qrcode library
  let hasCameraLib = typeof Html5Qrcode !== "undefined";
  if (!hasCameraLib)
    console.warn("Html5Qrcode library not loaded yet (checking pending...).");

  const moduleContainer = document.querySelector(".out-container");
  if (!moduleContainer) return;

  const ORDERS_TABLE = "client_orders";
  const PRODUCTION_TABLE = "production_log";
  const BUCKET_EVIDENCE = "shipping-evidence";

  // --- STATE ---
  let currentUser = null;
  let allOrdersRaw = [];
  let groupedOrders = {};
  let currentActiveOrderCode = null;
  let currentScanSession = {
    active: false,
    rowId: null,
    productId: null,
    targetQty: 0,
    initialCount: 0,
    sessionCount: 0,
    qrs: [],
  };
  let realTimeSub = null;

  // Camera State
  let html5QrCode = null;
  let isCameraRunning = false;

  // --- DOM ELEMENTS (Main) ---
  const globalStatus = document.getElementById("out-global-status");
  const btnRefresh = document.getElementById("out-refresh-btn");
  const searchInput = document.getElementById("out-search-order");
  const filterTabs = document.querySelectorAll(".filter-tab");
  const ordersListContainer = document.getElementById("out-orders-list");

  const stateEmpty = document.getElementById("out-state-empty");
  const stateActive = document.getElementById("out-state-active");

  const activeHeaderLeft = document.getElementById("out-header-left-container");
  const activeCode = document.getElementById("out-active-code");
  const activeStatus = document.getElementById("out-active-status");
  const activeClient = document.getElementById("out-active-client");
  const activeTotalPallets = document.getElementById(
    "out-active-total-pallets",
  );

  const itemsTrack = document.getElementById("out-items-container");
  const btnSlidePrev = document.getElementById("btn-slide-prev");
  const btnSlideNext = document.getElementById("btn-slide-next");

  const loadingSection = document.getElementById("out-loading-section");
  const loadingMsg = document.getElementById("out-loading-msg");
  const loadingActions = document.getElementById("out-loading-actions");

  const btnPrintBol = document.getElementById("out-btn-print-bol");

  // --- DOM ELEMENTS (Load Modal) ---
  const loadModal = document.getElementById("outLoadModal");
  const photoInput = document.getElementById("out-photo-input");
  const photoGrid = document.getElementById("out-photo-grid");
  const photoCountMsg = document.getElementById("out-photo-count");

  const inputTransportUnit = document.getElementById("out-transport-unit");
  const inputTransportCaja = document.getElementById("out-transport-caja");
  const inputTransportSeals = document.getElementById("out-transport-seals");
  const inputSpecialInstructions = document.getElementById(
    "out-special-instructions",
  );

  const btnConfirmLoad = document.getElementById("confirmLoadBtn");
  const btnCancelLoad = document.getElementById("cancelLoadBtn");
  const btnCloseLoadModal = document.getElementById("closeLoadModal");

  // --- DOM ELEMENTS (Scan Modal & Camera) ---
  const scanModal = document.getElementById("outScanModal");
  const scanTitle = document.getElementById("scan-modal-title");
  const scanInput = document.getElementById("out-scan-input");
  const btnCameraScan = document.getElementById("btn-camera-scan");
  const scanFeedback = document.getElementById("out-scanner-feedback");
  const scanCurrentDisplay = document.getElementById("scan-current");
  const scanTargetDisplay = document.getElementById("scan-target");
  const scanProgressFill = document.getElementById("scan-progress-fill");
  const scanList = document.getElementById("out-scan-list");
  const btnConfirmItem = document.getElementById("out-btn-confirm-item");
  const btnCancelScan = document.getElementById("out-btn-cancel-scan");
  const closeScanModalBtn = document.getElementById("closeScanModal");

  // Camera specific DOM
  const readerContainer = document.getElementById("out-reader-container");
  const btnStopCamera = document.getElementById("btn-stop-camera");

  // --- DOM ELEMENTS (BOL Preview) ---
  const bolModal = document.getElementById("outBolPreviewModal");
  const bolContainer = document.getElementById("bol-render-container");
  const btnBolClose = document.getElementById("btn-bol-close");
  const closeBolModalIcon = document.getElementById("closeBolModal");
  const btnBolPrint = document.getElementById("btn-bol-print");
  const btnBolDownload = document.getElementById("btn-bol-download");

  // --- DOM ELEMENTS (Details Modal) ---
  const detailsModal = document.getElementById("outDetailsModal");
  const btnCloseDetails = document.getElementById("closeDetailsModal");
  const btnCloseDetailsFooter = document.getElementById(
    "btnCloseDetailsFooter",
  );

  const detUser = document.getElementById("out-det-user");
  const detStart = document.getElementById("out-det-start");
  const detEnd = document.getElementById("out-det-end");
  const detDuration = document.getElementById("out-det-duration");
  const detTrailer = document.getElementById("out-det-trailer");
  const detPlate = document.getElementById("out-det-plate");
  const detSeals = document.getElementById("out-det-seals");
  const detNotes = document.getElementById("out-det-notes");
  const detPhotosGrid = document.getElementById("out-det-photos");
  const detItemsList = document.getElementById("out-det-items-list");

  let evidencePhotos = [];

  // --- 2. INITIALIZATION ---
  async function init() {
    console.log("Outbound Ops V8.1 Initialized (Fixed Claim Logic)");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUser = user;

    setupEventListeners();
    await fetchOrders();
    subscribeRealtime();
  }

  // --- 3. DATA FETCHING (STRICT FILTER + PROCESSING FIX) ---
  async function fetchOrders() {
    const icon = btnRefresh.querySelector("i");
    if (icon) icon.classList.add("bx-spin");
    globalStatus.textContent = "Syncing...";

    // 30 Days history for shipped items
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString();

    // [MODIFIED V8.1] - Added 'processing' to allow list so claimed orders don't disappear
    // EXCLUDED: pending, waiting_arrival, material_received, production_planned, production_in_progress
    const allowedStatuses = `production_completed,processing,ready_to_load,loading,shipped,completed,archived`;

    const { data: ordersData, error: ordersError } = await supabase
      .from(ORDERS_TABLE)
      .select(
        `
                *,
                production_products (id, name, sku, cases_per_pallet, units_per_case, value_per_piece, unit_of_measure, packaging_weight_g, case_weight_g),
                profiles (email, address, city, state, zip)
            `,
      )
      .neq("status", "cancelled")
      .or(`status.in.(${allowedStatuses})`)
      .gte("created_at", "2023-01-01")
      .order("created_at", { ascending: false });

    if (icon) icon.classList.remove("bx-spin");

    if (ordersError) {
      console.error("Orders Error:", ordersError);
      globalStatus.textContent = "Sync Error";
      return;
    }

    // Double check filtering
    const validSet = new Set([
      "production_completed",
      "processing",
      "ready_to_load",
      "loading",
      "shipped",
      "completed",
      "archived",
    ]);
    allOrdersRaw = (ordersData || []).filter((o) => validSet.has(o.status));

    groupOrdersLogic();

    // Stats for Header
    const readyCount = Object.values(groupedOrders).filter(
      (o) => o.status_aggregate === "production_completed",
    ).length;

    const processingCount = Object.values(groupedOrders).filter(
      (o) =>
        o.status_aggregate === "processing" || o.status_aggregate === "loading",
    ).length;

    globalStatus.textContent = `${readyCount} Ready | ${processingCount} Active`;

    const activeTab = document.querySelector(".filter-tab.active");
    const currentFilter = activeTab ? activeTab.dataset.filter : "pending";
    renderSidebar(currentFilter, searchInput.value);

    if (currentActiveOrderCode) {
      loadOrderDetails(currentActiveOrderCode);
    }
  }

  function groupOrdersLogic() {
    groupedOrders = {};
    allOrdersRaw.forEach((row) => {
      const code = row.unique_order_code;
      if (!groupedOrders[code]) {
        const clientEmail = row.profiles?.email || "Unknown";
        const addressObj = {
          line1: row.profiles?.address || "Address Pending",
          city: row.profiles?.city || "City",
          state: row.profiles?.state || "State",
          zip: row.profiles?.zip || "00000",
        };

        groupedOrders[code] = {
          code: code,
          client_id: row.client_id,
          client_email: clientEmail,
          client_address: addressObj,
          created_at: row.created_at,
          status_aggregate: "production_completed", // Default assumption for visible orders here
          is_expedited: row.is_expedited,

          started_at: row.started_at,
          completed_at: row.completed_at,
          processed_by: row.processed_by,
          evidence_photos: row.evidence_photos,

          items: [],
          shipping_data: {
            unit: row.transport_unit || "",
            caja: row.transport_plates || "",
            seals: row.transport_seals || "",
            instructions: row.notes || "",
            bol_url: row.bol_number,
          },
          total_pallets_target: 0,
        };
      }

      groupedOrders[code].items.push({
        row_id: row.id,
        product: row.production_products,
        qty_req_cases: row.qty_requested,
        qty_target_pallets: Math.ceil(row.qty_calculated_pallets),
        status: row.status,
      });

      groupedOrders[code].total_pallets_target += Math.ceil(
        row.qty_calculated_pallets,
      );
    });

    Object.values(groupedOrders).forEach((order) => {
      // Use the row status as the aggregate status since orders move as a block usually
      if (order.items.length > 0) {
        order.status_aggregate = order.items[0].status;
      }

      // Normalization
      if (order.status_aggregate === "ready_to_load")
        order.status_aggregate = "ready";
    });
  }

  // --- 4. SIDEBAR (FILTERS MAPPED TO NEW LOGIC) ---
  function renderSidebar(filter = "pending", searchTerm = "") {
    ordersListContainer.innerHTML = "";
    const ordersArray = Object.values(groupedOrders);

    const isToday = (dateString) => {
      if (!dateString) return false;
      const d = new Date(dateString);
      const today = new Date();
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      );
    };

    const filtered = ordersArray.filter((order) => {
      const matchesSearch = order.code
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      let matchesFilter = false;

      // [MODIFIED V8.1] - Filter Mapping
      if (filter === "pending") {
        // "Active" Tab = production_completed (Ready to be claimed)
        matchesFilter = order.status_aggregate === "production_completed";
      } else if (filter === "processing") {
        // "Processing" Tab = processing (Claimed by user)
        matchesFilter = order.status_aggregate === "processing";
      } else if (filter === "loading") {
        matchesFilter =
          order.status_aggregate === "loading" ||
          order.status_aggregate === "ready";
      } else if (filter === "shipped") {
        if (
          order.status_aggregate === "shipped" ||
          order.status_aggregate === "completed"
        ) {
          matchesFilter = true;
        } else if (order.status_aggregate === "archived") {
          matchesFilter = isToday(order.completed_at);
        }
      }

      return matchesSearch && matchesFilter;
    });

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (filtered.length === 0) {
      let emptyMsg = "No orders found.";
      if (filter === "pending")
        emptyMsg = "No finished production ready for shipping.";
      ordersListContainer.innerHTML = `<div style="padding:1rem; text-align:center; color:#999;">${emptyMsg}</div>`;
      return;
    }

    filtered.forEach((order) => {
      const el = document.createElement("div");
      el.className = `order-card ${currentActiveOrderCode === order.code ? "active" : ""}`;
      el.onclick = () => loadOrderDetails(order.code);
      const date = new Date(order.created_at).toLocaleDateString();
      const urgentMarker = order.is_expedited
        ? '<i class="bx bxs-hot" style="color:#ef4444; margin-right:5px;"></i>'
        : "";

      // [MODIFIED V8.1] Friendly Labels
      let statusLabel = order.status_aggregate.toUpperCase().replace(/_/g, " ");
      if (statusLabel === "PRODUCTION COMPLETED") statusLabel = "READY TO SHIP";
      if (statusLabel === "PROCESSING") statusLabel = "OUTBOUND PROCESSING";
      if (statusLabel === "READY") statusLabel = "READY TO LOAD";
      if (order.status_aggregate === "archived") statusLabel = "ARCHIVED";

      let ownerIcon = "";
      if (
        order.processed_by &&
        order.status_aggregate !== "shipped" &&
        order.status_aggregate !== "archived" &&
        order.status_aggregate !== "production_completed"
      ) {
        const isMine = currentUser && order.processed_by === currentUser.email;
        if (isMine) {
          ownerIcon = `<i class='bx bxs-user-check' style='color:var(--out-success); float:right;' title='Your Order'></i>`;
        } else {
          ownerIcon = `<i class='bx bxs-lock-alt' style='color:var(--out-text-light); float:right;' title='Locked by ${order.processed_by}'></i>`;
        }
      }

      el.innerHTML = `
                <div class="ord-id">
                    <span>${urgentMarker}${order.code}</span>
                    <span style="font-size:0.8rem; color:#999;">${date}</span>
                </div>
                <div class="ord-client">
                    Items: ${order.items.length}
                    ${ownerIcon}
                </div>
                <div class="ord-status status-${mapStatusColor(order.status_aggregate)}">
                    ${statusLabel}
                </div>
            `;
      ordersListContainer.appendChild(el);
    });
  }

  function mapStatusColor(status) {
    if (status === "production_completed") return "completed"; // Greenish/Blue
    if (status === "processing") return "processing"; // Orange
    if (status === "ready" || status === "ready_to_load") return "loading"; // Purple
    if (status === "loading") return "loading";
    if (status === "shipped" || status === "completed") return "completed";
    if (status === "archived") return "completed";
    return "pending";
  }

  // --- 5. WORKSPACE DETAIL ---
  async function loadOrderDetails(orderCode) {
    const order = groupedOrders[orderCode];
    if (!order) {
      if (currentActiveOrderCode === orderCode) resetWorkspace();
      return;
    }

    currentActiveOrderCode = orderCode;

    // Auto-switch tabs if needed based on status
    let targetFilter = "pending";
    if (order.status_aggregate === "processing") targetFilter = "processing";
    else if (
      order.status_aggregate === "loading" ||
      order.status_aggregate === "ready"
    )
      targetFilter = "loading";
    else if (
      order.status_aggregate === "shipped" ||
      order.status_aggregate === "completed" ||
      order.status_aggregate === "archived"
    )
      targetFilter = "shipped";
    else targetFilter = "pending";

    const activeTab = document.querySelector(".filter-tab.active");
    const currentFilter = activeTab ? activeTab.dataset.filter : "pending";

    if (currentFilter !== targetFilter) {
      filterTabs.forEach((t) => {
        if (t.dataset.filter === targetFilter) {
          t.classList.add("active");
        } else {
          t.classList.remove("active");
        }
      });
      renderSidebar(targetFilter, searchInput.value);
    } else {
      renderSidebar(currentFilter, searchInput.value);
    }

    stateEmpty.classList.add("hidden");
    stateActive.classList.remove("hidden");

    const oldBadges = activeHeaderLeft.querySelectorAll(".badge-expedited");
    oldBadges.forEach((b) => b.remove());

    if (order.is_expedited) {
      const badge = document.createElement("span");
      badge.className = "badge-expedited";
      badge.innerHTML = "<i class='bx bxs-hot'></i> URGENT / RUSH";
      activeHeaderLeft.prepend(badge);
    }

    activeCode.textContent = order.code;

    // [MODIFIED V8.1] Friendly Labels in Detail Header
    let statusLabel = order.status_aggregate.toUpperCase().replace(/_/g, " ");
    if (statusLabel === "PRODUCTION COMPLETED") statusLabel = "READY TO SHIP";
    if (statusLabel === "PROCESSING") statusLabel = "OUTBOUND PROCESSING";
    if (statusLabel === "READY") statusLabel = "READY TO LOAD";

    activeStatus.textContent = statusLabel;
    activeStatus.className = `out-big-badge status-${mapStatusColor(order.status_aggregate)}`;

    let clientDisplayName = "Unknown";
    if (order.client_email && order.client_email.includes("@")) {
      clientDisplayName = order.client_email.split("@")[0];
      clientDisplayName =
        clientDisplayName.charAt(0).toUpperCase() + clientDisplayName.slice(1);
    } else {
      clientDisplayName = "ID: " + order.client_id.substring(0, 8) + "...";
    }
    activeClient.textContent = clientDisplayName;
    activeTotalPallets.textContent = order.total_pallets_target;

    let accessLevel = "UNCLAIMED";
    let isFinished =
      order.status_aggregate === "shipped" ||
      order.status_aggregate === "archived";

    if (isFinished) {
      accessLevel = "READ_ONLY";
    } else if (order.processed_by) {
      if (currentUser && order.processed_by === currentUser.email) {
        accessLevel = "MINE";
      } else {
        accessLevel = "OTHERS";
      }
    } else {
      accessLevel = "UNCLAIMED";
    }

    updateHeaderOwnershipUI(accessLevel, order);

    const isGridReadOnly =
      accessLevel === "OTHERS" ||
      accessLevel === "UNCLAIMED" ||
      accessLevel === "READ_ONLY";
    await renderItemsGrid(order, isGridReadOnly, accessLevel);
    checkLoadingEligibility(order, accessLevel);
  }

  function updateHeaderOwnershipUI(accessLevel, order) {
    const existingActions = activeHeaderLeft.querySelectorAll(
      ".claim-actions-container",
    );
    existingActions.forEach((el) => el.remove());

    const container = document.createElement("div");
    container.className = "claim-actions-container";
    container.style.marginTop = "0.5rem";

    if (accessLevel === "UNCLAIMED") {
      container.innerHTML = `
            <button onclick="window.outClaimOrder()" class="btn-out-primary" style="background-color: var(--out-accent); color: #000; font-weight: 800; border: 2px solid #b3922d;">
                <i class='bx bx-check-circle'></i> CLAIM / START
            </button>
            <span style="font-size: 0.8rem; color: var(--out-text-light); margin-left: 10px;">
                <i class='bx bx-info-circle'></i> Claim to start scanning.
            </span>
          `;
    } else if (accessLevel === "OTHERS") {
      container.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 5px 10px; border-radius: 4px; display: inline-flex; align-items: center; gap: 5px; font-weight: 600; border: 1px solid #ef4444;">
                <i class='bx bxs-lock-alt'></i> PROCESSED BY: ${order.processed_by}
            </div>
          `;
    } else if (accessLevel === "MINE") {
      container.innerHTML = `
            <button onclick="window.outReleaseOrder()" class="btn-out-secondary" style="font-size: 0.8rem; padding: 4px 10px;">
                <i class='bx bx-log-out'></i> Release Order
            </button>
            <span style="font-size: 0.8rem; color: var(--out-success); margin-left: 10px; font-weight: 600;">
                <i class='bx bxs-user-check'></i> You are working on this.
            </span>
          `;
    }

    if (accessLevel !== "READ_ONLY") {
      activeHeaderLeft.appendChild(container);
    }
  }

  // --- CLAIM FUNCTION WITH RACE CONDITION FIX ---
  window.outClaimOrder = async function () {
    if (!currentActiveOrderCode) return;
    if (!currentUser) {
      Swal.fire("Error", "No user session found.", "error");
      return;
    }

    const loadingBtn = document.querySelector(
      ".claim-actions-container button",
    );
    if (loadingBtn) {
      loadingBtn.textContent = "Assigning...";
      loadingBtn.disabled = true;
    }

    const order = groupedOrders[currentActiveOrderCode];
    const itemIds = order.items.map((i) => i.row_id);

    const updates = {
      processed_by: currentUser.email,
      status: "processing", // We explicitly set it to processing once claimed
    };

    if (!order.started_at) {
      updates.started_at = new Date().toISOString();
    }

    const { data, error, count } = await supabase
      .from(ORDERS_TABLE)
      .update(updates, { count: "exact-rows" })
      .in("id", itemIds)
      .is("processed_by", null)
      .select();

    if (error) {
      Swal.fire(
        "Error",
        "System error claiming order: " + error.message,
        "error",
      );
      await fetchOrders();
    } else if (count === 0 && (!data || data.length === 0)) {
      Swal.fire({
        title: "Too Late!",
        text: "Another user has already claimed this order.",
        icon: "warning",
      });
      await fetchOrders();
    } else {
      await fetchOrders();
      loadOrderDetails(currentActiveOrderCode);
    }
  };

  // --- RELEASE FUNCTION WITH STATUS REVERT ---
  window.outReleaseOrder = async function () {
    if (!currentActiveOrderCode) return;

    const result = await Swal.fire({
      title: "Release Order?",
      text: "Others will be able to take this order. Continue?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, release it",
    });

    if (result.isConfirmed) {
      const order = groupedOrders[currentActiveOrderCode];
      const itemIds = order.items.map((i) => i.row_id);

      let totalScans = 0;
      order.items.forEach((item) => {
        totalScans += item.current_scans || 0;
      });

      let newStatus = "processing";
      let newStartedAt = order.started_at;

      // [MODIFIED] Revert logic
      if (totalScans === 0) {
        newStatus = "production_completed"; // Revert to 'ready to ship' state
        newStartedAt = null;
      }

      const { error } = await supabase
        .from(ORDERS_TABLE)
        .update({
          processed_by: null,
          status: newStatus,
          started_at: newStartedAt,
        })
        .in("id", itemIds);

      if (error) {
        Swal.fire("Error", "Could not release order.", "error");
      } else {
        await fetchOrders();
        loadOrderDetails(currentActiveOrderCode);

        if (newStatus === "production_completed") {
          const toast = Swal.mixin({
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 2000,
          });
          toast.fire({
            icon: "info",
            title: "Order released back to Ready queue",
          });
        }
      }
    }
  };

  function resetWorkspace() {
    currentActiveOrderCode = null;
    stateActive.classList.add("hidden");
    stateEmpty.classList.remove("hidden");

    filterTabs.forEach((t) => t.classList.remove("active"));
    const pendingTab = document.querySelector(
      '.filter-tab[data-filter="pending"]',
    );
    if (pendingTab) pendingTab.classList.add("active");

    renderSidebar("pending", "");
    if (searchInput) searchInput.value = "";
  }

  async function renderItemsGrid(
    order,
    isReadOnly = false,
    accessLevel = "MINE",
  ) {
    let html = "";
    const isOrderLoading = order.status_aggregate === "loading";
    const isOrderShipped =
      order.status_aggregate === "shipped" ||
      order.status_aggregate === "archived";

    const isUI_Locked = isOrderLoading || isOrderShipped || isReadOnly;

    for (const item of order.items) {
      const { count } = await supabase
        .from(PRODUCTION_TABLE)
        .select("id", { count: "exact" })
        .eq("allocated_order_item_id", item.row_id);

      const scannedCount = count || 0;
      const isComplete = scannedCount >= item.qty_target_pallets;
      item.current_scans = scannedCount;

      const progressPercent = Math.min(
        100,
        (scannedCount / item.qty_target_pallets) * 100,
      );

      let btnState = "";
      let btnText = "Scan Pallets";

      if (accessLevel === "UNCLAIMED") {
        btnState = "disabled";
        btnText = "<i class='bx bxs-lock-alt'></i> Claim to Scan";
      } else if (accessLevel === "OTHERS") {
        btnState = "disabled";
        btnText = "<i class='bx bxs-lock'></i> Locked";
      } else if (isUI_Locked || isComplete) {
        btnState = "disabled";
        btnText = isComplete
          ? '<i class="bx bx-check"></i> Complete'
          : "Locked";
      }

      const safeName = item.product?.name
        ? item.product.name.replace(/'/g, "\\'")
        : "Unknown";
      const resetBtnState = scannedCount > 0 && !isUI_Locked ? "" : "disabled";

      html += `
            <div class="item-card ${isComplete ? "completed" : ""}">
                <div class="item-header">
                    <h4>${item.product?.sku || "Unknown"}</h4>
                    <span class="item-desc">${item.product?.name || "No Description"}</span>
                </div>
                <div class="item-progress">
                    <div class="progress-bar">
                        <div class="fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <span class="progress-text">${scannedCount} / ${item.qty_target_pallets} Pallets</span>
                </div>
                
                <div class="item-actions">
                    <button class="btn-scan-item" 
                        ${btnState} 
                        onclick="window.outOpenScan('${item.row_id}', '${item.product.sku}', '${safeName}', ${item.qty_target_pallets}, ${scannedCount}, '${item.product.id}')">
                        ${btnText}
                    </button>
                    <button class="btn-reset-item" 
                        ${resetBtnState}
                        title="Reset / Release Items"
                        onclick="window.outResetItem('${item.row_id}', '${safeName}')">
                        <i class='bx bx-undo'></i>
                    </button>
                </div>
            </div>
            `;
    }

    itemsTrack.innerHTML = html;
  }

  function checkLoadingEligibility(order, accessLevel) {
    const allItemsComplete = order.items.every(
      (i) => i.current_scans >= i.qty_target_pallets,
    );
    const alreadyShipped =
      order.status_aggregate === "shipped" ||
      order.status_aggregate === "archived";
    const isLoading = order.status_aggregate === "loading";

    if (accessLevel !== "MINE" && !alreadyShipped) {
      loadingSection.classList.add("disabled");
      loadingMsg.classList.remove("hidden");
      loadingMsg.innerHTML =
        accessLevel === "UNCLAIMED"
          ? "<i class='bx bxs-lock-alt'></i> <b>Claim Order</b> to enable loading."
          : "<i class='bx bxs-lock'></i> Order is processed by another user.";
      loadingActions.classList.add("hidden");
      return;
    }

    if (!allItemsComplete) {
      loadingSection.classList.add("disabled");
      loadingMsg.classList.remove("hidden");
      loadingMsg.innerHTML =
        "<i class='bx bx-lock-alt'></i> Complete all items to enable loading.";
      loadingActions.classList.add("hidden");
      return;
    }

    loadingSection.classList.remove("disabled");
    loadingMsg.classList.add("hidden");
    loadingActions.classList.remove("hidden");

    if (alreadyShipped) {
      loadingActions.innerHTML = `
                <div style="text-align:center; margin-bottom:1rem;">
                    <span class="out-big-badge status-completed"><i class='bx bx-check-double'></i> Order Shipped</span>
                </div>
                <div style="display:flex; gap:1rem; justify-content:center;">
                    <button class="btn-out-primary large" onclick="window.outViewDetails('${order.code}')">
                        <i class='bx bx-list-ul'></i> View Details
                    </button>
                    <button class="btn-out-success large" onclick="window.printBOL()">
                        <i class='bx bxs-file-pdf'></i> View / Print BOL
                    </button>
                </div>
            `;
    } else if (isLoading) {
      loadingActions.innerHTML = `
                <button id="out-btn-resume-load" class="btn-out-primary large" onclick="window.outStartLoading()">
                    <i class='bx bxs-camera'></i> RESUME LOADING
                </button>
            `;
    } else {
      loadingActions.innerHTML = `
                <button id="out-btn-start-load" class="btn-out-primary large" onclick="window.outStartLoading()">
                    <i class='bx bxs-camera'></i> START LOADING PROCESS
                </button>
            `;
    }
  }

  // --- 6. SCANNING LOGIC ---
  window.outResetItem = async function (rowId, productName) {
    const result = await Swal.fire({
      title: "Release Items?",
      html: `Release items for: <br><b>${productName}</b><br><br>Return to 'On-Hand'?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, release",
    });

    if (result.isConfirmed) {
      const { error } = await supabase
        .from(PRODUCTION_TABLE)
        .update({
          status: "completed",
          allocated_order_item_id: null,
          notes: `Released manually from ${currentActiveOrderCode}`,
        })
        .eq("allocated_order_item_id", rowId);

      if (error) {
        Swal.fire("Error", "Failed to release.", "error");
      } else {
        Swal.fire({
          title: "Released",
          icon: "success",
          timer: 1000,
          showConfirmButton: false,
        });
        loadOrderDetails(currentActiveOrderCode);
      }
    }
  };

  window.outOpenScan = function (
    rowId,
    sku,
    productName,
    target,
    current,
    prodId,
  ) {
    if (current >= target) return;

    currentScanSession = {
      active: true,
      rowId: rowId,
      productId: prodId,
      targetQty: target,
      initialCount: current,
      sessionCount: 0,
      qrs: [],
    };

    scanTitle.innerHTML = `Scanning: <span class="highlight">${sku}</span>`;
    scanInput.value = "";
    scanInput.disabled = false;

    scanList.innerHTML = "";
    scanFeedback.textContent = "Ready to scan.";
    scanFeedback.className = "scan-feedback";

    // Ensure camera UI is reset
    if (readerContainer) readerContainer.classList.add("hidden");
    isCameraRunning = false;

    updateScanUI();
    scanModal.classList.remove("hidden");

    // Focus input for handhelds (works with inputmode=none)
    setTimeout(() => scanInput.focus(), 100);
  };

  function updateScanUI() {
    const total =
      currentScanSession.initialCount + currentScanSession.sessionCount;
    scanCurrentDisplay.textContent = total;
    scanTargetDisplay.textContent = currentScanSession.targetQty;

    const pct = (total / currentScanSession.targetQty) * 100;
    scanProgressFill.style.width = `${pct}%`;

    const isComplete = total >= currentScanSession.targetQty;

    if (isComplete) {
      scanInput.disabled = true;
      scanFeedback.textContent = "Target Reached.";
      scanFeedback.className = "scan-feedback success";
      btnConfirmItem.disabled = false;
      btnConfirmItem.textContent = "FINISH";
      // Auto stop camera if target reached
      stopCameraScanner();
    } else {
      scanInput.disabled = false;
      btnConfirmItem.disabled = currentScanSession.sessionCount === 0;
      btnConfirmItem.textContent = "DONE";
    }
  }

  // [MODIFIED] Shared Logic for Keyboard (Handheld) and Camera
  async function validateAndAllocateQr(qr) {
    if (!qr) return;

    if (currentScanSession.qrs.includes(qr)) {
      scanFeedback.textContent = "Duplicate scan!";
      scanFeedback.className = "scan-feedback error";
      return;
    }

    scanFeedback.textContent = "Validating...";

    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "rpc_allocate_pallet",
        {
          p_qr_id: qr,
          p_order_item_id: currentScanSession.rowId,
          p_product_id: currentScanSession.productId,
          p_order_code: currentActiveOrderCode,
        },
      );

      if (rpcError) throw rpcError;
      if (!rpcResult.success) throw new Error(rpcResult.message);

      currentScanSession.qrs.push(qr);
      currentScanSession.sessionCount++;

      const li = document.createElement("li");
      li.innerHTML = `<span>${qr}</span> <i class='bx bx-check' style='color:#10b981'></i>`;
      scanList.prepend(li);

      scanFeedback.textContent = "OK: " + qr;
      scanFeedback.className = "scan-feedback success";

      updateScanUI();

      // Clear input for next scan
      scanInput.value = "";
    } catch (err) {
      scanFeedback.textContent = err.message || err.toString();
      scanFeedback.className = "scan-feedback error";
      scanInput.value = "";
    }
  }

  // [MODIFIED] Handle Keydown (Handheld/USB Scanner)
  async function handleScanInput(e) {
    if (e.key === "Enter") {
      const qr = scanInput.value.trim();
      await validateAndAllocateQr(qr);
    }
  }

  // [NEW] Camera Logic
  async function startCameraScanner() {
    // CHANGED: Re-verify library existence just-in-time to prevent race conditions
    // If the library loaded AFTER the page init, this check will fix it.
    if (typeof Html5Qrcode !== "undefined") {
      hasCameraLib = true;
    }

    if (!hasCameraLib) {
      Swal.fire("Error", "Camera library not available.", "error");
      return;
    }

    if (isCameraRunning) return;

    try {
      readerContainer.classList.remove("hidden");
      html5QrCode = new Html5Qrcode("out-qr-reader");

      await html5QrCode.start(
        { facingMode: "environment" }, // Rear camera
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText, decodedResult) => {
          // Handle Scan Success
          // Optional: Play Beep Sound
          validateAndAllocateQr(decodedText);
        },
        (errorMessage) => {
          // Ignore scanning errors (frame didn't have QR)
        },
      );

      isCameraRunning = true;
      scanFeedback.textContent = "Camera active. Point at QR.";
    } catch (err) {
      console.error("Camera start error", err);
      readerContainer.classList.add("hidden");
      Swal.fire(
        "Camera Error",
        "Could not start camera. Check permissions.",
        "error",
      );
    }
  }

  async function stopCameraScanner() {
    if (html5QrCode && isCameraRunning) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (e) {
        console.error("Failed to stop camera", e);
      }
    }
    isCameraRunning = false;
    if (readerContainer) readerContainer.classList.add("hidden");
  }

  async function commitScanSession() {
    closeScanModalLogic();
    await fetchOrders();

    const order = groupedOrders[currentActiveOrderCode];
    const allReady = order.items.every(
      (i) => i.current_scans >= i.qty_target_pallets,
    );

    if (
      allReady &&
      order.status_aggregate !== "ready_to_load" &&
      order.status_aggregate !== "loading" &&
      order.status_aggregate !== "shipped"
    ) {
      const itemIds = order.items.map((i) => i.row_id);
      await supabase
        .from(ORDERS_TABLE)
        .update({ status: "ready_to_load" })
        .in("id", itemIds);
    }
    loadOrderDetails(currentActiveOrderCode);
  }

  async function cancelScanSession() {
    if (currentScanSession.sessionCount > 0) {
      if (
        await Swal.fire({
          title: "Revert?",
          text: "Release scanned items?",
          icon: "warning",
          showCancelButton: true,
        })
      ) {
        await revertSessionItems();
        closeScanModalLogic();
        loadOrderDetails(currentActiveOrderCode);
      }
    } else {
      closeScanModalLogic();
    }
  }

  async function revertSessionItems() {
    if (currentScanSession.qrs.length === 0) return;
    await supabase
      .from(PRODUCTION_TABLE)
      .update({ status: "completed", allocated_order_item_id: null })
      .in("pallet_qr_id", currentScanSession.qrs);
  }

  function closeScanModalLogic() {
    stopCameraScanner(); // Ensure camera stops
    scanModal.classList.add("hidden");
    currentScanSession = { active: false, qrs: [] };
    btnConfirmItem.textContent = "DONE";
  }

  // --- 7. LOADING & BOL GENERATION ---
  window.outStartLoading = async function () {
    const itemIds = groupedOrders[currentActiveOrderCode].items.map(
      (i) => i.row_id,
    );
    await supabase
      .from(ORDERS_TABLE)
      .update({ status: "loading" })
      .in("id", itemIds);

    evidencePhotos = [];
    if (inputTransportUnit) inputTransportUnit.value = "";
    if (inputTransportCaja) inputTransportCaja.value = "";
    if (inputTransportSeals) inputTransportSeals.value = "";
    if (inputSpecialInstructions) inputSpecialInstructions.value = "";

    renderPhotoGrid();
    loadModal.classList.remove("hidden");
  };

  function handlePhotoSelection(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    files.forEach((file) => {
      evidencePhotos.push({ file: file, url: URL.createObjectURL(file) });
    });
    renderPhotoGrid();
    e.target.value = "";
  }

  function renderPhotoGrid() {
    let html = `<label class="photo-upload-box"><input type="file" id="temp-photo-input" accept="image/*" multiple hidden><i class='bx bx-image-add'></i><span>Add</span></label>`;
    evidencePhotos.forEach((photo, index) => {
      html += `
                <div class="photo-preview-card">
                    <img src="${photo.url}" alt="Evidence ${index + 1}">
                    <button class="btn-remove-photo" onclick="window.removePhoto(${index})" title="Remove photo">
                        <i class='bx bx-x'></i>
                    </button>
                </div>
            `;
    });
    photoGrid.innerHTML = html;
    const newInp = document.getElementById("temp-photo-input");
    if (newInp) newInp.onchange = handlePhotoSelection;

    const count = evidencePhotos.length;
    photoCountMsg.textContent = `${count} photos selected (Min 4)`;
    if (count >= 4) {
      photoCountMsg.style.color = "var(--out-success)";
      btnConfirmLoad.disabled = false;
    } else {
      photoCountMsg.style.color = "var(--out-text-light)";
      btnConfirmLoad.disabled = true;
    }
  }

  window.removePhoto = function (index) {
    evidencePhotos.splice(index, 1);
    renderPhotoGrid();
  };

  function calculateWeightLbs(product, totalCases) {
    if (!product || !totalCases) return 0;
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

  window.printBOL = async function (bolNumberOverride = null) {
    if (!currentActiveOrderCode) return;

    const order = groupedOrders[currentActiveOrderCode];
    const bolNumber =
      bolNumberOverride || order.shipping_data.bol_url || "PENDING";
    const todayDate = new Date().toLocaleDateString("en-US");
    const addr = order.client_address;
    const fullAddress = `${addr.line1}<br>${addr.city}, ${addr.state} ${addr.zip}`;

    let totalPallets = 0;
    let totalWeight = 0;
    const itemRows = [];

    for (const item of order.items) {
      const { count } = await supabase
        .from(PRODUCTION_TABLE)
        .select("id", { count: "exact" })
        .eq("allocated_order_item_id", item.row_id);
      const actualPallets = count || 0;
      const actualCases = actualPallets * item.product.cases_per_pallet;
      const weightLbs = calculateWeightLbs(item.product, actualCases);

      totalPallets += actualPallets;
      totalWeight += weightLbs;

      itemRows.push({
        palletQty: actualPallets,
        palletType: "Pallet",
        caseQty: actualCases,
        caseType: "Cases",
        weight: weightLbs,
        desc: item.product.name,
        nmfc: "",
      });
    }

    const ITEMS_PER_PAGE = 8;
    const totalPages = Math.ceil(itemRows.length / ITEMS_PER_PAGE);
    let pagesHtml = "";

    for (let i = 0; i < totalPages; i++) {
      const pageItems = itemRows.slice(
        i * ITEMS_PER_PAGE,
        (i + 1) * ITEMS_PER_PAGE,
      );

      let rowsHtml = pageItems
        .map(
          (row) => `
                <div class="celda-carrier align-left">${row.palletQty || ""}</div>
                <div class="celda-carrier align-left">${row.palletType || ""}</div>
                <div class="celda-carrier align-left">${row.caseQty || ""}</div>
                <div class="celda-carrier align-left">${row.caseType || ""}</div>
                <div class="celda-carrier align-left">${row.weight ? Math.round(row.weight).toLocaleString() : ""}</div>
                <div class="celda-carrier"></div> 
                <div class="celda-carrier align-left">${row.desc || ""}</div>
                <div class="celda-carrier">${row.nmfc || ""}</div> 
                <div class="celda-carrier fin-fila"></div> 
            `,
        )
        .join("");

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
                            <strong>${activeClient.textContent}</strong><br>
                            ${fullAddress}
                        </div>
                    </div>
                    <div class="celda-sup" style="border-bottom:1px solid black; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                        <div><strong>Trailer:</strong> ${order.shipping_data.unit}</div>
                        <div><strong>Container:</strong> ${order.shipping_data.caja}</div>
                        <div><strong>Seals:</strong> ${order.shipping_data.seals}</div>
                    </div>
                    
                    <div class="celda-sup" style="border-right:1px solid black; border-bottom:1px solid black;">
                        <div class="header-gris">THIRD PARTY FREIGHT CHARGES BILL TO</div>
                        <div class="contenido-celda"></div>
                    </div>
                    <div class="celda-sup" style="border-bottom:1px solid black;"></div>
                    
                    <div class="celda-sup contenido-celda" style="border-right:1px solid black;">
                        <strong>Special Instructions:</strong><br>
                        ${order.shipping_data.instructions}
                    </div>
                    
                    <div class="celda-sup celda-partida">
                        <div class="mitad-arriba">
                            <span class="negrita" style="margin-bottom: 3px;">Freight Charge Terms (Freight charges are prepaid unless marked otherwise):</span>
                            <div style="width: 100%; display: flex; justify-content: space-around; margin-top: 2px;">
                                <span>Prepaid</span>
                                <span>Collect</span>
                                <span>3rd Party</span>
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
                    
                    <div class="celda-orden centro" style="height: 30px;">${order.code}</div>
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
                        specifically stated by the shipper to be not exceeding <span class="underlined"></span> per <span class="underlined"></span>.”
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

    // [FIX APPLIED HERE: MARGIN 0, BOX-SIZING, NO EXTERNAL MARGINS]
    const bolStyles = `
            <style>
            .hoja { width: 100%; height: 100%; background: white; margin: 0; padding: 0.5cm; position: relative; box-sizing: border-box; overflow: hidden; }
            .negrita{font-weight:bold}.centro{text-align:center;justify-content:center;display:flex;align-items:center}.texto-fino{font-size:11px;line-height:1.2}.texto-mini{font-size:8px;line-height:1.1;text-align:justify}.header-gris{background-color:#e0e0e0;font-weight:bold;font-size:10px;text-transform:uppercase;padding:3px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid black;width:100%}.celda-sup,.celda-orden,.celda-carrier,.celda-firma{border-right:1px solid black;border-bottom:1px solid black;padding:3px;display:flex;flex-direction:column;overflow:hidden}.fin-fila{border-right:none!important}.titulo-pagina{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;font-weight:bold;padding:0 5px}.titulo-texto{font-size:18px;text-align:center;width:100%;margin-left:60px}.paginacion{font-size:12px;white-space:nowrap}.bloque-superior{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:90px 90px 60px 100px;border:1px solid black;border-bottom:none}.contenido-celda{padding:5px;flex-grow:1}.celda-partida{padding:0!important}.mitad-arriba{width:100%;height:55%;display:flex;flex-direction:column;align-items:center;justify-content:center;border-bottom:1px solid black;font-size:10px;text-align:center;padding:2px;box-sizing:border-box}.mitad-abajo{width:100%;height:45%;display:flex;align-items:center;justify-content:center;font-size:9px;text-align:center;padding:2px}.bloque-orden{display:grid;grid-template-columns:2.5fr 0.8fr 1fr 0.4fr 0.4fr 3fr;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black}.span-2{grid-column:span 2}.span-3{grid-column:span 3}.span-all{grid-column:1 / -1}.fondo-gris-claro{background-color:#f2f2f2}.bloque-carrier{display:grid;grid-template-columns:0.5fr 0.8fr 0.5fr 0.8fr 1fr 0.4fr 4fr 1fr 0.8fr;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black}.col-desc{flex-direction:column;justify-content:flex-start;text-align:center}.span-handling{grid-column:span 2}.span-package{grid-column:span 2}.span-middle{grid-column:span 3}.span-ltl{grid-column:span 2}.align-left{justify-content:flex-start;text-align:left;padding-left:5px}.bloque-legal{display:flex;justify-content:space-between;align-items:center;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;padding:5px 10px;font-size:10px;min-height:40px}.legal-izq{width:58%;text-align:justify;line-height:1.2}.legal-der{width:40%;display:flex;flex-direction:column;padding-left:10px}.underlined{border-bottom:1px solid black;display:inline-block;width:60px}.bloque-firmas{display:grid;grid-template-columns:4fr 1fr 2.5fr 2.5fr;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;font-size:10px}.span-mitad-izq{grid-column:span 2}.span-mitad-der{grid-column:span 2}.titulo-nota{background-color:white;font-weight:bold;font-size:10px;text-align:center;padding:5px;border-bottom:1px solid black}.check-item{margin-bottom:3px;display:block}
            </style>
        `;

    bolContainer.innerHTML = bolStyles + pagesHtml;
    bolModal.classList.remove("hidden");
  };

  btnConfirmLoad.onclick = async () => {
    btnConfirmLoad.textContent = "Processing...";
    btnConfirmLoad.disabled = true;
    try {
      const photoUrls = [];
      for (const p of evidencePhotos) {
        const name = `evidence/${currentActiveOrderCode}/${Date.now()}_${p.file.name}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET_EVIDENCE)
          .upload(name, p.file, { upsert: true });
        if (!upErr) {
          const { data } = supabase.storage
            .from(BUCKET_EVIDENCE)
            .getPublicUrl(name);
          photoUrls.push(data.publicUrl);
        }
      }

      const processedByUser = currentUser ? currentUser.email : "System";

      await supabase
        .from(ORDERS_TABLE)
        .update({
          transport_unit: inputTransportUnit.value,
          transport_plates: inputTransportCaja.value,
          transport_seals: inputTransportSeals.value,
          notes: inputSpecialInstructions.value,
          evidence_photos: photoUrls,
          processed_by: processedByUser,
        })
        .eq("unique_order_code", currentActiveOrderCode);

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "generate_and_assign_bol_by_code",
        { p_order_code: currentActiveOrderCode },
      );

      if (rpcError) throw rpcError;
      const finalBolNumber = rpcData.bol_number;

      const orderRows = groupedOrders[currentActiveOrderCode].items;
      const idsToUpdate = orderRows.map((i) => i.row_id);
      for (const id of idsToUpdate) {
        await supabase
          .from(PRODUCTION_TABLE)
          .update({ status: "shipped" })
          .eq("allocated_order_item_id", id);
      }

      Swal.fire({
        title: "Shipped!",
        html: `BOL Generated: <b>${finalBolNumber}</b>`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });

      loadModal.classList.add("hidden");
      window.printBOL(finalBolNumber);
      setTimeout(async () => {
        await fetchOrders();
        resetWorkspace();
      }, 1000);
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to process loading: " + err.message, "error");
      btnConfirmLoad.textContent = "Generate BOL";
      btnConfirmLoad.disabled = false;
    }
  };

  window.outViewDetails = async function (orderCode) {
    const order = groupedOrders[orderCode];
    if (!order) return;

    detUser.textContent = order.processed_by || "Unknown";
    detStart.textContent = order.started_at
      ? new Date(order.started_at).toLocaleString()
      : "N/A";
    detEnd.textContent = order.completed_at
      ? new Date(order.completed_at).toLocaleString()
      : "In Progress";

    if (order.started_at && order.completed_at) {
      const start = new Date(order.started_at);
      const end = new Date(order.completed_at);
      const diffMs = end - start;
      const diffMins = Math.floor(diffMs / 60000);
      const hrs = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      detDuration.textContent = `${hrs}h ${mins}m`;
    } else {
      detDuration.textContent = "--";
    }

    detTrailer.textContent = order.shipping_data.unit || "--";
    detPlate.textContent = order.shipping_data.caja || "--";
    detSeals.textContent = order.shipping_data.seals || "--";
    detNotes.textContent =
      order.shipping_data.instructions || "No special instructions.";

    detPhotosGrid.innerHTML = "";
    const photos = order.evidence_photos || [];
    if (photos.length > 0) {
      photos.forEach((url) => {
        const img = document.createElement("img");
        img.src = url;
        img.style.width = "100%";
        img.style.height = "100px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "8px";
        img.style.cursor = "pointer";
        img.onclick = () => window.open(url, "_blank");
        detPhotosGrid.appendChild(img);
      });
    } else {
      detPhotosGrid.innerHTML = `<span style="color:var(--out-text-light); grid-column:1/-1; text-align:center;">No photos uploaded.</span>`;
    }

    detItemsList.innerHTML =
      "<tr><td colspan='4' style='text-align:center;'>Loading items...</td></tr>";

    const itemIds = order.items.map((i) => i.row_id);
    const { data: pallets } = await supabase
      .from(PRODUCTION_TABLE)
      .select(
        `pallet_qr_id, warehouse_scan_time, production_products (sku, name)`,
      )
      .in("allocated_order_item_id", itemIds);

    detItemsList.innerHTML = "";
    if (pallets && pallets.length > 0) {
      pallets.forEach((p) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
                    <td style="padding:0.5rem; border-bottom:1px solid var(--out-border); font-family:monospace; font-weight:bold; color:var(--out-primary);">${p.pallet_qr_id}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid var(--out-border);">${p.production_products?.sku}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid var(--out-border); font-size:0.85rem;">${p.production_products?.name}</td>
                    <td style="padding:0.5rem; border-bottom:1px solid var(--out-border); color:var(--out-text-light);">${p.warehouse_scan_time ? new Date(p.warehouse_scan_time).toLocaleTimeString() : "-"}</td>
                `;
        detItemsList.appendChild(tr);
      });
    } else {
      detItemsList.innerHTML =
        "<tr><td colspan='4' style='text-align:center; padding:1rem;'>No items found.</td></tr>";
    }
    detailsModal.classList.remove("hidden");
  };

  function setupEventListeners() {
    filterTabs.forEach((tab) => {
      tab.onclick = () => {
        filterTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderSidebar(tab.dataset.filter, searchInput.value);
      };
    });
    searchInput.oninput = (e) => {
      const activeTab = document.querySelector(".filter-tab.active");
      const currentFilter = activeTab ? activeTab.dataset.filter : "pending";
      renderSidebar(currentFilter, e.target.value);
    };
    btnRefresh.onclick = fetchOrders;

    document.getElementById("closeScanModal").onclick = cancelScanSession;
    btnCancelScan.onclick = cancelScanSession;
    btnConfirmItem.onclick = commitScanSession;

    scanInput.addEventListener("keydown", handleScanInput);

    // [MODIFIED] Camera Button Hooks
    if (btnCameraScan) {
      btnCameraScan.onclick = startCameraScanner;
    }
    if (btnStopCamera) {
      btnStopCamera.onclick = stopCameraScanner;
    }

    if (btnCloseLoadModal)
      btnCloseLoadModal.onclick = () => loadModal.classList.add("hidden");
    if (btnCancelLoad)
      btnCancelLoad.onclick = () => loadModal.classList.add("hidden");
    if (btnPrintBol) btnPrintBol.onclick = () => window.printBOL();
    btnBolClose.onclick = () => bolModal.classList.add("hidden");
    closeBolModalIcon.onclick = () => bolModal.classList.add("hidden");
    btnBolPrint.onclick = () => {
      const printContent = bolContainer.innerHTML;
      const win = window.open("", "", "height=700,width=900");
      win.document.write("<html><head><title>Print BOL</title></head><body>");
      win.document.write(printContent);
      win.document.write("</body></html>");
      win.document.close();
      win.print();
    };
    btnBolDownload.onclick = () => {
      const element = bolContainer;
      const opt = {
        margin: 0,
        filename: `BOL-${currentActiveOrderCode}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
      };
      html2pdf().set(opt).from(element).save();
    };
    if (btnCloseDetails)
      btnCloseDetails.onclick = () => detailsModal.classList.add("hidden");
    if (btnCloseDetailsFooter)
      btnCloseDetailsFooter.onclick = () =>
        detailsModal.classList.add("hidden");
    if (btnSlidePrev && btnSlideNext && itemsTrack) {
      btnSlidePrev.onclick = () =>
        itemsTrack.scrollBy({ left: -360, behavior: "smooth" });
      btnSlideNext.onclick = () =>
        itemsTrack.scrollBy({ left: 360, behavior: "smooth" });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fetchOrders();
    });
  }

  function subscribeRealtime() {
    realTimeSub = supabase
      .channel("outbound-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: ORDERS_TABLE },
        () => fetchOrders(),
      )
      .subscribe();
  }

  init();
})();
