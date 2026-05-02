// Wishen Full API & UI Logic
const API_URL = 'http://localhost:3000/api';

// --- Utility Functions --- //
async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('wishen_token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...(options.headers || {})
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'API Error');
        return data;
    } catch (err) {
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
            throw new Error('Cannot connect to server. Please make sure the backend is running (node server.js).');
        }
        throw err;
    }
}

function showToast(msg, type = 'success') {
    const existing = document.getElementById('wishen-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'wishen-toast';
    toast.textContent = msg;
    toast.style.cssText = `
        position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
        padding: 1rem 1.5rem; border-radius: 12px; font-weight: 600;
        background: ${type === 'error' ? '#fecaca' : '#bbf7d0'};
        color: ${type === 'error' ? '#991b1b' : '#166534'};
        border: 2px solid ${type === 'error' ? '#fca5a5' : '#86efac'};
        box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function logout() {
    localStorage.removeItem('wishen_token');
    localStorage.removeItem('wishen_user');
    window.location.href = 'login.html';
}

// --- Route Guards & Init --- //
document.addEventListener('DOMContentLoaded', () => {
    const publicPages = ['', 'index.html', 'login.html', 'register.html', 'forgot-password.html', 'reset-password.html'];
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    if (!publicPages.includes(currentPage) && !localStorage.getItem('wishen_token')) {
        window.location.href = 'login.html';
        return;
    }

    // Set welcome text in navbar
    const user = JSON.parse(localStorage.getItem('wishen_user') || 'null');
    const navLink = document.querySelector('.nav-user-info');
    if (user && navLink) {
        navLink.innerHTML = `Hello, <strong>${user.username}</strong> <span class="doodle-text">✿</span>`;
    }

    // Initialize page-specific logic
    if (currentPage === 'dashboard.html') initDashboard();
    if (currentPage === 'friends.html')   initFriends();
    if (currentPage === 'profile.html')   initProfile();
    if (currentPage === 'settings.html')  initSettings();
    if (currentPage === 'messages.html')  initMessages();
    if (currentPage === 'todos.html')     initTodos();

    setupAuthForms();
    setupModals();
});

// ===================== 1. DASHBOARD =====================
async function initDashboard() {
    const grid       = document.getElementById('wishlistGrid');
    const emptyState = document.getElementById('emptyWishlist');
    if (!grid || !emptyState) return;

    await loadWishlistItems(grid, emptyState);

    const addForm = document.getElementById('addItemForm');
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = addForm.querySelector('button[type="submit"]');
            btn.disabled = true; btn.textContent = 'Saving...';
            const file = document.getElementById('itemImg').files[0];

            let image_url = null;

            if (file) {
                const reader = new FileReader();
                reader.readAsDataURL(file);

                await new Promise(resolve => {
                    reader.onloadend = () => {
                        image_url = reader.result;
                        resolve();
                    };
                });
            }

const payload = {
    title: document.getElementById('itemTitle').value.trim(),
    description: document.getElementById('itemDesc').value.trim(),
    price: document.getElementById('itemPrice').value || null,
    image_url: image_url,
    link: document.getElementById('itemLink').value.trim() || null
};
            try {
                await apiFetch('/wishlist/item', { method: 'POST', body: JSON.stringify(payload) });
                showToast('Item added to your wishlist! 🎁');
                document.getElementById('addItemModal').classList.remove('active');
                addForm.reset();
                await loadWishlistItems(grid, emptyState);
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                btn.disabled = false; btn.textContent = 'Save to Wishlist';
            }
        });
    }
}

async function loadWishlistItems(grid, emptyState) {
    try {
        const items = await apiFetch('/wishlist');
        if (items.length === 0) {
            emptyState.style.display = 'block';
            grid.style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            grid.style.display = 'grid';
            grid.innerHTML = items.map(item => `
                <div class="wishlist-card">
                    ${item.image_url ? `<img src="${item.image_url}" alt="${item.title}" onerror="this.style.display='none'">` : ''}
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(item.description || '')}</p>
                    <div class="wishlist-meta">
                        <span>${item.price ? '₹' + parseFloat(item.price).toFixed(2) : 'No price'}</span>
                        ${item.reserved_by_id
                            ? `<span class="badge badge-reserved">Reserved</span>`
                            : `<span class="badge badge-available">Available</span>`}
                    </div>
                    <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                        ${item.link ? `<a href="${item.link}" target="_blank" class="btn btn-outline btn-small" style="flex:1;">View Link</a>` : ''}
                        <button class="btn btn-outline btn-small" style="flex:1; color:#ef4444; border-color:#fca5a5;" onclick="deleteItem(${item.id})">Delete</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

window.deleteItem = async (itemId) => {
    if (!confirm('Remove this item from your wishlist?')) return;
    try {
        await apiFetch(`/wishlist/item/${itemId}`, { method: 'DELETE' });
        showToast('Item removed');
        const grid       = document.getElementById('wishlistGrid');
        const emptyState = document.getElementById('emptyWishlist');
        await loadWishlistItems(grid, emptyState);
    } catch (err) { showToast(err.message, 'error'); }
};

// ===================== 2. FRIENDS =====================
async function initFriends() {
    const searchBtn    = document.getElementById('searchBtn');
    const searchInput  = document.getElementById('friendSearch');
    const searchResults= document.getElementById('searchResults');
    const reqList      = document.getElementById('pendingRequestsList');
    const friendList   = document.getElementById('friendListContainer');
    const emptyFriends = document.getElementById('emptyFriends');

    // Search
    if (searchBtn && searchInput && searchResults) {
        searchBtn.addEventListener('click', async () => {
            const q = searchInput.value.trim();
            if (!q) return;
            try {
                const results = await apiFetch(`/friends/search?query=${encodeURIComponent(q)}`);
                if (results.length === 0) {
                    searchResults.innerHTML = '<p style="color:var(--text-secondary); margin-top:1rem;">No users found.</p>';
                } else {
                    searchResults.innerHTML = results.map(u => `
                        <div class="friend-card" style="margin-top:0.75rem;">
                            <div class="info">
                                <div class="avatar">${u.username.charAt(0).toUpperCase()}</div>
                                <h4>${escapeHtml(u.username)}</h4>
                            </div>
                            <button class="btn btn-primary btn-small" onclick="sendRequest(${u.id}, this)">Send Request</button>
                        </div>
                    `).join('');
                }
            } catch (err) { showToast(err.message, 'error'); }
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') searchBtn.click();
        });
    }

    // Load Pending Requests
    if (reqList) {
        try {
            const requests = await apiFetch('/friends/requests');
            const badge = document.getElementById('requestsBadge');
            if (badge) badge.textContent = requests.length;

            if (requests.length === 0) {
                reqList.innerHTML = '<p style="color:var(--text-secondary);">No pending requests.</p>';
            } else {
                reqList.innerHTML = requests.map(r => `
                    <div class="friend-card" id="req-${r.id}">
                        <div class="info">
                            <div class="avatar">${r.username.charAt(0).toUpperCase()}</div>
                            <div>
                                <h4>${escapeHtml(r.username)}</h4>
                                <span style="font-size:0.8rem;color:var(--text-secondary);">Wants to be friends ✨</span>
                            </div>
                        </div>
                        <div style="display:flex;gap:0.5rem;">
                            <button class="btn btn-primary btn-small" onclick="respondRequest(${r.id},'accept')">Accept</button>
                            <button class="btn btn-outline btn-small" onclick="respondRequest(${r.id},'reject')">Reject</button>
                        </div>
                    </div>
                `).join('');
            }
        } catch (err) { /* silent */ }
    }

    // Load Friends List
    if (friendList && emptyFriends) {
        try {
            const friends = await apiFetch('/friends/list');
            if (friends.length === 0) {
                emptyFriends.style.display = 'block';
                friendList.style.display   = 'none';
            } else {
                emptyFriends.style.display = 'none';
                friendList.style.display   = 'flex';
                friendList.innerHTML = friends.map(f => `
                    <div class="friend-card" style="transition:all 0.2s ease;">
                        <div class="info">
                            <a href="profile.html?id=${f.id}&name=${encodeURIComponent(f.username)}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:1rem;">
                                <div class="avatar" style="background:var(--gradient-primary);">${f.username.charAt(0).toUpperCase()}</div>
                                <div>
                                    <h4>${escapeHtml(f.username)}</h4>
                                    ${f.is_private
                                        ? `<span style="font-size:0.8rem;color:var(--text-secondary);">🔒 Private</span>`
                                        : `<span style="font-size:0.8rem;color:var(--accent-secondary);">View Wishlist →</span>`}
                                </div>
                            </a>
                        </div>
                        <a href="messages.html?friend=${f.id}&name=${encodeURIComponent(f.username)}" class="btn btn-outline btn-small">💬 Message</a>
                    </div>
                `).join('');
            }
        } catch (err) { /* silent */ }
    }
}

window.sendRequest = async (friendId, btn) => {
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    try {
        await apiFetch('/friends/request', { method: 'POST', body: JSON.stringify({ friend_id: friendId }) });
        showToast('Friend request sent! 🌸');
        if (btn) { btn.textContent = 'Sent ✓'; }
    } catch (err) {
        showToast(err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Send Request'; }
    }
};

window.respondRequest = async (userId, action) => {
    try {
        await apiFetch('/friends/respond', { method: 'POST', body: JSON.stringify({ user_id: userId, action }) });
        showToast(action === 'accept' ? 'You are now friends! 🎉' : 'Request rejected');
        const card = document.getElementById(`req-${userId}`);
        if (card) card.remove();
    } catch (err) { showToast(err.message, 'error'); }
};

// ===================== 3. PROFILE =====================
async function initProfile() {
    const urlParams  = new URLSearchParams(window.location.search);
    const friendId   = urlParams.get('id');
    const friendName = decodeURIComponent(urlParams.get('name') || 'Friend');

    const nameEl   = document.getElementById('profileName');
    const avatarEl = document.getElementById('profileAvatar');
    const grid     = document.getElementById('profileGrid');

    if (nameEl)   nameEl.textContent   = `${friendName}'s Wishlist`;
    if (avatarEl) avatarEl.textContent = friendName.charAt(0).toUpperCase();

    if (!friendId || !grid) return;

    grid.innerHTML = '<p style="color:var(--text-secondary);">Loading wishlist...</p>';

    try {
        const items = await apiFetch(`/wishlist/friend/${friendId}`);
        if (items.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <h3 class="doodle-text" style="font-size:3rem;">🎁</h3>
                    <h3>${escapeHtml(friendName)} hasn't added any items yet!</h3>
                </div>`;
        } else {
            grid.innerHTML = items.map(item => `
                <div class="wishlist-card" ${item.is_reserved ? 'style="opacity:0.8;"' : ''}>
                    ${item.image_url ? `<img src="${item.image_url}" alt="${escapeHtml(item.title)}" onerror="this.style.display='none'">` : ''}
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(item.description || '')}</p>
                    <div class="wishlist-meta">
                        <span>${item.price ? '₹' + parseFloat(item.price).toFixed(2) : ''}</span>
                        ${item.is_reserved
                            ? `<span class="badge badge-reserved">Reserved</span>`
                            : `<span class="badge badge-available">Available</span>`}
                    </div>
                    ${item.link ? `<a href="${item.link}" target="_blank" class="btn btn-outline btn-small" style="margin-top:0.5rem;width:100%;">View Item</a>` : ''}
                    ${item.reserved_by_me
                        ? `<button class="btn btn-outline btn-small" style="margin-top:0.5rem;width:100%;border-color:#fca5a5;color:#ef4444;" onclick="unreserveItem(${item.id})">Cancel My Reservation</button>`
                        : item.is_reserved
                            ? `<button class="btn btn-outline btn-small" style="margin-top:0.5rem;width:100%;" disabled>Already Reserved</button>`
                            : `<button class="btn btn-primary btn-small" style="margin-top:0.5rem;width:100%;" onclick="reserveItem(${item.id}, this)">🎁 Reserve Gift</button>`}
                </div>
            `).join('');
        }
    } catch (err) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;border-color:#fca5a5;"><p style="color:#ef4444;">${err.message}</p></div>`;
    }
}

window.reserveItem = async (itemId, btn) => {
    if (btn) { btn.disabled = true; btn.textContent = 'Reserving...'; }
    try {
        await apiFetch(`/wishlist/reserve/${itemId}`, { method: 'POST' });
        showToast('Gift reserved for 48 hours! 🎀');
        setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
        showToast(err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🎁 Reserve Gift'; }
    }
};

window.unreserveItem = async (itemId) => {
    try {
        await apiFetch(`/wishlist/unreserve/${itemId}`, { method: 'POST' });
        showToast('Reservation cancelled');
        setTimeout(() => window.location.reload(), 1200);
    } catch (err) { showToast(err.message, 'error'); }
};

// ===================== 4. SETTINGS =====================
async function initSettings() {
    // Load current privacy status
    try {
        const me = await apiFetch('/auth/me');
        const checkbox = document.getElementById('isPrivate');
        if (checkbox) checkbox.checked = !!me.is_private;
    } catch (err) { /* silent */ }

    const privacyForm = document.getElementById('privacyForm');
    if (privacyForm) {
        privacyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const isPrivate = document.getElementById('isPrivate').checked;
            try {
                await apiFetch('/wishlist/privacy', { method: 'POST', body: JSON.stringify({ is_private: isPrivate }) });
                showToast('Privacy settings saved!');
            } catch (err) { showToast(err.message, 'error'); }
        });
    }

    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // We'll use the forgot-password flow via email instead of a direct change
            // For now, a simple alert directing to the forgot-password page
            showToast('Use the Forgot Password link on the login page to change your password securely.');
        });
    }
}

// ===================== 5. MESSAGES =====================
let activeChatFriendId = null;
let msgPollTimer = null;

async function initMessages() {
    await loadConversations();
    // Check if URL has ?friend=ID to auto-open a chat
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friend');
    const friendName = urlParams.get('name');
    if (friendId) openChat(friendId, decodeURIComponent(friendName || 'Friend'));
}

async function loadConversations() {
    const list = document.getElementById('convoList');
    if (!list) return;
    try {
        const convos = await apiFetch('/messages/conversations');
        if (convos.length === 0) {
            list.innerHTML = `<div style="padding:1.5rem; color:var(--text-secondary); font-size:0.9rem; text-align:center;">
                <div style="font-size:2rem;">💬</div>
                <p style="margin-top:0.5rem;">No conversations yet.<br>Go to <a href="friends.html" style="color:var(--accent-hover);">Friends</a> to start chatting!</p>
            </div>`;
        } else {
            list.innerHTML = convos.map(c => `
                <div class="convo-item ${activeChatFriendId == c.id ? 'active' : ''}" onclick="openChat(${c.id}, '${escapeHtml(c.username)}')">
                    <div class="avatar" style="background:var(--gradient-primary); flex-shrink:0;">${c.username.charAt(0).toUpperCase()}</div>
                    <div class="info">
                        <h4>${escapeHtml(c.username)}</h4>
                        <p>${c.last_message ? escapeHtml(c.last_message) : 'Start a conversation!'}</p>
                    </div>
                    ${c.unread_count > 0 ? `<div class="unread-badge">${c.unread_count}</div>` : ''}
                </div>
            `).join('');
        }
    } catch (err) { list.innerHTML = `<p style="padding:1rem; color:#ef4444;">${err.message}</p>`; }
}

window.openChat = async (friendId, friendName) => {
    activeChatFriendId = friendId;
    document.getElementById('noChatSelected').style.display = 'none';
    const chatArea = document.getElementById('activeChatArea');
    chatArea.style.display = 'flex';
    document.getElementById('chatName').textContent = friendName;
    document.getElementById('chatAvatar').textContent = friendName.charAt(0).toUpperCase();
    document.getElementById('viewProfileBtn').href = `profile.html?id=${friendId}&name=${encodeURIComponent(friendName)}`;
    document.querySelectorAll('.convo-item').forEach(el => el.classList.remove('active'));

    await loadMessages(friendId);

    // Setup send button
    const sendBtn = document.getElementById('sendMsgBtn');
    const input = document.getElementById('msgInput');
    sendBtn.onclick = () => sendMessage(friendId);
    input.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(friendId); };
    input.focus();

    // Poll for new messages every 5 seconds
    clearInterval(msgPollTimer);
    msgPollTimer = setInterval(() => loadMessages(friendId, true), 5000);
};

async function loadMessages(friendId, silent = false) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    try {
        const msgs = await apiFetch(`/messages/${friendId}`);
        const me = JSON.parse(localStorage.getItem('wishen_user') || '{}');
        container.innerHTML = msgs.length === 0
            ? `<div style="text-align:center; color:var(--text-secondary); margin:auto;"><div style="font-size:2.5rem;">👋</div><p>Say hello!</p></div>`
            : msgs.map(m => {
                const isMine = m.sender_id === me.id;
                return `<div class="msg-group ${isMine ? 'mine' : 'theirs'}">
                    <div class="msg-bubble ${isMine ? 'mine' : 'theirs'}">${escapeHtml(m.content)}</div>
                    <div class="msg-time">${new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                </div>`;
            }).join('');
        container.scrollTop = container.scrollHeight;
        if (!silent) await loadConversations();
    } catch (err) { if (!silent) showToast(err.message, 'error'); }
}

async function sendMessage(friendId) {
    const input = document.getElementById('msgInput');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try {
        await apiFetch('/messages/send', { method: 'POST', body: JSON.stringify({ receiver_id: friendId, content }) });
        await loadMessages(friendId, true);
        await loadConversations();
    } catch (err) { showToast(err.message, 'error'); input.value = content; }
}

// ===================== 6. TODOS =====================
async function initTodos() {
    await loadTodos();

    const addBtn = document.getElementById('addTodoBtn');
    const input = document.getElementById('todoInput');
    if (addBtn) addBtn.onclick = addTodo;
    if (input)  input.onkeydown = (e) => { if (e.key === 'Enter') addTodo(); };
}

async function loadTodos() {
    try {
        const todos = await apiFetch('/todos');
        const pending = todos.filter(t => !t.is_done);
        const done    = todos.filter(t =>  t.is_done);

        const total = todos.length;
        const doneCount = done.length;
        const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

        const pText = document.getElementById('progressText');
        const pPct  = document.getElementById('progressPercent');
        const pFill = document.getElementById('progressFill');
        if (pText) pText.textContent = `${doneCount} of ${total} tasks completed`;
        if (pPct)  pPct.textContent  = `${pct}%`;
        if (pFill) pFill.style.width = `${pct}%`;

        const emptyEl   = document.getElementById('emptyTodos');
        const pendingSec = document.getElementById('pendingSection');
        const doneSec    = document.getElementById('doneSection');

        if (total === 0) {
            if (emptyEl)   emptyEl.style.display = 'block';
            if (pendingSec) pendingSec.style.display = 'none';
            if (doneSec)    doneSec.style.display = 'none';
            return;
        }
        if (emptyEl)   emptyEl.style.display = 'none';
        if (pendingSec) pendingSec.style.display = pending.length ? 'block' : 'none';
        if (doneSec)    doneSec.style.display   = done.length    ? 'block' : 'none';

        const renderTodo = (t) => `
            <div class="todo-item ${t.is_done ? 'done' : ''}" id="todo-${t.id}">
                <div class="priority-dot ${t.priority || 'normal'}"></div>
                <div class="todo-checkbox ${t.is_done ? 'checked' : ''}" onclick="toggleTodo(${t.id})"></div>
                <span class="todo-title">${escapeHtml(t.title)}</span>
                <button class="todo-delete" onclick="deleteTodo(${t.id})" title="Delete">✕</button>
            </div>`;

        const pendingList = document.getElementById('pendingList');
        const doneList    = document.getElementById('doneList');
        if (pendingList) pendingList.innerHTML = pending.map(renderTodo).join('');
        if (doneList)    doneList.innerHTML    = done.map(renderTodo).join('');
    } catch (err) { showToast(err.message, 'error'); }
}

async function addTodo() {
    const input    = document.getElementById('todoInput');
    const priority = document.getElementById('todoPriority');
    const title    = input ? input.value.trim() : '';
    if (!title) return;
    try {
        await apiFetch('/todos', { method: 'POST', body: JSON.stringify({ title, priority: priority ? priority.value : 'normal' }) });
        input.value = '';
        await loadTodos();
        showToast('Task added! ✅');
    } catch (err) { showToast(err.message, 'error'); }
}

window.toggleTodo = async (id) => {
    try {
        await apiFetch(`/todos/${id}/toggle`, { method: 'PATCH' });
        await loadTodos();
    } catch (err) { showToast(err.message, 'error'); }
};

window.deleteTodo = async (id) => {
    try {
        await apiFetch(`/todos/${id}`, { method: 'DELETE' });
        const el = document.getElementById(`todo-${id}`);
        if (el) { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; setTimeout(() => loadTodos(), 300); }
    } catch (err) { showToast(err.message, 'error'); }
};

// ===================== AUTH FORMS =====================
function setupAuthForms() {
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = registerForm.querySelector('button[type="submit"]');
            btn.disabled = true; btn.textContent = 'Creating account...';
            try {
                await apiFetch('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: document.getElementById('name').value.trim(),
                        email:    document.getElementById('email').value.trim(),
                        password: document.getElementById('password').value
                    })
                });
                showToast('Account created! Redirecting to login...');
                setTimeout(() => window.location.href = 'login.html', 1500);
            } catch (err) {
                showToast(err.message, 'error');
                btn.disabled = false; btn.textContent = 'Create Account';
            }
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('button[type="submit"]');
            btn.disabled = true; btn.textContent = 'Logging in...';
            try {
                const res = await apiFetch('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        identifier: document.getElementById('email').value.trim(),
                        password:   document.getElementById('password').value
                    })
                });
                localStorage.setItem('wishen_token', res.token);
                localStorage.setItem('wishen_user', JSON.stringify(res.user));
                window.location.href = 'dashboard.html';
            } catch (err) {
                showToast(err.message, 'error');
                btn.disabled = false; btn.textContent = 'Log In';
            }
        });
    }

    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = forgotForm.querySelector('button[type="submit"]');
            btn.disabled = true; btn.textContent = 'Sending...';
            try {
                await apiFetch('/auth/forgot-password', {
                    method: 'POST',
                    body: JSON.stringify({ email: document.getElementById('email').value.trim() })
                });
                showToast('If that email exists, a reset link was sent!');
            } catch (err) { showToast(err.message, 'error'); }
            finally { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
        });
    }

    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('new_password').value;
            const confirm     = document.getElementById('confirm_password').value;
            if (newPassword !== confirm) return showToast('Passwords do not match!', 'error');
            const token = new URLSearchParams(window.location.search).get('token');
            if (!token) return showToast('No reset token found in URL.', 'error');

            const btn = resetForm.querySelector('button[type="submit"]');
            btn.disabled = true; btn.textContent = 'Resetting...';
            try {
                await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
                showToast('Password reset! Redirecting to login...');
                setTimeout(() => window.location.href = 'login.html', 1500);
            } catch (err) {
                showToast(err.message, 'error');
                btn.disabled = false; btn.textContent = 'Reset Password';
            }
        });
    }
}

// ===================== MODALS & UI =====================
function setupModals() {
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
    });
    document.addEventListener('click', (e) => {
        if (e.target.id === 'logoutBtn' || (e.target.closest && e.target.closest('#logoutBtn'))) {
            e.preventDefault();
            logout();
        }
    });
}

// ===================== HELPERS =====================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
