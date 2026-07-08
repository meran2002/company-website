(function () {
  'use strict';

  const STORAGE_KEY = 'purchase_requests';
  let currentFilter = 'pending';
  let supabase = null;

  // --- Init ---
  document.getElementById('company-name').textContent = CONFIG.companyName;
  document.getElementById('company-tagline').textContent = CONFIG.companyTagline;
  document.getElementById('footer-name').textContent = CONFIG.companyName;
  document.getElementById('year').textContent = new Date().getFullYear();

  if (CONFIG.supabaseUrl && CONFIG.supabaseKey) {
    supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  }

  // --- Storage ---
  async function getRequests() {
    if (supabase) {
      const { data, error } = await supabase
        .from('purchase_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }

  async function addRequest(item) {
    if (supabase) {
      const { data, error } = await supabase
        .from('purchase_requests')
        .insert([item])
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const newItem = { ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    list.unshift(newItem);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return newItem;
  }

  async function markPurchased(id) {
    if (supabase) {
      const { error } = await supabase
        .from('purchase_requests')
        .update({ status: 'purchased' })
        .eq('id', id);
      if (error) throw error;
      return;
    }
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const idx = list.findIndex((r) => r.id === id);
    if (idx !== -1) {
      list[idx].status = 'purchased';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  }

  // --- Render ---
  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('ckb-IQ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function renderRequests(requests) {
    const container = document.getElementById('requests-list');
    const filtered = requests.filter((r) => {
      if (currentFilter === 'all') return true;
      return r.status === currentFilter;
    });

    const pending = requests.filter((r) => r.status === 'pending').length;
    const done = requests.filter((r) => r.status === 'purchased').length;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-done').textContent = done;

    let html = '';

    if (!supabase) {
      html += `<div class="setup-notice">
        ⚠️ <strong>دۆخی تاقیکردنەوە:</strong> داتاکان تەنها لەم وێبگەڕەدا دەمێننەوە.
        بۆ بەکارهێنانی ڕاستەقینە، <code>js/config.js</code> ڕێکبخە و لە سەر <strong>GitHub Pages</strong> بخەرە سەر.
      </div>`;
    }

    if (filtered.length === 0) {
      html += `<div class="empty-state">
        <div class="icon">📋</div>
        <p>هیچ داواکارییەک نییە</p>
      </div>`;
    } else {
      html += filtered.map((r) => {
        const isPurchased = r.status === 'purchased';
        return `<article class="request-card ${isPurchased ? 'purchased' : ''}">
          <div class="request-header">
            <h3 class="request-title">${escapeHtml(r.title)}</h3>
            <span class="badge ${isPurchased ? 'badge-purchased' : 'badge-pending'}">
              ${isPurchased ? '✓ کڕدرا' : 'چاوەڕوان'}
            </span>
          </div>
          ${r.description ? `<p class="request-desc">${escapeHtml(r.description)}</p>` : ''}
          <div class="request-meta">
            <span>📦 ژمارە: ${r.quantity || 1}</span>
            ${r.contact ? `<span>📞 ${escapeHtml(r.contact)}</span>` : ''}
            <span>📅 ${formatDate(r.created_at)}</span>
          </div>
          ${!isPurchased ? `<div class="request-actions">
            <button class="btn btn-success" data-mark="${r.id}">نیشانکردن وەک کڕدراو</button>
          </div>` : ''}
        </article>`;
      }).join('');
    }

    container.innerHTML = html;

    container.querySelectorAll('[data-mark]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('دڵنیایت کە ئەم شتە کڕدراوە؟')) return;
        btn.disabled = true;
        try {
          await markPurchased(btn.dataset.mark);
          await loadRequests();
        } catch (e) {
          alert('هەڵە: ' + e.message);
          btn.disabled = false;
        }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadRequests() {
    const loading = document.getElementById('loading');
    try {
      const requests = await getRequests();
      renderRequests(requests);
    } catch (e) {
      document.getElementById('requests-list').innerHTML =
        `<div class="setup-notice">هەڵە لە بارکردنی داتا: ${escapeHtml(e.message)}</div>`;
    }
  }

  // --- Modal ---
  const overlay = document.getElementById('modal-overlay');
  const form = document.getElementById('request-form');

  function openModal() {
    overlay.hidden = false;
    document.getElementById('title').focus();
  }

  function closeModal() {
    overlay.hidden = true;
    form.reset();
  }

  document.getElementById('btn-add-request').addEventListener('click', openModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'ناردن...';

    try {
      await addRequest({
        title: document.getElementById('title').value.trim(),
        description: document.getElementById('description').value.trim(),
        quantity: parseInt(document.getElementById('quantity').value, 10) || 1,
        contact: document.getElementById('contact').value.trim(),
        status: 'pending',
      });
      closeModal();
      await loadRequests();
    } catch (err) {
      alert('هەڵە لە ناردن: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ناردن';
    }
  });

  // --- Filters ---
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      await loadRequests();
    });
  });

  loadRequests();
})();
