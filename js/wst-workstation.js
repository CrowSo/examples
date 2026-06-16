// js/wst-workstation.js
// V9.0 - Logic Shift: Removed Order Completion Trigger (Moved to Scanner)

(function () {
  // --- DEPENDENCY CHECK ---
  if (!window.supabase) {
    console.error("CRITICAL: Supabase client missing.");
    return;
  }

  const moduleContainer = document.querySelector(".wst-workstation-container");
  if (!moduleContainer) return;

  // --- CONSTANTS & STATE ---
  const SESSION_KEY = "gmx_wst_session_v5_cloud";

  // Application State
  let state = {
    line: null, // { id, name, team: [], worker_count: 1 }
    product: null, // Active product object
    ticket: null, // { id, order_ref, target, current, line_restriction }
    pallet: null, // { id, qr_id, start_time, is_paused, total_pause_seconds }
    timerInterval: null,
  };

  // Prevent double-click / race conditions
  let isLoadingAction = false;

  // Realtime Subscriptions
  let lineSubscription = null;
  let selectionSubscription = null;
  let palletSubscription = null;

  // Temporary state for Modals
  let currentTeamList = [];
  let currentLiveTeamList = [];
  let currentUserEmail = null;
  let pendingLineSelection = null;

  // --- DOM ELEMENTS ---
  const loadingOverlay = document.getElementById("wst-loading-state");

  // Views
  const viewSelection = document.getElementById("wst-view-selection");
  const viewDashboard = document.getElementById("wst-view-dashboard");

  // Dashboard UI
  const dashTitle = document.getElementById("wst-dashboard-line-title");
  const dashOp = document.getElementById("wst-dashboard-operator");
  const editTeamTrigger = document.getElementById("wst-edit-team-trigger");
  const statusMsg = document.getElementById("wst-process-status");

  // Metrics Cards
  const cardName = document.getElementById("wst-card-name");
  const cardProgress = document.getElementById("wst-card-progress");
  const cardStdTime = document.getElementById("wst-card-std-time");
  const cardRealTime = document.getElementById("wst-card-real-time");

  // Controls
  const scanTicketBtn = document.getElementById("wst-scan-ticket-btn");
  const startBtn = document.getElementById("wst-btn-start");
  const finishBtn = document.getElementById("wst-btn-finish");
  const printBtn = document.getElementById("wst-btn-print");
  const releaseBtn = document.getElementById("wst-release-line-btn");

  // Job Ticket Scan Modal
  const ticketModal = document.getElementById("wst-ticket-modal");
  const ticketInput = document.getElementById("wst-ticket-input");
  const ticketError = document.getElementById("wst-ticket-error");
  const cancelTicketBtn = document.getElementById("wst-cancel-ticket-btn");

  // Login Modal Elements
  const linesGrid = document.getElementById("wst-lines-grid-container");
  const addLineBtn = document.getElementById("wst-add-line-btn");
  const loginOverlay = document.getElementById("wst-login-overlay");
  const workerInput = document.getElementById("wst-operator-name-input");
  const addWorkerBtn = document.getElementById("wst-add-worker-btn");
  const workerListContainer = document.getElementById("wst-worker-list");
  const workerCountDisplay = document.getElementById(
    "wst-worker-count-display",
  );
  const confirmLoginBtn = document.getElementById("wst-confirm-login-btn");
  const cancelLoginBtn = document.getElementById("wst-cancel-login-btn");

  // Live Crew Modal Elements
  const liveCrewModal = document.getElementById("wst-live-crew-modal");
  const liveCrewInput = document.getElementById("wst-live-crew-input");
  const liveCrewAddBtn = document.getElementById("wst-live-crew-add-btn");
  const liveCrewListContainer = document.getElementById("wst-live-crew-list");
  const liveCrewSaveBtn = document.getElementById("wst-live-crew-save");
  const liveCrewCancelBtn = document.getElementById("wst-live-crew-cancel");

  // Confirm Modal
  const confirmModal = document.getElementById("wst-confirm-modal");
  const confirmYesBtn = document.getElementById("wst-confirm-yes");
  const confirmNoBtn = document.getElementById("wst-confirm-no");

  // End Shift Modal
  const endShiftModal = document.getElementById("wst-end-shift-modal");
  const endShiftYesBtn = document.getElementById("wst-end-shift-yes");
  const endShiftNoBtn = document.getElementById("wst-end-shift-no");

  // Create Line Modal
  const createLineModal = document.getElementById("wst-create-line-modal");
  const createLineInput = document.getElementById("wst-new-line-input");
  const createLineConfirmBtn = document.getElementById(
    "wst-create-line-confirm",
  );
  const createLineCancelBtn = document.getElementById("wst-create-line-cancel");

  // History
  const historyList = document.getElementById("wst-history-list");
  const sessionCount = document.getElementById("wst-session-count");

  // =========================================================================
  // 0. TOAST NOTIFICATION SYSTEM (Replacement for Alerts)
  // =========================================================================

  function showToast(message, type = "info") {
    // Inject Styles if not present
    if (!document.getElementById("wst-toast-styles")) {
      const style = document.createElement("style");
      style.id = "wst-toast-styles";
      style.innerHTML = `
                .wst-toast {
                    position: fixed; top: 20px; right: 20px; z-index: 10000;
                    padding: 12px 20px; border-radius: 8px; color: white;
                    font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    display: flex; align-items: center; gap: 10px;
                    animation: slideInToast 0.3s ease-out; font-family: sans-serif;
                }
                @keyframes slideInToast {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .wst-error-shake { animation: shakeError 0.4s; }
                @keyframes shakeError {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
            `;
      document.head.appendChild(style);
    }

    const toast = document.createElement("div");
    toast.className = "wst-toast";

    const colors = {
      success: "#10b981",
      error: "#ef4444",
      warning: "#f59e0b",
      info: "#3b82f6",
    };
    toast.style.backgroundColor = colors[type] || colors.info;

    const icons = {
      success: "<i class='bx bx-check-circle'></i>",
      error: "<i class='bx bx-x-circle'></i>",
      warning: "<i class='bx bx-error'></i>",
      info: "<i class='bx bx-info-circle'></i>",
    };

    toast.innerHTML = `${icons[type] || icons.info} <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
      toast.style.transition = "all 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // =========================================================================
  // 1. INITIALIZATION & STATE RESTORATION
  // =========================================================================

  async function init() {
    console.log("WST V9.0 (Strict Pallet Only): Initializing...");

    setupEventListeners();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      currentUserEmail = user.email;
    }

    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      try {
        const sessionData = JSON.parse(savedSession);
        await attemptRestoreSession(sessionData);
        return;
      } catch (e) {
        console.error("Session restore failed", e);
        localStorage.removeItem(SESSION_KEY);
      }
    }

    await checkCloudForActiveSession();
  }

  async function checkCloudForActiveSession() {
    if (!currentUserEmail) {
      showSelectionView();
      return;
    }

    const { data: myLines, error } = await supabase
      .from("warehouse_lines")
      .select("*")
      .eq("status", "busy")
      .eq("owner_email", currentUserEmail);

    if (myLines && myLines.length > 0) {
      const line = myLines[0];
      await recoverSessionFromCloud(line);
    } else {
      showSelectionView();
    }
  }

  async function attemptRestoreSession(sessionData) {
    // 1. Get fresh data from Supabase
    const { data: lineData, error } = await supabase
      .from("warehouse_lines")
      .select("*")
      .eq("id", sessionData.lineId)
      .single();

    if (error || !lineData) {
      localStorage.removeItem(SESSION_KEY);
      showSelectionView();
      return;
    }

    if (
      currentUserEmail &&
      lineData.owner_email &&
      lineData.owner_email.toLowerCase() !== currentUserEmail.toLowerCase()
    ) {
      localStorage.removeItem(SESSION_KEY);
      await checkCloudForActiveSession();
      return;
    }

    if (lineData.status !== "busy") {
      localStorage.removeItem(SESSION_KEY);
      showSelectionView();
      return;
    }

    // Hydrate State
    let teamArr =
      lineData.current_team ||
      (lineData.current_operator ? [lineData.current_operator] : []);
    let wCount = lineData.worker_count || 1;

    state.line = {
      id: lineData.id,
      name: lineData.line_name,
      team: teamArr,
      worker_count: wCount,
    };

    let activeLog = null;
    try {
      const { data, error: logError } = await supabase
        .from("production_log")
        .select("*, production_products(*)")
        .eq("line_id", state.line.id)
        .eq("status", "in_progress")
        .maybeSingle();

      if (!logError && data) {
        activeLog = data;
      }
    } catch (e) {
      console.warn("Error fetching active log:", e);
    }

    enterDashboardUI();

    if (activeLog) {
      await restoreActivePallet(activeLog);
    } else {
      resetDashboardState();
    }

    loadHistoryTimeline();
  }

  async function restoreActivePallet(logEntry) {
    state.pallet = {
      id: logEntry.id,
      qr_id: logEntry.pallet_qr_id,
      start_time: new Date(logEntry.start_time),
      is_paused: logEntry.is_paused || false,
      total_pause_seconds: logEntry.total_pause_seconds || 0,
    };

    state.product = logEntry.production_products;

    // Restore Ticket Context
    if (logEntry.job_ticket_id) {
      try {
        const { data: ticketData } = await supabase
          .from("job_tickets")
          .select("*")
          .eq("id", logEntry.job_ticket_id)
          .single();

        if (ticketData) {
          const { count } = await supabase
            .from("production_log")
            .select("id", { count: "exact" })
            .eq("job_ticket_id", logEntry.job_ticket_id)
            .in("status", ["waiting_for_scan", "completed", "shipped"]);

          state.ticket = {
            id: ticketData.id,
            target: ticketData.target_pallets,
            current: count || 0,
            order_ref: ticketData.order_ref,
          };
          updateTicketProgressUI();
        }
      } catch (err) {
        console.warn("Could not restore ticket context", err);
      }
    }

    // Use the Dynamic Target if available, else calculate base
    if (state.product) {
      if (logEntry.current_target_seconds) {
        updateScorecardsWithNewTarget(logEntry.current_target_seconds);
      } else {
        const logWorkerCount = logEntry.worker_count || state.line.worker_count;
        updateScorecardsBase(state.product, logWorkerCount);
      }
    }

    scanTicketBtn.disabled = true;
    startBtn.disabled = false; // Enabled because it acts as Pause/Resume
    finishBtn.disabled = false;
    printBtn.disabled = true;

    if (state.pallet.is_paused) {
      updateActionButtonsState("paused");
      statusMsg.innerHTML = `<span style="color:var(--wst-warning)"><i class='bx bx-pause'></i> PAUSED</span> - Resume to continue.`;
      cardRealTime.textContent = "PAUSED";
    } else {
      updateActionButtonsState("running");
      statusMsg.innerHTML = `<span style="color:var(--wst-success)">Running:</span> Processing ${state.product.name}...`;
      startRealTimeTimer(
        state.pallet.start_time,
        state.pallet.total_pause_seconds,
      );
    }
  }

  // =========================================================================
  // 2. VIEW MANAGEMENT & REALTIME SYNC
  // =========================================================================

  function setupSelectionRealtime() {
    if (selectionSubscription) return;

    selectionSubscription = supabase
      .channel("grid-view-global")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "warehouse_lines" },
        (payload) => {
          loadLinesGrid();
        },
      )
      .subscribe();
  }

  function setupLineRealtime(lineId) {
    if (lineSubscription) {
      supabase.removeChannel(lineSubscription);
    }

    lineSubscription = supabase
      .channel(`line-sync-${lineId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "warehouse_lines",
          filter: `id=eq.${lineId}`,
        },
        (payload) => {
          const newData = payload.new;
          if (newData.status === "available") {
            showToast("Session ended from another device.", "info");
            localStorage.removeItem(SESSION_KEY);
            setTimeout(() => {
              location.reload();
            }, 2000);
          }
        },
      )
      .subscribe();
  }

  // --- REALTIME PALLET SYNC (FOR DASHBOARD) ---
  function setupPalletRealtime(lineId) {
    if (palletSubscription) {
      supabase.removeChannel(palletSubscription);
    }

    palletSubscription = supabase
      .channel(`pallet-sync-dashboard-${lineId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "production_log",
          filter: `line_id=eq.${lineId}`,
        },
        async (payload) => {
          const { eventType, new: newRecord } = payload;

          if (eventType === "INSERT" && newRecord.status === "in_progress") {
            if (!state.pallet) {
              const { data: fullLog } = await supabase
                .from("production_log")
                .select("*, production_products(*)")
                .eq("id", newRecord.id)
                .single();
              if (fullLog) {
                showToast("Process started on another device.", "success");
                restoreActivePallet(fullLog);
              }
            }
          }

          if (
            eventType === "UPDATE" &&
            state.pallet &&
            state.pallet.id === newRecord.id
          ) {
            if (newRecord.status !== "in_progress") {
              showToast("Pallet finished/scanned remotely.", "info");
              
              // NOTE: This listener handles the UI count increment to avoid duplicates
              if (state.ticket) {
                state.ticket.current++;
                updateTicketProgressUI();
              }
              resetDashboardState();
              loadHistoryTimeline();
              return;
            }

            const isNowPaused = newRecord.is_paused;
            state.pallet.is_paused = isNowPaused;
            state.pallet.total_pause_seconds = newRecord.total_pause_seconds;

            if (
              newRecord.current_target_seconds &&
              newRecord.current_target_seconds !==
                state.pallet.current_target_seconds
            ) {
              updateScorecardsWithNewTarget(newRecord.current_target_seconds);
            }

            if (isNowPaused) {
              updateActionButtonsState("paused");
              statusMsg.innerHTML = `<span style="color:var(--wst-warning)"><i class='bx bx-pause'></i> PAUSED</span> - Remote Pause.`;
              cardRealTime.textContent = "PAUSED";
              stopTimer();
            } else {
              updateActionButtonsState("running");
              statusMsg.innerHTML = `<span style="color:var(--wst-success)">Running:</span> Pallet in progress...`;
              startRealTimeTimer(
                new Date(newRecord.start_time),
                newRecord.total_pause_seconds,
              );
            }
          }
        },
      )
      .subscribe();
  }

  function showSelectionView() {
    loadingOverlay.style.display = "none";

    viewDashboard.classList.remove("active");
    viewDashboard.classList.add("hidden");
    viewSelection.classList.remove("hidden");
    viewSelection.classList.add("active");

    if (lineSubscription) {
      supabase.removeChannel(lineSubscription);
      lineSubscription = null;
    }

    if (palletSubscription) {
      supabase.removeChannel(palletSubscription);
      palletSubscription = null;
    }

    loadLinesGrid();
    setupSelectionRealtime();
  }

  function enterDashboardUI() {
    loadingOverlay.style.display = "none";

    viewSelection.classList.remove("active");
    viewSelection.classList.add("hidden");
    viewDashboard.classList.remove("hidden");
    viewDashboard.classList.add("active");

    if (selectionSubscription) {
      supabase.removeChannel(selectionSubscription);
      selectionSubscription = null;
    }

    updateHeaderUI();

    if (state.line && state.line.id) {
      setupLineRealtime(state.line.id);
      setupPalletRealtime(state.line.id);
    }
  }

  function updateHeaderUI() {
    dashTitle.textContent = state.line.name;

    if (state.line.worker_count > 1) {
      dashOp.innerHTML = `${state.line.worker_count} Workers <i class='bx bx-info-circle' style="font-size:0.8rem"></i>`;
      dashOp.title = state.line.team.join(", ");
    } else {
      dashOp.textContent = state.line.team[0] || "Unknown";
    }
  }

  // =========================================================================
  // 3. TEAM MANAGEMENT LOGIC
  // =========================================================================

  function addWorkerToTeam() {
    const name = workerInput.value.trim();
    if (!name) return;

    if (currentTeamList.some((w) => w.toLowerCase() === name.toLowerCase())) {
      showToast("Worker already in list.", "error");
      return;
    }

    currentTeamList.push(name);
    workerInput.value = "";
    workerInput.focus();
    renderTeamList();
  }

  window.wstRemoveWorker = function (index) {
    currentTeamList.splice(index, 1);
    renderTeamList();
  };

  function renderTeamList() {
    workerCountDisplay.textContent = currentTeamList.length;
    confirmLoginBtn.disabled = currentTeamList.length === 0;

    workerListContainer.innerHTML = "";

    if (currentTeamList.length === 0) {
      workerListContainer.innerHTML = `
                <div style="padding:1rem; text-align:center; color:var(--wst-text-light); font-size:0.9rem; margin-top: 2rem;">
                    No workers assigned yet.<br>Add at least one to start.
                </div>`;
      return;
    }

    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";
    ul.style.margin = "0";

    currentTeamList.forEach((worker, index) => {
      const li = document.createElement("li");
      li.style.padding = "10px 15px";
      li.style.borderBottom = "1px solid var(--wst-border)";
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";
      li.style.background = "var(--wst-card-bg)";

      li.innerHTML = `
                <span style="font-weight:500;"><i class='bx bx-user' style="margin-right:8px; color:var(--wst-text-light);"></i> ${worker}</span>
                <i class='bx bx-x' style="cursor:pointer; color:var(--wst-danger); font-size:1.2rem; padding:4px;" onclick="wstRemoveWorker(${index})"></i>
            `;
      ul.appendChild(li);
    });
    workerListContainer.appendChild(ul);
  }

  // --- LIVE CREW MODAL LOGIC ---
  function openLiveCrewModal() {
    if (!state.pallet) {
      showToast("Start a process first to edit crew.", "info");
      return;
    }
    currentLiveTeamList = [...state.line.team];
    liveCrewModal.classList.remove("hidden");
    liveCrewInput.value = "";
    renderLiveTeamList();
  }

  function addLiveWorker() {
    const name = liveCrewInput.value.trim();
    if (!name) return;
    if (
      currentLiveTeamList.some((w) => w.toLowerCase() === name.toLowerCase())
    ) {
      showToast("Worker already in list.", "error");
      return;
    }
    currentLiveTeamList.push(name);
    liveCrewInput.value = "";
    liveCrewInput.focus();
    renderLiveTeamList();
  }

  window.wstRemoveLiveWorker = function (index) {
    currentLiveTeamList.splice(index, 1);
    renderLiveTeamList();
  };

  function renderLiveTeamList() {
    liveCrewListContainer.innerHTML = "";

    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";

    currentLiveTeamList.forEach((worker, index) => {
      const li = document.createElement("li");
      li.style.padding = "10px 15px";
      li.style.borderBottom = "1px solid var(--wst-border)";
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";

      li.innerHTML = `
                <span>${worker}</span>
                <i class='bx bx-trash' style="cursor:pointer; color:var(--wst-danger);" onclick="wstRemoveLiveWorker(${index})"></i>
            `;
      ul.appendChild(li);
    });
    liveCrewListContainer.appendChild(ul);
  }

  async function saveCrewModification() {
    const newCount = currentLiveTeamList.length;
    if (newCount === 0) return showToast("Crew cannot be empty", "error");

    loadingOverlay.style.display = "flex";
    liveCrewModal.classList.add("hidden");

    const { data, error } = await supabase.rpc("update_crew_size", {
      p_log_id: state.pallet.id,
      p_new_crew_size: newCount,
      p_new_team_members: currentLiveTeamList,
    });

    loadingOverlay.style.display = "none";

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Crew updated & Target Recalculated!", "success");
    state.line.team = [...currentLiveTeamList];
    state.line.worker_count = newCount;

    updateHeaderUI();
    updateScorecardsWithNewTarget(data.new_target);
  }

  // =========================================================================
  // 4. LINE SELECTION & LOGIN FLOW
  // =========================================================================

  async function loadLinesGrid() {
    linesGrid.innerHTML =
      '<div class="wst-spinner"><i class="bx bx-loader-alt bx-spin"></i></div>';

    const { data: lines } = await supabase
      .from("warehouse_lines")
      .select("*")
      .order("id");

    linesGrid.innerHTML = "";

    if (!lines || lines.length === 0) {
      linesGrid.innerHTML = "<p>No lines defined.</p>";
      return;
    }

    lines.forEach((line) => {
      const isBusy = line.status === "busy";
      const isMyLine = isBusy && line.owner_email === currentUserEmail;

      const card = document.createElement("div");
      card.className = `wst-line-card ${isBusy ? "busy" : "available"}`;

      let iconClass = isBusy ? "bx-error-circle" : "bx-check-circle";
      let statusLabel = isBusy ? "OCCUPIED" : "AVAILABLE";

      if (isMyLine) {
        statusLabel = "YOUR SESSION (CLICK TO RESUME)";
        card.style.borderColor = "var(--wst-primary)";
      }

      let opInfo = "";
      if (isBusy) {
        const count = line.worker_count || 1;
        const label =
          count > 1 ? `${count} Workers` : line.current_operator || "Unknown";
        opInfo = `<div style="margin-top:0.5rem; font-size:0.9rem; color:var(--wst-danger)">${label}</div>`;
      }

      card.innerHTML = `
                <div class="line-icon"><i class='bx ${iconClass}'></i></div>
                <div class="line-name">${line.line_name}</div>
                <span class="status-text">${statusLabel}</span>
                ${opInfo}
            `;

      if (!isBusy) {
        card.onclick = () => promptLogin(line);
      } else if (isMyLine) {
        card.style.cursor = "pointer";
        card.onclick = () => recoverSessionFromCloud(line);
      } else {
        card.style.opacity = "0.5";
        card.style.cursor = "not-allowed";
        card.onclick = () =>
          showToast(
            `Access Denied. Locked by: ${line.owner_email || "Another User"}`,
            "error",
          );
      }

      linesGrid.appendChild(card);
    });
  }

  function promptLogin(line) {
    pendingLineSelection = line;
    document.getElementById("wst-selected-line-display").textContent =
      line.line_name;
    currentTeamList = [];
    workerInput.value = "";
    renderTeamList();
    loginOverlay.classList.remove("hidden");
    workerInput.focus();
  }

  async function confirmTeamLogin() {
    if (currentTeamList.length === 0) {
      showToast("Add at least one worker.", "error");
      return;
    }

    const { data: check } = await supabase
      .from("warehouse_lines")
      .select("status")
      .eq("id", pendingLineSelection.id)
      .single();

    if (check && check.status === "busy") {
      showToast("Too late! Someone else just took this line.", "error");
      loginOverlay.classList.add("hidden");
      loadLinesGrid();
      return;
    }

    loadingOverlay.style.display = "flex";

    const mainOp = currentTeamList[0];
    const count = currentTeamList.length;

    const { error } = await supabase
      .from("warehouse_lines")
      .update({
        status: "busy",
        current_operator: mainOp,
        current_team: currentTeamList,
        worker_count: count,
        owner_email: currentUserEmail,
      })
      .eq("id", pendingLineSelection.id);

    if (error) {
      console.error("Login Error:", error);
      showToast("Error assigning line.", "error");
      loadingOverlay.style.display = "none";
      return;
    }

    const sessionData = {
      lineId: pendingLineSelection.id,
      team: currentTeamList,
      count: count,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

    loginOverlay.classList.add("hidden");
    init();
  }

  async function recoverSessionFromCloud(line) {
    loadingOverlay.style.display = "flex";
    showToast("Recovering session...", "success");

    const sessionData = {
      lineId: line.id,
      team:
        line.current_team ||
        (line.current_operator ? [line.current_operator] : []),
      count: line.worker_count || 1,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    await attemptRestoreSession(sessionData);
  }

  // =========================================================================
  // 5. DASHBOARD LOGIC (JOB TICKET & SCANNING)
  // =========================================================================

  function resetDashboardState() {
    stopTimer();
    state.pallet = null;

    if (state.ticket) {
      updateTicketProgressUI();

      if (state.ticket.current >= state.ticket.target) {
        // Job Complete
        state.ticket = null;
        state.product = null;
        cardName.textContent = "--";
        cardProgress.textContent = "Job Completed";

        scanTicketBtn.disabled = false;
        scanTicketBtn.classList.remove("completed-step");
        startBtn.disabled = true;

        statusMsg.innerHTML =
          "<span style='color:var(--wst-success)'>Job Done.</span> Scan next ticket.";
      } else {
        // Job Active
        scanTicketBtn.disabled = true;
        startBtn.disabled = false;
        statusMsg.innerHTML =
          "Idle - Ready for next pallet (" +
          state.ticket.current +
          "/" +
          state.ticket.target +
          ")";

        if (state.product) {
          cardName.textContent = state.product.name;
        }
      }
    } else {
      // No Active Ticket
      cardName.textContent = "--";
      scanTicketBtn.disabled = false;
      startBtn.disabled = true;
      statusMsg.innerHTML = "Idle - Waiting for ticket scan...";
      updateActionButtonsState("idle");
    }

    cardRealTime.textContent = "00:00:00";
    cardRealTime.parentElement.classList.remove("active-pulse");
    finishBtn.disabled = true;
    printBtn.disabled = true;

    if (!startBtn.disabled) {
      updateActionButtonsState("idle");
    }
  }

  function updateActionButtonsState(status) {
    const btn = startBtn;
    btn.className = "wst-action-btn";

    if (status === "idle") {
      btn.innerHTML = `<i class='bx bx-play-circle'></i> Start Process`;
      btn.classList.add("btn-start");
      btn.disabled = !(state.ticket && state.product);
      btn.onclick = handleStart;
      finishBtn.disabled = true;
      document.body.classList.remove("is-paused-mode");
    } else if (status === "running") {
      btn.innerHTML = `<i class='bx bx-pause-circle'></i> Pause`;
      btn.classList.add("btn-warning");
      btn.disabled = false;
      btn.onclick = () => handlePauseToggle("pause");
      finishBtn.disabled = false;
      document.body.classList.remove("is-paused-mode");
    } else if (status === "paused") {
      btn.innerHTML = `<i class='bx bx-play-circle'></i> Resume`;
      btn.classList.add("btn-success");
      btn.disabled = false;
      btn.onclick = () => handlePauseToggle("resume");
      finishBtn.disabled = true;
      document.body.classList.add("is-paused-mode");
    }
  }

  // --- TICKET SCAN HANDLING (STRICT SECURITY & MATH VALIDATION) ---

  function openTicketModal() {
    ticketModal.classList.remove("hidden");
    ticketInput.value = "";
    ticketError.style.display = "none";
    ticketInput.focus();
  }

  // [MODIFIED V8.7] - Updated with STRICT Math Validation
  async function handleTicketScan(qrRaw) {
    if (!qrRaw) return;
    ticketError.style.display = "none";
    ticketInput.disabled = true;

    try {
      // 1. Parsing
      let ticketData;
      try {
        ticketData = JSON.parse(qrRaw);
      } catch (e) {
        throw new Error("Invalid QR Format. Is this a Job Ticket?");
      }

      if (ticketData.type !== "job_ticket") {
        throw new Error("This is not a Job Ticket QR.");
      }

      // 2. CHECK TICKET STATUS IN DB
      const { data: dbTicket, error: dbError } = await supabase
        .from("job_tickets")
        .select("id, status, line_id")
        .eq("id", ticketData.ticket_id)
        .single();

      if (dbError || !dbTicket) {
        throw new Error("Ticket not found in system.");
      }

      // 3. SECURITY: STATUS
      if (dbTicket.status === "completed") {
        throw new Error("⛔ TICKET COMPLETED. This job is already done.");
      }
      if (dbTicket.status === "cancelled") {
        throw new Error("⛔ TICKET CANCELLED by supervisor.");
      }

      // 4. SECURITY: LINE OWNERSHIP
      if (dbTicket.line_id && dbTicket.line_id !== state.line.id) {
        throw new Error(
          `⛔ WRONG LINE. This ticket is for Line ${dbTicket.line_id}.`,
        );
      }

      // 5. SECURITY: ANTI-COLLISION
      const { data: activeSessions } = await supabase
        .from("production_log")
        .select("id")
        .eq("job_ticket_id", ticketData.ticket_id)
        .eq("status", "in_progress");

      if (activeSessions && activeSessions.length > 0) {
        throw new Error(
          "⛔ COLLISION. Someone is already working on this ticket.",
        );
      }

      // 6. *** STRICT MATH VALIDATION (Added V8.7) ***
      // Verify actual completed/waiting logs to prevent over-production
      const { count: realFinishedCount, error: countError } = await supabase
        .from("production_log")
        .select("id", { count: "exact", head: true })
        .eq("job_ticket_id", ticketData.ticket_id)
        .in("status", ["waiting_for_scan", "completed", "shipped", "adjusted"]);

      if (countError) throw new Error("Network error verifying ticket count.");

      const target = parseInt(ticketData.target);
      
      if (realFinishedCount >= target) {
          throw new Error(`⛔ TICKET FULL: All ${target} pallets are already processed.`);
      }

      // --- IF ALL CHECKS PASS, LOAD TICKET ---

      const { data: product, error: prodError } = await supabase
        .from("production_products")
        .select("*")
        .eq("id", ticketData.product_id)
        .single();

      if (prodError || !product) {
        throw new Error("Product associated with ticket not found.");
      }

      state.product = product;
      state.ticket = {
        id: ticketData.ticket_id,
        order_ref: ticketData.order,
        target: target,
        current: realFinishedCount || 0,
        line_restriction: ticketData.line,
      };

      updateDashboardWithTicket();
      ticketModal.classList.add("hidden");
      showToast("Ticket Authorized. Ready to start.", "success");
    } catch (err) {
      console.error(err);
      ticketError.textContent = err.message;
      ticketError.style.display = "block";

      const box = document.querySelector(".wst-login-box");
      box.classList.add("wst-error-shake");
      setTimeout(() => box.classList.remove("wst-error-shake"), 400);

      ticketInput.value = "";
      ticketInput.focus();
    } finally {
      ticketInput.disabled = false;
      if (!ticketModal.classList.contains("hidden")) {
        setTimeout(() => ticketInput.focus(), 100);
      }
    }
  }

  function updateDashboardWithTicket() {
    if (!state.ticket || !state.product) return;

    cardName.textContent = state.product.name;
    cardName.title = state.product.name;

    const totalBaseSeconds =
      state.product.cases_per_pallet * state.product.seconds_per_case;
    const safeCount = state.line.worker_count > 0 ? state.line.worker_count : 1;
    const adjustedSeconds = Math.ceil(totalBaseSeconds / safeCount);
    renderTimeCard(adjustedSeconds);

    updateTicketProgressUI();

    updateActionButtonsState("idle");

    scanTicketBtn.classList.add("completed-step");
    scanTicketBtn.disabled = true;

    statusMsg.innerHTML = `<span style="color:var(--wst-primary)">Ready:</span> ${state.product.sku} loaded. Press Start.`;
  }

  function updateTicketProgressUI() {
    if (state.ticket) {
      cardProgress.innerHTML = `<span style="font-size:1.4rem; color:var(--wst-primary)">${state.ticket.current}</span> / ${state.ticket.target} <span style="font-size:0.8rem">Pallets</span>`;
      if (state.ticket.current >= state.ticket.target) {
        cardProgress.innerHTML += ` <i class='bx bxs-check-circle' style="color:var(--wst-success)"></i>`;
      }
    }
  }

  function updateScorecardsWithNewTarget(newTargetSeconds) {
    if (state.product) {
      cardName.textContent = state.product.name;
    }
    renderTimeCard(newTargetSeconds);
  }

  function updateScorecardsBase(p, workerCount) {
    cardName.textContent = p.name;
    const totalBaseSeconds = p.cases_per_pallet * p.seconds_per_case;
    const safeCount = workerCount > 0 ? workerCount : 1;
    const adjustedSeconds = Math.ceil(totalBaseSeconds / safeCount);
    renderTimeCard(adjustedSeconds);
  }

  function renderTimeCard(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    cardStdTime.innerHTML = `${h}h ${m}m`;
  }

  // =========================================================================
  // 6. START / PAUSE / FINISH LOGIC
  // =========================================================================

  async function handleStart() {
    if (!state.product || !state.ticket) {
      showToast("Please scan a job ticket first.", "error");
      return;
    }
    if (isLoadingAction) return;

    isLoadingAction = true;
    scanTicketBtn.disabled = true;
    startBtn.disabled = true;

    const qrId = `PLT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    statusMsg.innerHTML = "Starting process...";

    const baseSeconds =
      state.product.cases_per_pallet * state.product.seconds_per_case;
    const initialCrew = state.line.worker_count;
    const initialTarget = Math.ceil(baseSeconds / initialCrew);

    const { data, error } = await supabase.rpc("start_production_safe", {
      p_line_id: state.line.id,
      p_product_id: state.product.id,
      p_operator_name: state.line.team[0] || "Unknown",
      p_team_members: state.line.team,
      p_worker_count: initialCrew,
      p_qr_id: qrId,
      p_target_seconds: initialTarget,
      p_job_ticket_id: state.ticket.id,
    });

    isLoadingAction = false;
    startBtn.disabled = false;

    if (error) {
      console.error("Start Error:", error);
      
      // Handle Specific 23505 Error (Duplicate Line ID)
      if (error.code === "23505" || error.message.includes("unique")) {
          showToast(
            "⛔ LINE BLOCKED: Previous pallet is still 'Waiting for Scan'.",
            "error"
          );
          console.warn("DB CONSTRAINT ISSUE: Please update your index to: CREATE UNIQUE INDEX idx_unique_active_line ON production_log (line_id) WHERE status = 'in_progress';");
      } 
      else if (error.message.includes("Line is busy")) {
        showToast(
          "⚠️ Sync Error: Another device already started this line.",
          "error",
        );
        setTimeout(() => location.reload(), 2000);
      } else {
        showToast("Error starting process: " + error.message, "error");
      }
      
      if(state.ticket) scanTicketBtn.disabled = true;
      return;
    }

    // --- [MODIFIED BY ASSISTANT] ---
    // Puente de conexión para actualizar el estatus de la orden principal.
    // Esto asegura que la orden pase a 'production_in_progress' al comenzar.
    if (state.ticket && state.ticket.order_ref) {
        updateOrderStatusToInProgress(state.ticket.order_ref);
    }
    // --- [END MODIFICATION] ---

    state.pallet = {
      id: data.id,
      qr_id: qrId,
      start_time: new Date(data.start_time),
      is_paused: false,
      total_pause_seconds: 0,
    };
    statusMsg.innerHTML = `<span style="color:var(--wst-success)">Running:</span> Pallet in progress...`;

    updateActionButtonsState("running");
    startRealTimeTimer(new Date(data.start_time), 0);
  }

  // --- [MODIFIED BY ASSISTANT] ---
  // Función auxiliar que recibe el número de orden y hace el UPDATE en la BD
  // sólo si la orden se encontraba en status "material_received" o "production_planned".
  async function updateOrderStatusToInProgress(orderRef) {
      try {
          const { data: currentOrder } = await supabase
            .from('client_orders')
            .select('status')
            .eq('unique_order_code', orderRef)
            .single();
            
          if (currentOrder && (currentOrder.status === 'production_planned' || currentOrder.status === 'material_received')) {
              await supabase
                .from('client_orders')
                .update({ status: 'production_in_progress' })
                .eq('unique_order_code', orderRef);
          }
      } catch (e) {
          console.warn("Status bridge update failed", e);
      }
  }
  // --- [END MODIFICATION] ---

  async function handlePauseToggle(action) {
    if (!state.pallet) return;
    if (isLoadingAction) return;

    isLoadingAction = true;
    startBtn.disabled = true;
    startBtn.style.opacity = "0.7";
    loadingOverlay.style.display = "flex";

    const { error } = await supabase.rpc("toggle_pause", {
      p_log_id: state.pallet.id,
      p_action: action,
    });

    loadingOverlay.style.display = "none";
    isLoadingAction = false;
    startBtn.disabled = false;
    startBtn.style.opacity = "1";

    if (error) {
      console.error(error);
      showToast(`Error: ${error.message}`, "error");
      return;
    }

    if (action === "pause") {
      state.pallet.is_paused = true;
      stopTimer();
      updateActionButtonsState("paused");
      statusMsg.innerHTML = `<span style="color:var(--wst-warning)"><i class='bx bx-pause'></i> PAUSED</span> - Resume to continue.`;
      cardRealTime.textContent = "PAUSED";
    } else {
      state.pallet.is_paused = false;
      const { data: freshLog } = await supabase
        .from("production_log")
        .select("total_pause_seconds")
        .eq("id", state.pallet.id)
        .single();
      const pauseTotal = freshLog ? freshLog.total_pause_seconds : 0;
      state.pallet.total_pause_seconds = pauseTotal;
      updateActionButtonsState("running");
      statusMsg.innerHTML = `<span style="color:var(--wst-success)">Running:</span> Pallet in progress...`;
      startRealTimeTimer(state.pallet.start_time, pauseTotal);
    }
  }

  function handleFinishRequest() {
    if (!state.pallet) return;
    confirmModal.classList.remove("hidden");
  }

  // [MODIFIED V9.0] - FIXED: Removed "checkAndFinalizeOrder" call
  // Logic shifted to Scanner module. Workstation only logs pallet finish.
  async function executeFinishProcess() {
    confirmModal.classList.add("hidden");
    
    // --- STEP 1: CAPTURE DATA SNAPSHOT ---
    const opDisplay = state.line.worker_count > 1 
        ? `Team of ${state.line.worker_count}` 
        : (state.line.team[0] || "Unknown");
    
    const ticketRef = state.ticket ? `TKT-${state.ticket.id}` : "ADHOC";
    
    const safePrintData = {
        qr: state.pallet.qr_id,
        prod: state.product.name,
        op: opDisplay,
        date: new Date().toLocaleDateString(),
        ref: ticketRef
    };
    
    // --- STEP 2: CALCULATE PROJECTED COUNT (For DB Logic Only) ---
    const projectedCount = state.ticket ? (state.ticket.current + 1) : 0;

    finishBtn.disabled = true;
    stopTimer();
    const now = new Date();
    const durationSec =
      Math.floor((now - state.pallet.start_time) / 1000) -
      state.pallet.total_pause_seconds;

    const { error } = await supabase
      .from("production_log")
      .update({
        line_finish_time: now.toISOString(),
        final_time_seconds: durationSec,
        status: "waiting_for_scan", 
      })
      .eq("id", state.pallet.id);

    if (error) {
      showToast("Error saving finish time.", "error");
      finishBtn.disabled = false;
      return;
    }

    if (state.ticket) {
      // *** Auto-Close Ticket Check (Using Projected Count) ***
      if (projectedCount >= state.ticket.target) {
          const { error: ticketUpdateError } = await supabase
            .from('job_tickets')
            .update({ status: 'completed' })
            .eq('id', state.ticket.id);
            
          if(ticketUpdateError) {
              console.error("Failed to close ticket:", ticketUpdateError);
              showToast("Warning: Pallet done, but failed to close Ticket in DB.", "warning");
          } else {
              showToast("Job Ticket Completed & Closed!", "success");
          }
      } else {
          showToast("Pallet Recorded. Ready for next.", "success");
      }
      
      // Removed order finalization check here. It's now in the Scanner.
    }

    statusMsg.innerHTML = "Pallet Complete. Printing Label...";
    printBtn.disabled = false;
    
    // --- STEP 3: PRINT ---
    handlePrint(safePrintData);
  }

  // [MODIFIED V8.7] - Updated to accept Manual Data Snapshot
  function handlePrint(manualData = null) {
    // Priority: 1. Manual Snapshot (from finish process), 2. Current State (reprints)
    
    // Determine Data Source
    let dataToPrint = null;

    if (manualData) {
        // Option A: Use the safe snapshot passed from executeFinishProcess
        dataToPrint = manualData;
    } else if (state.pallet && state.product) {
        // Option B: Use current state (Standard Reprint / Active)
        const opDisplay = state.line.worker_count > 1
            ? `Team of ${state.line.worker_count}`
            : state.line.team[0];
        const ticketRef = state.ticket ? `TKT-${state.ticket.id}` : "ADHOC";
        
        dataToPrint = {
            qr: state.pallet.qr_id,
            prod: state.product.name,
            op: opDisplay,
            date: new Date().toLocaleDateString(),
            ref: ticketRef
        };
    } else {
        // No data available
        console.warn("Print aborted: No valid data found in snapshot or state.");
        return;
    }

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${dataToPrint.qr}`;
    const win = window.open("", "_blank", "width=400,height=550");

    win.document.write(`
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 20px; }
                    .action-btn { background: #0e2c4c; color: white; border: none; padding: 14px 24px; font-size: 16px; border-radius: 8px; cursor: pointer; margin: 10px; width: 80%; }
                    .close-btn { background: #e5e7eb; color: #333; }
                    @media print { .no-print { display: none !important; } body { padding: 0; margin: 0; } }
                </style>
            </head>
            <body>
                <h3 style="margin-bottom:5px;">GOLDMEX WAREHOUSE</h3>
                <p style="font-size:12px; margin-top:0;">${state.line.name} | ${dataToPrint.op}</p>
                <hr style="margin:15px 0;">
                <h2 style="margin:10px 0;">${dataToPrint.prod}</h2>
                <p style="font-size:10px; color:#666;">REF: ${dataToPrint.ref}</p>
                <div style="margin:20px 0;"><img src="${qrUrl}" style="width:140px;"></div>
                <p style="font-family:monospace; font-size:18px; font-weight:bold;">${dataToPrint.qr}</p>
                <p style="font-size:12px;">${dataToPrint.date}</p>
                <div class="no-print" style="margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 20px;">
                    <button class="action-btn" onclick="window.print()">🖨️ Print Label</button>
                    <br>
                    <button class="action-btn close-btn" onclick="window.close()">Close Window</button>
                </div>
                <script>window.onload = function() { setTimeout(() => window.print(), 500); }</script>
            </body>
            </html>
        `);
    win.document.close();
    win.focus();

    // Only reset dashboard if we are NOT manually reprinting from history
    if(manualData) {
        loadHistoryTimeline();
    }
  }

  function handleEndShiftRequest() {
    if (state.pallet && state.pallet.id) {
      showToast("Cannot end shift active pallet. Finish it first.", "error");
      return;
    }
    endShiftModal.classList.remove("hidden");
  }

  async function executeEndShift() {
    endShiftModal.classList.add("hidden");
    loadingOverlay.style.display = "flex";
    await supabase
      .from("warehouse_lines")
      .update({
        status: "available",
        current_operator: null,
        current_team: [],
        worker_count: 1,
        owner_email: null,
      })
      .eq("id", state.line.id);

    localStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  async function handleCreateLine() {
    const name = createLineInput.value.trim();
    if (!name) return showToast("Please enter a line name.", "error");

    createLineModal.classList.add("hidden");
    loadingOverlay.style.display = "flex";
    const { error } = await supabase
      .from("warehouse_lines")
      .insert([{ line_name: name }]);

    if (error) showToast("Error creating line.", "error");
    else await loadLinesGrid();

    loadingOverlay.style.display = "none";
    createLineInput.value = "";
  }

  function startRealTimeTimer(startTimeObj, totalPauseSeconds = 0) {
    stopTimer();
    cardRealTime.parentElement.classList.add("highlight-card");

    state.timerInterval = setInterval(() => {
      const now = new Date();
      const diff = now - startTimeObj;
      const totalSecs = Math.floor(diff / 1000) - totalPauseSeconds;

      const validSecs = totalSecs > 0 ? totalSecs : 0;

      const hrs = Math.floor(validSecs / 3600);
      const mins = Math.floor((validSecs % 3600) / 60);
      const secs = validSecs % 60;
      const pad = (n) => n.toString().padStart(2, "0");
      cardRealTime.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = null;
    cardRealTime.parentElement.classList.remove("highlight-card");
  }

  async function loadHistoryTimeline() {
    const today = new Date().toISOString().split("T")[0];
    const { data: logs } = await supabase
      .from("production_log")
      .select(`*, production_products(name)`)
      .eq("line_id", state.line.id)
      .gte("start_time", `${today}T00:00:00`)
      .order("start_time", { ascending: false });
    renderTimeline(logs || []);
  }

  function renderTimeline(logs) {
    sessionCount.textContent = logs.length;
    historyList.innerHTML = "";
    if (logs.length === 0) {
      historyList.innerHTML = `
                <div id="wst-empty-history" class="empty-message">
                    <i class='bx bx-list-ul' style="font-size: 2rem; opacity: 0.5;"></i>
                    <p>No pallets processed today.</p>
                </div>`;
      return;
    }
    logs.forEach((log) => {
      const start = new Date(log.start_time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const end = log.line_finish_time
        ? new Date(log.line_finish_time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "...";
      const card = document.createElement("div");
      card.className = "wst-history-card";
      if (log.status === "in_progress")
        card.style.borderLeftColor = "var(--wst-warning)";
      else if (log.status === "waiting_for_scan")
        card.style.borderLeftColor = "var(--wst-success)";
      else card.style.borderLeftColor = "var(--wst-border)";

      card.innerHTML = `
                <div class="hist-header">
                    <span class="hist-id">${log.pallet_qr_id.split("-").pop()}</span>
                    <span>${log.status === "in_progress" ? "Running" : "Done"}</span>
                </div>
                <div class="hist-body">${log.production_products?.name || "Unknown Product"}</div>
                <div class="hist-footer">
                    <div class="hist-times">
                        <span class="time-range"><i class='bx bx-time'></i> ${start} - ${end}</span>
                    </div>
                    ${log.status !== "in_progress" ? `<button class="btn-reprint-sm" title="Reprint"><i class='bx bxs-printer'></i></button>` : ""}
                </div>`;

      const reprintBtn = card.querySelector(".btn-reprint-sm");
      if (reprintBtn) {
        reprintBtn.onclick = () => {
          state.pallet = { qr_id: log.pallet_qr_id };
          state.product = { name: log.production_products?.name };
          handlePrint(); // Calls without arguments, triggers State fallback
        };
      }
      historyList.appendChild(card);
    });
  }

  function setupEventListeners() {
    if (addLineBtn)
      addLineBtn.onclick = () => {
        createLineModal.classList.remove("hidden");
        createLineInput.focus();
      };
    createLineCancelBtn.onclick = () => createLineModal.classList.add("hidden");
    createLineConfirmBtn.onclick = handleCreateLine;

    cancelLoginBtn.onclick = () => loginOverlay.classList.add("hidden");
    confirmLoginBtn.onclick = confirmTeamLogin;

    addWorkerBtn.onclick = addWorkerToTeam;
    workerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addWorkerToTeam();
    });

    releaseBtn.onclick = handleEndShiftRequest;

    scanTicketBtn.onclick = openTicketModal;
    cancelTicketBtn.onclick = () => ticketModal.classList.add("hidden");

    // Handle Ticket Scan on Enter
    ticketInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleTicketScan(e.target.value);
    });

    finishBtn.onclick = handleFinishRequest;
    
    // [MODIFIED V8.7] - Use cached data if available
    printBtn.onclick = () => handlePrint(); 

    confirmYesBtn.onclick = executeFinishProcess;
    confirmNoBtn.onclick = () => confirmModal.classList.add("hidden");

    endShiftYesBtn.onclick = executeEndShift;
    endShiftNoBtn.onclick = () => endShiftModal.classList.add("hidden");

    // NEW Live Edit
    if (editTeamTrigger) editTeamTrigger.onclick = openLiveCrewModal;
    liveCrewAddBtn.onclick = addLiveWorker;
    liveCrewInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addLiveWorker();
    });
    liveCrewCancelBtn.onclick = () => liveCrewModal.classList.add("hidden");
    liveCrewSaveBtn.onclick = saveCrewModification;
  }

  init();
})();