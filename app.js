(function () {
  'use strict';

  const STORAGE_KEY = 'purchase_requests_v2';
  const ADMIN_KEY = 'is_admin_v2';
  let currentFilter = 'pending';
  let currentDept = 'all';
  let supabase = null;
  let isAdmin = sessionStorage.getItem(ADMIN_KEY) === '1';
  let allRequests = [];

  const depts = CONFIG.departments || [];

  document.getElementById('company-name').textContent = CONFIG.companyName;
  document.getElementById('company-tagline').textContent = CONFIG.companyTagline;
  document.getElementById('footer-name').textContent = CONFIG.companyName;
  document.getElementById('year').textContent = new Date().getFullYear();

  if (CONFIG.supabaseUrl && CONFIG.supabaseKey) {
    supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  }

  function deptById(id) {
    return depts.find((d) => d.id === id);
  }

  function todayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
  }

  function isToday(iso) {
    if (!iso) return false;
    return String(iso).slice(0, 10) === todayKey();
  }

  function countToday(deptId) {
    return allRequests.filter((r) => r.department === deptId && isToday(r.created_at)).length;
  }

  function updateAdminUI() {
    document.getElementById('admin-pill').hidden = !isAdmin;
    document.getElementById('btn-admin').textContent = isAdmin ? 'دەرچوون' : 'ئەدمین';
  }

  // --- storage ---
  async function getRequests() {
    if (supabase) {
      const { data, error } = await supabase
        .from('purchase_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }

  async function uploadMedia(file) {
    if (!file) return { media_url: '', media_type: '', media_path: '' };
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) throw new Error('تەنها وێنە یان ڤیدیۆ قەبوڵە');

    const maxBytes = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(isVideo ? 'ڤیدیۆ زۆر گەورەیە (حد ٥٠MB)' : 'وێنە زۆر گەورەیە (حد ١٠MB)');
    }

    if (!supabase) {
      if (isVideo) throw new Error('بۆ ڤیدیۆ پێویستە Supabase ڕێکبخەیت');
      if (file.size > 1.5 * 1024 * 1024) throw new Error('بۆ وێنەی گەورە پێویستە Supabase');
      const dataUrl = await readFileAsDataURL(file);
      return { media_url: dataUrl, media_type: 'image', media_path: '' };
    }

    const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase();
    const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await supabase.storage.from('request-media').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('request-media').getPublicUrl(path);
    return {
      media_url: data.publicUrl,
      media_type: isVideo ? 'video' : 'image',
      media_path: path,
    };
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

  async function deleteRequest(request) {
    if (supabase) {
      if (request.media_path) {
        await supabase.storage.from('request-media').remove([request.media_path]);
      }
      const { error } = await supabase.from('purchase_requests').delete().eq('id', request.id);
      if (error) throw error;
      return;
    }
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.filter((r) => r.id !== request.id)));
  }

  // --- UI: departments ---
  function renderDeptGrid() {
    const grid = document.getElementById('dept-grid');
    const cards = [
      { id: 'all', name: 'هەموو', emoji: '✨', countLabel: allRequests.length },
      ...depts.map((d) => ({
        id: d.id,
        name: d.name,
        emoji: d.emoji,
        countLabel: `${countToday(d.id)}/${CONFIG.dailyLimitPerDept}`,
      })),
    ];

    grid.innerHTML = cards
      .map(
        (d) => `<button type="button" class="dept-card ${currentDept === d.id ? 'active' : ''}" data-dept="${d.id}">
        <div class="dept-emoji">${d.emoji}</div>
        <div class="dept-name">${d.name}</div>
        <div class="dept-count">${d.id === 'all' ? `کۆ: <b>${d.countLabel}</b>` : `ئەمڕۆ: <b>${d.countLabel}</b>`}</div>
      </button>`
      )
      .join('');

    grid.querySelectorAll('.dept-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentDept = btn.dataset.dept;
        syncDeptTitle();
        renderDeptGrid();
        renderRequests();
        syncFormLimitNote();
      });
    });
  }

  function syncDeptTitle() {
    const title = document.getElementById('current-dept-title');
    const hint = document.getElementById('dept-limit-hint');
    if (currentDept === 'all') {
      title.textContent = 'هەموو بەشەکان';
      hint.textContent = 'سنوری ڕۆژانە: ١٠ کاڵا بۆ هەر بەش';
    } else {
      const d = deptById(currentDept);
      title.textContent = `بەشی ${d ? d.name : ''}`;
      const used = countToday(currentDept);
      hint.textContent = `ئەمڕۆ: ${used} / ${CONFIG.dailyLimitPerDept} کاڵا`;
    }
  }

  function fillDeptSelect(preferred) {
    const select = document.getElementById('department');
    select.innerHTML = depts
      .map((d) => `<option value="${d.id}">${d.emoji} ${d.name}</option>`)
      .join('');
    if (preferred && preferred !== 'all') select.value = preferred;
  }

  function syncFormLimitNote() {
    const note = document.getElementById('form-limit-note');
    const deptId = document.getElementById('department').value || currentDept;
    if (!deptId || deptId === 'all') {
      note.textContent = '';
      note.className = 'limit-note';
      return;
    }
    const used = countToday(deptId);
    const left = CONFIG.dailyLimitPerDept - used;
    if (left <= 0) {
      note.textContent = `سنور پڕە — بەشی ${deptById(deptId).name} ئەمڕۆ ١٠ کاڵای تەواو کردووە.`;
      note.className = 'limit-note full';
    } else if (left <= 3) {
      note.textContent = `ئاگاداری: ${left} کاڵا ماوە ئەمڕۆ بۆ ئەم بەشە.`;
      note.className = 'limit-note warn';
    } else {
      note.textContent = `ماوە: ${left} کاڵا ئەمڕۆ بۆ ئەم بەشە.`;
      note.className = 'limit-note';
    }
  }

  // --- render requests ---
  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('ckb-IQ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function mediaHtml(r) {
    if (!r.media_url) return '';
    if (r.media_type === 'video') {
      return `<div class="media-box"><video src="${escapeAttr(r.media_url)}" controls preload="metadata"></video></div>`;
    }
    return `<div class="media-box"><img src="${escapeAttr(r.media_url)}" alt="${escapeAttr(r.title)}" loading="lazy"></div>`;
  }

  function renderRequests() {
    const container = document.getElementById('requests-list');
    const todayCount = allRequests.filter((r) => isToday(r.created_at)).length;
    const pendingCount = allRequests.filter((r) => r.status !== 'seen').length;
    document.getElementById('stat-today').textContent = todayCount;
    document.getElementById('stat-pending').textContent = pendingCount;

    let list = allRequests.slice();
    if (currentDept !== 'all') list = list.filter((r) => r.department === currentDept);
    if (currentFilter === 'pending') list = list.filter((r) => r.status !== 'seen');

    let html = '';
    if (!supabase) {
      html += `<div class="setup-notice">⚠️ دۆخی تاقیکردنەوە: بۆ وێنە/ڤیدیۆ و هاوبەشکردنی داتا لەنێوان کۆمپیوتەرەکان، <code>Supabase</code> لە <code>js/config.js</code> ڕێکبخە.</div>`;
    }

    if (!list.length) {
      html += `<div class="empty-state"><div class="icon">📋</div><p>هیچ داواکارییەک لەم بەشەدا نییە</p></div>`;
    } else {
      html += list
        .map((r) => {
          const d = deptById(r.department);
          return `<article class="request-card">
            <div class="request-header">
              <h3 class="request-title">${escapeHtml(r.title)}</h3>
              <div>
                <span class="badge badge-dept">${d ? d.emoji + ' ' + d.name : 'بەش'}</span>
                <span class="badge badge-pending">چاوەڕوان</span>
              </div>
            </div>
            ${mediaHtml(r)}
            ${r.description ? `<p class="request-desc">${escapeHtml(r.description)}</p>` : ''}
            <div class="request-meta">
              <span>📦 ${r.quantity || 1}</span>
              ${r.contact ? `<span>👤 ${escapeHtml(r.contact)}</span>` : ''}
              <span>📅 ${formatDate(r.created_at)}</span>
            </div>
            ${
              isAdmin
                ? `<div class="request-actions">
                    <button class="btn btn-seen" data-seen="${escapeAttr(r.id)}">✓ بینیومە</button>
                  </div>`
                : ''
            }
          </article>`;
        })
        .join('');
    }

    container.innerHTML = html;

    container.querySelectorAll('[data-seen]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('دڵنیایت بینیوتە؟ داواکارییەکە دەسڕدرێتەوە.')) return;
        const item = allRequests.find((x) => x.id === btn.dataset.seen);
        if (!item) return;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          await deleteRequest(item);
          await loadRequests();
        } catch (e) {
          alert('هەڵە: ' + e.message);
          btn.disabled = false;
          btn.textContent = '✓ بینیومە';
        }
      });
    });
  }

  async function loadRequests() {
    try {
      allRequests = await getRequests();
      syncDeptTitle();
      renderDeptGrid();
      renderRequests();
      syncFormLimitNote();
    } catch (e) {
      document.getElementById('requests-list').innerHTML =
        `<div class="setup-notice">هەڵە لە بارکردن: ${escapeHtml(e.message)}</div>`;
    }
  }

  // --- modals ---
  const overlay = document.getElementById('modal-overlay');
  const form = document.getElementById('request-form');
  const mediaInput = document.getElementById('media');
  const mediaPreview = document.getElementById('media-preview');

  function openModal() {
    fillDeptSelect(currentDept);
    syncFormLimitNote();
    overlay.hidden = false;
    document.getElementById('title').focus();
  }

  function closeModal() {
    overlay.hidden = true;
    form.reset();
    mediaPreview.hidden = true;
    mediaPreview.innerHTML = '';
  }

  document.getElementById('department').addEventListener('change', syncFormLimitNote);

  mediaInput.addEventListener('change', () => {
    const file = mediaInput.files && mediaInput.files[0];
    mediaPreview.innerHTML = '';
    if (!file) {
      mediaPreview.hidden = true;
      return;
    }
    const url = URL.createObjectURL(file);
    mediaPreview.innerHTML = file.type.startsWith('video/')
      ? `<video src="${url}" controls></video>`
      : `<img src="${url}" alt="پێشبینین">`;
    mediaPreview.hidden = false;
  });

  document.getElementById('btn-add-request').addEventListener('click', openModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const deptId = document.getElementById('department').value;
    const used = countToday(deptId);
    if (used >= CONFIG.dailyLimitPerDept) {
      alert(`بەشی ${deptById(deptId).name} ئەمڕۆ سنوری ١٠ کاڵای تەواو کردووە.`);
      return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'ناردن...';

    try {
      const file = mediaInput.files && mediaInput.files[0];
      const media = await uploadMedia(file || null);
      await addRequest({
        title: document.getElementById('title').value.trim(),
        description: document.getElementById('description').value.trim(),
        quantity: parseInt(document.getElementById('quantity').value, 10) || 1,
        contact: document.getElementById('contact').value.trim(),
        department: deptId,
        media_url: media.media_url,
        media_type: media.media_type,
        media_path: media.media_path,
        status: 'pending',
      });
      closeModal();
      currentDept = deptId;
      await loadRequests();
    } catch (err) {
      alert('هەڵە لە ناردن: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ناردن';
    }
  });

  // admin
  const adminOverlay = document.getElementById('admin-overlay');

  function openAdmin() {
    if (isAdmin) {
      isAdmin = false;
      sessionStorage.removeItem(ADMIN_KEY);
      updateAdminUI();
      renderRequests();
      return;
    }
    adminOverlay.hidden = false;
    document.getElementById('admin-code').value = '';
    document.getElementById('admin-code').focus();
  }

  function closeAdmin() {
    adminOverlay.hidden = true;
  }

  document.getElementById('btn-admin').addEventListener('click', openAdmin);
  document.getElementById('admin-close').addEventListener('click', closeAdmin);
  document.getElementById('admin-cancel').addEventListener('click', closeAdmin);
  adminOverlay.addEventListener('click', (e) => {
    if (e.target === adminOverlay) closeAdmin();
  });

  document.getElementById('admin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('admin-code').value.trim();
    if (code === String(CONFIG.adminCode)) {
      isAdmin = true;
      sessionStorage.setItem(ADMIN_KEY, '1');
      closeAdmin();
      updateAdminUI();
      renderRequests();
    } else {
      alert('کۆدەکە هەڵەیە');
    }
  });

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderRequests();
    });
  });

  fillDeptSelect('berhem');
  updateAdminUI();
  loadRequests();
})();
