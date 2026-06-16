// js/receiving-portal.js
// V6.0 - Over-Receipt Alert, Line Correction, Damage Reports & Improved History

(function () {
  console.log("[RCV] V6.0 Loaded - Full Logic Update.");

  // --- 1. SCOPED CONTAINER CHECK ---
  const rcvContainer = document.querySelector(".rcv-container");
  if (!rcvContainer) return;

  if (rcvContainer.dataset.initialized === "true") return;
  rcvContainer.dataset.initialized = "true";

  // --- DEPENDENCIES ---
  if (!window.supabase) {
    console.error("[RCV] CRITICAL: Supabase client missing.");
    return;
  }

  const Swal = window.Swal || { fire: (msg) => alert(JSON.stringify(msg)) };

  // --- CONFIGURATION ---
  const ORDERS_TABLE = "client_orders";
  const RAW_INVENTORY_TABLE = "raw_inventory";
  const RECEIVING_LOGS_TABLE = "receiving_logs";
  const DAMAGE_REPORTS_TABLE = "damage_reports"; // [NEW] Table for damages
  const EVIDENCE_BUCKET = "shipping-evidence";

  // --- STATE ---
  let currentUser = null;
  let currentUserRole = null;
  let currentOrder = null;
  let currentItems = [];

  // Scanner State
  let html5QrCode = null;
  let activeCameraInputId = null;
  let isScannerRunning = false;

  // Transaction Modal State
  let activeTransactionItemIdx = -1;
  let transactionMode = "cases";

  // Edit/Correction State [NEW]
  let activeEditItemIdx = -1;

  // Evidence State
  let evidencePhotos = [];
  let damagePhotos = []; // For the active damage report

  // Data Cache
  let groupedIncoming = {};

  // --- DOM ELEMENTS ---
  const tabButtons = rcvContainer.querySelectorAll(".rcv-tab-btn");
  const tabContents = rcvContainer.querySelectorAll(".rcv-tab-content");

  // Inputs
  const mainInput = document.getElementById("rcv-main-input");
  const btnLookup = document.getElementById("btn-rcv-lookup");
  const btnScanCamera = document.getElementById("btn-scan-camera-trigger");
  const btnHistory = document.getElementById("btn-rcv-history");
  const btnRefresh = document.getElementById("btn-rcv-refresh");

  // Active Order
  const scanSection = document.getElementById("rcv-scan-section");
  const activeOrderContainer = document.getElementById(
    "rcv-active-order-container",
  );
  const productUpcInput = document.getElementById("rcv-product-upc-input");
  const btnItemCamera = document.getElementById("btn-item-camera-trigger");
  const viewModeSelect = document.getElementById("rcv-view-mode");
  const itemsTableBody = document.getElementById("rcv-items-body");

  const btnCancel = document.getElementById("btn-rcv-cancel");
  const btnPreConfirm = document.getElementById("btn-rcv-pre-confirm");

  // Scanner Modal
  const scannerModal = document.getElementById("rcvScannerModal");
  const closeScannerBtn = document.getElementById("closeScannerModal");

  // Quantity Input Modal
  const qtyModal = document.getElementById("rcvQtyInputModal");
  const closeQtyModalBtn = document.getElementById("closeQtyModal");
  const btnCancelQty = document.getElementById("btn-cancel-qty");
  const btnConfirmQty = document.getElementById("btn-confirm-qty");
  const modalQtyInput = document.getElementById("modal-qty-input");
  const btnModeCases = document.getElementById("btn-mode-cases");
  const btnModeUnits = document.getElementById("btn-mode-units");

  // [NEW] Edit Qty Modal Elements
  const editQtyModal = document.getElementById("rcvEditQtyModal");
  const closeEditQtyModalBtn = document.getElementById("closeEditQtyModal");
  const btnCancelEdit = document.getElementById("btn-cancel-edit");
  const btnSaveEdit = document.getElementById("btn-save-edit");
  const editQtyInput = document.getElementById("edit-qty-input");

  // Header Info Elements
  const lblOrderCode = document.getElementById("rcv-order-code");
  const lblClientName = document.getElementById("rcv-client-name");
  const lblArrivalDate = document.getElementById("rcv-arrival-date");
  const lblArrivalSlot = document.getElementById("rcv-arrival-slot");
  const lblTotalExpected = document.getElementById("rcv-total-expected");

  // Evidence & Damage
  const evidenceModal = document.getElementById("rcvEvidenceModal");
  const btnFinalConfirm = document.getElementById("btn-final-confirm");
  const evidenceTrigger = document.getElementById("rcv-evidence-trigger");
  const evidenceGrid = document.getElementById("rcv-evidence-grid");
  const txtFinalNotes = document.getElementById("rcv-notes");
  const closeEvidenceBtn = document.getElementById("closeRcvEvidenceModal");
  const btnCancelEvidence = document.getElementById("btn-cancel-evidence");

  // Damage Modal
  const btnOpenDamage = document.getElementById("btn-rcv-open-damage");
  const damageModal = document.getElementById("rcvDamageModal");
  const closeDamageBtn = document.getElementById("closeRcvDamageModal");
  const btnCancelDamage = document.getElementById("btn-cancel-damage");
  const btnSaveDamage = document.getElementById("btn-save-damage");
  const damageItemSelect = document.getElementById("rcv-damage-item-select");
  const damageQtyInput = document.getElementById("rcv-damage-qty");
  const damagePhotoTrigger = document.getElementById(
    "rcv-damage-photo-trigger",
  );
  const damagePhotoGrid = document.getElementById("rcv-damage-photo-grid");
  const damageNotes = document.getElementById("rcv-damage-notes");

  // Summary Modal (LPN)
  const summaryModal = document.getElementById("rcvSummaryModal");
  const closeSummaryBtn = document.getElementById("closeRcvSummaryModal");
  const btnSummaryFinish = document.getElementById("btn-rcv-finish");
  const btnSummaryPrintLpn = document.getElementById("btn-rcv-print-lpn");
  const lpnItemListContainer = document.getElementById("rcv-lpn-item-list");
  const lpnPaperSizeSelect = document.getElementById("lpn-paper-size");

  // Preview Modal
  const previewModal = document.getElementById("rcvOrderPreviewModal");
  const closePreviewBtn = document.getElementById("closeRcvPreviewModal");
  const btnClosePreviewFooter = document.getElementById("btn-close-preview");

  // History Modal
  const historyModal = document.getElementById("rcvHistoryModal");
  const closeHistoryBtn = document.getElementById("closeRcvHistoryModal");
  const historyTableBody = document.getElementById("rcv-history-body");

  // --- 2. INITIALIZATION ---
  async function init() {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) {
        console.error("[RCV] Auth Error:", error);
        return;
      }
      currentUser = user;
      await fetchUserRole();
      setupEventListeners();
      initTabs();
      loadIncomingAppointments();
      setupRealtimeSubscription();

      // Render Filters for History if they don't exist
      renderHistoryFilters();
    } catch (e) {
      console.error("[RCV] Init Crash:", e);
    }
  }

  async function fetchUserRole() {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .single();
      if (data) currentUserRole = data.role;
    } catch (err) {
      currentUserRole = "employee";
    }
  }

  function setupRealtimeSubscription() {
    supabase
      .channel("rcv-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: ORDERS_TABLE },
        () => loadIncomingAppointments(),
      )
      .subscribe();
  }

  // --- 3. TABS ---
  function initTabs() {
    tabButtons.forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const target = btn.dataset.target;
        tabButtons.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((c) => {
          c.classList.remove("active");
          c.style.display = "none";
        });
        btn.classList.add("active");
        const targetEl = document.getElementById(`rcv-tab-${target}`);
        if (targetEl) {
          targetEl.classList.add("active");
          targetEl.style.display = "flex";
        }
        if (target === "incoming") loadIncomingAppointments();
        else if (
          target === "scan" &&
          activeOrderContainer.classList.contains("rcv-hidden")
        ) {
          setTimeout(() => mainInput && mainInput.focus(), 100);
        }
      };
    });
  }

  // --- 4. SCANNER LOGIC ---
  function openScanner(targetInputId) {
    if (typeof Html5Qrcode === "undefined")
      return Swal.fire("Camera Error", "Scanner lib missing.", "error");
    activeCameraInputId = targetInputId;
    scannerModal.classList.add("open");
    setTimeout(() => {
      if (!html5QrCode) {
        try {
          html5QrCode = new Html5Qrcode("rcv-camera-render-target");
        } catch (e) {
          closeScanner();
          return;
        }
      }
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      html5QrCode
        .start({ facingMode: "environment" }, config, onScanSuccess)
        .then(() => {
          isScannerRunning = true;
        })
        .catch((err) => {
          isScannerRunning = false;
          closeScanner();
          Swal.fire({
            toast: true,
            position: "top",
            icon: "warning",
            title: "Camera Unavailable",
            showConfirmButton: false,
            timer: 2000,
          });
        });
    }, 100);
  }

  function closeScanner() {
    scannerModal.classList.remove("open");
    activeCameraInputId = null;
    if (html5QrCode) {
      if (isScannerRunning) {
        html5QrCode
          .stop()
          .then(() => {
            html5QrCode.clear();
            html5QrCode = null;
            isScannerRunning = false;
          })
          .catch(() => {
            html5QrCode = null;
            isScannerRunning = false;
          });
      } else {
        try {
          html5QrCode.clear();
        } catch (e) {}
        html5QrCode = null;
      }
    }
  }

  function onScanSuccess(decodedText) {
    const targetId = activeCameraInputId;
    closeScanner();
    handleScanResult(decodedText, targetId);
  }

  function handleScanResult(text, targetId = null) {
    const idToUse = targetId || activeCameraInputId;
    if (!idToUse) return;
    const inputEl = document.getElementById(idToUse);
    if (inputEl) {
      inputEl.value = text;
      if (idToUse === "rcv-main-input") processInboundScan();
      else if (idToUse === "rcv-product-upc-input") handleProductLocate();
    }
  }

  // --- 5. ORDER LOOKUP ---
  async function processInboundScan() {
    const query = mainInput.value.trim().toUpperCase();
    if (!query) return;
    btnLookup.innerHTML = "...";
    btnLookup.disabled = true;
    try {
      const { data, error } = await supabase
        .from(ORDERS_TABLE)
        .select(`*, production_products (*), profiles (full_name)`)
        .eq("unique_order_code", query);

      if (error || !data || data.length === 0)
        throw new Error("Order not found.");
      const header = data[0];

      if (header.locked_by && header.locked_by !== currentUser.id) {
        throw new Error("Order LOCKED by another user.");
      }

      const allowedStatuses = [
        "waiting_arrival",
        "receiving_in_progress",
        "receiving_paused",
      ];
      if (!allowedStatuses.includes(header.status)) {
        await releaseLock(query);
        Swal.fire("Closed", `Order is ${header.status}.`, "warning");
        return;
      }

      await supabase
        .from(ORDERS_TABLE)
        .update({
          locked_by: currentUser.id,
          locked_at: new Date().toISOString(),
          status: "receiving_in_progress",
        })
        .eq("unique_order_code", query);

      loadOrderToWorkspace(data);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      btnLookup.innerHTML = "GO";
      btnLookup.disabled = false;
      mainInput.value = "";
    }
  }

  async function releaseLock(orderCode) {
    if (!orderCode) return;
    await supabase
      .from(ORDERS_TABLE)
      .update({ locked_by: null, locked_at: null })
      .eq("unique_order_code", orderCode);
  }

  // --- 6. WORKSPACE ---
  function loadOrderToWorkspace(orderRows) {
    const header = orderRows[0];
    currentOrder = {
      code: header.unique_order_code,
      clientId: header.client_id,
    };
    evidencePhotos = [];

    currentItems = orderRows.map((row) => ({
      rowId: row.id,
      product: row.production_products,
      qtyOrderedPallets:
        row.qty_requested_pallets || row.qty_calculated_pallets || 0,
      qtyReceivedTotal: row.qty_received_total || 0,
      unitType: row.unit_type,
    }));

    lblOrderCode.textContent = currentOrder.code;
    lblClientName.textContent = header.profiles?.full_name || "Unknown";
    lblArrivalDate.textContent = header.inbound_arrival_date || "--";
    lblArrivalSlot.textContent = (header.inbound_slot || "--").toUpperCase();

    const totalPlt = currentItems.reduce(
      (s, i) => s + parseFloat(i.qtyOrderedPallets),
      0,
    );
    lblTotalExpected.textContent = `${totalPlt.toFixed(1)} Plt`;

    // Update Damage Select Options
    damageItemSelect.innerHTML =
      '<option value="">-- Choose Product --</option>';
    currentItems.forEach((item, index) => {
      const opt = document.createElement("option");
      opt.value = index;
      opt.textContent = item.product.name;
      damageItemSelect.appendChild(opt);
    });

    renderItemsTable();
    scanSection.classList.add("rcv-hidden");
    activeOrderContainer.classList.remove("rcv-hidden");
    if (btnCancel) btnCancel.style.display = "inline-flex";

    const statusBadge = document.getElementById("rcv-global-status");
    if (statusBadge) {
      statusBadge.className = "rcv-badge status-active";
      statusBadge.innerHTML = '<span class="live-dot"></span> RECEIVING LIVE';
    }
  }

  function renderItemsTable() {
    if (!itemsTableBody) return;
    itemsTableBody.innerHTML = "";
    const viewMode = viewModeSelect.value;

    currentItems.forEach((item, index) => {
      const tr = document.createElement("tr");
      const cpp = item.product.cases_per_pallet || 1;
      const upc = item.product.units_per_case || 1;
      const unitsPerPallet = cpp * upc;
      const receivedPallets = parseFloat(item.qtyReceivedTotal);
      const expectedPallets = parseFloat(item.qtyOrderedPallets);

      let displayExpected =
        viewMode === "cases"
          ? Math.round(expectedPallets * cpp)
          : Math.round(expectedPallets * unitsPerPallet);
      let displayReceived =
        viewMode === "cases"
          ? Math.round(receivedPallets * cpp)
          : Math.round(receivedPallets * unitsPerPallet);
      let unitLabel = viewMode === "cases" ? "CS" : "PCS";

      // Visual Check for Over-receipt
      let isOver = receivedPallets > expectedPallets;
      let rowClass = "";
      let statusBadge = "";

      if (isOver) {
        statusBadge = `<span class="rcv-badge status-danger">Over +${(receivedPallets - expectedPallets).toFixed(2)}</span>`;
        rowClass = "row-delayed"; // Reusing red background style
      } else if (receivedPallets >= expectedPallets - 0.001) {
        statusBadge = `<span class="rcv-badge status-success">Complete</span>`;
        tr.style.backgroundColor = "rgba(220, 252, 231, 0.3)";
      } else if (receivedPallets > 0) {
        statusBadge = `<span class="rcv-badge status-warning">Partial</span>`;
      } else {
        statusBadge = `<span class="rcv-badge status-idle">Pending</span>`;
      }

      if (rowClass) tr.className = rowClass;

      tr.innerHTML = `
                <td><strong>${item.product.name}</strong><br><small style="color:var(--goldmex-primary-color)">${item.product.sku}</small></td>
                <td style="font-family:monospace;">${item.product.sku}</td>
                <td style="font-family:monospace;">${item.product.barcode || "-"}</td>
                <td class="text-center">${displayExpected} ${unitLabel}</td>
                <td class="text-center"><strong>${displayReceived}</strong> ${unitLabel}</td>
                <td class="text-center">
                    <button class="btn-edit-action" onclick="window.rcvOpenEditModal(${index})" title="Correct Quantity"><i class='bx bx-pencil'></i></button>
                    <button class="btn-mini-action" onclick="window.rcvOpenQtyModal(${index})"><i class='bx bx-plus'></i> Add</button>
                </td>
                <td class="text-center">${statusBadge}</td>
            `;
      itemsTableBody.appendChild(tr);
    });
  }

  // --- 8. SCAN & QTY ---
  function handleProductLocate() {
    const code = productUpcInput.value.trim().toUpperCase();
    if (!code) return;
    const idx = currentItems.findIndex(
      (i) =>
        (i.product.barcode &&
          i.product.barcode.trim().toUpperCase() === code) ||
        (i.product.sku && i.product.sku.trim().toUpperCase() === code),
    );
    productUpcInput.value = "";
    if (idx >= 0) window.rcvOpenQtyModal(idx);
    else
      Swal.fire({
        toast: true,
        position: "top",
        icon: "error",
        title: "Item not found",
        showConfirmButton: false,
        timer: 1500,
      });
  }

  window.rcvOpenQtyModal = function (index) {
    if (index < 0 || index >= currentItems.length) return;
    activeTransactionItemIdx = index;
    const item = currentItems[index];
    document.getElementById("modal-item-name").textContent = item.product.name;
    document.getElementById("modal-item-sku").textContent =
      `SKU: ${item.product.sku}`;
    document.getElementById("modal-item-progress").textContent =
      `Progress: ${parseFloat(item.qtyReceivedTotal).toFixed(2)} / ${parseFloat(item.qtyOrderedPallets).toFixed(2)} Pallets`;
    modalQtyInput.value = "";
    setTransactionMode("cases");
    qtyModal.classList.add("open");
    setTimeout(() => {
      modalQtyInput.focus();
    }, 100);
  };

  function setTransactionMode(mode) {
    transactionMode = mode;
    const item = currentItems[activeTransactionItemIdx];
    if (!item) return;
    if (mode === "cases") {
      btnModeCases.classList.add("active");
      btnModeUnits.classList.remove("active");
      document.getElementById("modal-conversion-hint").textContent =
        `1 Case = ${item.product.units_per_case} Units`;
    } else {
      btnModeCases.classList.remove("active");
      btnModeUnits.classList.add("active");
      document.getElementById("modal-conversion-hint").textContent =
        `Direct Unit Entry`;
    }
  }

  async function confirmTransaction() {
    if (activeTransactionItemIdx === -1) return;
    const inputVal = parseFloat(modalQtyInput.value);
    if (!inputVal || inputVal <= 0)
      return Swal.fire("Invalid Quantity", "Please enter value > 0", "warning");

    const item = currentItems[activeTransactionItemIdx];
    const cpp = item.product.cases_per_pallet || 1;
    const upc = item.product.units_per_case || 1;

    let deltaPallets =
      transactionMode === "cases" ? inputVal / cpp : inputVal / (cpp * upc);
    let deltaUnits = transactionMode === "cases" ? inputVal * upc : inputVal;

    const newTotalPallets = parseFloat(item.qtyReceivedTotal) + deltaPallets;

    // [NEW] Over-Receipt Warning Logic
    if (newTotalPallets > item.qtyOrderedPallets + 0.001) {
      // Small buffer for float math
      const confirm = await Swal.fire({
        title: "Over-Receipt Warning",
        text: `You are receiving more than expected! Total will be ${newTotalPallets.toFixed(2)} Pallets (Exp: ${item.qtyOrderedPallets.toFixed(2)}). Continue?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Yes, Receive Excess",
      });

      if (!confirm.isConfirmed) return;
    }

    const now = new Date().toISOString();

    btnConfirmQty.disabled = true;
    btnConfirmQty.innerHTML =
      "<i class='bx bx-loader-alt bx-spin'></i> Saving...";

    try {
      const updateOrder = supabase
        .from(ORDERS_TABLE)
        .update({ qty_received_total: newTotalPallets })
        .eq("id", item.rowId);
      const insertInv = supabase.from(RAW_INVENTORY_TABLE).insert({
        product_id: item.product.id,
        qty_on_hand: deltaUnits,
        order_ref: currentOrder.code,
        received_at: now,
        location: "INBOUND-STAGE",
        status: "available",
      });
      await Promise.all([updateOrder, insertInv]);
      item.qtyReceivedTotal = newTotalPallets;
      renderItemsTable();
      qtyModal.classList.remove("open");
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Saved!",
        showConfirmButton: false,
        timer: 1000,
      });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      btnConfirmQty.disabled = false;
      btnConfirmQty.innerHTML = "<i class='bx bx-check'></i> CONFIRM & SAVE";
    }
  }

  // --- [NEW] EDIT / CORRECTION LOGIC ---
  window.rcvOpenEditModal = function (index) {
    if (index < 0 || index >= currentItems.length) return;
    activeEditItemIdx = index;
    const item = currentItems[index];

    document.getElementById("edit-item-name").textContent = item.product.name;
    document.getElementById("edit-item-sku").textContent = item.product.sku;

    // Calculate current cases to show as default
    const cpp = item.product.cases_per_pallet || 1;
    const currentCases = Math.round(item.qtyReceivedTotal * cpp);
    editQtyInput.value = currentCases;

    editQtyModal.classList.add("open");
    setTimeout(() => editQtyInput.focus(), 100);
  };

  async function saveCorrection() {
    if (activeEditItemIdx === -1) return;
    const newTotalCases = parseFloat(editQtyInput.value);
    if (isNaN(newTotalCases) || newTotalCases < 0)
      return Swal.fire("Error", "Invalid quantity.", "error");

    const item = currentItems[activeEditItemIdx];
    const cpp = item.product.cases_per_pallet || 1;
    const upc = item.product.units_per_case || 1;

    // Calculate Deltas
    const oldTotalPallets = item.qtyReceivedTotal;
    const newTotalPallets = newTotalCases / cpp;

    const deltaPallets = newTotalPallets - oldTotalPallets;

    if (Math.abs(deltaPallets) < 0.0001) {
      editQtyModal.classList.remove("open");
      return;
    }

    const deltaUnits = deltaPallets * (cpp * upc);
    const now = new Date().toISOString();

    btnSaveEdit.disabled = true;
    btnSaveEdit.textContent = "Updating...";

    try {
      // Update Order Total
      await supabase
        .from(ORDERS_TABLE)
        .update({ qty_received_total: newTotalPallets })
        .eq("id", item.rowId);

      // Insert adjustment record (can be negative)
      await supabase.from(RAW_INVENTORY_TABLE).insert({
        product_id: item.product.id,
        qty_on_hand: deltaUnits,
        order_ref: currentOrder.code,
        received_at: now,
        location: "ADJUSTMENT",
        status: "available",
        notes: "Correction from Receiving Portal",
      });

      item.qtyReceivedTotal = newTotalPallets;
      renderItemsTable();
      editQtyModal.classList.remove("open");
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Corrected!",
        showConfirmButton: false,
        timer: 1000,
      });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      btnSaveEdit.disabled = false;
      btnSaveEdit.textContent = "Update Correction";
    }
  }

  // --- [NEW] DAMAGE REPORT LOGIC ---
  async function saveDamageReport() {
    const itemIdx = damageItemSelect.value;
    const qty = parseFloat(damageQtyInput.value);
    const notes = damageNotes.value;

    if (itemIdx === "" || !qty || qty <= 0)
      return Swal.fire("Missing Info", "Select item and quantity.", "warning");
    if (damagePhotos.length === 0)
      return Swal.fire(
        "Evidence Required",
        "Please take at least one photo.",
        "warning",
      );

    const item = currentItems[itemIdx];
    btnSaveDamage.disabled = true;
    btnSaveDamage.textContent = "Saving...";

    try {
      // Upload Photos
      const photoUrls = [];
      for (const p of damagePhotos) {
        const path = `damages/${currentOrder.code}/${Date.now()}_${p.file.name}`;
        const { error } = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, p.file);
        if (!error) {
          const { data } = supabase.storage
            .from(EVIDENCE_BUCKET)
            .getPublicUrl(path);
          photoUrls.push(data.publicUrl);
        }
      }

      // Insert Report
      const { error } = await supabase.from(DAMAGE_REPORTS_TABLE).insert({
        order_code: currentOrder.code,
        product_id: item.product.id,
        product_name: item.product.name,
        qty_damaged: qty,
        notes: notes,
        photos: photoUrls,
        reported_by: currentUser.email,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      damageModal.classList.remove("open");
      // Clean up
      damageItemSelect.value = "";
      damageQtyInput.value = "";
      damageNotes.value = "";
      damagePhotos = [];
      renderDamageGrid();

      Swal.fire("Report Saved", "Damage report has been logged.", "success");
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      btnSaveDamage.disabled = false;
      btnSaveDamage.textContent = "Save Report";
    }
  }

  // Damage Photo Handling
  function renderDamageGrid() {
    damagePhotoGrid.innerHTML = "";
    damagePhotos.forEach((p, idx) => {
      const d = document.createElement("div");
      d.className = "rcv-photo-item";
      d.innerHTML = `
                <img src="${p.url}">
                <button class="rcv-photo-remove" onclick="window.rcvRemoveDamagePhoto(${idx})">×</button>
            `;
      damagePhotoGrid.appendChild(d);
    });
  }

  window.rcvRemoveDamagePhoto = function (idx) {
    damagePhotos.splice(idx, 1);
    renderDamageGrid();
  };

  // --- 10. CLOSURE (EVIDENCE) ---
  async function executeFinalClosure() {
    const isFullyComplete = currentItems.every(
      (i) => i.qtyReceivedTotal >= i.qtyOrderedPallets - 0.001,
    );

    // If items are OVER, treat as complete (or handled)

    if (!isFullyComplete) {
      if (currentUserRole !== "manager" && currentUserRole !== "team-lead") {
        return Swal.fire({
          icon: "error",
          title: "Permission Denied",
          text: "Order INCOMPLETE. Manager required.",
        });
      }
      const confirm = await Swal.fire({
        title: "Incomplete",
        text: "Finalize as PARTIAL?",
        icon: "warning",
        showCancelButton: true,
      });
      if (!confirm.isConfirmed) return;
    }

    btnFinalConfirm.disabled = true;
    btnFinalConfirm.innerHTML =
      "<i class='bx bx-loader-alt bx-spin'></i> Closing...";

    try {
      const evidenceUrls = [];
      for (const p of evidencePhotos) {
        const path = `inbound/${currentOrder.code}/evidence_${Date.now()}_${p.file.name}`;
        const { error } = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, p.file);
        if (!error) {
          const { data } = supabase.storage
            .from(EVIDENCE_BUCKET)
            .getPublicUrl(path);
          evidenceUrls.push(data.publicUrl);
        }
      }

      const finalStatus = isFullyComplete
        ? "material_received"
        : "partial_received";
      const itemsSummary = currentItems.map((i) => ({
        sku: i.product.sku,
        name: i.product.name,
        received: i.qtyReceivedTotal,
      }));

      await supabase.from(RECEIVING_LOGS_TABLE).insert({
        order_code: currentOrder.code,
        received_by: currentUser.email,
        evidence_photos: evidenceUrls,
        notes: txtFinalNotes.value,
        items_summary: itemsSummary,
        closure_type: finalStatus,
      });

      await supabase
        .from(ORDERS_TABLE)
        .update({
          status: finalStatus,
          inbound_checked_in_at: isFullyComplete
            ? new Date().toISOString()
            : null,
          locked_by: null,
          locked_at: null,
        })
        .eq("unique_order_code", currentOrder.code);

      evidenceModal.classList.remove("open");

      Swal.fire({
        title: "Receipt Complete",
        text: "Proceed to print LPN labels?",
        icon: "success",
        showConfirmButton: true,
        confirmButtonText: "Print Labels",
        allowOutsideClick: false,
      }).then(() => {
        renderLpnGenerator(currentItems);
        summaryModal.classList.add("open");
      });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
      btnFinalConfirm.disabled = false;
    }
  }

  // --- LPN GENERATOR & PRINT ---
  function renderLpnGenerator(sourceItems) {
    if (!lpnItemListContainer) return;
    lpnItemListContainer.innerHTML = "";

    const itemsToRender = sourceItems || [];
    const validItems = itemsToRender.filter(
      (i) => (i.qtyReceivedTotal || i.received) > 0,
    );

    if (validItems.length === 0) {
      lpnItemListContainer.innerHTML =
        "<p class='text-center'>No items available.</p>";
      btnSummaryPrintLpn.disabled = true;
      return;
    }

    btnSummaryPrintLpn.disabled = false;

    validItems.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "lpn-item-row";

      const name = item.product ? item.product.name : item.name;
      const sku = item.product ? item.product.sku : item.sku;
      const recQty =
        item.qtyReceivedTotal !== undefined
          ? item.qtyReceivedTotal
          : item.received;

      const suggestedLabels = Math.ceil(recQty);

      div.innerHTML = `
                <div class="lpn-item-info">
                    <strong>${name}</strong>
                    <small>SKU: ${sku} | Qty: ${Number(recQty).toFixed(2)}</small>
                </div>
                <div class="lpn-qty-wrapper">
                    <label style="font-size:0.8rem; margin-right:5px;">Copies:</label>
                    <input type="number" min="0" value="${suggestedLabels}" 
                           class="lpn-qty-input" 
                           data-sku="${sku}"
                           data-name="${name.replace(/"/g, "&quot;")}"
                    >
                </div>
            `;
      lpnItemListContainer.appendChild(div);
    });
  }

  function handlePrintLpn() {
    const inputs = lpnItemListContainer.querySelectorAll(".lpn-qty-input");
    const labelsToPrint = [];
    const orderCodeRef = currentOrder ? currentOrder.code : "UNKNOWN";

    inputs.forEach((input) => {
      const qty = parseInt(input.value) || 0;
      if (qty > 0) {
        const sku = input.dataset.sku;
        const name = input.dataset.name;
        for (let i = 1; i <= qty; i++) {
          labelsToPrint.push({
            id: `RAW-${orderCodeRef}-${sku}-${i}`,
            sku: sku,
            name: name,
            date: new Date().toLocaleDateString(),
            order: orderCodeRef,
          });
        }
      }
    });

    if (labelsToPrint.length === 0)
      return Swal.fire("No Labels", "Enter quantity.", "warning");

    const paperSize = lpnPaperSizeSelect ? lpnPaperSizeSelect.value : "thermal";
    const win = window.open("", "_blank", "width=800,height=600");

    // [FIXED] Dynamic Page Styles
    let cssStyle = "";
    if (paperSize === "thermal") {
      cssStyle = `
                @page { size: 4in 6in; margin: 0; }
                html, body { width: 4in; height: 6in; margin: 0; padding: 0; }
                .label-page { 
                    width: 4in; height: 6in; 
                    page-break-after: always; 
                    display: flex; flex-direction: column; 
                    align-items: center; justify-content: center;
                    border: none; padding: 5px; box-sizing: border-box; text-align: center;
                }
            `;
    } else {
      cssStyle = `
                @page { size: letter; margin: 0.5in; }
                body { display: flex; flex-wrap: wrap; justify-content: flex-start; align-content: flex-start; font-family: sans-serif; }
                .label-page { 
                    width: 32%; height: 3.5in; 
                    border: 1px dashed #999; 
                    display: inline-flex; flex-direction: column; 
                    align-items: center; justify-content: center;
                    box-sizing: border-box; padding: 10px; text-align: center; margin: 0.5%;
                    page-break-inside: avoid;
                }
            `;
    }

    let html = `<html><head><title>LPN Labels</title><style>
            .lbl-header { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
            .lbl-sku { font-size: 28px; font-weight: 800; margin: 5px 0; word-break: break-all; }
            .lbl-desc { font-size: 14px; margin-bottom: 10px; max-height: 35px; overflow: hidden; }
            .lbl-lpn { font-family: monospace; font-size: 14px; margin-top: 5px; }
            ${cssStyle}
        </style></head><body>`;

    labelsToPrint.forEach((l) => {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${l.id}`;
      html += `
                <div class="label-page">
                    <div class="lbl-header">RAW MATERIAL</div>
                    <div class="lbl-sku">${l.sku}</div>
                    <div class="lbl-desc">${l.name}</div>
                    <img src="${qrUrl}" width="150" height="150" />
                    <div class="lbl-lpn">${l.id}</div>
                    <div style="font-size:12px; margin-top:5px;">Order: ${l.order} | ${l.date}</div>
                </div>
            `;
    });

    html += `<script>window.onload = function() { window.print(); }</script></body></html>`;
    win.document.write(html);
    win.document.close();
  }

  // --- REPRINT FUNCTION (FROM HISTORY) ---
  window.rcvReprint = function (logStr) {
    try {
      const log = JSON.parse(decodeURIComponent(logStr));
      if (!log.items_summary || log.items_summary.length === 0) {
        return Swal.fire(
          "Error",
          "No items data found in this record.",
          "error",
        );
      }
      currentOrder = { code: log.order_code };
      historyModal.classList.remove("open");
      renderLpnGenerator(log.items_summary);
      summaryModal.classList.add("open");
    } catch (e) {
      console.error("Reprint error", e);
      Swal.fire("Error", "Could not load reprint data.", "error");
    }
  };

  // --- 11. INCOMING ---
  async function loadIncomingAppointments() {
    const body = document.getElementById("rcv-incoming-body");
    if (!body) return;
    body.innerHTML =
      '<tr><td colspan="8" class="text-center">Loading...</td></tr>';

    try {
      const { data, error } = await supabase
        .from(ORDERS_TABLE)
        .select(`*, production_products(sku, name), profiles(full_name)`)
        .or(
          "status.eq.waiting_arrival,status.eq.pending,status.eq.partial_received,status.eq.receiving_in_progress,status.eq.receiving_paused",
        )
        .order("inbound_arrival_date", { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) {
        body.innerHTML = `<tr><td colspan="8" class="text-center">No incoming appointments.</td></tr>`;
        return;
      }

      groupedIncoming = data.reduce((acc, row) => {
        const code = row.unique_order_code;
        if (!acc[code]) {
          acc[code] = {
            code: code,
            client: row.profiles?.full_name || "Unknown",
            date: row.inbound_arrival_date,
            slot: row.inbound_slot,
            status: row.status,
            totalPallets: 0,
            items: [],
          };
        }
        acc[code].totalPallets += row.qty_calculated_pallets || 0;
        acc[code].items.push(row);
        return acc;
      }, {});

      body.innerHTML = "";
      Object.values(groupedIncoming).forEach((group) => {
        const tr = document.createElement("tr");
        const btnView = document.createElement("button");
        btnView.className = "btn-mini-action";
        btnView.textContent = "View";
        btnView.onclick = () => openPreviewModal(group);

        let statusBadge = `<span class="rcv-badge status-idle">${group.status}</span>`;
        if (group.status === "receiving_in_progress")
          statusBadge = `<span class="rcv-badge status-receiving_in_progress"><span class="live-dot"></span> LIVE</span>`;

        tr.innerHTML = `
                    <td>${group.date || "TBD"}</td>
                    <td>${(group.slot || "--").toUpperCase()}</td>
                    <td><strong>${group.code}</strong></td>
                    <td>${group.client}</td>
                    <td class="text-center">${group.items.length}</td>
                    <td class="text-right">${group.totalPallets.toFixed(2)}</td>
                    <td class="text-center">${statusBadge}</td>
                    <td class="text-center" id="action-cell-${group.code}"></td>
                `;
        body.appendChild(tr);
        tr.querySelector(`#action-cell-${group.code}`).appendChild(btnView);
      });
    } catch (err) {
      body.innerHTML = `<tr><td colspan="8" class="text-center" style="color:red">Error loading data</td></tr>`;
    }
  }

  // --- 12. HISTORY [UPDATED V6.0] ---
  function renderHistoryFilters() {
    // Insert controls into modal header/body if not present, but CSS/HTML already updated structure.
    // Just logic here.
  }

  async function loadHistory() {
    historyTableBody.innerHTML =
      '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
    historyModal.classList.add("open");

    // Read Filter Inputs
    const startDate = document.getElementById("hist-start-date")
      ? document.getElementById("hist-start-date").value
      : null;
    const endDate = document.getElementById("hist-end-date")
      ? document.getElementById("hist-end-date").value
      : null;
    const search = document.getElementById("hist-search")
      ? document.getElementById("hist-search").value.trim().toLowerCase()
      : "";

    try {
      // 1. Load Receiving Logs
      let query = supabase
        .from(RECEIVING_LOGS_TABLE)
        .select("*")
        .order("created_at", { ascending: false });

      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate + "T23:59:59");

      const { data: logs, error: logsError } = await query;
      if (logsError) throw logsError;

      // 2. Load Damages (To flag items)
      const { data: damages } = await supabase
        .from(DAMAGE_REPORTS_TABLE)
        .select("order_code");
      const damageMap = new Set(
        damages ? damages.map((d) => d.order_code) : [],
      );

      // 3. Filter Memory (Search)
      let filteredLogs = logs;
      if (search) {
        filteredLogs = logs.filter(
          (l) =>
            l.order_code.toLowerCase().includes(search) ||
            l.received_by.toLowerCase().includes(search),
        );
      }

      historyTableBody.innerHTML = "";
      if (filteredLogs && filteredLogs.length > 0) {
        filteredLogs.forEach((log) => {
          const tr = document.createElement("tr");
          const hasDamage = damageMap.has(log.order_code);

          let statusHtml = `<span class="rcv-badge status-success">Received</span>`;
          if (hasDamage)
            statusHtml += ` <span class="status-damage"><i class='bx bxs-error-circle'></i> Damaged</span>`;
          else if (log.closure_type === "partial_received")
            statusHtml = `<span class="rcv-badge status-warning">Partial</span>`;

          const logStr = encodeURIComponent(JSON.stringify(log));
          tr.innerHTML = `
                        <td>${new Date(log.created_at).toLocaleDateString()}</td>
                        <td><strong>${log.order_code}</strong></td>
                        <td>${log.received_by}</td>
                        <td class="text-center">${statusHtml}</td>
                        <td class="text-center">
                             <button class="btn-table-action" onclick="window.rcvReprint('${logStr}')">
                                <i class='bx bx-printer'></i> Labels
                            </button>
                        </td>
                    `;
          historyTableBody.appendChild(tr);
        });
      } else {
        historyTableBody.innerHTML = `<tr><td colspan="5" class="text-center">No history found matching criteria.</td></tr>`;
      }
    } catch (e) {
      console.error("History DB Error:", e);
      historyTableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red">Error: ${e.message}</td></tr>`;
    }
  }

  function openPreviewModal(group) {
    if (!previewModal) return;
    document.getElementById("prev-order-code").textContent = group.code;
    document.getElementById("prev-client").textContent = group.client;
    document.getElementById("prev-status").innerHTML =
      `<span class="rcv-badge status-idle">${group.status}</span>`;
    document.getElementById("prev-arrival").textContent =
      `${group.date} (${group.slot})`;
    const tbody = document.getElementById("prev-items-body");
    tbody.innerHTML = "";
    group.items.forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td><small>${item.production_products?.sku}</small></td><td>${item.production_products?.name}</td><td class="text-center">${(item.qty_calculated_pallets || 0).toFixed(2)}</td>`;
      tbody.appendChild(row);
    });
    previewModal.classList.add("open");
  }

  // --- MAIN LISTENERS ---
  function setupEventListeners() {
    mainInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") processInboundScan();
    });
    btnLookup.addEventListener("click", processInboundScan);
    productUpcInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleProductLocate();
    });

    if (btnScanCamera)
      btnScanCamera.onclick = () => openScanner("rcv-main-input");
    if (btnItemCamera)
      btnItemCamera.onclick = () => openScanner("rcv-product-upc-input");
    if (closeScannerBtn) closeScannerBtn.onclick = closeScanner;

    if (btnCancelQty)
      btnCancelQty.onclick = () => qtyModal.classList.remove("open");
    if (closeQtyModalBtn)
      closeQtyModalBtn.onclick = () => qtyModal.classList.remove("open");
    if (btnConfirmQty) btnConfirmQty.onclick = confirmTransaction;

    // [NEW] Edit Listeners
    if (closeEditQtyModalBtn)
      closeEditQtyModalBtn.onclick = () =>
        editQtyModal.classList.remove("open");
    if (btnCancelEdit)
      btnCancelEdit.onclick = () => editQtyModal.classList.remove("open");
    if (btnSaveEdit) btnSaveEdit.onclick = saveCorrection;

    btnModeCases.onclick = () => setTransactionMode("cases");
    btnModeUnits.onclick = () => setTransactionMode("units");
    viewModeSelect.onchange = () => renderItemsTable();

    btnPreConfirm.onclick = () => {
      if (currentItems.every((i) => i.qtyReceivedTotal === 0))
        return Swal.fire("Empty", "No items received.", "warning");
      evidenceModal.classList.add("open");
    };
    btnFinalConfirm.onclick = executeFinalClosure;

    if (btnSummaryFinish) btnSummaryFinish.onclick = cleanupAndExitUI;
    if (closeSummaryBtn) closeSummaryBtn.onclick = cleanupAndExitUI;
    if (btnSummaryPrintLpn) btnSummaryPrintLpn.onclick = handlePrintLpn;

    if (btnCancel)
      btnCancel.onclick = () =>
        Swal.fire({
          title: "Exit?",
          text: "Status will save automatically.",
          icon: "warning",
          showCancelButton: true,
        }).then((r) => {
          if (r.isConfirmed) exitOrderLogic();
        });

    if (btnHistory) btnHistory.onclick = loadHistory;
    if (btnRefresh) btnRefresh.onclick = loadIncomingAppointments;

    if (closePreviewBtn)
      closePreviewBtn.onclick = () => previewModal.classList.remove("open");
    if (btnClosePreviewFooter)
      btnClosePreviewFooter.onclick = () =>
        previewModal.classList.remove("open");
    if (closeHistoryBtn)
      closeHistoryBtn.onclick = () => historyModal.classList.remove("open");
    if (closeEvidenceBtn)
      closeEvidenceBtn.onclick = () => evidenceModal.classList.remove("open");
    if (btnCancelEvidence)
      btnCancelEvidence.onclick = () => evidenceModal.classList.remove("open");

    if (btnOpenDamage)
      btnOpenDamage.onclick = () => damageModal.classList.add("open");
    if (closeDamageBtn)
      closeDamageBtn.onclick = () => damageModal.classList.remove("open");
    if (btnCancelDamage)
      btnCancelDamage.onclick = () => damageModal.classList.remove("open");
    if (btnSaveDamage) btnSaveDamage.onclick = saveDamageReport;

    // Evidence Uploader (Modified for Multiple)
    evidenceTrigger.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true; // [NEW] Multiple allowed
      // input.capture = 'environment'; // Removed capture to allow gallery multiple select
      input.onchange = (e) => {
        if (e.target.files) {
          Array.from(e.target.files).forEach((f) => {
            evidencePhotos.push({ file: f, url: URL.createObjectURL(f) });
          });
          renderEvidenceGrid();
        }
      };
      input.click();
    });

    // Damage Photo Uploader (Single/Multiple)
    if (damagePhotoTrigger) {
      damagePhotoTrigger.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (e) => {
          if (e.target.files[0]) {
            const f = e.target.files[0];
            damagePhotos.push({ file: f, url: URL.createObjectURL(f) });
            renderDamageGrid();
          }
        };
        input.click();
      });
    }

    // History Filter Trigger
    const btnFilterHistory = document.getElementById("btn-filter-history");
    if (btnFilterHistory) btnFilterHistory.onclick = loadHistory;
  }

  function renderEvidenceGrid() {
    evidenceGrid.innerHTML = "";
    evidencePhotos.forEach((p, idx) => {
      const d = document.createElement("div");
      d.className = "rcv-photo-item";
      d.innerHTML = `
                <img src="${p.url}">
                <button class="rcv-photo-remove" onclick="window.rcvRemoveEvidencePhoto(${idx})">×</button>
            `;
      evidenceGrid.appendChild(d);
    });
    btnFinalConfirm.disabled = evidencePhotos.length < 2; // Requirement min 2
    btnFinalConfirm.style.opacity = evidencePhotos.length < 2 ? "0.5" : "1";
  }

  window.rcvRemoveEvidencePhoto = function (idx) {
    evidencePhotos.splice(idx, 1);
    renderEvidenceGrid();
  };

  async function exitOrderLogic() {
    if (!currentOrder) return;
    const hasProgress = currentItems.some((i) => i.qtyReceivedTotal > 0);
    let newStatus = hasProgress ? "receiving_paused" : "waiting_arrival";
    await supabase
      .from(ORDERS_TABLE)
      .update({ locked_by: null, locked_at: null, status: newStatus })
      .eq("unique_order_code", currentOrder.code);
    cleanupAndExitUI();
  }

  function cleanupAndExitUI() {
    if (summaryModal) summaryModal.classList.remove("open");
    mainInput.value = "";
    currentItems = [];
    currentOrder = null;
    activeOrderContainer.classList.add("rcv-hidden");
    scanSection.classList.remove("rcv-hidden");
    if (btnCancel) btnCancel.style.display = "none";
    document.getElementById("rcv-global-status").className =
      "rcv-badge status-idle";
    document.getElementById("rcv-global-status").textContent = "IDLE";
    loadIncomingAppointments();
  }

  init();
})();
