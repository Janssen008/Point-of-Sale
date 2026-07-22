// mobile_inventory.js
class MobileInventoryApp {
  constructor() {
    this.parts = [];
    this.filteredParts = [];
    
    // UI Elements
    this.elList = document.getElementById('inventory-list');
    this.elSearch = document.getElementById('search-input');
    this.elClearSearch = document.getElementById('search-clear');
    this.elLoading = document.getElementById('loading-state');
    this.elEmpty = document.getElementById('empty-state');
    
    this.elScannerOverlay = document.getElementById('scanner-overlay');
    this.elSheetOverlay = document.getElementById('part-sheet-overlay');
    this.elForm = document.getElementById('form-part');
    
    this.html5QrcodeScanner = null;
    this.scannerMode = 'search'; // 'search' or 'alt'
    
    this.init();
  }

  async init() {
    if (typeof DB === 'undefined') {
      this.showToast('Database connection missing (supabase.js)', 'danger');
      return;
    }
    await this.loadData();
  }

  async loadData() {
    this.setLoading(true);
    try {
      this.parts = await DB.getParts();
      this.filteredParts = [...this.parts];
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
        else if (p.stock <= p.minStock) stockClass = 'stock-low';

        return `
          <div class="part-card" onclick="app.openPartModal('${p.id}')">
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

  // --- Modal / Sheet Logic ---
  openPartModal(id = null) {
    this.elForm.reset();
    document.getElementById('part-id').value = '';
    
    if (id) {
      const part = this.parts.find(p => p.id === id);
      if (part) {
        document.getElementById('sheet-title').textContent = 'Edit Inventory';
        document.getElementById('part-id').value = part.id;
        document.getElementById('part-sku').value = part.sku;
        document.getElementById('part-name').value = part.name;
        document.getElementById('part-category').value = part.category;
        document.getElementById('part-min-stock').value = part.minStock;
        document.getElementById('part-cost').value = part.cost;
        document.getElementById('part-price').value = part.price;
        document.getElementById('part-stock').value = part.stock;
        document.getElementById('part-alt-barcodes').value = part.altBarcodes ? part.altBarcodes.join(', ') : '';
      }
    } else {
      document.getElementById('sheet-title').textContent = 'Add New Part';
      document.getElementById('part-stock').value = '0';
    }
    
    this.elSheetOverlay.classList.add('active');
  }

  closePartModal() {
    this.elSheetOverlay.classList.remove('active');
  }

  adjustStock(amount) {
    const el = document.getElementById('part-stock');
    let current = parseInt(el.value) || 0;
    let next = current + amount;
    if (next < 0) next = 0;
    el.value = next;
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
      await DB.upsertPart(part);
      this.showToast('Inventory saved successfully', 'success');
      this.closePartModal();
      await this.loadData();
    } catch (e) {
      console.error(e);
      this.showToast('Failed to save part. Ensure SKU is unique.', 'danger');
    }
  }

  // --- Barcode Scanner Logic ---
  openScanner(mode = 'search') {
    this.scannerMode = mode;
    this.elScannerOverlay.classList.add('active');
    
    if (mode === 'alt') {
      document.getElementById('scanner-title').textContent = 'Scan Alt Barcode';
    } else {
      document.getElementById('scanner-title').textContent = 'Scan Part';
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
      this.showToast("Could not access camera. Please allow permissions.", "danger");
      this.closeScanner();
    });
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
      // Find part
      const p = this.parts.find(part => 
        part.sku === decodedText || 
        (part.altBarcodes && part.altBarcodes.includes(decodedText))
      );
      
      if (p) {
        this.openPartModal(p.id);
        this.showToast("Part found!", "success");
      } else {
        this.showToast("No part found with this barcode.", "danger");
        this.elSearch.value = decodedText;
        this.renderList();
      }
    } else if (this.scannerMode === 'alt') {
      // Add to Alt barcodes input
      const el = document.getElementById('part-alt-barcodes');
      const current = el.value.trim();
      if (current) {
        if (!current.includes(decodedText)) el.value = current + ', ' + decodedText;
      } else {
        el.value = decodedText;
      }
    }
  }

  // --- Toast Notifications ---
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;padding-left:12px;">&times;</button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 3000);
  }
}

// Initialize when DOM loads
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new MobileInventoryApp();
});
