// js/super-admin.js - V20 (Auto-Discovery of Modules + Password Fix)
console.log("Super Admin JS: >>> SCRIPT EXECUTION STARTED <<<");

(function () {
    // --- 1. CONFIGURACIÓN Y SELECTORES ---
    if (!window.supabase) {
        console.error("Super Admin Error: Supabase client missing.");
        return;
    }
    const supabase = window.supabase;

    const moduleContainer = document.getElementById("super-admin-module");
    if (!moduleContainer) return;

    // Tabs
    const tabContainer = moduleContainer.querySelector(".admin-tabs");
    const tabPanes = moduleContainer.querySelectorAll(".tab-pane");

    // Tablas
    const userTbody = document.getElementById("user-management-tbody");
    const userTableElement = document.getElementById("user-management-table");
    const exceptionTbody = document.getElementById("exception-management-tbody");
    const exceptionTableElement = document.getElementById("exception-management-table");

    // Formulario Excepciones
    const exceptionEmailInput = document.getElementById("exception-email-input");
    const exceptionRoleInput = document.getElementById("exception-role-input");
    const exceptionDescriptionInput = document.getElementById("exception-description-input");
    const addExceptionBtn = document.getElementById("add-exception-btn");

    // Modal Permisos
    const permissionsModal = document.getElementById("permissions-modal");
    const closePermissionsModalBtn = document.getElementById("close-permissions-modal");
    const permissionsForm = document.getElementById("permissions-form");
    const savePermissionsBtn = document.getElementById("save-permissions-btn");
    const permissionsUserEmailLabel = document.getElementById("permissions-user-email");

    // Modal Password
    const passwordModal = document.getElementById("password-modal");
    const closePasswordModalBtn = document.getElementById("close-password-modal");
    const passwordUserEmailLabel = document.getElementById("password-user-email");
    const newPasswordInput = document.getElementById("new-password-input");
    const togglePasswordBtn = document.getElementById("toggle-password-visibility");
    const savePasswordBtn = document.getElementById("save-password-btn");

    // --- ESTADO ---
    let currentUser = null;
    let isInitialized = false;
    let userTable = null;
    let exceptionTable = null;
    
    let editingId = null;       
    let editingContext = null;  
    let passwordEditingUserId = null; 

    // --- HELPERS ---
    async function showConfirmation(title, text, confirmBtn = "Yes", icon = "warning") {
        if (typeof Swal !== "undefined") {
            const result = await Swal.fire({
                title: title, text: text, icon: icon,
                showCancelButton: true,
                confirmButtonColor: "#1abc9c", cancelButtonColor: "#e74c3c",
                confirmButtonText: confirmBtn
            });
            return result.isConfirmed;
        }
        return confirm(text);
    }

    function notify(msg, type = "info") {
        if (typeof showCustomNotificationST === "function") showCustomNotificationST(msg, type);
        else alert(msg);
    }

    // --- INICIALIZACIÓN ---
    async function initializeSuperAdmin(user, profile) {
        if (isInitialized) return;

        if (!user || !profile || profile.is_super_admin !== true) {
            moduleContainer.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--goldmex-accent);"><i class='bx bx-error-circle' style="font-size:2rem;"></i><br>Access Denied</div>`;
            return;
        }

        isInitialized = true;
        currentUser = user;

        setupEventListeners();
        await Promise.all([loadUsers(), loadExceptions()]);
        
        showTab("tab-users");
    }

    function showTab(tabId) {
        tabPanes.forEach(p => p.classList.remove("active"));
        tabContainer.querySelectorAll(".tab-link").forEach(l => l.classList.remove("active"));

        document.getElementById(tabId)?.classList.add("active");
        tabContainer.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");

        setTimeout(() => {
            if (tabId === "tab-users" && userTable) userTable.columns.adjust();
            if (tabId === "tab-exceptions" && exceptionTable) exceptionTable.columns.adjust();
        }, 50);
    }

    // ========================================================================
    // 2. GESTIÓN DE USUARIOS (TAB 1)
    // ========================================================================

    async function loadUsers() {
        try {
            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .order("full_name", { ascending: true });

            if (error) throw error;
            renderUserTable(data || []);
        } catch (e) {
            console.error("Load Users Error:", e);
            if(userTbody) userTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">${e.message}</td></tr>`;
        }
    }

    function renderUserTable(users) {
        if (userTable) { userTable.destroy(); userTable = null; }
        userTbody.innerHTML = "";

        users.forEach(user => {
            const row = document.createElement("tr");
            row.dataset.id = user.id;
            row.dataset.modules = JSON.stringify(user.allowed_modules || []);
            row.dataset.email = user.email;
            row.dataset.role = user.role;

            const isSuper = user.is_super_admin === true;
            const isSelf = user.id === currentUser.id;
            const disabledAttr = (isSuper || isSelf) ? "disabled" : "";

            const roleSelect = `
                <select class="role-select" onchange="window.saHandleRoleChange(this, '${user.id}', '${user.role}')" ${disabledAttr}>
                    <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>Employee</option>
                    <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                    <option value="team-lead" ${user.role === 'team-lead' ? 'selected' : ''}>Team Lead</option>
                    <option value="client" ${user.role === 'client' ? 'selected' : ''}>Client</option>
                </select>
                ${isSuper ? '<span style="font-size:0.7em; color:#f59e0b; display:block;">(Super Admin)</span>' : ''}
            `;

            row.innerHTML = `
                <td><span style="font-weight:600; color:var(--goldmex-primary);">${user.full_name || 'N/A'}</span></td>
                <td>${user.email}</td>
                <td>${roleSelect}</td>
                <td style="text-align:center;">
                    <div class="cqp-table-actions">
                        <button class="btn-edit-user" onclick="window.saEditName('${user.id}', '${user.full_name}')" ${isSelf ? 'disabled' : ''} title="Edit Name"><i class='bx bxs-edit'></i></button>
                        
                        <button class="btn-permissions-user" style="background-color:rgba(16, 185, 129, 0.1); color:#10b981;" onclick="window.saOpenPasswordModal('${user.id}', '${user.email}')" ${isSuper ? 'disabled' : ''} title="Set Password">
                            <i class='bx bxs-lock-alt'></i>
                        </button>

                        <button class="btn-permissions-user" onclick="window.saOpenPermissions('${user.id}', 'profile')" ${isSuper ? 'disabled' : ''} title="Permissions"><i class='bx bxs-key'></i></button>
                        <button class="btn-delete-user" onclick="window.saDeleteUser('${user.id}', '${user.email}')" ${disabledAttr} title="Delete User"><i class='bx bxs-trash'></i></button>
                    </div>
                </td>
            `;
            userTbody.appendChild(row);
        });

        initDataTable(userTableElement, 'user');
    }

    // ========================================================================
    // 3. GESTIÓN DE EXCEPCIONES (TAB 2)
    // ========================================================================

    async function loadExceptions() {
        try {
            const { data, error } = await supabase
                .from("allowed_exceptions")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            renderExceptionTable(data || []);
        } catch (e) {
            console.error("Load Exceptions Error:", e);
        }
    }

    function renderExceptionTable(exceptions) {
        if (exceptionTable) { exceptionTable.destroy(); exceptionTable = null; }
        exceptionTbody.innerHTML = "";

        exceptions.forEach(exc => {
            const row = document.createElement("tr");
            row.dataset.id = exc.id;
            row.dataset.modules = JSON.stringify(exc.allowed_modules || []);
            row.dataset.email = exc.email;
            row.dataset.role = exc.assigned_role;

            const role = exc.assigned_role || 'employee';
            let badgeStyle = "background:#f3f4f6; color:#4b5563; border:1px solid #d1d5db;";
            if (role === 'manager') badgeStyle = "background:#fffbeb; color:#d97706; border:1px solid #fcd34d;";
            if (role === 'client') badgeStyle = "background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;";

            row.innerHTML = `
                <td><span style="font-weight:600;">${exc.email}</span></td>
                <td><span class="role-badge" style="padding:2px 8px; border-radius:4px; font-size:0.75rem; text-transform:uppercase; font-weight:700; ${badgeStyle}">${role}</span></td>
                <td><span style="color:var(--color-text-secondary); font-style:italic;">${exc.description || '-'}</span></td>
                <td style="text-align:center;">
                    <div class="cqp-table-actions">
                        <button class="btn-permissions-user" onclick="window.saOpenPermissions('${exc.id}', 'exception')" title="Configure Default Permissions">
                            <i class='bx bxs-key'></i>
                        </button>
                        <button class="btn-delete-exception" onclick="window.saDeleteException('${exc.id}', '${exc.email}')">
                            <i class='bx bxs-trash'></i>
                        </button>
                    </div>
                </td>
            `;
            exceptionTbody.appendChild(row);
        });

        initDataTable(exceptionTableElement, 'exception');
    }

    async function handleAddException() {
        const email = exceptionEmailInput.value.trim().toLowerCase();
        const role = exceptionRoleInput.value;
        const desc = exceptionDescriptionInput.value.trim();

        if (!email.includes("@")) return notify("Invalid email", "warning");

        addExceptionBtn.disabled = true;
        try {
            const { error } = await supabase.from("allowed_exceptions").insert({
                email, assigned_role: role, description: desc
            });
            if (error) throw error;
            
            notify("Exception added.", "success");
            exceptionEmailInput.value = "";
            exceptionDescriptionInput.value = "";
            await loadExceptions();
        } catch (e) {
            notify(e.message, "error");
        } finally {
            addExceptionBtn.disabled = false;
        }
    }

    // ========================================================================
    // 4. GENERADOR DINÁMICO DE PERMISOS (AUTO-DISCOVERY)
    // ========================================================================

    function generatePermissionsUI() {
        const sidebar = document.getElementById('sidebar'); 
        const form = document.getElementById('permissions-form');
        
        if (!sidebar || !form) {
            console.warn("Auto-Discovery: Sidebar or Form not found.");
            return;
        }

        // Limpiar formulario antiguo/estático
        form.innerHTML = ''; 

        // 1. Contenedor para items sueltos "General"
        let generalContainer = null;
        
        // 2. Obtener items del menú lateral real
        const menuItems = sidebar.querySelectorAll('.menu > li');
        
        menuItems.forEach(item => {
            // Ignorar el item del Super Admin (ya que se controla por rol, no por módulo)
            // También ignorar elementos ocultos por CSS (display: none)
            if (item.classList.contains('role-super-admin') || item.style.display === 'none') return;

            // CASO A: Categorías (Dropdowns)
            if (item.classList.contains('menu-item-dropdown')) {
                const parentLink = item.querySelector('.menu-link');
                const categoryName = parentLink ? parentLink.querySelector('span').innerText.trim() : 'Other';
                
                const subLinks = item.querySelectorAll('.sub-menu-link');
                
                // Solo crear grupo si tiene sub-links con data-module
                let hasValidModules = false;
                const groupDiv = document.createElement('div');
                groupDiv.className = 'permission-group';
                groupDiv.innerHTML = `<h3>${categoryName}</h3>`;

                subLinks.forEach(sub => {
                    const modName = sub.dataset.module;
                    const modLabel = sub.innerText.trim();
                    if (modName) {
                        addCheckboxToGroup(groupDiv, modName, modLabel);
                        hasValidModules = true;
                    }
                });

                if (hasValidModules) form.appendChild(groupDiv);
            } 
            // CASO B: Módulos Sueltos (Static)
            else if (item.classList.contains('menu-item-static')) {
                const link = item.querySelector('.menu-link');
                const modName = link.dataset.module;
                const modLabel = link.querySelector('span').innerText.trim();

                if (modName && modName !== 'home') { // Home suele ser público
                    if (!generalContainer) {
                        generalContainer = document.createElement('div');
                        generalContainer.className = 'permission-group';
                        generalContainer.innerHTML = `<h3>General / Portals</h3>`;
                    }
                    addCheckboxToGroup(generalContainer, modName, modLabel);
                }
            }
        });

        // Poner el grupo General al principio si existe
        if (generalContainer) form.prepend(generalContainer);
    }

    function addCheckboxToGroup(container, value, labelText) {
        const label = document.createElement('label');
        label.className = 'checkbox-container';
        label.innerHTML = `
            <input type="checkbox" name="modules" value="${value}">
            <span class="checkmark"></span> ${labelText}
        `;
        container.appendChild(label);
    }

    // ========================================================================
    // 5. MODAL DE PERMISOS
    // ========================================================================

    window.saOpenPermissions = function(id, context) {
        editingId = id;
        editingContext = context;

        let row;
        if(context === 'profile') row = userTbody.querySelector(`tr[data-id="${id}"]`);
        else row = exceptionTbody.querySelector(`tr[data-id="${id}"]`);

        if(!row) return;

        const email = row.dataset.email;
        const role = row.dataset.role;
        const modulesStr = row.dataset.modules;
        const allowedModules = modulesStr ? JSON.parse(modulesStr) : [];

        permissionsUserEmailLabel.innerHTML = `
            <span style="color:var(--color-text-secondary);">Editing:</span> ${email} 
            <span class="role-badge" style="font-size:0.7rem; margin-left:10px;">${role.toUpperCase()}</span>
        `;

        // [NUEVO] Generar UI fresca basada en el Sidebar actual
        generatePermissionsUI();

        // Marcar checkboxes según permisos guardados
        const checkboxes = permissionsForm.querySelectorAll("input[type='checkbox']");
        checkboxes.forEach(cb => {
            cb.checked = allowedModules.includes('*') || allowedModules.includes(cb.value);
        });

        permissionsModal.classList.add("visible");
    };

    async function savePermissions() {
        if (!editingId || !editingContext) return;
        
        savePermissionsBtn.disabled = true;
        savePermissionsBtn.innerText = "Saving...";

        const selected = [];
        permissionsForm.querySelectorAll("input[type='checkbox']:checked").forEach(cb => {
            selected.push(cb.value);
        });

        try {
            const tableName = editingContext === 'profile' ? 'profiles' : 'allowed_exceptions';
            
            const { error } = await supabase
                .from(tableName)
                .update({ allowed_modules: selected })
                .eq("id", editingId);

            if (error) throw error;

            notify("Permissions updated.", "success");
            permissionsModal.classList.remove("visible");
            
            if (editingContext === 'profile') await loadUsers();
            else await loadExceptions();

        } catch (e) {
            notify(e.message, "error");
        } finally {
            savePermissionsBtn.disabled = false;
            savePermissionsBtn.innerText = "Save Changes";
        }
    }

    // ========================================================================
    // 6. GESTIÓN DE PASSWORDS (MODAL)
    // ========================================================================

    window.saOpenPasswordModal = function(id, email) {
        passwordEditingUserId = id;
        passwordUserEmailLabel.textContent = `Set password for: ${email}`;
        newPasswordInput.value = ""; 
        newPasswordInput.type = "password"; 
        togglePasswordBtn.className = "bx bx-show";
        
        passwordModal.classList.add("visible");
        setTimeout(() => newPasswordInput.focus(), 100);
    };

    async function handleSetPassword() {
        const newPass = newPasswordInput.value.trim();
        
        if (!newPass) return notify("Please enter a password", "warning");
        if (newPass.length < 6) return notify("Password must be at least 6 chars", "warning");
        if (!passwordEditingUserId) return;

        savePasswordBtn.disabled = true;
        savePasswordBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Updating...";

        try {
            const { error } = await supabase.rpc('admin_set_user_password', {
                target_user_id: passwordEditingUserId,
                new_password: newPass
            });

            if (error) throw error;

            notify("Password updated successfully!", "success");
            passwordModal.classList.remove("visible");

        } catch (e) {
            console.error("Set Password Error:", e);
            notify("Error: " + e.message, "error");
        } finally {
            savePasswordBtn.disabled = false;
            savePasswordBtn.innerText = "Set Password";
        }
    }

    // ========================================================================
    // 7. UTILIDADES GLOBALES
    // ========================================================================

    window.saHandleRoleChange = async function(select, id, oldRole) {
        const newRole = select.value;
        if(await showConfirmation("Update Role?", `Change from ${oldRole} to ${newRole}?`)) {
            try {
                await supabase.from("profiles").update({ role: newRole }).eq("id", id);
                notify("Role updated.", "success");
                await loadUsers();
            } catch(e) { notify("Error", "error"); select.value = oldRole; }
        } else {
            select.value = oldRole;
        }
    };

    window.saEditName = async function(id, currentName) {
        const { value: newName } = await Swal.fire({
            title: "Edit Name", input: "text", inputValue: currentName,
            showCancelButton: true, confirmButtonColor: "#3b82f6"
        });
        if (newName && newName !== currentName) {
            await supabase.from("profiles").update({ full_name: newName }).eq("id", id);
            loadUsers();
        }
    };

    window.saDeleteUser = async function(id, email) {
        if(await showConfirmation("Delete User?", `Delete profile ${email}?`, "Delete", "error")) {
            await supabase.from("profiles").delete().eq("id", id);
            loadUsers();
        }
    };

    window.saDeleteException = async function(id, email) {
        if(await showConfirmation("Remove Exception?", `Remove access for ${email}?`, "Remove", "error")) {
            await supabase.from("allowed_exceptions").delete().eq("id", id);
            loadExceptions();
        }
    };

    function initDataTable(el, type) {
        if (typeof $ === 'undefined') return;
        if ($.fn.DataTable.isDataTable(el)) {
            $(el).DataTable().destroy();
        }

        const instance = $(el).DataTable({
            dom: '<"wst-dt-header"lf>rt<"wst-dt-footer"ip>',
            responsive: true,
            scrollY: '50vh',
            scrollCollapse: true,
            paging: true,
            pageLength: 15,
            lengthMenu: [10, 15, 25, 50, 100],
            language: {
                search: "", 
                searchPlaceholder: "Search...",
                lengthMenu: "_MENU_ rows"
            },
            columnDefs: [{ orderable: false, targets: -1 }]
        });

        if (type === 'user') userTable = instance;
        else exceptionTable = instance;
    }

    // --- SETUP LISTENERS ---
    function setupEventListeners() {
        tabContainer.addEventListener("click", (e) => {
            const link = e.target.closest(".tab-link");
            if (link) showTab(link.dataset.tab);
        });

        // Exceptions
        addExceptionBtn.addEventListener("click", handleAddException);
        
        // Permissions Modal
        closePermissionsModalBtn.addEventListener("click", () => permissionsModal.classList.remove("visible"));
        savePermissionsBtn.addEventListener("click", savePermissions);

        // Password Modal
        closePasswordModalBtn.addEventListener("click", () => passwordModal.classList.remove("visible"));
        savePasswordBtn.addEventListener("click", handleSetPassword);
        
        togglePasswordBtn.addEventListener("click", () => {
            if (newPasswordInput.type === "password") {
                newPasswordInput.type = "text";
                togglePasswordBtn.className = "bx bx-hide";
            } else {
                newPasswordInput.type = "password";
                togglePasswordBtn.className = "bx bx-show";
            }
        });
        
        newPasswordInput.addEventListener("keyup", (e) => {
            if (e.key === "Enter") handleSetPassword();
        });
    }

    // --- START ---
    document.addEventListener("supabaseAuthStateChange", (e) => {
        const mainContent = document.querySelector("main");
        if (mainContent?.dataset.currentModule === "super-admin") {
            const { user, profile } = e.detail;
            if(user && profile) initializeSuperAdmin(user, profile);
        } else {
            isInitialized = false;
        }
    });

    document.dispatchEvent(new CustomEvent("moduleReadyForAuth", {
        detail: { moduleName: "super-admin" }
    }));

})();