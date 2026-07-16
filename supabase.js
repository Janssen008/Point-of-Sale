// =====================================================================
// ApexMoto POS — Supabase Configuration
// Replace the placeholder values below with your actual Supabase credentials
// Found at: Supabase Dashboard → Project Settings → API
// =====================================================================

const SUPABASE_URL  = 'https://oevkmvxwukqujjeuwtef.supabase.co';   // e.g. https://abcdefgh.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldmttdnh3dWtxdWpqZXV3dGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTMzMDEsImV4cCI6MjA5OTYyOTMwMX0.MIhBeKJDTTWEORuLyEhWywUJXurOcD7opMLCp2Q4QEw';      // starts with "eyJ..."

// Initialize the Supabase client (loaded via CDN in index.html)
let supabase;
const IS_MOCK = SUPABASE_ANON === 'YOUR_SUPABASE_ANON_KEY';
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch (e) {
  console.warn("Invalid Supabase URL, database features will be unavailable.");
}

// =====================================================================
// DB LAYER — All Supabase calls go through here
// The app.js class calls these functions; they replace localStorage ops
// =====================================================================
const DB = {

  // ─── PARTS ──────────────────────────────────────────────────────────

  async getParts() {
    const { data, error } = await supabase
      .from('parts')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    // Map snake_case columns to camelCase for app compatibility
    return data.map(p => ({
      id:       p.id,
      sku:      p.sku,
      name:     p.name,
      category: p.category,
      cost:     parseFloat(p.cost),
      price:    parseFloat(p.price),
      stock:    p.stock,
      minStock: p.min_stock,
    }));
  },

  async upsertPart(part) {
    const row = {
      sku:       part.sku,
      name:      part.name,
      category:  part.category,
      cost:      part.cost,
      price:     part.price,
      stock:     part.stock,
      min_stock: part.minStock,
    };
    if (part.id && !part.id.startsWith('p')) {
      row.id = part.id;  // existing UUID
    }
    const { data, error } = await supabase
      .from('parts')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return { ...part, id: data.id };
  },

  async updatePartStock(partId, newStock) {
    const { error } = await supabase
      .from('parts')
      .update({ stock: newStock })
      .eq('id', partId);
    if (error) throw error;
  },

  async deletePart(partId) {
    const { error } = await supabase
      .from('parts')
      .delete()
      .eq('id', partId);
    if (error) throw error;
  },

  // ─── CUSTOMERS ──────────────────────────────────────────────────────

  async getCustomers() {
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });
    if (custErr) throw custErr;

    const { data: vehicles, error: vehErr } = await supabase
      .from('vehicles')
      .select('*');
    if (vehErr) throw vehErr;

    // Merge vehicles into customer objects
    return customers.map(c => ({
      id:       c.id,
      name:     c.name,
      phone:    c.phone,
      email:    c.email || '',
      vehicles: vehicles
        .filter(v => v.customer_id === c.id)
        .map(v => ({
          id:    v.id,
          year:  v.year  || '',
          make:  v.make,
          model: v.model,
          plate: v.plate || '',
          vin:   v.vin   || '',
        })),
    }));
  },

  async upsertCustomer(customer) {
    const row = {
      name:  customer.name,
      phone: customer.phone,
      email: customer.email || null,
    };
    if (customer.id && customer.id.includes('-') && customer.id.length > 10) {
      row.id = customer.id;
    }
    const { data, error } = await supabase
      .from('customers')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data.id;
  },

  async deleteCustomer(customerId) {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customerId);
    if (error) throw error;
  },

  // ─── VEHICLES ───────────────────────────────────────────────────────

  async addVehicle(customerId, vehicle) {
    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        customer_id: customerId,
        year:  vehicle.year  || null,
        make:  vehicle.make,
        model: vehicle.model,
        plate: vehicle.plate || null,
        vin:   vehicle.vin   || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data.id;
  },

  async deleteVehicle(vehicleId) {
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', vehicleId);
    if (error) throw error;
  },

  // ─── SERVICE JOBS ───────────────────────────────────────────────────

  async getServiceJobs() {
    const { data: jobs, error: jobErr } = await supabase
      .from('service_jobs')
      .select('*')
      .order('created_at', { ascending: false });
    if (jobErr) throw jobErr;

    const { data: jobParts, error: partsErr } = await supabase
      .from('service_job_parts')
      .select('*');
    if (partsErr) throw partsErr;

    return jobs.map(j => ({
      id:           j.id,
      customerId:   j.customer_id,
      customerName: j.customer_name,
      vehicle:      j.vehicle,
      description:  j.description,
      mechanic:     j.mechanic,
      status:       j.status,
      laborCost:    parseFloat(j.labor_cost),
      parts: jobParts
        .filter(p => p.job_id === j.id)
        .map(p => ({
          _rowId:  p.id,
          partId:  p.part_id,
          name:    p.name,
          quantity: p.quantity,
          price:   parseFloat(p.price),
        })),
      dateCreated: j.created_at,
      dateUpdated: j.updated_at,
    }));
  },

  async createServiceJob(job) {
    const { error } = await supabase
      .from('service_jobs')
      .insert({
        id:            job.id,
        customer_id:   job.customerId,
        customer_name: job.customerName,
        vehicle:       job.vehicle,
        description:   job.description,
        mechanic:      job.mechanic,
        status:        job.status,
        labor_cost:    job.laborCost,
      });
    if (error) throw error;
  },

  async updateServiceJob(job) {
    const { error } = await supabase
      .from('service_jobs')
      .update({
        status:      job.status,
        mechanic:    job.mechanic,
        description: job.description,
        labor_cost:  job.laborCost,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', job.id);
    if (error) throw error;
  },

  async deleteServiceJob(jobId) {
    const { error } = await supabase
      .from('service_jobs')
      .delete()
      .eq('id', jobId);
    if (error) throw error;
  },

  // ─── SERVICE JOB PARTS ──────────────────────────────────────────────

  async addPartToJob(jobId, partId, name, price) {
    // Check if part already allocated to this job
    const { data: existing } = await supabase
      .from('service_job_parts')
      .select('id, quantity')
      .eq('job_id', jobId)
      .eq('part_id', partId)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('service_job_parts')
        .update({ quantity: existing.quantity + 1 })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('service_job_parts')
        .insert({ job_id: jobId, part_id: partId, name, price, quantity: 1 });
      if (error) throw error;
    }
  },

  async updateJobPartQty(rowId, newQty) {
    const { error } = await supabase
      .from('service_job_parts')
      .update({ quantity: newQty })
      .eq('id', rowId);
    if (error) throw error;
  },

  async removeJobPart(rowId) {
    const { error } = await supabase
      .from('service_job_parts')
      .delete()
      .eq('id', rowId);
    if (error) throw error;
  },

  // ─── TRANSACTIONS ────────────────────────────────────────────────────

  async getTransactions() {
    const { data: txs, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    if (txErr) throw txErr;

    const { data: items, error: itemErr } = await supabase
      .from('transaction_items')
      .select('*');
    if (itemErr) throw itemErr;

    return txs.map(t => ({
      id:            t.id,
      type:          t.type,
      customerId:    t.customer_id,
      customerName:  t.customer_name,
      vehicle:       t.vehicle || null,
      subtotal:      parseFloat(t.subtotal),
      tax:           parseFloat(t.tax),
      discount:      parseFloat(t.discount),
      total:         parseFloat(t.total),
      paymentMethod: t.payment_method,
      date:          t.date,
      items: items
        .filter(i => i.transaction_id === t.id)
        .map(i => ({
          id:       i.part_id || i.id,
          name:     i.name,
          quantity: i.quantity,
          price:    parseFloat(i.price),
        })),
    }));
  },

  async createTransaction(tx) {
    const { error: txErr } = await supabase
      .from('transactions')
      .insert({
        id:             tx.id,
        type:           tx.type,
        customer_id:    tx.customerId || null,
        customer_name:  tx.customerName,
        vehicle:        tx.vehicle || null,
        subtotal:       tx.subtotal,
        tax:            tx.tax,
        discount:       tx.discount,
        total:          tx.total,
        payment_method: tx.paymentMethod,
        date:           tx.date,
      });
    if (txErr) throw txErr;

    if (tx.items && tx.items.length > 0) {
      const itemRows = tx.items.map(item => ({
        transaction_id: tx.id,
        part_id:        item.id !== 'labor' ? item.id : null,
        name:           item.name,
        quantity:       item.quantity,
        price:          item.price,
      }));
      const { error: itemErr } = await supabase
        .from('transaction_items')
        .insert(itemRows);
      if (itemErr) throw itemErr;
    }
  },

  // ─── MECHANICS & LABOR ──────────────────────────────────────────────

  async getMechanics() {
    const { data: mechanics, error: mechErr } = await supabase
      .from('mechanics')
      .select('*')
      .order('name', { ascending: true });
    if (mechErr) throw mechErr;

    const { data: laborRecords, error: laborErr } = await supabase
      .from('labor_records')
      .select('*')
      .order('date', { ascending: false });
    if (laborErr) throw laborErr;

    return mechanics.map(m => ({
      id: m.id,
      name: m.name,
      role: m.role || '',
      laborRecords: laborRecords
        .filter(r => r.mechanic_id === m.id)
        .map(r => ({
          id: r.id,
          description: r.description,
          amount: parseFloat(r.amount),
          date: r.date
        }))
    }));
  },

  async upsertMechanic(mechanic) {
    const row = {
      name: mechanic.name,
      role: mechanic.role || null
    };
    if (mechanic.id && mechanic.id.includes('-') && mechanic.id.length > 10) {
      row.id = mechanic.id;
    }
    const { data, error } = await supabase
      .from('mechanics')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data.id;
  },

  async deleteMechanic(mechanicId) {
    const { error } = await supabase
      .from('mechanics')
      .delete()
      .eq('id', mechanicId);
    if (error) throw error;
  },

  async addLaborRecord(mechanicId, record) {
    const { data, error } = await supabase
      .from('labor_records')
      .insert({
        mechanic_id: mechanicId,
        description: record.description,
        amount: record.amount,
        date: record.date
      })
      .select()
      .single();
    if (error) throw error;
    return data.id;
  },

  async deleteLaborRecord(mechanicId, recordId) {
    const { error } = await supabase
      .from('labor_records')
      .delete()
      .eq('id', recordId);
    if (error) throw error;
  }
};
