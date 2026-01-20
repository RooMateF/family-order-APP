// ===== Firebase 設定 =====
const firebaseConfig = {
    apiKey: "AIzaSyCftNjFmb347SXmukXRiFhrEea0rxduI64",
    authDomain: "family-order-app.firebaseapp.com",
    projectId: "family-order-app",
    storageBucket: "family-order-app.firebasestorage.app",
    messagingSenderId: "172416471032",
    appId: "1:172416471032:web:f16a0e0d82b1519f63500d"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ===== Gemini API =====
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';

// ===== 家庭成員 =====
const familyGroups = [
    { id: 'grandparents', name: '阿公阿嬤', members: ['陳惠舜', '林貞惠'] },
    { id: 'family1', name: '世松家', members: ['陳世松', '張秋蓮', '陳昱臻', '陳昱瑋'] },
    { id: 'family2', name: '世賓家', members: ['陳世賓', '鄭瑩', '陳昱婕', '陳宇'] },
    { id: 'family3', name: '慶龍家', members: ['江慶龍', '陳怡君', '江柏宏', '江冠宏'] },
    { id: 'family4', name: '朝慶家', members: ['陳朝慶', '陳一辰', '陳奕豪'] }
];

const ADMIN_PASSWORD = 'family2025';
const SUPER_ADMIN_PASSWORD = 'superadmin2025';

// ===== 全域變數 =====
let currentGatheringId = null;
let currentGatheringData = null;
let currentMenuData = null;
let unsubscribe = null;
let expandedGroups = new Set();
let isSuperAdmin = false;
let forcedWheelResult = null;
let wheelOptions = [];
let deleteTargetId = null;
let deleteType = 'gathering';
let menus = [];
let currentEditMenuId = null;
let editMenuItems = [];
let activeSuggestionInput = null;

const wheelColors = ['#4a5568', '#8b7355', '#6b8e5f', '#a0522d', '#708090', '#5d6d7e', '#7d6544', '#5a7a50', '#6a7b8c', '#7a6b5c'];

// ===== DOM =====
const screens = {
    home: document.getElementById('home-screen'),
    gathering: document.getElementById('gathering-screen'),
    admin: document.getElementById('admin-screen'),
    superAdmin: document.getElementById('super-admin-screen'),
    menu: document.getElementById('menu-screen'),
    menuEdit: document.getElementById('menu-edit-screen')
};
const modals = {
    create: document.getElementById('create-modal'),
    delete: document.getElementById('delete-modal'),
    admin: document.getElementById('admin-modal'),
    superAdmin: document.getElementById('super-admin-modal'),
    summary: document.getElementById('summary-modal')
};

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}
function showModal(name) { modals[name].classList.add('active'); }
function hideModal(name) { modals[name].classList.remove('active'); }

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    loadGatherings();
    loadWheelOptions();
    loadMenus();
    setupEventListeners();
});

function setupEventListeners() {
    // 建立聚餐
    document.getElementById('create-gathering-btn').addEventListener('click', () => {
        document.getElementById('gathering-date').valueAsDate = new Date();
        updateMenuSelect();
        showModal('create');
    });
    document.getElementById('cancel-create').addEventListener('click', () => hideModal('create'));
    document.getElementById('create-form').addEventListener('submit', createGathering);
    
    // 刪除
    document.getElementById('cancel-delete').addEventListener('click', () => hideModal('delete'));
    document.getElementById('confirm-delete').addEventListener('click', confirmDelete);
    
    // 管理員
    document.getElementById('admin-btn').addEventListener('click', () => showModal('admin'));
    document.getElementById('cancel-admin').addEventListener('click', () => hideModal('admin'));
    document.getElementById('admin-form').addEventListener('submit', adminLogin);
    document.getElementById('admin-back-to-home').addEventListener('click', () => showScreen('home'));
    
    // 超級管理員
    document.getElementById('cancel-super-admin').addEventListener('click', () => hideModal('superAdmin'));
    document.getElementById('super-admin-form').addEventListener('submit', superAdminLogin);
    document.getElementById('super-admin-back').addEventListener('click', () => { isSuperAdmin = false; showScreen('home'); });
    document.getElementById('set-forced-result').addEventListener('click', setForcedResult);
    document.getElementById('clear-forced-result').addEventListener('click', clearForcedResult);
    
    // 聚餐詳情
    document.getElementById('back-to-home').addEventListener('click', () => {
        if (unsubscribe) unsubscribe();
        expandedGroups.clear();
        showScreen('home');
        loadGatherings();
    });
    document.getElementById('close-order-btn').addEventListener('click', toggleOrderStatus);
    document.getElementById('summarize-btn').addEventListener('click', () => summarizeOrders(false));
    document.getElementById('close-summary').addEventListener('click', () => hideModal('summary'));
    document.getElementById('copy-summary').addEventListener('click', copySummary);
    document.getElementById('ai-summarize-btn').addEventListener('click', () => summarizeOrders(true));
    
    // 輪盤
    document.getElementById('add-wheel-option').addEventListener('click', addWheelOption);
    document.getElementById('wheel-new-option').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addWheelOption(); } });
    document.getElementById('spin-wheel-btn').addEventListener('click', spinWheel);
    
    // 菜單管理
    document.getElementById('menu-manage-btn').addEventListener('click', () => { showScreen('menu'); renderMenuList(); });
    document.getElementById('menu-back').addEventListener('click', () => showScreen('home'));
    document.getElementById('create-menu-btn').addEventListener('click', () => openMenuEditor(null));
    document.getElementById('menu-edit-back').addEventListener('click', () => { showScreen('menu'); renderMenuList(); });
    document.getElementById('add-menu-item').addEventListener('click', addMenuItem);
    document.getElementById('new-item-name').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMenuItem(); } });
    document.getElementById('save-menu-btn').addEventListener('click', saveMenu);
    
    // Modal 外部點擊
    Object.values(modals).forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    });
    
    // 隱藏超級管理員
    let clicks = 0, timer = null;
    document.querySelector('.app-title').addEventListener('click', () => {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(() => clicks = 0, 2000);
        if (clicks >= 5) { clicks = 0; showModal('superAdmin'); }
    });
    
    // 關閉菜單提示
    document.addEventListener('click', (e) => {
        const suggestions = document.getElementById('menu-suggestions');
        if (!e.target.classList.contains('order-input')) {
            suggestions.classList.remove('show');
        }
    });
}

// ===== 聚餐列表 =====
async function loadGatherings() {
    const listEl = document.getElementById('gathering-list');
    try {
        const snapshot = await db.collection('gatherings').where('status', '==', 'active').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            listEl.innerHTML = '<p class="empty-message">目前沒有進行中的聚餐<br><span>點擊上方按鈕建立一個吧</span></p>';
            return;
        }
        listEl.innerHTML = '';
        snapshot.forEach(doc => listEl.appendChild(createGatheringCard(doc.id, doc.data(), false)));
    } catch (error) {
        console.error('載入失敗:', error);
        listEl.innerHTML = '<p class="empty-message">載入失敗，請重新整理</p>';
    }
}

function createGatheringCard(id, data, isAdmin) {
    const card = document.createElement('div');
    card.className = 'gathering-card';
    const attending = countAttending(data.attendees || {});
    const { count: orderCount, total: totalPrice } = countOrdersAndPrice(data.orders || {});
    const isClosed = data.orderStatus === 'closed';
    
    let actionsHtml = '';
    if (isAdmin) {
        actionsHtml = `
            <div class="gathering-card-actions">
                <button class="btn btn-small btn-ghost" onclick="event.stopPropagation(); toggleGatheringStatus('${id}', '${data.status}')">${data.status === 'active' ? '封存' : '恢復'}</button>
                <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); requestDelete('${id}', 'gathering')">刪除</button>
            </div>`;
    }
    
    card.innerHTML = `
        <div class="gathering-card-header">
            <div class="gathering-card-title">${data.name}</div>
            ${isClosed ? '<span class="status-badge closed">已結單</span>' : ''}
        </div>
        <div class="gathering-card-info">${data.date}${data.restaurant ? ' · ' + data.restaurant : ''}</div>
        <div class="gathering-card-stats">
            <span>${attending} 人參加</span>
            <span>${orderCount} 份餐點</span>
            ${totalPrice > 0 ? `<span>$${totalPrice}</span>` : ''}
        </div>
        ${actionsHtml}
    `;
    card.addEventListener('click', () => openGathering(id));
    return card;
}

function requestDelete(id, type) {
    deleteTargetId = id;
    deleteType = type;
    showModal('delete');
}

async function confirmDelete() {
    if (!deleteTargetId) return;
    try {
        if (deleteType === 'gathering') {
            await db.collection('gatherings').doc(deleteTargetId).delete();
        } else if (deleteType === 'menu') {
            menus = menus.filter(m => m.id !== deleteTargetId);
            localStorage.setItem('familyMenus', JSON.stringify(menus));
            renderMenuList();
        }
        hideModal('delete');
        deleteTargetId = null;
        loadGatherings();
        if (screens.admin.classList.contains('active')) loadAdminGatherings();
        if (screens.superAdmin.classList.contains('active')) loadSuperAdminGatherings();
    } catch (e) { console.error('刪除失敗:', e); }
}

async function createGathering(e) {
    e.preventDefault();
    const name = document.getElementById('gathering-name').value.trim();
    const date = document.getElementById('gathering-date').value;
    const restaurant = document.getElementById('gathering-restaurant').value.trim();
    const menuId = document.getElementById('gathering-menu').value;
    
    if (!name || !date) return alert('請填寫聚餐名稱和日期');
    
    try {
        await db.collection('gatherings').add({
            name, date, restaurant, menuId,
            status: 'active', orderStatus: 'open',
            attendees: {}, orders: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        hideModal('create');
        document.getElementById('create-form').reset();
        loadGatherings();
    } catch (e) { console.error('建立失敗:', e); alert('建立失敗'); }
}

// ===== 聚餐詳情 =====
function openGathering(id) {
    currentGatheringId = id;
    showScreen('gathering');
    unsubscribe = db.collection('gatherings').doc(id).onSnapshot(doc => {
        if (!doc.exists) { alert('聚餐不存在'); showScreen('home'); return; }
        currentGatheringData = doc.data();
        // 載入對應菜單
        if (currentGatheringData.menuId) {
            currentMenuData = menus.find(m => m.id === currentGatheringData.menuId) || null;
        } else {
            currentMenuData = null;
        }
        renderGatheringDetail(currentGatheringData);
    });
}

function renderGatheringDetail(data) {
    document.getElementById('gathering-title').textContent = data.name;
    document.getElementById('gathering-info').textContent = `${data.date}${data.restaurant ? ' · ' + data.restaurant : ''}`;
    
    const menuInfo = document.getElementById('gathering-menu-info');
    if (currentMenuData) {
        menuInfo.textContent = `使用菜單：${currentMenuData.name}`;
        menuInfo.style.display = 'block';
    } else {
        menuInfo.style.display = 'none';
    }
    
    const statusEl = document.getElementById('gathering-status');
    const isClosed = data.orderStatus === 'closed';
    statusEl.textContent = isClosed ? '已結單' : '點餐中';
    statusEl.className = 'status-badge ' + (isClosed ? 'closed' : 'ordering');
    
    document.getElementById('close-order-btn').textContent = isClosed ? '重新開放' : '結束點餐';
    
    const { count: orderCount, total: totalPrice } = countOrdersAndPrice(data.orders || {});
    document.getElementById('total-attending').textContent = countAttending(data.attendees || {});
    document.getElementById('total-ordered').textContent = orderCount;
    document.getElementById('total-price').textContent = '$' + totalPrice;
    
    renderFamilyGroups(data.attendees || {}, data.orders || {}, isClosed);
}

function renderFamilyGroups(attendees, orders, isClosed) {
    const container = document.getElementById('family-groups');
    container.innerHTML = '';
    const canEdit = !isClosed || isSuperAdmin;
    
    familyGroups.forEach(group => {
        const el = document.createElement('div');
        el.className = 'family-group' + (expandedGroups.has(group.id) ? ' expanded' : '');
        el.id = `group-${group.id}`;
        
        const count = group.members.filter(m => attendees[m]).length;
        let groupTotal = 0;
        group.members.forEach(m => {
            const memberOrders = orders[m] || [];
            memberOrders.forEach(o => { if (o && o.price) groupTotal += parseInt(o.price) || 0; });
        });
        
        el.innerHTML = `
            <div class="group-header" onclick="toggleGroup('${group.id}')">
                <div>
                    <span class="group-title">${group.name}</span>
                    <span class="group-count">（${count}/${group.members.length}）</span>
                </div>
                <span class="group-toggle">▼</span>
            </div>
            <div class="group-content">
                ${group.members.map(m => renderMember(m, attendees, orders, canEdit)).join('')}
                ${groupTotal > 0 ? `<div class="group-total">小計：$${groupTotal}</div>` : ''}
            </div>
        `;
        container.appendChild(el);
    });
}

function renderMember(member, attendees, orders, canEdit) {
    const attending = attendees[member] || false;
    const memberOrders = orders[member] || [];
    const display = memberOrders.length > 0 ? memberOrders : [{ name: '', price: '' }];
    
    let memberTotal = 0;
    memberOrders.forEach(o => { if (o && o.price) memberTotal += parseInt(o.price) || 0; });
    
    return `
        <div class="member-item" data-member="${member}">
            <div class="member-row">
                <input type="checkbox" class="member-checkbox" ${attending ? 'checked' : ''} ${canEdit ? '' : 'disabled'}
                    onchange="updateAttendance('${member}', this.checked)">
                <span class="member-name">${member}</span>
                <span class="member-status ${attending ? '' : 'not-attending'}">${attending ? '參加' : '未參加'}</span>
                ${memberTotal > 0 ? `<span class="member-total">$${memberTotal}</span>` : ''}
            </div>
            <div class="orders-container">
                ${display.map((o, i) => `
                    <div class="order-item">
                        <div class="order-input-wrapper">
                            <input type="text" class="order-input" placeholder="輸入餐點..." 
                                value="${o.name || ''}"
                                ${attending && canEdit ? '' : 'disabled'} 
                                data-member="${member}" data-index="${i}"
                                oninput="showMenuSuggestions(this)"
                                onchange="updateSingleOrder('${member}', ${i}, 'name', this.value)"
                                onfocus="showMenuSuggestions(this)">
                        </div>
                        <input type="number" class="order-price" placeholder="$" 
                            value="${o.price || ''}"
                            ${attending && canEdit ? '' : 'disabled'}
                            data-member="${member}" data-index="${i}"
                            onchange="updateSingleOrder('${member}', ${i}, 'price', this.value)">
                        ${display.length > 1 ? `<button class="btn-remove-order" onclick="removeOrder('${member}', ${i})" ${canEdit ? '' : 'disabled'}>×</button>` : ''}
                    </div>
                `).join('')}
                <button class="btn-add-order" onclick="addOrder('${member}')" ${attending && canEdit ? '' : 'disabled'}>+ 新增餐點</button>
            </div>
        </div>
    `;
}

function toggleGroup(id) {
    const el = document.getElementById(`group-${id}`);
    el.classList.toggle('expanded');
    expandedGroups.has(id) ? expandedGroups.delete(id) : expandedGroups.add(id);
}

// ===== 菜單提示 =====
function showMenuSuggestions(input) {
    const suggestions = document.getElementById('menu-suggestions');
    const value = input.value.trim().toLowerCase();
    
    if (!currentMenuData || !currentMenuData.items || value.length === 0) {
        suggestions.classList.remove('show');
        return;
    }
    
    const matches = currentMenuData.items.filter(item => 
        item.name.toLowerCase().includes(value)
    );
    
    if (matches.length === 0) {
        suggestions.classList.remove('show');
        return;
    }
    
    activeSuggestionInput = input;
    const rect = input.getBoundingClientRect();
    suggestions.style.top = (rect.bottom + 4) + 'px';
    suggestions.style.left = rect.left + 'px';
    suggestions.style.width = rect.width + 'px';
    
    suggestions.innerHTML = matches.slice(0, 8).map(item => `
        <div class="menu-suggestion-item" onclick="selectSuggestion('${item.name}', ${item.price || 0})">
            <span>${item.name}</span>
            ${item.price ? `<span class="menu-suggestion-price">$${item.price}</span>` : ''}
        </div>
    `).join('');
    
    suggestions.classList.add('show');
}

function selectSuggestion(name, price) {
    if (!activeSuggestionInput) return;
    
    const member = activeSuggestionInput.dataset.member;
    const index = parseInt(activeSuggestionInput.dataset.index);
    
    activeSuggestionInput.value = name;
    
    // 更新價格欄位
    const priceInput = document.querySelector(`.order-price[data-member="${member}"][data-index="${index}"]`);
    if (priceInput && price) {
        priceInput.value = price;
    }
    
    // 儲存到資料庫
    updateSingleOrder(member, index, 'name', name);
    if (price) updateSingleOrder(member, index, 'price', price);
    
    document.getElementById('menu-suggestions').classList.remove('show');
    activeSuggestionInput = null;
}

// ===== 資料操作 =====
async function updateAttendance(member, attending) {
    if (!currentGatheringId) return;
    const updates = { [`attendees.${member}`]: attending };
    if (!attending) {
        updates[`orders.${member}`] = firebase.firestore.FieldValue.delete();
    } else {
        updates[`orders.${member}`] = [{ name: '', price: '' }];
    }
    await db.collection('gatherings').doc(currentGatheringId).update(updates);
}

async function updateSingleOrder(member, index, field, value) {
    if (!currentGatheringId) return;
    const doc = await db.collection('gatherings').doc(currentGatheringId).get();
    const orders = doc.data().orders || {};
    const arr = orders[member] || [{ name: '', price: '' }];
    
    if (!arr[index]) arr[index] = { name: '', price: '' };
    arr[index][field] = field === 'price' ? (value ? parseInt(value) : '') : value.trim();
    
    await db.collection('gatherings').doc(currentGatheringId).update({ [`orders.${member}`]: arr });
}

async function addOrder(member) {
    if (!currentGatheringId) return;
    const doc = await db.collection('gatherings').doc(currentGatheringId).get();
    const arr = doc.data().orders?.[member] || [];
    arr.push({ name: '', price: '' });
    await db.collection('gatherings').doc(currentGatheringId).update({ [`orders.${member}`]: arr });
}

async function removeOrder(member, index) {
    if (!currentGatheringId) return;
    const doc = await db.collection('gatherings').doc(currentGatheringId).get();
    const arr = doc.data().orders?.[member] || [];
    arr.splice(index, 1);
    if (arr.length === 0) arr.push({ name: '', price: '' });
    await db.collection('gatherings').doc(currentGatheringId).update({ [`orders.${member}`]: arr });
}

async function toggleOrderStatus() {
    if (!currentGatheringId || !currentGatheringData) return;
    const newStatus = currentGatheringData.orderStatus === 'closed' ? 'open' : 'closed';
    await db.collection('gatherings').doc(currentGatheringId).update({ orderStatus: newStatus });
}

function countAttending(a) { return Object.values(a).filter(v => v).length; }

function countOrdersAndPrice(orders) {
    let count = 0, total = 0;
    Object.values(orders).forEach(arr => {
        if (Array.isArray(arr)) {
            arr.forEach(o => {
                if (o && o.name && o.name.trim()) {
                    count++;
                    if (o.price) total += parseInt(o.price) || 0;
                }
            });
        }
    });
    return { count, total };
}

// ===== 統計 =====
async function summarizeOrders(useAI) {
    const data = currentGatheringData;
    if (!data) return;
    const orders = data.orders || {};
    const attendees = data.attendees || {};
    
    const allItems = [];
    const memberDetails = [];
    const familyTotals = {};
    
    familyGroups.forEach(g => {
        familyTotals[g.name] = 0;
        g.members.forEach(member => {
            if (!attendees[member]) return;
            const arr = orders[member] || [];
            const validOrders = arr.filter(o => o && o.name && o.name.trim());
            let memberTotal = 0;
            
            validOrders.forEach(o => {
                allItems.push({ name: o.name.trim(), price: o.price || 0 });
                if (o.price) memberTotal += parseInt(o.price) || 0;
            });
            
            if (validOrders.length > 0) {
                memberDetails.push({ member, orders: validOrders, total: memberTotal, family: g.name });
                familyTotals[g.name] += memberTotal;
            }
        });
    });
    
    let grouped;
    if (useAI && GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE') {
        grouped = await summarizeWithAI(allItems);
    } else {
        grouped = simpleSummarize(allItems);
    }
    
    renderSummary(grouped, memberDetails, familyTotals, useAI);
    showModal('summary');
}

function simpleSummarize(items) {
    const map = {};
    items.forEach(item => {
        const key = item.name;
        if (!map[key]) map[key] = { count: 0, totalPrice: 0 };
        map[key].count++;
        map[key].totalPrice += parseInt(item.price) || 0;
    });
    return Object.entries(map).map(([name, data]) => ({ name, count: data.count, totalPrice: data.totalPrice })).sort((a, b) => b.count - a.count);
}

async function summarizeWithAI(items) {
    if (items.length === 0) return [];
    
    const itemList = items.map(i => i.name).join('\n');
    const prompt = `你是餐點整理助手。請將以下餐點清單整理並合併相似項目（例如「青醬雞肉燉飯」和「雞肉青醬燉飯」應合併）。
請直接回傳 JSON，格式：[{"name": "統一後的餐點名稱", "originalNames": ["原始名稱1", "原始名稱2"]}]
只回傳 JSON，不要其他文字。

餐點清單：
${itemList}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
            const aiResult = JSON.parse(jsonMatch[0]);
            // 合併結果
            const merged = aiResult.map(item => {
                let count = 0, totalPrice = 0;
                const originals = item.originalNames || [item.name];
                items.forEach(i => {
                    if (originals.some(o => o.toLowerCase() === i.name.toLowerCase()) || i.name === item.name) {
                        count++;
                        totalPrice += parseInt(i.price) || 0;
                    }
                });
                return { name: item.name, count, totalPrice };
            });
            return merged.filter(m => m.count > 0).sort((a, b) => b.count - a.count);
        }
    } catch (e) { console.error('AI 統計失敗:', e); }
    
    return simpleSummarize(items);
}

function renderSummary(grouped, memberDetails, familyTotals, usedAI) {
    const container = document.getElementById('summary-content');
    const grandTotal = Object.values(familyTotals).reduce((a, b) => a + b, 0);
    
    if (grouped.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#9a9285;padding:20px;">尚無餐點資料</p>';
        return;
    }
    
    let html = `<div class="summary-section"><h3>餐點統計${usedAI ? '（AI 整理）' : ''}</h3>`;
    grouped.forEach(i => {
        html += `<div class="summary-item">
            <span class="summary-item-name">${i.name}</span>
            <div>
                <span class="summary-item-count">x ${i.count}</span>
                ${i.totalPrice > 0 ? `<span class="summary-item-price">$${i.totalPrice}</span>` : ''}
            </div>
        </div>`;
    });
    html += `<div class="summary-total">共 ${grouped.reduce((s, i) => s + i.count, 0)} 份${grandTotal > 0 ? `，總計 $${grandTotal}` : ''}</div></div>`;
    
    // 各家庭小計
    html += '<div class="summary-section"><h3>各家庭金額</h3>';
    Object.entries(familyTotals).forEach(([name, total]) => {
        if (total > 0) {
            html += `<div class="summary-item"><span class="summary-item-name">${name}</span><span class="summary-item-price">$${total}</span></div>`;
        }
    });
    html += '</div>';
    
    // 個人明細
    html += '<div class="summary-section"><h3>個人明細</h3>';
    memberDetails.forEach(d => {
        const items = d.orders.map(o => o.name + (o.price ? `($${o.price})` : '')).join('、');
        html += `<div class="summary-item">
            <span class="summary-item-name">${d.member}</span>
            <span style="color:#6b655a;font-size:0.85rem;">${items}${d.total > 0 ? ` = $${d.total}` : ''}</span>
        </div>`;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

function copySummary() {
    const data = currentGatheringData;
    if (!data) return;
    const orders = data.orders || {};
    const attendees = data.attendees || {};
    
    const items = [];
    let grandTotal = 0;
    Object.entries(orders).forEach(([m, arr]) => {
        if (attendees[m] && Array.isArray(arr)) {
            arr.filter(o => o && o.name && o.name.trim()).forEach(o => {
                items.push(o.name.trim());
                grandTotal += parseInt(o.price) || 0;
            });
        }
    });
    
    const grouped = simpleSummarize(items.map(name => ({ name, price: 0 })));
    let text = `${data.name}\n${data.date}${data.restaurant ? ' · ' + data.restaurant : ''}\n\n餐點統計：\n`;
    grouped.forEach(i => text += `- ${i.name} x ${i.count}\n`);
    text += `\n共 ${grouped.reduce((s, i) => s + i.count, 0)} 份`;
    if (grandTotal > 0) text += `，總計 $${grandTotal}`;
    
    navigator.clipboard.writeText(text).then(() => alert('已複製')).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); alert('已複製');
    });
}

// ===== 輪盤 (Canvas 重繪) =====
function loadWheelOptions() {
    const saved = localStorage.getItem('wheelOptions');
    wheelOptions = saved ? JSON.parse(saved) : [];
    renderWheelOptions();
    drawWheel();
}

function saveWheelOptions() {
    localStorage.setItem('wheelOptions', JSON.stringify(wheelOptions));
}

function renderWheelOptions() {
    const list = document.getElementById('wheel-options-list');
    list.innerHTML = wheelOptions.map((opt, i) => `
        <span class="wheel-option-tag">${opt}<button class="wheel-option-remove" onclick="removeWheelOption(${i})">×</button></span>
    `).join('');
}

function addWheelOption() {
    const input = document.getElementById('wheel-new-option');
    const val = input.value.trim();
    if (!val) return;
    wheelOptions.push(val);
    saveWheelOptions();
    renderWheelOptions();
    drawWheel();
    input.value = '';
}

function removeWheelOption(i) {
    wheelOptions.splice(i, 1);
    saveWheelOptions();
    renderWheelOptions();
    drawWheel();
}

function drawWheel(rotation = 0) {
    const canvas = document.getElementById('wheel-canvas');
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 5;
    
    ctx.clearRect(0, 0, size, size);
    
    if (wheelOptions.length === 0) {
        ctx.fillStyle = '#ede8df';
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9a9285';
        ctx.font = '14px "Noto Serif TC"';
        ctx.textAlign = 'center';
        ctx.fillText('請新增選項', center, center);
        return;
    }
    
    const n = wheelOptions.length;
    const arc = (Math.PI * 2) / n;
    
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(rotation);
    
    for (let i = 0; i < n; i++) {
        const angle = i * arc - Math.PI / 2;
        
        // 扇形
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, angle, angle + arc);
        ctx.closePath();
        ctx.fillStyle = wheelColors[i % wheelColors.length];
        ctx.fill();
        ctx.strokeStyle = '#fdfcfa';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 文字
        ctx.save();
        ctx.rotate(angle + arc / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fdfcfa';
        ctx.font = '500 13px "Noto Serif TC"';
        const text = wheelOptions[i].length > 8 ? wheelOptions[i].slice(0, 8) + '...' : wheelOptions[i];
        ctx.fillText(text, radius - 15, 5);
        ctx.restore();
    }
    
    ctx.restore();
    
    // 中心圓
    ctx.beginPath();
    ctx.arc(center, center, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#fdfcfa';
    ctx.fill();
    ctx.strokeStyle = '#b8ad9a';
    ctx.lineWidth = 3;
    ctx.stroke();
}

let wheelAngle = 0;
let wheelSpinning = false;

function spinWheel() {
    if (wheelOptions.length < 2) return alert('請至少新增 2 個選項');
    if (wheelSpinning) return;
    
    wheelSpinning = true;
    const result = document.getElementById('wheel-result');
    result.classList.remove('show');
    
    let winIndex;
    if (forcedWheelResult) {
        winIndex = wheelOptions.findIndex(o => o === forcedWheelResult);
        if (winIndex === -1) winIndex = Math.floor(Math.random() * wheelOptions.length);
    } else {
        winIndex = Math.floor(Math.random() * wheelOptions.length);
    }
    
    const n = wheelOptions.length;
    const arc = (Math.PI * 2) / n;
    // 指針在頂部（-90度），計算要讓 winIndex 對準頂部
    const targetAngle = -winIndex * arc - arc / 2;
    const spins = 5 * Math.PI * 2; // 5 圈
    const totalRotation = spins + targetAngle - (wheelAngle % (Math.PI * 2));
    
    const startAngle = wheelAngle;
    const startTime = Date.now();
    const duration = 4000;
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease out
        const eased = 1 - Math.pow(1 - progress, 3);
        wheelAngle = startAngle + totalRotation * eased;
        drawWheel(wheelAngle);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            wheelSpinning = false;
            result.textContent = `結果：${wheelOptions[winIndex]}`;
            result.classList.add('show');
        }
    }
    
    animate();
}

function setForcedResult() {
    const val = document.getElementById('forced-wheel-result').value.trim();
    if (!val) return;
    forcedWheelResult = val;
    document.getElementById('forced-result-status').textContent = `已設定：${val}`;
}

function clearForcedResult() {
    forcedWheelResult = null;
    document.getElementById('forced-wheel-result').value = '';
    document.getElementById('forced-result-status').textContent = '已清除';
}

// ===== 菜單管理 =====
function loadMenus() {
    const saved = localStorage.getItem('familyMenus');
    menus = saved ? JSON.parse(saved) : [];
}

function saveMenus() {
    localStorage.setItem('familyMenus', JSON.stringify(menus));
}

function updateMenuSelect() {
    const select = document.getElementById('gathering-menu');
    select.innerHTML = '<option value="">不使用菜單</option>' + 
        menus.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
}

function renderMenuList() {
    const list = document.getElementById('menu-list');
    if (menus.length === 0) {
        list.innerHTML = '<p class="empty-message">尚無菜單<br><span>點擊上方按鈕建立</span></p>';
        return;
    }
    
    list.innerHTML = menus.map(m => `
        <div class="menu-card">
            <div class="menu-card-title">${m.name}</div>
            <div class="menu-card-info">${m.items ? m.items.length : 0} 個品項</div>
            <div class="menu-card-actions">
                <button class="btn btn-small btn-secondary" onclick="openMenuEditor('${m.id}')">編輯</button>
                <button class="btn btn-small btn-danger" onclick="requestDelete('${m.id}', 'menu')">刪除</button>
            </div>
        </div>
    `).join('');
}

function openMenuEditor(menuId) {
    currentEditMenuId = menuId;
    
    if (menuId) {
        const menu = menus.find(m => m.id === menuId);
        document.getElementById('menu-edit-title').textContent = '編輯菜單';
        document.getElementById('menu-name-input').value = menu.name;
        editMenuItems = [...(menu.items || [])];
    } else {
        document.getElementById('menu-edit-title').textContent = '建立菜單';
        document.getElementById('menu-name-input').value = '';
        editMenuItems = [];
    }
    
    renderEditMenuItems();
    showScreen('menuEdit');
}

function renderEditMenuItems() {
    const list = document.getElementById('menu-items-list');
    if (editMenuItems.length === 0) {
        list.innerHTML = '<p style="color:#9a9285;text-align:center;padding:20px;">尚無品項</p>';
        return;
    }
    
    list.innerHTML = editMenuItems.map((item, i) => `
        <div class="menu-item-row">
            <span class="menu-item-name">${item.name}</span>
            <span class="menu-item-price">${item.price ? '$' + item.price : '-'}</span>
            <button class="btn-remove-order" onclick="removeEditMenuItem(${i})">×</button>
        </div>
    `).join('');
}

function addMenuItem() {
    const nameInput = document.getElementById('new-item-name');
    const priceInput = document.getElementById('new-item-price');
    const name = nameInput.value.trim();
    const price = priceInput.value ? parseInt(priceInput.value) : null;
    
    if (!name) return;
    
    editMenuItems.push({ name, price });
    renderEditMenuItems();
    nameInput.value = '';
    priceInput.value = '';
    nameInput.focus();
}

function removeEditMenuItem(index) {
    editMenuItems.splice(index, 1);
    renderEditMenuItems();
}

function saveMenu() {
    const name = document.getElementById('menu-name-input').value.trim();
    if (!name) return alert('請輸入菜單名稱');
    
    if (currentEditMenuId) {
        const index = menus.findIndex(m => m.id === currentEditMenuId);
        if (index !== -1) {
            menus[index].name = name;
            menus[index].items = editMenuItems;
        }
    } else {
        menus.push({
            id: 'menu_' + Date.now(),
            name,
            items: editMenuItems
        });
    }
    
    saveMenus();
    showScreen('menu');
    renderMenuList();
}

// ===== 管理員 =====
function adminLogin(e) {
    e.preventDefault();
    const pw = document.getElementById('admin-password').value;
    if (pw === ADMIN_PASSWORD) {
        hideModal('admin');
        document.getElementById('admin-password').value = '';
        showScreen('admin');
        loadAdminGatherings();
    } else { alert('密碼錯誤'); }
}

function superAdminLogin(e) {
    e.preventDefault();
    const pw = document.getElementById('super-admin-password').value;
    if (pw === SUPER_ADMIN_PASSWORD) {
        isSuperAdmin = true;
        hideModal('superAdmin');
        document.getElementById('super-admin-password').value = '';
        showScreen('superAdmin');
        loadSuperAdminGatherings();
    } else { alert('密碼錯誤'); }
}

async function loadAdminGatherings() {
    const list = document.getElementById('admin-gathering-list');
    try {
        const snap = await db.collection('gatherings').orderBy('createdAt', 'desc').get();
        if (snap.empty) { list.innerHTML = '<p class="empty-message">沒有聚餐紀錄</p>'; return; }
        list.innerHTML = '';
        snap.forEach(doc => list.appendChild(createGatheringCard(doc.id, doc.data(), true)));
    } catch (e) { console.error(e); }
}

async function loadSuperAdminGatherings() {
    const list = document.getElementById('super-admin-gathering-list');
    try {
        const snap = await db.collection('gatherings').orderBy('createdAt', 'desc').get();
        if (snap.empty) { list.innerHTML = '<p class="empty-message">沒有聚餐紀錄</p>'; return; }
        list.innerHTML = '';
        snap.forEach(doc => {
            const card = createGatheringCard(doc.id, doc.data(), true);
            list.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

async function toggleGatheringStatus(id, status) {
    await db.collection('gatherings').doc(id).update({ status: status === 'active' ? 'archived' : 'active' });
    loadAdminGatherings();
    loadSuperAdminGatherings();
    loadGatherings();
}

// ===== 全域函式 =====
window.toggleGroup = toggleGroup;
window.updateAttendance = updateAttendance;
window.updateSingleOrder = updateSingleOrder;
window.addOrder = addOrder;
window.removeOrder = removeOrder;
window.removeWheelOption = removeWheelOption;
window.toggleGatheringStatus = toggleGatheringStatus;
window.requestDelete = requestDelete;
window.openMenuEditor = openMenuEditor;
window.removeEditMenuItem = removeEditMenuItem;
window.showMenuSuggestions = showMenuSuggestions;
window.selectSuggestion = selectSuggestion;
