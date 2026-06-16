// js/client-management.js
(function() {
    // Prevent double initialization
    if (document.body.dataset.clientManagementInitialized === 'true') {
        return;
    }
    document.body.dataset.clientManagementInitialized = 'true';

    console.log("Client Management Module Initialized - v16 (Close Button Fix)");

    if (!window.supabase) {
        console.error("Supabase client not found.");
        return;
    }

    // --- CONSTANTS & STATE ---
    const BUCKET_NAME = 'clients-docs';
    let currentUser = null;
    let currentClientIdForDocs = null;
    let allClientsData = [];
    let tableInstance = null;

    // --- DOM Elements ---
    const addClientBtn = document.getElementById('add-client-btn');
    const importCsvBtn = document.getElementById('import-csv-btn');
    const clientsTableElement = document.getElementById('clientsTable');

    // Add/Edit Modal
    const addClientModal = document.getElementById('addClientModal');
    const addClientForm = document.getElementById('addClientForm');
    const modalTitle = document.querySelector('#addClientModal .cm-modal-header h2');
    const closeAddClientModalBtn = document.querySelector('#addClientModal .cm-close-btn');

    // Confirm Modal
    const confirmModal = document.getElementById('cmConfirmModal');
    const confirmTitle = document.getElementById('cmConfirmTitle');
    const confirmMessage = document.getElementById('cmConfirmMessage');
    const confirmOkBtn = document.getElementById('cmConfirmOkBtn');
    const confirmCancelBtn = document.getElementById('cmConfirmCancelBtn');
    const confirmCloseBtn = document.getElementById('cmConfirmCloseBtn');
    let confirmCallback = null;

    // CSV Modal
    const importCsvModal = document.getElementById('importCsvModal');
    const closeCsvModalBtn = document.querySelector('#importCsvModal .cm-close-btn');
    const csvFileInput = document.getElementById('csvFileInput');
    const processCsvBtn = document.getElementById('processCsvBtn');
    const cancelCsvUploadBtn = document.getElementById('cancelCsvUploadBtn');
    const csvProcessingResultsDiv = document.getElementById('csv-processing-results');
    const csvResultsMessage = document.getElementById('csvResultsMessage');

    // Doc Management Modal
    const docManagementModal = document.getElementById('docManagementModal');
    const docModalTitle = document.getElementById('docModalTitle');
    // CORRECCIÓN: Selección de ambos botones de cierre (Header X y Footer Button)
    const closeDocModalFooterBtn = document.getElementById('closeDocModalBtn'); // Botón 'Close' del footer (ID corregido según HTML anterior)
    const closeDocModalHeaderBtn = document.querySelector('#docManagementModal .cm-close-btn'); // La 'X' del header
    const docFileInput = document.getElementById('docFileInput');
    const uploadDocBtn = document.getElementById('uploadDocBtn');
    const docListContainer = document.getElementById('docListContainer');
    const noDocsMessage = document.getElementById('noDocsMessage');
    // Nota: closeDocModalFooterBtn ya estaba definido arriba, eliminamos duplicado si existía


    // --- DATATABLE INITIALIZATION (The Trinity Implementation) ---
    function initializeDataTable(data) {
        if ($.fn.DataTable.isDataTable(clientsTableElement)) {
            $(clientsTableElement).DataTable().destroy();
            $(clientsTableElement).empty();
        }

        tableInstance = $(clientsTableElement).DataTable({
            data: data,
            responsive: true,
            dom: '<"cm-dt-header"lf>rt<"cm-dt-footer"ip>',
            scrollY: '50vh',
            scrollCollapse: true,
            paging: true,
            pageLength: 15,
            lengthMenu: [15, 25, 50, 100],
            language: {
                search: "",
                searchPlaceholder: "Search clients...",
                lengthMenu: "_MENU_ per page",
                info: "Showing _START_ to _END_ of _TOTAL_ clients",
                paginate: {
                    first: "<i class='bx bx-chevrons-left'></i>",
                    last: "<i class='bx bx-chevrons-right'></i>",
                    next: "<i class='bx bx-chevron-right'></i>",
                    previous: "<i class='bx bx-chevron-left'></i>"
                }
            },
            columns: [
                { data: 'company_name', title: 'Company Name' },
                { data: 'contact_name', title: 'Contact Name' },
                { data: 'contact_position', title: 'Position' },
                { data: 'email', title: 'Email' },
                { data: 'phone', title: 'Phone' },
                { 
                    data: 'client_type', 
                    title: 'Client Type',
                    render: function(data) {
                        return `<span class="badge badge-info">${data || 'N/A'}</span>`;
                    }
                },
                { data: 'nationality', title: 'Nationality' },
                {
                    data: null,
                    title: 'Actions',
                    orderable: false,
                    className: 'dt-center',
                    render: function(data, type, row) {
                        return `
                            <div class="cm-actions-btn">
                                <button class="cm-edit-btn" data-id="${row.id}" title="Edit Client"><i class='bx bxs-edit'></i></button>
                                <button class="cm-delete-btn" data-id="${row.id}" data-name="${row.company_name}" title="Delete Client"><i class='bx bxs-trash'></i></button>
                            </div>
                        `;
                    }
                },
                {
                    data: null,
                    title: 'Docs',
                    orderable: false,
                    className: 'dt-center',
                    render: function(data, type, row) {
                        return `<button class="btn-goldmex-secondary btn-small cm-docs-btn" data-id="${row.id}" data-name="${row.company_name}"><i class='bx bx-folder-open'></i> Docs</button>`;
                    }
                }
            ]
        });
    }

    // --- Dashboard & Data Fetching ---
    function updateDashboardCards(clients) {
        const totalClients = clients.length;
        
        // CHANGED: Updated to use English names from CSV (Regular Clients)
        const regularClients = clients.filter(c => c.client_type === 'Regular Clients').length;
        
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const newClients = clients.filter(c => new Date(c.created_at) > oneMonthAgo).length;
        
        // CHANGED: Updated to use English names from CSV (Grupo LR Clients)
        const grupoLrClients = clients.filter(c => c.client_type === 'Grupo LR Clients').length;
        
        // CHANGED: Updated to use English names from CSV (Tramites RY Clients)
        const tramitesRyClients = clients.filter(c => c.client_type === 'Tramites RY Clients').length;

        document.getElementById('total-clients-card').textContent = totalClients;
        document.getElementById('regular-clients-card').textContent = regularClients;
        document.getElementById('new-clients-card').textContent = newClients;
        document.getElementById('grupo-lr-clients-card').textContent = grupoLrClients;
        document.getElementById('tramites-ry-clients-card').textContent = tramitesRyClients;
    }

    async function fetchClients() {
        try {
            const { data, error } = await supabase.from('clients').select('*').order('company_name', { ascending: true });
            if (error) throw error;
            allClientsData = data;
            initializeDataTable(allClientsData);
            updateDashboardCards(allClientsData);
        } catch (error) {
            console.error('Error fetching clients:', error.message);
            if(window.showCustomNotificationST) {
                window.showCustomNotificationST('Error fetching clients', 'error');
            }
        }
    }

    // --- Modal Helpers ---
    function openModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = 'flex';
            // Force reflow to ensure transition happens
            void modalElement.offsetWidth; 
            modalElement.classList.add('open');
        }
    }

    function closeModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove('open');
            setTimeout(() => {
                modalElement.style.display = 'none';
            }, 300); // 300ms matches CSS transition
        }
    }

    function showConfirmModal(title, message, callback) {
        confirmTitle.textContent = title;
        confirmMessage.innerHTML = message;
        confirmCallback = callback;
        openModal(confirmModal);
    }
    
    function closeConfirmModal() {
        closeModal(confirmModal);
        confirmCallback = null;
    }

    // --- Add/Edit Client Logic ---
    if(addClientForm) addClientForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const clientData = {
            company_name: document.getElementById('companyName').value,
            contact_name: document.getElementById('contactName').value,
            contact_position: document.getElementById('contactPosition').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            client_type: document.getElementById('clientType').value,
            nationality: document.getElementById('nationality').value,
            address: document.getElementById('address').value,
        };

        const editingId = addClientForm.getAttribute('data-editing-id');
        let error;
        let successMessage = '';

        if (editingId) {
            ({ error } = await supabase.from('clients').update(clientData).eq('id', editingId));
            successMessage = 'Client updated successfully!';
        } else {
            clientData.documents = []; 
            ({ error } = await supabase.from('clients').insert([clientData]));
            successMessage = 'Client added successfully!';
        }

        if (error) {
            console.error('Error saving client:', error.message);
            if(window.showCustomNotificationST) window.showCustomNotificationST(`Error saving client: ${error.message}`, 'error');
        } else {
            await fetchClients();
            closeModal(addClientModal);
            if(window.showCustomNotificationST) window.showCustomNotificationST(successMessage, 'success');
        }
    });

    // --- Table Actions ---
    $('#clientsTable').on('click', 'button', async function (e) {
        e.preventDefault();
        const button = $(this);
        const clientId = button.data('id');

        if (button.hasClass('cm-edit-btn')) {
            const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
            if (error) {
                if(window.showCustomNotificationST) window.showCustomNotificationST('Error fetching client data', 'error');
                return;
            }
            
            document.getElementById('companyName').value = data.company_name;
            document.getElementById('contactName').value = data.contact_name;
            document.getElementById('contactPosition').value = data.contact_position;
            document.getElementById('email').value = data.email;
            document.getElementById('phone').value = data.phone;
            document.getElementById('clientType').value = data.client_type;
            document.getElementById('nationality').value = data.nationality;
            document.getElementById('address').value = data.address;
            
            modalTitle.textContent = 'Edit Client';
            addClientForm.setAttribute('data-editing-id', clientId);
            openModal(addClientModal);

        } else if (button.hasClass('cm-delete-btn')) {
            const clientName = button.data('name');
            showConfirmModal(
                'Delete Client', 
                `Are you sure you want to permanently delete the client <strong>${clientName}</strong>? This action will also delete all associated documents.`,
                async () => {
                    const clientToDelete = allClientsData.find(c => c.id === clientId);
                    if (clientToDelete && clientToDelete.documents && clientToDelete.documents.length > 0) {
                        const filePaths = clientToDelete.documents.map(doc => doc.file_path);
                        const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove(filePaths);
                    }

                    const { error } = await supabase.from('clients').delete().eq('id', clientId);
                    if (error) {
                        if(window.showCustomNotificationST) window.showCustomNotificationST('Error deleting client', 'error');
                    } else {
                        fetchClients();
                        if(window.showCustomNotificationST) window.showCustomNotificationST('Client deleted successfully', 'success');
                    }
                }
            );
        } else if (button.hasClass('cm-docs-btn')) {
            const clientName = button.data('name');
            currentClientIdForDocs = clientId;
            docModalTitle.innerHTML = `<i class='bx bx-folder-open'></i> Documents: ${clientName}`;
            renderClientDocuments();
            openModal(docManagementModal);
        }
    });

    // --- CSV Import ---
    function parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const rows = lines.slice(1).map(line => {
            const values = line.split(',');
            return header.reduce((obj, nextKey, index) => {
                obj[nextKey] = values[index] ? values[index].trim() : '';
                return obj;
            }, {});
        });
        return rows;
    }

    async function handleProcessCsv() {
        const file = csvFileInput.files[0];
        if (!file) {
            if(window.showCustomNotificationST) window.showCustomNotificationST('Please select a CSV file first.', 'warning');
            return;
        }

        processCsvBtn.disabled = true;
        processCsvBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Processing...";

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csvText = event.target.result;
                const clientsFromCsv = parseCSV(csvText);

                const { data: existingClients, error: fetchError } = await supabase.from('clients').select('email');
                if (fetchError) throw fetchError;
                const existingEmails = new Set(existingClients.map(c => c.email));

                const newClients = clientsFromCsv.filter(client => {
                    return client.email && !existingEmails.has(client.email);
                }).map(client => ({
                    ...client,
                    documents: []
                }));

                let message = '';
                if (newClients.length > 0) {
                    const { error: insertError } = await supabase.from('clients').insert(newClients);
                    if (insertError) throw insertError;
                    message = `Successfully added ${newClients.length} new clients.`;
                } else {
                    message = 'No new clients to add.';
                }

                const skippedCount = clientsFromCsv.length - newClients.length;
                if (skippedCount > 0) {
                    message += ` Skipped ${skippedCount} clients because they already exist.`;
                }
                
                csvResultsMessage.textContent = message;
                csvProcessingResultsDiv.style.display = 'block';
                await fetchClients();

            } catch (error) {
                console.error('Error processing CSV:', error);
                if(window.showCustomNotificationST) window.showCustomNotificationST(`Error processing file: ${error.message}`, 'error');
                csvResultsMessage.textContent = `Error: ${error.message}`;
                csvProcessingResultsDiv.style.display = 'block';
            } finally {
                processCsvBtn.disabled = false;
                processCsvBtn.innerHTML = "Process File";
            }
        };
        reader.readAsText(file);
    }

    // --- Document Management ---
    function getFileIconClass(fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        switch (extension) {
            case 'pdf': return 'bxs-file-pdf';
            case 'doc': case 'docx': return 'bxs-file-doc';
            case 'xls': case 'xlsx': return 'bxs-file-excel';
            case 'jpg': case 'jpeg': case 'png': return 'bxs-file-image';
            default: return 'bxs-file-blank';
        }
    }

    function renderClientDocuments() {
        const client = allClientsData.find(c => c.id === currentClientIdForDocs);
        docListContainer.innerHTML = '';
        if (client && client.documents && client.documents.length > 0) {
            noDocsMessage.style.display = 'none';
            client.documents.forEach(doc => {
                const card = document.createElement('div');
                card.className = 'cm-doc-card';
                card.innerHTML = `
                    <div class="cm-doc-card-icon"><i class='bx ${getFileIconClass(doc.file_name)}'></i></div>
                    <div class="cm-doc-card-info">
                        <span class="cm-doc-card-name">${doc.file_name}</span>
                        <span class="cm-doc-card-date">Uploaded: ${new Date(doc.uploaded_at).toLocaleDateString()}</span>
                    </div>
                    <div class="cm-doc-card-actions">
                        <button class="cm-doc-action-btn" data-action="download" data-path="${doc.file_path}" title="Download"><i class='bx bxs-download'></i></button>
                        <button class="cm-doc-action-btn" data-action="delete" data-id="${doc.id}" data-path="${doc.file_path}" title="Delete"><i class='bx bxs-trash'></i></button>
                    </div>
                `;
                docListContainer.appendChild(card);
            });
        } else {
            noDocsMessage.style.display = 'block';
        }
    }

    async function uploadClientDocument() {
        if (!currentClientIdForDocs || !docFileInput.files[0] || !currentUser) return;

        uploadDocBtn.disabled = true;
        uploadDocBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
        const file = docFileInput.files[0];
        const filePath = `${currentUser.id}/${currentClientIdForDocs}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file);

        if (uploadError) {
            if(window.showCustomNotificationST) window.showCustomNotificationST(`Upload error: ${uploadError.message}`, 'error');
            uploadDocBtn.disabled = false;
            uploadDocBtn.innerHTML = "<i class='bx bx-upload'></i> Upload";
            return;
        }

        const newDocument = {
            id: `doc_${Date.now()}`,
            file_name: file.name,
            file_path: filePath,
            uploaded_at: new Date().toISOString()
        };

        const client = allClientsData.find(c => c.id === currentClientIdForDocs);
        const updatedDocuments = [...(client.documents || []), newDocument];
        const { error: dbError } = await supabase.from('clients').update({ documents: updatedDocuments }).eq('id', currentClientIdForDocs);

        uploadDocBtn.disabled = false;
        uploadDocBtn.innerHTML = "<i class='bx bx-upload'></i> Upload";

        if (dbError) {
            if(window.showCustomNotificationST) window.showCustomNotificationST(`Failed to save document record: ${dbError.message}`, 'error');
        } else {
            if(window.showCustomNotificationST) window.showCustomNotificationST('Document uploaded successfully!', 'success');
            await fetchClients();
            renderClientDocuments();
            docFileInput.value = '';
        }
    }

    async function deleteClientDocument(docId, filePath) {
        showConfirmModal('Delete Document', 'Are you sure you want to permanently delete this document?', async () => {
            const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);
            if (storageError) {
                if(window.showCustomNotificationST) window.showCustomNotificationST(`Storage error: ${storageError.message}`, 'error');
                return;
            }

            const client = allClientsData.find(c => c.id === currentClientIdForDocs);
            const updatedDocuments = client.documents.filter(d => d.id !== docId);
            const { error: dbError } = await supabase.from('clients').update({ documents: updatedDocuments }).eq('id', client.id);

            if (dbError) {
                if(window.showCustomNotificationST) window.showCustomNotificationST(`DB update error: ${dbError.message}`, 'error');
            } else {
                if(window.showCustomNotificationST) window.showCustomNotificationST('Document deleted successfully.', 'success');
                await fetchClients();
                renderClientDocuments();
            }
        });
    }

    // --- Event Listeners ---
    if(addClientBtn) addClientBtn.onclick = () => {
        addClientForm.reset();
        addClientForm.removeAttribute('data-editing-id');
        modalTitle.textContent = 'Add New Client';
        openModal(addClientModal);
    };
    if(closeAddClientModalBtn) closeAddClientModalBtn.onclick = () => closeModal(addClientModal);

    if(confirmOkBtn) confirmOkBtn.onclick = () => {
        if (typeof confirmCallback === 'function') confirmCallback();
        closeConfirmModal();
    };
    if(confirmCancelBtn) confirmCancelBtn.onclick = closeConfirmModal;
    if(confirmCloseBtn) confirmCloseBtn.onclick = closeConfirmModal;

    if(importCsvBtn) importCsvBtn.onclick = () => {
        csvFileInput.value = '';
        csvProcessingResultsDiv.style.display = 'none';
        processCsvBtn.disabled = true;
        openModal(importCsvModal);
    };
    if(closeCsvModalBtn) closeCsvModalBtn.onclick = () => closeModal(importCsvModal);
    if(cancelCsvUploadBtn) cancelCsvUploadBtn.onclick = () => closeModal(importCsvModal);
    if(csvFileInput) csvFileInput.onchange = () => {
        processCsvBtn.disabled = !csvFileInput.files[0];
    };
    if(processCsvBtn) processCsvBtn.onclick = handleProcessCsv;

    // --- CORRECCIÓN: Event Listeners para el modal de documentos ---
    // Cierra con el botón del footer
    if(closeDocModalFooterBtn) closeDocModalFooterBtn.onclick = () => closeModal(docManagementModal);
    
    // Cierra con la 'X' del header (NUEVO)
    if(closeDocModalHeaderBtn) closeDocModalHeaderBtn.onclick = () => closeModal(docManagementModal);

    if(uploadDocBtn) uploadDocBtn.onclick = uploadClientDocument;
    
    if(docListContainer) docListContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('.cm-doc-action-btn');
        if (!button) return;
        const action = button.dataset.action;
        const path = button.dataset.path;
        if (action === 'download') {
            const { data, error } = await supabase.storage.from(BUCKET_NAME).download(path);
            if (error) {
                if(window.showCustomNotificationST) window.showCustomNotificationST(`Download error: ${error.message}`, 'error');
                return;
            }
            const link = document.createElement('a');
            link.href = URL.createObjectURL(data);
            link.download = path.split('/').pop();
            link.click();
            URL.revokeObjectURL(link.href);
        } else if (action === 'delete') {
            const docId = button.dataset.id;
            deleteClientDocument(docId, path);
        }
    });

    window.addEventListener('click', (event) => { 
        if (event.target == addClientModal) closeModal(addClientModal);
        if (event.target == confirmModal) closeConfirmModal();
        if (event.target == importCsvModal) closeModal(importCsvModal);
        if (event.target == docManagementModal) closeModal(docManagementModal);
    });

    // --- Module Initialization ---
    function initializeModule() {
        const authChangeHandler = (event) => {
            const sessionUser = event.detail?.user;
            if (sessionUser) {
                currentUser = sessionUser;
                fetchClients();
            } else {
                currentUser = null;
                if ($.fn.DataTable.isDataTable(clientsTableElement)) {
                    $(clientsTableElement).DataTable().clear().draw();
                }
            }
        };

        document.addEventListener('supabaseAuthStateChange', authChangeHandler);

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                currentUser = session.user;
                fetchClients();
            }
        });
        
        const cleanup = () => {
            console.log("Client Management Module Unloading");
            if ($.fn.DataTable.isDataTable(clientsTableElement)) {
                $(clientsTableElement).DataTable().destroy();
                $(clientsTableElement).empty();
            }
            document.removeEventListener('supabaseAuthStateChange', authChangeHandler);
            delete document.body.dataset.clientManagementInitialized;
            document.removeEventListener('moduleWillUnload', cleanup);
        };
        document.addEventListener('moduleWillUnload', cleanup);
    }

    initializeModule();

})();