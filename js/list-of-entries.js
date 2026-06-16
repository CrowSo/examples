// js/list-of-entries.js
(() => {
  // SECTION 1: DOM Element Selection & Configuration
  if (typeof supabase === "undefined" || !supabase) {
    console.error("Supabase client is not available in list-of-entries.js.");
    return;
  }

  // --- Config & State ---
  const ENTRIES_TABLE = "main_entries";
  const CLIENTS_TABLE = "clients";
  const AVAILABLE_ENTRIES_TABLE = "available_entry_numbers";
  const BUCKET_NAME = "entriesdocs";
  let currentUserLE = null;
  let isModuleInitializedLE = false;
  let entriesDataTable, historyDataTable;
  let currentEntryIdForDocs = null;
  let allEntriesData = [];
  let historyYearsPopulated = false;
  let originalEntryStatus = {};
  let highestZIndexLE = 1300;

  // --- State for Real-Time Locking ---
  let currentLockedEntry = null; // { number: 'IMP-001', type: 'IMP' }
  // assignmentEpoch to track and cancel stale async requests
  let assignmentEpoch = 0;

  // State for Client Picker
  let availableClientsForPicker = [];
  // State for Entry Number Picker
  let availableEntryNumbersForPicker = [];

  const dutyTypes = [
    "Duties",
    "Potato fee",
    "Dairy fee",
    "Watermelon fee",
    "Honey fee",
  ];
  const dutyUnits = ["$", "kg", "L", "unit"];

  // --- Element Caching ---
  const entriesTableElement = document.getElementById("entriesTable");
  const addNewEntryBtn = document.getElementById("addNewEntryBtn");
  const addEntryNumbersBtn = document.getElementById("addEntryNumbersBtn");

  // Entry Form Elements
  const entryFormModal = document.getElementById("entryFormModal");
  const entryFormModalTitle = document.getElementById("entryFormModalTitle");
  const closeEntryFormModalBtn = document.getElementById(
    "closeEntryFormModalBtn",
  );
  const cancelEntryFormBtn = document.getElementById("cancelEntryFormBtn");
  const entryForm = document.getElementById("entryForm");
  const saveEntryBtn = document.getElementById("saveEntryBtn");
  const entryIdInput = document.getElementById("entryId");
  const customerTypeSelect = document.getElementById("le-customer-type-select");
  const customerNameInput = document.getElementById("le-customer-name-input");

  // Entry Number Elements
  const entryNumberInput = document.getElementById("le-entry-number-input");
  const searchEntryNumberBtn = document.getElementById("searchEntryNumberBtn");
  const entryLockStatus = document.getElementById("entryLockStatus");
  const entryNumberDatalist = document.getElementById(
    "le-entry-numbers-datalist",
  );

  const entryDetailsSection = document.getElementById("entryDetailsSection");
  const dutiesContainer = document.getElementById("le-duties-container");
  const addDutyLineBtn = document.getElementById("addDutyLineBtn");
  const invoiceInput = document.getElementById("le-invoice-input");
  const notesInput = document.getElementById("le-notes-input");
  const bondTypeError = document.getElementById("bondTypeError");
  const fdaStatusSelect = document.getElementById("le-fda-status-select");
  const cargoReleaseSelect = document.getElementById("le-cargo-release-select");
  const statusGroup = document.getElementById("le-status-group");
  const statusSelect = document.getElementById("le-status-select");

  // Client Picker Modal Elements
  const leClientPickerModal = document.getElementById("leClientPickerModal");
  const closeClientPickerModalBtn = document.getElementById(
    "closeClientPickerModalBtn",
  );
  const closeClientPickerFooterBtn = document.getElementById(
    "closeClientPickerFooterBtn",
  );
  const leClientSearchInput = document.getElementById("leClientSearchInput");
  const leClientCardsContainer = document.getElementById(
    "leClientCardsContainer",
  );
  const leNoClientsMessage = document.getElementById("leNoClientsMessage");

  // Entry Number Picker Modal Elements
  const leEntryNumberPickerModal = document.getElementById(
    "leEntryNumberPickerModal",
  );
  const closeEntryNumberPickerModalBtn = document.getElementById(
    "closeEntryNumberPickerModalBtn",
  );
  const closeEntryNumberPickerFooterBtn = document.getElementById(
    "closeEntryNumberPickerFooterBtn",
  );
  const leEntryNumberSearchInput = document.getElementById(
    "leEntryNumberSearchInput",
  );
  const leEntryNumberManualSearchBtn = document.getElementById(
    "leEntryNumberManualSearchBtn",
  );
  const leEntryNumberCardsContainer = document.getElementById(
    "leEntryNumberCardsContainer",
  );
  const leNoEntryNumbersMessage = document.getElementById(
    "leNoEntryNumbersMessage",
  );

  // View Modal Elements
  const viewEntryModal = document.getElementById("viewEntryModal");
  const viewEntryModalTitle = document.getElementById("viewEntryModalTitle");
  const viewEntryDetailsBody = document.getElementById("viewEntryDetailsBody");
  const closeViewEntryModalBtn = document.getElementById(
    "closeViewEntryModalBtn",
  );
  const closeViewEntryFooterBtn = document.getElementById(
    "closeViewEntryFooterBtn",
  );

  // Doc Modal Elements
  const leDocManagementModal = document.getElementById("leDocManagementModal");
  const leDocModalTitle = document.getElementById("leDocModalTitle");
  const leCloseDocModalBtn = document.getElementById("leCloseDocModalBtn");
  const leDocFileInput = document.getElementById("leDocFileInput");
  const leUploadDocBtn = document.getElementById("leUploadDocBtn");
  const leDocListContainer = document.getElementById("leDocListContainer");
  const leNoDocsMessage = document.getElementById("leNoDocsMessage");
  const leCloseDocModalFooterBtn = document.getElementById(
    "leCloseDocModalFooterBtn",
  );

  // Confirm Modal Elements
  const leCustomConfirmModal = document.getElementById("leCustomConfirmModal");
  const leCustomConfirmTitle = document.getElementById("leCustomConfirmTitle");
  const leCustomConfirmMessage = document.getElementById(
    "leCustomConfirmMessage",
  );
  const leCustomConfirmOkBtn = document.getElementById("leCustomConfirmOkBtn");
  const leCustomConfirmCancelBtn = document.getElementById(
    "leCustomConfirmCancelBtn",
  );
  const leCustomConfirmCloseBtn = document.getElementById(
    "leCustomConfirmCloseBtn",
  );
  let currentConfirmCallback = null;

  // CSV Modal Elements
  const addEntryNumbersModal = document.getElementById("addEntryNumbersModal");
  const closeEntryNumbersModalBtn = document.getElementById(
    "closeEntryNumbersModalBtn",
  );
  const cancelCsvUploadBtn = document.getElementById("cancelCsvUploadBtn");
  const processCsvBtn = document.getElementById("processCsvBtn");
  const csvUploadInput = document.getElementById("csvUploadInput");
  const csvProcessingResultsDiv = document.getElementById(
    "csv-processing-results",
  );
  const csvResultsMessage = document.getElementById("csvResultsMessage");

  // Dashboard Elements
  const dbTotalEntriesEl = document.getElementById("db-total-entries");
  const dbInProgressEntriesEl = document.getElementById(
    "db-inprogress-entries",
  );
  const dbCompletedEntriesEl = document.getElementById("db-completed-entries");
  const dbCancelledEntriesEl = document.getElementById("db-cancelled-entries");

  // History Elements
  const openHistoryModalBtn = document.getElementById("openHistoryModalBtn");
  const historyModal = document.getElementById("historyModal");
  const closeHistoryModalBtn = document.getElementById("closeHistoryModalBtn");
  const closeHistoryFooterBtn = document.getElementById(
    "closeHistoryFooterBtn",
  );
  const historyTableElement = document.getElementById("historyTable");
  const historyCustomerTypeSelect = document.getElementById(
    "historyCustomerType",
  );
  const historyCustomerNameInput = document.getElementById(
    "historyCustomerName",
  );
  const historyMonthSelect = document.getElementById("historyMonth");
  const historyYearSelect = document.getElementById("historyYear");
  const filterHistoryBtn = document.getElementById("filterHistoryBtn");
  const historyTotalResultsEl = document.getElementById("historyTotalResults");
  const noHistoryResultsMessageEl = document.getElementById(
    "noHistoryResultsMessage",
  );

  // REMOVED: Notification Elements and Logic (Cleaned up as requested)

  // SECTION 2: UTILITY & MODAL FUNCTIONS
  function showLENotification(message, type = "info", duration = 4000) {
    const container = document.getElementById("customNotificationContainerLE");
    if (!container) return;
    const notification = document.createElement("div");
    notification.className = `custom-notification-st ${type}`;
    let iconClass = "bx bx-info-circle";
    if (type === "success") iconClass = "bx bx-check-circle";
    if (type === "error") iconClass = "bx bx-x-circle";
    notification.innerHTML = `<i class='${iconClass}'></i><span>${message}</span>`;
    container.appendChild(notification);
    container.style.display = "block";
    setTimeout(() => notification.classList.add("show"), 10);
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 500);
    }, duration);
  }

  function openLeModal(modalElement) {
    if (modalElement) {
      highestZIndexLE++;
      modalElement.style.zIndex = highestZIndexLE;
      modalElement.style.display = "flex";
      setTimeout(() => modalElement.classList.add("le-modal-open"), 10);
      const table = modalElement.querySelector("table.dataTable");
      if (table) {
        setTimeout(() => {
          const dt = $(table).DataTable();
          dt.columns.adjust();
          dt.draw();
        }, 200);
      }
    }
  }

  function closeLeModal(modalElement) {
    if (modalElement) {
      modalElement.classList.remove("le-modal-open");
      setTimeout(() => {
        modalElement.style.display = "none";
      }, 300);
    }
  }

  function showConfirmModal(title, message, onOk) {
    leCustomConfirmTitle.textContent = title;
    leCustomConfirmMessage.innerHTML = message;
    currentConfirmCallback = onOk;
    openLeModal(leCustomConfirmModal);
  }

  function getFileIconClass(fileName) {
    if (!fileName) return "bxs-file-blank";
    const extension = fileName.split(".").pop().toLowerCase();
    switch (extension) {
      case "pdf":
        return "bxs-file-pdf";
      case "doc":
      case "docx":
        return "bxs-file-doc";
      case "xls":
      case "xlsx":
      case "csv":
        return "bxs-spreadsheet";
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
        return "bxs-file-image";
      default:
        return "bxs-file-blank";
    }
  }

  function parseCSV(csvText) {
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let inQuotedField = false;
    csvText = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      if (inQuotedField) {
        if (char === '"') {
          if (csvText[i + 1] === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotedField = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === ",") {
          currentRow.push(currentField);
          currentField = "";
        } else if (char === "\n") {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = "";
        } else if (char === '"' && currentField.length === 0) {
          inQuotedField = true;
        } else {
          currentField += char;
        }
      }
    }
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }
    return rows.filter(
      (row) => row.length > 1 || (row.length === 1 && row[0] !== ""),
    );
  }

  // SECTION 3: DATATABLE INITIALIZATION
  function initializeEntriesTable(data) {
    if ($.fn.DataTable.isDataTable(entriesTableElement)) {
      entriesDataTable.clear().rows.add(data).draw();
      return;
    }

    entriesDataTable = $(entriesTableElement).DataTable({
      data: data,
      dom: '<"dt-top"l f>rt<"dt-bottom"ip>',
      responsive: false,
      scrollX: true,
      scrollY: true,
      scrollCollapse: true,
      autoWidth: false,
      deferRender: true,

      columns: [
        { data: "entry_number", title: "Entry Number", className: "dt-left" },
        { data: "customer_name", title: "Customer", className: "dt-left" },
        {
          data: "created_at",
          title: "Date",
          className: "dt-center",
          render: (d) => (d ? new Date(d).toLocaleDateString() : "N/A"),
        },
        {
          data: "invoice",
          title: "Invoice",
          className: "dt-center",
          defaultContent: "",
        },
        {
          data: "duties",
          title: "Duties",
          className: "dt-center",
          render: (duties) => {
            if (duties && duties.length > 0)
              return "<span class='le-status-badge status-completed' style='background-color: #2a9d8f;'>Yes</span>";
            return "<span class='le-status-badge status-cancelled' style='background-color: #e31837;'>No</span>";
          },
        },
        { data: "bond_type", title: "Bond", className: "dt-center" },
        {
          data: "fda_status",
          title: "FDA Status",
          className: "dt-center",
          render: (status) => {
            const safeStatus = (status || "Hold")
              .toLowerCase()
              .replace(/\s/g, "-");
            return `<span class="le-status-badge status-${safeStatus}">${status || "Hold"}</span>`;
          },
        },
        {
          data: "cargo_release",
          title: "Cargo Release",
          className: "dt-center",
          render: (status) => {
            const safeStatus = (status || "Pending")
              .toLowerCase()
              .replace(/\s/g, "-");
            return `<span class="le-status-badge status-${safeStatus}">${status || "Pending"}</span>`;
          },
        },
        {
          data: "status",
          title: "Status",
          className: "dt-center",
          render: (status) => {
            const safeStatus = (status || "In Progress")
              .toLowerCase()
              .replace(/\s/g, "-");
            return `<span class="le-status-badge status-${safeStatus}">${status || "In Progress"}</span>`;
          },
        },
        { data: "user_name", title: "User", className: "dt-left" },
        {
          data: null,
          title: "Actions",
          orderable: false,
          searchable: false,
          className: "dt-center le-actions-column",
          render: (data, type, row) => `
                        <div class="le-table-actions">
                            <button data-action="complete" title="Complete Entry" ${row.status === "Completed" ? "disabled" : ""}><i class='bx bx-check-square'></i></button>
                            <button data-action="delete" title="Delete Entry"><i class='bx bx-trash'></i></button>
                        </div>
                    `,
        },
        {
          data: null,
          title: "View/Edit",
          orderable: false,
          searchable: false,
          className: "dt-center le-actions-column",
          render: () => `
                        <div class="le-table-actions">
                            <button data-action="view" title="View Details"><i class='bx bx-show'></i></button>
                            <button data-action="edit" title="Edit Entry"><i class='bx bx-edit'></i></button>
                        </div>
                    `,
        },
        {
          data: null,
          title: "Docs",
          orderable: false,
          searchable: false,
          className: "dt-center le-actions-column",
          render: () => `
                        <div class="le-table-actions">
                            <button data-action="docs" title="Manage Documents"><i class='bx bx-file'></i> Docs</button>
                        </div>
                    `,
        },
      ],
      language: {
        search: "",
        searchPlaceholder: "Search...",
        emptyTable: "No active entries recorded yet.",
        lengthMenu: "_MENU_ rows",
      },
      order: [[2, "desc"]],

      initComplete: function (settings, json) {
        const api = this.api();
        const wrapper = $(api.table().container());
        api.columns.adjust();
        setTimeout(() => {
          api.columns.adjust().draw();
          wrapper.addClass("le-ready");
        }, 250);
        setTimeout(() => {
          $(window).trigger("resize");
          api.columns.adjust();
        }, 500);
      },
    });
  }

  function initializeHistoryTable(data) {
    if ($.fn.DataTable.isDataTable(historyTableElement)) {
      historyDataTable.clear().rows.add(data).draw();
      return;
    }
    historyDataTable = $(historyTableElement).DataTable({
      data: data,
      dom: '<"dt-top"l f>rt<"dt-bottom"ip>',
      responsive: false,
      scrollX: true,
      scrollY: "55vh",
      scrollCollapse: true,
      autoWidth: false,
      deferRender: true,
      columns: [
        { data: "entry_number", title: "Entry Number", className: "dt-center" },
        { data: "customer_name", title: "Customer", className: "dt-center" },
        {
          data: "created_at",
          title: "Creation Date",
          className: "dt-center",
          render: (d) => (d ? new Date(d).toLocaleDateString() : "N/A"),
        },
        {
          data: "updated_at",
          title: "Completion Date",
          className: "dt-center",
          render: (d) => (d ? new Date(d).toLocaleDateString() : "N/A"),
        },
        {
          data: "status",
          title: "Status",
          className: "dt-center",
          render: (status) => {
            const safeStatus = (status || "").toLowerCase().replace(/\s/g, "-");
            return `<span class="le-status-badge status-${safeStatus}">${status}</span>`;
          },
        },
        { data: "user_name", title: "User", className: "dt-center" },
        {
          data: null,
          title: "View/Edit",
          orderable: false,
          searchable: false,
          className: "dt-center le-actions-column",
          render: () => `
                        <div class="le-table-actions">
                            <button data-action="view" title="View Details"><i class='bx bx-show'></i></button>
                            <button data-action="edit" title="Edit Entry"><i class='bx bx-edit'></i></button>
                        </div>
                    `,
        },
        {
          data: null,
          title: "Docs",
          orderable: false,
          searchable: false,
          className: "dt-center le-actions-column",
          render: () => `
                        <div class="le-table-actions">
                            <button data-action="docs" title="Manage Documents"><i class='bx bx-file'></i> Docs</button>
                        </div>
                    `,
        },
        {
          data: null,
          title: "Delete",
          orderable: false,
          searchable: false,
          className: "dt-center le-actions-column",
          render: () => `
                        <div class="le-table-actions">
                            <button data-action="delete" title="Delete Entry"><i class='bx bx-trash'></i></button>
                        </div>
                    `,
        },
      ],
      language: {
        search: "",
        searchPlaceholder: "Search History...",
        emptyTable: "No historical entries found.",
        lengthMenu: "_MENU_ rows",
      },
      order: [[3, "desc"]],
      initComplete: function (settings, json) {
        const api = this.api();
        const wrapper = $(api.table().container());
        api.columns.adjust();
        setTimeout(() => {
          api.columns.adjust().draw();
          wrapper.addClass("le-ready");
        }, 250);
        setTimeout(() => {
          api.columns.adjust();
        }, 500);
      },
    });
  }

  // SECTION 4: CORE LOGIC & DATABASE INTERACTIONS

  // --- REAL-TIME ENTRY LOCKING LOGIC START ---

  /**
   * Attempts to find the next available consecutive entry number for a type
   * and lock it immediately for the current user.
   */
  async function autoAssignAndLockNextEntry(customerType) {
    if (!currentUserLE) return;

    // Release any previously locked entry and capture the current Epoch
    await unlockCurrentEntry();
    
    // We increment epoch here. If another event (click/close) happens while this runs,
    // they will increment it again, making `thisEpoch` stale.
    const thisEpoch = ++assignmentEpoch;

    entryNumberInput.value = "Assigning...";
    entryNumberInput.disabled = true; // Temporary disable while assigning
    searchEntryNumberBtn.disabled = true;

    try {
      // Find the lowest available number
      const { data: available, error: fetchError } = await supabase
        .from(AVAILABLE_ENTRIES_TABLE)
        .select("entry_number")
        .eq("customer_type", customerType)
        .eq("is_used", false)
        .order("entry_number", { ascending: true }) // Consecurtive Logic
        .limit(1)
        .single();

      // RACE CONDITION CHECK 1: Before trying to lock, check if user cancelled
      if (assignmentEpoch !== thisEpoch) {
          console.log("Auto-assign cancelled by user action (pre-lock).");
          return;
      }

      if (fetchError || !available) {
        entryNumberInput.value = "";
        entryNumberInput.placeholder = "No numbers available";
        // Even if none found, we re-enable so they can try manual search or typing
        entryNumberInput.disabled = false;
        searchEntryNumberBtn.disabled = false;
        return;
      }

      // Attempt to lock it
      const lockedNumber = available.entry_number;
      const tempName = `Reserved for ${currentUserLE.email}`;

      const { error: lockError } = await supabase
        .from(AVAILABLE_ENTRIES_TABLE)
        .update({ is_used: true, customer_name: tempName })
        .eq("entry_number", lockedNumber)
        .eq("is_used", false); // Safety check: ensure it's STILL false

      if (lockError) {
        // Concurrency hit! Someone took it milliseconds ago. Retry.
        console.warn("Concurrency hit, retrying assignment...");
        await autoAssignAndLockNextEntry(customerType);
        return;
      }

      // RACE CONDITION CHECK 2: CRITICAL
      // If the user clicked "X", "Cancel" or "Search" WHILE we were waiting for DB,
      // the global assignmentEpoch has changed. We must release this lock immediately.
      if (assignmentEpoch !== thisEpoch) {
          console.log("Auto-assign cancelled by user action (post-lock). Releasing...");
          // Release the number we just successfully locked because the user is gone
          await supabase
            .from(AVAILABLE_ENTRIES_TABLE)
            .update({ is_used: false, customer_name: "" }) // MODIFIED: Send empty string instead of null
            .eq("entry_number", lockedNumber);
          return;
      }

      // Success - only if we are still in the same epoch
      currentLockedEntry = { number: lockedNumber, type: customerType };
      entryNumberInput.value = lockedNumber;
      entryNumberInput.disabled = false; // Allow user to delete if they want
      searchEntryNumberBtn.disabled = false;

      // UI Feedback
      entryLockStatus.style.display = "block";
      entryLockStatus.innerHTML = `<i class='bx bx-lock-alt'></i> Reserved for you: ${lockedNumber}`;
      entryDetailsSection.classList.add("visible");
      saveEntryBtn.disabled = false;
      if (dutiesContainer.children.length === 0) addDutyLineFromData(null);
    } catch (err) {
      console.error("Auto-assign error:", err);
      entryNumberInput.value = "Error";
    }
  }

  /**
   * Unlocks the currently locked entry if exists.
   */
  async function unlockCurrentEntry() {
    if (!currentLockedEntry) return;

    const { number, type } = currentLockedEntry;
    
    // Clear local state immediately so UI updates
    currentLockedEntry = null;
    if (entryLockStatus) entryLockStatus.style.display = "none";

    // Release it back to pool in DB
    const { error } = await supabase
      .from(AVAILABLE_ENTRIES_TABLE)
      .update({ is_used: false, customer_name: "" }) // MODIFIED: Send empty string instead of null
      .eq("entry_number", number)
      .eq("customer_type", type);

    if (!error) {
      console.log(`Released lock on ${number}`);
    }
  }

  /**
   * Locks a specific manually selected entry.
   */
  async function lockSpecificEntry(number, type) {
    if (!currentUserLE) return false;

    await unlockCurrentEntry(); // Release old one first

    const tempName = `Reserved for ${currentUserLE.email}`;
    const { error } = await supabase
      .from(AVAILABLE_ENTRIES_TABLE)
      .update({ is_used: true, customer_name: tempName })
      .eq("entry_number", number)
      .eq("customer_type", type)
      .eq("is_used", false);

    if (error) {
      showLENotification(
        "This number was just taken by another user.",
        "error",
      );
      return false;
    }

    currentLockedEntry = { number: number, type: type };
    entryNumberInput.value = number;
    entryLockStatus.style.display = "block";
    entryLockStatus.innerHTML = `<i class='bx bx-lock-alt'></i> Manually reserved: ${number}`;
    entryDetailsSection.classList.add("visible");
    saveEntryBtn.disabled = false;
    if (dutiesContainer.children.length === 0) addDutyLineFromData(null);
    return true;
  }

  // --- REAL-TIME ENTRY LOCKING LOGIC END ---

  async function fetchAllEntries() {
    if (!currentUserLE) return;
    const { data, error } = await supabase
      .from(ENTRIES_TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching entries:", error);
      showLENotification("Failed to load entries.", "error");
      return;
    }
    allEntriesData = data;
    const activeEntries = allEntriesData.filter(
      (e) => e.status === "In Progress",
    );
    initializeEntriesTable(activeEntries);
    updateDashboard();
  }

  async function saveEntry() {
    if (!currentUserLE)
      return showLENotification("You must be logged in.", "error");

    const bondSelected = document.querySelector(
      'input[name="bondType"]:checked',
    );
    if (!bondSelected) {
      bondTypeError.style.display = "block";
      return;
    }
    bondTypeError.style.display = "none";

    saveEntryBtn.disabled = true;
    saveEntryBtn.innerHTML =
      "<i class='bx bx-loader-alt bx-spin'></i> Saving...";

    const duties = Array.from(dutiesContainer.querySelectorAll(".le-duty-line"))
      .map((line) => ({
        type: line.querySelector("select:nth-child(1)").value,
        value: parseFloat(line.querySelector("input").value),
        unit: line.querySelector("select:nth-child(3)").value,
      }))
      .filter((d) => d.type && !isNaN(d.value) && d.unit);

    const entryId = entryIdInput.value;
    const dataToSave = {
      customer_type: customerTypeSelect.value,
      customer_name: customerNameInput.value.trim(),
      entry_number: entryNumberInput.value.trim(),
      invoice: invoiceInput.value.trim() || null,
      duties: duties,
      bond_type: bondSelected.value,
      fda_status: fdaStatusSelect.value,
      cargo_release: cargoReleaseSelect.value,
      notes: notesInput.value.trim() || null,
      user_email: currentUserLE.email,
      user_name: currentUserLE.user_metadata?.full_name || currentUserLE.email,
      status: statusSelect.value,
      updated_at: new Date().toISOString(),
    };

    if (!dataToSave.entry_number) {
      showLENotification("Entry number is required.", "error");
      saveEntryBtn.disabled = false;
      saveEntryBtn.textContent = "Save Entry";
      return;
    }

    // --- SAVE LOGIC ---
    let result;
    if (entryId) {
      result = await supabase
        .from(ENTRIES_TABLE)
        .update(dataToSave)
        .eq("id", entryId)
        .select()
        .single();
    } else {
      dataToSave.status = "In Progress";

      // 1. Confirm the lock is valid and update the customer name in available_entries
      if (
        currentLockedEntry &&
        currentLockedEntry.number === dataToSave.entry_number
      ) {
        await supabase
          .from(AVAILABLE_ENTRIES_TABLE)
          .update({ customer_name: dataToSave.customer_name }) // Finalize name
          .eq("entry_number", dataToSave.entry_number);

        // Clear the lock state locally because it's now permanently used
        currentLockedEntry = null;
      } else {
        // Edge case: User typed a number manually without locking mechanism
        await supabase
          .from(AVAILABLE_ENTRIES_TABLE)
          .update({ is_used: true, customer_name: dataToSave.customer_name })
          .eq("entry_number", dataToSave.entry_number);
      }

      result = await supabase
        .from(ENTRIES_TABLE)
        .insert(dataToSave)
        .select()
        .single();
    }

    saveEntryBtn.disabled = false;
    saveEntryBtn.textContent = "Save Entry";

    if (result.error) {
      showLENotification(
        `Error saving entry: ${result.error.message}`,
        "error",
      );
      console.error("Save Entry Error:", result.error);
    } else {
      showLENotification(
        `Entry ${entryId ? "updated" : "created"} successfully!`,
        "success",
      );
      closeLeModal(entryFormModal);
      await fetchAllEntries();
      // MODIFIED: Removed notification call here
    }
  }

  async function deleteEntry(entryId, entryNumber) {
    if (!currentUserLE) return;
    const entryToDelete = allEntriesData.find((e) => e.id === entryId);
    if (!entryToDelete) return;

    if (entryToDelete.documents && entryToDelete.documents.length > 0) {
      const filePaths = entryToDelete.documents.map((doc) => doc.file_path);
      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(filePaths);
      if (storageError) {
        showLENotification(
          `Could not delete associated files, but deleting record. Error: ${storageError.message}`,
          "warning",
        );
      }
    }

    const { error: deleteError } = await supabase
      .from(ENTRIES_TABLE)
      .delete()
      .eq("id", entryId);
    if (deleteError) {
      showLENotification(
        `Error deleting entry: ${deleteError.message}`,
        "error",
      );
      return;
    }

    // Release the number back to pool
    await supabase
      .from(AVAILABLE_ENTRIES_TABLE)
      .update({ is_used: false, customer_name: "" }) // MODIFIED: Send empty string instead of null
      .eq("entry_number", entryNumber);

    showLENotification("Entry deleted successfully.", "success");
    await fetchAllEntries();
  }

  async function completeEntry(entryId) {
    if (!currentUserLE) return;
    const originalEntry = allEntriesData.find((e) => e.id === entryId);
    if (!originalEntry) return;

    const { data, error } = await supabase
      .from(ENTRIES_TABLE)
      .update({ status: "Completed", updated_at: new Date().toISOString() })
      .eq("id", entryId)
      .select()
      .single();
    if (error) {
      showLENotification(`Error completing entry: ${error.message}`, "error");
    } else {
      showLENotification("Entry marked as completed.", "success");
      await fetchAllEntries();
      // MODIFIED: Removed notification call here
    }
  }

  // SECTION 5: MODAL & FORM HANDLING
  async function resetEntryForm() {
    // Invalidate any running auto-assign and unlock
    assignmentEpoch++; // Cancel pending requests
    await unlockCurrentEntry();

    entryForm.reset();
    entryIdInput.value = "";
    originalEntryStatus = {};
    customerTypeSelect.disabled = false;
    customerNameInput.value = "";
    customerNameInput.disabled = true;
    customerNameInput.readOnly = true;

    entryNumberInput.value = "";
    entryNumberInput.disabled = true;
    entryNumberInput.placeholder = "Select customer first...";
    searchEntryNumberBtn.disabled = true;
    if (entryLockStatus) entryLockStatus.style.display = "none";

    dutiesContainer.innerHTML = "";
    fdaStatusSelect.value = "Hold";
    cargoReleaseSelect.value = "Pending";
    entryDetailsSection.classList.remove("visible");
    saveEntryBtn.disabled = true;
    statusGroup.style.display = "none";
  }

  async function populateEntryForm(entry) {
    await populateCustomerTypes();
    if (entry) {
      // EDIT MODE
      originalEntryStatus = {
        fda_status: entry.fda_status,
        cargo_release: entry.cargo_release,
        status: entry.status,
      };

      entryFormModalTitle.innerHTML = `<i class='bx bx-edit-alt'></i> Edit Entry - ${entry.entry_number}`;
      entryIdInput.value = entry.id;
      customerTypeSelect.value = entry.customer_type;
      customerTypeSelect.disabled = true;
      customerNameInput.value = entry.customer_name;
      customerNameInput.disabled = true;

      // In edit mode, disable changing the number
      entryNumberInput.value = entry.entry_number;
      entryNumberInput.disabled = true;
      searchEntryNumberBtn.disabled = true;

      invoiceInput.value = entry.invoice || "";
      notesInput.value = entry.notes || "";
      document.querySelector(
        `input[name="bondType"][value="${entry.bond_type}"]`,
      ).checked = true;
      fdaStatusSelect.value = entry.fda_status || "Hold";
      cargoReleaseSelect.value = entry.cargo_release || "Pending";
      dutiesContainer.innerHTML = "";
      (entry.duties || []).forEach(addDutyLineFromData);
      statusSelect.value = entry.status || "In Progress";
      statusGroup.style.display = "block";
      entryDetailsSection.classList.add("visible");
      saveEntryBtn.disabled = false;
    } else {
      // NEW MODE
      entryFormModalTitle.innerHTML =
        "<i class='bx bx-plus-circle'></i> Add New Entry";
      statusGroup.style.display = "none";
    }
  }

  function populateViewModal(entry) {
    viewEntryModalTitle.innerHTML = `<i class='bx bx-show-alt'></i> Entry Details`;

    let dutiesHtml =
      '<div class="le-view-empty-state">No duties recorded.</div>';
    if (entry.duties && entry.duties.length > 0) {
      const listItems = entry.duties
        .map(
          (d) => `
                <div class="le-view-duty-card">
                    <div class="le-duty-icon"><i class='bx bx-purchase-tag'></i></div>
                    <div class="le-duty-info">
                        <span class="le-duty-type">${d.type}</span>
                        <span class="le-duty-amount">${d.value} <small>${d.unit}</small></span>
                    </div>
                </div>
            `,
        )
        .join("");
      dutiesHtml = `<div class="le-view-duties-grid">${listItems}</div>`;
    }

    const safeStatus = (entry.status || "In Progress")
      .toLowerCase()
      .replace(/\s/g, "-");
    const safeFdaStatus = (entry.fda_status || "Hold")
      .toLowerCase()
      .replace(/\s/g, "-");
    const safeCargoStatus = (entry.cargo_release || "Pending")
      .toLowerCase()
      .replace(/\s/g, "-");
    const dateStr = entry.created_at
      ? new Date(entry.created_at).toLocaleDateString()
      : "N/A";

    viewEntryDetailsBody.innerHTML = `
            <div class="le-view-hero">
                <div class="le-view-hero-content">
                    <span class="le-hero-label">Entry Number</span>
                    <h2 class="le-hero-title">${entry.entry_number}</h2>
                </div>
                <div class="le-view-hero-meta">
                    <div class="le-meta-item">
                        <i class='bx bx-calendar'></i> <span>${dateStr}</span>
                    </div>
                    <div class="le-meta-item">
                        <i class='bx bx-user'></i> <span>${entry.user_name || "System"}</span>
                    </div>
                </div>
            </div>
            <div class="le-view-status-row">
                <div class="le-status-card">
                    <span class="le-card-label">General Status</span>
                    <span class="le-status-badge status-${safeStatus} large-badge">${entry.status}</span>
                </div>
                <div class="le-status-card">
                    <span class="le-card-label">FDA Status</span>
                    <span class="le-status-badge status-${safeFdaStatus} large-badge">${entry.fda_status || "Hold"}</span>
                </div>
                <div class="le-status-card">
                    <span class="le-card-label">Cargo Release</span>
                    <span class="le-status-badge status-${safeCargoStatus} large-badge">${entry.cargo_release || "Pending"}</span>
                </div>
            </div>
            <div class="le-view-main-grid">
                <div class="le-view-section">
                    <h4 class="le-section-title"><i class='bx bx-buildings'></i> Customer Details</h4>
                    <div class="le-info-box">
                        <div class="le-info-row">
                            <span class="le-info-label">Customer Name:</span>
                            <span class="le-info-value highlight">${entry.customer_name}</span>
                        </div>
                        <div class="le-info-row">
                            <span class="le-info-label">Customer Type:</span>
                            <span class="le-info-value">${entry.customer_type}</span>
                        </div>
                    </div>
                </div>
                <div class="le-view-section">
                    <h4 class="le-section-title"><i class='bx bx-box'></i> Logistics & Bond</h4>
                    <div class="le-info-box">
                        <div class="le-info-row">
                            <span class="le-info-label">Invoice #:</span>
                            <span class="le-info-value">${entry.invoice || "N/A"}</span>
                        </div>
                        <div class="le-info-row">
                            <span class="le-info-label">Bond Type:</span>
                            <span class="le-info-value">${entry.bond_type}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="le-view-section full-width">
                <h4 class="le-section-title"><i class='bx bx-dollar-circle'></i> Duties & Fees</h4>
                ${dutiesHtml}
            </div>
            <div class="le-view-section full-width">
                <h4 class="le-section-title"><i class='bx bx-note'></i> Notes</h4>
                <div class="le-notes-box">
                    ${entry.notes ? entry.notes : '<span class="text-muted">No additional notes provided for this entry.</span>'}
                </div>
            </div>
        `;
    openLeModal(viewEntryModal);
  }

  // SECTION 6: DOCUMENT MANAGEMENT (Unchanged)
  async function uploadEntryDocument() {
    if (!currentEntryIdForDocs || !leDocFileInput.files[0]) return;
    leUploadDocBtn.disabled = true;
    const file = leDocFileInput.files[0];
    const entry = allEntriesData.find((e) => e.id === currentEntryIdForDocs);
    const filePath = `${currentUserLE.id}/${currentEntryIdForDocs}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file);

    if (uploadError) {
      showLENotification(`Upload error: ${uploadError.message}`, "error");
      leUploadDocBtn.disabled = false;
      return;
    }

    const newDocument = {
      id: `doc_${Date.now()}`,
      file_name: file.name,
      file_path: filePath,
      uploaded_at: new Date().toISOString(),
    };

    const updatedDocuments = [...(entry.documents || []), newDocument];
    const { error: dbError } = await supabase
      .from(ENTRIES_TABLE)
      .update({ documents: updatedDocuments })
      .eq("id", currentEntryIdForDocs);

    leUploadDocBtn.disabled = false;
    if (dbError) {
      showLENotification(
        `Failed to save document record: ${dbError.message}`,
        "error",
      );
    } else {
      showLENotification("Document uploaded successfully!", "success");
      entry.documents = updatedDocuments;
      renderEntryDocuments();
      leDocFileInput.value = "";
    }
  }

  function renderEntryDocuments() {
    const entry = allEntriesData.find((e) => e.id === currentEntryIdForDocs);
    leDocListContainer.innerHTML = "";
    if (entry && entry.documents && entry.documents.length > 0) {
      leNoDocsMessage.style.display = "none";
      entry.documents.forEach((doc) => {
        const card = document.createElement("div");
        card.className = "le-doc-card";
        card.innerHTML = `
                    <div class="le-doc-card-icon"><i class='bx ${getFileIconClass(doc.file_name)}'></i></div>
                    <div class="le-doc-card-info">
                        <span class="le-doc-card-name">${doc.file_name}</span>
                    </div>
                    <div class="le-doc-card-actions">
                        <button data-action="download" data-path="${doc.file_path}" title="Download"><i class='bx bxs-download'></i></button>
                        <button data-action="delete" data-id="${doc.id}" data-path="${doc.file_path}" title="Delete"><i class='bx bxs-trash'></i></button>
                    </div>`;
        leDocListContainer.appendChild(card);
      });
    } else {
      leNoDocsMessage.style.display = "block";
    }
  }

  async function handleDocumentAction(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    const path = button.dataset.path;
    const docId = button.dataset.id;
    const entry = allEntriesData.find((e) => e.id === currentEntryIdForDocs);

    if (action === "download") {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(path);
      if (error)
        return showLENotification(`Download error: ${error.message}`, "error");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(data);
      link.download = path.split("/").pop();
      link.click();
      URL.revokeObjectURL(link.href);
    } else if (action === "delete") {
      showConfirmModal(
        "Delete Document",
        "Are you sure you want to permanently delete this document?",
        async () => {
          const { error: storageError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([path]);
          if (storageError)
            return showLENotification(
              `Storage error: ${storageError.message}`,
              "error",
            );
          const updatedDocuments = entry.documents.filter(
            (d) => d.id !== docId,
          );
          const { error: dbError } = await supabase
            .from(ENTRIES_TABLE)
            .update({ documents: updatedDocuments })
            .eq("id", entry.id);
          if (dbError)
            return showLENotification(
              `DB update error: ${dbError.message}`,
              "error",
            );
          showLENotification("Document deleted successfully.", "success");
          entry.documents = updatedDocuments;
          renderEntryDocuments();
        },
      );
    }
  }

  // SECTION 7: NOTIFICATION LOGIC (REMOVED)

  // SECTION 8: EVENT LISTENERS & FORM HELPERS
  function addDutyLineFromData(duty) {
    const line = document.createElement("div");
    line.className = "le-duty-line";

    const typeSelect = document.createElement("select");
    typeSelect.className = "le-select-control";
    typeSelect.innerHTML = dutyTypes
      .map(
        (t) =>
          `<option value="${t}" ${duty && duty.type === t ? "selected" : ""}>${t}</option>`,
      )
      .join("");

    const valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.className = "le-input-control";
    valueInput.placeholder = "Value";
    valueInput.step = "0.01";
    valueInput.value = duty ? duty.value : "";
    valueInput.required = true;

    const unitSelect = document.createElement("select");
    unitSelect.className = "le-select-control";
    unitSelect.innerHTML = dutyUnits
      .map(
        (u) =>
          `<option value="${u}" ${duty && duty.unit === u ? "selected" : ""}>${u}</option>`,
      )
      .join("");

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "le-remove-duty-btn";
    removeBtn.innerHTML = "<i class='bx bx-trash'></i>";
    removeBtn.onclick = () => line.remove();

    line.append(typeSelect, valueInput, unitSelect, removeBtn);
    dutiesContainer.appendChild(line);
  }

  async function populateCustomerTypes(selectElement = customerTypeSelect) {
    // MODIFIED: Using RPC to get distinct types efficiently without payload limits
    const { data, error } = await supabase.rpc("get_unique_customer_types");

    if (error) {
      console.error("Error fetching customer types via RPC:", error);
      // Fallback in case RPC fails or doesn't exist yet
      const { data: fallbackData } = await supabase
        .from(AVAILABLE_ENTRIES_TABLE)
        .select("customer_type")
        .limit(1000);
      if (fallbackData) {
        const uniqueTypes = [
          ...new Set(
            fallbackData.map((item) => item.customer_type).filter(Boolean),
          ),
        ].sort();
        renderCustomerTypeOptions(selectElement, uniqueTypes);
      }
      return;
    }

    // RPC returns an array of objects: [{ customer_type: "Type A" }, ...]
    const uniqueTypes = data
      .map((item) => item.customer_type)
      .filter(Boolean)
      .sort();
    renderCustomerTypeOptions(selectElement, uniqueTypes);
  }

  function renderCustomerTypeOptions(selectElement, types) {
    selectElement.innerHTML =
      '<option value="" selected disabled>Select a type...</option>';
    types.forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      selectElement.appendChild(option);
    });
  }

  async function fetchAndRenderClients(type) {
    leClientCardsContainer.innerHTML =
      '<p style="text-align:center; width:100%;"><i class="bx bx-loader-alt bx-spin"></i> Loading clients...</p>';
    leNoClientsMessage.style.display = "none";

    const { data, error } = await supabase
      .from(CLIENTS_TABLE)
      .select("*")
      .eq("client_type", type)
      .order("company_name", { ascending: true });

    if (error) {
      console.error("Error fetching clients:", error);
      leClientCardsContainer.innerHTML =
        '<p class="error">Error loading clients.</p>';
      return;
    }

    availableClientsForPicker = data || [];
    renderClientPickerCards(availableClientsForPicker);
  }

  function renderClientPickerCards(clients) {
    leClientCardsContainer.innerHTML = "";
    if (clients.length === 0) {
      leNoClientsMessage.style.display = "block";
      return;
    }

    leNoClientsMessage.style.display = "none";
    clients.forEach((client) => {
      const card = document.createElement("div");
      card.className = "le-client-picker-card";
      card.dataset.name = client.company_name;
      card.innerHTML = `
                <div class="le-picker-icon"><i class='bx bxs-business'></i></div>
                <div class="le-picker-info">
                    <h4>${client.company_name}</h4>
                    <p>${client.contact_name || "No contact"}</p>
                </div>
            `;
      card.addEventListener("click", () => {
        handleClientSelection(client);
      });
      leClientCardsContainer.appendChild(card);
    });
  }

  function handleClientSelection(client) {
    customerNameInput.value = client.company_name;
    closeLeModal(leClientPickerModal);
    // fetchAvailableEntriesForType removed here as we now use auto-assign on type change
  }

  function filterClientPicker() {
    const term = leClientSearchInput.value.toLowerCase();
    const filtered = availableClientsForPicker.filter(
      (c) =>
        c.company_name.toLowerCase().includes(term) ||
        (c.contact_name && c.contact_name.toLowerCase().includes(term)),
    );
    renderClientPickerCards(filtered);
  }

  // --- Helper functions for Entry Number Picker Modal ---
  async function openEntryNumberPicker() {
    const type = customerTypeSelect.value;
    if (!type) return;

    leEntryNumberSearchInput.value = "";
    leEntryNumberCardsContainer.innerHTML =
      '<p style="text-align:center"><i class="bx bx-loader-alt bx-spin"></i> Loading numbers...</p>';
    openLeModal(leEntryNumberPickerModal);

    const { data, error } = await supabase
      .from(AVAILABLE_ENTRIES_TABLE)
      .select("*")
      .eq("customer_type", type)
      .eq("is_used", false) // Only show available
      .order("entry_number", { ascending: true })
      .limit(100); // Pagination limit

    if (error) {
      leEntryNumberCardsContainer.innerHTML =
        '<p class="error">Error loading numbers</p>';
      return;
    }

    availableEntryNumbersForPicker = data || [];
    renderEntryNumberCards(availableEntryNumbersForPicker);
  }

  function renderEntryNumberCards(numbers) {
    leEntryNumberCardsContainer.innerHTML = "";
    if (numbers.length === 0) {
      leNoEntryNumbersMessage.style.display = "block";
      return;
    }
    leNoEntryNumbersMessage.style.display = "none";

    numbers.forEach((item) => {
      const card = document.createElement("div");
      // Reusing client picker styles for consistency
      card.className = "le-client-picker-card";
      card.style.justifyContent = "center";
      card.innerHTML = `
            <div class="le-picker-info" style="text-align:center">
                <h4 style="font-size: 1.1rem; margin:0">${item.entry_number}</h4>
            </div>
        `;
      card.onclick = async () => {
        const success = await lockSpecificEntry(
          item.entry_number,
          item.customer_type,
        );
        if (success) {
          closeLeModal(leEntryNumberPickerModal);
        }
      };
      leEntryNumberCardsContainer.appendChild(card);
    });
  }

  // --- Manual Search logic (triggered by button) ---
  async function filterEntryNumberPicker() {
    const term = leEntryNumberSearchInput.value.trim();
    const type = customerTypeSelect.value;
    if (!type) return;

    // UI Feedback: Show loading inside the container
    leEntryNumberCardsContainer.innerHTML =
      '<p style="text-align:center"><i class="bx bx-loader-alt bx-spin"></i> Searching...</p>';

    // Build query to Supabase (Server-side search)
    let query = supabase
      .from(AVAILABLE_ENTRIES_TABLE)
      .select("*")
      .eq("customer_type", type)
      .eq("is_used", false) // Only available ones
      .order("entry_number", { ascending: true })
      .limit(100);

    // Apply filter if term exists
    if (term) {
      // Use ILIKE for case-insensitive partial match on the specific number
      query = query.ilike("entry_number", `%${term}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error searching entry numbers:", error);
      leEntryNumberCardsContainer.innerHTML =
        '<p class="error">Error searching numbers</p>';
      return;
    }

    availableEntryNumbersForPicker = data || [];
    renderEntryNumberCards(availableEntryNumbersForPicker);
  }

  function resetCsvModal() {
    csvUploadInput.value = "";
    processCsvBtn.disabled = true;
    csvProcessingResultsDiv.style.display = "none";
    csvResultsMessage.textContent = "";
  }

  async function handleProcessCsv() {
    const file = csvUploadInput.files[0];
    if (!file)
      return showLENotification("Please select a CSV file.", "warning");
    processCsvBtn.disabled = true;
    processCsvBtn.innerHTML =
      "<i class='bx bx-loader-alt bx-spin'></i> Processing...";

    const reader = new FileReader();
    reader.onload = async function (event) {
      try {
        const parsedRows = parseCSV(event.target.result);
        if (parsedRows.length < 2)
          throw new Error("CSV is empty or has no data.");
        const header = parsedRows
          .shift()
          .map((h) => h.toLowerCase().trim().replace(/"/g, ""));
        const typeIdx = header.indexOf("customer_type");
        const entryIdx = header.indexOf("entry_number");

        if (typeIdx === -1 || entryIdx === -1)
          throw new Error(
            'CSV must contain "customer_type" and "entry_number" columns.',
          );

        const entries = parsedRows
          .map((row) => ({
            customer_type: row[typeIdx]?.trim(),
            customer_name: row[typeIdx]?.trim(),
            entry_number: row[entryIdx]?.trim(),
          }))
          .filter((e) => e.customer_type && e.entry_number);

        if (entries.length === 0) throw new Error("No valid data rows found.");

        const { data: existing } = await supabase
          .from(AVAILABLE_ENTRIES_TABLE)
          .select("entry_number");
        const existingSet = new Set(existing.map((e) => e.entry_number));
        const newEntries = entries.filter(
          (e) => !existingSet.has(e.entry_number),
        );

        if (newEntries.length > 0) {
          const { error } = await supabase
            .from(AVAILABLE_ENTRIES_TABLE)
            .insert(newEntries);
          if (error) throw error;
        }

        csvResultsMessage.textContent = `Processed ${parsedRows.length + 1} rows. Added ${newEntries.length} new entries. Skipped ${entries.length - newEntries.length} duplicates.`;
        csvProcessingResultsDiv.style.display = "block";
      } catch (error) {
        showLENotification(error.message, "error");
      } finally {
        processCsvBtn.innerHTML = "Process Data";
      }
    };
    reader.readAsText(file);
  }

  function updateDashboard() {
    const activeEntries = allEntriesData.filter(
      (e) => e.status === "In Progress",
    );
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const completedThisMonth = allEntriesData.filter(
      (e) =>
        e.status === "Completed" && new Date(e.updated_at) >= firstDayOfMonth,
    );
    const cancelledThisMonth = allEntriesData.filter(
      (e) =>
        e.status === "Cancelled" && new Date(e.updated_at) >= firstDayOfMonth,
    );

    dbTotalEntriesEl.textContent = activeEntries.length;
    dbInProgressEntriesEl.textContent = activeEntries.length;
    dbCompletedEntriesEl.textContent = completedThisMonth.length;
    dbCancelledEntriesEl.textContent = cancelledThisMonth.length;
  }

  function setupEventListeners() {
    addNewEntryBtn.addEventListener("click", () => {
      resetEntryForm();
      populateEntryForm(null);
      openLeModal(entryFormModal);
    });
    addEntryNumbersBtn.addEventListener("click", () => {
      resetCsvModal();
      openLeModal(addEntryNumbersModal);
    });

    const handleTableAction = (action, data) => {
      switch (action) {
        case "view":
          populateViewModal(data);
          break;
        case "edit":
          resetEntryForm();
          openLeModal(entryFormModal);
          populateEntryForm(data);
          break;
        case "docs":
          currentEntryIdForDocs = data.id;
          leDocModalTitle.innerHTML = `<i class='bx bx-folder-open'></i> Entry Documents - ${data.entry_number}`;
          renderEntryDocuments();
          openLeModal(leDocManagementModal);
          break;
        case "complete":
          showConfirmModal(
            "Complete Entry",
            `Are you sure you want to mark entry <strong>${data.entry_number}</strong> as completed?`,
            () => completeEntry(data.id),
          );
          break;
        case "delete":
          showConfirmModal(
            "Delete Entry",
            `Are you sure you want to permanently delete entry <strong>${data.entry_number}</strong>? This cannot be undone.`,
            () => deleteEntry(data.id, data.entry_number),
          );
          break;
      }
    };

    $(entriesTableElement).on("click", "button", function () {
      const action = $(this).data("action");
      const row = $(this).closest("tr");
      if (!row.length) return;
      const data = entriesDataTable.row(row).data();
      if (data) handleTableAction(action, data);
    });

    $(historyTableElement).on("click", "button", function () {
      const action = $(this).data("action");
      const row = $(this).closest("tr");
      if (!row.length) return;
      const data = historyDataTable.row(row).data();
      if (data) handleTableAction(action, data);
    });

    closeEntryFormModalBtn.addEventListener("click", async () => {
      await resetEntryForm(); // Release lock on close
      closeLeModal(entryFormModal);
    });
    cancelEntryFormBtn.addEventListener("click", async () => {
      await resetEntryForm(); // Release lock on cancel
      closeLeModal(entryFormModal);
    });
    entryForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveEntry();
    });
    closeViewEntryModalBtn.addEventListener("click", () =>
      closeLeModal(viewEntryModal),
    );
    closeViewEntryFooterBtn.addEventListener("click", () =>
      closeLeModal(viewEntryModal),
    );
    leCloseDocModalBtn.addEventListener("click", () =>
      closeLeModal(leDocManagementModal),
    );
    leCloseDocModalFooterBtn.addEventListener("click", () =>
      closeLeModal(leDocManagementModal),
    );
    leUploadDocBtn.addEventListener("click", uploadEntryDocument);
    leDocListContainer.addEventListener("click", handleDocumentAction);
    leCustomConfirmCancelBtn.addEventListener("click", () =>
      closeLeModal(leCustomConfirmModal),
    );
    leCustomConfirmCloseBtn.addEventListener("click", () =>
      closeLeModal(leCustomConfirmModal),
    );
    leCustomConfirmOkBtn.addEventListener("click", () => {
      if (typeof currentConfirmCallback === "function")
        currentConfirmCallback();
      closeLeModal(leCustomConfirmModal);
    });

    // --- MODIFIED: Customer Type Change Logic ---
    customerTypeSelect.addEventListener("change", async () => {
      const selectedType = customerTypeSelect.value;
      if (selectedType) {
        customerNameInput.disabled = false;
        // AUTO-ASSIGN LOGIC
        await autoAssignAndLockNextEntry(selectedType);
      } else {
        customerNameInput.disabled = true;
        entryNumberInput.disabled = true;
      }
    });

    customerNameInput.addEventListener("click", () => {
      if (customerTypeSelect.value) {
        leClientSearchInput.value = "";
        fetchAndRenderClients(customerTypeSelect.value);
        openLeModal(leClientPickerModal);
      }
    });

    leClientSearchInput.addEventListener("input", filterClientPicker);
    closeClientPickerModalBtn.addEventListener("click", () =>
      closeLeModal(leClientPickerModal),
    );
    closeClientPickerFooterBtn.addEventListener("click", () =>
      closeLeModal(leClientPickerModal),
    );

    // --- Entry Number Input Logic Reordered ---
    entryNumberInput.addEventListener("input", async (e) => {
      const val = e.target.value;

      // 1. UI Updates FIRST (Instant feedback)
      if (val.trim().length > 0) {
        entryDetailsSection.classList.add("visible");
        saveEntryBtn.disabled = false;
        if (dutiesContainer.children.length === 0) addDutyLineFromData(null);
      } else {
        entryDetailsSection.classList.remove("visible");
        saveEntryBtn.disabled = true;
      }

      // 2. Async Logic SECOND (Background)
      if (val.trim() === "") {
        // User cleared input -> DO NOTHING HERE. Logic moved to Click/Search events.
      } else {
        // User is typing -> Unlock previous auto-assigned if exists
        // Check epoch to ensure we don't clear something being auto-assigned
        if (currentLockedEntry && currentLockedEntry.number !== val) {
          await unlockCurrentEntry();
        }
        if (entryLockStatus) entryLockStatus.style.display = "none";
      }
    });

    // --- Click Listener to clear/unlock on focus ---
    entryNumberInput.addEventListener("click", async () => {
      // Increment epoch to cancel any background auto-assign
      assignmentEpoch++;
      
      // If there is a locked entry (auto-assigned or otherwise), release it immediately
      // when the user clicks the input to type manually.
      if (currentLockedEntry) {
        await unlockCurrentEntry();
        entryNumberInput.value = "";
        if (entryLockStatus) entryLockStatus.style.display = "none";
        // Also hide details/save button until they type something valid
        entryDetailsSection.classList.remove("visible");
        saveEntryBtn.disabled = true;
      }
    });

    // --- Entry Number Picker Event Listeners (MANUAL SEARCH) ---
    // Change: Now unlocks current entry BEFORE opening the modal
    searchEntryNumberBtn.addEventListener("click", async () => {
      // Increment epoch to cancel any background auto-assign
      assignmentEpoch++;

      if (currentLockedEntry) {
        await unlockCurrentEntry();
        entryNumberInput.value = "";
        if (entryLockStatus) entryLockStatus.style.display = "none";
      }
      openEntryNumberPicker();
    });

    leEntryNumberManualSearchBtn.addEventListener(
      "click",
      filterEntryNumberPicker,
    );
    leEntryNumberSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault(); // Prevent accidental form submit
        filterEntryNumberPicker();
      }
    });

    closeEntryNumberPickerModalBtn.onclick = () =>
      closeLeModal(leEntryNumberPickerModal);
    closeEntryNumberPickerFooterBtn.onclick = () =>
      closeLeModal(leEntryNumberPickerModal);

    addDutyLineBtn.addEventListener("click", () => addDutyLineFromData(null));
    closeEntryNumbersModalBtn.addEventListener("click", () =>
      closeLeModal(addEntryNumbersModal),
    );
    cancelCsvUploadBtn.addEventListener("click", () =>
      closeLeModal(addEntryNumbersModal),
    );
    processCsvBtn.addEventListener("click", handleProcessCsv);
    csvUploadInput.addEventListener("change", () => {
      processCsvBtn.disabled = !csvUploadInput.files[0];
    });
    openHistoryModalBtn.addEventListener("click", openHistoryModal);
    closeHistoryModalBtn.addEventListener("click", () =>
      closeLeModal(historyModal),
    );
    closeHistoryFooterBtn.addEventListener("click", () =>
      closeLeModal(historyModal),
    );
    filterHistoryBtn.addEventListener("click", handleFilterHistoryEntries);

    $(window).on("resize", function () {
      if ($.fn.dataTable) {
        $($.fn.dataTable.tables(true)).DataTable().columns.adjust();
      }
    });
  }

  // SECTION 9: HISTORY FUNCTIONS
  function openHistoryModal() {
    populateHistoryFilterDropdowns();
    openLeModal(historyModal); // Open modal first
    // Then load data (Recalculate DataTables layout)
    setTimeout(() => {
      handleFilterHistoryEntries();
    }, 100);
  }

  function populateHistoryFilterDropdowns() {
    populateCustomerTypes(historyCustomerTypeSelect);
    if (historyMonthSelect.options.length <= 1) {
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
      historyMonthSelect.innerHTML = '<option value="">All Months</option>';
      months.forEach((month, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = month;
        historyMonthSelect.appendChild(option);
      });
    }
    if (!historyYearsPopulated) {
      const currentYear = new Date().getFullYear();
      historyYearSelect.innerHTML = '<option value="">All Years</option>';
      for (let i = 0; i < 5; i++) {
        const year = currentYear - i;
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        historyYearSelect.appendChild(option);
      }
      historyYearSelect.value = currentYear;
      historyYearsPopulated = true;
    }
  }

  function handleFilterHistoryEntries() {
    const historicalEntries = allEntriesData.filter(
      (e) => e.status === "Completed" || e.status === "Cancelled",
    );
    const type = historyCustomerTypeSelect.value;
    const name = historyCustomerNameInput.value.toLowerCase();
    const month = historyMonthSelect.value;
    const year = historyYearSelect.value;

    const filtered = historicalEntries.filter((entry) => {
      const entryDate = new Date(entry.updated_at);
      let match = true;
      if (type && entry.customer_type !== type) match = false;
      if (name && !entry.customer_name.toLowerCase().includes(name))
        match = false;
      if (year && entryDate.getFullYear() != year) match = false;
      if (month && entryDate.getMonth() != month) match = false;
      return match;
    });

    historyTotalResultsEl.textContent = `Results: ${filtered.length}`;
    noHistoryResultsMessageEl.style.display =
      filtered.length === 0 ? "block" : "none";
    initializeHistoryTable(filtered);
  }

  // SECTION 10: INITIALIZATION
  function initializeModule() {
    if (isModuleInitializedLE) return;
    console.log("LE Module: Initializing with Real-Time Locking (Email Logic Removed)...");
    setupEventListeners();

    const handleAuthChange = async (event) => {
      const user = event.detail?.user;
      if (user && (!currentUserLE || currentUserLE.id !== user.id)) {
        currentUserLE = user;
        await fetchAllEntries();
      } else if (!user && currentUserLE) {
        // Ensure we release locks on logout
        await unlockCurrentEntry();
        currentUserLE = null;
        allEntriesData = [];
        if (entriesDataTable) entriesDataTable.clear().draw();
        if (historyDataTable) historyDataTable.clear().draw();
        updateDashboard();
      }
    };

    // Safety: Try to unlock on unload
    const cleanupModule = () => {
      unlockCurrentEntry();
      if (entriesDataTable) {
        entriesDataTable.destroy();
        entriesDataTable = null;
      }
      if (historyDataTable) {
        historyDataTable.destroy();
        historyDataTable = null;
      }
      document.removeEventListener("supabaseAuthStateChange", handleAuthChange);
      document.removeEventListener("moduleWillUnload", cleanupModule);
      $(window).off("resize");
      console.log("LE Module Unloaded");
    };

    document.addEventListener("supabaseAuthStateChange", handleAuthChange);
    document.addEventListener("moduleWillUnload", cleanupModule);
    window.addEventListener("beforeunload", unlockCurrentEntry); // Try to catch browser close

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        currentUserLE = session.user;
        fetchAllEntries();
      }
    });

    isModuleInitializedLE = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeModule);
  } else {
    initializeModule();
  }
})();