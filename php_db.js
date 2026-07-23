// =====================================================================
// ApexMoto POS — PHP & MySQL Database Layer (XAMPP)
// Replaces Supabase SDK with standard AJAX calls to local PHP REST API
// =====================================================================

const API_BASE = 'api/index.php';

async function apiRequest(action, data = {}) {
  try {
    const res = await fetch(`${API_BASE}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `API error (${res.status})`);
    }
    
    const result = await res.json();
    if (result.error) {
      throw new Error(result.message);
    }
    return result;
  } catch (err) {
    console.error(`[PHP API Error] ${action}:`, err);
    throw err;
  }
}

const DB = {
  // ─── PARTS ──────────────────────────────────────────────────────────
  async getParts() {
    const res = await apiRequest('getParts');
    return res.data;
  },

  async upsertPart(part) {
    const res = await apiRequest('upsertPart', { part });
    return res.data;
  },

  async updatePartStock(partId, newStock) {
    await apiRequest('updatePartStock', { partId, newStock });
  },

  async deletePart(partId) {
    await apiRequest('deletePart', { partId });
  },

  // ─── CUSTOMERS ──────────────────────────────────────────────────────
  async getCustomers() {
    const res = await apiRequest('getCustomers');
    return res.data;
  },

  async upsertCustomer(customer) {
    const res = await apiRequest('upsertCustomer', { customer });
    return res.data.id;
  },

  async deleteCustomer(customerId) {
    await apiRequest('deleteCustomer', { customerId });
  },

  async clearCustomerDebt(customerId) {
    await apiRequest('clearCustomerDebt', { customerId });
  },

  // ─── VEHICLES ───────────────────────────────────────────────────────
  async addVehicle(customerId, vehicle) {
    const res = await apiRequest('addVehicle', { customerId, vehicle });
    return res.data.id;
  },

  async deleteVehicle(vehicleId) {
    await apiRequest('deleteVehicle', { vehicleId });
  },

  // ─── SERVICE JOBS ───────────────────────────────────────────────────
  async getServiceJobs() {
    const res = await apiRequest('getServiceJobs');
    return res.data;
  },

  async createServiceJob(job) {
    await apiRequest('createServiceJob', { job });
  },

  async updateServiceJob(job) {
    await apiRequest('updateServiceJob', { job });
  },

  async deleteServiceJob(jobId) {
    await apiRequest('deleteServiceJob', { jobId });
  },

  // ─── SERVICE JOB PARTS ──────────────────────────────────────────────
  async addPartToJob(jobId, partId, name, price) {
    await apiRequest('addPartToJob', { jobId, partId, name, price });
  },

  async insertServiceJobParts(partsArray) {
    await apiRequest('insertServiceJobParts', { partsArray });
  },

  async updateJobPartQty(rowId, newQty) {
    await apiRequest('updateJobPartQty', { rowId, newQty });
  },

  async removeJobPart(rowId) {
    await apiRequest('removeJobPart', { rowId });
  },

  // ─── TRANSACTIONS ────────────────────────────────────────────────────
  async getTransactions() {
    const res = await apiRequest('getTransactions');
    return res.data;
  },

  async createTransaction(tx) {
    await apiRequest('createTransaction', { tx });
  },

  async updateTransactionPaymentMethod(transactionId, newMethod) {
    await apiRequest('updateTransactionPaymentMethod', { transactionId, newMethod });
  },

  // ─── MECHANICS & LABOR ──────────────────────────────────────────────
  async getMechanics() {
    const res = await apiRequest('getMechanics');
    return res.data;
  },

  async upsertMechanic(mechanic) {
    const res = await apiRequest('upsertMechanic', { mechanic });
    return res.data.id;
  },

  async deleteMechanic(mechanicId) {
    await apiRequest('deleteMechanic', { mechanicId });
  },

  async addLaborRecord(mechanicId, record) {
    const res = await apiRequest('addLaborRecord', { mechanicId, record });
    return res.data.id;
  },

  async deleteLaborRecord(mechanicId, recordId) {
    await apiRequest('deleteLaborRecord', { mechanicId, recordId });
  },

  // ─── CASH OUTS & ENTRY CAPITALS ───────────────────────────────────────
  async getCashOuts() {
    const res = await apiRequest('getCashOuts');
    return res.data;
  },

  async createCashOut(entry) {
    const res = await apiRequest('createCashOut', { entry });
    return res.data.id;
  },

  async getEntryCapitals() {
    const res = await apiRequest('getEntryCapitals');
    return res.data;
  },

  async createEntryCapital(entry) {
    const res = await apiRequest('createEntryCapital', { entry });
    return res.data.id;
  },

  async deleteAllSalesData() {
    await apiRequest('deleteAllSalesData');
  },
};

console.log('[PHP API] MySQL Database Layer initialized.');
