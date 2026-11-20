<!DOCTYPE html>
<html lang="en" class="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TASHA VirtualDrive - OS File Management Simulator</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class'
        }
    </script>
    <style>
        .block-free { background-color: #e2e8f0; color: #475569; font-size: 9px; text-align: center; border-radius: 4px; height: 22px; display: flex; align-items: center; justify-content: center; }
        .dark .block-free { background-color: #1e293b; color: #94a3b8; }
        .block-occupied { background-color: #0d9488; color: white; font-size: 9px; text-align: center; border-radius: 4px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .block-selected { border: 2px solid #f43f5e !important; }
        .block-index { background-color: #8b5cf6 !important; color: white; }
        .drop-active { border: 2px dashed #0d9488 !important; background-color: rgba(13, 148, 136, 0.05); }
    </style>
</head>
<body class="bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 h-screen flex flex-col overflow-hidden transition-colors font-sans">

    <!-- Top Navigation Bar (Unique Dashboard Header Style) -->
    <header class="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 z-30 shadow-sm">
        <div class="flex items-center gap-3 min-w-0">
            <img src="assets/images/essu.png" alt="ESSU" onerror="this.style.display='none'" class="w-9 h-9 rounded-xl object-cover shrink-0 ring-2 ring-teal-500/30">
            <div>
                <h1 class="font-extrabold text-sm sm:text-base tracking-tight">TASHA <span class="text-teal-600 dark:text-teal-400">VirtualDrive</span></h1>
                <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">OS Simulator Pro</p>
            </div>
        </div>

        <!-- Quick Navigation Links on Header -->
        <nav class="hidden md:flex items-center gap-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <a href="#" id="navMyDrive" class="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs transition">🏠 My Drive</a>
            <a href="#" id="navShared" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-teal-600 transition">👥 Shared</a>
            <a href="#" id="navPublic" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-teal-600 transition">🌐 Public</a>
            <a href="#" id="navTrash" class="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-teal-600 transition">🗑️ Trash</a>
        </nav>

        <div class="flex items-center gap-2 shrink-0">
            <select id="roleSwitcher" class="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold shadow-xs">
                <option value="admin">Admin</option>
                <option value="user">User</option>
                <option value="guest">Guest</option>
            </select>
            <button id="themeToggle" type="button" class="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs transition">🌙</button>
            <button id="menuBtn" type="button" class="md:hidden p-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm">☰</button>
        </div>
    </header>

    <!-- Main Content Area with Split View (Disk/Tree on Right or Collapsible Drawer) -->
    <div class="flex flex-1 overflow-hidden relative">
        <div id="sidebarBackdrop" class="hidden fixed inset-0 bg-black/50 z-30 md:hidden"></div>

        <!-- Left / Center Workspace (Files & Folders Grid) -->
        <main id="dropZone" class="flex-1 p-4 sm:p-6 overflow-y-auto flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div class="flex items-center gap-2 min-w-0">
                    <div id="breadcrumb" class="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 truncate"></div>
                    
                    <div class="relative shrink-0">
                        <button id="folderActionBtn" type="button" title="Folder Actions" class="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 font-bold text-sm shadow-xs">Actions ▾</button>
                        <div id="folderActionMenu" class="hidden absolute left-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl py-1.5 z-30 text-xs">
                            <button data-folder-act="new-folder" class="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">📁 Add Subfolder</button>
                            <button data-folder-act="new-file" class="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">📄 Add Virtual File</button>
                            <button data-folder-act="browse-file" class="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">💻 Browse File...</button>
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <!-- New / Upload Primary Button -->
                    <div class="relative">
                        <button id="newBtn" type="button" class="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-3.5 py-1.5 rounded-xl text-xs shadow-md transition">
                            <span>+</span> New Item
                        </button>
                        <div id="newMenu" class="hidden absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl py-1.5 z-50 text-xs">
                            <button data-action="new-folder" class="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700">📁 New Folder</button>
                            <button data-action="new-file" class="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700">📄 New Virtual File</button>
                            <label class="block w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                                💻 Upload from PC <input type="file" id="laptopUploadInput" class="hidden" multiple>
                            </label>
                        </div>
                    </div>

                    <div class="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 text-xs shrink-0 shadow-xs">
                        <button id="viewGrid" type="button" class="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 font-bold">Grid</button>
                        <button id="viewList" type="button" class="px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 font-medium">List</button>
                    </div>
                </div>
            </div>

            <div id="emptyState" class="hidden flex-1 flex flex-col items-center justify-center text-slate-400 py-16 text-center px-4">
                <span class="text-5xl mb-3">📂</span>
                <p class="text-xs font-medium">This folder is empty. Use the 'New Item' button or drop files here.</p>
            </div>

            <div id="items" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"></div>
        </main>

        <!-- Right Side Panel: Directory Tree & Disk Bitmap Widget -->
        <aside id="sidebar" class="fixed md:static inset-y-0 right-0 z-40 w-80 md:w-72 translate-x-full md:translate-x-0 transition-transform duration-200 ease-in-out border-l border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-4 bg-white dark:bg-slate-900 shrink-0 overflow-y-auto shadow-xl md:shadow-none">
            
            <div class="flex items-center justify-between md:hidden pb-2 border-b border-slate-200 dark:border-slate-800">
                <span class="font-bold text-xs uppercase text-slate-400">Navigation & Storage</span>
                <button id="closeSidebarBtn" type="button" class="px-2 py-0.5 text-sm text-slate-500 font-bold">✕</button>
            </div>

            <!-- Mobile Navigation links inside drawer -->
            <div class="md:hidden flex flex-col gap-1 text-xs font-semibold">
                <a href="#" id="navMyDriveMob" class="px-3 py-2 rounded-xl bg-teal-50 dark:bg-slate-800 text-teal-600">🏠 My Drive</a>
                <a href="#" id="navSharedMob" class="px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">👥 Shared with me</a>
                <a href="#" id="navPublicMob" class="px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">🌐 Public Files</a>
                <a href="#" id="navTrashMob" class="px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">🗑️ Recycle Bin</a>
            </div>

            <hr class="md:hidden border-slate-200 dark:border-slate-800">

            <!-- Directory Tree Component -->
            <div class="flex-1 overflow-y-auto min-h-[140px] bg-slate-50 dark:bg-slate-950/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 px-1">Directory Structure</div>
                <ul id="tree" class="text-xs space-y-1"></ul>
            </div>

            <hr class="border-slate-200 dark:border-slate-800">

            <!-- Virtual Disk Bitmap & Storage Progress -->
            <div class="bg-gradient-to-br from-teal-50/50 to-slate-50 dark:from-slate-800/40 dark:to-slate-900 p-3.5 rounded-2xl border border-teal-100 dark:border-slate-800 shadow-xs">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-400">Virtual Disk Bitmap</span>
                    <button id="configDiskBtn" type="button" class="text-[10px] text-teal-600 dark:text-teal-400 hover:underline font-bold">Configure</button>
                </div>
                <div id="storageDetails" class="text-[10px] font-medium text-slate-600 dark:text-slate-300 mb-2"></div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden mb-3">
                    <div id="storageBar" class="bg-teal-600 h-full transition-all" style="width: 0%"></div>
                </div>
                <div id="bitmap" class="grid grid-cols-8 gap-1.5 mb-2"></div>
                <div class="flex justify-between text-[9px] text-slate-400 font-medium">
                    <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-700 inline-block rounded-xs"></span> Free</span>
                    <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-teal-600 inline-block rounded-xs"></span> Used</span>
                    <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-purple-500 inline-block rounded-xs"></span> Index</span>
                </div>
            </div>

            <!-- Metadata Inspector Section -->
            <div class="border-t border-slate-200 dark:border-slate-800 pt-3">
                <h3 class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">File Inspector</h3>
                <div id="inspectorContent" class="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/30 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 min-h-[90px]">
                    <p class="text-[11px]">Select a file to inspect attributes and blocks.</p>
                </div>
            </div>
        </aside>
    </div>

    <!-- Footer -->
    <footer class="h-10 px-4 sm:px-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs text-slate-500 shrink-0">
        <span class="truncate font-medium">ESSU VirtualDrive &copy; 2026</span>
        <button id="developersBtn" type="button" class="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold shrink-0 transition">
            👥 Developers
        </button>
    </footer>

    <!-- Modals & Context Menu -->
    <div id="modal" class="hidden fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-sm p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-3">
                <h3 id="modalTitle" class="font-bold text-sm truncate pr-2"></h3>
                <button id="modalClose" type="button" class="text-slate-400 hover:text-slate-600 text-sm p-1 rounded-lg">✕</button>
            </div>
            <div id="modalBody" class="text-sm"></div>
        </div>
    </div>

    <div id="ctxMenu" class="hidden fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl py-1.5 z-50 text-xs w-48"></div>

    <script src="assets/app.js"></script>
</body>
</html>