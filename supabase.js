// =====================================================================
// ApexMoto POS — Local Mock DB Configuration
// This file replaces the original Supabase logic to run fully offline
// Original Supabase configuration backed up to supabase.original.js
// =====================================================================

const generateId = (prefix) => prefix + '-' + Math.random().toString(36).substr(2, 9);

const DB = {
  // ─── PARTS ──────────────────────────────────────────────────────────
  async getParts() {
    return window.MOCK_DATA ? [...window.MOCK_DATA.parts] : [];
  },

  async upsertPart(part) {
    const newPart = { ...part, id: part.id || generateId('p') };
    if (window.MOCK_DATA) {
      if (part.id) {
        const idx = window.MOCK_DATA.parts.findIndex(p => p.id === part.id);
        if (idx !== -1) window.MOCK_DATA.parts[idx] = newPart;
      } else {
        window.MOCK_DATA.parts.push(newPart);
      }
    }
    return newPart;
  },

  async updatePartStock(partId, newStock) {
    if (window.MOCK_DATA) {
      const part = window.MOCK_DATA.parts.find(p => p.id === partId);
      if (part) part.stock = newStock;
    }
  },

  async deletePart(partId) {
    if (window.MOCK_DATA) {
      window.MOCK_DATA.parts = window.MOCK_DATA.parts.filter(p => p.id !== partId);
    }
  },

  // ─── CUSTOMERS ──────────────────────────────────────────────────────
  async getCustomers() {
    return window.MOCK_DATA ? [...window.MOCK_DATA.customers] : [];
  },

  async upsertCustomer(customer) {
    const id = customer.id || generateId('c');
    const newCust = { ...customer, id };
    if (window.MOCK_DATA) {
      if (customer.id) {
        const idx = window.MOCK_DATA.customers.findIndex(c => c.id === customer.id);
        if (idx !== -1) window.MOCK_DATA.customers[idx] = newCust;
      } else {
        window.MOCK_DATA.customers.push(newCust);
      }
    }
    return id;
  },

  async deleteCustomer(customerId) {
    if (window.MOCK_DATA) {
      window.MOCK_DATA.customers = window.MOCK_DATA.customers.filter(c => c.id !== customerId);
    }
  },

  // ─── MECHANICS ──────────────────────────────────────────────────────
  async getMechanics() {
    return window.MOCK_DATA && window.MOCK_DATA.mechanics ? [...window.MOCK_DATA.mechanics] : [];
  },

  async upsertMechanic(mechanic) {
    const id = mechanic.id || generateId('mech');
    const newMech = { ...mechanic, id, laborRecords: mechanic.laborRecords || [] };
    if (window.MOCK_DATA) {
      if (!window.MOCK_DATA.mechanics) window.MOCK_DATA.mechanics = [];
      if (mechanic.id) {
        const idx = window.MOCK_DATA.mechanics.findIndex(m => m.id === mechanic.id);
        if (idx !== -1) window.MOCK_DATA.mechanics[idx] = newMech;
      } else {
        window.MOCK_DATA.mechanics.push(newMech);
      }
    }
    return id;
  },

  async deleteMechanic(mechanicId) {
    if (window.MOCK_DATA && window.MOCK_DATA.mechanics) {
      window.MOCK_DATA.mechanics = window.MOCK_DATA.mechanics.filter(m => m.id !== mechanicId);
    }
  },

  async addLaborRecord(mechanicId, record) {
    const id = generateId('lr');
    if (window.MOCK_DATA && window.MOCK_DATA.mechanics) {
      const mech = window.MOCK_DATA.mechanics.find(m => m.id === mechanicId);
      if (mech) {
        if (!mech.laborRecords) mech.laborRecords = [];
        mech.laborRecords.push({ ...record, id });
      }
    }
    return id;
  },

  async deleteLaborRecord(mechanicId, recordId) {
    if (window.MOCK_DATA && window.MOCK_DATA.mechanics) {
      const mech = window.MOCK_DATA.mechanics.find(m => m.id === mechanicId);
      if (mech && mech.laborRecords) {
        mech.laborRecords = mech.laborRecords.filter(r => r.id !== recordId);
      }
    }
  },

  // ─── SERVICE JOBS ───────────────────────────────────────────────────
  async getServiceJobs() {
    return window.MOCK_DATA ? [...window.MOCK_DATA.serviceJobs] : [];
  },

  async createServiceJob(job) {
    if (window.MOCK_DATA) window.MOCK_DATA.serviceJobs.push({ ...job, id: job.id || generateId('job') });
  },

  async updateServiceJob(job) {
    if (window.MOCK_DATA) {
      const idx = window.MOCK_DATA.serviceJobs.findIndex(j => j.id === job.id);
      if (idx !== -1) window.MOCK_DATA.serviceJobs[idx] = { ...window.MOCK_DATA.serviceJobs[idx], ...job, updated_at: new Date().toISOString() };
    }
  },

  async deleteServiceJob(jobId) {
    if (window.MOCK_DATA) {
      window.MOCK_DATA.serviceJobs = window.MOCK_DATA.serviceJobs.filter(j => j.id !== jobId);
    }
  },

  // ─── SERVICE JOB PARTS ──────────────────────────────────────────────
  async addPartToJob(jobId, partId, name, price) {
    if (window.MOCK_DATA) {
      const job = window.MOCK_DATA.serviceJobs.find(j => j.id === jobId);
      if (job) {
        if (!job.parts) job.parts = [];
        const existing = job.parts.find(p => p.partId === partId);
        if (existing) existing.quantity += 1;
        else job.parts.push({ partId, name, price, quantity: 1, _rowId: generateId('jp') });
      }
    }
  },

  async updateJobPartQty(rowId, newQty) {
    if (window.MOCK_DATA) {
      window.MOCK_DATA.serviceJobs.forEach(job => {
        if (job.parts) {
          const part = job.parts.find(p => p._rowId === rowId);
          if (part) part.quantity = newQty;
        }
      });
    }
  },

  async removeJobPart(rowId) {
    if (window.MOCK_DATA) {
      window.MOCK_DATA.serviceJobs.forEach(job => {
        if (job.parts) job.parts = job.parts.filter(p => p._rowId !== rowId);
      });
    }
  },

  // ─── TRANSACTIONS ────────────────────────────────────────────────────
  async getTransactions() {
    return window.MOCK_DATA ? [...window.MOCK_DATA.transactions] : [];
  },

  async createTransaction(tx) {
    if (window.MOCK_DATA) window.MOCK_DATA.transactions.push({ ...tx, id: tx.id || generateId('tx') });
  }
};
