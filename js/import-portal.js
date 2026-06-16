// js/import-portal.js
(() => {
    // SECTION 1: INITIALIZATION AND CONFIGURATION
    if (document.body.dataset.impModuleInitialized === "true") {
        return;
    }
    document.body.dataset.impModuleInitialized = "true";
    console.log(
        "Import Management Portal (IMP) Module Initialized - v16 (Trinity Layout Fix)"
    );

    if (typeof supabase === "undefined" || !supabase) {
        console.error("Supabase client is not available in import-portal.js.");
        return;
    }

    const SHIPMENTS_TABLE = "import_shipments";
    const CLIENT_ACCOUNTS_TABLE = "client_accounts";
    const LEDGER_ENTRIES_TABLE = "ledger_entries";
    const ACCOUNT_LEDGERS_TABLE = "account_ledgers";
    const BUCKET_NAME = "import-documents";
    const SHARED_RESOURCES_TABLE = "shared_resources";
    const RESOURCES_BUCKET_NAME = "shared-resources";

    let currentUserIMP = null;
    let clientAccount = null;
    let activeShipmentsTable, historyTable, ledgerTable;
    let shipmentSubscription = null;
    let filesToUpload = [];
    let allClientShipments = [];
    let allLedgerEntries = [];
    let allSharedResources = [];
    let currentShipmentIdForDocs = null;
    let currentShipmentDataForModals = null;
    let currentStep = 1;

    // --- DOM Element Caching ---
    const newShipmentBtn = document.getElementById("imp-new-shipment-btn");
    const historyBtn = document.getElementById("imp-history-btn");
    const viewLedgerBtn = document.getElementById("imp-view-ledger-btn");
    const activeShipmentsTableEl = document.getElementById(
        "imp-active-shipments-table"
    );
    const newShipmentModal = document.getElementById("imp-new-shipment-modal");
    const closeNewShipmentBtn = document.getElementById(
        "imp-close-new-shipment-btn"
    );
    const cancelShipmentBtn = document.getElementById("imp-cancel-shipment-btn");
    const entryTypeSelection = document.getElementById(
        "imp-entry-type-selection"
    );
    const entryTypeOptions = entryTypeSelection.querySelector(
        ".imp-entry-type-options"
    );
    const newShipmentForm = document.getElementById("imp-new-shipment-form");
    const dynamicFormContainer = document.getElementById(
        "imp-dynamic-form-container"
    );
    const stepperControls = document.getElementById("imp-stepper-controls");
    const prevStepBtn = document.getElementById("imp-prev-step-btn");
    const nextStepBtn = document.getElementById("imp-next-step-btn");
    const submitShipmentBtn = document.getElementById("imp-submit-shipment-btn");
    const fileInput = document.getElementById("imp-file-input");
    const fileListContainer = document.getElementById("imp-file-list");

    const historyModal = document.getElementById("imp-history-modal");
    const closeHistoryBtn = document.getElementById("imp-close-history-btn");
    const closeHistoryFooterBtn = document.getElementById(
        "imp-close-history-footer-btn"
    );
    const historyTableEl = document.getElementById("imp-history-table");
    const histMonthSelect = document.getElementById("imp-hist-month");
    const histYearSelect = document.getElementById("imp-hist-year");
    const histSearchInput = document.getElementById("imp-hist-search");
    const applyFiltersBtn = document.getElementById("imp-apply-filters-btn");
    const ledgerModal = document.getElementById("imp-ledger-modal");
    const closeLedgerBtn = document.getElementById("imp-close-ledger-btn");
    const closeLedgerFooterBtn = document.getElementById(
        "imp-close-ledger-footer-btn"
    );
    const ledgerBalanceSpan = document.getElementById(
        "imp-ledger-current-balance"
    );
    const ledgerTableEl = document.getElementById("imp-ledger-history-table");
    const ledgerStartDateInput = document.getElementById("imp-ledger-start-date");
    const ledgerEndDateInput = document.getElementById("imp-ledger-end-date");
    const ledgerMonthSelect = document.getElementById("imp-ledger-month");
    const ledgerYearSelect = document.getElementById("imp-ledger-year");
    const ledgerSearchInput = document.getElementById("imp-ledger-search");
    const ledgerFilterBtn = document.getElementById("imp-ledger-filter-btn");
    const ledgerDownloadBtn = document.getElementById("imp-ledger-download-btn");

    const detailsModal = document.getElementById("imp-details-modal");
    const detailsTitle = document.getElementById("imp-details-title");
    const detailsBody = document.getElementById("imp-details-body");
    const closeDetailsBtn = document.getElementById("imp-close-details-btn");
    const closeDetailsFooterBtn = document.getElementById(
        "imp-close-details-footer-btn"
    );

    const docManagementModal = document.getElementById(
        "imp-doc-management-modal"
    );
    const docModalTitle = document.getElementById("imp-doc-modal-title");
    const closeDocModalBtn = document.getElementById("imp-close-doc-modal-btn");
    const docFileInput = document.getElementById("imp-doc-file-input");
    const uploadDocBtn = document.getElementById("imp-upload-doc-btn");
    const docListContainer = document.getElementById("imp-doc-list-container");
    const noDocsMessage = document.getElementById("imp-no-docs-message");
    const closeDocModalFooterBtn = document.getElementById(
        "imp-close-doc-modal-footer-btn"
    );

    const confirmModal = document.getElementById("imp-confirm-modal");
    const confirmTitle = document.getElementById("imp-confirm-title");
    const confirmMessage = document.getElementById("imp-confirm-message");
    const confirmOkBtn = document.getElementById("imp-confirm-ok-btn");
    const confirmCancelBtn = document.getElementById("imp-confirm-cancel-btn");
    const confirmCloseBtn = document.getElementById("imp-confirm-close-btn");
    let confirmCallback = null;

    // New Modals Caching
    const reviewModal = document.getElementById("imp-review-modal");
    const reviewTitle = document.getElementById("imp-review-title");
    const reviewNotesContent = document.getElementById(
        "imp-review-notes-content"
    );
    const reviewFooter = document.getElementById("imp-review-footer");
    const closeReviewBtn = document.getElementById("imp-review-close-btn");

    const quoteModal = document.getElementById("imp-quote-modal");
    const quoteTitle = document.getElementById("imp-quote-title");
    const quoteBody = document.getElementById("imp-quote-body");
    const closeQuoteBtn = document.getElementById("imp-quote-close-btn");
    const downloadQuoteBtn = document.getElementById("imp-quote-download-btn");
    const clarificationQuoteBtn = document.getElementById(
        "imp-quote-clarification-btn"
    );
    const approveQuoteBtn = document.getElementById("imp-quote-approve-btn");

    const assetsModal = document.getElementById("imp-assets-modal");
    const assetsTitle = document.getElementById("imp-assets-title");
    const assetsListContainer = document.getElementById(
        "imp-assets-list-container"
    );
    const closeAssetsBtn = document.getElementById("imp-assets-close-btn");
    const closeAssetsFooterBtn = document.getElementById(
        "imp-assets-close-footer-btn"
    );

    // Resources Modal Elements
    const resourcesBtn = document.getElementById("imp-resources-btn");
    const resourcesModal = document.getElementById("imp-resources-modal");
    const closeResourcesBtn = document.getElementById("imp-close-resources-btn");
    const resourcesCloseFooterBtn = document.getElementById("imp-resources-close-footer-btn");
    const resourceSearchInput = document.getElementById("imp-resource-search-input");
    const resourcesListContainer = document.getElementById("imp-resources-list-container");


    function showIMPNotification(message, type = "info", duration = 4000) {
        if (window.showCustomNotificationST) {
            window.showCustomNotificationST(message, type, duration);
        } else {
            console.log(`IMP Notification (${type}): ${message}`);
        }
    }

    function openImpModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = "flex";
            setTimeout(() => modalElement.classList.add("imp-modal-open"), 10);
            
            // Adjust tables when opening modals
            if (modalElement.id === 'imp-history-modal' && historyTable) {
                historyTable.columns.adjust();
            }
            if (modalElement.id === 'imp-ledger-modal' && ledgerTable) {
                ledgerTable.columns.adjust();
            }
        }
    }

    function closeImpModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove("imp-modal-open");
            setTimeout(() => {
                modalElement.style.display = "none";
            }, 300);
        }
    }

    async function handleAuthChange(event) {
        currentUserIMP = event.detail?.user;
        if (currentUserIMP) {
            await fetchClientData();
        } else {
            clientAccount = null;
            if (activeShipmentsTable) {
                activeShipmentsTable.destroy();
                $(activeShipmentsTableEl).empty();
                activeShipmentsTable = null;
            }
            if (shipmentSubscription) {
                supabase.removeChannel(shipmentSubscription);
                shipmentSubscription = null;
            }
        }
    }

    function subscribeToShipmentChanges() {
        if (shipmentSubscription) {
            supabase.removeChannel(shipmentSubscription);
        }
        shipmentSubscription = supabase
            .channel(`public:${SHIPMENTS_TABLE}:client_id=eq.${clientAccount.id}`)
            .on(
                "postgres_changes", {
                    event: "*",
                    schema: "public",
                    table: SHIPMENTS_TABLE,
                    filter: `client_account_id=eq.${clientAccount.id}`,
                },
                (payload) => {
                    console.log("Realtime change received!", payload);
                    fetchClientData(true); // Pass flag to skip account creation
                }
            )
            .subscribe();
    }

    async function fetchClientData(skipAccountCheck = false) {
        if (!currentUserIMP) return;

        // Auto-Account Creation Logic
        if (!skipAccountCheck) {
            const {
                data: existingAccount,
                error: fetchError
            } = await supabase
                .from(CLIENT_ACCOUNTS_TABLE)
                .select("*")
                .eq("contact_email", currentUserIMP.email)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
                showIMPNotification("Error: Could not verify client account.", "error");
                return;
            }

            if (existingAccount) {
                clientAccount = existingAccount;
            } else {
                const accountName = currentUserIMP.email.split('@')[0];
                const {
                    data: newAccount,
                    error: insertError
                } = await supabase
                    .from(CLIENT_ACCOUNTS_TABLE)
                    .insert({
                        contact_email: currentUserIMP.email,
                        account_name: accountName,
                        contact_name: accountName,
                    })
                    .select()
                    .single();

                if (insertError) {
                    showIMPNotification(`Error creating client account: ${insertError.message}`, "error");
                    return;
                }

                clientAccount = newAccount;
                showIMPNotification(`Welcome, ${accountName}! Your account has been created.`, "success");
            }
            subscribeToShipmentChanges();
        }

        if (!clientAccount) {
            showIMPNotification("Could not retrieve client account information.", "error");
            return;
        }

        const {
            data,
            error
        } = await supabase
            .from(SHIPMENTS_TABLE)
            .select("*")
            .eq("client_account_id", clientAccount.id);

        if (error) {
            showIMPNotification("Error fetching shipments.", "error");
            return;
        }

        allClientShipments = data || [];
        const {
            data: ledgerData
        } = await supabase
            .from(ACCOUNT_LEDGERS_TABLE)
            .select("balance")
            .eq("client_account_id", clientAccount.id)
            .single();

        const activeShipments = allClientShipments.filter(
            (s) => !["Cancelled", "Archived"].includes(s.status)
        );

        updateDashboard(ledgerData?.balance || 0, allClientShipments);
        initializeShipmentsTable(activeShipments);
    }

    function updateDashboard(balance, shipments) {
        document.getElementById("imp-db-balance").textContent = `$${balance.toFixed(
            2
        )}`;
        const actionRequired = shipments.filter((s) =>
            ["Info Needed", "Quote Sent", "Clarification"].includes(s.status)
        ).length;
        document.getElementById("imp-db-action-required").textContent =
            actionRequired;

        const inProgress = shipments.filter((s) =>
            [
                "Submitted",
                "In Review",
                "Client Reply",
                "Docs OK",
                "Approved",
                "Paid",
            ].includes(s.status)
        ).length;
        document.getElementById("imp-db-in-progress").textContent = inProgress;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const completedLast30Days = shipments.filter(
            (s) => ["Completed", "Archived"].includes(s.status) && new Date(s.updated_at) >= thirtyDaysAgo
        ).length;
        document.getElementById("imp-db-completed").textContent =
            completedLast30Days;
    }

    // --- REFACTORED DATA TABLE INITIALIZATION (The Trinity Fix) ---
    function initializeDataTable(tableSelector, data, columnsConfig) {
        const table = $(tableSelector);
        
        // Always destroy and clear to allow DOM re-injection
        if ($.fn.DataTable.isDataTable(table)) {
            table.DataTable().destroy();
            table.empty();
        }
        
        return table.DataTable({
            data: data || [],
            responsive: true,
            columns: columnsConfig,
            order: [[1, "desc"]],
            // Trinity DOM Injection
            dom: '<"imp-dt-header"lf>rt<"imp-dt-footer"ip>',
            // Trigger internal scrolling (CSS controls height)
            scrollY: '50vh',
            scrollCollapse: true,
            paging: true,
            pageLength: 15,
            lengthMenu: [10, 15, 25, 50],
            language: {
                search: "",
                searchPlaceholder: "Search...",
                lengthMenu: "_MENU_ per page",
                info: "Showing _START_ to _END_ of _TOTAL_",
                emptyTable: "No data available.",
                paginate: {
                    first: "<i class='bx bx-chevrons-left'></i>",
                    last: "<i class='bx bx-chevrons-right'></i>",
                    next: "<i class='bx bx-chevron-right'></i>",
                    previous: "<i class='bx bx-chevron-left'></i>"
                }
            },
        });
    }

    function initializeShipmentsTable(data) {
        const columns = [{
                data: "id",
                title: "ID",
                className: "dt-center",
                render: (d) => (d ? d.substring(0, 8).toUpperCase() : ""),
            },
            {
                data: "created_at",
                title: "Submitted",
                className: "dt-center",
                render: (d) => new Date(d).toLocaleDateString(),
            },
            {
                data: "status",
                title: "Status",
                className: "dt-center",
                render: (d) =>
                    `<span class="imp-status-badge status-${(d || "pending")
                        .toLowerCase()
                        .replace(/\s+/g, "-")}">${d}</span>`,
            },
            {
                title: "Review",
                orderable: false,
                searchable: false,
                className: "dt-center",
                render: (data, type, row) => {
                    if (row.status === "Info Needed") {
                        return `<button class="btn-imp-alert" data-action="review" title="Review information requested by agent"><i class='bx bx-error-circle'></i> Review</button>`;
                    }
                    return "";
                },
            },
            {
                title: "View / Edit",
                orderable: false,
                searchable: false,
                className: "dt-center",
                render: (data, type, row) => {
                    const canEdit = ["Submitted", "Info Needed"].includes(row.status);
                    return `
                        <div class="imp-table-btn-group">
                            <button class="imp-icon-btn imp-btn-view" data-action="view" title="View Details"><i class='bx bx-show'></i></button>
                            <button class="imp-icon-btn imp-btn-edit" data-action="edit" ${canEdit ? "" : "disabled"
                        } title="Edit Request"><i class='bx bx-edit'></i></button>
                        </div>
                    `;
                },
            },
            {
                title: "Docs",
                orderable: false,
                searchable: false,
                className: "dt-center",
                render: () =>
                    `<button class="imp-icon-btn imp-btn-docs" data-action="docs" title="Manage Documents"><i class='bx bx-folder'></i></button>`,
            },
            {
                title: "Quote",
                orderable: false,
                searchable: false,
                className: "dt-center",
                render: (data, type, row) => {
                    const canViewQuote = [
                        "Quote Sent",
                        "Clarification",
                        "Approved",
                        "Paid",
                        "Completed",
                    ].includes(row.status);
                    return `<button class="btn-goldmex-primary btn-sm" data-action="quote" ${canViewQuote ? "" : "disabled"
                        }>View Quote</button>`;
                },
            },
            {
                title: "Results",
                orderable: false,
                searchable: false,
                className: "dt-center",
                render: (data, type, row) => {
                    const canViewResults = row.status === "Completed";
                    return `<button class="btn-sm imp-btn-assets" data-action="assets" ${canViewResults ? "" : "disabled"
                        }>Assets</button>`;
                },
            },
            {
                title: "Actions",
                orderable: false,
                searchable: false,
                className: "dt-center",
                render: (data, type, row) => {
                    const canArchive = row.status === "Completed";
                    const canDelete = ["Submitted"].includes(row.status);
                    return `
                        <div class="imp-table-btn-group">
                            <button class="imp-icon-btn imp-btn-delete" data-action="delete" ${canDelete ? "" : "disabled"
                        } title="Delete Request"><i class='bx bx-trash'></i></button>
                            <button class="imp-btn-archive-styled" data-action="archive" ${canArchive ? "" : "disabled"
                        } title="Archive Request"><i class='bx bx-archive'></i></button>
                        </div>
                     `;
                },
            },
        ];
        activeShipmentsTable = initializeDataTable(
            "#imp-active-shipments-table",
            data,
            columns
        );
    }

    function openNewShipmentModal(shipmentData = null) {
        newShipmentForm.reset();
        filesToUpload = [];
        updateFileList();
        currentStep = 1; // Reset step to 1 every time modal is opened
        document.getElementById("imp-shipment-id").value = "";

        const docStepContent = newShipmentForm.querySelector(
            '[data-step-content="2"]'
        );
        let existingFilesContainer = docStepContent.querySelector(
            "#imp-existing-files-container"
        );
        if (existingFilesContainer) {
            existingFilesContainer.remove();
        }

        if (shipmentData) {
            document.getElementById("imp-shipment-id").value = shipmentData.id;
            selectEntryType(shipmentData.entry_type);

            Object.keys(shipmentData.shipment_details).forEach((key) => {
                const input = newShipmentForm.querySelector(`[name="${key}"]`);
                if (input) {
                    input.value = shipmentData.shipment_details[key];
                }
            });

            if (shipmentData.attachments && shipmentData.attachments.length > 0) {
                const container = document.createElement("div");
                container.id = "imp-existing-files-container";
                container.innerHTML = `<hr style="margin: 1.5rem 0;"><h4 style="margin-bottom: 1rem;">Existing Documents</h4>`;
                const list = document.createElement("div");
                list.className = "imp-file-list";
                list.innerHTML = shipmentData.attachments
                    .map(
                        (file) =>
                        `<div class="imp-file-item"><span>${file.file_name}</span></div>`
                    )
                    .join("");
                container.appendChild(list);
                docStepContent.insertBefore(container, docStepContent.firstChild);
            }

            const transportTypeSelect = newShipmentForm.querySelector(
                "#imp-transport-type-select"
            );
            if (transportTypeSelect) {
                transportTypeSelect.dispatchEvent(new Event("change"));
            }
        } else {
            newShipmentForm.style.display = "none";
            stepperControls.style.display = "none";
            entryTypeSelection.style.display = "block";
            dynamicFormContainer.innerHTML =
                '<p class="imp-instructions">Select an entry type to begin.</p>';
        }

        openImpModal(newShipmentModal);
    }

    function selectEntryType(type) {
        document.getElementById("imp-entry-type-selected").value = type;
        entryTypeSelection.style.display = "none";
        newShipmentForm.style.display = "block";
        stepperControls.style.display = "flex";
        generateDynamicForm(type);
        currentStep = 1; // Ensure step is 1 when form is shown
        updateStepUI();
    }

    function generateDynamicForm(type) {
        let formHtml = `<h4>Shipment Details (Type ${type})</h4>`;
        if (type === "11") {
            formHtml += `
                <div class="imp-form-grid">
                    <div class="imp-form-group"><label>Carrier Code (SCAC)</label><input type="text" name="carrier_code"></div>
                    <div class="imp-form-group"><label>Arrival Date</label><input type="date" name="arrival_date"></div>
                    <div class="imp-form-group"><label>Port of Arrival</label><input type="text" name="port_of_arrival"></div>
                    <div class="imp-form-group"><label>Transport Type</label>
                        <select name="transport_type" id="imp-transport-type-select">
                            <option value="">Select...</option><option value="Air">Air</option><option value="Ground">Ground</option>
                        </select>
                    </div>
                </div>
                <div id="imp-air-fields" style="display:none; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border);">
                    <div class="imp-form-grid">
                         <div class="imp-form-group"><label>Flight Number</label><input type="text" name="flight_number"></div>
                    </div>
                </div>
                <div id="imp-ground-fields" style="display:none; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border);">
                     <div class="imp-form-grid">
                        <div class="imp-form-group"><label>Driver's Name</label><input type="text" name="driver_name"></div>
                        <div class="imp-form-group"><label>Vehicle Plates</label><input type="text" name="vehicle_plates"></div>
                        <div class="imp-form-group"><label>Trailer Plates</label><input type="text" name="trailer_plates"></div>
                        <div class="imp-form-group"><label>Trailer Type (Optional)</label>
                            <select name="trailer_type" class="imp-sub-option-select" data-other-target="imp-trailer-type-other">
                                <option value="">Select...</option><option value="53ft Box">53ft Box</option><option value="48ft Box">48ft Box</option><option value="Other">Other</option>
                            </select>
                            <input type="text" name="trailer_type_other" id="imp-trailer-type-other" style="display:none; margin-top: 0.5rem;" placeholder="Specify other trailer type">
                        </div>
                    </div>
                </div>`;
        } else {
            formHtml += `<p class="imp-instructions">Form fields for Type ${type} are not yet defined.</p>`;
        }
        dynamicFormContainer.innerHTML = formHtml;
    }

    function handleTransportTypeChange(event) {
        const selection = event.target.value;
        const airFields = document.getElementById("imp-air-fields");
        const groundFields = document.getElementById("imp-ground-fields");
        if (airFields)
            airFields.style.display = selection === "Air" ? "block" : "none";
        if (groundFields)
            groundFields.style.display = selection === "Ground" ? "block" : "none";
    }

    function handleSubOptionChange(event) {
        const select = event.target;
        const otherInputId = select.dataset.otherTarget;
        const otherInput = document.getElementById(otherInputId);
        if (otherInput) {
            otherInput.style.display = select.value === "Other" ? "block" : "none";
        }
    }

    function updateStepUI() {
        // This function now reads the global currentStep variable
        document.querySelectorAll(".imp-step").forEach((step, index) => {
            step.classList.toggle("active", index + 1 === currentStep);
        });
        document.querySelectorAll(".imp-form-step-content").forEach((content) => {
            content.classList.toggle(
                "active",
                parseInt(content.dataset.stepContent) === currentStep
            );
        });
        prevStepBtn.style.display = currentStep > 1 ? "inline-flex" : "none";
        nextStepBtn.style.display = currentStep < 2 ? "inline-flex" : "none";
        submitShipmentBtn.style.display =
            currentStep === 2 ? "inline-flex" : "none";
    }

    function updateFileList() {
        fileListContainer.innerHTML = filesToUpload
            .map(
                (file, index) =>
                `<div class="imp-file-item"><span>${file.name}</span><button type="button" data-index="${index}">&times;</button></div>`
            )
            .join("");
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!clientAccount)
            return showIMPNotification(
                "Client account not found. Cannot submit.",
                "error"
            );

        submitShipmentBtn.disabled = true;
        submitShipmentBtn.innerHTML =
            "<i class='bx bx-loader-alt bx-spin'></i> Saving...";
        try {
            const formData = new FormData(newShipmentForm);
            const shipmentDetails = {};
            formData.forEach((value, key) => {
                if (value) shipmentDetails[key] = value;
            });

            const entryType = document.getElementById(
                "imp-entry-type-selected"
            ).value;
            const editingId = document.getElementById("imp-shipment-id").value;
            const tempId = `new_${Date.now()}`;

            let existingAttachments = [];
            if (editingId) {
                const req = allClientShipments.find((r) => r.id === editingId);
                existingAttachments = req ? req.attachments || [] : [];
            }

            const newAttachmentMetadata = [];
            for (const file of filesToUpload) {
                const filePath = `${clientAccount.id}/${editingId || tempId
                    }/${Date.now()}_${file.name}`;
                const {
                    error: uploadError
                } = await supabase.storage
                    .from(BUCKET_NAME)
                    .upload(filePath, file);
                if (uploadError)
                    throw new Error(`File upload failed: ${uploadError.message}`);
                newAttachmentMetadata.push({
                    id: `doc_${Date.now()}`,
                    file_name: file.name,
                    file_path: filePath,
                    file_size: file.size,
                    content_type: file.type,
                    uploaded_at: new Date().toISOString(),
                });
            }

            const dataToSave = {
                client_account_id: clientAccount.id,
                entry_type: entryType,
                shipment_details: shipmentDetails,
                attachments: [...existingAttachments, ...newAttachmentMetadata],
                status: editingId ?
                    allClientShipments.find((s) => s.id === editingId)?.status ||
                    "Submitted" :
                    "Submitted",
            };

            let result;
            if (editingId) {
                result = await supabase
                    .from(SHIPMENTS_TABLE)
                    .update(dataToSave)
                    .eq("id", editingId)
                    .select()
                    .single();
            } else {
                result = await supabase
                    .from(SHIPMENTS_TABLE)
                    .insert(dataToSave)
                    .select()
                    .single();
            }

            if (result.error) throw result.error;

            showIMPNotification(
                `Shipment ${editingId ? "updated" : "submitted"} successfully!`,
                "success"
            );
            closeImpModal(newShipmentModal);
        } catch (error) {
            showIMPNotification(`Error saving request: ${error.message}`, "error");
            console.error(error);
        } finally {
            submitShipmentBtn.disabled = false;
            submitShipmentBtn.textContent = "Submit Request";
        }
    }

    function populateDetailsModal(data) {
        const {
            shipment_details,
            attachments,
            id
        } = data;
        detailsTitle.innerHTML = `<i class='bx bx-show-alt'></i> Details for Shipment #${id
            .substring(0, 8)
            .toUpperCase()}`;

        const createDetailGroup = (label, value) => `
            <div class="imp-detail-group">
                <span class="imp-detail-label">${label}</span>
                <span class="imp-detail-value">${value || "N/A"}</span>
            </div>
        `;

        const generalInfo = `
            <div class="imp-detail-section">
                <h4><i class='bx bxs-file-blank'></i> Shipment Information</h4>
                <div class="imp-detail-grid">
                    ${createDetailGroup(
            "Carrier Code (SCAC)",
            shipment_details.carrier_code
        )}
                    ${createDetailGroup(
            "Arrival Date",
            shipment_details.arrival_date
        )}
                    ${createDetailGroup(
            "Port of Arrival",
            shipment_details.port_of_arrival
        )}
                </div>
            </div>`;

        let transportInfo = "";
        if (shipment_details.transport_type === "Air") {
            transportInfo = `
                <div class="imp-detail-section">
                    <h4><i class='bx bxs-plane-alt'></i> Air Transport Details</h4>
                    <div class="imp-detail-grid">
                        ${createDetailGroup(
                "Flight Number",
                shipment_details.flight_number
            )}
                    </div>
                </div>`;
        } else if (shipment_details.transport_type === "Ground") {
            transportInfo = `
                <div class="imp-detail-section">
                    <h4><i class='bx bxs-truck'></i> Ground Transport Details</h4>
                    <div class="imp-detail-grid">
                        ${createDetailGroup(
                "Driver's Name",
                shipment_details.driver_name
            )}
                        ${createDetailGroup(
                "Vehicle Plates",
                shipment_details.vehicle_plates
            )}
                        ${createDetailGroup(
                "Trailer Plates",
                shipment_details.trailer_plates
            )}
                        ${createDetailGroup(
                "Trailer Type",
                shipment_details.trailer_type_other ||
                shipment_details.trailer_type
            )}
                    </div>
                </div>`;
        }

        const attachmentsHtml =
            attachments && attachments.length > 0 ?
            `<ul class="imp-view-attachments-list">${attachments
                    .map((doc) => `<li>${doc.file_name}</li>`)
                    .join("")}</ul>` :
            "<p>No documents were attached.</p>";

        const attachmentsSection = `
            <div class="imp-detail-section">
                 <h4><i class='bx bxs-file-archive'></i> Attached Documents</h4>
                 ${attachmentsHtml}
            </div>`;

        detailsBody.innerHTML = `
            <div class="imp-view-columns">
                <div>${generalInfo}${transportInfo}</div>
                <div>${attachmentsSection}</div>
            </div>`;
        openImpModal(detailsModal);
    }

    async function handleDeleteShipment(shipmentId) {
        const {
            error
        } = await supabase
            .from(SHIPMENTS_TABLE)
            .delete()
            .eq("id", shipmentId);

        if (error) {
            showIMPNotification(`Error deleting shipment: ${error.message}`, "error");
        } else {
            showIMPNotification("Shipment deleted successfully.", "success");
        }
    }

    async function handleArchiveShipment(shipmentId) {
        const {
            error
        } = await supabase
            .from(SHIPMENTS_TABLE)
            .update({
                status: "Archived"
            })
            .eq("id", shipmentId);

        if (error) {
            showIMPNotification(
                `Error archiving shipment: ${error.message}`,
                "error"
            );
        } else {
            showIMPNotification("Shipment archived successfully.", "success");
        }
    }

    function showConfirmModal(title, message, onConfirm) {
        confirmTitle.textContent = title;
        confirmMessage.innerHTML = message;
        confirmCallback = onConfirm;
        openImpModal(confirmModal);
    }

    async function openHistoryModal() {
        const historyData = allClientShipments.filter((s) =>
            ["Completed", "Cancelled", "Archived"].includes(s.status)
        );
        populateHistoryFilters(historyData);
        applyHistoryFilters(historyData);
        openImpModal(historyModal);
    }

    function populateHistoryFilters(data) {
        histMonthSelect.innerHTML = '<option value="all">All Months</option>';
        for (let i = 0; i < 12; i++) {
            histMonthSelect.innerHTML += `<option value="${i}">${new Date(
                0,
                i
            ).toLocaleString("default", { month: "long" })}</option>`;
        }
        const years = [
            ...new Set(data.map((r) => new Date(r.created_at).getFullYear())),
        ].sort((a, b) => b - a);
        histYearSelect.innerHTML = '<option value="all">All Years</option>';
        years.forEach(
            (year) =>
            (histYearSelect.innerHTML += `<option value="${year}">${year}</option>`)
        );
    }

    function applyHistoryFilters(data) {
        const month = histMonthSelect.value;
        const year = histYearSelect.value;
        const searchTerm = histSearchInput.value.toLowerCase();
        const filteredData = data.filter((req) => {
            const date = new Date(req.created_at);
            const yearMatch = year === "all" || date.getFullYear() == year;
            const monthMatch = month === "all" || date.getMonth() == month;
            const searchMatch =
                searchTerm === "" || (req.id || "").toLowerCase().includes(searchTerm);
            return yearMatch && monthMatch && searchMatch;
        });
        const historyColumns = [{
                data: "id",
                title: "Shipment ID",
                className: "dt-center",
                render: (d) => (d ? d.substring(0, 8).toUpperCase() : ""),
            },
            {
                data: "updated_at",
                title: "Date Closed",
                className: "dt-center",
                render: (d) => new Date(d).toLocaleDateString(),
            },
            {
                data: "status",
                title: "Final Status",
                className: "dt-center",
            },
            {
                data: null,
                title: "Actions",
                orderable: false,
                searchable: false,
                className: "dt-center",
                render: (data, type, row) => {
                    const canViewQuote = !!row.quote_details;
                    const canViewResults = row.final_attachments && row.final_attachments.length > 0;

                    return `
                        <div class="imp-table-btn-group">
                            <button class="imp-icon-btn imp-btn-view" data-action="view" title="View Details"><i class='bx bx-show'></i></button>
                            <button class="imp-icon-btn imp-btn-docs" data-action="docs" title="Manage Documents"><i class='bx bx-folder'></i></button>
                            <button class="btn-goldmex-primary btn-sm" data-action="quote" ${canViewQuote ? "" : "disabled"
                        }>View Quote</button>
                            <button class="btn-sm imp-btn-assets" data-action="assets" ${canViewResults ? "" : "disabled"
                        }>Assets</button>
                        </div>
                    `;
                },
            },
        ];
        historyTable = initializeDataTable(
            "#imp-history-table",
            filteredData,
            historyColumns
        );
    }

    async function openLedgerModal() {
        if (!clientAccount) return;
        const {
            data,
            error
        } = await supabase
            .from(LEDGER_ENTRIES_TABLE)
            .select("*")
            .eq("client_account_id", clientAccount.id)
            .order("created_at", {
                ascending: false
            });
        if (error) {
            showIMPNotification("Failed to load ledger history.", "error");
            return;
        }
        allLedgerEntries = data;
        ledgerBalanceSpan.textContent =
            document.getElementById("imp-db-balance").textContent;
        populateLedgerFilters();
        applyLedgerFilters();
        openImpModal(ledgerModal);
    }

    function populateLedgerFilters() {
        ledgerMonthSelect.innerHTML = '<option value="all">All Months</option>';
        for (let i = 0; i < 12; i++) {
            ledgerMonthSelect.innerHTML += `<option value="${i}">${new Date(
                0,
                i
            ).toLocaleString("default", { month: "long" })}</option>`;
        }
        const years = [
            ...new Set(
                allLedgerEntries.map((r) => new Date(r.created_at).getFullYear())
            ),
        ].sort((a, b) => b - a);
        ledgerYearSelect.innerHTML = '<option value="all">All Years</option>';
        years.forEach(
            (year) =>
            (ledgerYearSelect.innerHTML += `<option value="${year}">${year}</option>`)
        );
    }

    function applyLedgerFilters() {
        const month = ledgerMonthSelect.value;
        const year = ledgerYearSelect.value;
        const searchTerm = ledgerSearchInput.value.toLowerCase();
        const startDate = ledgerStartDateInput.value;
        const endDate = ledgerEndDateInput.value;
        let filteredData = allLedgerEntries;
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            filteredData = filteredData.filter(
                (entry) => new Date(entry.created_at) >= start
            );
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filteredData = filteredData.filter(
                (entry) => new Date(entry.created_at) <= end
            );
        }
        if (year !== "all")
            filteredData = filteredData.filter(
                (entry) => new Date(entry.created_at).getFullYear() == year
            );
        if (month !== "all")
            filteredData = filteredData.filter(
                (entry) => new Date(entry.created_at).getMonth() == month
            );
        if (searchTerm)
            filteredData = filteredData.filter((entry) =>
                (entry.associated_shipment_id || "").toLowerCase().includes(searchTerm)
            );
        const ledgerColumns = [{
                data: "created_at",
                title: "Date",
                render: (d) => new Date(d).toLocaleDateString(),
            },
            {
                data: "type",
                title: "Type"
            },
            {
                data: "amount",
                title: "Amount",
                render: (d) => `$${parseFloat(d).toFixed(2)}`,
            },
            {
                data: "reference",
                title: "Reference"
            },
            {
                data: "associated_shipment_id",
                title: "Shipment ID",
                defaultContent: "",
                render: (d) => (d ? d.substring(0, 8).toUpperCase() : ""),
            },
        ];
        ledgerTable = initializeDataTable(
            "#imp-ledger-history-table",
            filteredData,
            ledgerColumns
        );
    }

    function downloadLedgerReport() {
        const filteredData = ledgerTable.rows().data().toArray();
        if (filteredData.length === 0)
            return showIMPNotification("No data to generate a report.", "warning");
        const headers = ["Date", "Type", "Amount", "Reference", "Shipment ID"];
        let csvContent = headers.join(",") + "\r\n";
        filteredData.forEach((item) => {
            const row = [
                new Date(item.created_at).toLocaleDateString(),
                item.type,
                item.amount,
                `"${(item.reference || "-").replace(/"/g, '""')}"`,
                item.associated_shipment_id ?
                item.associated_shipment_id.substring(0, 8).toUpperCase() :
                "-",
            ];
            csvContent += row.join(",") + "\r\n";
        });
        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;"
        });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const filename = `Ledger_Report_${clientAccount.account_name.replace(
            /\s/g,
            "_"
        )}_${new Date().toISOString().split("T")[0]}.csv`;
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                return "bxs-file-excel";
            case "jpg":
            case "jpeg":
            case "png":
                return "bxs-file-image";
            default:
                return "bxs-file-blank";
        }
    }

    function renderDocuments() {
        const shipment = allClientShipments.find(
            (s) => s.id === currentShipmentIdForDocs
        );
        docListContainer.innerHTML = "";
        if (shipment && shipment.attachments && shipment.attachments.length > 0) {
            noDocsMessage.style.display = "none";
            shipment.attachments.forEach((doc) => {
                const card = document.createElement("div");
                card.className = "imp-doc-card";
                card.innerHTML = `
                    <div class="imp-doc-card-icon"><i class='bx ${getFileIconClass(
                    doc.file_name
                )}'></i></div>
                    <div class="imp-doc-card-info">
                        <span class="imp-doc-card-name">${doc.file_name}</span>
                        <span class="imp-doc-card-date">Uploaded: ${new Date(
                    doc.uploaded_at
                ).toLocaleDateString()}</span>
                    </div>
                    <div class="imp-doc-card-actions">
                        <button class="imp-doc-action-btn" data-action="download" data-path="${doc.file_path
                    }" title="Download"><i class='bx bxs-download'></i></button>
                        <button class="imp-doc-action-btn" data-action="delete" data-id="${doc.id
                    }" data-path="${doc.file_path
                    }" title="Delete"><i class='bx bxs-trash'></i></button>
                    </div>
                `;
                docListContainer.appendChild(card);
            });
        } else {
            noDocsMessage.style.display = "block";
        }
    }

    function openDocManagementModal(shipmentId) {
        currentShipmentIdForDocs = shipmentId;
        docModalTitle.innerHTML = `<i class='bx bx-folder-open'></i> Docs for Shipment #${shipmentId
            .substring(0, 8)
            .toUpperCase()}`;
        renderDocuments();
        openImpModal(docManagementModal);
    }

    async function handleUploadDocument() {
        if (!currentShipmentIdForDocs || !docFileInput.files[0] || !currentUserIMP)
            return;

        uploadDocBtn.disabled = true;
        uploadDocBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
        const file = docFileInput.files[0];
        const filePath = `${clientAccount.id
            }/${currentShipmentIdForDocs}/${Date.now()}_${file.name}`;

        const {
            error: uploadError
        } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, file);

        if (uploadError) {
            showIMPNotification(`Upload error: ${uploadError.message}`, "error");
            uploadDocBtn.disabled = false;
            uploadDocBtn.innerHTML = "<i class='bx bx-upload'></i> Upload";
            return;
        }

        const newDocument = {
            id: `doc_${Date.now()}`,
            file_name: file.name,
            file_path: filePath,
            uploaded_at: new Date().toISOString(),
            file_size: file.size,
            content_type: file.type,
        };

        const shipment = allClientShipments.find(
            (s) => s.id === currentShipmentIdForDocs
        );
        const updatedAttachments = [...(shipment.attachments || []), newDocument];

        const {
            error: dbError
        } = await supabase
            .from(SHIPMENTS_TABLE)
            .update({
                attachments: updatedAttachments
            })
            .eq("id", currentShipmentIdForDocs);

        uploadDocBtn.disabled = false;
        uploadDocBtn.innerHTML = "<i class='bx bx-upload'></i> Upload";

        if (dbError) {
            showIMPNotification(
                `Failed to save document record: ${dbError.message}`,
                "error"
            );
        } else {
            showIMPNotification("Document uploaded successfully!", "success");
            docFileInput.value = "";
        }
    }

    async function handleDeleteDocument(docId, filePath) {
        showConfirmModal(
            "Delete Document",
            "Are you sure you want to permanently delete this document?",
            async () => {
                const {
                    error: storageError
                } = await supabase.storage
                    .from(BUCKET_NAME)
                    .remove([filePath]);
                if (storageError) {
                    showIMPNotification(
                        `Storage error: ${storageError.message}`,
                        "error"
                    );
                    return;
                }

                const shipment = allClientShipments.find(
                    (s) => s.id === currentShipmentIdForDocs
                );
                const updatedAttachments = shipment.attachments.filter(
                    (d) => d.id !== docId
                );

                const {
                    error: dbError
                } = await supabase
                    .from(SHIPMENTS_TABLE)
                    .update({
                        attachments: updatedAttachments
                    })
                    .eq("id", shipment.id);

                if (dbError) {
                    showIMPNotification(`DB update error: ${dbError.message}`, "error");
                } else {
                    showIMPNotification("Document deleted successfully.", "success");
                }
            }
        );
    }

    // --- NEW MODAL LOGIC ---
    async function updateShipmentStatus(shipmentId, newStatus) {
        const {
            error
        } = await supabase
            .from(SHIPMENTS_TABLE)
            .update({
                status: newStatus
            })
            .eq("id", shipmentId);

        if (error) {
            showIMPNotification(`Error updating status: ${error.message}`, "error");
            return false;
        }
        return true;
    }

    function openReviewModal(shipmentData) {
        currentShipmentDataForModals = shipmentData;
        reviewTitle.innerHTML = `<i class='bx bx-message-alt-error'></i> Info Needed for #${shipmentData.id
            .substring(0, 8)
            .toUpperCase()}`;
        reviewNotesContent.textContent =
            shipmentData.broker_notes ||
            "No specific notes were provided by the agent.";

        reviewFooter.innerHTML = "";
        const addDocsButton = document.createElement("button");
        addDocsButton.id = "imp-review-add-docs-btn";
        addDocsButton.className = "btn-goldmex-secondary";
        addDocsButton.innerHTML = `<i class='bx bx-paperclip'></i> Add Documents`;
        addDocsButton.onclick = () => {
            openDocManagementModal(shipmentData.id);
        };

        const notifyButton = document.createElement("button");
        notifyButton.id = "imp-review-notify-btn";
        notifyButton.className = "btn-goldmex-primary";
        notifyButton.innerHTML = `<i class='bx bx-send'></i> Notify Operator of Update`;
        notifyButton.onclick = async () => {
            const success = await updateShipmentStatus(
                shipmentData.id,
                "Client Reply"
            );
            if (success) {
                showIMPNotification(
                    "Operator has been notified of the updates.",
                    "success"
                );
                closeImpModal(reviewModal);
            }
        };

        reviewFooter.appendChild(addDocsButton);
        reviewFooter.appendChild(notifyButton);

        openImpModal(reviewModal);
    }

    function openQuoteModal(shipmentData) {
        currentShipmentDataForModals = shipmentData;
        quoteTitle.textContent = `Quote for Shipment #${shipmentData.id
            .substring(0, 8)
            .toUpperCase()}`;
        const quoteDetails = shipmentData.quote_details || {};
        const charges = quoteDetails.charges || [];
        const notes = quoteDetails.notes || "";
        quoteBody.innerHTML = generateImportReportHtml(
            shipmentData,
            charges,
            notes
        );

        const isActionable = ["Quote Sent", "Clarification"].includes(shipmentData.status);
        approveQuoteBtn.disabled = !isActionable;
        clarificationQuoteBtn.disabled = !isActionable;

        openImpModal(quoteModal);
    }

    function openAssetsModal(shipmentData) {
        currentShipmentDataForModals = shipmentData;
        assetsTitle.innerHTML = `<i class='bx bxs-file-archive'></i> Final Docs for #${shipmentData.id
            .substring(0, 8)
            .toUpperCase()}`;
        const finalAttachments = shipmentData.final_attachments || [];
        assetsListContainer.innerHTML = "";

        if (finalAttachments.length > 0) {
            finalAttachments.forEach((doc) => {
                const card = document.createElement("div");
                card.className = "imp-doc-card";
                card.innerHTML = `
                <div class="imp-doc-card-icon"><i class='bx ${getFileIconClass(
                    doc.file_name
                )}'></i></div>
                <div class="imp-doc-card-info">
                    <span class="imp-doc-card-name">${doc.file_name}</span>
                    <span class="imp-doc-card-date">Uploaded: ${new Date(
                    doc.uploaded_at
                ).toLocaleDateString()}</span>
                </div>
                <div class="imp-doc-card-actions">
                    <button class="imp-doc-action-btn" data-action="download" data-path="${doc.file_path
                    }" title="Download"><i class='bx bxs-download'></i></button>
                </div>`;
                assetsListContainer.appendChild(card);
            });
        } else {
            assetsListContainer.innerHTML = `<p class="imp-no-docs-message">No final documents are available for this shipment yet.</p>`;
        }

        openImpModal(assetsModal);
    }

    // --- PORTED REPORT/QUOTE GENERATION LOGIC ---
    function generateImportReportHtml(data, charges, notes) {
        const clientInfo = clientAccount || {};
        const shipmentInfo = data.shipment_details || {};

        const totals = {};
        const feesHtml = charges
            .map((charge) => {
                totals[charge.currency] =
                    (totals[charge.currency] || 0) + charge.amount;
                return `<tr><td>${charge.name}</td><td class="text-right">${parseFloat(
                    charge.amount || 0
                ).toFixed(2)} ${charge.currency}</td></tr>`;
            })
            .join("");

        const totalHtml = Object.keys(totals)
            .map(
                (currency) => `
            <tr class="grand-total">
                <td>Grand Total Estimate (${currency})</td>
                <td class="text-right">${totals[currency].toFixed(
                    2
                )} ${currency}</td>
            </tr>`
            )
            .join("");

        return `
            <div class="imp-report-printable-area">
                <div class="imp-report-header">
                    <h3>Import Operations Report</h3>
                    <p>Shipment ID: ${data.id
                .substring(0, 8)
                .toUpperCase()} | Date: ${new Date().toLocaleDateString()}</p>
                </div>
                <div class="imp-report-grid">
                    <div class="imp-report-section">
                        <h4><i class='bx bx-user'></i> Client Information</h4>
                        <div class="imp-report-item"><span class="imp-report-label">Client:</span><span class="imp-report-value">${clientInfo.account_name || "N/A"
            }</span></div>
                        <div class="imp-report-item"><span class="imp-report-label">Contact:</span><span class="imp-report-value">${clientInfo.contact_name || "N/A"
            }</span></div>
                        <div class="imp-report-item"><span class="imp-report-label">Email:</span><span class="imp-report-value">${clientInfo.contact_email || "N/A"
            }</span></div>
                    </div>
                    <div class="imp-report-section">
                        <h4><i class='bx bxs-truck'></i> Shipment Details</h4>
                        <div class="imp-report-item"><span class="imp-report-label">Entry Type:</span><span class="imp-report-value">${data.entry_type || "N/A"
            }</span></div>
                        <div class="imp-report-item"><span class="imp-report-label">Arrival Date:</span><span class="imp-report-value">${shipmentInfo.arrival_date || "N/A"
            }</span></div>
                        <div class="imp-report-item"><span class="imp-report-label">Transport:</span><span class="imp-report-value">${shipmentInfo.transport_type || "N/A"
            }</span></div>
                    </div>
                    <div class="imp-report-section imp-report-full-width">
                        <h4><i class='bx bx-dollar-circle'></i> Quotation Details</h4>
                        <table class="imp-report-quote-table">
                            <thead><tr><th style="text-align: left;">Description</th><th class="text-right">Amount</th></tr></thead>
                            <tbody>${feesHtml}${totalHtml}</tbody>
                        </table>
                    </div>
                    <div class="imp-report-section imp-report-full-width">
                        <h4><i class='bx bx-note'></i> Operator Notes</h4>
                        <div class="imp-report-notes">${notes || "No additional notes."
            }</div>
                    </div>
                </div>
            </div>`;
    }

    async function downloadImportReportAsPdf() {
        if (!currentShipmentDataForModals) return;
        if (
            typeof html2canvas === "undefined" ||
            typeof window.jspdf === "undefined"
        ) {
            return showIMPNotification(
                "PDF generation libraries are not available.",
                "error"
            );
        }
        const reportContent = quoteBody.querySelector(".imp-report-printable-area");
        if (!reportContent) {
            return showIMPNotification("Could not find report content.", "error");
        }
        try {
            const canvas = await html2canvas(reportContent, {
                scale: 2,
                useCORS: true,
            });
            const imgData = canvas.toDataURL("image/png");
            const {
                jsPDF
            } = window.jspdf;
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "in",
                format: "letter",
            });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const contentWidth = pdfWidth - 1;
            const ratio = canvas.height / canvas.width;
            const contentHeight = contentWidth * ratio;
            pdf.addImage(imgData, "PNG", 0.5, 0.5, contentWidth, contentHeight);
            const filename = `Import_Quote_${clientAccount.account_name.replace(
                /\s/g,
                "_"
            )}_${currentShipmentDataForModals.id.substring(0, 8).toUpperCase()}.pdf`;
            pdf.save(filename);
        } catch (error) {
            console.error("PDF generation failed:", error);
            showIMPNotification("An error occurred during PDF generation.", "error");
        }
    }

    async function openResourcesModal() {
        resourcesListContainer.innerHTML = "<p>Loading resources...</p>";
        openImpModal(resourcesModal);
        const {
            data,
            error
        } = await supabase
            .from(SHARED_RESOURCES_TABLE)
            .select('*')
            .order('created_at', {
                ascending: false
            });

        if (error) {
            showIMPNotification(`Error fetching resources: ${error.message}`, 'error');
            resourcesListContainer.innerHTML = "<p>Could not load resources.</p>";
            return;
        }
        allSharedResources = data;
        renderClientResources();
    }

    function renderClientResources(searchTerm = "") {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filteredResources = allSharedResources.filter(resource =>
            resource.file_name.toLowerCase().includes(lowerCaseSearchTerm)
        );

        if (filteredResources.length === 0) {
            resourcesListContainer.innerHTML = "<p>No resources found.</p>";
            return;
        }

        resourcesListContainer.innerHTML = filteredResources.map((resource, index) => `
            <div class="imp-resource-card">
                <div class="imp-resource-card-header">
                    <div class="imp-resource-number">${index + 1}</div>
                    <div class="imp-resource-name" title="${resource.file_name}">${resource.file_name}</div>
                </div>
                <div class="imp-resource-card-footer">
                    <button class="imp-resource-btn-download" data-path="${resource.file_path}" data-name="${resource.file_name}" title="Download">
                        <i class='bx bxs-download'></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    async function handleResourceDownload(filePath, fileName) {
        try {
            const {
                data,
                error
            } = await supabase.storage
                .from(RESOURCES_BUCKET_NAME)
                .download(filePath);

            if (error) {
                throw error;
            }

            const link = document.createElement('a');
            link.href = URL.createObjectURL(data);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch (error) {
            showIMPNotification(`Error downloading file: ${error.message}`, 'error');
        }
    }


    function setupEventListeners() {
        newShipmentBtn.addEventListener("click", () => openNewShipmentModal());
        historyBtn.addEventListener("click", openHistoryModal);
        viewLedgerBtn.addEventListener("click", openLedgerModal);
        closeNewShipmentBtn.addEventListener("click", () =>
            closeImpModal(newShipmentModal)
        );
        cancelShipmentBtn.addEventListener("click", () =>
            closeImpModal(newShipmentModal)
        );
        closeHistoryBtn.addEventListener("click", () =>
            closeImpModal(historyModal)
        );
        closeHistoryFooterBtn.addEventListener("click", () =>
            closeImpModal(historyModal)
        );
        applyFiltersBtn.addEventListener("click", () =>
            applyHistoryFilters(
                allClientShipments.filter((s) =>
                    ["Completed", "Cancelled", "Archived"].includes(s.status)
                )
            )
        );
        closeLedgerBtn.addEventListener("click", () => closeImpModal(ledgerModal));
        closeLedgerFooterBtn.addEventListener("click", () =>
            closeImpModal(ledgerModal)
        );
        ledgerFilterBtn.addEventListener("click", applyLedgerFilters);
        ledgerDownloadBtn.addEventListener("click", downloadLedgerReport);
        entryTypeOptions.addEventListener("click", (e) => {
            const card = e.target.closest(".imp-entry-type-card");
            if (card) selectEntryType(card.dataset.entryType);
        });

        nextStepBtn.addEventListener("click", () => {
            if (currentStep < 2) {
                currentStep++;
                updateStepUI();
            }
        });
        prevStepBtn.addEventListener("click", () => {
            if (currentStep > 1) {
                currentStep--;
                updateStepUI();
            }
        });

        newShipmentForm.addEventListener("submit", handleFormSubmit);
        dynamicFormContainer.addEventListener("change", (e) => {
            if (e.target.id === "imp-transport-type-select")
                handleTransportTypeChange(e);
            if (e.target.classList.contains("imp-sub-option-select"))
                handleSubOptionChange(e);
        });
        fileInput.addEventListener("change", (e) => {
            filesToUpload.push(...Array.from(e.target.files));
            updateFileList();
        });
        fileListContainer.addEventListener("click", (e) => {
            if (e.target.tagName === "BUTTON") {
                const index = parseInt(e.target.dataset.index, 10);
                filesToUpload.splice(index, 1);
                updateFileList();
            }
        });

        const handleTableButtonClick = (table, event) => {
            const button = $(event.target).closest("button");
            const action = button.data("action");
            const row = button.closest("tr");
            if (!row.length) return;
            const data = table.row(row).data();
            if (!data) return;

            switch (action) {
                case "view":
                    populateDetailsModal(data);
                    break;
                case "edit":
                    openNewShipmentModal(data);
                    break;
                case "delete":
                    showConfirmModal(
                        "Confirm Deletion",
                        `Are you sure you want to delete shipment <strong>#${data.id
                            .substring(0, 8)
                            .toUpperCase()}</strong>? This cannot be undone.`,
                        () => handleDeleteShipment(data.id)
                    );
                    break;
                case "docs":
                    openDocManagementModal(data.id);
                    break;
                case "review":
                    openReviewModal(data);
                    break;
                case "quote":
                    openQuoteModal(data);
                    break;
                case "assets":
                    openAssetsModal(data);
                    break;
                case "archive":
                    showConfirmModal(
                        "Confirm Archive",
                        `Are you sure you want to archive shipment <strong>#${data.id
                            .substring(0, 8)
                            .toUpperCase()}</strong>? It will be hidden from this list.`,
                        () => handleArchiveShipment(data.id)
                    );
                    break;
            }
        };

        $(activeShipmentsTableEl).on("click", "button", function(e) {
            handleTableButtonClick(activeShipmentsTable, e);
        });

        $(historyTableEl).on("click", "button", function(e) {
            handleTableButtonClick(historyTable, e);
        });

        closeDetailsBtn.addEventListener("click", () =>
            closeImpModal(detailsModal)
        );
        closeDetailsFooterBtn.addEventListener("click", () =>
            closeImpModal(detailsModal)
        );

        closeDocModalBtn.addEventListener("click", () =>
            closeImpModal(docManagementModal)
        );
        closeDocModalFooterBtn.addEventListener("click", () =>
            closeImpModal(docManagementModal)
        );
        uploadDocBtn.addEventListener("click", handleUploadDocument);

        docListContainer.addEventListener("click", async (event) => {
            const button = event.target.closest(".imp-doc-action-btn");
            if (!button) return;
            const action = button.dataset.action;
            const path = button.dataset.path;
            if (action === "download") {
                const {
                    data,
                    error
                } = await supabase.storage
                    .from(BUCKET_NAME)
                    .download(path);
                if (error) {
                    showIMPNotification(`Download error: ${error.message}`, "error");
                    return;
                }
                const link = document.createElement("a");
                link.href = URL.createObjectURL(data);
                const fileName = path.split("/").pop().substring(14);
                link.download = fileName;
                link.click();
                URL.revokeObjectURL(link.href);
            } else if (action === "delete") {
                const docId = button.dataset.id;
                handleDeleteDocument(docId, path);
            }
        });

        // New Modal Event Listeners
        closeReviewBtn.addEventListener("click", () => closeImpModal(reviewModal));
        closeQuoteBtn.addEventListener("click", () => closeImpModal(quoteModal));
        closeAssetsBtn.addEventListener("click", () => closeImpModal(assetsModal));
        closeAssetsFooterBtn.addEventListener("click", () =>
            closeImpModal(assetsModal)
        );

        downloadQuoteBtn.addEventListener("click", downloadImportReportAsPdf);

        approveQuoteBtn.addEventListener("click", async () => {
            if (!currentShipmentDataForModals) return;
            approveQuoteBtn.disabled = true;
            approveQuoteBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
            const success = await updateShipmentStatus(
                currentShipmentDataForModals.id,
                "Approved"
            );
            if (success) {
                showIMPNotification(
                    "Quote approved. Your agent will process the payment shortly.",
                    "success"
                );
                closeImpModal(quoteModal);
            }
            approveQuoteBtn.disabled = false;
            approveQuoteBtn.innerHTML = "Approve Quote";
        });

        clarificationQuoteBtn.addEventListener("click", async () => {
            if (!currentShipmentDataForModals) return;
            const success = await updateShipmentStatus(
                currentShipmentDataForModals.id,
                "Clarification"
            );
            if (success) {
                showIMPNotification(
                    "A request for clarification has been sent to your agent.",
                    "info"
                );
                closeImpModal(quoteModal);
            }
        });

        assetsListContainer.addEventListener("click", async (event) => {
            const button = event.target.closest(".imp-doc-action-btn");
            if (!button || button.dataset.action !== "download") return;
            const path = button.dataset.path;
            const {
                data,
                error
            } = await supabase.storage
                .from(BUCKET_NAME)
                .download(path);
            if (error) {
                showIMPNotification(`Download error: ${error.message}`, "error");
                return;
            }
            const link = document.createElement("a");
            link.href = URL.createObjectURL(data);
            const fileName = path.split("/").pop().substring(14);
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(link.href);
        });

        confirmOkBtn.addEventListener("click", () => {
            if (typeof confirmCallback === "function") {
                confirmCallback();
            }
            closeImpModal(confirmModal);
        });
        confirmCancelBtn.addEventListener("click", () =>
            closeImpModal(confirmModal)
        );
        confirmCloseBtn.addEventListener("click", () =>
            closeImpModal(confirmModal)
        );

        // Resources Modal Listeners
        resourcesBtn.addEventListener("click", openResourcesModal);
        closeResourcesBtn.addEventListener("click", () => closeImpModal(resourcesModal));
        resourcesCloseFooterBtn.addEventListener("click", () => closeImpModal(resourcesModal));

        resourceSearchInput.addEventListener('input', (e) => {
            renderClientResources(e.target.value);
        });

        resourcesListContainer.addEventListener('click', (e) => {
            const downloadBtn = e.target.closest('.imp-resource-btn-download');
            if (downloadBtn) {
                const filePath = downloadBtn.dataset.path;
                const fileName = downloadBtn.dataset.name;
                handleResourceDownload(filePath, fileName);
            }
        });
    }

    function initializeModule() {
        document.addEventListener("supabaseAuthStateChange", handleAuthChange);
        const cleanup = () => {
            console.log("Cleaning up Import Portal (IMP) module...");
            // Correctly destroy and empty tables
            if (activeShipmentsTable) {
                $(activeShipmentsTableEl).DataTable().destroy();
                $(activeShipmentsTableEl).empty();
                activeShipmentsTable = null;
            }
            if (historyTable) {
                $(historyTableEl).DataTable().destroy();
                $(historyTableEl).empty();
                historyTable = null;
            }
            if (ledgerTable) {
                $(ledgerTableEl).DataTable().destroy();
                $(ledgerTableEl).empty();
                ledgerTable = null;
            }
            if (shipmentSubscription) {
                supabase.removeChannel(shipmentSubscription);
                shipmentSubscription = null;
            }
            document.removeEventListener("supabaseAuthStateChange", handleAuthChange);
            document.removeEventListener("moduleWillUnload", cleanup);
            document.body.dataset.impModuleInitialized = "false";
        };
        document.addEventListener("moduleWillUnload", cleanup);
        if (supabase.auth.getSession) {
            supabase.auth.getSession().then(({
                data: {
                    session
                }
            }) => {
                if (session) handleAuthChange({
                    detail: {
                        user: session.user
                    }
                });
            });
        }
        setupEventListeners();
    }

    initializeModule();
})();
