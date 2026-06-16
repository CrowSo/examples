// js/classification-quoting.js
(() => {
    // SECTION 1: INITIALIZATION AND CONFIGURATION
    if (document.body.dataset.cqModuleInitialized === "true") {
        return;
    }
    document.body.dataset.cqModuleInitialized = "true";
    console.log(
        "Classification & Quoting Module Initialized (V24 - Full Height Layout)"
    );

    if (typeof supabase === "undefined" || !supabase) {
        console.error(
            "Supabase client is not available in classification-quoting.js."
        );
        return;
    }

    // --- Config & State ---
    const REQUESTS_TABLE = "classification_requests";
    const BUCKET_NAME = "classification-docs";
    let currentUserCQ = null;
    let pendingDataTable, historyDataTable;
    let allRequests = [];
    let currentRequestData = null;
    let realtimeCQChannel = null;

    // --- DOM Element Caching ---
    const pendingTableEl = document.getElementById("cqPendingTable");
    const workspaceModal = document.getElementById("cqWorkspaceModal");
    const closeWorkspaceBtn = document.getElementById("cqCloseWorkspaceBtn");
    const workspaceForm = document.getElementById("cqWorkspaceForm");
    const clientDataContainer = document.getElementById(
        "cq-client-data-container"
    );
    const statusSelect = document.getElementById("cq-status-select");
    const textEditorModal = document.getElementById("cqTextEditorModal");
    const closeTextEditorBtn = document.getElementById("cqCloseTextEditorBtn");
    const saveTextEditorBtn = document.getElementById("cqSaveTextEditorBtn");
    const textEditorTitle = document.getElementById("cqTextEditorTitle");
    const textEditorTextarea = document.getElementById("cqTextEditorTextarea");
    const textEditorTargetIdInput = document.getElementById(
        "cqTextEditorTargetId"
    );
    const requestIdHiddenInput = document.getElementById("cq-request-id-hidden");
    const htsCodeValidatedInput = document.getElementById(
        "cq-hts-code-validated"
    );
    const brokerageFeeInput = document.getElementById("cq-brokerage-fee");
    const dutyRateInput = document.getElementById("cq-duty-rate");
    const requestInfoBtn = document.getElementById("cq-request-info-btn");
    const continueQuoteBtn = document.getElementById("cq-continue-quote-btn");
    const saveProgressBtn = document.getElementById("cq-save-progress-btn");
    const finishBtn = document.getElementById("cq-finish-btn");

    // History Modal Elements
    const historyBtn = document.getElementById("cq-history-btn");
    const historyModal = document.getElementById("cqHistoryModal");
    const closeHistoryModalBtn = document.getElementById(
        "cqCloseHistoryModalBtn"
    );
    const closeHistoryFooterBtn = document.getElementById(
        "cqCloseHistoryFooterBtn"
    );
    const historyTableEl = document.getElementById("cqHistoryTable");
    const histMonthSelect = document.getElementById("cq-hist-month");
    const histYearSelect = document.getElementById("cq-hist-year");
    const histSearchInput = document.getElementById("cq-hist-search");
    const applyFiltersBtn = document.getElementById("cq-apply-filters-btn");

    // Report Modal Elements
    const reportModal = document.getElementById("cqViewReportModal");
    const reportTitle = document.getElementById("cqReportTitle");
    const reportBody = document.getElementById("cq-report-body");
    const closeReportModalBtn = document.getElementById("cqCloseReportModalBtn");
    const closeReportFooterBtn = document.getElementById(
        "cqCloseReportFooterBtn"
    );
    const downloadReportPdfBtn = document.getElementById(
        "cqDownloadReportPdfBtn"
    );

    // Stepper & Dynamic Duty Elements
    const workspaceStepper = document.getElementById("cqWorkspaceStepper");
    const step1Btn = document.getElementById("cq-step-1");
    const step2Btn = document.getElementById("cq-step-2");
    const addDutyBtn = document.getElementById("cq-add-duty-btn");
    const additionalDutiesContainer = document.getElementById(
        "cq-additional-duties-container"
    );
    const classificationView = document.getElementById("cq-classification-view");
    const quotationView = document.getElementById("cq-quotation-view");

    // --- Custom Notification Function ---
    function showCQNotification(message, type = "info", duration = 4000) {
        const container = document.getElementById("customNotificationContainerCQ");
        if (!container) return;
        const notification = document.createElement("div");
        notification.className = `custom-notification-st ${type}`;
        let iconClass = "bx bx-info-circle";
        if (type === "success") iconClass = "bx bx-check-circle";
        else if (type === "error") iconClass = "bx bx-x-circle";
        else if (type === "warning") iconClass = "bx bx-error-circle";
        notification.innerHTML = `<i class='${iconClass}'></i><span>${message}</span>`;
        container.appendChild(notification);
        setTimeout(() => notification.classList.add("show"), 10);
        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => notification.remove(), 500);
        }, duration);
    }

    // SECTION 2: CORE LOGIC & DATA HANDLING
    async function fetchRequests() {
        if (!currentUserCQ) return;
        const { data, error } = await supabase
            .from(REQUESTS_TABLE)
            .select("*, updated_at, created_at") // Ensure updated_at is fetched
            .order("created_at", {
                ascending: false,
            });
        if (error) {
            showCQNotification("Error fetching requests: " + error.message, "error");
            return;
        }
        allRequests = data;
        renderDashboard();
    }

    function renderDashboard() {
        const activeRequests = allRequests.filter(
            (r) => r.status !== "Cancelled" && !r.is_archived
        );
        initializeDataTable("#cqPendingTable", activeRequests);
        updateDashboardMetrics();
    }

    function updateDashboardMetrics() {
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        const timeDiffInDays = (date1, date2) => {
            const diff = date1.getTime() - date2.getTime();
            return diff / (1000 * 3600 * 24);
        };

        // Card 1: Pending & Awaiting Info
        const pendingAndAwaiting = allRequests.filter(
            (r) =>
                (r.status === "Pending" ||
                    r.status === "Awaiting Documents" ||
                    r.status === "Documents Submitted") &&
                !r.is_archived
        );
        const newRequests = pendingAndAwaiting.filter(
            (r) => r.status === "Pending"
        );
        const awaitingClient = pendingAndAwaiting.filter(
            (r) => r.status === "Awaiting Documents"
        );

        document.getElementById("cq-db-pending").textContent =
            pendingAndAwaiting.length;
        document.getElementById("cq-db-pending-new").textContent =
            newRequests.length;
        document.getElementById("cq-db-pending-awaiting").textContent =
            awaitingClient.length;

        if (pendingAndAwaiting.length > 0) {
            const oldestRequest = pendingAndAwaiting.reduce((oldest, current) =>
                new Date(current.created_at) < new Date(oldest.created_at)
                    ? current
                    : oldest
            );
            const daysOld = Math.floor(
                timeDiffInDays(now, new Date(oldestRequest.created_at))
            );
            document.getElementById(
                "cq-db-pending-oldest"
            ).innerHTML = `<i class='bx bx-time-five'></i> Oldest: ${daysOld} day${daysOld !== 1 ? "s" : ""
                } ago`;
        } else {
            document.getElementById(
                "cq-db-pending-oldest"
            ).innerHTML = `<i class='bx bx-time-five'></i> Oldest: -`;
        }

        // Card 2: In Process
        const inProcessRequests = allRequests.filter(
            (r) => r.status === "In Process" && !r.is_archived
        );
        document.getElementById("cq-db-in-process").textContent =
            inProcessRequests.length;

        if (inProcessRequests.length > 0) {
            const totalDaysInProcess = inProcessRequests.reduce(
                (sum, r) => sum + timeDiffInDays(now, new Date(r.created_at)),
                0
            );
            const avgDays = (totalDaysInProcess / inProcessRequests.length).toFixed(
                1
            );
            document.getElementById(
                "cq-db-in-process-avg-time"
            ).innerHTML = `<i class='bx bx-timer'></i> ~ ${avgDays} days`;
        } else {
            document.getElementById(
                "cq-db-in-process-avg-time"
            ).innerHTML = `<i class='bx bx-timer'></i> ~ 0 days`;
        }

        // Card 3: Completed (Month)
        const completedThisMonth = allRequests.filter(
            (r) =>
                r.status === "Completed" &&
                r.is_archived &&
                new Date(r.updated_at) >= startOfCurrentMonth
        );
        const completedLastMonth = allRequests.filter(
            (r) =>
                r.status === "Completed" &&
                r.is_archived &&
                new Date(r.updated_at) >= startOfLastMonth &&
                new Date(r.updated_at) <= endOfLastMonth
        );

        document.getElementById("cq-db-completed").textContent =
            completedThisMonth.length;

        const comparisonEl = document.getElementById("cq-db-completed-comparison");
        if (completedLastMonth.length > 0) {
            const percentChange =
                ((completedThisMonth.length - completedLastMonth.length) /
                    completedLastMonth.length) *
                100;
            comparisonEl.classList.remove("positive", "negative", "neutral");
            if (percentChange > 0) {
                comparisonEl.classList.add("positive");
                comparisonEl.innerHTML = `<i class='bx bx-trending-up'></i> +${percentChange.toFixed(
                    0
                )}% vs last month`;
            } else if (percentChange < 0) {
                comparisonEl.classList.add("negative");
                comparisonEl.innerHTML = `<i class='bx bx-trending-down'></i> ${percentChange.toFixed(
                    0
                )}% vs last month`;
            } else {
                comparisonEl.classList.add("neutral");
                comparisonEl.innerHTML = `<i class='bx bx-minus'></i> 0% vs last month`;
            }
        } else {
            comparisonEl.classList.remove("positive", "negative");
            comparisonEl.classList.add("neutral");
            comparisonEl.innerHTML = `<i class='bx bx-minus'></i> No data last month`;
        }

        if (completedThisMonth.length > 0) {
            const totalResolutionTime = completedThisMonth.reduce(
                (sum, r) =>
                    sum + timeDiffInDays(new Date(r.updated_at), new Date(r.created_at)),
                0
            );
            const avgResolutionDays = (
                totalResolutionTime / completedThisMonth.length
            ).toFixed(1);
            document.getElementById(
                "cq-db-completed-avg-time"
            ).innerHTML = `<i class='bx bx-tachometer'></i> Avg. Resolution: ~ ${avgResolutionDays} days`;
        } else {
            document.getElementById(
                "cq-db-completed-avg-time"
            ).innerHTML = `<i class='bx bx-tachometer'></i> Avg. Resolution: ~ 0 days`;
        }
    }

    function setupRealtimeSubscriptionCQ() {
        if (realtimeCQChannel) return;

        console.log("CQ: Setting up realtime subscription for all requests.");

        realtimeCQChannel = supabase
            .channel("public:classification_requests")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: REQUESTS_TABLE,
                },
                (payload) => {
                    console.log("CQ: Realtime event received:", payload);

                    const eventType = payload.eventType;
                    const newRecord = payload.new;
                    const oldRecord = payload.old;

                    if (eventType === "INSERT") {
                        allRequests.unshift(newRecord); // Add to the top of the list
                        renderDashboard();
                        showCQNotification(
                            `New request #${newRecord.id.substr(-6).toUpperCase()} received.`,
                            "success"
                        );
                    } else if (eventType === "UPDATE") {
                        const requestIndex = allRequests.findIndex(
                            (req) => req.id === newRecord.id
                        );
                        if (requestIndex !== -1) {
                            allRequests[requestIndex] = newRecord;
                            renderDashboard();
                            // Only show notification for status changes
                            if (oldRecord.status !== newRecord.status) {
                                showCQNotification(
                                    `Request #${newRecord.id
                                        .substr(-6)
                                        .toUpperCase()} status changed to ${newRecord.status}.`,
                                    "info"
                                );
                            }
                        }
                    } else if (eventType === "DELETE") {
                        allRequests = allRequests.filter((req) => req.id !== oldRecord.id);
                        renderDashboard();
                        showCQNotification(
                            `Request #${oldRecord.id.substr(-6).toUpperCase()} was deleted.`,
                            "warning"
                        );
                    }
                }
            )
            .subscribe();
    }

    // SECTION 3: DATATABLE INITIALIZATION (MODIFIED FOR FULL HEIGHT)
    function initializeDataTable(tableSelector, data) {
        let isHistoryTable = tableSelector === "#cqHistoryTable";
        let dataTableInstance = isHistoryTable
            ? historyDataTable
            : pendingDataTable;
            
        // Clean up existing instance if any
        if ($.fn.DataTable.isDataTable(tableSelector)) {
            $(tableSelector).DataTable().clear().rows.add(data).draw();
            return;
        }

        const columnsConfig = isHistoryTable
            ? [
                {
                    data: "id",
                    title: "Request ID",
                    render: (d) => (d ? d.substr(-6).toUpperCase() : ""),
                    className: "dt-center",
                },
                {
                    data: "user_email",
                    title: "Client",
                    defaultContent: "N/A",
                    render: (d) => (d ? d.split("@")[0] : "N/A"),
                    className: "dt-center",
                },
                {
                    data: "product_info.description",
                    title: "Product",
                    defaultContent: "",
                    className: "dt-center",
                },
                {
                    data: "created_at",
                    title: "Date",
                    render: (d) => new Date(d).toLocaleDateString(),
                    className: "dt-center",
                },
                {
                    data: "status",
                    title: "Status",
                    render: (d) =>
                        `<span class="cqp-status-badge status-${(d || "pending")
                            .toLowerCase()
                            .replace(/\s/g, "-")}">${d}</span>`,
                    className: "dt-center",
                },
                {
                    data: null,
                    title: "Actions",
                    orderable: false,
                    searchable: false,
                    className: "dt-center",
                    render: (data, type, row) =>
                        `<div class="cq-table-actions"><button data-action="view" class="btn-cq-action-view"><i class='bx bx-show'></i> View</button></div>`,
                },
                {
                    data: null,
                    title: "Quote/Results",
                    orderable: false,
                    searchable: false,
                    className: "dt-center",
                    render: (data, type, row) =>
                        `<div class="cq-table-actions"><button data-action="view-quote" class="btn-cq-view-quote"><i class='bx bx-receipt'></i> View</button><button data-action="download-pdf" class="btn-cq-download-pdf"><i class='bx bxs-file-pdf'></i> PDF</button></div>`,
                },
            ]
            : [
                {
                    data: "id",
                    title: "Request ID",
                    render: (d) => (d ? d.substr(-6).toUpperCase() : ""),
                    className: "dt-center",
                },
                {
                    data: "user_email",
                    title: "Client",
                    defaultContent: "N/A",
                    render: (d) => (d ? d.split("@")[0] : "N/A"),
                    className: "dt-center",
                },
                {
                    data: "product_info.description",
                    title: "Product",
                    defaultContent: "",
                    className: "dt-center",
                },
                {
                    data: "created_at",
                    title: "Date",
                    render: (d) => new Date(d).toLocaleDateString(),
                    className: "dt-center",
                },
                {
                    data: "status",
                    title: "Status",
                    render: (d) =>
                        `<span class="cqp-status-badge status-${(d || "pending")
                            .toLowerCase()
                            .replace(/\s/g, "-")}">${d}</span>`,
                    className: "dt-center",
                },
                {
                    data: null,
                    title: "Actions",
                    orderable: false,
                    searchable: false,
                    className: "dt-center",
                    render: (data, type, row) =>
                        `<div class="cq-table-actions"><button data-action="process" class="btn-cq-process" ${row.status === "Completed" ? "disabled" : ""
                        }><i class='bx bx-play-circle'></i> Process</button></div>`,
                },
                {
                    data: null,
                    title: "Quote/Results",
                    orderable: false,
                    searchable: false,
                    className: "dt-center",
                    render: (data, type, row) =>
                        `<div class="cq-table-actions"><button data-action="view-quote" class="btn-cq-view-quote" ${row.status !== "Completed" ? "disabled" : ""
                        }><i class='bx bx-receipt'></i> View</button><button data-action="download-pdf" class="btn-cq-download-pdf" ${row.status !== "Completed" ? "disabled" : ""
                        }><i class='bx bxs-file-pdf'></i> PDF</button></div>`,
                },
                {
                    data: null,
                    title: "Complete",
                    orderable: false,
                    searchable: false,
                    className: "dt-center",
                    render: (data, type, row) =>
                        row.status === "Completed"
                            ? `<div class="cq-table-actions"><button data-action="complete" class="btn-cq-complete" title="Complete and Archive Request"><i class='bx bx-check-double'></i></button></div>`
                            : "",
                },
            ];

        // --- NEW CONFIGURATION (Super Admin Style) ---
        dataTableInstance = $(tableSelector).DataTable({
            data: data,
            columns: columnsConfig,
            order: [[3, "desc"]],
            // Custom DOM layout for Flexbox integration
            dom: '<"wst-dt-header"lf>rt<"wst-dt-footer"ip>',
            responsive: true,
            scrollY: '50vh', // This triggers DataTables scroll mode (CSS will override height)
            scrollCollapse: true,
            paging: true,
            pageLength: 15,
            lengthMenu: [10, 15, 25, 50, 100],
            language: {
                search: "",
                searchPlaceholder: "Search...",
                lengthMenu: "_MENU_ rows"
            }
        });

        if (isHistoryTable) {
            historyDataTable = dataTableInstance;
        } else {
            pendingDataTable = dataTableInstance;
        }
    }

    // SECTION 4: WORKSPACE & MODAL LOGIC
    function openModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = "flex";
            setTimeout(() => modalElement.classList.add("cq-modal-open"), 10);
            
            // Adjust tables if inside modal after animation
            if(modalElement.id === 'cqHistoryModal' && historyDataTable) {
                 setTimeout(() => historyDataTable.columns.adjust(), 200);
            }
        }
    }

    function closeModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove("cq-modal-open");
            setTimeout(() => {
                modalElement.style.display = "none";
                if (modalElement === workspaceModal) {
                    workspaceModal.style.zIndex = ""; // Reset z-index on close
                }
            }, 300);
        }
    }

    function openTextEditorModal(triggerElement) {
        const targetId = triggerElement.dataset.target,
            title = triggerElement.dataset.title,
            targetTextarea = document.getElementById(targetId);
        if (targetTextarea) {
            textEditorTargetIdInput.value = targetId;
            textEditorTitle.textContent = title;
            textEditorTextarea.value = targetTextarea.value;
            openModal(textEditorModal);
        }
    }

    function closeTextEditorModal() {
        closeModal(textEditorModal);
    }

    function saveTextEditorChanges() {
        const targetId = textEditorTargetIdInput.value,
            targetTextarea = document.getElementById(targetId);
        if (targetTextarea) {
            targetTextarea.value = textEditorTextarea.value;
            updateTextPreview(targetId);
        }
        closeTextEditorModal();
    }

    function updateTextPreview(textareaId) {
        const textarea = document.getElementById(textareaId);
        const trigger = document.querySelector(
            `.text-editor-trigger[data-target="${textareaId}"]`
        );
        if (textarea && trigger) {
            const preview = trigger.querySelector(".text-preview");
            const text = textarea.value;
            if (text) {
                // Replace newlines with a space to keep the preview on a single line
                preview.textContent = text.replace(/\n/g, " ");
                preview.classList.remove("placeholder");
            } else {
                // Use the original placeholder text from the HTML
                const originalPlaceholder =
                    trigger
                        .querySelector(".text-preview")
                        .getAttribute("data-placeholder") || "Click to edit...";
                preview.textContent = originalPlaceholder;
                preview.classList.add("placeholder");
            }
        }
    }

    function navigateToStep(stepNumber) {
        const isClassificationDone = !!htsCodeValidatedInput.value.trim();

        if (stepNumber === 2 && !isClassificationDone) {
            showCQNotification(
                "Please provide a validated HTS Code to continue to Quotation.",
                "warning"
            );
            return;
        }

        classificationView.classList.toggle("active", stepNumber === 1);
        quotationView.classList.toggle("active", stepNumber === 2);
        step1Btn.classList.toggle("active", stepNumber === 1);
        step2Btn.classList.toggle("active", stepNumber === 2);

        requestInfoBtn.style.display = stepNumber === 1 ? "inline-flex" : "none";
        continueQuoteBtn.style.display = stepNumber === 1 ? "inline-flex" : "none";
        saveProgressBtn.style.display = stepNumber === 2 ? "inline-flex" : "none";
        finishBtn.style.display = stepNumber === 2 ? "inline-flex" : "none";
    }

    async function openWorkspaceModal(requestId, fromHistory = false) {
        // --- START: MODIFIED SECTION ---
        // Reset and apply read-only state based on the fromHistory flag
        workspaceModal.classList.remove("read-only-mode");
        if (fromHistory) {
            workspaceModal.classList.add("read-only-mode");
        }
        // --- END: MODIFIED SECTION ---

        const { data, error } = await supabase
            .from(REQUESTS_TABLE)
            .select("*")
            .eq("id", requestId)
            .single();
        if (error) {
            showCQNotification(
                "Could not fetch request details: " + error.message,
                "error"
            );
            return;
        }

        if (fromHistory) {
            workspaceModal.style.zIndex = "1301";
        }

        workspaceForm.reset();
        additionalDutiesContainer.innerHTML = "";
        currentRequestData = data;

        document.getElementById(
            "cqWorkspaceTitle"
        ).textContent = `Processing Request #${data.id.substr(-6).toUpperCase()}`;
        requestIdHiddenInput.value = data.id;
        statusSelect.value = data.status || "Pending";

        populateFullForm(data);

        const isClassificationDone = !!(
            data.quote_results && data.quote_results.htsCodeValidated
        );
        workspaceStepper.classList.add("editable");
        navigateToStep(isClassificationDone ? 2 : 1);

        populateClientDataColumn(data);
        updateQuoteSummary();
        openModal(workspaceModal);
    }

    function populateClientDataColumn(data) {
        const {
            product_info,
            commercial_data,
            origin_info,
            pga_flags,
            attachments,
        } = data;
        const attachmentsHtml =
            attachments && attachments.length > 0
                ? attachments
                    .map(
                        (doc) =>
                            `<li><span>${doc.file_name}</span><button type="button" class="download-btn" data-path="${doc.file_path}" title="Download File"><i class='bx bxs-download'></i></button></li>`
                    )
                    .join("")
                : "<li>No documents attached.</li>";
        clientDataContainer.innerHTML = `<div class="cq-client-data-grid"><div class="le-detail-group"><span class="le-detail-label">Product Description</span><span class="le-detail-value">${product_info.description || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Customs Value</span><span class="le-detail-value">${commercial_data.value || "N/A"
            } ${commercial_data.currency || ""
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Materials / Composition</span><span class="le-detail-value">${product_info.materials || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Quantity</span><span class="le-detail-value">${commercial_data.quantity || "N/A"
            } ${commercial_data.uom || ""
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Main Use</span><span class="le-detail-value">${product_info.usage || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Incoterm</span><span class="le-detail-value">${commercial_data.incoterm || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Country of Origin</span><span class="le-detail-value">${origin_info.country || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Client PGA Flags</span><span class="le-detail-value">${pga_flags && pga_flags.length > 0 ? pga_flags.join(", ") : "None"
            }</span></div></div><div class="le-detail-section" style="margin-top: 1rem;"><span class="le-detail-label">Client's Attached Documents</span><ul class="cq-client-attachments-list">${attachmentsHtml}</ul></div>`;
    }

    function populateFullForm(data) {
        const quoteResults = data.quote_results || {};
        const brokerReview = data.broker_review || {};
        const checkMatchingCheckboxes = (name, values) => {
            document.querySelectorAll(`input[name="${name}"]`).forEach((cb) => {
                cb.checked = (values || []).includes(cb.value);
            });
        };
        document.getElementById("cq-missing-info-details").value =
            brokerReview.missing_details || "";
        checkMatchingCheckboxes("missing_item", brokerReview.missing_items);
        htsCodeValidatedInput.value = quoteResults.htsCodeValidated || "";
        checkMatchingCheckboxes("pga_applies", quoteResults.involved_pga);
        document.getElementById("cq-pga-explanation").value =
            quoteResults.pga_explanation || "";
        checkMatchingCheckboxes(
            "required_doc_item",
            quoteResults.required_docs_selected
        );
        document.getElementById("cq-required-docs-details").value =
            quoteResults.required_docs_details || "";
        checkMatchingCheckboxes(
            "labeling_item",
            quoteResults.labeling_requirements_selected
        );
        document.getElementById("cq-labeling-requirements-details").value =
            quoteResults.labeling_requirements_details || "";
        checkMatchingCheckboxes(
            "restriction_item",
            quoteResults.restrictions_selected
        );
        document.getElementById("cq-restrictions-details").value =
            quoteResults.restrictions_details || "";
        document.getElementById("cq-broker-notes").value =
            quoteResults.brokerComments || "";
        dutyRateInput.value =
            quoteResults.dutyRate !== undefined ? quoteResults.dutyRate : "";
        document.getElementById("cq-other-taxes").value =
            quoteResults.otherTaxes !== undefined ? quoteResults.otherTaxes : "";
        document.getElementById("cq-mpf").value =
            quoteResults.merchandiseProcessingFee || "";
        document.getElementById("cq-hmf").value =
            quoteResults.harborMaintenanceFee || "";
        brokerageFeeInput.value = quoteResults.brokerageFee || "";

        additionalDutiesContainer.innerHTML = "";
        if (
            quoteResults.additionalDuties &&
            Array.isArray(quoteResults.additionalDuties)
        ) {
            quoteResults.additionalDuties.forEach((duty) =>
                createAdditionalDutyField(duty.name, duty.rate)
            );
        }

        document
            .querySelectorAll(".hidden-textarea")
            .forEach((ta) => updateTextPreview(ta.id));
    }

    // SECTION 5: HISTORY, REPORTING & DYNAMIC FIELDS
    function openHistoryModal() {
        populateHistoryFilters();
        applyHistoryFilters();
        openModal(historyModal);
    }

    function closeHistoryModal() {
        closeModal(historyModal);
    }

    function populateHistoryFilters() {
        histMonthSelect.innerHTML = '<option value="all">All Months</option>';
        for (let i = 0; i < 12; i++) {
            const monthName = new Date(0, i).toLocaleString("default", {
                month: "long",
            });
            histMonthSelect.innerHTML += `<option value="${i}">${monthName}</option>`;
        }
        const years = [
            ...new Set(allRequests.map((r) => new Date(r.created_at).getFullYear())),
        ].sort((a, b) => b - a);
        histYearSelect.innerHTML = '<option value="all">All Years</option>';
        years.forEach(
            (year) =>
                (histYearSelect.innerHTML += `<option value="${year}">${year}</option>`)
        );
    }

    function applyHistoryFilters() {
        const completedRequests = allRequests.filter(
            (r) =>
                (r.status === "Completed" && r.is_archived) || r.status === "Cancelled"
        );
        const month = histMonthSelect.value;
        const year = histYearSelect.value;
        const searchTerm = histSearchInput.value.toLowerCase();
        const filteredData = completedRequests.filter((req) => {
            const date = new Date(req.created_at);
            const yearMatch = year === "all" || date.getFullYear() == year;
            const monthMatch = month === "all" || date.getMonth() == month;
            const searchMatch =
                searchTerm === "" ||
                (req.product_info.description || "")
                    .toLowerCase()
                    .includes(searchTerm) ||
                (req.user_email || "").toLowerCase().includes(searchTerm);
            return yearMatch && monthMatch && searchMatch;
        });
        initializeDataTable("#cqHistoryTable", filteredData);
    }

    function createAdditionalDutyField(name = "", rate = "") {
        const dutyId = `duty_${Date.now()}`;
        const newField = document.createElement("div");
        newField.className = "cq-form-group cq-dynamic-duty-group";
        newField.innerHTML = `
            <div class="cq-dynamic-duty-inputs">
                <input type="text" data-duty-name="${dutyId}" placeholder="e.g., Antidumping" value="${name}">
                <input type="number" data-duty-rate="${dutyId}" step="0.01" placeholder="Rate (%)" value="${rate}">
                <button type="button" class="btn-cq-remove-duty"><i class='bx bx-trash'></i></button>
            </div>
        `;
        additionalDutiesContainer.appendChild(newField);
    }

    function generateReportHtml(data) {
        const p_info = data.product_info || {};
        const c_data = data.commercial_data || {};
        const o_info = data.origin_info || {};
        const q_results = data.quote_results || {};

        const renderItems = (items) =>
            items && items.length > 0
                ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`
                : "None";
        const renderText = (text) =>
            text
                ? `<div class="cq-report-notes">${text}</div>`
                : `<div class="cq-report-notes">No additional notes.</div>`;

        let totalDuties = 0;
        const customsValue = parseFloat(c_data.value * c_data.quantity) || 0;
        const baseDuty =
            (customsValue * (parseFloat(q_results.dutyRate) || 0)) / 100;
        totalDuties += baseDuty;

        let additionalDutiesHtml = "";
        if (q_results.additionalDuties && q_results.additionalDuties.length > 0) {
            q_results.additionalDuties.forEach((duty) => {
                const dutyAmount = (customsValue * (parseFloat(duty.rate) || 0)) / 100;
                totalDuties += dutyAmount;
                additionalDutiesHtml += `<tr><td>${duty.name} (${duty.rate
                    }%)</td><td class="text-right">$${dutyAmount.toFixed(2)}</td></tr>`;
            });
        }

        const otherTaxesValue =
            (customsValue * (parseFloat(q_results.otherTaxes) || 0)) / 100;
        const mpf = parseFloat(q_results.merchandiseProcessingFee) || 0;
        const hmf = parseFloat(q_results.harborMaintenanceFee) || 0;
        const brokerageFee = parseFloat(q_results.brokerageFee) || 0;
        const totalFees = mpf + hmf + brokerageFee;
        const grandTotal = totalDuties + otherTaxesValue + totalFees;

        return `
            <div class="cq-report-printable-area">
                <div class="cq-report-header">
                    <h3>Classification & Quoting Report</h3>
                    <p>Request ID: ${data.id
                .substr(-6)
                .toUpperCase()} | Client: ${data.user_email ? data.user_email.split("@")[0] : "N/A"
            } | Date: ${new Date(data.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
            })}</p>
                </div>
                <div class="cq-report-grid">
                    <div class="cq-report-section">
                        <h4><i class='bx bx-user'></i> Client Provided Information</h4>
                        <div class="cq-report-item"><span class="cq-report-label">Product:</span><span class="cq-report-value">${p_info.description || "N/A"
            }</span></div>
                        <div class="cq-report-item"><span class="cq-report-label">Materials:</span><span class="cq-report-value">${p_info.materials || "N/A"
            }</span></div>
                        <div class="cq-report-item"><span class="cq-report-label">Intended Use:</span><span class="cq-report-value">${p_info.usage || "N/A"
            }</span></div>
                        <div class="cq-report-item"><span class="cq-report-label">Customs Value:</span><span class="cq-report-value">${c_data.value || "0"
            } ${c_data.currency || ""} (x${c_data.quantity || "0"
            })</span></div>
                        <div class="cq-report-item"><span class="cq-report-label">Country of Origin:</span><span class="cq-report-value">${o_info.country || "N/A"
            }</span></div>
                    </div>
                    <div class="cq-report-section">
                        <h4><i class='bx bx-sitemap'></i> HTSUS Classification</h4>
                        <div class="cq-report-item"><span class="cq-report-label">Validated HTS Code:</span><span class="cq-report-value highlight">${q_results.htsCodeValidated || "N/A"
            }</span></div>
                        <div class="cq-report-item"><span class="cq-report-label">Involved PGAs:</span><span class="cq-report-value">${(q_results.involved_pga || []).join(", ") || "None"
            }</span></div>
                        <div class="cq-report-item"><span class="cq-report-label">PGA Explanation:</span></div>
                        ${renderText(q_results.pga_explanation)}
                    </div>
                    <div class="cq-report-section cq-report-full-width">
                        <h4><i class='bx bx-file-blank'></i> Documentation & Requirements</h4>
                        <div class="cq-report-grid" style="grid-template-columns: 1fr 1fr;">
                            <div>
                                <div class="cq-report-label">Required Docs:</div>${renderItems(
                q_results.required_docs_selected
            )}
                                <div class="cq-report-label" style="margin-top: 1rem;">Documentation Notes:</div>
                                ${renderText(q_results.required_docs_details)}
                            </div>
                            <div>
                                <div class="cq-report-label">Labeling & Marking:</div>${renderItems(
                q_results.labeling_requirements_selected
            )}
                                <div class="cq-report-label" style="margin-top: 1rem;">Labeling Notes:</div>
                                ${renderText(
                q_results.labeling_requirements_details
            )}
                            </div>
                        </div>
                        <div style="margin-top: 1rem;">
                            <div class="cq-report-label">Restrictions / Special Conditions:</div>${renderItems(
                q_results.restrictions_selected
            )}
                            <div class="cq-report-label" style="margin-top: 1rem;">Restrictions Details:</div>
                            ${renderText(q_results.restrictions_details)}
                        </div>
                    </div>
                    <div class="cq-report-section cq-report-full-width">
                        <h4><i class='bx bx-dollar-circle'></i> Quotation Details</h4>
                        <table class="cq-report-quote-table">
                            <thead><tr><th style="text-align: left;">Description</th><th class="text-right">Amount (USD)</th></tr></thead>
                            <tbody>
                                <tr><td>Base Duty (${q_results.dutyRate || 0
            }%)</td><td class="text-right">$${baseDuty.toFixed(
                2
            )}</td></tr>
                                ${additionalDutiesHtml}
                                <tr><td>Other Taxes (${q_results.otherTaxes || 0
            }%)</td><td class="text-right">$${otherTaxesValue.toFixed(
                2
            )}</td></tr>
                                <tr><td>Merchandise Processing Fee (MPF)</td><td class="text-right">$${mpf.toFixed(
                2
            )}</td></tr>
                                <tr><td>Harbor Maintenance Fee (HMF)</td><td class="text-right">$${hmf.toFixed(
                2
            )}</td></tr>
                                <tr><td>Brokerage Fee (Tijuana)</td><td class="text-right">$${brokerageFee.toFixed(
                2
            )}</td></tr>
                                <tr class="grand-total"><td >Grand Total Estimate</td><td class="text-right">$${grandTotal.toFixed(
                2
            )}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="cq-report-section cq-report-full-width">
                        <h4><i class='bx bx-note'></i> Broker Notes</h4>
                        ${renderText(q_results.brokerComments)}
                    </div>
                </div>
            </div>`;
    }

    function openReportModal(data) {
        if (!reportModal || !reportBody) return;
        const reportHtml = generateReportHtml(data);
        reportBody.innerHTML = reportHtml;
        reportTitle.textContent = `Report for Request #${data.id
            .substr(-6)
            .toUpperCase()}`;
        downloadReportPdfBtn.dataset.requestId = data.id;
        openModal(reportModal);
    }

    async function downloadReportAsPdf(data) {
        if (
            typeof html2canvas === "undefined" ||
            typeof window.jspdf === "undefined"
        ) {
            return showCQNotification(
                "PDF generation libraries are not available.",
                "error"
            );
        }

        const reportHtml = generateReportHtml(data);
        const tempContainer = document.createElement("div");
        tempContainer.classList.add("pdf-render-mode");
        tempContainer.style.position = "absolute";
        tempContainer.style.left = "-9999px";
        tempContainer.style.width = "8.5in";
        tempContainer.innerHTML = reportHtml;
        document.body.appendChild(tempContainer);

        const contentToPrint = tempContainer.querySelector(
            ".cq-report-printable-area"
        );
        if (!contentToPrint) {
            showCQNotification(
                "Could not find printable content for the PDF.",
                "error"
            );
            document.body.removeChild(tempContainer);
            return;
        }

        try {
            const canvas = await html2canvas(contentToPrint, {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff",
            });

            const imgData = canvas.toDataURL("image/png");
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "in",
                format: "letter",
            });

            const pageMargin = 0.5; // 0.5 inch margin
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const contentWidth = pdfWidth - pageMargin * 2;

            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasHeight / canvasWidth;
            const contentHeight = contentWidth * ratio;

            pdf.addImage(
                imgData,
                "PNG",
                pageMargin,
                pageMargin,
                contentWidth,
                contentHeight
            );

            const pageCount = pdf.internal.getNumberOfPages();
            if (pageCount > 1) {
                // Add page numbers only if there is more than one page
                for (let i = 1; i <= pageCount; i++) {
                    pdf.setPage(i);
                    pdf.setFontSize(9);
                    pdf.setTextColor(150);
                    pdf.text(
                        `Page ${i} of ${pageCount}`,
                        pdfWidth / 2,
                        pdfHeight - 0.25,
                        {
                            align: "center",
                        }
                    );
                }
            }

            const clientName = (data.user_email || "report").split("@")[0];
            const filename = `Classification_Report_${clientName}_${data.id
                .substr(-6)
                .toUpperCase()}.pdf`;
            pdf.save(filename);
        } catch (error) {
            console.error("PDF generation failed:", error);
            showCQNotification("An error occurred during PDF generation.", "error");
        } finally {
            document.body.removeChild(tempContainer);
        }
    }

    // SECTION 6: FORM SUBMISSION & DATA SAVING
    function getClassificationData() {
        const getCheckedValues = (name) =>
            Array.from(
                document.querySelectorAll(`input[name="${name}"]:checked`)
            ).map((cb) => cb.value);
        return {
            htsCodeValidated: htsCodeValidatedInput.value.trim(),
            involved_pga: getCheckedValues("pga_applies"),
            pga_explanation: document
                .getElementById("cq-pga-explanation")
                .value.trim(),
            required_docs_selected: getCheckedValues("required_doc_item"),
            required_docs_details: document
                .getElementById("cq-required-docs-details")
                .value.trim(),
            labeling_requirements_selected: getCheckedValues("labeling_item"),
            labeling_requirements_details: document
                .getElementById("cq-labeling-requirements-details")
                .value.trim(),
            restrictions_selected: getCheckedValues("restriction_item"),
            restrictions_details: document
                .getElementById("cq-restrictions-details")
                .value.trim(),
            brokerComments: document.getElementById("cq-broker-notes").value.trim(),
        };
    }

    function getQuotationData() {
        const additionalDuties = [];
        document.querySelectorAll(".cq-dynamic-duty-group").forEach((group) => {
            const nameInput = group.querySelector("input[data-duty-name]");
            const rateInput = group.querySelector("input[data-duty-rate]");
            if (nameInput && rateInput && nameInput.value) {
                additionalDuties.push({
                    name: nameInput.value.trim(),
                    rate: parseFloat(rateInput.value) || 0,
                });
            }
        });

        return {
            dutyRate: parseFloat(dutyRateInput.value) || 0,
            otherTaxes:
                parseFloat(document.getElementById("cq-other-taxes").value) || 0,
            merchandiseProcessingFee:
                parseFloat(document.getElementById("cq-mpf").value) || 0,
            harborMaintenanceFee:
                parseFloat(document.getElementById("cq-hmf").value) || 0,
            brokerageFee: parseFloat(brokerageFeeInput.value) || 0,
            additionalDuties: additionalDuties,
        };
    }

    function updateQuoteSummary() {
        if (!currentRequestData || !currentRequestData.commercial_data) return;

        const customsValue =
            parseFloat(
                currentRequestData.commercial_data.value *
                currentRequestData.commercial_data.quantity
            ) || 0;
        const dutyRate = parseFloat(dutyRateInput.value) || 0;

        let totalDuties = (customsValue * dutyRate) / 100;

        document.querySelectorAll(".cq-dynamic-duty-group").forEach((group) => {
            const rateInput = group.querySelector("input[data-duty-rate]");
            const rate = parseFloat(rateInput.value) || 0;
            totalDuties += (customsValue * rate) / 100;
        });

        const otherTaxesRate =
            parseFloat(document.getElementById("cq-other-taxes").value) || 0;
        const otherTaxesValue = (customsValue * otherTaxesRate) / 100;
        totalDuties += otherTaxesValue;

        const mpf = parseFloat(document.getElementById("cq-mpf").value) || 0;
        const hmf = parseFloat(document.getElementById("cq-hmf").value) || 0;
        const brokerageFee = parseFloat(brokerageFeeInput.value) || 0;
        const totalFees = mpf + hmf + brokerageFee;

        const grandTotal = totalDuties + totalFees;

        document.getElementById(
            "cq-summary-duties"
        ).textContent = `$${totalDuties.toFixed(2)}`;
        document.getElementById(
            "cq-summary-fees"
        ).textContent = `$${totalFees.toFixed(2)}`;
        document.getElementById(
            "cq-summary-total"
        ).textContent = `$${grandTotal.toFixed(2)}`;
    }

    async function saveRequestData(action) {
        const requestId = requestIdHiddenInput.value;
        if (!requestId) return;

        let dataToSave = {};
        let btnToUpdate;
        let notificationMessage = "An unknown error occurred.";

        switch (action) {
            case "request_info":
                btnToUpdate = requestInfoBtn;
                const missingItems = Array.from(
                    document.querySelectorAll('input[name="missing_item"]:checked')
                ).map((cb) => cb.value);
                const missingDetails = document
                    .getElementById("cq-missing-info-details")
                    .value.trim();
                if (missingItems.length === 0 && !missingDetails) {
                    return showCQNotification(
                        "Please select at least one missing item or provide details for the client.",
                        "warning"
                    );
                }
                dataToSave.broker_review = {
                    missing_items: missingItems,
                    missing_details: missingDetails,
                };
                dataToSave.status = "Awaiting Documents";
                notificationMessage = "Request for additional information sent.";
                break;
            case "save_classification":
                btnToUpdate = continueQuoteBtn;
                if (!htsCodeValidatedInput.value.trim()) {
                    return showCQNotification(
                        "A validated HTS Code is required to proceed.",
                        "warning"
                    );
                }
                dataToSave.quote_results = getClassificationData();
                dataToSave.broker_review = {};
                dataToSave.status = "In Process";
                notificationMessage = "Classification saved successfully.";
                break;
            case "finish":
                btnToUpdate = finishBtn;
                const htsCode = htsCodeValidatedInput.value.trim();
                const brokerageFeeVal = brokerageFeeInput.value;
                const dutyRateVal = dutyRateInput.value;
                if (
                    !htsCode ||
                    brokerageFeeVal.trim() === "" ||
                    dutyRateVal.trim() === ""
                ) {
                    return showCQNotification(
                        "HTSUS Code, Base Duty Rate, and Brokerage Fee are required. Please enter 0 if not applicable.",
                        "warning",
                        5000
                    );
                }
                dataToSave.quote_results = {
                    ...currentRequestData.quote_results,
                    ...getClassificationData(),
                    ...getQuotationData(),
                };
                dataToSave.status = "Completed";
                notificationMessage = "Request has been successfully completed.";
                break;
            default:
                return;
        }

        const originalBtnText = btnToUpdate.innerHTML;
        btnToUpdate.disabled = true;
        btnToUpdate.innerHTML =
            "<i class='bx bx-loader-alt bx-spin'></i> Saving...";

        try {
            const { error } = await supabase
                .from(REQUESTS_TABLE)
                .update(dataToSave)
                .eq("id", requestId);
            if (error) throw error;
            showCQNotification(notificationMessage, "success");

            if (action === "save_classification") {
                navigateToStep(2);
                const { data: updatedData } = await supabase
                    .from(REQUESTS_TABLE)
                    .select("*")
                    .eq("id", requestId)
                    .single();
                currentRequestData = updatedData;
            } else {
                closeModal(workspaceModal);
            }
            await fetchRequests();
        } catch (error) {
            showCQNotification(`Error saving data: ${error.message}`, "error", 6000);
        } finally {
            btnToUpdate.disabled = false;
            btnToUpdate.innerHTML = originalBtnText;
        }
    }

    async function handleCompleteRequest(requestId) {
        const { error } = await supabase
            .from(REQUESTS_TABLE)
            .update({
                is_archived: true,
            })
            .eq("id", requestId);

        if (error) {
            showCQNotification(`Error archiving request: ${error.message}`, "error");
        } else {
            showCQNotification("Request has been completed and archived.", "success");
            await fetchRequests(); // Refresh the table
        }
    }

    // SECTION 7: EVENT LISTENERS
    function setupEventListeners() {
        closeWorkspaceBtn.addEventListener("click", () => {
            closeModal(workspaceModal);
        });

        const handleTableActions = (event, tableInstance) => {
            const button = event.target.closest("button[data-action]");
            if (!button || button.disabled) return;
            const row = $(button).closest("tr");
            const data = tableInstance.row(row).data();
            if (!data) return;

            const action = button.dataset.action;
            const fromHistory = tableInstance === historyDataTable;

            switch (action) {
                case "process":
                case "view":
                    openWorkspaceModal(data.id, fromHistory);
                    break;
                case "view-quote":
                    openReportModal(data);
                    break;
                case "download-pdf":
                    downloadReportAsPdf(data);
                    break;
                case "complete":
                    handleCompleteRequest(data.id);
                    break;
            }
        };

        $(pendingTableEl).on("click", "button[data-action]", (e) =>
            handleTableActions(e, pendingDataTable)
        );
        $(historyTableEl).on("click", "button[data-action]", (e) =>
            handleTableActions(e, historyDataTable)
        );

        workspaceForm.addEventListener("click", (e) => {
            const trigger = e.target.closest(".text-editor-trigger");
            if (trigger) openTextEditorModal(trigger);
        });
        closeTextEditorBtn.addEventListener("click", closeTextEditorModal);
        saveTextEditorBtn.addEventListener("click", saveTextEditorChanges);
        requestInfoBtn.addEventListener("click", () =>
            saveRequestData("request_info")
        );
        continueQuoteBtn.addEventListener("click", () =>
            saveRequestData("save_classification")
        );
        finishBtn.addEventListener("click", (e) => {
            e.preventDefault();
            saveRequestData("finish");
        });
        historyBtn.addEventListener("click", openHistoryModal);
        closeHistoryModalBtn.addEventListener("click", closeHistoryModal);
        closeHistoryFooterBtn.addEventListener("click", closeHistoryModal);
        applyFiltersBtn.addEventListener("click", applyHistoryFilters);
        step1Btn.addEventListener("click", () => navigateToStep(1));
        step2Btn.addEventListener("click", () => navigateToStep(2));
        addDutyBtn.addEventListener("click", () => createAdditionalDutyField());

        quotationView.addEventListener("input", (e) => {
            if (e.target.matches('input[type="number"]')) {
                updateQuoteSummary();
            }
        });
        additionalDutiesContainer.addEventListener("click", function (e) {
            if (e.target.closest(".btn-cq-remove-duty")) {
                e.target.closest(".cq-dynamic-duty-group").remove();
                updateQuoteSummary();
            }
        });

        closeReportModalBtn.addEventListener("click", () =>
            closeModal(reportModal)
        );
        closeReportFooterBtn.addEventListener("click", () =>
            closeModal(reportModal)
        );
        downloadReportPdfBtn.addEventListener("click", (e) => {
            const requestId = e.target.dataset.requestId;
            const requestData = allRequests.find((r) => r.id === requestId);
            if (requestData) {
                downloadReportAsPdf(requestData);
            }
        });

        clientDataContainer.addEventListener("click", async (e) => {
            const downloadBtn = e.target.closest(".download-btn");
            if (downloadBtn) {
                const filePath = downloadBtn.dataset.path;
                if (!filePath) return;
                try {
                    const { data, error } = await supabase.storage
                        .from(BUCKET_NAME)
                        .download(filePath);
                    if (error) throw error;
                    const blob = data,
                        link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = filePath.split("/").pop();
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(link.href);
                } catch (error) {
                    console.error("Error downloading file:", error);
                    showCQNotification("Could not download file.", "error");
                }
            }
        });
    }

    // SECTION 8: INITIALIZATION
    function initializeModule() {
        const handleAuth = async (event) => {
            currentUserCQ = event.detail?.user;
            if (currentUserCQ) {
                await fetchRequests();
                setupRealtimeSubscriptionCQ();
            } else {
                if (pendingDataTable) pendingDataTable.clear().draw();
                if (historyDataTable) historyDataTable.clear().draw();
                if (realtimeCQChannel) {
                    supabase.removeChannel(realtimeCQChannel);
                    realtimeCQChannel = null;
                }
            }
        };
        const cleanup = () => {
            if (pendingDataTable) {
                $(pendingTableEl).off("click");
                pendingDataTable.destroy();
                pendingDataTable = null;
            }
            if (historyDataTable) {
                $(historyTableEl).off("click");
                historyDataTable.destroy();
                historyDataTable = null;
            }
            if (realtimeCQChannel) {
                supabase.removeChannel(realtimeCQChannel);
                realtimeCQChannel = null;
                console.log("CQ: Realtime channel removed.");
            }
            document.removeEventListener("supabaseAuthStateChange", handleAuth);
            document.removeEventListener("moduleWillUnload", cleanup);
            document.body.dataset.cqModuleInitialized = "false";
        };
        document.addEventListener("supabaseAuthStateChange", handleAuth);
        document.addEventListener("moduleWillUnload", cleanup);
        if (supabase?.auth?.getSession) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session)
                    handleAuth({
                        detail: {
                            user: session.user,
                        },
                    });
            });
        }
        setupEventListeners();
    }

    initializeModule();
})();
