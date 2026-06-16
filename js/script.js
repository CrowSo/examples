// js/script.js (COMPLETO - V19 - FIXED IMAGE LOADING)

console.log("Script.js: >>> CORE SYSTEM STARTED <<<");

// --- 1. SELECCIÓN DE ELEMENTOS DOM ---
const sidebar = document.getElementById("sidebar");
const menuBtnDesktop = document.getElementById("menu-btn");
const sidebarBtnMobile = document.getElementById("sidebar-btn");
const darkModeBtn = document.getElementById("dark-mode-btn");
const mainContent = document.querySelector("main");
const mainAppContent = document.getElementById("main-app-content");
const authRequiredMessage = document.getElementById("auth-required-message");
const authButton = document.getElementById("auth-button");

// Elementos de Perfil de Usuario
const userProfileArea = document.getElementById("user-profile-area");
const userNameElement = document.getElementById("user-name");
const userEmailElement = document.getElementById("user-email");
const userAvatarElement = document.getElementById("user-avatar");
const userContainer = document.querySelector(".user");

// Elementos de Menú
const menusItemsDropDown = document.querySelectorAll(".menu-item-dropdown");
const allMenuLinks = document.querySelectorAll(
  ".sidebar .menu-link, .sidebar .sub-menu-link"
);

// --- 2. CONFIGURACIÓN SUPABASE ---
const SUPABASE_URL = "https://ogatafslnevidfopuvbp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nYXRhZnNsbmV2aWRmb3B1dmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NDM0MTQsImV4cCI6MjA2MjMxOTQxNH0.Z4uAWCmyzbiFBVM51vLHwo7larVx6Y3wYK6vMzgj9j0";

try {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    window.supabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );
    console.log("Supabase client initialized.");
  } else {
    throw new Error("Supabase library not found.");
  }
} catch (error) {
  console.error("Supabase Init Error:", error);
}

// --- 3. ESTADO GLOBAL ---
let inactivityTimer;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 mins
let currentGlobalUser = null;
let currentGlobalProfile = null;

// --- 4. GESTIÓN DE SESIÓN ---

async function signOut() {
  stopInactivityTimer();
  try {
    await window.supabase.auth.signOut();
  } catch (e) {
    console.warn("SignOut error:", e);
  } finally {
    localStorage.removeItem("gmx_wst_session_v5_cloud");
    window.location.href = "login.html";
  }
}

// Lógica de Inactividad
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (mainContent && mainContent.dataset.currentModule === "wst-ranking")
    return;
  inactivityTimer = setTimeout(() => {
    console.log("Inactivity timeout. Logging out.");
    showCustomNotificationST("Session expired due to inactivity.", "info");
    signOut();
  }, INACTIVITY_TIMEOUT_MS);
}

function startInactivityTimer() {
  stopInactivityTimer();
  if (mainContent && mainContent.dataset.currentModule === "wst-ranking")
    return;

  resetInactivityTimer();
  window.addEventListener("mousemove", resetInactivityTimer);
  window.addEventListener("keydown", resetInactivityTimer);
  window.addEventListener("click", resetInactivityTimer);
  window.addEventListener("scroll", resetInactivityTimer);
}

function stopInactivityTimer() {
  clearTimeout(inactivityTimer);
  window.removeEventListener("mousemove", resetInactivityTimer);
  window.removeEventListener("keydown", resetInactivityTimer);
  window.removeEventListener("click", resetInactivityTimer);
  window.removeEventListener("scroll", resetInactivityTimer);
}

// --- 5. UI UPDATE & PERMISOS (CORE) ---

function updateUserUI(user, profile = null) {
  if (user) {
    const name = profile ? profile.full_name : user.email.split("@")[0];
    
    // [CORRECCIÓN] Validación estricta de la URL del avatar para evitar error 404
    const avatar = (profile && profile.avatar_url && profile.avatar_url.trim() !== "") 
        ? profile.avatar_url 
        : "assets/favicon.png"; // Usamos favicon como fallback seguro

    if (userNameElement) userNameElement.textContent = name;
    if (userEmailElement) userEmailElement.textContent = user.email;
    if (userAvatarElement) userAvatarElement.src = avatar;

    if (authButton) {
      authButton.innerHTML = "<i class='bx bx-log-out'></i>";
      authButton.title = "Sign Out";
      authButton.onclick = signOut;
    }

    if (authRequiredMessage) authRequiredMessage.style.display = "none";
    if (mainAppContent) mainAppContent.style.display = "block";

    // Aplicar permisos
    applyMenuPermissions(profile);

    startInactivityTimer();
  } else {
    if (userNameElement) userNameElement.textContent = "Guest";
    if (userEmailElement) userEmailElement.textContent = "Please sign in";
    if (mainAppContent) mainAppContent.style.display = "none";
    if (authRequiredMessage) authRequiredMessage.style.display = "block";
    stopInactivityTimer();
  }
}

function applyMenuPermissions(profile) {
  if (!profile) return;

  const role = profile.role || "employee";
  const isSuperAdmin = profile.is_super_admin === true;
  let allowedModules = profile.allowed_modules || [];

  console.log(
    `Applying Permissions -> Role: ${role}, Modules:`,
    allowedModules
  );

  // 1. Manejo del botón SUPER ADMIN
  const superAdminItems = document.querySelectorAll(".role-super-admin");
  superAdminItems.forEach((item) => {
    item.style.display = isSuperAdmin ? "list-item" : "none";
  });

  // 2. Iterar TODOS los items del menú (excluyendo super admin)
  const allMenuItems = document.querySelectorAll(
    ".sidebar .menu > .menu-item:not(.role-super-admin)"
  );

  allMenuItems.forEach((item) => {
    const link = item.querySelector(".menu-link");
    const isDropdown = item.classList.contains("menu-item-dropdown");

    if (isDropdown) {
      // Lógica para Dropdowns (ej: CRM, Warehouse)
      const subLinks = item.querySelectorAll(".sub-menu-link");
      let visibleChildrenCount = 0;

      subLinks.forEach((subLink) => {
        const moduleName = subLink.dataset.module;
        // Acceso si: es Manager O el módulo está en la lista permitida
        const canSee =
          role === "manager" || allowedModules.includes(moduleName);

        if (canSee) {
          subLink.parentElement.style.display = "list-item";
          visibleChildrenCount++;
        } else {
          subLink.parentElement.style.display = "none";
        }
      });

      // Mostrar el padre solo si tiene hijos visibles
      item.style.display = visibleChildrenCount > 0 ? "list-item" : "none";
    } else {
      // Lógica para Links Simples (ej: Home, Brokerage CQP)
      if (!link) return;
      const moduleName = link.dataset.module;

      if (moduleName) {
        // Home siempre visible, el resto depende de permisos/rol
        const isHome = moduleName === "home";
        const canSee =
          isHome || role === "manager" || allowedModules.includes(moduleName);
        item.style.display = canSee ? "list-item" : "none";
      } else {
        item.style.display = "list-item";
      }
    }
  });
}

async function fetchProfileAndUpdateUI(user) {
  if (userContainer) userContainer.classList.add("loading-profile");

  try {
    const { data: profile, error } = await window.supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    currentGlobalProfile = profile;
    updateUserUI(user, profile);

    // Cargar Home si estamos en root
    const currentModule = mainContent.dataset.currentModule;
    if (!currentModule || currentModule === "auth-required") {
      const homeLink = document.querySelector('.menu-link[data-module="home"]');
      if (homeLink) loadModule("home", homeLink);
    }

    document.dispatchEvent(
      new CustomEvent("supabaseAuthStateChange", {
        detail: { user, profile },
      })
    );
  } catch (error) {
    console.error("Profile Fetch Error:", error);
    updateUserUI(user, { role: "employee", allowed_modules: [] });
  } finally {
    if (userContainer) userContainer.classList.remove("loading-profile");

    // FIX ANTI-PARPADEO
    setTimeout(() => {
      document.body.classList.remove("loading-permissions");
      document.body.classList.add("sidebar-loaded");
    }, 50);
  }
}

// --- 6. ROUTING (CARGA DE MÓDULOS) ---

async function loadModule(moduleName, clickedLink) {
  if (!mainContent) return;

  // 1. Verificar Permisos en Cliente (Seguridad Visual)
  if (
    currentGlobalProfile &&
    currentGlobalProfile.role !== "manager" &&
    !currentGlobalProfile.is_super_admin
  ) {
    const allowed = currentGlobalProfile.allowed_modules || [];
    if (
      moduleName !== "home" &&
      moduleName !== "super-admin" &&
      !allowed.includes(moduleName)
    ) {
      showCustomNotificationST("Access Denied to this module.", "error");
      return;
    }
  }

  document.dispatchEvent(new CustomEvent("moduleWillUnload"));

  if (authRequiredMessage) authRequiredMessage.style.display = "none";
  if (mainAppContent) mainAppContent.style.display = "block";

  // Stop timer for TV mode
  if (moduleName === "wst-ranking") stopInactivityTimer();
  else startInactivityTimer();

  // Loading State
  mainContent.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:80vh; flex-direction:column;"><i class='bx bx-loader-alt bx-spin' style='font-size: 3rem; color: var(--goldmex-secondary-color);'></i><p style="margin-top: 1rem; color: var(--color-text-secondary);">Loading ${moduleName}...</p></div>`;
  mainContent.dataset.currentModule = moduleName;

  try {
    const response = await fetch(`${moduleName}.html`);
    if (!response.ok) throw new Error(`Error loading ${moduleName}`);
    const html = await response.text();
    mainContent.innerHTML = html;

    // Activar animación
    if (mainContent.children[0])
      mainContent.children[0].classList.add("module-enter-animation");

    setActiveMenuItem(clickedLink);

    // Re-ejecutar scripts dentro del HTML inyectado
    processModuleScripts();

    // Notificar eventos
    document.dispatchEvent(
      new CustomEvent("moduleContentLoaded", { detail: { moduleName } })
    );
    waitForModuleReady(moduleName);
  } catch (error) {
    mainContent.innerHTML = `<div style="padding: 2rem; text-align: center;"><h2>Error</h2><p>${error.message}</p></div>`;
  }
}

function processModuleScripts() {
  Array.from(mainContent.querySelectorAll("script")).forEach((oldScript) => {
    const newScript = document.createElement("script");
    Array.from(oldScript.attributes).forEach((attr) =>
      newScript.setAttribute(attr.name, attr.value)
    );
    if (oldScript.textContent) newScript.textContent = oldScript.textContent;
    oldScript.parentNode.replaceChild(newScript, oldScript);
  });
}

function waitForModuleReady(moduleName) {
  const handler = (e) => {
    if (e.detail?.moduleName === moduleName) {
      document.dispatchEvent(
        new CustomEvent("supabaseAuthStateChange", {
          detail: { user: currentGlobalUser, profile: currentGlobalProfile },
        })
      );
      document.removeEventListener("moduleReadyForAuth", handler);
    }
  };
  document.addEventListener("moduleReadyForAuth", handler);
}

// --- 7. INTERACCIÓN UI (Sidebar, Dark Mode) ---

if (menuBtnDesktop) {
  menuBtnDesktop.addEventListener("click", () => {
    sidebar.classList.toggle("minimize");
    if (sidebar.classList.contains("minimize")) {
      menusItemsDropDown.forEach((item) => {
        item.classList.remove("sub-menu-toggle");
        const sub = item.querySelector(".sub-menu");
        if (sub) {
          sub.style.height = "0";
          sub.style.padding = "0";
        }
      });
    }
  });
}

if (sidebarBtnMobile) {
  sidebarBtnMobile.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-hidden");
  });
}

// Lógica de Acordeón para Menú
menusItemsDropDown.forEach((menuItem) => {
  const link = menuItem.querySelector(".menu-link");
  if (link) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (sidebar.classList.contains("minimize")) return;

      const isActive = menuItem.classList.toggle("sub-menu-toggle");
      const subMenu = menuItem.querySelector(".sub-menu");

      // Cerrar otros
      menusItemsDropDown.forEach((other) => {
        if (other !== menuItem && other.classList.contains("sub-menu-toggle")) {
          other.classList.remove("sub-menu-toggle");
          const otherSub = other.querySelector(".sub-menu");
          if (otherSub) {
            otherSub.style.height = "0";
            otherSub.style.padding = "0";
          }
        }
      });

      if (subMenu) {
        // Altura dinámica
        subMenu.style.height = isActive ? `${subMenu.scrollHeight}px` : "0";
        subMenu.style.padding = isActive ? "0.2rem 0" : "0";
      }
    });
  }
});

// Click en Links de Módulo
allMenuLinks.forEach((link) => {
  const moduleName = link.dataset.module;
  if (moduleName) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      loadModule(moduleName, link);
      if (window.innerWidth <= 768)
        document.body.classList.add("sidebar-hidden");
    });
  }
});

function setActiveMenuItem(clicked) {
  if (!clicked) return;
  allMenuLinks.forEach((l) => l.classList.remove("link-active"));
  document
    .querySelectorAll(".menu-item-dropdown")
    .forEach((d) => d.classList.remove("parent-active"));

  clicked.classList.add("link-active");
  const parent = clicked.closest(".menu-item-dropdown");
  if (parent) {
    parent.classList.add("parent-active");
    if (!sidebar.classList.contains("minimize")) {
      // Solo expandir si no estaba ya expandido para evitar animación doble
      if (!parent.classList.contains("sub-menu-toggle")) {
        parent.classList.add("sub-menu-toggle");
        const sub = parent.querySelector(".sub-menu");
        if (sub) {
          sub.style.height = `${sub.scrollHeight}px`;
          sub.style.padding = "0.2rem 0";
        }
      }
    }
  }
}

// Dark Mode Persistence
if (darkModeBtn) {
  if (localStorage.getItem("darkMode") === "enabled")
    document.body.classList.add("dark-mode");
  darkModeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem(
      "darkMode",
      document.body.classList.contains("dark-mode") ? "enabled" : "disabled"
    );
  });
}

// --- 8. INICIALIZACIÓN GLOBAL ---
document.addEventListener("DOMContentLoaded", () => {
  if (!window.supabase) {
    if (!window.location.pathname.includes("login.html"))
      window.location.href = "login.html";
    return;
  }

  window.supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
    if (user) {
      currentGlobalUser = user;
      if (!currentGlobalProfile || currentGlobalProfile.id !== user.id) {
        fetchProfileAndUpdateUI(user);
      }
    } else {
      currentGlobalUser = null;
      currentGlobalProfile = null;
      updateUserUI(null);
      if (!window.location.pathname.includes("login.html"))
        window.location.href = "login.html";
    }
  });
});

// --- HELPER: TOAST NOTIFICATIONS (COMPLETA) ---
function showCustomNotificationST(message, type = "info") {
  const id = "global-notification-area";
  let container = document.getElementById(id);
  if (!container) {
    container = document.createElement("div");
    container.id = id;
    container.style.position = "fixed";
    container.style.top = "20px";
    container.style.right = "20px";
    container.style.zIndex = "9999";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "10px";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  const colors = {
    success: "#10b981", // Green
    error: "#ef4444", // Red
    warning: "#f59e0b", // Orange
    info: "#3b82f6", // Blue
  };
  const icons = {
    success: "bx-check-circle",
    error: "bx-x-circle",
    warning: "bx-error-circle",
    info: "bx-info-circle",
  };

  // Estilos inline para asegurar funcionamiento sin CSS externo
  toast.style.backgroundColor = colors[type] || colors.info;
  toast.style.color = "#fff";
  toast.style.padding = "12px 20px";
  toast.style.borderRadius = "6px";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.gap = "10px";
  toast.style.minWidth = "280px";
  toast.style.fontWeight = "500";
  toast.style.opacity = "0";
  toast.style.transform = "translateX(100%)";
  toast.style.transition = "all 0.3s ease-out";

  toast.innerHTML = `<i class='bx ${icons[type] || icons.info
    }' style="font-size:1.4rem"></i><span>${message}</span>`;

  // Botón cerrar
  const closeBtn = document.createElement("span");
  closeBtn.innerHTML = "&times;";
  closeBtn.style.marginLeft = "auto";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "1.2rem";
  closeBtn.onclick = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    setTimeout(() => toast.remove(), 300);
  };
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  // Animación de entrada
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(0)";
  });

  // Auto eliminar
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}