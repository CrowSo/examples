// js/brokerage-cqp.js
(() => {
    // SECTION 1: INITIALIZATION AND CONFIGURATION
    if (document.body.dataset.cqpModuleInitialized === "true") {
        return;
    }
    document.body.dataset.cqpModuleInitialized = "true";

    if (typeof supabase === "undefined" || !supabase) {
        console.error("Supabase client is not available in brokerage-cqp.js.");
        return;
    }

    const CLASSIFICATION_REQUESTS_TABLE = "classification_requests";
    const BUCKET_NAME = "classification-docs";

    let currentUserCQP = null;
    let clientCqpActiveTable, clientCqpHistoryTable;
    let currentStep = 1;
    let filesToUpload = [];
    let allClientRequests = [];
    let currentConfirmCallback = null;
    let currentRequestIdForDocs = null;
    let realtimeChannel = null;

    // --- DOM Element Caching ---
    const newRequestBtn = document.getElementById("cqp-new-request-btn");
    const clientView = document.querySelector(".cqp-container");
    const requestModal = document.getElementById("cqpRequestModal");
    const closeModalBtn = document.getElementById("cqpCloseModalBtn");
    const requestForm = document.getElementById("cqpRequestForm");
    const modalTitle = document.getElementById("cqpModalTitle");
    const requestIdInput = document.getElementById("cqp-request-id");
    const stepperContainer = document.querySelector(".cqp-form-stepper");
    const stepperSteps = document.querySelectorAll(".cqp-step");
    const stepContents = document.querySelectorAll(".cqp-form-step-content");
    const prevStepBtn = document.getElementById("cqp-prev-step-btn");
    const nextStepBtn = document.getElementById("cqp-next-step-btn");
    const submitRequestBtn = document.getElementById("cqp-submit-request-btn");
    const fileInput = document.getElementById("cqp-file-input");
    const fileListContainer = document.getElementById("cqp-file-list");
    const existingFilesContainer = document.getElementById(
        "cqp-existing-files-container"
    );
    const existingFilesList = document.getElementById("cqp-existing-files-list");
    // New Dashboard Elements
    const dbActionRequired = document.getElementById("db-action-required");
    const dbUnderReview = document.getElementById("db-under-review");
    const dbOldestActive = document.getElementById("db-oldest-active");
    const dbCompleted30Days = document.getElementById("db-completed-30-days");

    const openHistoryModalBtn = document.getElementById("cqpOpenHistoryModalBtn");
    const historyModal = document.getElementById("cqpHistoryModal");
    const closeHistoryModalBtn = document.getElementById(
        "cqpCloseHistoryModalBtn"
    );
    const closeHistoryFooterBtn = document.getElementById(
        "cqpCloseHistoryFooterBtn"
    );
    const histMonthSelect = document.getElementById("cqp-hist-month");
    const histYearSelect = document.getElementById("cqp-hist-year");
    const histSearchInput = document.getElementById("cqp-hist-search");
    const applyFiltersBtn = document.getElementById("cqp-apply-filters-btn");

    const viewRequestModal = document.getElementById("cqpViewRequestModal");
    const viewModalTitle = document.getElementById("cqpViewModalTitle");
    const viewModalBody = document.getElementById("cqpViewModalBody");
    const closeViewModalBtn = document.getElementById("cqpCloseViewModalBtn");
    const closeViewFooterBtn = document.getElementById("cqpCloseViewFooterBtn");

    const confirmModal = document.getElementById("cqpCustomConfirmModal");
    const confirmTitle = document.getElementById("cqpConfirmTitle");
    const confirmMessage = document.getElementById("cqpConfirmMessage");
    const confirmOkBtn = document.getElementById("cqpConfirmOkBtn");
    const confirmCancelBtn = document.getElementById("cqpConfirmCancelBtn");
    const confirmCloseBtn = document.getElementById("cqpConfirmCloseBtn");

    const missingInfoModal = document.getElementById("cqpMissingInfoModal");
    const closeMissingInfoModalBtn = document.getElementById(
        "cqpCloseMissingInfoModalBtn"
    );
    const closeMissingInfoFooterBtn = document.getElementById(
        "cqpCloseMissingInfoFooterBtn"
    );
    const uploadMissingDocsBtn = document.getElementById(
        "cqpUploadMissingDocsBtn"
    );
    const notifyAgentBtn = document.getElementById("cqpNotifyAgentBtn");

    const docManagementModal = document.getElementById("cqpDocManagementModal");
    const docModalTitle = document.getElementById("cqpDocModalTitle");
    const closeDocModalBtn = document.getElementById("cqpCloseDocModalBtn");
    const docFileInput = document.getElementById("cqpDocFileInput");
    const uploadDocBtn = document.getElementById("cqpUploadDocBtn");
    const docListContainer = document.getElementById("cqpDocListContainer");
    const noDocsMessage = document.getElementById("cqpNoDocsMessage");
    const closeDocModalFooterBtn = document.getElementById(
        "cqpCloseDocModalFooterBtn"
    );

    // --- New Report Modal Elements ---
    const reportModal = document.getElementById("cqpViewReportModal");
    const reportTitle = document.getElementById("cqpReportTitle");
    const reportBody = document.getElementById("cqp-report-body");
    const closeReportModalBtn = document.getElementById("cqpCloseReportModalBtn");
    const closeReportFooterBtn = document.getElementById(
        "cqpCloseReportFooterBtn"
    );
    const downloadReportPdfBtn = document.getElementById(
        "cqpDownloadReportPdfBtn"
    );

    // SECTION 2: CORE LOGIC & DATABASE

    // --- Client-side Archive Logic ---
    function getClientArchivedRequests() {
        try {
            const archived = localStorage.getItem("clientArchivedRequests");
            return archived ? JSON.parse(archived) : [];
        } catch (e) {
            return [];
        }
    }

    function archiveClientRequest(requestId) {
        const archivedIds = getClientArchivedRequests();
        if (!archivedIds.includes(requestId)) {
            archivedIds.push(requestId);
            localStorage.setItem(
                "clientArchivedRequests",
                JSON.stringify(archivedIds)
            );
        }
    }

    async function handleAuthChange(event) {
        const user = event.detail?.user;
        if (currentUserCQP && user && currentUserCQP.id === user.id) return;

        currentUserCQP = user;
        if (clientCqpActiveTable) {
            clientCqpActiveTable.destroy();
            clientCqpActiveTable = null;
        }
        if (clientCqpHistoryTable) {
            clientCqpHistoryTable.destroy();
            clientCqpHistoryTable = null;
        }

        if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
            realtimeChannel = null;
            console.log("CQP: Realtime channel removed.");
        }

        if (user) {
            clientView.style.display = "flex";
            await fetchClientRequests();
            setupRealtimeSubscription();
        } else {
            clientView.innerHTML =
                '<p style="padding: 2rem; text-align: center;">Please sign in to manage your requests.</p>';
        }
    }

    async function fetchClientRequests() {
        if (!currentUserCQP) return;
        const {
            data,
            error
        } = await supabase
            .from(CLASSIFICATION_REQUESTS_TABLE)
            .select("*")
            .eq("user_id", currentUserCQP.id)
            .order("created_at", {
                ascending: false,
            });
        if (error) {
            showCQPNotification("Failed to load requests.", "error");
            return;
        }
        allClientRequests = data;
        renderClientDashboard();
    }

    function renderClientDashboard() {
        updateDashboardMetrics();
        const clientArchivedIds = getClientArchivedRequests();
        const activeRequests = allClientRequests.filter(
            (r) => r.status !== "Cancelled" && !clientArchivedIds.includes(r.id)
        );
        initializeClientTable("#clientCqpActiveTable", activeRequests);
    }

    function updateDashboardMetrics() {
        // Card 1: Action Required
        const actionRequiredRequests = allClientRequests.filter(
            (r) => r.status === "Awaiting Documents"
        );
        if (dbActionRequired) {
            dbActionRequired.textContent = actionRequiredRequests.length;
        }

        // Card 2: Under Review & Oldest Active
        const underReviewRequests = allClientRequests.filter(
            (r) => r.status === "In Process" || r.status === "Pending" || r.status === "Documents Submitted"
        );
        if (dbUnderReview) {
            dbUnderReview.textContent = underReviewRequests.length;
        }
        if (dbOldestActive) {
            if (underReviewRequests.length > 0) {
                const oldestRequest = underReviewRequests.reduce((oldest, current) => {
                    return new Date(current.created_at) < new Date(oldest.created_at) ?
                        current :
                        oldest;
                });
                const daysOld = Math.floor(
                    (new Date() - new Date(oldestRequest.created_at)) /
                    (1000 * 60 * 60 * 24)
                );
                dbOldestActive.textContent = `Oldest: ${daysOld} day${daysOld !== 1 ? "s" : ""
                    }`;
            } else {
                dbOldestActive.textContent = "Oldest: -";
            }
        }

        // Card 3: Completed in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const completedLast30Days = allClientRequests.filter((r) => {
            const isCompleted = r.status === "Completed";
            if (!isCompleted) return false;
            const completedDate = new Date(r.updated_at);
            return completedDate >= thirtyDaysAgo;
        });
        if (dbCompleted30Days) {
            dbCompleted30Days.textContent = completedLast30Days.length;
        }
    }

    async function deleteRequest(requestId) {
        const {
            error
        } = await supabase
            .from(CLASSIFICATION_REQUESTS_TABLE)
            .delete()
            .eq("id", requestId);
        if (error) {
            showCQPNotification(`Error deleting request: ${error.message}`, "error");
        } else {
            showCQPNotification("Request deleted successfully.", "success");
            await fetchClientRequests();
        }
    }

    function setupRealtimeSubscription() {
        if (realtimeChannel || !currentUserCQP) return;

        console.log(`CQP: Setting up realtime subscription for user ${currentUserCQP.id}`);

        realtimeChannel = supabase
            .channel(`public:${CLASSIFICATION_REQUESTS_TABLE}:user_id=eq.${currentUserCQP.id}`)
            .on(
                'postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: CLASSIFICATION_REQUESTS_TABLE,
                    filter: `user_id=eq.${currentUserCQP.id}`
                },
                (payload) => {
                    console.log('CQP: Realtime UPDATE received:', payload);
                    const updatedRequest = payload.new;
                    const requestIndex = allClientRequests.findIndex(req => req.id === updatedRequest.id);

                    if (requestIndex !== -1) {
                        allClientRequests[requestIndex] = updatedRequest;
                        renderClientDashboard();
                        showCQPNotification(`Request #${updatedRequest.id.substr(-6).toUpperCase()} has been updated.`, 'info');
                    }
                }
            )
            .subscribe();
    }


    // SECTION 3: DATATABLE INITIALIZATION
    function initializeClientTable(tableId, data) {
        const isHistoryTable = tableId === "#clientCqpHistoryTable";
        let dataTableInstance = isHistoryTable ?
            clientCqpHistoryTable :
            clientCqpActiveTable;

        const tableElement = $(tableId);

        // --- REMOVED VISIBILITY HACK ---
        // tableElement.css('visibility', 'hidden'); 

        // 1. Destroy and Empty
        if ($.fn.DataTable.isDataTable(tableElement)) {
            dataTableInstance.destroy();
            tableElement.empty();
        }

        // 2. Initialize DataTables
        dataTableInstance = tableElement.DataTable({
            data: data,
            dom: '<"dt-top"l f>rt<"dt-bottom"ip>',
            
            // CONFIGURACION ESTABLE
            responsive: false,      
            scrollX: true,          
            scrollY: '50vh',        
            scrollCollapse: true,   
            autoWidth: false,       
            deferRender: true,      
            
            paging: true,
            pageLength: 15,
            lengthMenu: [10, 15, 25, 50],
            language: {
                search: "",
                searchPlaceholder: "Search requests...",
                lengthMenu: "_MENU_ per page",
                info: "Showing _START_ to _END_ of _TOTAL_ entries",
                paginate: {
                    first: "<i class='bx bx-chevrons-left'></i>",
                    last: "<i class='bx bx-chevrons-right'></i>",
                    next: "<i class='bx bx-chevron-right'></i>",
                    previous: "<i class='bx bx-chevron-left'></i>"
                }
            },
            columns: [{
                    data: "id",
                    title: "Request ID",
                    className: "dt-center", 
                    render: (d) => (d ? d.toString().substr(-6).toUpperCase() : ""),
                },
                {
                    data: "product_info.description",
                    title: "Product Description",
                    defaultContent: "",
                    className: "dt-left", 
                },
                {
                    data: "created_at",
                    title: "Date Submitted",
                    className: "dt-center", 
                    render: (d) => (d ? new Date(d).toLocaleDateString() : ""),
                },
                {
                    data: "status",
                    title: "Status",
                    className: "dt-center", 
                    render: (d) =>
                        `<span class="cqp-status-badge status-${(d || "Pending")
                            .toLowerCase()
                            .replace(/\s/g, "-")}">${d}</span>`,
                },
                {
                    title: "Review",
                    orderable: false,
                    searchable: false,
                    className: "dt-center dt-actions-col", 
                    render: function (data, type, row) {
                        if (row.status === "Awaiting Documents") {
                            return `<button data-action="review-info" class="btn-cqp-alert" title="Action Required on your Request">
                                        <i class='bx bx-error-circle'></i> Review
                                    </button>`;
                        }
                        return "";
                    },
                },
                {
                    title: "View / Edit",
                    orderable: false,
                    searchable: false,
                    className: "dt-center dt-actions-col", 
                    render: function (data, type, row) {
                        const viewButton = `<button data-action="view" title="View Details"><i class='bx bx-show'></i></button>`;
                        const canEdit =
                            row.status !== "Completed" && row.status !== "Cancelled";
                        const editButton = `<button data-action="edit" title="Edit Request" ${canEdit ? "" : "disabled"
                            }><i class='bx bx-edit'></i></button>`;
                        return `<div class="cqp-table-actions">${viewButton} ${editButton}</div>`;
                    },
                },
                {
                    title: "Docs",
                    orderable: false,
                    searchable: false,
                    className: "dt-center dt-actions-col", 
                    render: (data, type, row) =>
                        `<button class="btn-cqp-docs" data-action="docs" title="Manage Documents"><i class='bx bx-folder-open'></i> Docs</button>`,
                },
                {
                    title: "Quote / Results",
                    orderable: false,
                    searchable: false,
                    className: "dt-center dt-actions-col", 
                    render: function (data, type, row) {
                        const isCompleted = row.status === "Completed";
                        const viewResultsButton = `<button class="btn-cqp-view-results" data-action="view-results" title="View Quote Results" ${isCompleted ? "" : "disabled"
                            }><i class='bx bx-receipt'></i> View Results</button>`;
                        const downloadPdfButton = `<button class="btn-cqp-download-quote" data-action="download-quote" title="Download Quote PDF" ${isCompleted ? "" : "disabled"
                            }><i class='bx bxs-file-pdf'></i> PDF</button>`;
                        return `<div class="cqp-table-actions">${viewResultsButton} ${downloadPdfButton}</div>`;
                    },
                },
                {
                    title: "Actions",
                    orderable: false,
                    searchable: false,
                    className: "dt-center dt-actions-col", 
                    render: function (data, type, row) {
                        if (row.status === "Completed" && !isHistoryTable) {
                            return `<div class="cqp-table-actions"><button data-action="archive-client" class="btn-cqp-archive" title="Archive Request"><i class='bx bx-archive-in'></i> Archive</button></div>`;
                        }
                        const canDelete =
                            row.status !== "Completed" && row.status !== "Cancelled";
                        return `<div class="cqp-table-actions"><button data-action="delete" title="Delete Request" ${canDelete ? "" : "disabled"
                            }><i class='bx bx-trash'></i></button></div>`;
                    },
                },
            ],
            order: [
                [2, "desc"]
            ],
            // FIXED: Logic to Reveal Table (Fade-In) AFTER Adjustment
            initComplete: function(settings, json) {
                const api = this.api();
                const wrapper = $(api.table().container()); // Get the DT wrapper

                // 1. Adjust columns silently (table is hidden by CSS opacity:0)
                api.columns.adjust();
                
                // 2. Wait for rendering to stabilize
                setTimeout(() => {
                    api.columns.adjust().draw();
                    
                    // 3. Add class to trigger CSS Fade-In
                    wrapper.addClass('cqp-ready');
                }, 250); 

                // 4. Safety resize backup
                setTimeout(() => {
                    $(window).trigger('resize');
                    api.columns.adjust();
                }, 500);
            }
        });

        if (isHistoryTable) {
            clientCqpHistoryTable = dataTableInstance;
        } else {
            clientCqpActiveTable = dataTableInstance;
        }
    }

    // SECTION 4: MODAL & FORM LOGIC
    function openLeModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = "flex";
            setTimeout(() => modalElement.classList.add("cqp-modal-open"), 10);
            
            // Standard re-alignment trigger for all modales
            const table = modalElement.querySelector('table.dataTable');
            if (table) {
                setTimeout(() => {
                    const dt = $(table).DataTable();
                    dt.columns.adjust(); 
                }, 200); 
            }
        }
    }

    function closeLeModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove("cqp-modal-open");
            setTimeout(() => {
                modalElement.style.display = "none";
            }, 300);
        }
    }

    function showCQPConfirmModal(title, message, callback) {
        confirmTitle.textContent = title;
        confirmMessage.innerHTML = message;
        currentConfirmCallback = callback;
        openLeModal(confirmModal);
    }

    function closeCQPConfirmModal() {
        closeLeModal(confirmModal);
        currentConfirmCallback = null;
    }

    function openRequestModal() {
        openLeModal(requestModal);
    }

    function closeRequestModal() {
        closeLeModal(requestModal);
    }

    // FIX: OPTIMIZED HISTORY MODAL OPENING
    async function openHistoryModal() {
        openLeModal(historyModal);
        populateHistoryFilters();
        
        if(clientCqpHistoryTable) {
            clientCqpHistoryTable.clear().draw();
        }

        await applyHistoryFilters();
        
        // Force adjustment specifically for History table after data load
        setTimeout(() => {
            if (clientCqpHistoryTable) {
                clientCqpHistoryTable.columns.adjust();
            }
        }, 300);
    }

    function closeHistoryModal() {
        closeLeModal(historyModal);
    }

    function resetForm() {
        requestForm.reset();
        requestIdInput.value = "";
        modalTitle.innerHTML =
            "<i class='bx bx-file-find'></i> New Classification Request";
        submitRequestBtn.innerHTML = "Submit Request";
        existingFilesContainer.style.display = "none";
        existingFilesList.innerHTML = "";
        stepperContainer.classList.remove("editable");
        currentStep = 1;
        filesToUpload = [];
        updateFileList();
        updateStepUI();
    }

    function updateStepUI() {
        stepperSteps.forEach((step) =>
            step.classList.toggle(
                "active",
                parseInt(step.dataset.step) === currentStep
            )
        );
        stepContents.forEach((content) =>
            content.classList.toggle(
                "active",
                parseInt(content.dataset.stepContent) === currentStep
            )
        );
        prevStepBtn.style.display = currentStep > 1 ? "inline-flex" : "none";
        nextStepBtn.style.display = currentStep < 4 ? "inline-flex" : "none";
        submitRequestBtn.style.display = currentStep === 4 ? "inline-flex" : "none";
    }

    function handleNextStep() {
        const isEditMode = !!requestIdInput.value;
        if (!isEditMode) {
            const currentContent = document.querySelector(
                `.cqp-form-step-content[data-step-content="${currentStep}"]`
            );
            const inputs = currentContent.querySelectorAll(
                "input[required], textarea[required], select[required]"
            );
            let isValid = true;
            inputs.forEach((input) => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.style.borderColor = "var(--goldmex-accent-color)";
                } else {
                    input.style.borderColor = "";
                }
            });
            if (!isValid) {
                showCQPNotification(
                    "Please fill all required fields before proceeding.",
                    "error"
                );
                return;
            }
        }
        if (currentStep < 4) {
            currentStep++;
            updateStepUI();
        }
    }

    function handlePrevStep() {
        if (currentStep > 1) {
            currentStep--;
            updateStepUI();
        }
    }

    function validateAllSteps() {
        const allRequiredInputs = requestForm.querySelectorAll("[required]");
        for (const input of allRequiredInputs) {
            if (!input.value.trim()) {
                const parentStepContent = input.closest(".cqp-form-step-content");
                if (parentStepContent) {
                    currentStep = parseInt(parentStepContent.dataset.stepContent);
                    updateStepUI();
                }
                input.focus();
                input.style.borderColor = "var(--goldmex-accent-color)";
                showCQPNotification(
                    "Please fill all required fields in all steps before saving.",
                    "error",
                    5000
                );
                return false;
            }
        }
        return true;
    }

    function handleFileSelection(event) {
        filesToUpload.push(...Array.from(event.target.files));
        updateFileList();
    }

    function updateFileList() {
        fileListContainer.innerHTML = "";
        filesToUpload.forEach((file, index) => {
            const fileItem = document.createElement("div");
            fileItem.className = "cqp-file-item";
            fileItem.innerHTML = `<span>${file.name}</span><button type="button" data-index="${index}" title="Remove file">&times;</button>`;
            fileListContainer.appendChild(fileItem);
        });
    }

    function removeFile(index) {
        filesToUpload.splice(index, 1);
        updateFileList();
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!currentUserCQP)
            return showCQPNotification("You must be signed in.", "error");

        const editingId = requestIdInput.value;

        if (!validateAllSteps()) {
            return;
        }

        submitRequestBtn.disabled = true;
        submitRequestBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Saving...`;

        try {
            let existingAttachments = [];
            if (editingId) {
                const req = allClientRequests.find((r) => r.id === editingId);
                existingAttachments = req ? req.attachments : [];
            }

            const newAttachmentMetadata = [];
            for (const file of filesToUpload) {
                const filePath = `${currentUserCQP.id}/${editingId || "new"
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

            const pgaFlags = Array.from(
                document.querySelectorAll('input[name="pga_flag"]:checked')
            ).map((cb) => cb.value);
            const dataToSave = {
                product_info: {
                    description: document.getElementById("cqp-product-description").value,
                    materials: document.getElementById("cqp-product-materials").value,
                    usage: document.getElementById("cqp-product-usage").value,
                    mfg_method: document.getElementById("cqp-mfg-method").value,
                    packaging: document.getElementById("cqp-packaging").value,
                },
                commercial_data: {
                    value: document.getElementById("cqp-comm-value").value,
                    currency: document.getElementById("cqp-comm-currency").value,
                    incoterm: document.getElementById("cqp-comm-incoterm").value,
                    quantity: document.getElementById("cqp-comm-quantity").value,
                    uom: document.getElementById("cqp-comm-uom").value,
                    weight: document.getElementById("cqp-comm-weight").value,
                    dimensions: document.getElementById("cqp-comm-dimensions").value,
                    freight_cost: document.getElementById("cqp-freight-cost").value,
                    insurance_cost: document.getElementById("cqp-insurance-cost").value,
                },
                origin_info: {
                    country: document.getElementById("cqp-origin-country").value,
                    mfg_location: document.getElementById("cqp-mfg-location").value,
                    brand_model: document.getElementById("cqp-brand-model").value,
                },
                pga_flags: pgaFlags,
                attachments: [...existingAttachments, ...newAttachmentMetadata],
            };

            let result;
            if (editingId) {
                result = await supabase
                    .from(CLASSIFICATION_REQUESTS_TABLE)
                    .update(dataToSave)
                    .eq("id", editingId);
            } else {
                dataToSave.status = "Pending";
                dataToSave.user_id = currentUserCQP.id;
                dataToSave.user_email = currentUserCQP.email;
                result = await supabase
                    .from(CLASSIFICATION_REQUESTS_TABLE)
                    .insert(dataToSave);
            }

            if (result.error) throw result.error;

            showCQPNotification(
                `Request ${editingId ? "updated" : "submitted"} successfully!`,
                "success"
            );
            closeRequestModal();
            await fetchClientRequests();
        } catch (error) {
            console.error("Error submitting request:", error);
            showCQPNotification(`Submission failed: ${error.message}`, "error");
        } finally {
            submitRequestBtn.disabled = false;
            submitRequestBtn.innerHTML = editingId ?
                "Update Request" :
                "Submit Request";
        }
    }

    function populateFormForEdit(data) {
        resetForm();
        requestIdInput.value = data.id;
        modalTitle.innerHTML = `<i class='bx bx-edit-alt'></i> Edit Request #${data.id
            .substr(-6)
            .toUpperCase()}`;
        submitRequestBtn.innerHTML = "Update Request";
        stepperContainer.classList.add("editable");

        document.getElementById("cqp-product-description").value =
            data.product_info.description || "";
        document.getElementById("cqp-product-materials").value =
            data.product_info.materials || "";
        document.getElementById("cqp-product-usage").value =
            data.product_info.usage || "";
        document.getElementById("cqp-mfg-method").value =
            data.product_info.mfg_method || "";
        document.getElementById("cqp-packaging").value =
            data.product_info.packaging || "";

        document.getElementById("cqp-comm-value").value =
            data.commercial_data.value || "";
        document.getElementById("cqp-comm-currency").value =
            data.commercial_data.currency || "USD";
        document.getElementById("cqp-comm-incoterm").value =
            data.commercial_data.incoterm || "";
        document.getElementById("cqp-comm-quantity").value =
            data.commercial_data.quantity || "";
        document.getElementById("cqp-comm-uom").value =
            data.commercial_data.uom || "";
        document.getElementById("cqp-comm-weight").value =
            data.commercial_data.weight || "";
        document.getElementById("cqp-comm-dimensions").value =
            data.commercial_data.dimensions || "";
        document.getElementById("cqp-freight-cost").value =
            data.commercial_data.freight_cost || "";
        document.getElementById("cqp-insurance-cost").value =
            data.commercial_data.insurance_cost || "";

        document.getElementById("cqp-origin-country").value =
            data.origin_info.country || "";
        document.getElementById("cqp-mfg-location").value =
            data.origin_info.mfg_location || "";
        document.getElementById("cqp-brand-model").value =
            data.origin_info.brand_model || "";
        document.querySelectorAll('input[name="pga_flag"]').forEach((cb) => {
            cb.checked = (data.pga_flags || []).includes(cb.value);
        });

        if (data.attachments && data.attachments.length > 0) {
            existingFilesContainer.style.display = "block";
            existingFilesList.innerHTML = data.attachments
                .map(
                    (file) =>
                    `<div class="cqp-file-item cqp-existing-file-item"><span>${file.file_name}</span></div>`
                )
                .join("");
        }

        openRequestModal();
    }

    function populateViewModal(data) {
        const {
            product_info,
            commercial_data,
            origin_info,
            pga_flags,
            attachments,
            id,
        } = data;
        viewModalTitle.innerHTML = `<i class='bx bx-show-alt'></i> Request Details #${id
            .substr(-6)
            .toUpperCase()}`;
        const attachmentsHtml =
            attachments && attachments.length > 0 ?
            attachments
            .map(
                (doc) =>
                `<li>${doc.file_name} (${(doc.file_size / 1024).toFixed(
                                2
                            )} KB)</li>`
            )
            .join("") :
            "<li>No documents were attached.</li>";

        viewModalBody.innerHTML = `
            <div class="cqp-view-columns">
                <div class="cqp-view-column">
                    <div class="le-detail-section"><h4><i class='bx bx-package'></i> Product Information</h4><div class="le-detail-grid"><div class="le-detail-group le-detail-full-width"><span class="le-detail-label">Description:</span><span class="le-detail-value">${product_info.description || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Materials / Composition:</span><span class="le-detail-value">${product_info.materials || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Main Use in U.S.:</span><span class="le-detail-value">${product_info.usage || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Manufacturing Method:</span><span class="le-detail-value">${product_info.mfg_method || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Packaging:</span><span class="le-detail-value">${product_info.packaging || "N/A"
            }</span></div></div></div>
                    <div class="le-detail-section"><h4><i class='bx bx-dollar-circle'></i> Commercial Data</h4><div class="le-detail-grid"><div class="le-detail-group"><span class="le-detail-label">Unit Value:</span><span class="le-detail-value">${commercial_data.value || "N/A"
            } ${commercial_data.currency || ""
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Quantity:</span><span class="le-detail-value">${commercial_data.quantity || "N/A"
            } ${commercial_data.uom || ""
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Incoterm:</span><span class="le-detail-value">${commercial_data.incoterm || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Weight:</span><span class="le-detail-value">${commercial_data.weight || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Dimensions:</span><span class="le-detail-value">${commercial_data.dimensions || "N/A"
            }</span></div></div></div>
                </div>
                <div class="cqp-view-column">
                    <div class="le-detail-section"><h4><i class='bx bx-flag'></i> Origin & PGA Requirements</h4><div class="le-detail-grid"><div class="le-detail-group"><span class="le-detail-label">Country of Origin:</span><span class="le-detail-value">${origin_info.country || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">Mfg. Location:</span><span class="le-detail-value">${origin_info.mfg_location || "N/A"
            }</span></div><div class="le-detail-group le-detail-full-width"><span class="le-detail-label">Brand/Model/Part#:</span><span class="le-detail-value">${origin_info.brand_model || "N/A"
            }</span></div><div class="le-detail-group"><span class="le-detail-label">PGA Flags:</span><span class="le-detail-value">${pga_flags && pga_flags.length > 0 ? pga_flags.join(", ") : "None selected"
            }</span></div></div></div>
                    <div class="le-detail-section"><h4><i class='bx bx-file'></i> Attached Documents</h4><ul class="le-duties-view-container">${attachmentsHtml}</ul></div>
                </div>
            </div>`;
        openLeModal(viewRequestModal);
    }

    function populateMissingInfoModal(data) {
        const modalTitle = document.getElementById("cqpMissingInfoTitle");
        const itemsList = document.getElementById("cqpMissingItemsList");
        const detailsText = document.getElementById("cqpMissingDetails");

        currentRequestIdForDocs = data.id;

        if (notifyAgentBtn) {
            notifyAgentBtn.disabled = true;
        }

        modalTitle.innerHTML = `<i class='bx bx-error-circle' style="color: #fd7e14;"></i> Action Required: Request #${data.id
            .substr(-6)
            .toUpperCase()}`;

        const brokerReview = data.broker_review || {};
        const missingItems = brokerReview.missing_items || [];
        const missingDetails =
            brokerReview.missing_details ||
            "The agent has not left any additional comments.";

        if (missingItems.length > 0) {
            itemsList.innerHTML = missingItems
                .map(
                    (item) => `<li><i class='bx bx-checkbox-checked'></i> ${item}</li>`
                )
                .join("");
        } else {
            itemsList.innerHTML = `<li>No specific documents or items were flagged. Please review the agent's comments.</li>`;
        }

        detailsText.textContent = missingDetails;

        openLeModal(missingInfoModal);
    }

    function populateHistoryFilters() {
        if (!histMonthSelect || !histYearSelect) return;
        histMonthSelect.innerHTML = '<option value="all">All Months</option>';
        for (let i = 0; i < 12; i++) {
            const monthName = new Date(0, i).toLocaleString("default", {
                month: "long",
            });
            histMonthSelect.innerHTML += `<option value="${i}">${monthName}</option>`;
        }
        const years = [
            ...new Set(
                allClientRequests.map((r) => new Date(r.created_at).getFullYear())
            ),
        ].sort((a, b) => b - a);
        histYearSelect.innerHTML = '<option value="all">All Years</option>';
        years.forEach(
            (year) =>
            (histYearSelect.innerHTML += `<option value="${year}">${year}</option>`)
        );
    }

    async function applyHistoryFilters() {
        const {
            data: allHistoryRequests,
            error
        } = await supabase
            .from(CLASSIFICATION_REQUESTS_TABLE)
            .select("*")
            .in("status", ["Completed", "Cancelled"]);

        if (error) {
            showCQPNotification("Could not load history: " + error.message, "error");
            return;
        }

        const month = histMonthSelect.value;
        const year = histYearSelect.value;
        const searchTerm = histSearchInput.value.toLowerCase();

        const filteredData = allHistoryRequests.filter((req) => {
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

        initializeClientTable("#clientCqpHistoryTable", filteredData);
    }

    function showCQPNotification(message, type = "info", duration = 4000) {
        const container = document.getElementById("customNotificationContainerCQP");
        if (!container) return;
        const notification = document.createElement("div");
        notification.className = `custom-notification-st ${type}`;
        let iconClass = "bx bx-info-circle";
        if (type === "success") iconClass = "bx bx-check-circle";
        else if (type === "error") iconClass = "bx bx-x-circle";
        notification.innerHTML = `<i class='${iconClass}'></i><span>${message}</span>`;
        container.appendChild(notification);
        setTimeout(() => notification.classList.add("show"), 10);
        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => notification.remove(), 500);
        }, duration);
    }

    // SECTION 5: DOCUMENT MANAGEMENT LOGIC
    function getFileIconClass(fileName) {
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

    function renderClientDocuments() {
        const request = allClientRequests.find(
            (r) => r.id === currentRequestIdForDocs
        );
        docListContainer.innerHTML = "";
        if (request && request.attachments && request.attachments.length > 0) {
            noDocsMessage.style.display = "none";
            request.attachments.forEach((doc) => {
                const card = document.createElement("div");
                card.className = "cqp-doc-card";
                card.innerHTML = `
                    <div class="cqp-doc-card-icon"><i class='bx ${getFileIconClass(
                    doc.file_name
                )}'></i></div>
                    <div class="cqp-doc-card-info">
                        <span class="cqp-doc-card-name">${doc.file_name}</span>
                        <span class="cqp-doc-card-date">Uploaded: ${new Date(
                    doc.uploaded_at
                ).toLocaleDateString()}</span>
                    </div>
                    <div class="cqp-doc-card-actions">
                        <button class="cqp-doc-action-btn" data-action="download" data-path="${doc.file_path
                    }" title="Download"><i class='bx bxs-download'></i></button>
                        <button class="cqp-doc-action-btn" data-action="delete" data-id="${doc.id
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

    function openDocManagementModal(requestId, requestName) {
        currentRequestIdForDocs = requestId;
        docModalTitle.innerHTML = `<i class='bx bx-folder-open'></i> Docs for: ${requestName}`;
        renderClientDocuments();
        openLeModal(docManagementModal);
    }

    async function uploadClientDocument() {
        if (!currentRequestIdForDocs || !docFileInput.files[0] || !currentUserCQP)
            return;

        uploadDocBtn.disabled = true;
        uploadDocBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
        const file = docFileInput.files[0];
        const filePath = `${currentUserCQP.id
            }/${currentRequestIdForDocs}/${Date.now()}_${file.name}`;

        const {
            error: uploadError
        } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, file);

        if (uploadError) {
            showCQPNotification(`Upload error: ${uploadError.message}`, "error");
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

        const request = allClientRequests.find(
            (r) => r.id === currentRequestIdForDocs
        );
        const updatedAttachments = [...(request.attachments || []), newDocument];
        const {
            error: dbError
        } = await supabase
            .from(CLASSIFICATION_REQUESTS_TABLE)
            .update({
                attachments: updatedAttachments,
            })
            .eq("id", currentRequestIdForDocs);

        uploadDocBtn.disabled = false;
        uploadDocBtn.innerHTML = "<i class='bx bx-upload'></i> Upload";

        if (dbError) {
            showCQPNotification(
                `Failed to save document record: ${dbError.message}`,
                "error"
            );
        } else {
            showCQPNotification("Document uploaded successfully!", "success");
            if (notifyAgentBtn) {
                notifyAgentBtn.disabled = false;
            }
            await fetchClientRequests();
            renderClientDocuments();
            docFileInput.value = "";
        }
    }

    async function deleteClientDocument(docId, filePath) {
        showCQPConfirmModal(
            "Delete Document",
            "Are you sure you want to permanently delete this document?",
            async () => {
                const {
                    error: storageError
                } = await supabase.storage
                    .from(BUCKET_NAME)
                    .remove([filePath]);
                if (storageError) {
                    showCQPNotification(
                        `Storage error: ${storageError.message}`,
                        "error"
                    );
                    return;
                }

                const request = allClientRequests.find(
                    (r) => r.id === currentRequestIdForDocs
                );
                const updatedAttachments = request.attachments.filter(
                    (d) => d.id !== docId
                );
                const {
                    error: dbError
                } = await supabase
                    .from(CLASSIFICATION_REQUESTS_TABLE)
                    .update({
                        attachments: updatedAttachments,
                    })
                    .eq("id", request.id);

                if (dbError) {
                    showCQPNotification(`DB update error: ${dbError.message}`, "error");
                } else {
                    showCQPNotification("Document deleted successfully.", "success");
                    await fetchClientRequests();
                    renderClientDocuments();
                }
            }
        );
    }

    // --- REPORTING AND PDF FUNCTIONS (PORTED FROM CLASSIFICATION MODULE) ---

    function generateReportHtml(data) {
        const p_info = data.product_info || {};
        const c_data = data.commercial_data || {};
        const o_info = data.origin_info || {};
        const q_results = data.quote_results || {};

        const renderItems = (items) =>
            items && items.length > 0 ?
            `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>` :
            "None";
        const renderText = (text) =>
            text ?
            `<div class="cq-report-notes">${text}</div>` :
            `<div class="cq-report-notes">No additional notes.</div>`;

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
        openLeModal(reportModal);
    }

    async function downloadReportAsPdf(data) {
        if (
            typeof html2canvas === "undefined" ||
            typeof window.jspdf === "undefined"
        ) {
            return showCQPNotification(
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
            showCQPNotification(
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
            const {
                jsPDF
            } = window.jspdf;
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "in",
                format: "letter",
            });

            const pageMargin = 0.5;
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
                for (let i = 1; i <= pageCount; i++) {
                    pdf.setPage(i);
                    pdf.setFontSize(9);
                    pdf.setTextColor(150);
                    pdf.text(
                        `Page ${i} of ${pageCount}`,
                        pdfWidth / 2,
                        pdfHeight - 0.25, {
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
            showCQPNotification("An error occurred during PDF generation.", "error");
        } finally {
            document.body.removeChild(tempContainer);
        }
    }

    // SECTION 6: EVENT LISTENERS
    function setupEventListeners() {
        newRequestBtn.addEventListener("click", () => {
            resetForm();
            openRequestModal();
        });
        closeModalBtn.addEventListener("click", closeRequestModal);
        nextStepBtn.addEventListener("click", handleNextStep);
        prevStepBtn.addEventListener("click", handlePrevStep);
        fileInput.addEventListener("change", handleFileSelection);
        fileListContainer.addEventListener("click", (event) => {
            if (event.target.closest("button"))
                removeFile(parseInt(event.target.closest("button").dataset.index));
        });
        requestForm.addEventListener("submit", handleFormSubmit);

        openHistoryModalBtn.addEventListener("click", openHistoryModal);
        closeHistoryModalBtn.addEventListener("click", closeHistoryModal);
        closeHistoryFooterBtn.addEventListener("click", closeHistoryModal);
        applyFiltersBtn.addEventListener("click", applyHistoryFilters);

        closeViewModalBtn.addEventListener("click", () =>
            closeLeModal(viewRequestModal)
        );
        closeViewFooterBtn.addEventListener("click", () =>
            closeLeModal(viewRequestModal)
        );

        closeMissingInfoModalBtn.addEventListener("click", () =>
            closeLeModal(missingInfoModal)
        );
        closeMissingInfoFooterBtn.addEventListener("click", () =>
            closeLeModal(missingInfoModal)
        );
        uploadMissingDocsBtn.addEventListener("click", () => {
            const request = allClientRequests.find(
                (r) => r.id === currentRequestIdForDocs
            );
            if (request) {
                openDocManagementModal(request.id, request.product_info.description);
            }
        });

        notifyAgentBtn.addEventListener("click", async () => {
            if (!currentRequestIdForDocs) return;

            const {
                error
            } = await supabase
                .from(CLASSIFICATION_REQUESTS_TABLE)
                .update({
                    status: 'Documents Submitted'
                })
                .eq('id', currentRequestIdForDocs);

            if (error) {
                showCQPNotification(`Error notifying agent: ${error.message}`, "error");
            } else {
                showCQPNotification("Agent has been notified of the new documents.", "success");
                closeLeModal(missingInfoModal);
                await fetchClientRequests();
            }
        });

        closeDocModalBtn.onclick = () => closeLeModal(docManagementModal);
        closeDocModalFooterBtn.onclick = () => closeLeModal(docManagementModal);
        uploadDocBtn.onclick = uploadClientDocument;
        docListContainer.addEventListener("click", async (event) => {
            const button = event.target.closest(".cqp-doc-action-btn");
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
                    showCQPNotification(`Download error: ${error.message}`, "error");
                    return;
                }
                const link = document.createElement("a");
                link.href = URL.createObjectURL(data);
                link.download = path.split("/").pop();
                link.click();
                URL.revokeObjectURL(link.href);
            } else if (action === "delete") {
                const docId = button.dataset.id;
                deleteClientDocument(docId, path);
            }
        });

        confirmOkBtn.addEventListener("click", () => {
            if (typeof currentConfirmCallback === "function") {
                currentConfirmCallback();
            }
            closeCQPConfirmModal();
        });
        confirmCancelBtn.addEventListener("click", closeCQPConfirmModal);
        confirmCloseBtn.addEventListener("click", closeCQPConfirmModal);

        stepperSteps.forEach((step) => {
            step.addEventListener("click", () => {
                if (stepperContainer.classList.contains("editable")) {
                    currentStep = parseInt(step.dataset.step);
                    updateStepUI();
                }
            });
        });

        const handleTableActionEvent = (event, tableInstance) => {
            const button = event.target.closest("button[data-action]");
            if (!button || !tableInstance) return;
            const action = button.dataset.action;
            const row = button.closest("tr");
            const data = tableInstance.row(row).data();
            if (!data) return;

            switch (action) {
                case "review-info":
                    populateMissingInfoModal(data);
                    break;
                case "view":
                    populateViewModal(data);
                    break;
                case "edit":
                    populateFormForEdit(data);
                    break;
                case "docs":
                    openDocManagementModal(data.id, data.product_info.description);
                    break;
                case "view-results":
                    openReportModal(data);
                    break;
                case "download-quote":
                    downloadReportAsPdf(data);
                    break;
                case "archive-client":
                    archiveClientRequest(data.id);
                    renderClientDashboard();
                    showCQPNotification(
                        "Request archived and hidden from this view.",
                        "info"
                    );
                    break;
                case "delete":
                    showCQPConfirmModal(
                        "Confirm Deletion",
                        `Are you sure you want to delete request <strong>#${data.id
                            .substr(-6)
                            .toUpperCase()}</strong>? This action cannot be undone.`,
                        () => deleteRequest(data.id)
                    );
                    break;
            }
        };

        $("#clientCqpActiveTable").on("click", "button[data-action]", (e) =>
            handleTableActionEvent(e, clientCqpActiveTable)
        );
        $("#clientCqpHistoryTable").on("click", "button[data-action]", (e) =>
            handleTableActionEvent(e, clientCqpHistoryTable)
        );

        // --- New Listeners for Report Modal ---
        closeReportModalBtn.addEventListener("click", () =>
            closeLeModal(reportModal)
        );
        closeReportFooterBtn.addEventListener("click", () =>
            closeLeModal(reportModal)
        );
        downloadReportPdfBtn.addEventListener("click", (e) => {
            const requestId = e.target.dataset.requestId;
            const requestData = allClientRequests.find((r) => r.id === requestId);
            if (requestData) {
                downloadReportAsPdf(requestData);
            }
        });
    }

    function initializeModule() {
        console.log("Brokerage CQP (Client Portal) Module Initialized");
        setupEventListeners();
        const cleanupModule = () => {
            console.log("CQP Module Unloaded");
            document.removeEventListener("supabaseAuthStateChange", handleAuthChange);
            document.removeEventListener("moduleWillUnload", cleanupModule);
            if (clientCqpActiveTable) {
                $("#clientCqpActiveTable").off("click");
                clientCqpActiveTable.destroy();
                clientCqpActiveTable = null;
            }
            if (clientCqpHistoryTable) {
                $("#clientCqpHistoryTable").off("click");
                clientCqpHistoryTable.destroy();
                clientCqpHistoryTable = null;
            }
            if (realtimeChannel) {
                supabase.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }
            document.body.dataset.cqpModuleInitialized = "false";
        };
        document.addEventListener("supabaseAuthStateChange", handleAuthChange);
        document.addEventListener("moduleWillUnload", cleanupModule);

        supabase.auth.getSession().then(({
            data: {
                session
            }
        }) => {
            if (session) {
                handleAuthChange({
                    detail: {
                        user: session.user,
                    },
                });
            }
        });
    }

    initializeModule();
})();
