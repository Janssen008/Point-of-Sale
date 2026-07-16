// ApexMoto POS - Core Application Logic

class ApexMotoPOS {
  constructor() {
    this.parts = [];
    this.customers = [];
    this.serviceJobs = [];
    this.transactions = [];
    this.mechanics = [];
    
    this.cart = [];
    this.selectedCustomer = null;
    this.activeView = 'dashboard';
    
    // Toast notification queue
    this.toasts = [];

    // Current active entity IDs for modals
    this.editingPartId = null;
    this.editingCustomerId = null;
    this.editingMechanicId = null;
    this.activeJobId = null;

    // Loading state
    this.isLoading = false;
    
    // Auth State
    this.currentUser = null;
  }

  async init() {
    this.setupEventListeners();
    this.startClock();
    this.showLoadingOverlay(true);
    try {
      await this.loadData();
      this.switchView('login');
      this.showToast("Connected to Supabase — Data Loaded", "success");
    } catch (err) {
      console.error('Supabase init error:', err);
      this.showToast("Failed to connect to database. Check supabase.js config.", "danger");
    } finally {
      this.showLoadingOverlay(false);
    }
  }

  // Load all data from Supabase
  async loadData() {
    const [parts, customers, serviceJobs, transactions, mechanics] = await Promise.all([
      DB.getParts(),
      DB.getCustomers(),
      DB.getServiceJobs(),
      DB.getTransactions(),
      DB.getMechanics(),
    ]);
    this.parts = parts;
    this.customers = customers;
    this.serviceJobs = serviceJobs;
    this.transactions = transactions;
    this.mechanics = mechanics || [];
  }

  // Show/hide loading overlay
  showLoadingOverlay(show) {
    let overlay = document.getElementById('db-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'db-loading-overlay';
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9999',
        'background:rgba(10,12,16,0.92)', 'display:flex',
        'flex-direction:column', 'align-items:center',
        'justify-content:center', 'gap:16px',
        'font-family:var(--font-display)',
        'color:var(--text-primary)', 'font-size:1.1rem',
      ].join(';');
      overlay.innerHTML = `
        <div style="width:48px;height:48px;border:3px solid rgba(255,95,31,0.2);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite"></div>
        <div>Connecting to Supabase&hellip;</div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      `;
      document.body.appendChild(overlay);
    }
    overlay.style.display = show ? 'flex' : 'none';
  }

  // Setup UI event bindings
  setupEventListeners() {
    // Sidebar view switches
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // POS Search & Category Filter
    const posSearchInput = document.getElementById('pos-search-input');
    if (posSearchInput) {
      posSearchInput.addEventListener('input', () => this.renderPOSCatalog());
    }
    const posSearchClear = document.getElementById('pos-search-clear');
    if (posSearchClear) {
      posSearchClear.addEventListener('click', () => {
        posSearchInput.value = '';
        this.renderPOSCatalog();
      });
    }

    // POS Cart Discount Input
    const discountInput = document.getElementById('cart-discount-input');
    if (discountInput) {
      discountInput.addEventListener('input', () => this.calculateCartTotals());
    }

    // Service Search
    const serviceSearchInput = document.getElementById('service-search-input');
    if (serviceSearchInput) {
      serviceSearchInput.addEventListener('input', () => this.renderServiceBoard());
    }
    const serviceSearchClear = document.getElementById('service-search-clear');
    if (serviceSearchClear) {
      serviceSearchClear.addEventListener('click', () => {
        serviceSearchInput.value = '';
        this.renderServiceBoard();
      });
    }

    // Inventory Filters & Searches
    const invSearchInput = document.getElementById('inv-search-input');
    if (invSearchInput) {
      invSearchInput.addEventListener('input', () => this.renderInventoryTable());
    }
    const invCatFilter = document.getElementById('inv-category-filter');
    if (invCatFilter) {
      invCatFilter.addEventListener('change', () => this.renderInventoryTable());
    }

    // CRM Customer Search
    const custSearchInput = document.getElementById('cust-search-input');
    if (custSearchInput) {
      custSearchInput.addEventListener('input', () => this.renderCustomerCRMList());
    }

    // POS Customer Search (Modal)
    const posCustSearch = document.getElementById('pos-cust-search');
    if (posCustSearch) {
      posCustSearch.addEventListener('input', () => this.renderPOSCustomerSelectionList());
    }

    // Cash Calculator for Checkout Modal
    const cashRec = document.getElementById('cash-received');
    if (cashRec) {
      cashRec.addEventListener('input', () => this.calculateCashChange());
    }

    // Add Part Modal Form Submission
    const savePartBtn = document.getElementById('btn-save-part');
    if (savePartBtn) {
      savePartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.savePartForm();
      });
    }

    // Handle Barcode Scanner "Enter" inside SKU field
    const partSkuInput = document.getElementById('part-sku');
    if (partSkuInput) {
      partSkuInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); // Prevent form submission
          document.getElementById('part-name').focus(); // Jump to next field
        }
      });
    }

    // Add Customer Form Submission
    const saveCustBtn = document.getElementById('btn-save-customer');
    if (saveCustBtn) {
      saveCustBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.saveCustomerForm();
      });
    }

    // Add Mechanic Form Submission
    const saveMechBtn = document.getElementById('btn-save-mechanic');
    if (saveMechBtn) {
      saveMechBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.saveMechanicForm();
      });
    }

    // Add Labor Form Submission
    const saveLaborBtn = document.getElementById('btn-save-labor');
    if (saveLaborBtn) {
      saveLaborBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.saveLaborForm();
      });
    }

    // Check-in intake Customer select change
    const checkinCustSelect = document.getElementById('checkin-customer-select');
    if (checkinCustSelect) {
      checkinCustSelect.addEventListener('change', () => {
        this.updateCheckinVehicleDropdown(checkinCustSelect.value);
      });
    }

    // Check-in intake save
    const saveCheckinBtn = document.getElementById('btn-save-checkin');
    if (saveCheckinBtn) {
      saveCheckinBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.saveCheckinForm();
      });
    }

    // Payment Methods Selection in Checkout
    document.querySelectorAll('.pm-option').forEach(label => {
      label.addEventListener('click', () => {
        document.querySelectorAll('.pm-option').forEach(l => l.classList.remove('selected'));
        label.classList.add('selected');
        const radio = label.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          this.toggleCashCalculator(radio.value);
        }
      });
    });

    // Close modals on clicking overlay background
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

    // Global Keyboard Shortcuts (F-keys)
    window.addEventListener('keydown', (e) => {
      const fKeys = ['F1', 'F2', 'F3', 'F4', 'F6', 'F9', 'F10', 'F12'];
      if (fKeys.includes(e.key)) {
        e.preventDefault();
        
        switch (e.key) {
          case 'F1':
            this.switchView('dashboard');
            this.showToast("Switched to Dashboard [F1]", "info");
            break;
          case 'F2':
            this.switchView('pos');
            this.showToast("Switched to Point of Sale [F2]", "info");
            break;
          case 'F3':
            this.switchView('service');
            this.showToast("Switched to Service Board [F3]", "info");
            break;
          case 'F4':
            this.switchView('inventory');
            this.showToast("Switched to Inventory Database [F4]", "info");
            break;
          case 'F6':
            this.switchView('customers');
            this.showToast("Switched to Customer CRM [F6]", "info");
            break;
          case 'F9':
            if (this.activeView === 'pos') {
              this.openCheckoutModal();
            } else if (this.activeJobId) {
              this.invoiceAndPayWorkOrder();
            } else {
              this.showToast("[F9] Pay only active in POS checkout or active Work Order", "warning");
            }
            break;
          case 'F10':
            if (this.activeView === 'pos') {
              this.clearCart();
            } else {
              this.showToast("[F10] Clear Cart only active in POS checkout", "warning");
            }
            break;
          case 'F12':
            const receiptModal = document.getElementById('modal-receipt');
            if (receiptModal && receiptModal.classList.contains('active')) {
              this.printReceipt();
            } else {
              this.showToast("[F12] Print Receipt only active when receipt modal is open", "warning");
            }
            break;
        }
      }
    });

    // Initialize Cashier Numpad, Hold/Recall, and Keyboard Wedge Barcode Scanner
    this.setupNumpad();
    this.setupHoldRecall();
    this.setupBarcodeScanner();
  }

  startClock() {
    const clockEl = document.getElementById('live-clock');
    const updateTime = () => {
      // Simulate real-time progress starting from user prompt base of 2026-07-15 10:06:20
      const now = new Date();
      // Format: YYYY-MM-DD HH:MM:SS
      const pad = (n) => n.toString().padStart(2, '0');
      const timeStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      if (clockEl) clockEl.textContent = timeStr;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // Toast System
  showToast(message, type = 'info') {
    const holder = document.getElementById('toast-holder');
    if (!holder) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Select Icon based on Type
    let icon = '';
    if (type === 'success') icon = '✓';
    else if (type === 'danger') icon = '𐄂';
    else if (type === 'warning') icon = '⚠';
    else icon = 'ℹ';

    toast.innerHTML = `<span style="font-weight: bold; font-size: 1.1rem;">${icon}</span> <span>${message}</span>`;
    holder.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'opacity 0.4s, transform 0.4s';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // --- AUTHENTICATION MODULE ---
  handleLogin() {
    const pin = document.getElementById('login-pin-input').value.trim();
    if (pin === '1234') {
      this.currentUser = { name: 'Pew Miller', role: 'admin', initial: 'PM' };
    } else if (pin === '0000') {
      this.currentUser = { name: 'Staff User', role: 'staff', initial: 'SU' };
    } else {
      this.showToast("Invalid PIN. Please try again.", "danger");
      document.getElementById('login-pin-input').value = '';
      return;
    }

    // Update Header Profile
    document.getElementById('current-user-avatar').textContent = this.currentUser.initial;
    document.getElementById('current-user-name').textContent = this.currentUser.name;

    // Apply RBAC UI Restrictions
    const restrictedItems = document.querySelectorAll('.sidebar-menu .menu-item[data-view="dashboard"], .sidebar-menu .menu-item[data-view="inventory"], .sidebar-menu .menu-item[data-view="mechanics"], .sidebar-menu .menu-item[data-view="sales-history"]');
    if (this.currentUser.role === 'staff') {
      restrictedItems.forEach(item => item.style.display = 'none');
      this.switchView('pos'); // Default for staff
    } else {
      restrictedItems.forEach(item => item.style.display = 'flex');
      this.switchView('dashboard'); // Default for admin
    }

    this.showToast(`Logged in as ${this.currentUser.name}`, "success");
  }

  logout() {
    this.currentUser = null;
    this.switchView('login');
    this.showToast("Successfully logged out", "info");
  }

  // View Manager Router
  switchView(viewId) {
    if (viewId === 'login') {
      document.body.classList.add('login-mode');
      this.activeView = 'login';
      setTimeout(() => {
        const pinInput = document.getElementById('login-pin-input');
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
      }, 50);
    } else {
      document.body.classList.remove('login-mode');
      
      // RBAC Check
      if (this.currentUser && this.currentUser.role === 'staff') {
        const restrictedViews = ['dashboard', 'inventory', 'mechanics', 'sales-history'];
        if (restrictedViews.includes(viewId)) {
          this.showToast("Access Denied: Staff cannot access this module.", "danger");
          return;
        }
      }
      this.activeView = viewId;
    }
    
    // Update Sidebar states
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
      if (item.getAttribute('data-view') === viewId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update Panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      if (panel.id === `view-${viewId}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Header Title
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      const titles = {
        dashboard: "Dashboard Overview",
        pos: "Point of Sale (Cart Checkout)",
        service: "Service & Repair Board",
        'sales-history': "Sales History & Past Receipts",
        inventory: "Parts Inventory Database",
        customers: "Customer CRM & History",
        mechanics: "Mechanics & Labor"
      };
      titleEl.textContent = titles[viewId] || "Management Panel";
    }

    // Cashier UI Overhaul: Auto-focus search bar on POS tab
    if (viewId === 'pos') {
      setTimeout(() => {
        const searchInput = document.getElementById('pos-search-input');
        if (searchInput) searchInput.focus();
      }, 80);
    }

    // Refresh view data
    this.refreshViewData(viewId);
  }

  refreshViewData(viewId) {
    switch (viewId) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'pos':
        this.renderPOSCatalog();
        this.renderPOSCart();
        break;
      case 'service':
        this.renderServiceBoard();
        break;
      case 'inventory':
        this.renderInventoryTable();
        this.populateInventoryCategoryDropdown();
        break;
      case 'customers':
        this.renderCustomerCRMList();
        break;
      case 'sales-history':
        this.renderSalesHistory();
        break;
      case 'mechanics':
        this.renderMechanicList();
        break;
    }
  }

  // ==========================================
  // VIEW RENDERERS
  // ==========================================

  // --- Dashboard Renderer ---
  renderDashboard() {
    // 1. Metric Counts
    const today = new Date().toDateString();
    const todayTx = this.transactions.filter(tx => new Date(tx.date).toDateString() === today);

    // --- Sales Income: sum of all item prices EXCLUDING labor line items ---
    let salesIncome = 0;
    let laborIncome = 0;
    todayTx.forEach(tx => {
      (tx.items || []).forEach(item => {
        if (item.id === 'labor') {
          laborIncome += item.price * (item.quantity || 1);
        } else {
          salesIncome += item.price * (item.quantity || 1);
        }
      });
    });

    const totalIncome = salesIncome + laborIncome;
    const activeJobs = this.serviceJobs.filter(job => job.status !== 'Completed').length;
    const lowStock = this.parts.filter(p => p.stock <= p.minStock).length;
    const retailTxCount = todayTx.filter(t => t.type === 'Retail').length;
    const serviceTxCount = todayTx.filter(t => t.type === 'Service').length;

    document.getElementById('dash-today-sales').textContent = `₱${salesIncome.toFixed(2)}`;
    document.getElementById('dash-sales-breakdown').textContent =
      `${retailTxCount} retail + ${serviceTxCount} service tx`;

    document.getElementById('dash-today-labor').textContent = `₱${laborIncome.toFixed(2)}`;
    document.getElementById('dash-labor-breakdown').textContent =
      laborIncome > 0 ? `From ${todayTx.filter(t => (t.items||[]).some(i => i.id === 'labor')).length} job(s)` : 'No labor recorded today';

    document.getElementById('dash-today-total').textContent = `₱${totalIncome.toFixed(2)}`;
    document.getElementById('dash-total-txcount').textContent =
      `${todayTx.length} transaction${todayTx.length !== 1 ? 's' : ''} today`;

    document.getElementById('dash-active-jobs').textContent = activeJobs;
    document.getElementById('dash-low-stock-info').textContent =
      lowStock > 0 ? `${lowStock} item${lowStock > 1 ? 's' : ''} low/out of stock` : 'All stock levels OK';


    // 2. Weekly chart rendering (CSS flex bars)
    this.renderDashboardChart();

    // 3. Recent Transactions
    const recentTxContainer = document.getElementById('dash-recent-sales');
    recentTxContainer.innerHTML = '';
    const sortedTx = [...this.transactions].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    
    if (sortedTx.length === 0) {
      recentTxContainer.innerHTML = `<div style="text-align:center; padding: 20px; color:var(--text-muted);">No Transactions yet.</div>`;
    } else {
      sortedTx.forEach(tx => {
        const dateObj = new Date(tx.date);
        const timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const typeBadge = tx.type === 'Service' 
          ? `<span class="badge badge-info" style="font-size:0.6rem; padding: 2px 6px;">Service</span>`
          : `<span class="badge badge-secondary" style="font-size:0.6rem; padding: 2px 6px;">Retail</span>`;
        
        const div = document.createElement('div');
        div.className = 'sale-item';
        div.innerHTML = `
          <div class="sale-desc">
            <div class="sale-name">${tx.customerName || "Walk-in Customer"} ${typeBadge}</div>
            <div class="sale-meta">${tx.id} • ${timeStr}</div>
          </div>
          <div class="sale-amount" style="color:${tx.type === 'Service' ? 'var(--success)' : 'var(--text-primary)'}">+₱${tx.total.toFixed(2)}</div>
        `;
        recentTxContainer.appendChild(div);
      });
    }

    // 4. Alerts
    const alertsContainer = document.getElementById('dash-alerts-container');
    alertsContainer.innerHTML = '';
    
    const warningParts = this.parts.filter(p => p.stock <= p.minStock);
    const jobsPendingParts = this.serviceJobs.filter(j => j.status === 'Pending Parts');

    if (warningParts.length === 0 && jobsPendingParts.length === 0) {
      alertsContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--text-muted);">
          <div style="font-size: 1.5rem; margin-bottom: 6px;">✓</div>
          <p style="font-size: 0.8rem;">All motorcycle parts stocked and service bays clear.</p>
        </div>
      `;
    } else {
      // Out of Stock Alerts
      warningParts.forEach(p => {
        const isOut = p.stock === 0;
        const div = document.createElement('div');
        div.className = `alert-item ${isOut ? 'danger-alert' : ''}`;
        div.innerHTML = `
          <div>
            <div style="font-weight: 600;">${isOut ? 'OUT OF STOCK' : 'LOW STOCK ALERT'}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${p.name}</div>
          </div>
          <div style="font-weight:700;">Qty: ${p.stock}/${p.minStock}</div>
        `;
        alertsContainer.appendChild(div);
      });

      // Pending Parts Alerts
      jobsPendingParts.forEach(j => {
        const div = document.createElement('div');
        div.className = 'alert-item';
        div.innerHTML = `
          <div>
            <div style="font-weight: 600; color: var(--warning);">SERVICE BLOCKED</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${j.id} for ${j.customerName} awaits parts allocation.</div>
          </div>
          <button class="btn btn-secondary btn-sm btn-icon-only" onclick="app.openManageJobModal('${j.id}')">⚙</button>
        `;
        alertsContainer.appendChild(div);
      });
    }

    // 5. Dashboard Table (Recent service jobs)
    const tableBody = document.getElementById('dash-service-table');
    tableBody.innerHTML = '';
    const activeJobsList = this.serviceJobs.filter(j => j.status !== 'Completed').slice(0, 5);

    if (activeJobsList.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No active service shop requests.</td></tr>`;
    } else {
      activeJobsList.forEach(job => {
        // Calculate service cost
        const partsTotal = job.parts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
        const grandTotal = partsTotal + job.laborCost;
        const statusBadge = this.getStatusBadge(job.status);

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => this.openManageJobModal(job.id));
        tr.innerHTML = `
          <td><span style="font-weight:700; color:var(--accent);">${job.id}</span></td>
          <td>${job.customerName}</td>
          <td style="font-size:0.8rem; color:var(--text-secondary);">${job.vehicle}</td>
          <td>${job.mechanic}</td>
          <td>${statusBadge}</td>
          <td style="text-align:right; font-weight:700;">₱${grandTotal.toFixed(2)}</td>
        `;
        tableBody.appendChild(tr);
      });
    }
  }

  // Custom Weekly chart builder
  renderDashboardChart() {
    const chartContainer = document.getElementById('weekly-chart-container');
    if (!chartContainer) return;
    chartContainer.innerHTML = '';

    const days = [];
    const dateLabels = [];
    const dateToday = new Date("2026-07-15T10:06:20+08:00");

    // Populate last 7 days starting from today backwards
    for (let i = 6; i >= 0; i--) {
      const d = new Date(dateToday);
      d.setDate(d.getDate() - i);
      days.push(d.toDateString());
      
      const label = d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
      dateLabels.push(label);
    }

    // Sum transaction totals per day
    const salesData = days.map(dayStr => {
      return this.transactions
        .filter(tx => new Date(tx.date).toDateString() === dayStr)
        .reduce((sum, tx) => sum + tx.total, 0);
    });

    const maxVal = Math.max(...salesData, 100); // Minimum scale limit of 100

    salesData.forEach((val, index) => {
      const heightPercent = (val / maxVal) * 85; // Capped at 85% to fit headers
      const barWrapper = document.createElement('div');
      barWrapper.style.display = 'flex';
      barWrapper.style.flexDirection = 'column';
      barWrapper.style.alignItems = 'center';
      barWrapper.style.height = '100%';
      barWrapper.style.flexGrow = '1';
      barWrapper.style.gap = '8px';

      barWrapper.innerHTML = `
        <div style="font-size: 0.75rem; font-weight: 600; color:${val > 0 ? 'var(--accent)' : 'var(--text-muted)'};">₱${val.toFixed(0)}</div>
        <div style="
          width: 28px; 
          height: ${heightPercent}%; 
          background: ${heightPercent > 0 ? 'linear-gradient(to top, var(--accent), #ff8f00)' : 'rgba(255,255,255,0.02)'}; 
          border-radius: 4px;
          min-height: 2px;
          box-shadow: ${val > 0 ? '0 0 10px rgba(255, 95, 31, 0.2)' : 'none'};
          transition: height 0.5s ease;
        " title="₱${val.toFixed(2)}"></div>
        <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 4px;">${dateLabels[index]}</div>
      `;
      chartContainer.appendChild(barWrapper);
    });
  }

  // --- POS Point of Sale Catalog ---
  renderPOSCatalog() {
    const categoryContainer = document.getElementById('pos-category-tabs');
    const catalogGrid = document.getElementById('pos-catalog-grid');
    const searchVal = document.getElementById('pos-search-input').value.toLowerCase().trim();

    // 1. Populate Category Tabs (Only if category tabs is empty)
    const categories = ['All', ...new Set(this.parts.map(p => p.category))];
    const currentActiveTab = categoryContainer.querySelector('.catalog-tab.active')?.getAttribute('data-category') || 'All';
    
    categoryContainer.innerHTML = '';
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `catalog-tab ${cat === currentActiveTab ? 'active' : ''}`;
      btn.setAttribute('data-category', cat);
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        categoryContainer.querySelectorAll('.catalog-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        this.renderPOSCatalog();
      });
      categoryContainer.appendChild(btn);
    });

    // 2. Filter Parts List
    let filteredParts = [];
    
    // Hide all items by default if 'All' is selected and no search is active
    if (currentActiveTab === 'All' && !searchVal) {
      filteredParts = [];
    } else {
      filteredParts = this.parts;
      if (currentActiveTab !== 'All') {
        filteredParts = filteredParts.filter(p => p.category === currentActiveTab);
      }
      if (searchVal) {
        filteredParts = filteredParts.filter(p => 
          p.name.toLowerCase().includes(searchVal) || 
          p.sku.toLowerCase().includes(searchVal) ||
          p.category.toLowerCase().includes(searchVal)
        );
      }
    }

    // 3. Render Parts Grid
    catalogGrid.innerHTML = '';
    if (filteredParts.length === 0) {
      if (currentActiveTab === 'All' && !searchVal) {
        catalogGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" style="opacity: 0.2; margin-bottom: 12px;"><path d="M4,6H6V18H4V6M7,6H8V18H7V6M9,6H12V18H9V6M13,6H14V18H13V6M16,6H18V18H16V6M19,6H20V18H19V6M2,4V8H0V4A2,2 0 0,1 2,2H6V4H2M22,2A2,2 0 0,1 24,4V8H22V4H18V2H22M2,16V20H6V22H2A2,2 0 0,1 0,20V16H2M22,20V16H24V20A2,2 0 0,1 22,22H18V20H22Z"/></svg>
            <div style="font-size: 1.1rem; margin-bottom: 4px; color: var(--text-secondary); font-weight: 600;">Scan item to begin</div>
            <div style="font-size: 0.85rem;">Scan a barcode, search, or select a category to view items.</div>
          </div>
        `;
      } else {
        catalogGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No parts found matching search filters.</div>`;
      }
      return;
    }

    filteredParts.forEach(p => {
      const card = document.createElement('div');
      const isOut = p.stock === 0;
      const isLow = p.stock <= p.minStock && p.stock > 0;
      
      card.className = `part-card ${isOut ? 'out-of-stock' : ''}`;
      
      let stockBadge = `<span class="part-stock-status badge badge-success">${p.stock} Available</span>`;
      if (isOut) {
        stockBadge = `<span class="part-stock-status badge badge-danger">Out of Stock</span>`;
      } else if (isLow) {
        stockBadge = `<span class="part-stock-status badge badge-warning">Low: ${p.stock} left</span>`;
      }

      card.innerHTML = `
        <div class="part-sku">${p.sku}</div>
        <div class="part-name" title="${p.name}">${p.name}</div>
        <div class="part-card-footer">
          <div class="part-price">₱${p.price.toFixed(2)}</div>
          ${stockBadge}
        </div>
      `;

      if (!isOut) {
        card.addEventListener('click', () => {
          this.addToCart(p.id);
          card.classList.add('item-added');
          setTimeout(() => card.classList.remove('item-added'), 400);
        });
      }
      catalogGrid.appendChild(card);
    });
  }

  // --- POS Shopping Cart Render ---
  renderPOSCart() {
    const container = document.getElementById('cart-items-container');
    container.innerHTML = '';

    // Customer status label
    const noCustEl = document.getElementById('cart-no-customer');
    const hasCustEl = document.getElementById('cart-has-customer');
    const loyaltyEl = document.getElementById('cart-customer-loyalty');
    if (this.selectedCustomer) {
      noCustEl.style.display = 'none';
      hasCustEl.style.display = 'flex';
      document.getElementById('cart-customer-name').textContent = this.selectedCustomer.name;
      const primaryVehicle = this.selectedCustomer.vehicles?.[0];
      document.getElementById('cart-customer-vehicle').textContent = primaryVehicle 
        ? `${primaryVehicle.year} ${primaryVehicle.make} ${primaryVehicle.model}`
        : "No registered vehicle";

      // Loyalty calculation
      const customerTx = this.transactions.filter(t => t.customerId === this.selectedCustomer.id);
      const totalSpent = customerTx.reduce((sum, t) => sum + t.total, 0);
      if (loyaltyEl) {
        if (totalSpent > 500) {
          loyaltyEl.textContent = `★ VIP CUSTOMER (₱${totalSpent.toFixed(0)} spent)`;
          loyaltyEl.style.display = 'inline-block';
        } else if (totalSpent > 100) {
          loyaltyEl.textContent = `★ LOYALTY MEMBER (₱${totalSpent.toFixed(0)} spent)`;
          loyaltyEl.style.display = 'inline-block';
        } else {
          loyaltyEl.style.display = 'none';
        }
      }
    } else {
      noCustEl.style.display = 'flex';
      hasCustEl.style.display = 'none';
      if (loyaltyEl) loyaltyEl.style.display = 'none';
    }

    // Items list
    if (this.cart.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 60px 10px; flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.15;"><path d="M17,18A2,2 0 0,1 19,20A2,2 0 0,1 17,22A2,2 0 0,1 15,20A2,2 0 0,1 17,18M7,18A2,2 0 0,1 9,20A2,2 0 0,1 7,22A2,2 0 0,1 5,20A2,2 0 0,1 7,18M7.2,14.63L7.17,14.58L9,11H15.5C16.27,11 16.94,10.58 17.27,9.94L21.18,2.83L19.44,1.88L15.55,9H9.82L4.27,2H1V4H3L6.6,11.59L5.25,14.04C5.09,14.32 5,14.65 5,15A2,2 0 0,0 7,17H19V15H7.42C7.29,15 7.17,14.89 7.17,14.75L7.2,14.63Z"/></svg>
          <div style="font-size: 0.95rem; font-weight: 600;">Terminal Awaiting Items</div>
          <p style="font-size: 0.8rem; opacity: 0.7;">Select parts from catalog or scan barcode to checkout.</p>
        </div>
      `;
      document.getElementById('cart-count').textContent = '0 Items';
      this.calculateCartTotals();
      return;
    }

    // Trigger bounce animation for cashier feedback
    this.triggerCartBounce();

    const totalQty = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').textContent = `${totalQty} Item${totalQty > 1 ? 's' : ''}`;

    this.cart.forEach(item => {
      const part = this.parts.find(p => p.id === item.partId);
      if (!part) return;

      const itemTotal = part.price * item.quantity;
      const card = document.createElement('div');
      card.className = 'cart-item';
      card.innerHTML = `
        <div class="cart-item-details">
          <div class="cart-item-name">${part.name}</div>
          <div class="cart-item-price">₱${part.price.toFixed(2)} each</div>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="app.updateCartQty('${part.id}', ${item.quantity - 1})">-</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="qty-btn" onclick="app.updateCartQty('${part.id}', ${item.quantity + 1})" ${item.quantity >= part.stock ? 'disabled' : ''}>+</button>
          </div>
        </div>
        <div class="cart-item-right">
          <button class="btn btn-danger btn-sm btn-icon-only" onclick="app.removeFromCart('${part.id}')" title="Delete">×</button>
          <div class="cart-item-total">₱${itemTotal.toFixed(2)}</div>
        </div>
      `;
      container.appendChild(card);
    });

    this.calculateCartTotals();
  }

  calculateCartTotals() {
    let subtotal = 0;
    this.cart.forEach(item => {
      const part = this.parts.find(p => p.id === item.partId);
      if (part) {
        subtotal += part.price * item.quantity;
      }
    });

    const discountInput = document.getElementById('cart-discount-input');
    let discount = parseFloat(discountInput ? discountInput.value : 0) || 0;
    if (discount < 0) discount = 0;
    if (discount > subtotal) {
      discount = subtotal;
      if (discountInput) discountInput.value = subtotal.toFixed(2);
    }

    const grandTotal = Math.max(0, subtotal - discount);

    document.getElementById('cart-subtotal').textContent = `₱${subtotal.toFixed(2)}`;
    document.getElementById('cart-total').textContent = `₱${grandTotal.toFixed(2)}`;
  }

  // --- Service Board Kanban Renderer ---
  renderServiceBoard() {
    const statuses = ['Draft', 'Pending Parts', 'In Progress', 'Testing', 'Ready'];
    const searchVal = document.getElementById('service-search-input').value.toLowerCase().trim();

    // Reset columns
    statuses.forEach(status => {
      const listEl = document.getElementById(`list-${status.replace(' ', '-')}`);
      if (listEl) listEl.innerHTML = '';
      const countEl = document.getElementById(`count-${status.replace(' ', '-')}`);
      if (countEl) countEl.textContent = '0';
    });

    const counts = { Draft: 0, 'Pending Parts': 0, 'In Progress': 0, Testing: 0, Ready: 0 };

    // Filter jobs
    let filteredJobs = this.serviceJobs;
    if (searchVal) {
      filteredJobs = filteredJobs.filter(j => 
        j.customerName.toLowerCase().includes(searchVal) || 
        j.vehicle.toLowerCase().includes(searchVal) || 
        j.mechanic.toLowerCase().includes(searchVal) ||
        j.id.toLowerCase().includes(searchVal)
      );
    }

    filteredJobs.forEach(job => {
      if (!counts.hasOwnProperty(job.status)) return; // Skip completed
      counts[job.status]++;

      const partsTotal = job.parts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
      const totalCost = partsTotal + job.laborCost;

      const card = document.createElement('div');
      card.className = 'job-card';
      card.addEventListener('click', () => this.openManageJobModal(job.id));
      card.innerHTML = `
        <div class="job-id">${job.id}</div>
        <div class="job-customer">${job.customerName}</div>
        <div class="job-bike">${job.vehicle}</div>
        <div class="job-mechanic">
          <svg viewBox="0 0 24 24"><path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/></svg>
          ${job.mechanic}
        </div>
        <div class="job-card-footer">
          <div style="font-size:0.75rem; color:var(--text-secondary);">${job.parts.length} part${job.parts.length !== 1 ? 's' : ''}</div>
          <div class="job-total">₱${totalCost.toFixed(2)}</div>
        </div>
      `;

      const listEl = document.getElementById(`list-${job.status.replace(' ', '-')}`);
      if (listEl) listEl.appendChild(card);
    });

    // Update headers counts
    statuses.forEach(status => {
      const countEl = document.getElementById(`count-${status.replace(' ', '-')}`);
      if (countEl) countEl.textContent = counts[status];
    });
  }

  // Helper badge builder
  getStatusBadge(status) {
    switch (status) {
      case 'Draft': return `<span class="badge badge-secondary">Intake</span>`;
      case 'Pending Parts': return `<span class="badge badge-danger">Awaiting Parts</span>`;
      case 'In Progress': return `<span class="badge badge-warning">Active Lift</span>`;
      case 'Testing': return `<span class="badge badge-info">Road Testing</span>`;
      case 'Ready': return `<span class="badge badge-success">Ready / Complete</span>`;
      case 'Completed': return `<span class="badge badge-success">Picked Up</span>`;
      default: return `<span class="badge badge-secondary">${status}</span>`;
    }
  }

  // --- Parts Inventory Table Renderer ---
  renderInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = '';

    const searchVal = document.getElementById('inv-search-input').value.toLowerCase().trim();
    const filterCat = document.getElementById('inv-category-filter').value;

    let filtered = this.parts;
    if (filterCat !== 'All') {
      filtered = filtered.filter(p => p.category === filterCat);
    }
    if (searchVal) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchVal) || 
        p.sku.toLowerCase().includes(searchVal) ||
        p.category.toLowerCase().includes(searchVal)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 30px; color:var(--text-muted);">No parts inventory matched filters.</td></tr>`;
      return;
    }

    filtered.forEach(p => {
      const markup = p.cost > 0 ? ((p.price - p.cost) / p.cost) * 100 : 0;
      
      const isOut = p.stock === 0;
      const isLow = p.stock <= p.minStock && p.stock > 0;
      
      let stockCell = `<span class="badge badge-success">${p.stock} units</span>`;
      if (isOut) stockCell = `<span class="badge badge-danger">Out (0)</span>`;
      else if (isLow) stockCell = `<span class="badge badge-warning">Low (${p.stock})</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:var(--text-primary); font-family:monospace;">${p.sku}</td>
        <td><div style="font-weight:600;">${p.name}</div></td>
        <td>${p.category}</td>
        <td style="text-align:right;">₱${p.cost.toFixed(2)}</td>
        <td style="text-align:right; font-weight:600; color:var(--accent);">₱${p.price.toFixed(2)}</td>
        <td style="text-align:right; color:var(--text-secondary);">${markup.toFixed(0)}%</td>
        <td style="text-align:center;">${stockCell}</td>
        <td style="text-align:center; color:var(--text-secondary);">${p.minStock} units</td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-secondary btn-sm btn-icon-only" onclick="app.printBarcode('${p.id}')" title="Print Barcode"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18,3H6V7H18M19,12A1,1 0 0,1 18,11A1,1 0 0,1 19,10A1,1 0 0,1 20,11A1,1 0 0,1 19,12M16,19H8V14H16M19,8H5A3,3 0 0,0 2,11V17H6V21H18V17H22V11A3,3 0 0,0 19,8Z"/></svg></button>
            <button class="btn btn-secondary btn-sm btn-icon-only" onclick="app.openPartModal('${p.id}')" title="Edit Part"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg></button>
            <button class="btn btn-danger btn-sm btn-icon-only" onclick="app.deletePart('${p.id}')" title="Delete Part">×</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  populateInventoryCategoryDropdown() {
    const select = document.getElementById('inv-category-filter');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="All">All Categories</option>';
    
    const categories = [...new Set(this.parts.map(p => p.category))].sort();
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });
    select.value = currentVal;
  }

  // --- Customers CRM View ---
  renderCustomerCRMList() {
    const listContainer = document.getElementById('crm-customer-list');
    listContainer.innerHTML = '';
    
    const searchVal = document.getElementById('cust-search-input').value.toLowerCase().trim();

    let filtered = this.customers;
    if (searchVal) {
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(searchVal) ||
        c.phone.toLowerCase().includes(searchVal) ||
        c.email.toLowerCase().includes(searchVal) ||
        c.vehicles.some(v => v.plate.toLowerCase().includes(searchVal) || v.model.toLowerCase().includes(searchVal))
      );
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px;">No customers found.</div>`;
      return;
    }

    const currentSelectedId = this.editingCustomerId;

    filtered.forEach(cust => {
      const div = document.createElement('div');
      div.className = `crm-item ${cust.id === currentSelectedId ? 'active' : ''}`;
      
      const primaryVehicle = cust.vehicles?.[0] 
        ? `${cust.vehicles[0].year} ${cust.vehicles[0].make} ${cust.vehicles[0].model}`
        : "No registered bike";

      div.innerHTML = `
        <div style="font-weight:600; display:flex; justify-content:space-between; align-items:center;">
          <span>${cust.name}</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">${cust.vehicles.length} Vehicle(s)</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
          <div style="font-size:0.75rem; color:var(--text-secondary);">${cust.phone}</div>
          ${cust.debt > 0 ? `<div style="font-size:0.75rem; font-weight:700; color:var(--danger);">Debt: ₱${cust.debt.toFixed(2)}</div>` : ''}
        </div>
        <div style="font-size:0.75rem; color:var(--accent); font-weight:500; margin-top:2px;">${primaryVehicle}</div>
      `;
      div.addEventListener('click', () => {
        this.editingCustomerId = cust.id;
        // Refresh selection styles
        document.querySelectorAll('.crm-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        this.renderCustomerCRMDetailPane(cust.id);
      });
      listContainer.appendChild(div);
    });

    // Keep detail pane up to date if customer list changes
    if (currentSelectedId) {
      const stillExists = this.customers.some(c => c.id === currentSelectedId);
      if (stillExists) {
        this.renderCustomerCRMDetailPane(currentSelectedId);
      } else {
        this.editingCustomerId = null;
        document.getElementById('crm-empty-state').style.display = 'block';
        document.getElementById('crm-detail-content').style.display = 'none';
      }
    }
  }

  renderCustomerCRMDetailPane(customerId) {
    const cust = this.customers.find(c => c.id === customerId);
    if (!cust) return;

    document.getElementById('crm-empty-state').style.display = 'none';
    const detailEl = document.getElementById('crm-detail-content');
    detailEl.style.display = 'block';

    // Sum history
    const customerTx = this.transactions.filter(t => t.customerId === customerId);
    const totalSpent = customerTx.reduce((sum, t) => sum + t.total, 0);

    const activeWorkOrders = this.serviceJobs.filter(j => j.customerId === customerId && j.status !== 'Completed');

    // Build Vehicles list
    let vehiclesHtml = '';
    if (cust.vehicles.length === 0) {
      vehiclesHtml = `<div style="color:var(--text-muted); font-size:0.85rem;">No motorcycles on file.</div>`;
    } else {
      cust.vehicles.forEach((v, index) => {
        vehiclesHtml += `
          <div class="vehicle-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="color:var(--accent); font-family:var(--font-display); font-size:1rem;">
                ${v.year || ''} ${v.make} ${v.model}
              </strong>
              <button class="btn btn-danger btn-sm" onclick="app.removeCustomerVehicle(${index})" style="padding: 2px 8px; font-size:0.75rem;">Remove</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.8rem; margin-top:8px; color:var(--text-secondary);">
              <div>License Plate: <span style="color:var(--text-primary); font-weight:600; font-family:monospace;">${v.plate || 'N/A'}</span></div>
              <div>Frame/VIN: <span style="color:var(--text-primary); font-family:monospace;">${v.vin || 'N/A'}</span></div>
            </div>
          </div>
        `;
      });
    }

    // Build History Table
    let txHistoryHtml = '';
    if (customerTx.length === 0 && activeWorkOrders.length === 0) {
      txHistoryHtml = `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.85rem;">No purchase or service history.</div>`;
    } else {
      txHistoryHtml = `
        <div class="table-container" style="margin-top:10px;">
          <table>
            <thead>
              <tr>
                <th>Invoice/WO</th>
                <th>Date</th>
                <th>Type</th>
                <th>Details</th>
                <th style="text-align:right;">Total Paid</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      // Active service jobs
      activeWorkOrders.forEach(job => {
        const partsCost = job.parts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
        txHistoryHtml += `
          <tr style="background-color: rgba(255, 95, 31, 0.02)">
            <td><strong style="color:var(--accent);">${job.id}</strong></td>
            <td>${new Date(job.dateCreated).toLocaleDateString()}</td>
            <td>${this.getStatusBadge(job.status)}</td>
            <td style="font-size:0.8rem;">${job.description.substring(0, 50)}...</td>
            <td style="text-align:right; font-weight:700;">₱${(partsCost + job.laborCost).toFixed(2)} (Est)</td>
          </tr>
        `;
      });

      // Past receipts
      customerTx.forEach(tx => {
        const itemsSummary = tx.items.map(it => `${it.quantity}x ${it.name.split(' ')[0]}`).join(', ');
        const isDebt = tx.paymentMethod === 'Debt';
        const typeBadge = `<span class="badge ${tx.type === 'Service' ? 'badge-info' : 'badge-secondary'}">${tx.type}</span>`;
        const pmtBadge = isDebt ? `<span class="badge badge-danger" style="margin-left:4px;">Debt</span>` : '';
        
        txHistoryHtml += `
          <tr>
            <td><strong>${tx.id}</strong></td>
            <td>${new Date(tx.date).toLocaleDateString()}</td>
            <td>${typeBadge}${pmtBadge}</td>
            <td style="font-size:0.8rem; color:var(--text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${itemsSummary}">${itemsSummary}</td>
            <td style="text-align:right; font-weight:700; color:${isDebt ? 'var(--danger)' : 'var(--success)'}">₱${tx.total.toFixed(2)}</td>
          </tr>
        `;
      });

      txHistoryHtml += `</tbody></table></div>`;
    }

    // Debt Breakdown Section
    const debtTx = customerTx.filter(t => t.paymentMethod === 'Debt');
    let debtHtml = '';
    if (debtTx.length > 0) {
      const totalDebtAcquired = debtTx.reduce((sum, tx) => sum + tx.total, 0);
      debtHtml = `
        <div style="margin-bottom:24px; padding: 16px; background-color: rgba(255, 69, 58, 0.05); border: 1px solid rgba(255, 69, 58, 0.3); border-radius: var(--radius-md);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="font-family:var(--font-display); font-size:1.1rem; margin:0; color: var(--danger);">Items Acquired on Debt (Utang)</h3>
            <div style="font-weight:700; color:var(--danger);">Total Value: ₱${totalDebtAcquired.toFixed(2)}</div>
          </div>
          <ul style="list-style: none; padding: 0; margin: 0;">
      `;
      debtTx.forEach(tx => {
        debtHtml += `<li style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed rgba(255, 255, 255, 0.1);">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <strong>${new Date(tx.date).toLocaleDateString()} (Invoice: ${tx.id})</strong>
            <strong style="color:var(--danger)">₱${tx.total.toFixed(2)}</strong>
          </div>
          <div style="color: var(--text-secondary); font-size: 0.85rem; padding-left: 8px; border-left: 2px solid rgba(255, 69, 58, 0.4);">`;
        tx.items.forEach(it => {
          debtHtml += `<div>${it.quantity}x ${it.name} <span style="opacity:0.7">— ₱${(it.price * it.quantity).toFixed(2)}</span></div>`;
        });
        debtHtml += `</div></li>`;
      });
      debtHtml += `</ul></div>`;
    }

    detailEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border-color); padding-bottom:16px; margin-bottom:20px;">
        <div>
          <h2>${cust.name}</h2>
          <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
            Phone: ${cust.phone} | Email: ${cust.email || 'No email provided'}
          </div>
          ${cust.debt > 0 ? `<div style="margin-top: 8px; font-weight: 600; color: var(--danger);">Outstanding Debt: ₱${cust.debt.toFixed(2)}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.8rem; color:var(--text-secondary);">Total Value</div>
          <div style="font-family:var(--font-display); font-size:1.75rem; font-weight:800; color:var(--success);">₱${totalSpent.toFixed(2)}</div>
        </div>
      </div>

      <div class="grid-cols-2" style="margin-bottom:24px;">
        <!-- Left details: Vehicles -->
        <div>
          <h3 style="font-family:var(--font-display); font-size:1.1rem; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>Motorcycles</span>
            <button class="btn btn-secondary btn-sm" onclick="app.toggleAddVehicleForm()">+ Add Bike</button>
          </h3>
          
          <!-- Inline Add Vehicle Form -->
          <div id="add-bike-form-container" style="display:none; background-color:var(--bg-secondary); border:1px dashed var(--accent); padding:12px; border-radius:var(--radius-md); margin-bottom:12px;">
            <div class="grid-cols-3" style="gap:8px;">
              <input type="text" class="input-control" id="new-bike-year" placeholder="Year" style="padding:6px 10px; font-size:0.8rem;">
              <input type="text" class="input-control" id="new-bike-make" placeholder="Make" style="padding:6px 10px; font-size:0.8rem;">
              <input type="text" class="input-control" id="new-bike-model" placeholder="Model" style="padding:6px 10px; font-size:0.8rem;">
            </div>
            <div class="grid-cols-2" style="gap:8px; margin-top:8px;">
              <input type="text" class="input-control" id="new-bike-plate" placeholder="Plate" style="padding:6px 10px; font-size:0.8rem;">
              <input type="text" class="input-control" id="new-bike-vin" placeholder="VIN / Frame" style="padding:6px 10px; font-size:0.8rem;">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
              <button class="btn btn-secondary btn-sm" onclick="app.toggleAddVehicleForm()">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="app.saveNewVehicle()">Save Bike</button>
            </div>
          </div>

          ${vehiclesHtml}
        </div>

        <!-- Right details: Profile Actions -->
        <div class="card" style="padding:16px; background-color:var(--bg-secondary);">
          <div class="card-title" style="font-size:0.95rem; margin-bottom:12px;">Customer Actions</div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <button class="btn btn-secondary btn-sm" onclick="app.openCustomerModalForEdit('${cust.id}')">Edit Profile Information</button>
            <button class="btn btn-primary btn-sm" onclick="app.createServiceJobForCRM('${cust.id}')">Intake this Customer (Create Work Order)</button>
            <button class="btn btn-success btn-sm" onclick="app.attachCustomerToCartFromCRM('${cust.id}')">Attach to POS checkout</button>
            <button class="btn btn-danger btn-sm" onclick="app.deleteCustomer('${cust.id}')">Delete Customer Record</button>
          </div>
        </div>
      </div>

      ${debtHtml}

      <div>
        <h3 style="font-family:var(--font-display); font-size:1.1rem; margin-bottom:10px;">Transaction & Work Order History</h3>
        ${txHistoryHtml}
      </div>
    `;
  }

  // ==========================================
  // MODALS & ACTIONS CONTROL
  // ==========================================

  openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  // --- BARCODE PRINTING ---
  printBarcode(partId) {
    const part = this.parts.find(p => p.id === partId);
    if (!part) return;

    if (typeof JsBarcode === 'undefined') {
      this.showToast("Barcode library not loaded yet. Please wait.", "warning");
      return;
    }

    // Populate Print Container
    document.getElementById('barcode-item-name').textContent = part.name;
    document.getElementById('barcode-item-price').textContent = `₱${part.price.toFixed(2)}`;

    // Populate Modal Preview Container
    document.getElementById('preview-barcode-name').textContent = part.name;
    document.getElementById('preview-barcode-price').textContent = `₱${part.price.toFixed(2)}`;

    const barcodeConfig = {
      format: "CODE128",
      lineColor: "#000",
      width: 1.5,
      height: 40,
      displayValue: true,
      fontSize: 11,
      textMargin: 1,
      margin: 0
    };

    // Generate barcode SVG for Print Container
    JsBarcode("#barcode-svg", part.sku, barcodeConfig);
    // Generate barcode SVG for Modal Preview
    JsBarcode("#preview-barcode-svg", part.sku, barcodeConfig);

    // Open Modal
    this.openModal('modal-barcode');
  }

  confirmPrintBarcode() {
    // Inject dynamic @page size for the barcode label
    let style = document.getElementById('dynamic-print-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dynamic-print-style';
      document.head.appendChild(style);
    }
    style.innerHTML = `@page { size: 1.54in 0.83in; margin: 0; }`;

    // Trigger Print
    window.print();

    // Reset style after print dialog closes
    setTimeout(() => { 
      style.innerHTML = ''; 
      this.closeModal('modal-barcode');
    }, 1000);
  }

  // --- MASS BARCODE PRINTING MODULE ---
  openMassBarcodeModal() {
    if (typeof JsBarcode === 'undefined') {
      this.showToast("Barcode library not loaded yet. Please wait.", "warning");
      return;
    }
    if (this.parts.length === 0) {
      this.showToast("No inventory items available.", "warning");
      return;
    }

    // Initialize selection state: { partId: { selected: false, qty: 1 } }
    this.massBarcodeState = {};
    this.parts.forEach(p => {
      this.massBarcodeState[p.id] = { selected: false, qty: 1 };
    });

    this.renderMassBarcodeList();
    this.updateMassSummary();
    this.openModal('modal-mass-barcode');

    // Clear search
    const searchInput = document.getElementById('mass-barcode-search');
    if (searchInput) searchInput.value = '';
  }

  renderMassBarcodeList(filter = '') {
    const listEl = document.getElementById('mass-barcode-list');
    listEl.innerHTML = '';

    const filtered = this.parts.filter(p =>
      p.name.toLowerCase().includes(filter) ||
      p.sku.toLowerCase().includes(filter) ||
      p.category.toLowerCase().includes(filter)
    );

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-muted);">No items matched your search.</div>`;
      return;
    }

    filtered.forEach(p => {
      const state = this.massBarcodeState[p.id];
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 10px 4px; border-bottom: 1px solid var(--border-color);';
      row.id = `mass-row-${p.id}`;

      row.innerHTML = `
        <input type="checkbox" id="mass-chk-${p.id}" ${state.selected ? 'checked' : ''}
          style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent); flex-shrink: 0;"
          onchange="app.toggleMassItem('${p.id}', this.checked)">
        <div style="flex-grow: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${p.sku} &nbsp;·&nbsp; ${p.category} &nbsp;·&nbsp; ₱${p.price.toFixed(2)}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <label style="font-size: 0.8rem; color: var(--text-secondary);">Qty:</label>
          <input type="number" min="1" max="100" value="${state.qty}"
            style="width: 55px; text-align: center; padding: 4px 6px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary); font-size: 0.85rem;"
            onchange="app.setMassItemQty('${p.id}', this.value)">
        </div>
      `;
      listEl.appendChild(row);
    });
  }

  filterMassBarcodeList() {
    const val = document.getElementById('mass-barcode-search').value.toLowerCase().trim();
    this.renderMassBarcodeList(val);
  }

  toggleMassItem(partId, checked) {
    if (this.massBarcodeState[partId]) {
      this.massBarcodeState[partId].selected = checked;
    }
    this.updateMassSummary();
  }

  setMassItemQty(partId, val) {
    const qty = Math.max(1, Math.min(100, parseInt(val) || 1));
    if (this.massBarcodeState[partId]) {
      this.massBarcodeState[partId].qty = qty;
    }
    this.updateMassSummary();
  }

  massSelectAll(selectAll) {
    const searchVal = document.getElementById('mass-barcode-search').value.toLowerCase().trim();
    const visibleParts = this.parts.filter(p =>
      p.name.toLowerCase().includes(searchVal) ||
      p.sku.toLowerCase().includes(searchVal) ||
      p.category.toLowerCase().includes(searchVal)
    );

    visibleParts.forEach(p => {
      this.massBarcodeState[p.id].selected = selectAll;
      const chk = document.getElementById(`mass-chk-${p.id}`);
      if (chk) chk.checked = selectAll;
    });

    this.updateMassSummary();
  }

  massSetQty() {
    const val = prompt("Set quantity for all selected items:", "1");
    if (val === null) return;
    const qty = Math.max(1, Math.min(100, parseInt(val) || 1));

    Object.keys(this.massBarcodeState).forEach(id => {
      if (this.massBarcodeState[id].selected) {
        this.massBarcodeState[id].qty = qty;
      }
    });

    // Re-render to update displayed qty values
    const searchVal = document.getElementById('mass-barcode-search').value.toLowerCase().trim();
    this.renderMassBarcodeList(searchVal);
    this.updateMassSummary();
  }

  updateMassSummary() {
    let selectedCount = 0;
    let totalLabels = 0;

    Object.values(this.massBarcodeState).forEach(s => {
      if (s.selected) {
        selectedCount++;
        totalLabels += s.qty;
      }
    });

    document.getElementById('mass-selected-count').textContent = selectedCount;
    document.getElementById('mass-total-labels').textContent = totalLabels;
  }

  executeMassPrint() {
    const selectedParts = [];
    this.parts.forEach(p => {
      const state = this.massBarcodeState[p.id];
      if (state && state.selected) {
        for (let i = 0; i < state.qty; i++) {
          selectedParts.push(p);
        }
      }
    });

    if (selectedParts.length === 0) {
      this.showToast("No items selected. Please check at least one item.", "warning");
      return;
    }

    // Hide other print containers
    document.getElementById('print-barcode-container').style.display = 'none';
    document.getElementById('print-receipt-container').style.display = 'none';

    const container = document.getElementById('print-all-barcodes-container');
    container.innerHTML = '';

    selectedParts.forEach((part, index) => {
      const page = document.createElement('div');
      page.className = 'barcode-page';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'bp-name';
      nameDiv.textContent = part.name;

      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgEl.classList.add('bp-svg');
      svgEl.id = `bp-svg-${index}`;

      const priceDiv = document.createElement('div');
      priceDiv.className = 'bp-price';
      priceDiv.textContent = `₱${part.price.toFixed(2)}`;

      page.appendChild(nameDiv);
      page.appendChild(svgEl);
      page.appendChild(priceDiv);
      container.appendChild(page);

      JsBarcode(`#bp-svg-${index}`, part.sku, {
        format: "CODE128",
        lineColor: "#000",
        width: 1.5,
        height: 40,
        displayValue: true,
        fontSize: 11,
        textMargin: 1,
        margin: 0
      });
    });

    // Inject dynamic @page size (A4/Letter)
    let style = document.getElementById('dynamic-print-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dynamic-print-style';
      document.head.appendChild(style);
    }
    style.innerHTML = `@page { size: auto; margin: 0.2in; }`;

    // Add class to body so CSS shows batch container only
    document.body.classList.add('printing-all-barcodes');

    // Trigger Print
    window.print();

    // Reset after print dialog closes
    setTimeout(() => {
      style.innerHTML = '';
      container.innerHTML = '';
      document.body.classList.remove('printing-all-barcodes');
      this.closeModal('modal-mass-barcode');
    }, 1000);

    this.showToast(`Printing ${selectedParts.length} barcode labels...`, "success");
  }

  printReceipt() {
    let style = document.getElementById('dynamic-print-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dynamic-print-style';
      document.head.appendChild(style);
    }
    style.innerHTML = `@page { size: 80mm auto; margin: 0; }`;

    window.print();
    setTimeout(() => { style.innerHTML = ''; }, 1000);
  }

  // Part Add/Edit Modal
  openPartModal(partId = null) {
    this.editingPartId = partId;
    const form = document.getElementById('form-part');
    form.reset();

    const titleEl = document.getElementById('part-modal-title');

    if (partId) {
      titleEl.textContent = "Edit Part Record";
      const part = this.parts.find(p => p.id === partId);
      if (part) {
        document.getElementById('part-id').value = part.id;
        document.getElementById('part-sku').value = part.sku;
        document.getElementById('part-name').value = part.name;
        document.getElementById('part-category').value = part.category;
        document.getElementById('part-cost').value = part.cost;
        document.getElementById('part-price').value = part.price;
        document.getElementById('part-stock').value = part.stock;
        document.getElementById('part-min-stock').value = part.minStock;
      }
    } else {
      titleEl.textContent = "Add Part Record";
      document.getElementById('part-id').value = '';
    }

    this.openModal('modal-part');

    // Auto-focus SKU field for barcode scanner readiness
    setTimeout(() => {
      const skuInput = document.getElementById('part-sku');
      if (skuInput) skuInput.focus();
    }, 50);
  }

  async savePartForm() {
    const sku = document.getElementById('part-sku').value.trim();
    const name = document.getElementById('part-name').value.trim();
    const category = document.getElementById('part-category').value.trim();
    const cost = parseFloat(document.getElementById('part-cost').value) || 0;
    const price = parseFloat(document.getElementById('part-price').value) || 0;
    const stock = parseInt(document.getElementById('part-stock').value, 10) || 0;
    const minStock = parseInt(document.getElementById('part-min-stock').value, 10) || 0;

    if (!sku || !name || !category) {
      this.showToast("Please fill in SKU, Name and Category", "warning");
      return;
    }

    const partData = { sku, name, category, cost, price, stock, minStock };
    if (this.editingPartId) partData.id = this.editingPartId;

    try {
      const saved = await DB.upsertPart(partData);
      if (this.editingPartId) {
        const idx = this.parts.findIndex(p => p.id === this.editingPartId);
        if (idx !== -1) this.parts[idx] = { ...partData, id: saved.id };
        this.showToast(`Updated part: ${sku}`, "success");
      } else {
        this.parts.push({ ...partData, id: saved.id });
        this.showToast(`Added part: ${sku}`, "success");
      }
      this.closeModal('modal-part');
      this.renderInventoryTable();
      this.populateInventoryCategoryDropdown();
    } catch (err) {
      console.error(err);
      this.showToast("Database error saving part: " + err.message, "danger");
    }
  }

  async deletePart(partId) {
    const part = this.parts.find(p => p.id === partId);
    if (!part) return;
    if (confirm(`Are you sure you want to delete ${part.name}?`)) {
      try {
        await DB.deletePart(partId);
        this.parts = this.parts.filter(p => p.id !== partId);
        this.renderInventoryTable();
        this.populateInventoryCategoryDropdown();
        this.showToast("Part deleted successfully", "success");
      } catch (err) {
        console.error(err);
        this.showToast("Database error deleting part: " + err.message, "danger");
      }
    }
  }

  // Customer Add/Edit Modal
  openCustomerModal() {
    this.editingCustomerId = null;
    const form = document.getElementById('form-customer');
    form.reset();
    document.getElementById('cust-id').value = '';
    document.getElementById('customer-modal-title').textContent = "New Customer Profile";
    this.openModal('modal-customer');
  }

  openCustomerModalForEdit(custId) {
    this.editingCustomerId = custId;
    const form = document.getElementById('form-customer');
    form.reset();

    const cust = this.customers.find(c => c.id === custId);
    if (cust) {
      document.getElementById('customer-modal-title').textContent = "Edit Customer Profile";
      document.getElementById('cust-id').value = cust.id;
      document.getElementById('cust-name').value = cust.name;
      document.getElementById('cust-phone').value = cust.phone;
      document.getElementById('cust-email').value = cust.email || '';

      // Don't modify vehicles details in this simplified edit form, vehicles managed inline in detail pane
      const primaryV = cust.vehicles?.[0];
      if (primaryV) {
        document.getElementById('bike-year').value = primaryV.year || '';
        document.getElementById('bike-make').value = primaryV.make || '';
        document.getElementById('bike-model').value = primaryV.model || '';
        document.getElementById('bike-plate').value = primaryV.plate || '';
        document.getElementById('bike-vin').value = primaryV.vin || '';
      }
    }
    this.openModal('modal-customer');
  }

  async saveCustomerForm() {
    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const email = document.getElementById('cust-email').value.trim();
    const debt  = parseFloat(document.getElementById('cust-debt')?.value) || 0;
    
    // Bike details (optional fields)
    const bYear  = document.getElementById('bike-year')?.value.trim()  || '';
    const bMake  = document.getElementById('bike-make')?.value.trim()  || '';
    const bModel = document.getElementById('bike-model')?.value.trim() || '';
    const bPlate = document.getElementById('bike-plate')?.value.trim() || '';
    const bVin   = document.getElementById('bike-vin')?.value.trim()   || '';

    if (!name || !phone) {
      this.showToast("Full Name and Phone Number are required", "warning");
      return;
    }

    const bikes = [];
    if (bMake || bModel || bPlate) {
      bikes.push({
        year: bYear,
        make: bMake || "Unknown",
        model: bModel || "Bike",
        plate: bPlate || "N/A",
        vin: bVin || "N/A"
      });
    }

    if (this.editingCustomerId) {
      const custIndex = this.customers.findIndex(c => c.id === this.editingCustomerId);
      if (custIndex !== -1) {
        const oldVehicles = this.customers[custIndex].vehicles || [];
        const mergedVehicles = bikes.length > 0 ? bikes : oldVehicles;
        const updatedCust = { id: this.editingCustomerId, name, phone, email, debt, vehicles: mergedVehicles };
        try {
          await DB.upsertCustomer(updatedCust);
          this.customers[custIndex] = updatedCust;
          this.showToast(`Updated customer: ${name}`, "success");
        } catch (err) {
          this.showToast("Database error: " + err.message, "danger"); return;
        }
      }
    } else {
      const tempCust = { name, phone, email, debt, vehicles: bikes };
      try {
        const newId = await DB.upsertCustomer(tempCust);
        // If a vehicle was provided, register it
        let vehicleData = [];
        if (bikes.length > 0) {
          await DB.addVehicle(newId, bikes[0]);
          vehicleData = [{ ...bikes[0] }];
        }
        const newCust = { id: newId, name, phone, email, debt, vehicles: vehicleData };
        this.customers.push(newCust);
        this.showToast(`Registered Customer: ${name}`, "success");
        if (this.activeView === 'pos') {
          this.selectedCustomer = newCust;
          this.renderPOSCart();
        }
      } catch (err) {
        this.showToast("Database error: " + err.message, "danger"); return;
      }
    }

    this.closeModal('modal-customer');
    if (this.activeView === 'customers') {
      this.renderCustomerCRMList();
    } else if (this.activeView === 'pos') {
      this.renderPOSCart();
    }
  }

  async deleteCustomer(custId) {
    const cust = this.customers.find(c => c.id === custId);
    if (!cust) return;
    if (confirm(`Delete CRM profile for ${cust.name}? This will NOT delete past sales records.`)) {
      try {
        await DB.deleteCustomer(custId);
        this.customers = this.customers.filter(c => c.id !== custId);
        this.editingCustomerId = null;
        this.renderCustomerCRMList();
        this.showToast("Customer profile deleted", "success");
      } catch (err) {
        this.showToast("Database error: " + err.message, "danger");
      }
    }
  }

  // Inline Vehicle Management
  toggleAddVehicleForm() {
    const container = document.getElementById('add-bike-form-container');
    if (!container) return;
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
  }

  async saveNewVehicle() {
    const year  = document.getElementById('new-bike-year').value.trim();
    const make  = document.getElementById('new-bike-make').value.trim();
    const model = document.getElementById('new-bike-model').value.trim();
    const plate = document.getElementById('new-bike-plate').value.trim();
    const vin   = document.getElementById('new-bike-vin').value.trim();

    if (!make || !model) {
      this.showToast("Vehicle Make and Model are required", "warning");
      return;
    }

    const custIndex = this.customers.findIndex(c => c.id === this.editingCustomerId);
    if (custIndex !== -1) {
      try {
        const newVehicle = { year, make, model, plate, vin };
        const vehId = await DB.addVehicle(this.editingCustomerId, newVehicle);
        if (!this.customers[custIndex].vehicles) this.customers[custIndex].vehicles = [];
        this.customers[custIndex].vehicles.push({ id: vehId, ...newVehicle });
        this.renderCustomerCRMDetailPane(this.editingCustomerId);
        this.showToast("Vehicle registered to customer profile", "success");
      } catch (err) {
        this.showToast("Database error: " + err.message, "danger");
      }
    }
  }

  async removeCustomerVehicle(vehicleIndex) {
    const custIndex = this.customers.findIndex(c => c.id === this.editingCustomerId);
    if (custIndex !== -1) {
      const bike = this.customers[custIndex].vehicles[vehicleIndex];
      if (confirm(`Remove vehicle ${bike.make} ${bike.model} [${bike.plate}] from profile?`)) {
        try {
          if (bike.id) await DB.deleteVehicle(bike.id);
          this.customers[custIndex].vehicles.splice(vehicleIndex, 1);
          this.renderCustomerCRMDetailPane(this.editingCustomerId);
          this.showToast("Vehicle deleted", "success");
        } catch (err) {
          this.showToast("Database error: " + err.message, "danger");
        }
      }
    }
  }

  // --- POS CART CONTROLS ---

  addToCart(partId) {
    const part = this.parts.find(p => p.id === partId);
    if (!part) return;

    if (part.stock === 0) {
      this.showToast("Item is out of stock!", "danger");
      return;
    }

    const cartIndex = this.cart.findIndex(item => item.partId === partId);
    if (cartIndex !== -1) {
      // Increment
      if (this.cart[cartIndex].quantity < part.stock) {
        this.cart[cartIndex].quantity++;
      } else {
        this.showToast(`Insufficient stock! Only ${part.stock} items available.`, "warning");
      }
    } else {
      // New cart item
      this.cart.push({ partId, quantity: 1, price: part.price });
    }

    this.renderPOSCart();
  }

  updateCartQty(partId, newQty) {
    const part = this.parts.find(p => p.id === partId);
    if (!part) return;

    const cartIndex = this.cart.findIndex(item => item.partId === partId);
    if (cartIndex === -1) return;

    if (newQty <= 0) {
      this.cart.splice(cartIndex, 1);
      this.showToast("Item removed from cart", "info");
    } else {
      if (newQty <= part.stock) {
        this.cart[cartIndex].quantity = newQty;
      } else {
        this.cart[cartIndex].quantity = part.stock;
        this.showToast(`Maximum stock allocation reached (${part.stock})`, "warning");
      }
    }

    this.renderPOSCart();
  }

  removeFromCart(partId) {
    this.cart = this.cart.filter(item => item.partId !== partId);
    this.showToast("Item removed from order", "info");
    this.renderPOSCart();
  }

  clearCart() {
    if (this.cart.length === 0) return;
    if (confirm("Are you sure you want to discard the active order?")) {
      this.cart = [];
      this.selectedCustomer = null;
      document.getElementById('cart-discount-input').value = '0.00';
      this.showToast("Order cleared", "info");
      this.renderPOSCart();
    }
  }

  // Cart Attach Customer Selection Modal
  openSelectCustomerModal() {
    this.openModal('modal-select-customer');
    document.getElementById('pos-cust-search').value = '';
    this.renderPOSCustomerSelectionList();
  }

  renderPOSCustomerSelectionList() {
    const list = document.getElementById('pos-cust-list');
    list.innerHTML = '';
    const searchVal = document.getElementById('pos-cust-search').value.toLowerCase().trim();

    let filtered = this.customers;
    if (searchVal) {
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(searchVal) || 
        c.phone.toLowerCase().includes(searchVal)
      );
    }

    if (filtered.length === 0) {
      list.innerHTML = `<div style="text-align:center; padding:10px; color:var(--text-muted);">No profiles found.</div>`;
      return;
    }

    filtered.forEach(cust => {
      const div = document.createElement('div');
      div.className = 'crm-item';
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      
      div.innerHTML = `
        <div>
          <div style="font-weight:600;">${cust.name}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">${cust.phone}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="app.attachCustomerToCart('${cust.id}')">Select</button>
      `;
      list.appendChild(div);
    });
  }

  attachCustomerToCart(customerId) {
    const cust = this.customers.find(c => c.id === customerId);
    if (cust) {
      this.selectedCustomer = cust;
      this.closeModal('modal-select-customer');
      this.renderPOSCart();
      this.showToast(`Attached customer: ${cust.name}`, "success");
    }
  }

  detachCustomerFromCart() {
    this.selectedCustomer = null;
    this.renderPOSCart();
    this.showToast("Customer detached from sale", "info");
  }

  // Attach directly from CRM View
  attachCustomerToCartFromCRM(customerId) {
    const cust = this.customers.find(c => c.id === customerId);
    if (cust) {
      this.selectedCustomer = cust;
      this.switchView('pos');
      this.showToast(`Customer attached to order`, "success");
    }
  }

  // --- CHECKOUT & TRANSACTION FINALIZATION ---

  updateCheckoutTotal() {
    let subtotal = 0;
    let grandTotal = 0;

    const laborFee = parseFloat(document.getElementById('checkout-labor-fee').value) || 0;

    if (this.activeJobId && this.activeView === 'service') {
      const job = this.serviceJobs.find(j => j.id === this.activeJobId);
      if (job) {
        const partsTotal = job.parts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
        subtotal = partsTotal + laborFee;
        grandTotal = subtotal;
      }
    } else {
      // Retail POS cart
      const cartSubtotal = this.cart.reduce((sum, item) => {
        const p = this.parts.find(part => part.id === item.partId);
        return sum + (p ? p.price * item.quantity : 0);
      }, 0);
      
      const discountInput = document.getElementById('cart-discount-input');
      const discount = parseFloat(discountInput ? discountInput.value : 0) || 0;

      subtotal = cartSubtotal + laborFee;
      grandTotal = Math.max(0, subtotal - discount);
    }

    document.getElementById('checkout-total').textContent = `₱${grandTotal.toFixed(2)}`;
    this.calculateCashChange(); // update cash change if cash is selected
  }

  openCheckoutModal() {
    if (this.cart.length === 0) {
      this.showToast("Cannot checkout empty cart!", "warning");
      return;
    }

    // Populate checkout mechanic dropdown
    const mechSelect = document.getElementById('checkout-mechanic');
    mechSelect.innerHTML = '<option value="">-- No Mechanic --</option>';
    this.mechanics.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      mechSelect.appendChild(opt);
    });

    document.getElementById('checkout-labor-fee').value = '0.00';

    this.updateCheckoutTotal();

    // Reset Inputs
    document.getElementById('cash-received').value = '';
    document.getElementById('cash-change-due').textContent = '₱0.00';

    // Set Default Payment Selection (Cash)
    document.querySelectorAll('.pm-option').forEach(l => l.classList.remove('selected'));
    const cashLabel = document.getElementById('pm-cash-label');
    if (cashLabel) {
      cashLabel.classList.add('selected');
      const radio = cashLabel.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    }
    this.toggleCashCalculator('Cash');

    this.openModal('modal-checkout');
  }

  toggleCashCalculator(method) {
    const calc = document.getElementById('cash-calculator');
    if (calc) {
      calc.style.display = (method === 'Cash') ? 'block' : 'none';
    }
  }

  calculateCashChange() {
    const totalVal = parseFloat(document.getElementById('checkout-total').textContent.replace('$', '')) || 0;
    const cashRecVal = parseFloat(document.getElementById('cash-received').value) || 0;
    
    const change = Math.max(0, cashRecVal - totalVal);
    document.getElementById('cash-change-due').textContent = `₱${change.toFixed(2)}`;
  }

  generateReceiptHTML(tx) {
    const padText = (left, right, length = 38) => {
      const leftStr = String(left);
      const rightStr = String(right);
      const spaces = length - leftStr.length - rightStr.length;
      return leftStr + ' '.repeat(Math.max(1, spaces)) + rightStr;
    };

    const dateStr = new Date(tx.date).toLocaleString();

    let itemsStr = '';
    tx.items.forEach(it => {
      const lineText = `${it.quantity}x ${it.name.substring(0, 24)}`;
      const priceText = `₱${(it.price * it.quantity).toFixed(2)}`;
      itemsStr += padText(lineText, priceText) + '\n';
      // If name is long, print it on the next line
      if (it.name.length > 24) {
        itemsStr += `   ${it.name.substring(24, 45)}\n`;
      }
    });

    const receiptHtml = `
      <div class="receipt-header">
        <div class="receipt-title">DIEGO'S</div>
        <div style="font-size: 11px; margin-top: 2px;">Motorcycle Parts & Accessories</div>
        <div style="font-size: 10px; margin-top: 4px;">brgy.ganaderia , palayan city</div>
      </div>
      <div class="receipt-divider"></div>
      <div class="receipt-row">
        <span>Receipt ID:</span>
        <span style="font-weight:bold;">${tx.id}</span>
      </div>
      <div class="receipt-row">
        <span>Date:</span>
        <span>${dateStr}</span>
      </div>
      <div class="receipt-row">
        <span>Customer:</span>
        <span>${tx.customerName}</span>
      </div>
      ${tx.vehicle ? `<div class="receipt-row"><span>Vehicle:</span><span>${tx.vehicle}</span></div>` : ''}
      <div class="receipt-divider"></div>
      <div style="font-weight:bold; margin-bottom: 5px;">ITEMS & SERVICES:</div>
      <pre style="font-family: inherit; font-size: inherit; white-space: pre-wrap; margin-bottom: 8px;">${itemsStr}</pre>
      <div class="receipt-divider"></div>
      <div class="receipt-row">
        <span>Subtotal:</span>
        <span>₱${tx.subtotal.toFixed(2)}</span>
      </div>
      ${tx.discount > 0 ? `<div class="receipt-row"><span>Discount:</span><span>-₱${tx.discount.toFixed(2)}</span></div>` : ''}
      <div class="receipt-divider" style="border-top-style: double;"></div>
      <div class="receipt-row receipt-row-bold" style="font-size: 13px;">
        <span>TOTAL DUE:</span>
        <span>₱${tx.total.toFixed(2)}</span>
      </div>
      <div class="receipt-divider"></div>
      <div class="receipt-row">
        <span>Payment Method:</span>
        <span>${tx.paymentMethod}</span>
      </div>
      ${tx.paymentMethod === 'Cash' && tx.amountTendered !== undefined && tx.amountTendered !== null ? `
      <div class="receipt-row">
        <span>Cash Given:</span>
        <span>₱${tx.amountTendered.toFixed(2)}</span>
      </div>
      <div class="receipt-row">
        <span>Change:</span>
        <span>₱${tx.changeDue.toFixed(2)}</span>
      </div>
      ` : ''}
      <div class="receipt-divider"></div>
      <div style="text-align:center; font-size:10px; margin-top: 15px; font-weight: bold;">
        RIDE SAFE • DIEGO'S SHOP
        <div style="font-size: 9px; font-weight: normal; margin-top: 4px;">Thank you for your business!</div>
      </div>
    `;

    // Inject to screen modal content
    document.getElementById('screen-receipt-content').innerHTML = receiptHtml;

    // Inject to hidden print container
    document.getElementById('print-receipt-container').innerHTML = receiptHtml;
  }

  // --- SERVICE / WORK ORDERS INTAKE CONTROLS ---
  populateMechanicDropdowns(selectedValue = '') {
    const ids = ['checkin-mechanic', 'manage-job-mechanic'];
    ids.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Select Mechanic --</option>';
      (this.mechanics || []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = `${m.name} (${m.role || 'Mechanic'})`;
        sel.appendChild(opt);
      });
      if (selectedValue) sel.value = selectedValue;
    });
  }

  openCheckInModal() {
    const custInput = document.getElementById('checkin-customer-select');
    custInput.value = '';

    // Reset fields
    document.getElementById('checkin-vehicle-input').value = '';
    document.getElementById('checkin-description').value = '';
    document.getElementById('checkin-labor-est').value = '60.00';

    // Populate mechanic dropdown dynamically
    this.populateMechanicDropdowns();

    this.openModal('modal-checkin');
  }

  updateCheckinVehicleDropdown(customerId) {
    // No longer a dropdown — just a text input, nothing to populate
  }

  createServiceJobForCRM(customerId) {
    this.switchView('service');
    this.openCheckInModal();
    const custInput = document.getElementById('checkin-customer-select');
    const customer = this.customers.find(c => c.id === customerId);
    if (customer) {
      custInput.value = customer.name;
    }
    this.updateCheckinVehicleDropdown(customerId);
  }

  async saveCheckinForm() {
    const custName = document.getElementById('checkin-customer-select').value.trim();
    const vehicle = document.getElementById('checkin-vehicle-input').value.trim();
    const mechanic = document.getElementById('checkin-mechanic').value;
    const laborCost = parseFloat(document.getElementById('checkin-labor-est').value) || 0;
    const description = document.getElementById('checkin-description').value.trim();

    if (!custName || !vehicle || !description) {
      this.showToast("Please fill all required intake fields!", "warning");
      return;
    }

    // Attempt to link to existing CRM customer by name, otherwise use guest ID
    const customer = this.customers.find(c => c.name.toLowerCase() === custName.toLowerCase());
    const finalCustId = customer ? customer.id : null;
    const finalCustName = customer ? customer.name : custName;

    const yearIdx = this.serviceJobs.length + 1001;
    const jobId = `WO-${new Date().getFullYear()}-${String(yearIdx).padStart(4,'0')}`;

    const newJob = {
      id: jobId,
      customerId: finalCustId,
      customerName: finalCustName,
      vehicle,
      description,
      mechanic,
      status: "Draft",
      parts: [],
      laborCost,
      dateCreated: new Date().toISOString(),
      dateUpdated: new Date().toISOString()
    };

    try {
      await DB.createServiceJob(newJob);
      this.serviceJobs.push(newJob);
      this.closeModal('modal-checkin');
      this.renderServiceBoard();
      this.showToast(`Opened Work Order ${jobId}`, "success");
    } catch (err) {
      this.showToast("Database error: " + err.message, "danger");
    }
  }

  // --- WORK ORDER DETAILS & BILLING CONTROLS ---

  openManageJobModal(jobId) {
    this.activeJobId = jobId;
    const job = this.serviceJobs.find(j => j.id === jobId);
    if (!job) return;

    document.getElementById('manage-job-id').value = job.id;
    document.getElementById('manage-job-title').innerHTML = `Work Order Detail - <span style="color:var(--accent);">${job.id}</span>`;
    document.getElementById('manage-job-customer').textContent = job.customerName;
    document.getElementById('manage-job-vehicle').textContent = job.vehicle;
    document.getElementById('manage-job-date').textContent = new Date(job.dateCreated).toLocaleDateString();

    document.getElementById('manage-job-status').value = job.status;
    // Populate mechanic dropdown dynamically, then set current value
    this.populateMechanicDropdowns(job.mechanic);
    document.getElementById('manage-job-desc').value = job.description;
    document.getElementById('manage-job-labor').value = job.laborCost;

    // Process payment enabled only if status is "Ready"
    const payBtn = document.getElementById('btn-pay-workorder');
    if (payBtn) {
      payBtn.disabled = job.status !== 'Ready';
      payBtn.style.opacity = job.status === 'Ready' ? '1' : '0.4';
    }

    // Populate Parts Allocation Dropdown
    this.populateManageJobPartsDropdown();

    // Render job parts list
    this.renderJobAllocatedPartsList(job);

    this.openModal('modal-manage-job');
  }

  populateManageJobPartsDropdown() {
    // Now populates the category dropdown and renders the card grid
    this.populateJobPartCategories();
    this.renderJobPartPicker();
  }

  populateJobPartCategories() {
    const catSelect = document.getElementById('job-part-category');
    if (!catSelect) return;
    catSelect.innerHTML = '<option value="All">All Categories</option>';
    const categories = [...new Set(this.parts.map(p => p.category))].sort();
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    });
  }

  renderJobPartPicker() {
    const grid = document.getElementById('job-part-picker-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const query = (document.getElementById('job-part-search')?.value || '').toLowerCase().trim();
    const category = document.getElementById('job-part-category')?.value || 'All';

    let filtered = this.parts;
    if (category !== 'All') filtered = filtered.filter(p => p.category === category);
    if (query) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query)
      );
    }

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-muted);font-size:0.85rem;">No parts found. Try a different search.</div>`;
      return;
    }

    // Get current job to check already-allocated parts
    const job = this.serviceJobs.find(j => j.id === this.activeJobId);
    const allocatedIds = job ? job.parts.map(p => p.partId) : [];

    filtered.forEach(p => {
      const isOut = p.stock === 0;
      const isAllocated = allocatedIds.includes(p.id);
      const allocatedQty = isAllocated ? job.parts.find(jp => jp.partId === p.id)?.quantity || 0 : 0;

      const card = document.createElement('div');
      card.style.cssText = `
        background: var(--bg-surface); border: 1px solid ${isOut ? 'rgba(231,76,60,0.3)' : isAllocated ? 'var(--accent)' : 'var(--border-color)'};
        border-radius: 8px; padding: 10px; cursor: ${isOut ? 'not-allowed' : 'pointer'};
        opacity: ${isOut ? '0.5' : '1'}; transition: all 0.2s;
        display: flex; flex-direction: column; gap: 4px;
      `;

      let stockBadge = `<span style="font-size:0.68rem;padding:2px 6px;border-radius:12px;background:rgba(46,204,113,0.15);color:var(--success);font-weight:600;">${p.stock} avail</span>`;
      if (isOut) stockBadge = `<span style="font-size:0.68rem;padding:2px 6px;border-radius:12px;background:rgba(231,76,60,0.15);color:var(--danger);font-weight:600;">Out</span>`;

      card.innerHTML = `
        <div style="font-size:0.68rem;color:var(--text-secondary);font-family:monospace;letter-spacing:0.3px;">${p.sku}</div>
        <div style="font-size:0.8rem;font-weight:600;line-height:1.2;flex-grow:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${p.name}">${p.name}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
          <div style="font-size:0.85rem;font-weight:700;color:var(--accent);">₱${p.price.toFixed(2)}</div>
          ${stockBadge}
        </div>
        ${isAllocated ? `<div style="font-size:0.7rem;text-align:center;padding:3px;background:rgba(var(--accent-rgb,255,95,31),0.1);border-radius:4px;color:var(--accent);margin-top:2px;">✓ Allocated (${allocatedQty})</div>` : ''}
      `;

      if (!isOut) {
        card.addEventListener('click', () => this.addPartToJob(p.id));
        card.addEventListener('mouseenter', () => { card.style.borderColor = 'var(--accent)'; card.style.transform = 'translateY(-2px)'; });
        card.addEventListener('mouseleave', () => { card.style.borderColor = isAllocated ? 'var(--accent)' : 'var(--border-color)'; card.style.transform = ''; });
      }

      grid.appendChild(card);
    });
  }

  renderJobAllocatedPartsList(job) {
    const tbody = document.getElementById('job-allocated-parts-table');
    tbody.innerHTML = '';

    let partsTotal = 0;

    if (job.parts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:12px;">No parts allocated yet. Use dropdown above to add parts.</td></tr>`;
    } else {
      job.parts.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        partsTotal += itemTotal;

        const part = this.parts.find(p => p.id === item.partId);
        const maxStock = part ? part.stock + item.quantity : item.quantity; // Account for current allocation

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-family:monospace; font-weight:700;">${part ? part.sku : 'N/A'}</td>
          <td style="font-size:0.8rem;">${item.name}</td>
          <td style="text-align:right;">₱${item.price.toFixed(2)}</td>
          <td style="text-align:center;">
            <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
              <button class="qty-btn" onclick="app.updateJobPartQty(${index}, ${item.quantity - 1})" style="width:20px; height:20px; font-size:0.7rem;">-</button>
              <span style="font-weight:600; font-size:0.85rem;">${item.quantity}</span>
              <button class="qty-btn" onclick="app.updateJobPartQty(${index}, ${item.quantity + 1})" style="width:20px; height:20px; font-size:0.7rem;" ${item.quantity >= maxStock ? 'disabled' : ''}>+</button>
            </div>
          </td>
          <td style="text-align:right; font-weight:600;">₱${itemTotal.toFixed(2)}</td>
          <td style="text-align:center;">
            <button class="btn btn-danger btn-sm btn-icon-only" onclick="app.removePartFromJob(${index})" style="width:24px; height:24px; font-size:0.8rem;">×</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    const totalEstimate = partsTotal + job.laborCost;
    document.getElementById('manage-job-total-calc').textContent = `₱${totalEstimate.toFixed(2)}`;
  }

  async addPartToJob() {
    const partId = document.getElementById('job-parts-dropdown').value;
    if (!partId) {
      this.showToast("Select a part from the dropdown first!", "warning");
      return;
    }

    const job = this.serviceJobs.find(j => j.id === this.activeJobId);
    const part = this.parts.find(p => p.id === partId);

    if (!job || !part) return;
    if (part.stock === 0) {
      this.showToast("Item is out of stock!", "danger");
      return;
    }

    try {
      // Decrement stock in DB
      part.stock--;
      await DB.updatePartStock(part.id, part.stock);

      // Add to work order in DB
      await DB.addPartToJob(job.id, part.id, part.name, part.price);

      // Update in-memory job parts
      const jobPartIdx = job.parts.findIndex(p => p.partId === partId);
      if (jobPartIdx !== -1) {
        job.parts[jobPartIdx].quantity++;
      } else {
        job.parts.push({ partId, name: part.name, quantity: 1, price: part.price });
      }

      this.populateManageJobPartsDropdown();
      this.renderJobAllocatedPartsList(job);
      this.showToast(`Allocated 1x ${part.name} to Work Order`, "success");
    } catch (err) {
      part.stock++; // rollback optimistic decrement
      this.showToast("Database error: " + err.message, "danger");
    }
  }

  async updateJobPartQty(itemIndex, newQty) {
    const job = this.serviceJobs.find(j => j.id === this.activeJobId);
    if (!job) return;

    const allocatedItem = job.parts[itemIndex];
    const part = this.parts.find(p => p.id === allocatedItem.partId);
    if (!part) return;

    const diff = newQty - allocatedItem.quantity;
    if (newQty <= 0) { this.removePartFromJob(itemIndex); return; }
    if (diff > 0 && part.stock < diff) {
      this.showToast("Insufficient parts stock remaining!", "warning");
      return;
    }

    try {
      part.stock -= diff;
      allocatedItem.quantity = newQty;
      await DB.updatePartStock(part.id, part.stock);
      if (allocatedItem._rowId) await DB.updateJobPartQty(allocatedItem._rowId, newQty);
      this.populateManageJobPartsDropdown();
      this.renderJobAllocatedPartsList(job);
    } catch (err) {
      part.stock += diff; // rollback
      allocatedItem.quantity -= diff;
      this.showToast("Database error: " + err.message, "danger");
    }
  }

  async removePartFromJob(itemIndex) {
    const job = this.serviceJobs.find(j => j.id === this.activeJobId);
    if (!job) return;

    const allocatedItem = job.parts[itemIndex];
    const part = this.parts.find(p => p.id === allocatedItem.partId);

    try {
      if (part) {
        part.stock += allocatedItem.quantity;
        await DB.updatePartStock(part.id, part.stock);
      }
      if (allocatedItem._rowId) await DB.removeJobPart(allocatedItem._rowId);
      job.parts.splice(itemIndex, 1);
      this.populateManageJobPartsDropdown();
      this.renderJobAllocatedPartsList(job);
      this.showToast("Part allocation removed from work order", "info");
    } catch (err) {
      if (part) part.stock -= allocatedItem.quantity; // rollback
      this.showToast("Database error: " + err.message, "danger");
    }
  }

  async saveWorkOrderChanges() {
    const job = this.serviceJobs.find(j => j.id === this.activeJobId);
    if (!job) return;

    const oldStatus = job.status;
    const newStatus = document.getElementById('manage-job-status').value;
    const mechanic  = document.getElementById('manage-job-mechanic').value;
    const desc      = document.getElementById('manage-job-desc').value.trim();
    const labor     = parseFloat(document.getElementById('manage-job-labor').value) || 0;

    if (!desc) {
      this.showToast("Work description details are required", "warning");
      return;
    }

    job.status = newStatus;
    job.mechanic = mechanic;
    job.description = desc;
    job.laborCost = labor;
    job.dateUpdated = new Date().toISOString();

    try {
      await DB.updateServiceJob(job);
      this.closeModal('modal-manage-job');
      this.renderServiceBoard();
      if (oldStatus !== newStatus) {
        this.showToast(`Work order ${job.id} moved to: ${newStatus}`, "success");
      } else {
        this.showToast(`Updated Work Order ${job.id}`, "success");
      }
    } catch (err) {
      this.showToast("Database error: " + err.message, "danger");
    }
  }

  async deleteWorkOrder() {
    if (confirm("Permanently cancel and delete this work order? Any allocated parts will be returned to inventory.")) {
      const job = this.serviceJobs.find(j => j.id === this.activeJobId);
      if (!job) return;

      try {
        // Return parts stock
        for (const item of job.parts) {
          const part = this.parts.find(p => p.id === item.partId);
          if (part) {
            part.stock += item.quantity;
            await DB.updatePartStock(part.id, part.stock);
          }
        }
        await DB.deleteServiceJob(job.id);
        this.serviceJobs = this.serviceJobs.filter(j => j.id !== this.activeJobId);
        this.closeModal('modal-manage-job');
        this.renderServiceBoard();
        this.showToast("Work order discarded", "info");
      } catch (err) {
        this.showToast("Database error: " + err.message, "danger");
      }
    }
  }

  invoiceAndPayWorkOrder() {
    const job = this.serviceJobs.find(j => j.id === this.activeJobId);
    if (!job) return;

    if (job.status !== 'Ready') {
      this.showToast("Can only finalize work orders in 'Ready' status!", "warning");
      return;
    }

    // Set up active checkout structures (Service job POS bridge)
    this.selectedCustomer = this.customers.find(c => c.id === job.customerId);
    
    // Map parts to temporary cart
    this.cart = [];
    job.parts.forEach(item => {
      this.cart.push({
        partId: item.partId,
        quantity: item.quantity,
        price: item.price
      });
    });

    // Populate Checkout Modal Mechanics
    const mechSelect = document.getElementById('checkout-mechanic');
    mechSelect.innerHTML = '<option value="">-- No Mechanic --</option>';
    this.mechanics.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      mechSelect.appendChild(opt);
    });

    // Set mechanic and labor from job
    if (job.mechanic) {
      const mech = this.mechanics.find(m => m.name === job.mechanic);
      if (mech) mechSelect.value = mech.id;
    }
    document.getElementById('checkout-labor-fee').value = job.laborCost.toFixed(2);

    this.updateCheckoutTotal();
    
    // Reset calculator
    document.getElementById('cash-received').value = '';
    document.getElementById('cash-change-due').textContent = '₱0.00';
    
    this.closeModal('modal-manage-job');
    this.openModal('modal-checkout');
  }

  // Handle both retail and service checkouts in one unified pay call
  async completeTransaction() {
    const rawTotal = document.getElementById('checkout-total').textContent;
    const totalVal = parseFloat(rawTotal.replace(/[^0-9.-]+/g, '')) || 0;
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

    let cashReceived = null;
    let changeDue = null;

    if (paymentMethod === 'Cash') {
      cashReceived = parseFloat(document.getElementById('cash-received').value) || 0;
      if (cashReceived < totalVal) {
        this.showToast("Cash received must cover invoice amount!", "warning");
        return;
      }
      changeDue = cashReceived - totalVal;
    }

    if (paymentMethod === 'Debt' && !this.selectedCustomer) {
      this.showToast("A customer must be attached to the order to use Debt/Utang!", "warning");
      return;
    }

    const checkoutMechanicId = document.getElementById('checkout-mechanic').value;
    const checkoutLaborFee = parseFloat(document.getElementById('checkout-labor-fee').value) || 0;
    const mechanic = checkoutMechanicId ? this.mechanics.find(m => m.id === checkoutMechanicId) : null;

    const subtotal = this.cart.reduce((sum, item) => {
      const p = this.parts.find(part => part.id === item.partId);
      return sum + (p ? p.price * item.quantity : 0);
    }, 0);

    const discountInput = document.getElementById('cart-discount-input');
    const discount = parseFloat(discountInput ? discountInput.value : 0) || 0;

    let transactionRecord = null;
    const txId = 'TX-' + (this.transactions.length + 10001);
    const stockUpdates = [];

    if (this.activeJobId && this.activeView === 'service') {
      // --- SERVICE JOB INVOICE CHECKOUT ROUTING ---
      const job = this.serviceJobs.find(j => j.id === this.activeJobId);
      if (!job) return;

      const itemsRecord = job.parts.map(it => ({
        id: it.partId, name: it.name, quantity: it.quantity, price: it.price
      }));
      
      if (checkoutLaborFee > 0) {
        itemsRecord.push({ id: "labor", name: `Labor: ${mechanic ? mechanic.name : 'Service'}`, quantity: 1, price: checkoutLaborFee });
      }

      const laborSubtotal  = subtotal + checkoutLaborFee;

      transactionRecord = {
        id: txId, type: "Service",
        customerId: job.customerId, customerName: job.customerName,
        vehicle: job.vehicle, items: itemsRecord,
        subtotal: laborSubtotal, discount: 0.00, total: totalVal, paymentMethod,
        amountTendered: cashReceived, changeDue: changeDue,
        date: new Date().toISOString()
      };

      job.status = 'Completed';
      // Sync the job labor cost with whatever was in the checkout modal
      job.laborCost = checkoutLaborFee;
      job.mechanic = mechanic ? mechanic.name : job.mechanic;
      stockUpdates.push(DB.updateServiceJob({ ...job, status: 'Completed' }));

      // --- AUTO-RECORD LABOR TO MECHANIC ---
      if (checkoutLaborFee > 0 && mechanic) {
        const laborRecord = {
          description: `Service: ${job.description ? job.description.split(',')[0] : job.id} (${job.customerName})`,
          amount: checkoutLaborFee,
          date: new Date().toISOString().split('T')[0]
        };
        try {
          const recordId = await DB.addLaborRecord(mechanic.id, laborRecord);
          if (!mechanic.laborRecords) mechanic.laborRecords = [];
          const exists = mechanic.laborRecords.some(r => r.id === recordId || (r.description === laborRecord.description && r.date === laborRecord.date && r.amount === laborRecord.amount));
          if (!exists) {
            mechanic.laborRecords.push({ ...laborRecord, id: recordId });
          }
        } catch (e) { console.warn('Could not record labor for mechanic:', e); }
      }

      this.serviceJobs = this.serviceJobs.filter(j => j.id !== job.id);
      this.activeJobId = null;
    } else {
      // --- REGULAR RETAIL SALES CHECKOUT ROUTING ---
      const itemsRecord = [];
      this.cart.forEach(cartItem => {
        const part = this.parts.find(p => p.id === cartItem.partId);
        if (part) {
          itemsRecord.push({ id: part.id, name: part.name, quantity: cartItem.quantity, price: part.price });
          part.stock = Math.max(0, part.stock - cartItem.quantity);
          stockUpdates.push(DB.updatePartStock(part.id, part.stock));
        }
      });
      
      if (checkoutLaborFee > 0) {
        itemsRecord.push({ id: "labor", name: `Labor: ${mechanic ? mechanic.name : 'General'}`, quantity: 1, price: checkoutLaborFee });
      }

      const laborSubtotal = subtotal + checkoutLaborFee;
      
      transactionRecord = {
        id: txId, type: "Retail",
        customerId: this.selectedCustomer ? this.selectedCustomer.id : null,
        customerName: this.selectedCustomer ? this.selectedCustomer.name : "Walk-in Customer",
        items: itemsRecord, subtotal: laborSubtotal, discount,
        total: totalVal, paymentMethod, 
        amountTendered: cashReceived, changeDue: changeDue, date: new Date().toISOString()
      };

      // --- AUTO-RECORD LABOR TO MECHANIC ---
      if (checkoutLaborFee > 0 && mechanic) {
        const laborRecord = {
          description: `Retail POS Labor: ${transactionRecord.customerName}`,
          amount: checkoutLaborFee,
          date: new Date().toISOString().split('T')[0]
        };
        try {
          const recordId = await DB.addLaborRecord(mechanic.id, laborRecord);
          if (!mechanic.laborRecords) mechanic.laborRecords = [];
          const exists = mechanic.laborRecords.some(r => r.id === recordId || (r.description === laborRecord.description && r.date === laborRecord.date && r.amount === laborRecord.amount));
          if (!exists) {
            mechanic.laborRecords.push({ ...laborRecord, id: recordId });
          }
        } catch (e) { console.warn('Could not record labor for mechanic:', e); }
      }
    }

    try {
      const promises = [...stockUpdates, DB.createTransaction(transactionRecord)];
      
      // Update customer debt if payment method is Debt
      if (paymentMethod === 'Debt' && this.selectedCustomer) {
        this.selectedCustomer.debt = (this.selectedCustomer.debt || 0) + totalVal;
        promises.push(DB.upsertCustomer(this.selectedCustomer));
      }

      await Promise.all(promises);
      this.transactions.push(transactionRecord);

      // Reset checkout states
      this.cart = [];
      this.selectedCustomer = null;
      if (discountInput) discountInput.value = '0.00';
      this.closeModal('modal-checkout');
      this.showToast("Transaction Completed & Recorded", "success");
      
      // Force sync with DB to ensure labor records and stock are up to date in local state
      await this.loadData();
      
      this.generateReceiptHTML(transactionRecord);
      this.openModal('modal-receipt');
      if (this.activeView === 'service') {
        this.renderServiceBoard();
      } else {
        this.renderPOSCatalog();
        this.renderPOSCart();
      }
    } catch (err) {
      console.error(err);
      this.showToast("Database error: " + err.message, "danger");
    }
  }

  // =====================================================================
  // CASHIER OVERHAUL HELPER METHODS
  // =====================================================================

  setupNumpad() {
    const input = document.getElementById('cash-received');
    if (!input) return;

    // Handle physical keyboard input
    input.addEventListener('input', () => {
      // Basic sanitization to prevent non-numeric entry (except decimals)
      input.value = input.value.replace(/[^0-9.]/g, '');
      
      // Ensure only one decimal point
      const parts = input.value.split('.');
      if (parts.length > 2) {
        input.value = parts[0] + '.' + parts.slice(1).join('');
      }

      this.calculateCashChange();
    });

    document.querySelectorAll('.np-key').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const val = btn.getAttribute('data-val');
        const preset = btn.getAttribute('data-preset');
        const action = btn.getAttribute('data-action');

        let current = input.value;

        if (val !== null) {
          if (val === '.' && current.includes('.')) return;
          if (current === '' || current === '0.00') {
            current = (val === '.') ? '0.' : val;
          } else {
            current += val;
          }
          input.value = current;
        } else if (preset !== null) {
          const totalVal = parseFloat(document.getElementById('checkout-total').textContent.replace('₱', '')) || 0;
          if (preset === 'exact') {
            input.value = totalVal.toFixed(2);
          } else {
            const amt = parseFloat(preset);
            const currentAmt = parseFloat(input.value) || 0;
            input.value = (currentAmt + amt).toFixed(2);
          }
        } else if (action === 'clear') {
          input.value = '';
        } else if (action === 'exact') {
          const totalVal = parseFloat(document.getElementById('checkout-total').textContent.replace('₱', '')) || 0;
          input.value = totalVal.toFixed(2);
        }

        this.calculateCashChange();
      });
    });
  }

  setupHoldRecall() {
    const holdBtn = document.getElementById('btn-hold-order');
    const recallBtn = document.getElementById('btn-recall-order');
    if (holdBtn) {
      holdBtn.addEventListener('click', () => this.holdOrder());
    }
    if (recallBtn) {
      recallBtn.addEventListener('click', () => this.recallOrder());
    }
    this.checkHeldOrder();
  }

  holdOrder() {
    if (this.cart.length === 0) {
      this.showToast("Cannot hold an empty order!", "warning");
      return;
    }
    const holdData = {
      cart: this.cart,
      selectedCustomer: this.selectedCustomer,
      discount: document.getElementById('cart-discount-input').value,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    localStorage.setItem('apex_held_order', JSON.stringify(holdData));
    this.cart = [];
    this.selectedCustomer = null;
    document.getElementById('cart-discount-input').value = '0.00';
    this.renderPOSCart();
    this.checkHeldOrder();
    this.showToast("Active order put on Hold", "success");
  }

  recallOrder() {
    const held = localStorage.getItem('apex_held_order');
    if (!held) return;
    if (this.cart.length > 0 && !confirm("Overwrite current active order?")) {
      return;
    }
    const data = JSON.parse(held);
    this.cart = data.cart;
    this.selectedCustomer = data.selectedCustomer;
    document.getElementById('cart-discount-input').value = data.discount || '0.00';
    localStorage.removeItem('apex_held_order');
    this.renderPOSCart();
    this.checkHeldOrder();
    this.showToast("Held order recalled successfully", "success");
  }

  checkHeldOrder() {
    const recallBtn = document.getElementById('btn-recall-order');
    const holdTimeSpan = document.getElementById('hold-time');
    if (!recallBtn) return;
    const held = localStorage.getItem('apex_held_order');
    if (held) {
      const data = JSON.parse(held);
      holdTimeSpan.textContent = data.time;
      recallBtn.style.display = 'inline-flex';
    } else {
      recallBtn.style.display = 'none';
    }
  }

  setupBarcodeScanner() {
    let buffer = "";
    let lastKeyTime = Date.now();

    window.addEventListener('keypress', (e) => {
      // Avoid wedge trigger when focusing on interactive text fields
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 200) {
        buffer = ""; // slow typing timer reset
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.length > 2) {
          this.handleScannedSKU(buffer.trim());
        }
        buffer = "";
      } else {
        buffer += e.key;
      }
    });
  }

  handleScannedSKU(sku) {
    console.log("Barcode wedge read SKU:", sku);
    const part = this.parts.find(p => p.sku.toLowerCase() === sku.toLowerCase());
    if (part) {
      this.addToCart(part.id);
      this.showToast(`Scanned: ${part.sku}`, "success");
    } else {
      this.showToast(`Unknown product code: ${sku}`, "warning");
    }
  }

  triggerCartBounce() {
    const cartPanel = document.querySelector('.pos-cart-panel');
    if (cartPanel) {
      cartPanel.classList.remove('cart-bounce');
      void cartPanel.offsetWidth; // trigger reflow
      cartPanel.classList.add('cart-bounce');
    }
  }

  // ================= ITEM SEARCH MODAL (POS) ================= //

  openItemSearchModal() {
    // Populate category dropdown
    const catSelect = document.getElementById('item-search-category');
    catSelect.innerHTML = '<option value="All">All Categories</option>';
    const categories = [...new Set(this.parts.map(p => p.category))].sort();
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    });

    // Clear previous search
    document.getElementById('item-search-input').value = '';
    catSelect.value = 'All';

    this.renderItemSearchResults();
    this.openModal('modal-item-search');

    // Auto-focus the search box
    setTimeout(() => document.getElementById('item-search-input').focus(), 150);
  }

  renderItemSearchResults() {
    const query = (document.getElementById('item-search-input').value || '').toLowerCase().trim();
    const category = document.getElementById('item-search-category').value;
    const grid = document.getElementById('item-search-results');
    grid.innerHTML = '';

    let filtered = this.parts;
    if (category !== 'All') filtered = filtered.filter(p => p.category === category);
    if (query) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query)
      );
    }

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary);">No items found. Try a different SKU or category.</div>`;
      return;
    }

    filtered.forEach(p => {
      const isOut = p.stock === 0;
      const isLow = p.stock > 0 && p.stock <= p.minStock;
      const inCart = this.cart.find(c => c.partId === p.id);

      let stockBadge = `<span style="font-size:0.7rem;padding:2px 6px;border-radius:20px;background:rgba(46,204,113,0.15);color:var(--success);font-weight:600;">${p.stock} Avail</span>`;
      if (isOut) stockBadge = `<span style="font-size:0.7rem;padding:2px 6px;border-radius:20px;background:rgba(231,76,60,0.15);color:var(--danger);font-weight:600;">Out of Stock</span>`;
      else if (isLow) stockBadge = `<span style="font-size:0.7rem;padding:2px 6px;border-radius:20px;background:rgba(241,196,15,0.15);color:#f1c40f;font-weight:600;">Low: ${p.stock}</span>`;

      const card = document.createElement('div');
      card.style.cssText = `
        background: var(--bg-surface); border: 1px solid ${isOut ? 'rgba(231,76,60,0.3)' : inCart ? 'var(--accent)' : 'var(--border-color)'};
        border-radius: 10px; padding: 12px; cursor: ${isOut ? 'not-allowed' : 'pointer'};
        opacity: ${isOut ? '0.55' : '1'}; transition: all 0.2s;
        display: flex; flex-direction: column; gap: 6px;
      `;
      card.innerHTML = `
        <div style="font-size:0.7rem;color:var(--text-secondary);font-family:monospace;letter-spacing:0.5px;">${p.sku}</div>
        <div style="font-size:0.85rem;font-weight:600;line-height:1.3;flex-grow:1;">${p.name}</div>
        <div style="font-size:0.7rem;color:var(--text-secondary);">Category: <span style="color:var(--accent);">${p.category}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
          <div style="font-size:1rem;font-weight:700;color:var(--accent);">₱${p.price.toFixed(2)}</div>
          ${stockBadge}
        </div>
        ${inCart ? `<div style="font-size:0.72rem;text-align:center;padding:4px;background:rgba(var(--accent-rgb,255,95,31),0.1);border-radius:6px;color:var(--accent);">✓ In cart (qty: ${inCart.quantity})</div>` : ''}
      `;

      if (!isOut) {
        card.addEventListener('click', () => {
          this.addToCart(p.id);
          this.renderItemSearchResults(); // Refresh to show updated in-cart count
        });
        card.addEventListener('mouseenter', () => { if (!isOut) card.style.borderColor = 'var(--accent)'; card.style.transform = 'translateY(-2px)'; });
        card.addEventListener('mouseleave', () => { card.style.borderColor = inCart ? 'var(--accent)' : 'var(--border-color)'; card.style.transform = ''; });
      }

      grid.appendChild(card);
    });
  }

  // ================= MECHANICS & LABOR ================= //

  renderMechanicList() {
    const gridEl = document.getElementById('mechanic-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';
    
    if (!this.mechanics || this.mechanics.length === 0) {
      gridEl.innerHTML = '<div style="grid-column: 1 / -1; padding: 32px; color: var(--text-secondary); text-align: center; background: var(--bg-surface); border-radius: 8px;">No mechanics found. Click "+ Add New Mechanic" to create one.</div>';
      return;
    }

    this.mechanics.forEach(mech => {
      let laborTotal = 0;
      const laborRows = (mech.laborRecords || []).map(lr => {
        laborTotal += lr.amount;
        return `
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 6px 0; border-bottom: 1px solid var(--border-color);">
            <div>
              <div style="font-weight: 500;">${lr.description}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${lr.date}</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end;">
              <span style="font-weight: 600; color: var(--success);">₱${lr.amount.toFixed(2)}</span>
              <button class="btn btn-sm" style="padding: 2px 6px; font-size: 0.7rem; color: var(--danger); background: transparent;" onclick="app.deleteLaborRecord('${mech.id}', '${lr.id}')">Del</button>
            </div>
          </div>
        `;
      }).join('');

      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = '20px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h3 style="margin: 0; font-size: 1.3rem;">${mech.name}</h3>
            <div style="color: var(--text-secondary); font-size: 0.9rem;">${mech.role || 'Mechanic'}</div>
          </div>
          <div style="font-size: 1.2rem; font-weight: bold; color: var(--success);">₱${laborTotal.toFixed(2)}</div>
        </div>
        
        <div style="margin-top: 16px; flex-grow: 1;">
          <div style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">Labor Breakdown</div>
          <div style="max-height: 200px; overflow-y: auto; background: var(--bg-primary); border-radius: 8px; padding: 8px;">
             ${laborRows || '<div style="color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 12px 0;">No labor records found.</div>'}
          </div>
        </div>
        
        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="app.openLaborModal('${mech.id}')">Add Labor</button>
          <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="app.openMechanicModal('${mech.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="app.deleteMechanic('${mech.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
          </button>
        </div>
      `;
      gridEl.appendChild(card);
    });
  }

  openMechanicModal(id = null) {
    this.editingMechanicId = id;
    if (id) {
      const mech = this.mechanics.find(m => m.id === id);
      document.getElementById('mech-id').value = mech.id;
      document.getElementById('mech-name').value = mech.name;
      document.getElementById('mech-role').value = mech.role || '';
      document.getElementById('employee-modal-title').innerText = 'Edit Mechanic';
    } else {
      document.getElementById('mech-id').value = '';
      document.getElementById('mech-name').value = '';
      document.getElementById('mech-role').value = '';
      document.getElementById('employee-modal-title').innerText = 'New Mechanic';
    }
    this.openModal('modal-mechanic');
  }

  async saveMechanicForm() {
    const data = {
      id: document.getElementById('mech-id').value,
      name: document.getElementById('mech-name').value,
      role: document.getElementById('mech-role').value
    };
    if (!data.name) return this.showToast('Mechanic name is required', 'warning');
    
    const existing = this.mechanics.find(m => m.id === data.id);
    if (existing) data.laborRecords = existing.laborRecords;
    
    try {
      await DB.upsertMechanic(data);
      await this.loadData();
      this.closeModal('modal-mechanic');
      this.renderMechanicList();
      this.showToast('Mechanic saved');
    } catch (err) {
      this.showToast('Error saving mechanic', 'danger');
    }
  }

  async deleteMechanic(id) {
    if (!confirm('Are you sure you want to delete this mechanic?')) return;
    try {
      await DB.deleteMechanic(id);
      await this.loadData();
      this.renderMechanicList();
      this.showToast('Mechanic deleted');
    } catch (err) {
      this.showToast('Error deleting mechanic', 'danger');
    }
  }

  openLaborModal(mechanicId = null) {
    this.editingMechanicId = mechanicId;
    document.getElementById('labor-desc').value = '';
    document.getElementById('labor-amount').value = '';
    document.getElementById('labor-date').value = new Date().toISOString().split('T')[0];

    const select = document.getElementById('labor-mechanic-select');
    select.innerHTML = '<option value="">-- Select Mechanic --</option>';
    this.mechanics.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      select.appendChild(opt);
    });

    if (mechanicId) {
      select.value = mechanicId;
      select.disabled = true;
    } else {
      select.value = '';
      select.disabled = false;
    }

    this.openModal('modal-labor');
  }

  async saveLaborForm() {
    const select = document.getElementById('labor-mechanic-select');
    const targetMechanicId = select.value;
    if (!targetMechanicId) return this.showToast('Please select a mechanic', 'warning');

    const desc = document.getElementById('labor-desc').value;
    const amount = parseFloat(document.getElementById('labor-amount').value);
    const date = document.getElementById('labor-date').value;
    
    if (!desc || isNaN(amount)) return this.showToast('Description and valid amount are required', 'warning');
    
    try {
      await DB.addLaborRecord(targetMechanicId, { description: desc, amount, date: date || new Date().toISOString().split('T')[0] });
      await this.loadData();
      this.closeModal('modal-labor');
      
      this.renderMechanicList();
      
      this.showToast('Labor record added');
    } catch (err) {
      this.showToast('Error adding labor record', 'danger');
    }
  }

  async deleteLaborRecord(mechanicId, recordId) {
    if (!confirm('Delete this labor record?')) return;
    try {
      await DB.deleteLaborRecord(mechanicId, recordId);
      await this.loadData();
      this.renderMechanicList();
      this.showToast('Labor record deleted');
    } catch (err) {
      this.showToast('Error deleting labor record', 'danger');
    }
  }

  // ==========================================
  // SALES HISTORY MODULE
  // ==========================================

  renderSalesHistory() {
    const listBody = document.getElementById('sales-history-body');
    if (!listBody) return;
    listBody.innerHTML = '';

    const searchVal = document.getElementById('sh-search-input').value.toLowerCase().trim();

    let filtered = this.transactions;
    if (searchVal) {
      filtered = filtered.filter(tx => 
        tx.id.toLowerCase().includes(searchVal) ||
        (tx.customerName && tx.customerName.toLowerCase().includes(searchVal)) ||
        tx.items.some(item => item.name.toLowerCase().includes(searchVal))
      );
    }

    if (filtered.length === 0) {
      listBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">No transactions found.</td></tr>`;
      return;
    }

    // Sort by date descending (newest first)
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(tx => {
      const isDebt = tx.paymentMethod === 'Debt';
      const typeBadge = `<span class="badge ${tx.type === 'Service' ? 'badge-info' : 'badge-secondary'}">${tx.type}</span>`;
      const pmtBadge = isDebt ? `<span class="badge badge-danger">Debt</span>` : `<span class="badge badge-success">${tx.paymentMethod}</span>`;
      
      const itemsSummary = tx.items.map(it => `${it.quantity}x ${it.name.split(' ')[0]}`).join(', ');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--accent); font-family:monospace;">${tx.id}</strong></td>
        <td>${new Date(tx.date).toLocaleString()}</td>
        <td>${typeBadge}</td>
        <td>${tx.customerName || 'Walk-in'}</td>
        <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${itemsSummary}">${itemsSummary}</td>
        <td style="text-align:right; font-weight:700; color:${isDebt ? 'var(--danger)' : 'var(--text-primary)'}">₱${tx.total.toFixed(2)}</td>
        <td>${pmtBadge}</td>
        <td style="text-align:center;">
          <button class="btn btn-secondary btn-sm" onclick="app.viewPastReceipt('${tx.id}')">View</button>
        </td>
      `;
      listBody.appendChild(tr);
    });
  }

  viewPastReceipt(txId) {
    const tx = this.transactions.find(t => t.id === txId);
    if (!tx) return;

    this.currentViewReceipt = tx; // Store it for re-printing

    const content = document.getElementById('past-receipt-content');
    
    let itemsHtml = '';
    tx.items.forEach(item => {
      const itemTotal = item.quantity * item.price;
      itemsHtml += `
        <div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
          <span style="flex-grow:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
        </div>
        <div style="display:flex; justify-content:space-between; color: #555; margin-bottom: 6px;">
          <span>${item.quantity} x ${item.price.toFixed(2)}</span>
          <span>${itemTotal.toFixed(2)}</span>
        </div>
      `;
    });

    const isDebt = tx.paymentMethod === 'Debt';

    content.innerHTML = `
      <div style="text-align:center; margin-bottom: 15px;">
        <strong style="font-size: 1.2rem;">DIEGO'S</strong><br>
        <span>Motorcycle Parts & Accessories</span><br>
        <span style="font-size: 0.85rem;">brgy.ganaderia , palayan city</span><br>
        <span style="margin-top: 5px; display: inline-block;">Receipt: ${tx.id}</span><br>
        <span>Date: ${new Date(tx.date).toLocaleString()}</span>
      </div>
      
      ${tx.customerName ? `
        <div style="margin-bottom:15px; border-bottom: 1px dashed #ccc; padding-bottom:10px;">
          Customer: <strong>${tx.customerName}</strong>
        </div>
      ` : ''}

      <div style="border-bottom: 1px dashed #ccc; margin-bottom: 10px; padding-bottom: 5px;">
        ${itemsHtml}
      </div>

      <div style="display:flex; justify-content:space-between;">
        <span>Subtotal</span>
        <span>${tx.subtotal.toFixed(2)}</span>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span>Discount</span>
        <span>${(tx.discount || 0).toFixed(2)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-weight:bold; font-size: 1.1rem; margin-top: 5px;">
        <span>TOTAL</span>
        <span>₱${tx.total.toFixed(2)}</span>
      </div>

      <div style="margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 10px;">
        <div style="display:flex; justify-content:space-between;">
          <span>Payment Type:</span>
          <span style="${isDebt ? 'color:red;font-weight:bold;' : ''}">${tx.paymentMethod}</span>
        </div>
        ${!isDebt && tx.amountTendered ? `
          <div style="display:flex; justify-content:space-between;">
            <span>Cash Given:</span>
            <span>${tx.amountTendered.toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Change:</span>
            <span>${(tx.changeDue || 0).toFixed(2)}</span>
          </div>
        ` : ''}
      </div>
      
      <div style="text-align:center; margin-top: 20px; font-size: 0.8rem; color: #666;">
        ${isDebt ? '*** UNPAID BALANCE ***' : 'Thank you for your business!'}
      </div>
    `;

    this.openModal('modal-past-receipt');
  }

  reprintPastReceipt() {
    if (!this.currentViewReceipt) return;
    const tx = this.currentViewReceipt;
    
    // Populate the hidden print container
    const printContainer = document.getElementById('print-receipt-container');
    printContainer.innerHTML = document.getElementById('past-receipt-content').innerHTML;

    // Use dynamic style
    let style = document.getElementById('dynamic-print-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dynamic-print-style';
      document.head.appendChild(style);
    }
    style.innerHTML = `@page { size: 58mm auto; margin: 0; }`;

    document.getElementById('modal-past-receipt').style.display = 'none';

    window.print();

    setTimeout(() => {
      style.innerHTML = '';
      printContainer.innerHTML = '';
      document.getElementById('modal-past-receipt').style.display = 'flex';
    }, 1000);
  }

}


// Instantiate and expose globally
const app = new ApexMotoPOS();
window.onload = () => app.init();
