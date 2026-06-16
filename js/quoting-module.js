// js/quoting-module.js
(() => {
    if (document.body.dataset.quotingModuleInitialized === "true") {
        return;
    }
    document.body.dataset.quotingModuleInitialized = "true";
    console.log(
        "Sales & Quoting Module Initialized (v19 - Trinity Layout Fix)"
    );

    // SECTION 1: SUPABASE & CONFIGURATION
    if (typeof supabase === "undefined" || !supabase) {
        console.error("Supabase client not found in quoting-module.js.");
        return;
    }

    const PRODUCTS_TABLE = "products";
    const QUOTES_TABLE = "quotations";
    const PRODUCTS_BUCKET = "product-images";
    let currentUserSQ = null;
    let productsCache = [];
    let quotesHistoryCache = [];
    let currentConfirmCallback = null;

    let currentQuoteMode = "start";
    let activeMultiItemId = null;

    // --- Truck Capacity Limits ---
    const TRUCK_PALLET_LIMIT = 22;
    const TRUCK_WEIGHT_LIMIT_LBS = 43000;

    let currentQuote = {
        exchangeRate: 17.5,
        companyName: "",
        transport: { type: "none", name: "", cost: 0, margin: 0, price: 0 },
    };

    let currentMultiQuote = {
        companyName: "",
        items: [],
        transport: { type: "none", name: "", cost: 0, margin: 0, price: 0 },
        totals: null,
        exchangeRate: 17.5,
        truckCapacity: {
            totalWeightLbs: 0,
            totalPalletSpace: 0,
            weightPercent: 0,
            palletPercent: 0,
        },
    };

    let isCalculatingTransport = false;
    let productExplorerMode = "single";
    let selectedProductsForMulti = new Set();
    let activeUnitFilter = "all";

    // --- DOM Element Caching ---
    const manageProductsBtn = document.getElementById("sq-manage-products-btn");
    const tabButtons = document.querySelectorAll(".sq-tab-button");
    const tabContents = document.querySelectorAll(".sq-tab-content");

    const creatorTabContent = document.getElementById("qcf-creator-tab");
    const startView = document.getElementById("qcf-start-view");
    const singleItemView = document.getElementById("qcf-single-item-view");
    const multiItemView = document.getElementById("qcf-multi-item-view");

    const companyNameInput = document.getElementById("sq-company-name-input");
    const confirmCompanyBtn = document.getElementById("sq-confirm-company-btn");
    const choiceSingleCard = document.getElementById("sq-choice-single");
    const choiceMultiCard = document.getElementById("sq-choice-multi");
    const backToStartBtns = document.querySelectorAll(".qcf-back-to-start-btn");

    const productSearchInput = document.getElementById("sq-product-search-input");
    const exploreProductsBtn = document.getElementById("sq-explore-products-btn");
    const selectedProductDisplay = document.getElementById(
        "sq-selected-product-display"
    );
    const productImage = document.getElementById("sq-product-image");
    const productNameEl = document.getElementById("sq-product-name");
    const productSpecsEl = document.getElementById("sq-product-specs");
    const caseQuantityInput = document.getElementById("sq-case-quantity");
    const weightPerCaseEl = document.getElementById("sq-weight-per-case");
    const weightPerPalletEl = document.getElementById("sq-weight-per-pallet");
    const palletCaseCountEl = document.getElementById("sq-pallet-case-count");
    const costPerCaseInput = document.getElementById("sq-cost-per-case");
    const labelingCostInput = document.getElementById("sq-labeling-cost");
    const crossingDocsCostInput = document.getElementById(
        "sq-crossing-docs-cost"
    );
    const commissionPercentInput = document.getElementById(
        "sq-commission-percent"
    );
    const transportTypeSelect = document.getElementById("sq-transport-type");
    const transportNameInput = document.getElementById("sq-transport-name");
    const transportCostInput = document.getElementById("sq-transport-cost");
    const transportMarginInput = document.getElementById("sq-transport-margin");
    const transportPriceInput = document.getElementById("sq-transport-price");
    const quotePreviewContent = document.getElementById(
        "sq-quote-preview-content"
    );
    const saveQuoteBtn = document.getElementById("sq-save-quote-btn");
    const downloadPdfBtn = document.getElementById("sq-download-pdf-btn");

    const multiItemListContainer = document.getElementById("qcf-multi-item-list");
    const addMultiProductsBtn = document.getElementById(
        "qcf-multi-add-products-btn"
    );
    const multiFormPlaceholder = document.getElementById(
        "qcf-multi-form-placeholder"
    );
    const multiFormContainer = document.getElementById(
        "qcf-multi-form-container"
    );
    const multiFormProductTitle = document.getElementById(
        "qcf-multi-form-product-title"
    );
    const multiQuantityInput = document.getElementById("qcf-multi-quantity");
    const multiUnitSelector = document.getElementById("qcf-multi-unit-selector");
    const multiWeightPerCaseEl = document.getElementById(
        "qcf-multi-weight-per-case"
    );
    const multiWeightPerPalletEl = document.getElementById(
        "qcf-multi-weight-per-pallet"
    );
    const multiCostPerCaseDisplay = document.getElementById(
        "qcf-multi-cost-per-case-display"
    );
    const multiLabelingCostInput = document.getElementById(
        "qcf-multi-labeling-cost"
    );
    const multiCrossingDocsCostInput = document.getElementById(
        "qcf-multi-crossing-docs-cost"
    );
    const multiCommissionPercentInput = document.getElementById(
        "qcf-multi-commission-percent"
    );
    const saveMultiItemBtn = document.getElementById("qcf-confirm-item-btn");
    const saveFullQuoteBtn = document.getElementById("qcf-save-full-quote-btn");
    const multiTransportTypeSelect = document.getElementById(
        "qcf-multi-transport-type"
    );
    const multiTransportNameInput = document.getElementById(
        "qcf-multi-transport-name"
    );
    const multiTransportCostInput = document.getElementById(
        "qcf-multi-transport-cost"
    );
    const multiTransportMarginInput = document.getElementById(
        "qcf-multi-transport-margin"
    );
    const multiTransportPriceInput = document.getElementById(
        "qcf-multi-transport-price"
    );

    const truckCapacityDashboard = document.getElementById(
        "qcf-truck-capacity-dashboard"
    );
    const truckPalletBarFill = document.getElementById("truck-pallet-bar-fill");
    const truckPalletText = document.getElementById("truck-pallet-text");
    const truckWeightBarFill = document.getElementById("truck-weight-bar-fill");
    const truckWeightText = document.getElementById("truck-weight-text");

    const productsTableElement = document.getElementById("sq-products-table");
    const addNewProductBtn = document.getElementById("sq-add-new-product-btn");
    let productsDataTable;
    const historyTableElement = document.getElementById(
        "sq-quotes-history-table"
    );
    const histMonthSelect = document.getElementById("sq-hist-month");
    const histYearSelect = document.getElementById("sq-hist-year");
    const histUserSelect = document.getElementById("sq-hist-user");
    const applyFiltersBtn = document.getElementById("sq-apply-filters-btn");
    let historyDataTable;
    const productExplorerModal = document.getElementById(
        "sq-product-explorer-modal"
    );
    const productCardsContainer = document.getElementById(
        "sq-product-cards-container"
    );
    const addSelectedProductsBtn = document.getElementById(
        "sq-add-selected-products-btn"
    );
    const manageProductsModal = document.getElementById(
        "sq-manage-products-modal"
    );
    const viewQuoteModal = document.getElementById("sq-view-quote-modal");
    const viewQuoteBody = document.getElementById("sq-view-quote-body");
    const viewQuoteTitle = document.getElementById("sq-view-quote-title");
    const viewMultiQuoteModal = document.getElementById(
        "sq-view-multi-quote-modal"
    );
    const viewMultiQuoteBody = document.getElementById(
        "sq-view-multi-quote-body"
    );
    const viewMultiQuoteTitle = document.getElementById(
        "sq-view-multi-quote-title"
    );
    const downloadMultiPdfBtn = document.getElementById(
        "sq-download-multi-pdf-btn"
    );
    const downloadSinglePdfBtn = document.getElementById(
        "sq-download-single-pdf-btn"
    );
    const modalCloseBtns = document.querySelectorAll(".sq-modal-close-btn");
    const modalCancelBtns = document.querySelectorAll(".sq-modal-cancel-btn");
    const modalSearchInput = document.getElementById("sq-modal-search-input");
    const filterBtns = document.querySelectorAll(".sq-filter-btn");
    const productForm = document.getElementById("sq-product-form");
    const productModalTitle = document.getElementById("sq-product-modal-title");
    const productIdInput = document.getElementById("p-id");
    const productNameInput = document.getElementById("p-name");
    const costBaseInput = document.getElementById("p-costo-base");
    const productImageInput = document.getElementById("p-image");
    const currentImageEl = document.getElementById("p-current-image");
    const piecesPerCaseInput = document.getElementById("p-pieces-per-case");
    const valuePerPieceInput = document.getElementById("p-value-per-piece");
    const unitOfMeasureSelect = document.getElementById("p-unit-of-measure");
    const casesPerPalletInput = document.getElementById("p-cases-per-pallet");
    const palletsPerTruckInput = document.getElementById("p-pallets-per-truck");
    const packagingWeightInput = document.getElementById("p-packaging-weight");
    const caseWeightInput = document.getElementById("p-case-weight");
    const saveProductBtn = document.getElementById("sq-save-product-btn");
    const confirmModalElement = document.getElementById("sqCustomConfirmModal");
    const confirmTitleElement = document.getElementById("sqCustomConfirmTitle");
    const confirmMessageElement = document.getElementById(
        "sqCustomConfirmMessage"
    );
    const confirmOkBtn = document.getElementById("sqCustomConfirmOkBtn");
    const confirmCancelBtn = document.getElementById("sqCustomConfirmCancelBtn");
    const confirmCloseBtn = document.getElementById("sqCustomConfirmCloseBtn");

    // SECTION 2: CORE LOGIC & CALCULATIONS

    function showSQNotification(message, type = "info", duration = 4000) {
        const container = document.getElementById("customNotificationContainerSQ");
        if (!container) {
            console.error("Notification container not found!");
            return;
        }
        const notification = document.createElement("div");
        notification.className = `custom-notification-st ${type}`;
        let iconClass = "bx bx-info-circle";
        if (type === "success") iconClass = "bx bx-check-circle";
        if (type === "error") iconClass = "bx bx-x-circle";
        if (type === "warning") iconClass = "bx bx-error-circle";
        notification.innerHTML = `<i class='${iconClass}'></i><span>${message}</span>`;
        container.appendChild(notification);
        setTimeout(() => {
            notification.classList.add("show");
        }, 10);
        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, duration);
    }

    function switchView(viewName) {
        startView.style.display = "none";
        singleItemView.style.display = "none";
        multiItemView.style.display = "none";
        if (viewName === "start") {
            startView.style.display = "flex";
        } else if (viewName === "single") {
            singleItemView.style.display = "flex";
        } else if (viewName === "multi") {
            multiItemView.style.display = "flex";
        }
        currentQuoteMode = viewName;
    }

    function calculateCaseWeightLbs(product) {
        if (!product) return 0;
        const pieceWeightGrams = getPieceWeightInGrams(product);
        const totalPieceWeightGrams =
            pieceWeightGrams + (product.packaging_weight_g || 0);
        const caseContentWeightGrams =
            totalPieceWeightGrams * (product.pieces_per_case || 1);
        const caseWeightGrams =
            caseContentWeightGrams + (product.case_weight_g || 0);
        return caseWeightGrams * 0.00220462;
    }

    function getPieceWeightInGrams(product) {
        if (!product || typeof product.value_per_piece !== "number") return 0;
        const value = product.value_per_piece;
        const unit = product.unit_of_measure || "g";
        switch (unit) {
            case "g":
                return value;
            case "ml":
                return value;
            case "l":
                return value * 1000;
            default:
                return 0;
        }
    }

    function hardResetCreator() {
        companyNameInput.value = "";
        confirmCompanyBtn.disabled = false;
        companyNameInput.disabled = false;
        choiceSingleCard.classList.add("disabled");
        choiceMultiCard.classList.add("disabled");
        resetSingleQuoteCreator();
        resetMultiQuoteCreator();
        switchView("start");
    }

    function softResetToModeSelection() {
        companyNameInput.disabled = false;
        confirmCompanyBtn.disabled = false;
        choiceSingleCard.classList.add("disabled");
        choiceMultiCard.classList.add("disabled");
        resetSingleQuoteCreator();
        resetMultiQuoteCreator();
        switchView("start");
    }

    function resetSingleQuoteCreator() {
        currentQuote = {
            ...currentQuote,
            product: null,
            totals: null,
            quantity: 1,
            companyName: companyNameInput.value.trim(),
            transport: { type: "none", name: "", cost: 0, margin: 0, price: 0 },
        };
        if (productSearchInput) productSearchInput.value = "";
        if (selectedProductDisplay) {
            selectedProductDisplay.style.display = "none";
            selectedProductDisplay.classList.remove("selected-product-active");
        }
        if (caseQuantityInput) caseQuantityInput.value = "1";
        if (costPerCaseInput) costPerCaseInput.value = "";
        if (labelingCostInput) labelingCostInput.value = "";
        if (crossingDocsCostInput) crossingDocsCostInput.value = "";
        if (commissionPercentInput) commissionPercentInput.value = "";
        if (transportTypeSelect) transportTypeSelect.value = "none";
        if (transportNameInput) transportNameInput.value = "";
        if (transportCostInput) transportCostInput.value = "";
        if (transportMarginInput) transportMarginInput.value = "";
        if (transportPriceInput) transportPriceInput.value = "";
        updateAllCalculations();
        if (saveQuoteBtn) saveQuoteBtn.disabled = true;
        if (downloadPdfBtn) downloadPdfBtn.disabled = true;
    }

    function resetMultiQuoteCreator() {
        currentMultiQuote = {
            companyName: companyNameInput.value.trim(),
            items: [],
            transport: { type: "none", name: "", cost: 0, margin: 0, price: 0 },
            totals: null,
            exchangeRate: currentQuote.exchangeRate,
            truckCapacity: {
                totalWeightLbs: 0,
                totalPalletSpace: 0,
                weightPercent: 0,
                palletPercent: 0,
            },
        };
        activeMultiItemId = null;
        if (multiItemListContainer) multiItemListContainer.innerHTML = "";
        if (multiFormPlaceholder) multiFormPlaceholder.style.display = "flex";
        if (multiFormContainer) multiFormContainer.style.display = "none";
        if (saveFullQuoteBtn) saveFullQuoteBtn.disabled = true;
        if (saveMultiItemBtn) saveMultiItemBtn.style.display = "none";
        updateTruckCapacity();
    }

    function calculateTransportPriceFromMargin() {
        if (isCalculatingTransport) return;
        isCalculatingTransport = true;
        const costInput =
            currentQuoteMode === "single"
                ? transportCostInput
                : multiTransportCostInput;
        const marginInput =
            currentQuoteMode === "single"
                ? transportMarginInput
                : multiTransportMarginInput;
        const priceInput =
            currentQuoteMode === "single"
                ? transportPriceInput
                : multiTransportPriceInput;
        const cost = parseFloat(costInput.value) || 0;
        const margin = parseFloat(marginInput.value) || 0;
        const price = cost * (1 + margin / 100);
        priceInput.value = price > 0 ? price.toFixed(2) : "";
        if (currentQuoteMode === "single") updateAllCalculations();
        isCalculatingTransport = false;
    }

    function calculateTransportMarginFromPrice() {
        if (isCalculatingTransport) return;
        isCalculatingTransport = true;
        const costInput =
            currentQuoteMode === "single"
                ? transportCostInput
                : multiTransportCostInput;
        const marginInput =
            currentQuoteMode === "single"
                ? transportMarginInput
                : multiTransportMarginInput;
        const priceInput =
            currentQuoteMode === "single"
                ? transportPriceInput
                : multiTransportPriceInput;
        const cost = parseFloat(costInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        if (cost > 0 && price >= cost) {
            const margin = ((price - cost) / cost) * 100;
            marginInput.value = margin.toFixed(2);
        } else {
            marginInput.value = "";
        }
        if (currentQuoteMode === "single") updateAllCalculations();
        isCalculatingTransport = false;
    }

    function updateAllCalculations() {
        if (!currentQuote.product) {
            if (weightPerCaseEl) weightPerCaseEl.textContent = "0.00 lbs";
            if (weightPerPalletEl) weightPerPalletEl.textContent = "0.00 lbs";
            if (palletCaseCountEl) palletCaseCountEl.textContent = "for 0 cases";
            renderQuotePreview();
            return;
        }
        const caseWeightLbs = calculateCaseWeightLbs(currentQuote.product);
        const palletWeightLbs =
            caseWeightLbs * (currentQuote.product.cases_per_pallet || 1);
        currentQuote.calculatedWeightPerCaseLbs = caseWeightLbs;
        if (weightPerCaseEl)
            weightPerCaseEl.textContent = `${caseWeightLbs.toFixed(2)} lbs`;
        if (weightPerPalletEl)
            weightPerPalletEl.textContent = `${palletWeightLbs.toFixed(2)} lbs`;
        if (palletCaseCountEl)
            palletCaseCountEl.textContent = `for ${currentQuote.product.cases_per_pallet || 0
                } cases`;
        currentQuote.quantity = parseInt(caseQuantityInput.value, 10) || 1;
        const costPerCase = parseFloat(costPerCaseInput.value) || 0;
        const labelingCost = parseFloat(labelingCostInput.value) || 0;
        const docsCost = parseFloat(crossingDocsCostInput.value) || 0;
        const subtotalBeforeCommission =
            (costPerCase + labelingCost + docsCost) * currentQuote.quantity;
        const commissionPercent = parseFloat(commissionPercentInput.value) || 0;
        const commissionAmount =
            subtotalBeforeCommission * (commissionPercent / 100);
        const transportPrice = parseFloat(transportPriceInput.value) || 0;
        const totalMXN =
            subtotalBeforeCommission + commissionAmount + transportPrice;
        const exchangeRate = currentQuote.exchangeRate;
        const totalUSD = totalMXN / exchangeRate;
        currentQuote.transport = {
            type: transportTypeSelect.value,
            name: transportNameInput.value.trim(),
            cost: parseFloat(transportCostInput.value) || 0,
            margin: parseFloat(transportMarginInput.value) || 0,
            price: transportPrice,
        };
        currentQuote.totals = {
            subtotal: subtotalBeforeCommission,
            commission: commissionAmount,
            transport: transportPrice,
            totalMXN: totalMXN,
            totalUSD: totalUSD,
            pricePerCaseUSD:
                currentQuote.quantity > 0 ? totalUSD / currentQuote.quantity : 0,
            pricePerPieceUSD:
                currentQuote.quantity > 0
                    ? totalUSD /
                    (currentQuote.quantity *
                        (currentQuote.product.pieces_per_case || 1))
                    : 0,
            exchangeRate: exchangeRate,
            costPerCase: costPerCase,
            labelingCost: labelingCost,
            docsCost: docsCost,
            commissionPercent: commissionPercent,
        };
        if (saveQuoteBtn) saveQuoteBtn.disabled = !totalUSD;
        renderQuotePreview(currentQuote, "single-live");
    }

    function updateMultiItemCalculations() {
        const item = currentMultiQuote.items.find(
            (i) => i.product.id == activeMultiItemId
        );
        if (!item) return;
        const caseWeightLbs = calculateCaseWeightLbs(item.product);
        const palletWeightLbs =
            caseWeightLbs * (item.product.cases_per_pallet || 1);

        if (multiWeightPerCaseEl)
            multiWeightPerCaseEl.textContent = `${caseWeightLbs.toFixed(2)} lbs`;
        if (multiWeightPerPalletEl)
            multiWeightPerPalletEl.textContent = `${palletWeightLbs.toFixed(2)} lbs`;

        const casesPerPalletEl = document.getElementById(
            "qcf-multi-cases-per-pallet"
        );
        if (casesPerPalletEl)
            casesPerPalletEl.textContent = item.product.cases_per_pallet || 0;
    }

    function updateTrailerVisualizer(totalPalletSpace) {
        const slots = document.querySelectorAll(".sq-trailer-slot .sq-slot-fill");
        if (slots.length === 0) return;

        const fullPallets = Math.floor(totalPalletSpace);
        const partialPalletFill = (totalPalletSpace - fullPallets) * 100;

        slots.forEach((slot, index) => {
            let fillPercent = 0;
            if (index < fullPallets) {
                fillPercent = 100;
            } else if (index === fullPallets && partialPalletFill > 0) {
                fillPercent = partialPalletFill;
            }

            slot.style.height = `${fillPercent}%`;
        });
    }

    function updateTruckCapacity() {
        let totalWeightLbs = 0;
        let totalPalletSpace = 0;

        currentMultiQuote.items.forEach((item) => {
            if (item.isCompleted && item.product) {
                const caseWeightLbs = calculateCaseWeightLbs(item.product);
                totalWeightLbs += caseWeightLbs * item.totalCases;
                if (item.product.cases_per_pallet > 0) {
                    totalPalletSpace += item.totalCases / item.product.cases_per_pallet;
                }
            }
        });

        currentMultiQuote.truckCapacity = {
            totalWeightLbs,
            totalPalletSpace,
            weightPercent: (totalWeightLbs / TRUCK_WEIGHT_LIMIT_LBS) * 100,
            palletPercent: (totalPalletSpace / TRUCK_PALLET_LIMIT) * 100,
        };

        if (truckPalletBarFill && truckPalletText && truckWeightBarFill && truckWeightText) {
            // --- PALLETS ---
            let palletPercent = Math.max(0, Math.min(100, currentMultiQuote.truckCapacity.palletPercent));
            truckPalletText.textContent = `${totalPalletSpace.toFixed(2)} / ${TRUCK_PALLET_LIMIT} Pallets`;
            truckPalletBarFill.style.width = `${palletPercent}%`;

            // --- PESO ---
            let weightPercent = Math.max(0, Math.min(100, currentMultiQuote.truckCapacity.weightPercent));
            truckWeightText.textContent = `${totalWeightLbs.toFixed(0).toLocaleString()} / ${TRUCK_WEIGHT_LIMIT_LBS.toLocaleString()} lbs`;
            truckWeightBarFill.style.width = `${weightPercent}%`;
        }

        updateTrailerVisualizer(totalPalletSpace);
    }



    function renderQuotePreview(
        quoteObject = currentQuote,
        viewType = "single",
        customTarget = null
    ) {
        const isLivePreview = viewType === "single-live";
        const isMulti = viewType === "multi";
        const targetElement =
            customTarget ||
            (isMulti
                ? viewMultiQuoteBody
                : isLivePreview
                    ? quotePreviewContent
                    : viewQuoteBody);
        if (!targetElement) return;
        if (
            (!isMulti && (!quoteObject.product || !quoteObject.totals)) ||
            (isMulti && (!quoteObject.items || quoteObject.items.length === 0))
        ) {
            targetElement.innerHTML = `<p class="sq-preview-placeholder">${isMulti
                ? "Add and configure products to see the preview."
                : "Select a product to begin..."
                }</p>`;
            return;
        }
        const { companyName, totals, transport, exchangeRate, items, quantity } =
            quoteObject;
        const totalCommissionMulti = isMulti
            ? items.reduce((acc, item) => acc + (item.totals?.commission || 0), 0)
            : 0;
        const itemsHtml = isMulti
            ? items
                .map(
                    (item) => `
            <tr>
                <td>Base Cost per Case (${item.product.name})</td>
                <td class="text-right">${item.totals.costPerCase.toFixed(
                        2
                    )}</td>
                <td class="text-right">${item.totalCases.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 2 }
                    )}</td>
                <td class="text-right">${(
                            item.totals.costPerCase * item.totalCases
                        ).toFixed(2)}</td>
            </tr>
            <tr class="item-details-row">
                <td style="padding-left: 25px;"><em>Services per case</em></td>
                <td class="text-right">${(
                            item.totals.labelingCost + item.totals.docsCost
                        ).toFixed(2)}</td>
                <td class="text-right">${item.totalCases.toLocaleString(
                            undefined,
                            { maximumFractionDigits: 2 }
                        )}</td>
                <td class="text-right">${(
                            (item.totals.labelingCost + item.totals.docsCost) *
                            item.totalCases
                        ).toFixed(2)}</td>
            </tr>`
                )
                .join("")
            : `
            <tr>
                <td>Base Cost per Case</td>
                <td class="text-right">${totals.costPerCase.toFixed(2)}</td>
                <td class="text-right">${quantity.toLocaleString()}</td>
                <td class="text-right">${(
                totals.costPerCase * quantity
            ).toFixed(2)}</td>
            </tr>
            <tr class="item-details-row">
                <td>Services per case</td>
                <td class="text-right">${(
                totals.labelingCost + totals.docsCost
            ).toFixed(2)}</td>
                <td class="text-right">${quantity.toLocaleString()}</td>
                <td class="text-right">${(
                (totals.labelingCost + totals.docsCost) *
                quantity
            ).toFixed(2)}</td>
            </tr>`;
        const transportHtml =
            transport && transport.price > 0
                ? `<tr><td>Transportation (${transport.name || transport.type
                })</td><td class="text-right">${transport.price.toFixed(
                    2
                )}</td><td class="text-right">1</td><td class="text-right">${transport.price.toFixed(
                    2
                )}</td></tr>`
                : "";
        const commissionHtml =
            (totals && totals.commission > 0) || totalCommissionMulti > 0
                ? `
             <tr class="commission-row">
                <td>Seller Commission (${isMulti
                    ? items[0]?.totals.commissionPercent || 0
                    : totals.commissionPercent
                }%)</td>
                <td colspan="2" style="text-align:center;">-</td>
                <td class="text-right">${isMulti
                    ? totalCommissionMulti.toFixed(2)
                    : totals.commission.toFixed(2)
                }</td>
            </tr>`
                : "";
        const perItemTotals = isMulti
            ? `
            <table class="sq-price-breakdown-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="text-right">Price/Case (USD)</th>
                  <th class="text-right">Price/Piece (USD)</th>
                </tr>
              </thead>
              <tbody>
                ${items
                .map(
                    (item) => `
                    <tr>
                        <td>${item.product.name}</td>
                        <td class="text-right">$${item.totals.pricePerCaseUSD.toFixed(
                        2
                    )}</td>
                        <td class="text-right">$${(
                            item.totals.pricePerCaseUSD /
                            (item.product.pieces_per_case || 1)
                        ).toFixed(4)}</td>
                    </tr>`
                )
                .join("")}
              </tbody>
            </table>`
            : `
            <div class="footer-item"><span class="footer-label">Price per Case (USD):</span><span class="footer-value">$${(
                totals.pricePerCaseUSD || 0
            ).toFixed(2)}</span></div>
            <div class="footer-item"><span class="footer-label">Price per Piece (USD):</span><span class="footer-value">$${(
                totals.pricePerPieceUSD || 0
            ).toFixed(4)}</span></div>`;
        targetElement.innerHTML = `
            <div class="sq-preview-invoice-box">
                <div class="sq-preview-top-section"><div class="sq-preview-company-info"><strong>Quotation Estimate For: ${companyName || "N/A"
            }</strong><span>Generated on: ${new Date().toLocaleDateString()}</span></div></div>
                <div class="sq-preview-details-section"><strong>Quote Type:</strong> ${isMulti ? "Multi-Item" : "Single Product"
            }<br>${isMulti
                ? `<strong>Total Items:</strong> ${items.length}`
                : `<strong>Product:</strong> ${quoteObject.product.name
                }<br><strong>Quantity:</strong> ${quantity.toLocaleString()} case(s)`
            }</div>
                <table class="sq-preview-items-table">
                    <thead><tr><th>Description</th><th class="text-right">Unit Cost (MXN)</th><th class="text-right">Quantity</th><th class="text-right">Total (MXN)</th></tr></thead>
                    <tbody>${itemsHtml}${!isMulti ? transportHtml : ""
            }${commissionHtml}${isMulti && transport && transport.price > 0
                ? `<tr><td>Global Transportation (${transport.name || transport.type
                })</td><td colspan="2" style="text-align:center;">-</td><td class="text-right">${transport.price.toFixed(
                    2
                )}</td></tr>`
                : ""
            }</tbody>
                </table>
                <div class="sq-preview-footer">
                    <div class="sq-preview-footer-left">${perItemTotals}<div class="footer-item exchange-rate">Exchange rate used: 1 USD ≈ ${exchangeRate.toFixed(
                4
            )} MXN</div></div>
                    <div class="sq-preview-footer-right">
                        <div class="footer-item"><span class="footer-label">Total (MXN):</span><span class="footer-value">${(
                totals.totalMXN || 0
            ).toFixed(2)}</span></div>
                        <div class="footer-item grand-total"><span class="footer-label">Total Estimate (USD):</span><span class="footer-value">$${(
                totals.totalUSD || 0
            ).toFixed(2)}</span></div>
                    </div>
                </div>
            </div>`;
        if (!isLivePreview && !customTarget) {
            const modal = isMulti ? viewMultiQuoteModal : viewQuoteModal;
            const titleEl = isMulti ? viewMultiQuoteTitle : viewQuoteTitle;
            if (titleEl)
                titleEl.textContent = `Quotation Details #${quoteObject.savedId || "Preview"
                    }`;
            if (isMulti) {
                downloadMultiPdfBtn.quoteData = quoteObject;
            } else {
                downloadSinglePdfBtn.quoteData = quoteObject;
            }
            openModal(modal);
        }
    }

    async function fetchExchangeRate() {
        try {
            const response = await fetch("https://open.er-api.com/v6/latest/USD");
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json();
            if (data.rates && data.rates.MXN) {
                const newRate = data.rates.MXN;
                currentQuote.exchangeRate = newRate;
                currentMultiQuote.exchangeRate = newRate;
                console.log(`Live exchange rate fetched: ${newRate}`);
            }
        } catch (error) {
            console.error("Failed to fetch exchange rate, using fallback:", error);
            showSQNotification(
                "Could not fetch live exchange rate. Using fallback value.",
                "warning",
                6000
            );
        }
    }

    async function fetchInitialData() {
        if (!currentUserSQ) return;
        await Promise.all([fetchExchangeRate(), fetchProducts()]);
    }

    async function fetchProducts() {
        try {
            const { data, error } = await supabase
                .from(PRODUCTS_TABLE)
                .select("*")
                .order("name");
            if (error) throw error;
            productsCache = data;
            applyFiltersAndRenderCards();
            if (
                document
                    .getElementById("qcf-database-tab")
                    ?.classList.contains("active")
            ) {
                initializeProductsTable(productsCache);
            }
        } catch (error) {
            console.error("Error fetching products:", error);
        }
    }

    async function fetchQuotesHistory() {
        try {
            const { data, error } = await supabase
                .from(QUOTES_TABLE)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            quotesHistoryCache = data;
            populateHistoryFilters();
            initializeHistoryTable(quotesHistoryCache);
        } catch (error) {
            console.error("Error fetching quotes history:", error);
            showSQNotification("Failed to load quote history.", "error");
        }
    }

    function handleSingleProductSelection(productId) {
        const selected = productsCache.find((p) => p.id == productId);
        if (!selected) return;
        currentQuote.product = selected;
        productSearchInput.value = selected.name;
        productImage.src = selected.image_url || "assets/favicon.png";
        productNameEl.textContent = selected.name;
        productSpecsEl.textContent = `${selected.pieces_per_case} pieces / ${selected.value_per_piece} ${selected.unit_of_measure}`;
        closeModal(productExplorerModal);
        selectedProductDisplay.style.display = "flex";
        selectedProductDisplay.classList.add("selected-product-active");
        updateAllCalculations();
    }

    function applyFiltersAndRenderCards() {
        const searchTerm = modalSearchInput.value.toLowerCase();
        let filteredProducts = productsCache;
        if (activeUnitFilter !== "all") {
            filteredProducts = filteredProducts.filter(
                (p) => p.unit_of_measure === activeUnitFilter
            );
        }
        if (searchTerm) {
            filteredProducts = filteredProducts.filter((p) =>
                p.name.toLowerCase().includes(searchTerm)
            );
        }
        renderProductCards(filteredProducts);
    }

    function renderProductCards(products) {
        if (!productCardsContainer) return;
        productCardsContainer.innerHTML = "";
        if (products.length === 0) {
            productCardsContainer.innerHTML =
                "<p>No products found matching your criteria.</p>";
            return;
        }
        products.forEach((product) => {
            const card = document.createElement("div");
            card.className = "sq-product-card";
            card.dataset.id = product.id;
            if (
                productExplorerMode === "multi" &&
                selectedProductsForMulti.has(product.id)
            ) {
                card.classList.add("selected");
            }
            card.innerHTML = `<img src="${product.image_url || "assets/favicon.png"
                }" alt="${product.name}"><div class="sq-product-card-info"><h5>${product.name
                }</h5><p>${product.pieces_per_case || "N/A"} pieces / ${product.value_per_piece || "N/A"
                } ${product.unit_of_measure || "N/A"}</p></div>`;
            card.addEventListener("click", () => {
                if (productExplorerMode === "single") {
                    handleSingleProductSelection(product.id);
                } else {
                    if (selectedProductsForMulti.has(product.id)) {
                        selectedProductsForMulti.delete(product.id);
                        card.classList.remove("selected");
                    } else {
                        selectedProductsForMulti.add(product.id);
                        card.classList.add("selected");
                    }
                }
            });
            productCardsContainer.appendChild(card);
        });
    }

    function renderMultiItemList() {
        if (!multiItemListContainer) return;
        multiItemListContainer.innerHTML = "";
        currentMultiQuote.items.forEach((item) => {
            const itemEl = document.createElement("div");
            itemEl.className = "sq-multi-item";
            itemEl.dataset.id = item.product.id;
            if (item.isCompleted) itemEl.classList.add("completed");
            if (item.product.id == activeMultiItemId) itemEl.classList.add("active");
            itemEl.innerHTML = `
                <button class="sq-multi-item-delete-btn" title="Remove Item"><i class='bx bx-trash'></i></button>
                ${item.isCompleted
                    ? "<i class='bx bxs-check-circle status-icon'></i>"
                    : ""
                }
                <img src="${item.product.image_url || "assets/favicon.png"
                }" alt="${item.product.name}">
                <div class="product-info"><h5>${item.product.name}</h5><p>${item.product.pieces_per_case || "N/A"
                } pcs / ${item.product.value_per_piece || "N/A"} ${item.product.unit_of_measure || "N/A"
                }</p></div>`;
            multiItemListContainer.appendChild(itemEl);
        });
        checkIfMultiQuoteCanBeSaved();
    }

    function handleDeleteItem(itemIdToDelete) {
        showCustomConfirm(
            "Delete Item",
            "Are you sure you want to remove this item from the quote?",
            () => {
                currentMultiQuote.items = currentMultiQuote.items.filter(
                    (item) => item.product.id != itemIdToDelete
                );
                if (activeMultiItemId == itemIdToDelete) {
                    activeMultiItemId = null;
                    multiFormPlaceholder.style.display = "flex";
                    multiFormContainer.style.display = "none";
                    if (saveMultiItemBtn) saveMultiItemBtn.style.display = "none";
                }
                renderMultiItemList();
                updateTruckCapacity();
                showSQNotification("Item removed.", "info");
            }
        );
    }

    function loadMultiItemForm(itemId) {
        activeMultiItemId = itemId;
        const item = currentMultiQuote.items.find((i) => i.product.id == itemId);
        if (!item) {
            if (multiFormPlaceholder) multiFormPlaceholder.style.display = "flex";
            if (multiFormContainer) multiFormContainer.style.display = "none";
            if (saveMultiItemBtn) saveMultiItemBtn.style.display = "none";
            return;
        }
        const titleImg = multiFormProductTitle.querySelector("img");
        const titleSpan = multiFormProductTitle.querySelector("span");
        titleImg.src = item.product.image_url || "assets/favicon.png";
        titleSpan.textContent = item.product.name;
        multiQuantityInput.value = item.rawQuantity;
        multiCostPerCaseDisplay.textContent = (
            item.product.costo_base || 0
        ).toFixed(2);
        multiLabelingCostInput.value = item.totals?.labelingCost || "";
        multiCrossingDocsCostInput.value = item.totals?.docsCost || "";
        multiCommissionPercentInput.value = item.totals?.commissionPercent || "";
        multiUnitSelector.querySelectorAll(".sq-unit-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.unit === item.quotingUnit);
        });
        if (multiFormPlaceholder) multiFormPlaceholder.style.display = "none";
        if (multiFormContainer) multiFormContainer.style.display = "block";
        if (saveMultiItemBtn) saveMultiItemBtn.style.display = "flex";
        updateMultiItemCalculations();
        renderMultiItemList();
    }

    function setupEventListeners() {
        tabButtons.forEach((btn) =>
            btn.addEventListener("click", () => {
                tabButtons.forEach((b) => b.classList.remove("active"));
                tabContents.forEach((c) => c.classList.remove("active"));
                btn.classList.add("active");
                const tabContent = document.getElementById(btn.dataset.tab);
                if (tabContent) tabContent.classList.add("active");
                if (btn.dataset.tab === "qcf-history-tab") fetchQuotesHistory();
                if (btn.dataset.tab === "qcf-database-tab") fetchProducts();
            })
        );
        confirmCompanyBtn.addEventListener("click", () => {
            const companyName = companyNameInput.value.trim();
            if (companyName) {
                currentQuote.companyName = companyName;
                currentMultiQuote.companyName = companyName;
                companyNameInput.disabled = true;
                confirmCompanyBtn.disabled = true;
                // choiceSingleCard.classList.remove("disabled");//
                choiceMultiCard.classList.remove("disabled");
                showSQNotification(
                    `Company set to: ${companyName}. Please select a quote type.`,
                    "info"
                );
            } else {
                showSQNotification("Please enter a company name.", "error");
            }
        });
        choiceSingleCard.addEventListener("click", () => {
            if (choiceSingleCard.classList.contains("disabled")) return;
            switchView("single");
        });
        choiceMultiCard.addEventListener("click", () => {
            if (choiceMultiCard.classList.contains("disabled")) return;
            switchView("multi");
        });
        backToStartBtns.forEach((btn) => {
            btn.addEventListener("click", softResetToModeSelection);
        });
        if (exploreProductsBtn)
            exploreProductsBtn.addEventListener("click", () => {
                productExplorerMode = "single";
                addSelectedProductsBtn.style.display = "none";
                selectedProductsForMulti.clear();
                applyFiltersAndRenderCards();
                openModal(productExplorerModal);
            });
        if (productSearchInput) {
            productSearchInput.addEventListener("input", (e) => {
                const searchTerm = e.target.value;
                if (productExplorerModal.style.display !== "flex") {
                    openModal(productExplorerModal);
                }
                modalSearchInput.value = searchTerm;
                applyFiltersAndRenderCards();
            });
        }
        const inputsToWatch = [
            caseQuantityInput,
            costPerCaseInput,
            labelingCostInput,
            crossingDocsCostInput,
            commissionPercentInput,
            transportTypeSelect,
            transportNameInput,
        ];
        inputsToWatch.forEach((input) => {
            if (input) {
                const eventType = input.tagName === "SELECT" ? "change" : "input";
                input.addEventListener(eventType, updateAllCalculations);
            }
        });
        if (transportCostInput)
            transportCostInput.addEventListener(
                "input",
                calculateTransportPriceFromMargin
            );
        if (transportMarginInput)
            transportMarginInput.addEventListener(
                "input",
                calculateTransportPriceFromMargin
            );
        if (transportPriceInput)
            transportPriceInput.addEventListener(
                "input",
                calculateTransportMarginFromPrice
            );
        addMultiProductsBtn.addEventListener("click", () => {
            productExplorerMode = "multi";
            addSelectedProductsBtn.style.display = "block";
            selectedProductsForMulti.clear();
            currentMultiQuote.items.forEach((item) =>
                selectedProductsForMulti.add(item.product.id)
            );
            applyFiltersAndRenderCards();
            openModal(productExplorerModal);
        });
        addSelectedProductsBtn.addEventListener("click", () => {
            const existingIds = new Set(
                currentMultiQuote.items.map((i) => i.product.id)
            );
            selectedProductsForMulti.forEach((id) => {
                if (!existingIds.has(id)) {
                    const product = productsCache.find((p) => p.id == id);
                    if (product) {
                        currentMultiQuote.items.push({
                            product: product,
                            rawQuantity: '',
                            quotingUnit: "case",
                            totalCases: 1,
                            isCompleted: false,
                            totals: null,
                        });
                    }
                }
            });
            currentMultiQuote.items = currentMultiQuote.items.filter((item) =>
                selectedProductsForMulti.has(item.product.id)
            );
            renderMultiItemList();
            closeModal(productExplorerModal);
        });
        multiItemListContainer.addEventListener("click", (e) => {
            const deleteBtn = e.target.closest(".sq-multi-item-delete-btn");
            const itemEl = e.target.closest(".sq-multi-item");
            if (deleteBtn && itemEl) {
                e.stopPropagation();
                handleDeleteItem(itemEl.dataset.id);
            } else if (itemEl) {
                loadMultiItemForm(itemEl.dataset.id);
            }
        });
        const multiInputsToWatch = [
            multiLabelingCostInput,
            multiCrossingDocsCostInput,
            multiCommissionPercentInput,
        ];
        multiInputsToWatch.forEach((input) => {
            if (input) input.addEventListener("input", updateMultiItemCalculations);
        });
        if (saveMultiItemBtn)
            saveMultiItemBtn.addEventListener("click", handleSaveMultiItem);
        if (multiUnitSelector) {
            multiUnitSelector.addEventListener("click", (e) => {
                if (e.target.matches(".sq-unit-btn")) {
                    const selectedUnit = e.target.dataset.unit;
                    const item = currentMultiQuote.items.find(
                        (i) => i.product.id == activeMultiItemId
                    );
                    if (item) {
                        item.quotingUnit = selectedUnit;
                        multiUnitSelector
                            .querySelectorAll(".sq-unit-btn")
                            .forEach((btn) => btn.classList.remove("active"));
                        e.target.classList.add("active");
                    }
                }
            });
        }
        if (multiTransportCostInput)
            multiTransportCostInput.addEventListener(
                "input",
                calculateTransportPriceFromMargin
            );
        if (multiTransportMarginInput)
            multiTransportMarginInput.addEventListener(
                "input",
                calculateTransportPriceFromMargin
            );
        if (multiTransportPriceInput)
            multiTransportPriceInput.addEventListener(
                "input",
                calculateTransportMarginFromPrice
            );
        if (manageProductsBtn)
            manageProductsBtn.addEventListener("click", () => {
                productForm.reset();
                productIdInput.value = "";
                productModalTitle.textContent = "Add New Product";
                currentImageEl.textContent = "";
                openModal(manageProductsModal);
            });
        if (addNewProductBtn)
            addNewProductBtn.addEventListener("click", () =>
                manageProductsBtn.click()
            );
        const genericModalButtons = document.querySelectorAll(
            ".sq-modal:not(#sq-view-quote-modal):not(#sq-view-multi-quote-modal):not(#sqCustomConfirmModal) .sq-modal-close-btn, .sq-modal:not(#sq-view-quote-modal):not(#sq-view-multi-quote-modal):not(#sqCustomConfirmModal) .sq-modal-cancel-btn"
        );
        genericModalButtons.forEach((btn) =>
            btn.addEventListener("click", () => closeModal(btn.closest(".sq-modal")))
        );
        if (confirmOkBtn)
            confirmOkBtn.addEventListener("click", () => {
                if (typeof currentConfirmCallback === "function")
                    currentConfirmCallback();
                hideCustomConfirmModal();
            });
        if (confirmCancelBtn)
            confirmCancelBtn.addEventListener("click", hideCustomConfirmModal);
        if (confirmCloseBtn)
            confirmCloseBtn.addEventListener("click", hideCustomConfirmModal);
        viewQuoteModal.addEventListener("click", (e) => {
            if (e.target.matches(".sq-modal-close-btn, .sq-modal-cancel-btn")) {
                closeModal(viewQuoteModal);
            }
        });
        viewMultiQuoteModal.addEventListener("click", (e) => {
            if (e.target.matches(".sq-modal-close-btn, .sq-modal-cancel-btn")) {
                closeModal(viewMultiQuoteModal);
                softResetToModeSelection();
            }
        });
        if (modalSearchInput) {
            modalSearchInput.addEventListener("input", applyFiltersAndRenderCards);
        }
        if (filterBtns) {
            filterBtns.forEach((btn) => {
                btn.addEventListener("click", () => {
                    filterBtns.forEach((b) => b.classList.remove("active"));
                    btn.classList.add("active");
                    activeUnitFilter = btn.dataset.filter;
                    applyFiltersAndRenderCards();
                });
            });
        }
        if (productForm) productForm.addEventListener("submit", handleProductSave);
        if (saveQuoteBtn) saveQuoteBtn.addEventListener("click", saveSingleQuote);
        if (downloadPdfBtn)
            downloadPdfBtn.addEventListener("click", () =>
                downloadQuoteAsPDF(currentQuote, "single-live")
            );
        if (applyFiltersBtn)
            applyFiltersBtn.addEventListener("click", applyHistoryFilters);
        if (saveFullQuoteBtn)
            saveFullQuoteBtn.addEventListener("click", saveMultiQuote);
        if (downloadMultiPdfBtn) {
            downloadMultiPdfBtn.addEventListener("click", () => {
                if (downloadMultiPdfBtn.quoteData) {
                    downloadQuoteAsPDF(downloadMultiPdfBtn.quoteData, "multi");
                } else {
                    showSQNotification("Quote data not found for PDF download.", "error");
                }
            });
        }
        if (downloadSinglePdfBtn) {
            downloadSinglePdfBtn.addEventListener("click", () => {
                if (downloadSinglePdfBtn.quoteData) {
                    downloadQuoteAsPDF(downloadSinglePdfBtn.quoteData, "single");
                } else {
                    showSQNotification("Quote data not found for PDF download.", "error");
                }
            });
        }
    }

    function openModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = "flex";
            setTimeout(() => modalElement.classList.add("open"), 10);
        }
    }
    function closeModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove("open");
            setTimeout(() => (modalElement.style.display = "none"), 300);
        }
    }

    function showCustomConfirm(title, message, onOkCallback) {
        if (!confirmModalElement) {
            console.error("Confirmation modal element not found!");
            if (window.confirm(message.replace(/<strong>|<\/strong>/g, ""))) {
                if (typeof onOkCallback === "function") onOkCallback();
            }
            return;
        }
        confirmTitleElement.textContent = title;
        confirmMessageElement.innerHTML = message;
        currentConfirmCallback = onOkCallback;
        openModal(confirmModalElement);
    }

    function hideCustomConfirmModal() {
        if (!confirmModalElement) return;
        closeModal(confirmModalElement);
        currentConfirmCallback = null;
    }

    // =========================================================
    // MODIFICADO: Agregado scrollY y scrollCollapse, Limpieza Previa
    // =========================================================
    function initializeHistoryTable(data) {
        if (!$.fn.DataTable) return;
        if ($.fn.DataTable.isDataTable(historyTableElement)) {
            // Destruir tabla existente y limpiar DOM para evitar conflictos
            $(historyTableElement).DataTable().destroy();
            $(historyTableElement).empty();
        }
        historyDataTable = $(historyTableElement).DataTable({
            data: data,
            responsive: true,
            // Trinity Layout Fix
            dom: '<"sq-dt-header"lf>rt<"sq-dt-footer"ip>',
            scrollY: '50vh',
            scrollCollapse: true,
            paging: true,
            columns: [
                { data: "id", title: "Quote ID" },
                {
                    data: "quote_data.companyName",
                    title: "Company",
                    defaultContent: "N/A",
                },
                {
                    data: "product_name",
                    title: "Product(s)",
                    render: (d, t, r) =>
                        r.quote_data.type === "multi"
                            ? `${r.quote_data.items.length} items`
                            : d,
                },
                {
                    data: "created_at",
                    title: "Date",
                    render: (d) => new Date(d).toLocaleDateString(),
                },
                { data: "user_email", title: "Created By" },
                {
                    data: "quote_data.totals.totalUSD",
                    title: "Total (USD)",
                    render: (d) => (d ? `$${d.toFixed(2)}` : "$0.00"),
                },
                {
                    data: null,
                    title: "Actions",
                    orderable: false,
                    render: () =>
                        `<button class="btn-goldmex-secondary btn-small sq-action-view" title="View"><i class='bx bx-show'></i></button> <button class="btn-goldmex-secondary btn-small sq-action-download" title="Download PDF"><i class='bx bxs-file-pdf'></i></button>`,
                },
            ],
            order: [[3, "desc"]],
        });
        $("#sq-quotes-history-table tbody")
            .off("click")
            .on("click", "button", function () {
                const rowData = historyDataTable.row($(this).parents("tr")).data();
                const quoteData = { ...rowData.quote_data, savedId: rowData.id };
                const quoteType = quoteData.type || "single";
                if ($(this).hasClass("sq-action-view")) {
                    renderQuotePreview(quoteData, quoteType);
                } else if ($(this).hasClass("sq-action-download")) {
                    downloadQuoteAsPDF(quoteData, quoteType);
                }
            });
    }

    // =========================================================
    // MODIFICADO: Agregado scrollY y scrollCollapse, Limpieza Previa
    // =========================================================
    function initializeProductsTable(data) {
        if (!$.fn.DataTable) return;
        if ($.fn.DataTable.isDataTable(productsTableElement)) {
            // Destruir tabla existente y limpiar DOM para evitar conflictos
            $(productsTableElement).DataTable().destroy();
            $(productsTableElement).empty();
        }
        productsDataTable = $(productsTableElement).DataTable({
            data: data,
            responsive: true,
            // Trinity Layout Fix
            dom: '<"sq-dt-header"lf>rt<"sq-dt-footer"ip>',
            scrollY: '50vh',
            scrollCollapse: true,
            paging: true,
            columns: [
                { data: "name", title: "Product Name", className: "dt-left" },
                {
                    data: "costo_base",
                    title: "Price/Case (MXN)",
                    render: function (data, type, row) {
                        const cost = parseFloat(data) || 0;
                        return `$${cost.toFixed(2)}`;
                    },
                },
                { data: "pieces_per_case", title: "Pieces/Case" },
                { data: "cases_per_pallet", title: "Cases/Pallet" },
                { data: "pallets_per_truck", title: "Pallets/Truck" },
                {
                    data: null,
                    title: "Actions",
                    orderable: false,
                    render: () =>
                        `<button class="btn-goldmex-secondary btn-small sq-action-edit" title="Edit"><i class='bx bx-edit'></i></button> <button class="btn-goldmex-secondary btn-small sq-action-delete" title="Delete"><i class='bx bx-trash'></i></button>`,
                },
            ],
            order: [[0, "asc"]],
        });
        $("#sq-products-table tbody")
            .off("click")
            .on("click", "button", function () {
                const data = productsDataTable.row($(this).parents("tr")).data();
                if ($(this).hasClass("sq-action-edit")) {
                    handleEditProduct(data);
                } else if ($(this).hasClass("sq-action-delete")) {
                    handleDeleteProduct(data);
                }
            });
    }

    async function handleProductSave(event) {
        event.preventDefault();
        if (!currentUserSQ)
            return showSQNotification("You must be logged in.", "error");
        saveProductBtn.disabled = true;
        saveProductBtn.innerHTML =
            "<i class='bx bx-loader-alt bx-spin'></i> Saving...";
        const file = productImageInput.files[0];
        let imageUrl =
            document.getElementById("p-current-image").dataset.imageUrl || null;
        const editingId = productIdInput.value;
        try {
            if (file) {
                const filePath = `public/${Date.now()}_${file.name}`;
                const { error: uploadError } = await supabase.storage
                    .from(PRODUCTS_BUCKET)
                    .upload(filePath, file);
                if (uploadError) throw uploadError;
                imageUrl = supabase.storage.from(PRODUCTS_BUCKET).getPublicUrl(filePath)
                    .data.publicUrl;
            }
            const productData = {
                name: productNameInput.value,
                image_url: imageUrl,
                pieces_per_case: parseInt(piecesPerCaseInput.value) || null,
                value_per_piece: parseFloat(valuePerPieceInput.value) || null,
                unit_of_measure: unitOfMeasureSelect.value,
                cases_per_pallet: parseInt(casesPerPalletInput.value) || null,
                pallets_per_truck: parseInt(palletsPerTruckInput.value) || null,
                packaging_weight_g: parseFloat(packagingWeightInput.value) || 28,
                case_weight_g: parseFloat(caseWeightInput.value) || 454,
                costo_base: parseFloat(costBaseInput.value) || 0,
            };
            let error, data;
            if (editingId) {
                ({ data, error } = await supabase
                    .from(PRODUCTS_TABLE)
                    .update(productData)
                    .eq("id", editingId)
                    .select());
            } else {
                ({ data, error } = await supabase
                    .from(PRODUCTS_TABLE)
                    .insert(productData)
                    .select());
            }
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error(
                    "Product data was not saved. This might be due to database permissions (RLS)."
                );
            }
            showSQNotification(
                `Product ${editingId ? "updated" : "saved"} successfully!`,
                "success"
            );
            closeModal(manageProductsModal);
            await fetchProducts();
        } catch (error) {
            console.error("Error saving product:", error);
            showSQNotification(`Failed to save product: ${error.message}`, "error");
        } finally {
            saveProductBtn.disabled = false;
            saveProductBtn.textContent = "Save Product";
        }
    }

    function handleEditProduct(product) {
        productForm.reset();
        productModalTitle.textContent = "Edit Product";
        productIdInput.value = product.id;
        productNameInput.value = product.name;
        costBaseInput.value = product.costo_base;
        piecesPerCaseInput.value = product.pieces_per_case;
        valuePerPieceInput.value = product.value_per_piece;
        unitOfMeasureSelect.value = product.unit_of_measure || "g";
        casesPerPalletInput.value = product.cases_per_pallet;
        palletsPerTruckInput.value = product.pallets_per_truck;
        packagingWeightInput.value = product.packaging_weight_g;
        caseWeightInput.value = product.case_weight_g;

        if (product.image_url) {
            currentImageEl.textContent =
                "An image is currently loaded for this product.";
            currentImageEl.dataset.imageUrl = product.image_url;
        } else {
            currentImageEl.textContent = "";
            currentImageEl.dataset.imageUrl = "";
        }

        openModal(manageProductsModal);
    }

    async function handleDeleteProduct(product) {
        showCustomConfirm(
            "Confirm Deletion",
            `Are you sure you want to delete the product "<strong>${product.name}</strong>"? This action cannot be undone.`,
            async () => {
                try {
                    const { error } = await supabase
                        .from(PRODUCTS_TABLE)
                        .delete()
                        .eq("id", product.id);
                    if (error) throw error;
                    showSQNotification("Product deleted successfully.", "success");
                    await fetchProducts();
                } catch (error) {
                    console.error("Error deleting product:", error);
                    showSQNotification(
                        `Failed to delete product: ${error.message}`,
                        "error"
                    );
                }
            }
        );
    }

    async function saveSingleQuote(event) {
        event.preventDefault();
        if (!currentUserSQ || !currentQuote.product)
            return showSQNotification(
                "Please select a product and be logged in to save.",
                "error"
            );
        saveQuoteBtn.disabled = true;
        saveQuoteBtn.innerHTML =
            "<i class='bx bx-loader-alt bx-spin'></i> Saving...";
        currentQuote.type = "single";
        const quoteToSave = {
            user_id: currentUserSQ.id,
            user_email: currentUserSQ.email,
            product_id: currentQuote.product.id,
            product_name: currentQuote.product.name,
            quote_data: currentQuote,
        };
        const { data, error } = await supabase
            .from(QUOTES_TABLE)
            .insert(quoteToSave)
            .select()
            .single();
        saveQuoteBtn.disabled = false;
        saveQuoteBtn.innerHTML = "<i class='bx bx-save'></i> Save Quote";
        if (error) {
            console.error("Error saving quote:", error);
            showSQNotification(`Error saving quote: ${error.message}`, "error");
        } else {
            showSQNotification(`Quote #${data.id} saved successfully!`, "success");
            downloadPdfBtn.disabled = false;
            currentQuote.savedId = data.id;
        }
    }

    // (REQUERIMIENTO #3 y #4) - Función actualizada con todas las validaciones
    function handleSaveMultiItem() {
        const item = currentMultiQuote.items.find(
            (i) => i.product.id == activeMultiItemId
        );
        if (!item) return;
        const product = item.product;

        // --- VALIDACIÓN #1: CAMPOS OBLIGATORIOS ---
        const labelingValue = multiLabelingCostInput.value.trim();
        const docsValue = multiCrossingDocsCostInput.value.trim();
        const commissionValue = multiCommissionPercentInput.value.trim();

        if (labelingValue === '' || docsValue === '' || commissionValue === '') {
            showSQNotification(
                'Please fill all required cost fields (Labeling, Docs, Commission).',
                'warning',
                5000
            );
            return; // Detiene la función si un campo está vacío
        }

        // --- VALIDACIÓN #2: LÍMITE DE TARIMAS ---
        const rawQuantity = parseInt(multiQuantityInput.value, 10) || 1;
        const quotingUnit = item.quotingUnit;
        let totalCases = 0;
        const piecesPerCase = product.pieces_per_case || 1;
        const casesPerPallet = product.cases_per_pallet || 1;
        switch (quotingUnit) {
            case "piece":
                totalCases = rawQuantity / piecesPerCase;
                break;
            case "pallet":
                totalCases = rawQuantity * casesPerPallet;
                break;
            case "case":
            default:
                totalCases = rawQuantity;
                break;
        }

        let oldPalletSpaceForItem = 0;
        if (item.isCompleted && product.cases_per_pallet > 0) {
            oldPalletSpaceForItem = item.totalCases / product.cases_per_pallet;
        }

        let newPalletSpaceForItem = 0;
        if (product.cases_per_pallet > 0) {
            newPalletSpaceForItem = totalCases / product.cases_per_pallet;
        }

        const potentialTotalPalletSpace =
            (currentMultiQuote.truckCapacity.totalPalletSpace - oldPalletSpaceForItem) +
            newPalletSpaceForItem;

        if (potentialTotalPalletSpace > TRUCK_PALLET_LIMIT) {
            showSQNotification(
                `Cannot confirm item. Exceeds truck capacity of ${TRUCK_PALLET_LIMIT} pallets.`,
                'warning',
                6000
            );
            return; // Detiene la función si se excede el límite
        }

        // --- Si todas las validaciones pasan, se ejecuta el resto de la lógica ---
        item.rawQuantity = rawQuantity;
        item.totalCases = totalCases;
        const costPerCase = parseFloat(product.costo_base) || 0;
        const labelingCost = parseFloat(labelingValue);
        const docsCost = parseFloat(docsValue);
        const subtotalBeforeCommission =
            (costPerCase + labelingCost + docsCost) * item.totalCases;
        const commissionPercent = parseFloat(commissionValue);
        const commissionAmount =
            subtotalBeforeCommission * (commissionPercent / 100);
        const totalMXN = subtotalBeforeCommission + commissionAmount;
        const totalUSD = totalMXN / currentMultiQuote.exchangeRate;
        item.totals = {
            subtotal: subtotalBeforeCommission,
            commission: commissionAmount,
            totalMXN: totalMXN,
            totalUSD: totalUSD,
            pricePerCaseUSD: item.totalCases > 0 ? totalUSD / item.totalCases : 0,
            costPerCase,
            labelingCost,
            docsCost,
            commissionPercent,
        };
        item.isCompleted = true;
        updateTruckCapacity();
        showSQNotification(`Item "${item.product.name}" confirmed!`, "success");
        renderMultiItemList();
        const nextItem = currentMultiQuote.items.find((i) => !i.isCompleted);
        if (nextItem) {
            loadMultiItemForm(nextItem.product.id);
        } else {
            activeMultiItemId = null;
            multiFormPlaceholder.style.display = "flex";
            multiFormContainer.style.display = "none";
            if (saveMultiItemBtn) saveMultiItemBtn.style.display = "none";
            showSQNotification(
                "All items configured! Ready to save full quotation.",
                "info"
            );
        }
    }

    function checkIfMultiQuoteCanBeSaved() {
        if (!saveFullQuoteBtn) return;
        const allCompleted = currentMultiQuote.items.every(
            (item) => item.isCompleted
        );
        saveFullQuoteBtn.disabled = !(
            currentMultiQuote.items.length > 0 && allCompleted
        );
    }

    async function saveMultiQuote(event) {
        event.preventDefault();

        // --- BLOQUE DE VALIDACIÓN AÑADIDO ---
        // Obtenemos el valor actual del selector de tipo de transporte.
        const transportType = multiTransportTypeSelect.value;

        // Comprobamos si el tipo de transporte sigue siendo 'none' (la opción por defecto).
        if (transportType === 'none') {
            // Si la validación falla (sigue en 'none'):
            // 1. Mostramos una notificación de advertencia al usuario.
            showSQNotification(
                'Please define the transportation details before saving the quotation.',
                'warning',
                5000 // Duración extendida para dar tiempo a leer
            );
            // 2. (Opcional, pero recomendado) Ponemos el foco en el selector para guiar al usuario.
            multiTransportTypeSelect.focus();

            // 3. (MUY IMPORTANTE) Detenemos la ejecución de la función aquí para evitar que se guarde.
            return;
        }
        // --- FIN DEL BLOQUE DE VALIDACIÓN ---


        // Si la validación de arriba es exitosa, el resto del código (tu lógica original) se ejecuta sin cambios.
        if (!currentUserSQ)
            return showSQNotification("Please be logged in to save.", "error");

        saveFullQuoteBtn.disabled = true;
        saveFullQuoteBtn.innerHTML =
            "<i class='bx bx-loader-alt bx-spin'></i> Saving...";

        let grandTotalMXN = 0;
        let totalCommission = 0;
        currentMultiQuote.items.forEach((item) => {
            grandTotalMXN += item.totals.totalMXN;
            totalCommission += item.totals.commission;
        });

        const transportPrice = parseFloat(multiTransportPriceInput.value) || 0;
        currentMultiQuote.transport = {
            type: multiTransportTypeSelect.value,
            name: multiTransportNameInput.value.trim(),
            cost: parseFloat(multiTransportCostInput.value) || 0,
            margin: parseFloat(multiTransportMarginInput.value) || 0,
            price: transportPrice,
        };
        grandTotalMXN += transportPrice;

        currentMultiQuote.totals = {
            totalMXN: grandTotalMXN,
            totalUSD: grandTotalMXN / currentMultiQuote.exchangeRate,
            commission: totalCommission,
            commissionPercent:
                currentMultiQuote.items[0]?.totals.commissionPercent || 0,
        };

        currentMultiQuote.type = "multi";

        const quoteToSave = {
            user_id: currentUserSQ.id,
            user_email: currentUserSQ.email,
            product_id: null,
            product_name: `${currentMultiQuote.items.length} items`,
            quote_data: currentMultiQuote,
        };

        const { data, error } = await supabase
            .from(QUOTES_TABLE)
            .insert(quoteToSave)
            .select()
            .single();

        saveFullQuoteBtn.innerHTML =
            "<i class='bx bx-save'></i> Save Full Quotation";

        if (error) {
            console.error("Error saving multi-quote:", error);
            showSQNotification(`Error saving quote: ${error.message}`, "error");
            saveFullQuoteBtn.disabled = false;
        } else {
            showSQNotification(
                `Multi-item Quote #${data.id} saved successfully!`,
                "success"
            );
            const savedQuoteData = JSON.parse(JSON.stringify(currentMultiQuote));
            savedQuoteData.savedId = data.id;
            downloadMultiPdfBtn.quoteData = savedQuoteData;
            renderQuotePreview(savedQuoteData, "multi");
            resetMultiQuoteCreator();
        }
    }

    function downloadQuoteAsPDF(quoteObject, viewType = "single") {
        if (typeof html2pdf === "undefined")
            return showSQNotification("PDF library is not loaded.", "error");
        if (!quoteObject)
            return showSQNotification("No quote data to download.", "error");
        const printContainer = document.createElement("div");
        printContainer.style.position = "absolute";
        printContainer.style.left = "-9999px";
        printContainer.style.width = "8.5in";
        printContainer.classList.add("pdf-render-mode");
        document.body.appendChild(printContainer);
        const { companyName, totals, transport, exchangeRate, items, quantity } =
            quoteObject;
        const isMulti = viewType === "multi";
        let totalServices = 0;
        let itemsHtmlPdf = "";
        if (isMulti) {
            items.forEach((item) => {
                const effectiveQuantity = item.totalCases || item.quantity;
                itemsHtmlPdf += `<tr><td>${item.product.name
                    }</td><td class="text-right">${item.totals.costPerCase.toFixed(
                        2
                    )}</td><td class="text-right">${effectiveQuantity.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 2 }
                    )} (cases)</td><td class="text-right">${(
                        item.totals.costPerCase * effectiveQuantity
                    ).toFixed(2)}</td></tr>`;
                totalServices +=
                    (item.totals.labelingCost + item.totals.docsCost) *
                    effectiveQuantity +
                    item.totals.commission;
            });
        } else {
            itemsHtmlPdf = `<tr><td>${quoteObject.product.name
                }</td><td class="text-right">${totals.costPerCase.toFixed(
                    2
                )}</td><td class="text-right">${quantity.toLocaleString()}</td><td class="text-right">${(
                    totals.costPerCase * quantity
                ).toFixed(2)}</td></tr>`;
            totalServices =
                (totals.labelingCost + totals.docsCost) * quantity + totals.commission;
        }
        if (totalServices > 0) {
            const unitServicesCost = totalServices / (isMulti ? 1 : quantity);
            const serviceQuantity = isMulti ? 1 : quantity.toLocaleString();
            itemsHtmlPdf += `<tr class="item-details-row"><td>Services</td><td class="text-right">${unitServicesCost.toFixed(
                2
            )}</td><td class="text-right">${serviceQuantity}</td><td class="text-right">${totalServices.toFixed(
                2
            )}</td></tr>`;
        }
        const transportHtmlPdf =
            transport && transport.price > 0
                ? `<tr><td>Transportation (${transport.name || transport.type
                })</td><td colspan="2" style="text-align:center;">-</td><td class="text-right">${transport.price.toFixed(
                    2
                )}</td></tr>`
                : "";
        const perItemTotalsPdf = isMulti
            ? `<table class="sq-price-breakdown-table"><thead><tr><th>Item</th><th class="text-right">Price/Case (USD)</th><th class="text-right">Price/Piece (USD)</th></tr></thead><tbody>${items
                .map(
                    (item) =>
                        `<tr><td>${item.product.name
                        }</td><td class="text-right">$${item.totals.pricePerCaseUSD.toFixed(
                            2
                        )}</td><td class="text-right">$${(
                            item.totals.pricePerCaseUSD /
                            (item.product.pieces_per_case || 1)
                        ).toFixed(4)}</td></tr>`
                )
                .join("")}</tbody></table>`
            : `<div class="footer-item"><span class="footer-label">Price per Case (USD):</span><span class="footer-value">$${(
                totals.pricePerCaseUSD || 0
            ).toFixed(
                2
            )}</span></div><div class="footer-item"><span class="footer-label">Price per Piece (USD):</span><span class="footer-value">$${(
                totals.pricePerPieceUSD || 0
            ).toFixed(4)}</span></div>`;
        const footerStyle = isMulti
            ? `style="flex-direction: column; gap: 1.5rem;"`
            : "";
        const footerRightStyle = isMulti
            ? `style="order: 1; align-self: flex-end; max-width: 50%; min-width: 300px; width: 100%;"`
            : "";
        const footerLeftStyle = isMulti ? `style="order: 2; width: 100%;"` : "";
        const footerRightHtml = `<div class="sq-preview-footer-right" ${footerRightStyle}><div class="footer-item"><span class="footer-label">Total (MXN):</span><span class="footer-value">${(
            totals.totalMXN || 0
        ).toFixed(
            2
        )}</span></div><div class="footer-item grand-total"><span class="footer-label">Total Estimate (USD):</span><span class="footer-value">$${(
            totals.totalUSD || 0
        ).toFixed(2)}</span></div></div>`;
        const footerLeftHtml = `<div class="sq-preview-footer-left" ${footerLeftStyle}>${perItemTotalsPdf}<div class="footer-item exchange-rate">Exchange rate used: 1 USD ≈ ${exchangeRate.toFixed(
            4
        )} MXN</div></div>`;
        const pdfHtml = `<div class="sq-preview-invoice-box"><div class="sq-preview-top-section"><div class="sq-preview-company-info"><strong>Quotation Estimate For: ${companyName || "N/A"
            }</strong><span>Generated on: ${new Date().toLocaleDateString()}</span></div></div><div class="sq-preview-details-section"><strong>Quote Type:</strong> ${isMulti ? "Multi-Item" : "Single Product"
            }<br>${isMulti
                ? `<strong>Total Items:</strong> ${items.length}`
                : `<strong>Product:</strong> ${quoteObject.product.name
                }<br><strong>Quantity:</strong> ${quantity.toLocaleString()} case(s)`
            }</div><table class="sq-preview-items-table"><thead><tr><th>Description</th><th class="text-right">Unit Cost (MXN)</th><th class="text-right">Quantity</th><th class="text-right">Total (MXN)</th></tr></thead><tbody>${itemsHtmlPdf}${transportHtmlPdf}</tbody></table><div class="sq-preview-footer" ${footerStyle}>${footerLeftHtml}${footerRightHtml}</div></div>`;
        printContainer.innerHTML = pdfHtml;
        const contentToPrint = printContainer.querySelector(
            ".sq-preview-invoice-box"
        );
        const opt = {
            margin: [0.3, 0.25],
            filename: `Quote_${(quoteObject.companyName || "Multi-Item").replace(
                /\s/g,
                "_"
            )}_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 1, useCORS: true },
            jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        };
        html2pdf()
            .from(contentToPrint)
            .set(opt)
            .save()
            .then(() => {
                document.body.removeChild(printContainer);
                const modalToClose = isMulti ? viewMultiQuoteModal : viewQuoteModal;
                if (
                    modalToClose.style.display === "flex" ||
                    modalToClose.classList.contains("open")
                ) {
                    closeModal(modalToClose);
                }
                softResetToModeSelection();
            })
            .catch((err) => {
                console.error("PDF generation failed", err);
                document.body.removeChild(printContainer);
                showSQNotification("An error occurred during PDF generation.", "error");
            });
    }

    function populateHistoryFilters() {
        const years = [
            ...new Set(
                quotesHistoryCache.map((q) => new Date(q.created_at).getFullYear())
            ),
        ].sort((a, b) => b - a);
        const users = [
            ...new Set(quotesHistoryCache.map((q) => q.user_email)),
        ].sort();
        histYearSelect.innerHTML = '<option value="all">All Years</option>';
        years.forEach(
            (y) => (histYearSelect.innerHTML += `<option value="${y}">${y}</option>`)
        );
        histUserSelect.innerHTML = '<option value="all">All Users</option>';
        users.forEach(
            (u) => (histUserSelect.innerHTML += `<option value="${u}">${u}</option>`)
        );
        histMonthSelect.innerHTML = '<option value="all">All Months</option>';
        for (let i = 0; i < 12; i++) {
            histMonthSelect.innerHTML += `<option value="${i}">${new Date(
                0,
                i
            ).toLocaleString("default", { month: "long" })}</option>`;
        }
    }

    function applyHistoryFilters() {
        if (!historyDataTable) return;
        const year = histYearSelect.value;
        const month = histMonthSelect.value;
        const user = histUserSelect.value;
        const filteredData = quotesHistoryCache.filter((q) => {
            const date = new Date(q.created_at);
            const yearMatch = year === "all" || date.getFullYear() == year;
            const monthMatch = month === "all" || date.getMonth() == month;
            const userMatch = user === "all" || q.user_email === user;
            return yearMatch && monthMatch && userMatch;
        });
        historyDataTable.clear().rows.add(filteredData).draw();
    }

    function initializeModule() {
        setupEventListeners();

        const trailerGrid = document.getElementById("sq-trailer-grid");
        if (trailerGrid) {
            trailerGrid.innerHTML = "";
            for (let i = 0; i < TRUCK_PALLET_LIMIT; i++) {
                const slot = document.createElement("div");
                slot.className = "sq-trailer-slot";
                slot.innerHTML = `
                    <div class="sq-slot-fill"></div>
                    <span class="sq-slot-number">${i + 1}</span>
                `;
                trailerGrid.appendChild(slot);
            }
        }

        const handleAuthChange = (event) => {
            currentUserSQ = event.detail?.user || null;
            if (currentUserSQ) {
                fetchInitialData();
            } else {
                hardResetCreator();
                productsCache = [];
            }
        };
        const cleanupModule = () => {
            if (historyDataTable) {
                $(historyTableElement).DataTable().destroy();
                $(historyTableElement).empty();
                historyDataTable = null;
            }
            if (productsDataTable) {
                $(productsTableElement).DataTable().destroy();
                $(productsTableElement).empty();
                productsDataTable = null;
            }
            document.removeEventListener("supabaseAuthStateChange", handleAuthChange);
            document.removeEventListener("moduleWillUnload", cleanupModule);
            document.body.dataset.quotingModuleInitialized = "false";
            console.log("Quoting Module Unloaded and Cleaned Up");
        };
        document.addEventListener("supabaseAuthStateChange", handleAuthChange);
        document.addEventListener("moduleWillUnload", cleanupModule);
        supabase.auth.getSession().then(({ data: { session } }) => {
            currentUserSQ = session ? session.user : null;
            if (currentUserSQ) {
                fetchInitialData();
            }
        });
        hardResetCreator();
    }

    initializeModule();
})();
