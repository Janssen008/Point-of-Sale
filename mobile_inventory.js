// mobile_inventory.js
class MobileInventoryApp {
  constructor() {
    this.parts = [];
    this.filteredParts = [];
    
    // State
    this.currentStaffTab = 'qty_change'; // 'qty_change' or 'new_item'
    this.selectedPartForQty = null;
    this.qtyActionType = 'stock_in'; // 'stock_in', 'stock_out', or 'audit'
    this.scannerMode = 'search'; // 'search', 'alt', or 'sku'
    this.html5QrcodeScanner = null;
    
    // UI Elements
    this.elList = document.getElementById('inventory-list');
    this.elSearch = document.getElementById('search-input');
    this.elClearSearch = document.getElementById('search-clear');
    this.elLoading = document.getElementById('loading-state');
    this.elEmpty = document.getElementById('empty-state');
    
    this.elScannerOverlay = document.getElementById('scanner-overlay');
    this.elSheetOverlay = document.getElementById('part-sheet-overlay');
    this.elFormNewPart = document.getElementById('form-part');
    this.elFormQtyChange = document.getElementById('form-qty-change');
    
    this.init();
  }

  async init() {
    if (typeof DB === 'undefined') {
      this.showToast('Database connection missing', 'danger');
      return;
    }
    await this.loadData();
  }

  async loadData() {
    this.setLoading(true);
    try {
      this.parts = await DB.getParts();
      this.filteredParts = [...this.parts];
      this.populatePartDropdown();
      this.renderList();
    } catch (e) {
      console.error(e);
      this.showToast('Failed to load inventory', 'danger');
    } finally {
      this.setLoading(false);
    }
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.elLoading.style.display = 'flex';
      this.elList.style.display = 'none';
      this.elEmpty.style.display = 'none';
    } else {
      this.elLoading.style.display = 'none';
      this.elList.style.display = 'flex';
    }
  }

  renderList() {
    const query = this.elSearch.value.toLowerCase().trim();
    
    if (query) {
      this.elClearSearch.style.display = 'flex';
      this.filteredParts = this.parts.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.sku.toLowerCase().includes(query) ||
        (p.altBarcodes && p.altBarcodes.some(b => b.toLowerCase().includes(query)))
      );
    } else {
      this.elClearSearch.style.display = 'none';
      this.filteredParts = [...this.parts];
    }

    if (this.filteredParts.length === 0) {
      this.elList.style.display = 'none';
      this.elEmpty.style.display = 'flex';
    } else {
      this.elList.style.display = 'flex';
      this.elEmpty.style.display = 'none';
      
      this.elList.innerHTML = this.filteredParts.map(p => {
        let stockClass = 'stock-high';
        if (p.stock <= 0) stockClass = 'stock-out';
        else if (p.stock <= (p.minStock ?? p.min_stock ?? 2)) stockClass = 'stock-low';

        return `
          <div class="part-card" onclick="app.openStaffModal('qty_change', '${p.id}')">
            <div class="part-header">
              <div>
                <div class="part-name">${p.name}</div>
                <div class="part-sku">${p.sku}</div>
              </div>
              <div class="part-category">${p.category}</div>
            </div>
            <div class="part-footer">
              <div class="part-price">₱${p.price.toFixed(2)}</div>
              <div class="part-stock ${stockClass}">
                <span class="stock-dot"></span>
                ${p.stock} in stock
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  clearSearch() {
    this.elSearch.value = '';
    this.renderList();
    this.elSearch.focus();
  }

  // --- STOCK STAFF MODAL CONTROLS ---

  populatePartDropdown() {
    const select = document.getElementById('staff-part-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose an item --</option>' +
      this.parts.map(p => `
        <option value="${p.id}">${p.sku} — ${p.name} (Stock: ${p.stock})</option>
      `).join('');
  }

  openStaffModal(tab = 'qty_change', partId = null) {
    this.populatePartDropdown();

    // Set selected item if provided or default
    if (partId) {
      const found = this.parts.find(p => p.id === partId);
      if (found) {
        this.selectPartForQty(found);
      }
    } else if (this.parts.length > 0 && !this.selectedPartForQty) {
      this.selectPartForQty(this.parts[0]);
    }

    this.switchStaffTab(tab);
    this.elSheetOverlay.classList.add('active');
  }

  closePartModal() {
    this.elSheetOverlay.classList.remove('active');
  }

  switchStaffTab(tabName) {
    this.currentStaffTab = tabName;
    
    const btnQty = document.getElementById('tab-btn-qty');
    const btnNew = document.getElementById('tab-btn-new');
    const contentQty = document.getElementById('tab-content-qty');
    const contentNew = document.getElementById('tab-content-new');
    const sheetTitle = document.getElementById('sheet-title');

    if (tabName === 'qty_change') {
      btnQty.classList.add('active');
      btnNew.classList.remove('active');
      contentQty.classList.add('active');
      contentNew.classList.remove('active');
      sheetTitle.textContent = 'Quantity Change';
      this.updateCalculatedStock();
    } else {
      btnNew.classList.add('active');
      btnQty.classList.remove('active');
      contentNew.classList.add('active');
      contentQty.classList.remove('active');
      sheetTitle.textContent = 'Inventory New Item';
    }
  }

  onStaffPartSelectChange(partId) {
    if (!partId) {
      this.selectedPartForQty = null;
      document.getElementById('selected-part-preview').style.display = 'none';
      this.updateCalculatedStock();
      return;
    }
    const part = this.parts.find(p => p.id === partId);
    if (part) {
      this.selectPartForQty(part);
    }
  }

  selectPartForQty(part) {
    this.selectedPartForQty = part;
    
    const dropdown = document.getElementById('staff-part-select');
    if (dropdown) dropdown.value = part.id;

    document.getElementById('selected-part-preview').style.display = 'block';
    document.getElementById('preview-part-name').textContent = part.name;
    document.getElementById('preview-part-sku').textContent = `SKU: ${part.sku}`;
    document.getElementById('preview-part-cat').textContent = part.category;
    document.getElementById('preview-part-stock').textContent = `${part.stock} in stock`;

    this.updateCalculatedStock();
  }

  onQtyActionTypeChange(actionType) {
    this.qtyActionType = actionType;

    const pills = ['stock_in', 'stock_out', 'audit'];
    pills.forEach(p => {
      const el = document.getElementById(`pill-${p}`);
      if (el) {
        if (p === actionType) el.classList.add('active');
        else el.classList.remove('active');
      }
    });

    const label = document.getElementById('qty-input-label');
    const reasonSelect = document.getElementById('staff-qty-reason');
    const presetsGrid = document.querySelector('.qty-presets');

    if (actionType === 'stock_in') {
      label.textContent = 'Quantity to Add (Stock In)';
      reasonSelect.value = 'Stock In - Supplier Receiving';
      if (presetsGrid) {
        presetsGrid.innerHTML = `
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(1)">+1</button>
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(5)">+5</button>
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(10)">+10</button>
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(50)">+50</button>
        `;
      }
    } else if (actionType === 'stock_out') {
      label.textContent = 'Quantity to Remove (Stock Out)';
      reasonSelect.value = 'Stock Out - Damaged / Expired';
      if (presetsGrid) {
        presetsGrid.innerHTML = `
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(1)">-1</button>
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(5)">-5</button>
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(10)">-10</button>
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(50)">-50</button>
        `;
      }
    } else {
      label.textContent = 'Exact Physical Count (Audit)';
      reasonSelect.value = 'Inventory Audit Adjustment';
      if (presetsGrid && this.selectedPartForQty) {
        const cur = this.selectedPartForQty.stock;
        presetsGrid.innerHTML = `
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(0)">0</button>
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(${cur})">Current (${cur})</button>
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(${cur + 5})">+5 Audit</button>
          <button type="button" class="preset-btn" onclick="app.applyPresetQty(100)">100</button>
        `;
      }
    }

    this.updateCalculatedStock();
  }

  adjustStaffQty(step) {
    const input = document.getElementById('staff-qty-input');
    let current = parseInt(input.value) || 0;
    let next = Math.max(0, current + step);
    input.value = next;
    this.updateCalculatedStock();
  }

  applyPresetQty(amount) {
    const input = document.getElementById('staff-qty-input');
    input.value = Math.abs(amount);
    this.updateCalculatedStock();
  }

  updateCalculatedStock() {
    const currentValEl = document.getElementById('calc-current-val');
    const newValEl = document.getElementById('calc-new-val');
    const badgeEl = document.getElementById('calc-delta-badge');
    const inputEl = document.getElementById('staff-qty-input');

    if (!currentValEl || !newValEl || !badgeEl || !inputEl) return;

    const currentStock = this.selectedPartForQty ? parseInt(this.selectedPartForQty.stock) || 0 : 0;
    const qtyVal = Math.max(0, parseInt(inputEl.value) || 0);

    let newStock = currentStock;
    let delta = 0;

    if (this.qtyActionType === 'stock_in') {
      newStock = currentStock + qtyVal;
      delta = qtyVal;
    } else if (this.qtyActionType === 'stock_out') {
      newStock = Math.max(0, currentStock - qtyVal);
      delta = -1 * (currentStock - newStock);
    } else if (this.qtyActionType === 'audit') {
      newStock = qtyVal;
      delta = newStock - currentStock;
    }

    currentValEl.textContent = currentStock;
    newValEl.textContent = newStock;

    if (delta > 0) {
      badgeEl.textContent = `+${delta}`;
      badgeEl.className = 'calc-badge positive';
    } else if (delta < 0) {
      badgeEl.textContent = `${delta}`;
      badgeEl.className = 'calc-badge negative';
    } else {
      badgeEl.textContent = '0';
      badgeEl.className = 'calc-badge neutral';
    }
  }

  async saveStaffQtyChange() {
    if (!this.selectedPartForQty) {
      this.showToast('Please select an inventory item first.', 'danger');
      return;
    }

    const currentValEl = document.getElementById('calc-new-val');
    const newStock = parseInt(currentValEl.textContent) || 0;
    const reason = document.getElementById('staff-qty-reason').value;
    const note = document.getElementById('staff-qty-note').value.trim();

    try {
      await DB.updatePartStock(this.selectedPartForQty.id, newStock);
      
      const prevStock = this.selectedPartForQty.stock;
      this.selectedPartForQty.stock = newStock;

      const logMsg = note ? `${reason} (${note})` : reason;
      this.showToast(`Stock updated: ${this.selectedPartForQty.name} (${prevStock} ➔ ${newStock})`, 'success');
      console.log(`[Staff Action] ${this.selectedPartForQty.name} stock changed from ${prevStock} to ${newStock}. Reason: ${logMsg}`);

      // Reset form note
      document.getElementById('staff-qty-note').value = '';
      
      await this.loadData();
      
      // Keep selected part up to date
      const updatedPart = this.parts.find(p => p.id === this.selectedPartForQty.id);
      if (updatedPart) this.selectPartForQty(updatedPart);

    } catch (e) {
      console.error(e);
      this.showToast('Failed to save quantity change.', 'danger');
    }
  }

  // --- TAB 2: NEW ITEM ENCODING ---

  generateAutoSKU() {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const generatedSKU = `SKU-${randomNum}`;
    const skuInput = document.getElementById('part-sku');
    if (skuInput) {
      skuInput.value = generatedSKU;
      this.showToast(`Generated SKU: ${generatedSKU}`, 'success');
    }
  }

  calculateMarginPreview() {
    const costInput = document.getElementById('part-cost');
    const priceInput = document.getElementById('part-price');
    const tag = document.getElementById('margin-preview-tag');
    const percentEl = document.getElementById('margin-percent');
    const amountEl = document.getElementById('margin-amount');

    if (!costInput || !priceInput || !tag) return;

    const cost = parseFloat(costInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;

    if (cost > 0 || price > 0) {
      tag.style.display = 'block';
      const profit = price - cost;
      const marginPct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : 0;
      percentEl.textContent = `${marginPct}%`;
      amountEl.textContent = `₱${profit.toFixed(2)}`;
      
      if (profit < 0) {
        tag.style.borderColor = 'var(--danger)';
        tag.style.color = 'var(--danger)';
      } else {
        tag.style.borderColor = 'var(--success)';
        tag.style.color = 'var(--success)';
      }
    } else {
      tag.style.display = 'none';
    }
  }

  async savePart() {
    const id = document.getElementById('part-id').value;
    const rawAlt = document.getElementById('part-alt-barcodes').value;
    const altBarcodes = rawAlt.split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const part = {
      sku: document.getElementById('part-sku').value.trim(),
      name: document.getElementById('part-name').value.trim(),
      category: document.getElementById('part-category').value,
      cost: parseFloat(document.getElementById('part-cost').value) || 0,
      price: parseFloat(document.getElementById('part-price').value) || 0,
      stock: parseInt(document.getElementById('part-stock').value) || 0,
      min_stock: parseInt(document.getElementById('part-min-stock').value) || 0,
      alt_barcodes: altBarcodes
    };

    if (id) part.id = id;

    try {
      const savedPart = await DB.upsertPart(part);
      this.showToast('New item registered into inventory!', 'success');
      this.closePartModal();
      await this.loadData();
      
      // Automatically select newly registered item for Qty Change view
      if (savedPart && savedPart.id) {
        const found = this.parts.find(p => p.id === savedPart.id);
        if (found) {
          this.selectPartForQty(found);
        }
      }
    } catch (e) {
      console.error(e);
      this.showToast('Failed to save part. Ensure SKU is unique.', 'danger');
    }
  }

  // --- BARCODE SCANNER LOGIC ---

  openScanner(mode = 'search') {
    this.scannerMode = mode;
    this.elScannerOverlay.classList.add('active');
    
    const titleEl = document.getElementById('scanner-title');
    const readerEl = document.getElementById('reader');
    const manualInput = document.getElementById('manual-barcode-input');
    
    if (readerEl) readerEl.innerHTML = '';
    if (manualInput) {
      manualInput.value = '';
      setTimeout(() => manualInput.focus(), 300);
    }

    if (mode === 'alt') {
      titleEl.textContent = 'Scan Alt Barcode';
    } else if (mode === 'sku') {
      titleEl.textContent = 'Scan Barcode for SKU';
    } else {
      titleEl.textContent = 'Scan Item Barcode';
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.handleCameraError("Camera permissions restricted (requires HTTPS or localhost). Please use manual entry below.");
      return;
    }

    if (!this.html5QrcodeScanner) {
      this.html5QrcodeScanner = new Html5Qrcode("reader");
    }
    
    this.html5QrcodeScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => this.onScanSuccess(decodedText),
      (errorMessage) => { /* ignore normal scanning errors */ }
    ).catch(err => {
      console.error(err);
      this.handleCameraError("Could not access camera. Please allow browser camera permission or use manual input below.");
    });
  }

  handleCameraError(message) {
    const readerEl = document.getElementById('reader');
    if (readerEl) {
      readerEl.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: var(--warning); font-size: 0.9rem; background: rgba(255, 179, 0, 0.05); border-radius: 8px;">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor" style="margin-bottom:8px; opacity:0.8;"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M13,17H11V15H13V17M13,13H11V7H13V13Z"/></svg>
          <div><strong>Camera Permission / Access Issue</strong></div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">${message}</div>
        </div>
      `;
    }
    this.showToast("Camera permission blocked. Type or scan code manually below.", "warning");
  }

  submitManualScan() {
    const input = document.getElementById('manual-barcode-input');
    const val = input ? input.value.trim() : '';
    if (!val) {
      this.showToast('Please enter a barcode SKU first.', 'danger');
      return;
    }
    this.onScanSuccess(val);
  }

  closeScanner() {
    this.elScannerOverlay.classList.remove('active');
    if (this.html5QrcodeScanner && this.html5QrcodeScanner.isScanning) {
      this.html5QrcodeScanner.stop().catch(console.error);
    }
  }

  onScanSuccess(decodedText) {
    this.closeScanner();
    
    if (this.scannerMode === 'search') {
      const p = this.parts.find(part => 
        part.sku === decodedText || 
        (part.altBarcodes && part.altBarcodes.includes(decodedText))
      );
      
      if (p) {
        this.openStaffModal('qty_change', p.id);
        this.showToast(`Found item: ${p.name}`, "success");
      } else {
        this.showToast("No part found. Presetting scanned SKU for new item...", "warning");
        this.openStaffModal('new_item');
        document.getElementById('part-sku').value = decodedText;
      }
    } else if (this.scannerMode === 'sku') {
      document.getElementById('part-sku').value = decodedText;
      this.showToast(`Scanned SKU: ${decodedText}`, "success");
    } else if (this.scannerMode === 'alt') {
      const el = document.getElementById('part-alt-barcodes');
      const current = el.value.trim();
      if (current) {
        if (!current.includes(decodedText)) el.value = current + ', ' + decodedText;
      } else {
        el.value = decodedText;
      }
      this.showToast(`Added Alt Barcode: ${decodedText}`, "success");
    }
  }

  // --- TOAST NOTIFICATIONS ---

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;padding-left:12px;font-size:1.2rem;">&times;</button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 3500);
  }
}

// Initialize when DOM loads
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new MobileInventoryApp();
});
