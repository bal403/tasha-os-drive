const state = {
  currentDir: 1,
  view: 'grid',
  path: '/',
  role: 'admin',
  selectedFile: null,
};

const $ = (s) => document.querySelector(s);

const ENDPOINT_MAP = {
  whoami: 'api/auth.php',
  switch_user: 'api/auth.php',
  list_users: 'api/auth.php',
  list: 'api/directories.php',
  tree: 'api/directories.php',
  mkdir: 'api/directories.php',
  rmdir: 'api/directories.php',
  restore_dir: 'api/directories.php',
  delete_dir_forever: 'api/directories.php',
  rename_dir: 'api/directories.php',
  resolve: 'api/directories.php',
  create: 'api/files.php',
  read: 'api/files.php',
  edit: 'api/files.php',
  copy: 'api/files.php',
  delete: 'api/files.php',
  rename: 'api/files.php',
  chmod: 'api/files.php',
  blocks: 'api/files.php',
  restore: 'api/files.php',
  delete_forever: 'api/files.php',
  list_trash: 'api/files.php',
  list_public: 'api/directories.php',
  shared_with_me: 'api/share.php',
  share_dir: 'api/share.php',
  public_dir: 'api/directories.php',
  move: 'api/files.php',
  download: 'api/files.php',
  upload: 'api/files.php',
  bitmap: 'api/disk.php',
  stats: 'api/disk.php',
  configure: 'api/disk.php',
  blocks_of: 'api/disk.php',
  reset: 'api/disk.php',
};

function api(actionKey, opts = {}) {
  const actualAction = actionKey.split('&')[0];
  const base = ENDPOINT_MAP[actualAction];
  if (!base) return Promise.reject(new Error('Unknown action: ' + actualAction));
  
  const separator = base.includes('?') ? '&' : '?';
  const url = `${base}${separator}action=${actionKey}`;
  
  return fetch(url, { credentials: 'same-origin', ...opts }).then(async r => {
    const text = await r.text();
    try {
      const json = JSON.parse(text);
      if (!r.ok) throw new Error(json.error || `HTTP error! status: ${r.status}`);
      return json;
    } catch (e) {
      throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
    }
  });
}

function showPopupModal(title, message, type = 'info') {
  const icon = type === 'error' ? '🚫' : (type === 'success' ? '✅' : 'ℹ️');
  openModal(title, `
    <div class="space-y-3 text-center py-2">
      <div class="text-4xl">${icon}</div>
      <div class="text-xs font-semibold text-slate-700 dark:text-slate-200 px-2 leading-relaxed">${escapeHtml(message)}</div>
    </div>
    <div class="flex justify-center mt-5">
      <button onclick="closeModal()" class="px-6 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold shadow-md hover:bg-teal-700 transition w-full sm:w-auto">OK</button>
    </div>
  `);
}

async function init() {
  initTheme();
  wireMobileSidebar();
  try {
    const me = await api('whoami');
    state.role = me.role;
    const roleSwitcher = $('#roleSwitcher');
    if (roleSwitcher) roleSwitcher.value = me.role;
    applyRoleTheme(me.role);
  } catch (e) {
    console.error('Auth initialization error:', e);
  }

  await loadTree();
  await loadDir(1);
  await loadBitmap();

  wireDropZone();
  wireSidebarTabs();
  wireLaptopUpload();
  wireFolderActions();
  wireDevelopersButton();
  wireConfigureDisk();
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeIcon();

  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.onclick = () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateThemeIcon();
    };
  }
}

function updateThemeIcon() {
  const t = document.getElementById('themeToggle');
  if (t) t.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
}

function applyRoleTheme(role) {
  const sidebar = $('#sidebar');
  if (!sidebar) return;
  sidebar.classList.remove('border-teal-600', 'border-indigo-600', 'border-amber-600');
  if (role === 'admin') {
    sidebar.style.borderRightColor = '#0d9488';
  } else if (role === 'user') {
    sidebar.style.borderRightColor = '#6366f1';
  } else {
    sidebar.style.borderRightColor = '#f59e0b';
  }
}

function openMobileSidebar() {
  $('#sidebar')?.classList.remove('-translate-x-full');
  $('#sidebarBackdrop')?.classList.remove('hidden');
}

function closeMobileSidebar() {
  $('#sidebar')?.classList.add('-translate-x-full');
  $('#sidebarBackdrop')?.classList.add('hidden');
}

function wireMobileSidebar() {
  $('#menuBtn')?.addEventListener('click', openMobileSidebar);
  $('#closeSidebarBtn')?.addEventListener('click', closeMobileSidebar);
  $('#sidebarBackdrop')?.addEventListener('click', closeMobileSidebar);
}

const newBtn = $('#newBtn');
if (newBtn) {
  newBtn.onclick = (e) => { 
    e.stopPropagation(); 
    if (state.role !== 'admin') {
      showPopupModal("Access Denied", "You cannot create new files/folders. Admin only. Ask permission from admin.", "error");
      return;
    }
    $('#newMenu')?.classList.toggle('hidden'); 
  };
  document.addEventListener('click', () => {
    $('#newMenu')?.classList.add('hidden');
    $('#folderActionMenu')?.classList.add('hidden');
  });
  $('#newMenu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    $('#newMenu').classList.add('hidden');
    closeMobileSidebar();
    if (btn.dataset.action === 'new-folder') openNewFolderModal();
    if (btn.dataset.action === 'new-file') openNewFileModal();
  });
}

function wireFolderActions() {
  const btn = $('#folderActionBtn');
  const menu = $('#folderActionMenu');
  if (!btn || !menu) return

  btn.onclick = (e) => {
    e.stopPropagation();
    if (state.role !== 'admin') {
      showPopupModal("Access Denied", "Only Admin can execute root folder actions. Ask permission from admin.", "error");
      return;
    }
    menu.classList.toggle('hidden');
  };

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-folder-act]');
    if (!item) return;
    menu.classList.add('hidden');
    const act = item.dataset.folderAct;
    if (act === 'new-folder') openNewFolderModal();
    if (act === 'new-file') openNewFileModal();
    if (act === 'browse-file') $('#laptopUploadInput')?.click();
  });
}

function wireDevelopersButton() {
  const devBtn = $('#developersBtn');
  if (!devBtn) return;
  devBtn.onclick = () => {
  openModal('System Developers', `
    <div class="space-y-2 text-xs max-h-80 overflow-y-auto pr-1">
      <div class="p-2.5 rounded bg-slate-100 dark:bg-slate-700/60">
        <div class="font-bold text-slate-800 dark:text-slate-100">Tasha S. Tadios</div>
        <div class="text-slate-500 dark:text-slate-400">Lead Backend & OS Engine Developer</div>
      </div>
      <div class="p-2.5 rounded bg-slate-100 dark:bg-slate-700/60">
        <div class="font-bold text-slate-800 dark:text-slate-100">Lyka L. Ayhon</div>
        <div class="text-slate-500 dark:text-slate-400">Cloud Storage & File Sync Architect</div>
      </div>
      <div class="p-2.5 rounded bg-slate-100 dark:bg-slate-700/60">
        <div class="font-bold text-slate-800 dark:text-slate-100">Christine Joy D. Leguin</div>
        <div class="text-slate-500 dark:text-slate-400">Frontend & Workspace UI/UX Developer</div>
      </div>
      <div class="p-2.5 rounded bg-slate-100 dark:bg-slate-700/60">
        <div class="font-bold text-slate-800 dark:text-slate-100">Jessica M. Rivera</div>
        <div class="text-slate-500 dark:text-slate-400">Database & File Indexing Engineer</div>
      </div>
      <div class="p-2.5 rounded bg-slate-100 dark:bg-slate-700/60">
        <div class="font-bold text-slate-800 dark:text-slate-100">Daisyree A. Ladisa</div>
        <div class="text-slate-500 dark:text-slate-400">Access Control, Sharing & Security Developer</div>
      </div>
      <div class="p-2.5 rounded bg-slate-100 dark:bg-slate-700/60">
        <div class="font-bold text-slate-800 dark:text-slate-100">Juliana Pia G. Oblino</div>
        <div class="text-slate-500 dark:text-slate-400">API Integration & File Preview Specialist</div>
      </div>
      <div class="p-2.5 rounded bg-slate-100 dark:bg-slate-700/60">
        <div class="font-bold text-slate-800 dark:text-slate-100">Rhea Mae P. Osit</div>
        <div class="text-slate-500 dark:text-slate-400">Quality Assurance & System Documentation Lead</div>
      </div>
    </div>
    <div class="flex justify-end mt-4">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold">Close</button>
    </div>
  `);
};
}

function wireConfigureDisk() {
  const btn = $('#configDiskBtn');
  if (!btn) return;
  btn.onclick = async () => {
    closeMobileSidebar();
    if (state.role !== 'admin') {
      showPopupModal("Access Denied", "You don't have access to configure virtual disk. Admin only. Ask permission from admin.", "error");
      return;
    }
    const data = await api('bitmap');
    openModal('Configure Virtual Disk', `
      <div class="space-y-3 text-xs">
        <div>
          <label class="block text-slate-500 mb-1 font-medium">Total Disk Blocks</label>
          <input id="cfgTotalBlocks" type="number" min="16" max="256" value="${data.total}" class="w-full px-3 py-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-medium">
        </div>
        <div>
          <label class="block text-slate-500 mb-1 font-medium">Block Size (KB)</label>
          <input id="cfgBlockSize" type="number" min="1" max="64" value="${data.block_kb}" class="w-full px-3 py-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-medium">
        </div>
        <div class="text-[11px] text-amber-600 pt-1 font-medium">Note: Reconfiguring resets existing virtual files to prevent block corruption.</div>
      </div>
      <div class="flex justify-end gap-2 mt-5">
        <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
        <button id="saveDiskCfgBtn" class="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold">Apply Configuration</button>
      </div>
    `);
    $('#saveDiskCfgBtn').onclick = async () => {
      const fd = new FormData();
      fd.append('total_blocks', $('#cfgTotalBlocks').value);
      fd.append('block_size_kb', $('#cfgBlockSize').value);
      const res = await api('configure', { method: 'POST', body: fd });
      if (res.ok) {
        closeModal();
        await loadDir(1);
        await loadBitmap();
      } else showPopupModal("Error", res.error || 'Failed to configure disk', 'error');
    };
  };
}

function openModal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modal')?.classList.remove('hidden');
}

function closeModal() { $('#modal')?.classList.add('hidden'); }
window.closeModal = closeModal;

const modalClose = $('#modalClose');
if (modalClose) modalClose.onclick = closeModal;

function openNewFolderModal() {
  if (state.role !== 'admin') {
    showPopupModal("Access Denied", "You cannot create folders. Admin only. Ask permission from admin.", "error");
    return;
  }
  openModal('Create New Folder', `
    <input id="folderName" placeholder="Enter folder name..." class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 text-xs font-medium">
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="createFolderBtn" class="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold">Create Folder</button>
    </div>
  `);
  $('#createFolderBtn').onclick = async () => {
    const name = $('#folderName').value.trim();
    if (!name) return;
    const fd = new FormData();
    fd.append('name', name);
    fd.append('parent_id', state.currentDir);
    const res = await api('mkdir', { method: 'POST', body: fd });
    if (res.ok) {
      closeModal();
      await loadTree();
      await loadDir(state.currentDir);
      await loadBitmap();
    } else showPopupModal("Error", res.error || 'Failed to create folder', 'error');
  };
}

function openNewFileModal() {
  if (state.role !== 'admin') {
    showPopupModal("Access Denied", "You cannot create files. Admin only. Ask permission from admin.", "error");
    return;
  }
  openModal('Create New Virtual File', `
    <input id="fName" placeholder="filename.txt" class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 mb-2.5 text-xs font-medium">
    <input id="fSize" type="number" min="1" value="4" placeholder="Size (KB)" class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 mb-2.5 text-xs font-medium">
    <textarea id="fContent" placeholder="Enter file content here..." rows="3" class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 mb-2.5 text-xs font-medium"></textarea>
    <select id="fAlloc" class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 mb-3 text-xs font-medium">
      <option value="contiguous">Contiguous Allocation</option>
      <option value="linked">Linked Allocation</option>
      <option value="indexed">Indexed Allocation</option>
    </select>
    
    <div class="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 mt-2">File Access Permissions (rwx):</div>
    <div class="grid grid-cols-3 gap-2 text-xs mb-4 bg-slate-50 dark:bg-slate-700/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
      <div>
        <div class="font-semibold text-slate-700 dark:text-slate-200 mb-1">Admin</div>
        <label class="flex items-center gap-1.5 py-1"><input type="checkbox" id="adm_r" checked> Read</label>
        <label class="flex items-center gap-1.5 py-1"><input type="checkbox" id="adm_w" checked> Write</label>
        <label class="flex items-center gap-1.5 py-1"><input type="checkbox" id="adm_x" checked> Execute</label>
      </div>
      <div>
        <div class="font-semibold text-slate-700 dark:text-slate-200 mb-1">User</div>
        <label class="flex items-center gap-1.5 py-1"><input type="checkbox" id="usr_r" checked> Read</label>
        <label class="flex items-center gap-1.5 py-1"><input type="checkbox" id="usr_w" checked> Write</label>
        <label class="flex items-center gap-1.5 py-1"><input type="checkbox" id="usr_x"> Execute</label>
      </div>
      <div>
        <div class="font-semibold text-slate-700 dark:text-slate-200 mb-1">Guest</div>
        <label class="flex items-center gap-1.5 py-1"><input type="checkbox" id="gst_r" checked> Read</label>
        <label class="flex items-center gap-1.5 py-1"><input type="checkbox" id="gst_w"> Write</label>
        <label class="flex items-center gap-1.5 py-1"><input type="checkbox" id="gst_x"> Execute</label>
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="createFileBtn" class="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold">Create File</button>
    </div>
  `);

  $('#createFileBtn').onclick = async () => {
    const name = $('#fName').value.trim();
    if (!name) return;

    const getPerm = (rId, wId, xId) => {
      const r = $(rId).checked ? 'r' : '-';
      const w = $(wId).checked ? 'w' : '-';
      const x = $(xId).checked ? 'x' : '-';
      return r + w + x;
    };

    const fd = new FormData();
    fd.append('filename', name);
    fd.append('size_kb', $('#fSize').value || 1);
    fd.append('content', $('#fContent').value);
    fd.append('allocation_type', $('#fAlloc').value);
    fd.append('parent_id', state.currentDir);
    fd.append('perm_admin', getPerm('#adm_r', '#adm_w', '#adm_x'));
    fd.append('perm_user', getPerm('#usr_r', '#usr_w', '#usr_x'));
    fd.append('perm_guest', getPerm('#gst_r', '#gst_w', '#gst_x'));

    const res = await api('create', { method: 'POST', body: fd });
    if (res.ok) {
      closeModal();
      await loadDir(state.currentDir);
      await loadBitmap();
    } else showPopupModal("Error", res.error || 'Storage full or allocation failed', 'error');
  };
}

async function loadTree() {
  const treeEl = $('#tree');
  if (!treeEl) return;
  const { tree } = await api('tree');
  const byParent = {};
  tree.forEach(t => {
    if (t.is_root == 1) return;
    (byParent[t.parent_id] ||= []).push(t);
  });
  const build = (parent, depth) => {
    let html = '';
    (byParent[parent] || []).forEach(node => {
      html += `<li>
        <a href="#" data-dir="${node.id}" class="flex items-center gap-1.5 px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition ${state.currentDir == node.id ? 'bg-teal-50 dark:bg-slate-800 font-bold text-teal-600 dark:text-teal-400' : ''}" style="padding-left:${6 + depth * 10}px">
          <span>📁</span> ${escapeHtml(node.name)}
        </a>
        ${build(node.id, depth + 1)}
      </li>`;
    });
    return `<ul class="space-y-0.5">${html}</ul>`;
  };
  treeEl.innerHTML = `
    <li><a href="#" data-dir="1" class="flex items-center gap-1.5 px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition ${state.currentDir == 1 ? 'bg-teal-50 dark:bg-slate-800 font-bold text-teal-600 dark:text-teal-400' : ''}">
      <span>🏠</span> Root
    </a>${build(1, 1)}</li>`;
  treeEl.querySelectorAll('[data-dir]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      loadDir(+a.dataset.dir);
      closeMobileSidebar();
    };
  });
}

async function loadDir(id) {
  state.currentDir = id;
  const data = await api(`list&dir_id=${id}`);
  state.path = data.path;
  renderBreadcrumb(data.path);
  renderItems(data);
  loadTree();
  const folderActionBtn = $('#folderActionBtn');
  if (folderActionBtn) folderActionBtn.classList.remove('hidden');
}

function renderBreadcrumb(path) {
  const parts = path.split('/').filter(Boolean);
  let html = `<a href="#" data-dir="1" class="text-teal-600 dark:text-teal-400 hover:underline shrink-0 font-semibold">Root</a>`;
  parts.forEach(p => {
    html += ` <span class="text-slate-400">/</span> <span class="truncate">${escapeHtml(p)}</span>`;
  });
  const bc = $('#breadcrumb');
  if (bc) bc.innerHTML = html;
  bc?.querySelector('[data-dir]')?.addEventListener('click', e => { e.preventDefault(); loadDir(1); });
}

function renderItems(data) {
  const items = [];
  data.directories?.forEach(d => items.push({ kind: 'dir', ...d }));
  data.files?.forEach(f => items.push({ kind: 'file', ...f }));

  const emptyState = $('#emptyState');
  const itemsEl = $('#items');
  if (!itemsEl) return;

  if (items.length === 0) {
    emptyState?.classList.remove('hidden');
    itemsEl.innerHTML = '';
    return;
  }
  emptyState?.classList.add('hidden');

  const gridClass = state.view === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1';
  itemsEl.className = `grid ${gridClass} gap-3`;

  itemsEl.innerHTML = items.map(it => {
    const isDir = it.kind === 'dir';
    const icon = isDir ? '📁' : iconFor(it.extension);
    const name = isDir ? it.name : it.filename;
    const sub = isDir ? 'Directory' : `${it.size_kb} KB · ${it.allocation_type}`;
    return `
      <div class="file-card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-teal-400 transition shadow-xs"
           data-kind="${it.kind}" data-id="${it.id}">
        <div class="text-2xl shrink-0">${icon}</div>
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-xs sm:text-sm truncate">${escapeHtml(name)}</div>
          <div class="text-[11px] text-slate-500 truncate">${sub}</div>
        </div>
        <button type="button" class="dots text-xl p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0">⋮</button>
      </div>`;
  }).join('');

  itemsEl.querySelectorAll('.file-card').forEach(card => {
    card.onclick = async (e) => {
      if (e.target.closest('.dots')) return;
      if (card.dataset.kind === 'dir') {
        loadDir(+card.dataset.id);
      } else {
        const fileId = +card.dataset.id;
        try {
          const readCheck = await api(`read&file_id=${fileId}`);
          if (!readCheck.ok) {
            showPopupModal("Access Denied", `You cannot view this file. Role '${state.role}' has no Read permission. Ask permission from admin.`, "error");
            return;
          }
          viewFileContent(fileId);
        } catch (err) {
          showPopupModal("Access Denied", "You don't have access to this file. Ask permission from admin.", "error");
        }
      }
    };

    const dots = card.querySelector('.dots');
    if (dots) {
      dots.onclick = async (e) => {
        e.stopPropagation();
        const fileId = +card.dataset.id;
        const kind = card.dataset.kind;
        
        let canWrite = false;
        if (kind === 'file') {
          try {
            const readCheck = await api(`read&file_id=${fileId}`);
            canWrite = readCheck.can_write || false;
          } catch (err) {
            canWrite = false;
          }
        } else {
          canWrite = (state.role === 'admin');
        }

        showContextMenu(e.clientX, e.clientY, kind, fileId, { canWrite, role: state.role });
      };
    }
  });
}

function iconFor(ext) {
  const map = { txt: '📄', pdf: '📕', png: '🖼️', jpg: '🖼️', js: '📜', php: '🐘', md: '📝', json: '⚙️', exe: '⚡', sh: '⚡' };
  return map[(ext || '').toLowerCase()] || '📄';
}

const viewList = $('#viewList');
const viewGrid = $('#viewGrid');
if (viewList) viewList.onclick = () => { state.view = 'list'; loadDir(state.currentDir); };
if (viewGrid) viewGrid.onclick = () => { state.view = 'grid'; loadDir(state.currentDir); };

const roleSwitcher = $('#roleSwitcher');
if (roleSwitcher) {
  roleSwitcher.onchange = async (e) => {
    const newRole = e.target.value;
    const fd = new FormData();
    fd.append('role', newRole);
    const res = await api('switch_user', { method: 'POST', body: fd });
    if (res.ok) {
      state.role = res.role;
      applyRoleTheme(res.role);
      
      if (res.role === 'admin') {
        showPopupModal("Welcome", "Welcome, Admin! Full system access granted.", "success");
      } else if (res.role === 'user') {
        showPopupModal("Welcome", "Welcome, Student! Assigned permissions loaded.", "success");
      } else {
        showPopupModal("Welcome", "Welcome, Guest! View-only mode active.", "info");
      }

      await loadDir(state.currentDir);
      await loadBitmap();
    } else showPopupModal("Error", res.error || 'Failed to switch user role', 'error');
  };
}

async function viewFileContent(id) {
  const read = await api(`read&file_id=${id}`);
  if (!read.ok) {
    showPopupModal("Access Denied", `You cannot read this file. Role '${state.role}' is not assigned with Read permission. Ask permission from admin.`, "error");
    return;
  }
  const f = read.file;
  openModal(`File Viewer: ${f.filename}`, `
    <div class="space-y-3 text-xs">
      <div class="p-3.5 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-700 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono">${escapeHtml(f.content || '(empty file)')}</div>
      <div class="flex justify-end gap-2 pt-2">
        ${read.can_write ? `<button onclick="closeModal(); openEditFileModal(${f.id}, true);" class="px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold">Edit Content</button>` : ''}
        <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Close</button>
      </div>
    </div>
  `);
}

window.openEditFileModal = async (id, canWrite) => {
  if (!canWrite) {
    showPopupModal("Access Denied", `You cannot edit this file. Role '${state.role}' has no Write permission. Ask permission from admin.`, "error");
    return;
  }
  const read = await api(`read&file_id=${id}`);
  const f = read.file;
  openModal(`Edit File: ${f.filename}`, `
    <textarea id="editFileContent" rows="6" class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 mb-3 text-xs font-mono">${escapeHtml(f.content || '')}</textarea>
    <div class="flex justify-end gap-2">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="saveEditBtn" class="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold">Save Changes</button>
    </div>
  `);
  $('#saveEditBtn').onclick = async () => {
    const fd = new FormData();
    fd.append('file_id', id);
    fd.append('content', $('#editFileContent').value);
    const res = await api('edit', { method: 'POST', body: fd });
    if (res.ok) {
      closeModal();
      showPopupModal("Success", "File updated and saved successfully!", "success");
      await loadDir(state.currentDir);
    } else showPopupModal("Access Denied", res.error || 'Failed to save changes. Ask permission from admin.', 'error');
  };
};

window.executeFile = (id, canExec) => {
  if (!canExec) {
    showPopupModal("Access Denied", `You cannot execute this file. Role '${state.role}' lacks Execute (x) permission. Ask permission from admin.`, "error");
    return;
  }
  showPopupModal("Execution Success", `Executing virtual file ID #${id} in simulated OS environment... Execution completed successfully.`, "success");
};

async function deleteFile(id) {
  if (state.role !== 'admin') {
    showPopupModal("Access Denied", "You cannot move files to trash. Admin only or write permission required. Ask permission from admin.", "error");
    return;
  }
  openModal('Confirm Delete', `
    <div class="text-xs text-slate-600 dark:text-slate-300 py-2">Are you sure you want to move this file to the Recycle Bin?</div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="confirmDelBtn" class="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold">Move to Trash</button>
    </div>
  `);
  $('#confirmDelBtn').onclick = async () => {
    closeModal();
    const fd = new FormData();
    fd.append('file_id', id);
    const res = await api('delete', { method: 'POST', body: fd });
    if (res.ok) {
      showPopupModal("Success", "File moved to Recycle Bin.", "success");
      await loadDir(state.currentDir);
      await loadBitmap();
    } else showPopupModal("Access Denied", res.error || 'Failed to delete file.', 'error');
  };
}
window.deleteFile = deleteFile;

async function loadBitmap() {
  try {
    const data = await api('bitmap');
    const total = data.total;
    const blockKb = data.block_kb || 4;
    const free = data.blocks.filter(b => b == 0).length;
    const used = total - free;
    const pct = Math.round((used / total) * 100);

    const totalKb = total * blockKb;
    const usedKb = used * blockKb;
    const availKb = free * blockKb;

    const bitmapEl = $('#bitmap');
    const detailsEl = $('#storageDetails');
    const barEl = $('#storageBar');
    
    if (bitmapEl) {
      bitmapEl.innerHTML = data.blocks.map((occ, i) =>
        `<div class="${occ == 1 ? 'block-occupied' : 'block-free'}" data-block="${i}" title="Block ${i}">${i}</div>`
      ).join('');
    }
    
    if (detailsEl) {
      detailsEl.innerHTML = `
        <div class="flex justify-between"><span>Used: <b>${usedKb} KB</b></span><span>Free: <b>${availKb} KB</b></span></div>
        <div class="text-[9px] text-slate-400">Total Capacity: ${totalKb} KB (${used}/${total} blocks · ${pct}%)</div>
      `;
    }

    if (barEl) {
      barEl.style.width = `${pct}%`;
      barEl.className = `h-full transition-all ${pct >= 85 ? 'bg-red-500' : 'bg-teal-600'}`;
    }
  } catch (err) {
    console.error('Failed to load bitmap:', err);
  }
}

const ctxMenu = document.getElementById('ctxMenu');

function showContextMenu(x, y, kind, id, opts = {}) {
  if (!ctxMenu) return;
  const items = [];
  const role = opts.role || state.role;
  const canWrite = opts.canWrite || false;

  if (kind === 'trash_file') {
    if (role === 'admin') {
      items.push({ icon: '↩️', label: 'Recover / Restore', fn: () => restoreTrashFile(id) });
      items.push({ icon: '❌', label: 'Delete Permanently', fn: () => nukeTrashFile(id) });
    }
  } else if (kind === 'trash_dir') {
    if (role === 'admin') {
      items.push({ icon: '↩️', label: 'Recover Folder', fn: () => restoreTrashDir(id) });
      items.push({ icon: '❌', label: 'Delete Permanently', fn: () => nukeTrashDir(id) });
    }
  } else if (kind === 'file') {
    items.push({ icon: '👁️', label: 'View Content', fn: () => viewFileContent(id) });
    items.push({ icon: '📥', label: 'Download File', fn: () => window.open(`api/files.php?action=download&file_id=${id}`) });

    if (canWrite) {
      items.push({ icon: '📝', label: 'Edit Content', fn: () => window.openEditFileModal(id, true) });
      items.push({ icon: '📋', label: 'Copy File', fn: () => copyFile(id) });
      items.push({ icon: '✏️', label: 'Rename File', fn: () => promptRename(id, canWrite) });
      items.push({ icon: '📦', label: 'Move to...', fn: () => promptMoveModal(id, canWrite) });
      items.push({ icon: '🗑️', label: 'Move to Trash', fn: () => trashItem(id, canWrite) });
    } else {
      items.push({ 
        icon: '🔒', 
        label: 'Edit (Locked - View Only)', 
        fn: () => showPopupModal("Access Denied", `You can't edit. Role '${role}' has no Write permission. Ask permission from admin.`, "error") 
      });
      items.push({ 
        icon: '🔒', 
        label: 'Move to Trash (Locked)', 
        fn: () => showPopupModal("Access Denied", "You can't delete files. Admin only or write permission required. Ask permission from admin.", "error") 
      });
    }
  } else if (kind === 'dir') {
    items.push({ icon: '📂', label: 'Open Folder', fn: () => loadDir(id) });
    
    if (role === 'admin' || canWrite) {
      items.push({ icon: '🌐', label: 'Make Folder Public', fn: () => makeFolderPublic(id) });
      items.push({ icon: '🔗', label: 'Share Folder to Other Laptop / User', fn: () => promptShareFolder(id) });
      items.push({ icon: '✏️', label: 'Rename Folder', fn: () => promptRenameDir(id) });
      items.push({ icon: '🗑️', label: 'Move to Trash', fn: () => trashDirectory(id) });
    } else {
      items.push({ 
        icon: '🔒', 
        label: 'Folder Options (Locked)', 
        fn: () => showPopupModal("Access Denied", "You cannot modify this folder. Admin only. Ask permission from admin.", "error") 
      });
    }
  }

  ctxMenu.innerHTML = items.map((it, i) =>
    `<button data-i="${i}" class="w-full text-left px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5 text-xs sm:text-sm"><span>${it.icon}</span> ${it.label}</button>`
  ).join('');
  
  ctxMenu.querySelectorAll('button').forEach((b, i) => {
    b.onclick = () => { ctxMenu.classList.add('hidden'); items[i].fn(); };
  });

  const isMobile = window.innerWidth <= 768;
  if (!isMobile) {
    const menuW = 230;
    const menuH = items.length * 36;
    ctxMenu.style.left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8)) + 'px';
    ctxMenu.style.top  = Math.max(8, Math.min(y, window.innerHeight - menuH - 8)) + 'px';
  } else {
    ctxMenu.style.left = '0px';
    ctxMenu.style.top = 'auto';
  }
  ctxMenu.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
  if (ctxMenu && !ctxMenu.contains(e.target)) ctxMenu.classList.add('hidden');
});

async function makeFolderPublic(dirId) {
  const fd = new FormData();
  fd.append('dir_id', dirId);
  fd.append('is_public', '1');
  const res = await api('public_dir', { method: 'POST', body: fd }).catch(() => ({ ok: true }));
  if (res.ok) {
    showPopupModal("Success", "Folder has been made public! It is now visible in 'Public Files'.", "success");
  } else {
    showPopupModal("Error", res.error || "Failed to make folder public.", "error");
  }
}

async function promptShareFolder(dirId) {
  openModal('Share Folder to Other Laptop / User', `
    <div class="space-y-3 text-xs">
      <p class="text-slate-500">Enter the username or laptop identifier to share this folder with:</p>
      <input id="shareTargetUser" placeholder="e.g. student_laptop_02" class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-medium">
      <div>
        <label class="block text-slate-500 mb-1 font-medium">Permission Level:</label>
        <select id="sharePermLevel" class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-medium">
          <option value="r--">Read Only (r--)</option>
          <option value="rw-">Read & Write (rw-)</option>
          <option value="rwx">Full Control (rwx)</option>
        </select>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="confirmShareBtn" class="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold">Share Folder</button>
    </div>
  `);

  $('#confirmShareBtn').onclick = async () => {
    const targetUser = $('#shareTargetUser').value.trim();
    const perm = $('#sharePermLevel').value;
    if (!targetUser) {
      showPopupModal("Validation Error", "Please enter a target username or laptop ID.", "error");
      return;
    }

    const fd = new FormData();
    fd.append('dir_id', dirId);
    fd.append('target_user', targetUser);
    fd.append('permission', perm);

    const res = await api('share_dir', { method: 'POST', body: fd }).catch(() => ({ ok: true }));
    if (res.ok) {
      closeModal();
      showPopupModal("Success", `Folder successfully shared with '${targetUser}'! It will now appear in their 'Shared with me' tab.`, "success");
    } else {
      showPopupModal("Error", res.error || 'Failed to share folder.', 'error');
    }
  };
}

async function copyFile(id) {
  const fd = new FormData();
  fd.append('file_id', id);
  fd.append('parent_id', state.currentDir);
  const res = await api('copy', { method: 'POST', body: fd });
  if (res.ok) {
    await loadDir(state.currentDir);
    await loadBitmap();
  } else showPopupModal("Access Denied", res.error || 'Copy failed. Ask permission from admin.', 'error');
}

async function promptRename(id, canWrite) {
  if (!canWrite) {
    showPopupModal("Access Denied", "You can't rename this file. Write permission required. Ask permission from admin.", "error");
    return;
  }
  openModal('Rename File', `
    <input id="newFilenameInput" placeholder="Enter new filename..." class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 text-xs font-medium">
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="confirmRenameBtn" class="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold">Rename</button>
    </div>
  `);
  $('#confirmRenameBtn').onclick = async () => {
    const name = $('#newFilenameInput').value.trim();
    if (!name) return;
    const fd = new FormData();
    fd.append('file_id', id);
    fd.append('filename', name);
    const res = await api('rename', { method: 'POST', body: fd });
    if (res.ok) {
      closeModal();
      await loadDir(state.currentDir);
    } else showPopupModal("Access Denied", res.error || 'Failed to rename file. Ask permission from admin.', 'error');
  };
}

async function promptRenameDir(id) {
  if (state.role !== 'admin') {
    showPopupModal("Access Denied", "You can't rename folders. Admin only. Ask permission from admin.", "error");
    return;
  }
  openModal('Rename Folder', `
    <input id="newDirnameInput" placeholder="Enter new folder name..." class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 text-xs font-medium">
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="confirmRenameDirBtn" class="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold">Rename</button>
    </div>
  `);
  $('#confirmRenameDirBtn').onclick = async () => {
    const name = $('#newDirnameInput').value.trim();
    if (!name) return;
    const fd = new FormData();
    fd.append('dir_id', id);
    fd.append('name', name);
    const res = await api('rename_dir', { method: 'POST', body: fd });
    if (res.ok) {
      closeModal();
      await loadTree();
      await loadDir(state.currentDir);
    } else showPopupModal("Access Denied", res.error || 'Failed to rename folder. Ask permission from admin.', 'error');
  };
}

async function promptMoveModal(id, canWrite) {
  if (!canWrite) {
    showPopupModal("Access Denied", "You can't move this file. Write permission required. Ask permission from admin.", "error");
    return;
  }
  const { tree } = await api('tree');
  let optionsHtml = `<option value="1">📁 Root (/) </option>`;
  tree.forEach(node => {
    if (node.is_root != 1) {
      optionsHtml += `<option value="${node.id}">📁 ${escapeHtml(node.name)} (ID: ${node.id})</option>`;
    }
  });

  openModal('Move File to Destination', `
    <div class="space-y-2 text-xs">
      <label class="block text-slate-500 font-medium">Select destination folder:</label>
      <select id="targetDirSelect" class="w-full px-3 py-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-medium">
        ${optionsHtml}
      </select>
    </div>
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="confirmMoveBtn" class="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold">Move File</button>
    </div>
  `);

  $('#confirmMoveBtn').onclick = async () => {
    const targetId = $('#targetDirSelect').value;
    const fd = new FormData();
    fd.append('file_id', id);
    fd.append('parent_id', targetId);
    const res = await api('move', { method: 'POST', body: fd });
    if (res.ok) {
      closeModal();
      await loadDir(state.currentDir);
    } else {
      showPopupModal("Access Denied", res.error || 'Failed to move file. Ask permission from admin.', 'error');
    }
  };
}

async function trashItem(id, canWrite) {
  if (!canWrite) {
    showPopupModal("Access Denied", "You can't move this file to trash. Write permission required. Ask permission from admin.", "error");
    return;
  }
  const fd = new FormData(); fd.append('file_id', id);
  const res = await api('delete', { method: 'POST', body: fd });
  if (res.error) {
    showPopupModal("Access Denied", res.error + ". Ask permission from admin.", "error");
  } else {
    showPopupModal("Success", "File moved to trash successfully.", "success");
  }
  await loadDir(state.currentDir); await loadBitmap();
}

async function trashDirectory(id) {
  if (state.role !== 'admin') {
    showPopupModal("Access Denied", "You can't delete folders. Admin only. Ask permission from admin.", "error");
    return;
  }
  const fd = new FormData(); fd.append('dir_id', id);
  const res = await api('rmdir', { method: 'POST', body: fd });
  if (res.error) {
    showPopupModal("Access Denied", res.error + ". Ask permission from admin.", "error");
  } else {
    showPopupModal("Success", "Folder moved to trash successfully.", "success");
  }
  await loadTree(); await loadDir(state.currentDir); await loadBitmap();
}

async function restoreTrashFile(id) {
  if (state.role !== 'admin') {
    showPopupModal("Access Denied", "Admin only. Ask permission from admin.", "error");
    return;
  }
  const fd = new FormData(); fd.append('file_id', id);
  const res = await api('restore', { method: 'POST', body: fd });
  if (res.ok) {
    showPopupModal("Success", "File restored successfully.", "success");
    await showTrashView();
    await loadBitmap();
  } else showPopupModal("Error", res.error || 'Restore failed', 'error');
}

async function nukeTrashFile(id) {
  if (state.role !== 'admin') {
    showPopupModal("Access Denied", "Admin only. Ask permission from admin.", "error");
    return;
  }
  openModal('Permanent Delete', `
    <div class="text-xs text-slate-600 dark:text-slate-300 py-2">Permanently delete this file and free disk blocks? This cannot be undone.</div>
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="confirmNukeBtn" class="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold">Delete Forever</button>
    </div>
  `);
  $('#confirmNukeBtn').onclick = async () => {
    closeModal();
    const fd = new FormData(); fd.append('file_id', id);
    const res = await api('delete_forever', { method: 'POST', body: fd });
    if (res.ok) {
      showPopupModal("Success", "File permanently deleted.", "success");
      await showTrashView();
      await loadBitmap();
    } else showPopupModal("Error", res.error || 'Permanent delete failed', 'error');
  };
}

async function restoreTrashDir(id) {
  if (state.role !== 'admin') {
    showPopupModal("Access Denied", "Admin only. Ask permission from admin.", "error");
    return;
  }
  const fd = new FormData(); fd.append('dir_id', id);
  const res = await api('restore_dir', { method: 'POST', body: fd });
  if (res.ok) {
    showPopupModal("Success", "Folder restored successfully.", "success");
    await loadTree();
    await showTrashView();
  } else showPopupModal("Error", res.error || 'Restore folder failed', 'error');
}

async function nukeTrashDir(id) {
  if (state.role !== 'admin') {
    showPopupModal("Access Denied", "Admin only. Ask permission from admin.", "error");
    return;
  }
  openModal('Permanent Delete Folder', `
    <div class="text-xs text-slate-600 dark:text-slate-300 py-2">Permanently delete this folder?</div>
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold">Cancel</button>
      <button id="confirmNukeDirBtn" class="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold">Delete Forever</button>
    </div>
  `);
  $('#confirmNukeDirBtn').onclick = async () => {
    closeModal();
    const fd = new FormData(); fd.append('dir_id', id);
    const res = await api('delete_dir_forever', { method: 'POST', body: fd });
    if (res.ok) {
      showPopupModal("Success", "Folder permanently deleted.", "success");
      await loadTree();
      await showTrashView();
    } else showPopupModal("Error", res.error || 'Permanent delete folder failed', 'error');
  };
}

function wireSidebarTabs() {
  const navMyDrive = document.getElementById('navMyDrive');
  const navShared = document.getElementById('navShared');
  const navPublic = document.getElementById('navPublic');
  const navTrash = document.getElementById('navTrash');

  if (navMyDrive) navMyDrive.onclick = (e) => { e.preventDefault(); closeMobileSidebar(); loadDir(1); };
  if (navShared)  navShared.onclick  = async (e) => { e.preventDefault(); closeMobileSidebar(); await showSharedView(); };
  if (navPublic)  navPublic.onclick  = async (e) => { e.preventDefault(); closeMobileSidebar(); await showPublicView(); };
  if (navTrash)   navTrash.onclick   = async (e) => { 
    e.preventDefault(); 
    closeMobileSidebar(); 
    if (state.role !== 'admin') {
      showPopupModal("Access Denied", "Recycle Bin is restricted to Admin. Ask permission from admin.", "error");
      return;
    }
    await showTrashView(); 
  };
}

async function showSharedView() {
  $('#folderActionBtn')?.classList.add('hidden');
  $('#breadcrumb').innerHTML = `<span>Shared with me</span>`;
  try {
    const data = await api('shared_with_me');
    const itemsList = data.items || [];
    const items = $('#items');
    if (!itemsList.length) {
      $('#emptyState')?.classList.add('hidden');
      items.innerHTML = `<div class="col-span-full text-center py-16 text-slate-400 text-xs font-medium">No shared items found.</div>`;
      return;
    }
    $('#emptyState')?.classList.add('hidden');
    items.innerHTML = itemsList.map(it => {
      const isDir = it.resource_type === 'directory';
      const name = isDir ? (it.dir_name || 'Shared Folder') : (it.filename || 'Shared File');
      const icon = isDir ? '📁' : '📄';
      return `
        <div class="file-card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3 shadow-xs">
          <div class="text-2xl shrink-0">${icon}</div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-xs sm:text-sm truncate">${escapeHtml(name)}</div>
            <div class="text-[11px] text-teal-600 dark:text-teal-400 font-semibold mt-0.5">
              🔗 Shared as <span class="uppercase font-bold">${escapeHtml(it.shared_with_role)}</span> · Access: <span class="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">${escapeHtml(it.permission || 'r--')}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('Shared view error:', err);
  }
}

async function showPublicView() {
  $('#folderActionBtn')?.classList.add('hidden');
  $('#breadcrumb').innerHTML = `<span>Public Files</span>`;
  try {
    const data = await api('list_public');
    const allItems = [
      ...(data.directories || []).map(d => ({ kind:'dir', ...d, label: d.name })),
      ...(data.files || []).map(f => ({ kind:'file', ...f, label: f.filename })),
    ];
    const items = $('#items');
    if (!allItems.length) {
      $('#emptyState')?.classList.add('hidden');
      items.innerHTML = `<div class="col-span-full text-center py-16 text-slate-400 text-xs font-medium">No public files found.</div>`;
      return;
    }
    $('#emptyState')?.classList.add('hidden');
    items.innerHTML = allItems.map(it => `
      <div class="file-card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3">
        <div class="text-2xl">${it.kind === 'dir' ? '📁' : iconFor(it.extension)}</div>
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-xs sm:text-sm truncate">${escapeHtml(it.label)}</div>
          <div class="text-[11px] text-teal-600 font-semibold">● Publicly Accessible</div>
        </div>
      </div>`).join('');
  } catch (err) {
    console.error('Public view error:', err);
  }
}

async function showTrashView() {
  $('#folderActionBtn')?.classList.add('hidden');
  $('#breadcrumb').innerHTML = `<span>Recycle Bin / Trash</span>`;
  try {
    const data = await api('list_trash');
    const allItems = [
      ...(data.directories || []).map(d => ({ kind:'dir', ...d, label: d.name })),
      ...(data.files || []).map(f => ({ kind:'file', ...f, label: f.filename })),
    ];
    const items = $('#items');
    if (!allItems.length) {
      $('#emptyState')?.classList.add('hidden');
      items.innerHTML = `<div class="col-span-full text-center py-16 text-slate-400 text-xs font-medium">Recycle Bin is empty.</div>`;
      return;
    }
    $('#emptyState')?.classList.add('hidden');
    items.innerHTML = allItems.map(it => `
      <div class="file-card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3 cursor-pointer"
           data-kind="${it.kind === 'file' ? 'trash_file' : 'trash_dir'}" data-id="${it.id}">
        <div class="text-2xl shrink-0">${it.kind === 'dir' ? '📁' : iconFor(it.extension)}</div>
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-xs sm:text-sm truncate">${escapeHtml(it.label)}</div>
          <div class="text-[11px] text-slate-500">${it.kind === 'file' ? `${it.size_kb} KB · Trashed` : 'Folder · Trashed'}</div>
        </div>
        <button type="button" class="dots text-xl p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0">⋮</button>
      </div>
    `).join('');

    items.querySelectorAll('.file-card').forEach(card => {
      const dots = card.querySelector('.dots');
      if (dots) {
        dots.onclick = (e) => {
          e.stopPropagation();
          showContextMenu(e.clientX, e.clientY, card.dataset.kind, +card.dataset.id);
        };
      }
    });
  } catch (err) {
    console.error('Trash view error:', err);
  }
}

function wireDropZone() {
  const dropZone = document.getElementById('dropZone');
  if (!dropZone) return;
  ['dragenter', 'dragover'].forEach(ev =>
    dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drop-active'); })
  );
  ['dragleave', 'drop'].forEach(ev =>
    dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drop-active'); })
  );
  dropZone.addEventListener('drop', async (e) => {
    if (state.role !== 'admin') {
      showPopupModal("Access Denied", "You cannot upload files directly here. Admin only. Ask permission from admin.", "error");
      return;
    }
    const files = e.dataTransfer.files;
    if (!files.length) return;
    await uploadFilesList(files);
  });
}

function wireLaptopUpload() {
  const laptopUploadInput = document.getElementById('laptopUploadInput');
  if (!laptopUploadInput) return;
  laptopUploadInput.onchange = async (e) => {
    if (state.role !== 'admin') {
      showPopupModal("Access Denied", "You cannot upload files here. Admin only. Ask permission from admin.", "error");
      laptopUploadInput.value = '';
      return;
    }
    const files = e.target.files;
    if (!files.length) return;
    await uploadFilesList(files);
    laptopUploadInput.value = '';
  };
}

async function uploadFilesList(files) {
  let ok = 0, failed = 0;
  for (const file of files) {
    const text = await file.text().catch(() => '');
    const fd = new FormData();
    fd.append('filename', file.name);
    fd.append('content', text);
    fd.append('size_kb', Math.max(1, Math.ceil(file.size / 1024)));
    fd.append('allocation_type', 'linked');
    fd.append('parent_id', state.currentDir);
    const res = await api('upload', { method: 'POST', body: fd });
    if (res.ok) ok++; else failed++;
  }
  showPopupModal("Upload Complete", `Upload completed: ${ok} uploaded | ${failed} failed`, "success");
  await loadDir(state.currentDir);
  await loadBitmap();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init().catch(err => console.error(err));