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

// ===== 家庭成員 - 使用英文 ID =====
const familyGroups = [
    { id: 'grandparents', name: '阿公阿嬤', members: [
        { id: 'm01', name: '陳惠舜' },
        { id: 'm02', name: '林貞惠' }
    ]},
    { id: 'family1', name: '世松家', members: [
        { id: 'm03', name: '陳世松' },
        { id: 'm04', name: '張秋蓮' },
        { id: 'm05', name: '陳昱臻' },
        { id: 'm06', name: '陳昱瑋' }
    ]},
    { id: 'family2', name: '世賓家', members: [
        { id: 'm07', name: '陳世賓' },
        { id: 'm08', name: '鄭瑩' },
        { id: 'm09', name: '陳昱婕' },
        { id: 'm10', name: '陳宇' }
    ]},
    { id: 'family3', name: '慶龍家', members: [
        { id: 'm11', name: '江慶龍' },
        { id: 'm12', name: '陳怡君' },
        { id: 'm13', name: '江柏宏' },
        { id: 'm14', name: '江冠宏' }
    ]},
    { id: 'family4', name: '朝慶家', members: [
        { id: 'm15', name: '陳朝慶' },
        { id: 'm16', name: '陳一辰' },
        { id: 'm17', name: '陳奕豪' }
    ]}
];

// 建立快速查詢表
const memberById = {};
const memberNameById = {};
familyGroups.forEach(g => {
    g.members.forEach(m => {
        memberById[m.id] = m;
        memberNameById[m.id] = m.name;
    });
});

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
    Object.values(screens).forEach(s => s && s.classList.remove('active'));
    screens[name] && screens[name].classList.add('active');
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
    document.getElementById('create-gathering-btn').addEventListener('click', () => {
        document.getElementById('gathering-date').valueAsDate = new Date();
        updateMenuSelect();
        showModal('create');
    });
    document.getElementById('cancel-create').addEventListener('click', () => hideModal('create'));
    document.getElementById('create-form').addEventListener('submit', createGathering);
    
    document.getElementById('cancel-delete').addEventListener('click', () => hideModal('delete'));
    document.getElementById('confirm-delete').addEventListener('click', confirmDelete);
    
    document.getElementById('admin-btn').addEventListener('click', () => showModal('admin'));
    document.getElementById('cancel-admin').addEventListener('click', () => hideModal('admin'));
    document.getElementById('admin-form').addEventListener('submit', adminLogin);
    document.getElementById('admin-back-to-home').addEventListener('click', () => showScreen('home'));
    
    document.getElementById('cancel-super-admin').addEventListener('click', () => hideModal('superAdmin'));
    document.getElementById('super-admin-form').addEventListener('submit', superAdminLogin);
    document.getElementById('super-admin-back').addEventListener('click', () => { isSuperAdmin = false; showScreen('home'); });
    document.getElementById('set-forced-result').addEventListener('click', setForcedResult);
    document.getElementById('clear-forced-result').addEventListener('click', clearForcedResult);
    
    document.getElementById('back-to-home').addEventListener('click', () => {
        if (unsubscribe) unsubscribe();
        expandedGroups.clear();
        showScreen('home');
        loadGatherings();
    });
    document.getElementById('close-order-btn').addEventListener('click', toggleOrderStatus);
    document.getElementById('summarize-btn').addEventListener('click', summarizeOrders);
    document.getElementById('close-summary').addEventListener('click', () => hideModal('summary'));
    document.getElementById('copy-summary').addEventListener('click', copySummary);
    
    document.getElementById('add-wheel-option').addEventListener('click', addWheelOption);
    document.getElementById('wheel-new-option').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addWheelOption(); } });
    document.getElementById('spin-wheel-btn').addEventListener('click', spinWheel);
    
    document.getElementById('menu-manage-btn').addEventListener('click', () => { showScreen('menu'); renderMenuList(); });
    document.getElementById('menu-back').addEventListener('click', () => showScreen('home'));
    document.getElementById('create-menu-btn').addEventListener('click', () => openMenuEditor(null));
    document.getElementById('menu-edit-back').addEventListener('click', () => { showScreen('menu'); renderMenuList(); });
    document.getElementById('add-menu-item').addEventListener('click', addMenuItem);
    document.getElementById('new-item-name').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMenuItem(); } });
    document.getElementById('save-menu-btn').addEventListener('click', saveMenu);
    
    Object.values(modals).forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    });
    
    let clicks = 0, timer = null;
    document.querySelector('.app-title').addEventListener('click', () => {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(() => clicks = 0, 2000);
        if (clicks >= 5) { clicks = 0; showModal('superAdmin'); }
    });
    
    document.addEventListener('click', (e) => {
        const suggestions = document.getElementById('menu-suggestions');
        if (!e.target.classList.contains('order-input')) {
            suggestions.classList.remove('show');
        }
    });
    
    // 滾動時隱藏選單
    document.addEventListener('scroll', () => {
        document.getElementById('menu-suggestions').classList.remove('show');
    }, true);
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
            await db.collection('menus').doc(deleteTargetId).delete();
            await loadMenus();
            renderMenuList();
        }
        hideModal('delete');
        deleteTargetId = null;
        loadGatherings();
        if (screens.admin && screens.admin.classList.contains('active')) loadAdminGatherings();
        if (screens.superAdmin && screens.superAdmin.classList.contains('active')) loadSuperAdminGatherings();
    } catch (e) { console.error('刪除失敗:', e); alert('刪除失敗'); }
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
        
        const count = group.members.filter(m => attendees[m.id]).length;
        let groupTotal = 0;
        group.members.forEach(m => {
            const memberOrders = orders[m.id] || [];
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
    const memberId = member.id;
    const memberName = member.name;
    const attending = attendees[memberId] || false;
    const memberOrders = orders[memberId] || [];
    const display = memberOrders.length > 0 ? memberOrders : [{ name: '', price: '' }];
    
    let memberTotal = 0;
    memberOrders.forEach(o => { if (o && o.price) memberTotal += parseInt(o.price) || 0; });
    
    return `
        <div class="member-item" data-member-id="${memberId}">
            <div class="member-row">
                <input type="checkbox" class="member-checkbox" ${attending ? 'checked' : ''} ${canEdit ? '' : 'disabled'}
                    onchange="updateAttendance('${memberId}', this.checked)">
                <span class="member-name">${memberName}</span>
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
                                data-member-id="${memberId}" data-index="${i}"
                                oninput="showMenuSuggestions(this)"
                                onchange="updateSingleOrder('${memberId}', ${i}, 'name', this.value)"
                                onfocus="showMenuSuggestions(this)">
                        </div>
                        <input type="number" class="order-price" placeholder="$" 
                            value="${o.price || ''}"
                            ${attending && canEdit ? '' : 'disabled'}
                            data-member-id="${memberId}" data-index="${i}"
                            onchange="updateSingleOrder('${memberId}', ${i}, 'price', this.value)">
                        ${display.length > 1 ? `<button class="btn-remove-order" onclick="removeOrder('${memberId}', ${i})" ${canEdit ? '' : 'disabled'}>×</button>` : ''}
                    </div>
                `).join('')}
                <button class="btn-add-order" onclick="addOrder('${memberId}')" ${attending && canEdit ? '' : 'disabled'}>+ 新增餐點</button>
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
    
    // 計算位置 - 確保在輸入框正下方
    const rect = input.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    // 判斷下方空間是否足夠，不夠則顯示在上方
    const spaceBelow = viewportHeight - rect.bottom;
    const menuHeight = Math.min(matches.length * 48, 200); // 估算選單高度
    
    if (spaceBelow < menuHeight && rect.top > menuHeight) {
        // 顯示在上方
        suggestions.style.bottom = (viewportHeight - rect.top + 4) + 'px';
        suggestions.style.top = 'auto';
    } else {
        // 顯示在下方
        suggestions.style.top = (rect.bottom + 4) + 'px';
        suggestions.style.bottom = 'auto';
    }
    
    suggestions.style.left = rect.left + 'px';
    suggestions.style.width = Math.max(rect.width, 250) + 'px';
    
    suggestions.innerHTML = matches.slice(0, 8).map(item => `
        <div class="menu-suggestion-item" onclick="selectSuggestion('${item.name.replace(/'/g, "\\'")}', ${item.price || 0})">
            <span>${item.name}</span>
            ${item.price ? `<span class="menu-suggestion-price">$${item.price}</span>` : ''}
        </div>
    `).join('');
    
    suggestions.classList.add('show');
}

function selectSuggestion(name, price) {
    if (!activeSuggestionInput) return;
    
    const memberId = activeSuggestionInput.dataset.memberId;
    const index = activeSuggestionInput.dataset.index;
    
    // 設定餐點名稱
    activeSuggestionInput.value = name;
    
    // 找到對應的價格輸入框並設定價格
    // 使用更精確的選擇器：找同一個 order-item 內的價格輸入框
    const orderItem = activeSuggestionInput.closest('.order-item');
    const priceInput = orderItem ? orderItem.querySelector('input[type="number"]') : null;
    
    console.log('選擇建議:', name, price);
    console.log('價格輸入框:', priceInput);
    
    if (priceInput && price) {
        priceInput.value = price;
    }
    
    // 更新資料庫
    updateSingleOrder(memberId, parseInt(index), 'name', name);
    if (price) {
        updateSingleOrder(memberId, parseInt(index), 'price', price);
    }
    
    // 隱藏選單
    document.getElementById('menu-suggestions').classList.remove('show');
    activeSuggestionInput = null;
}

// ===== 資料操作 - 使用整個物件更新避免中文路徑問題 =====
async function updateAttendance(memberId, attending) {
    if (!currentGatheringId) return;
    
    try {
        const doc = await db.collection('gatherings').doc(currentGatheringId).get();
        const data = doc.data();
        const attendees = data.attendees || {};
        const orders = data.orders || {};
        
        attendees[memberId] = attending;
        
        if (!attending) {
            delete orders[memberId];
        } else {
            orders[memberId] = [{ name: '', price: '' }];
        }
        
        await db.collection('gatherings').doc(currentGatheringId).update({
            attendees: attendees,
            orders: orders
        });
    } catch (e) {
        console.error('更新出席失敗:', e);
    }
}

async function updateSingleOrder(memberId, index, field, value) {
    if (!currentGatheringId) return;
    
    try {
        const doc = await db.collection('gatherings').doc(currentGatheringId).get();
        const data = doc.data();
        const orders = data.orders || {};
        const arr = orders[memberId] || [{ name: '', price: '' }];
        
        if (!arr[index]) arr[index] = { name: '', price: '' };
        arr[index][field] = field === 'price' ? (value ? parseInt(value) : '') : value.trim();
        
        orders[memberId] = arr;
        
        await db.collection('gatherings').doc(currentGatheringId).update({
            orders: orders
        });
    } catch (e) {
        console.error('更新餐點失敗:', e);
    }
}

async function addOrder(memberId) {
    if (!currentGatheringId) return;
    
    try {
        const doc = await db.collection('gatherings').doc(currentGatheringId).get();
        const data = doc.data();
        const orders = data.orders || {};
        const arr = orders[memberId] || [];
        
        arr.push({ name: '', price: '' });
        orders[memberId] = arr;
        
        await db.collection('gatherings').doc(currentGatheringId).update({
            orders: orders
        });
    } catch (e) {
        console.error('新增餐點失敗:', e);
    }
}

async function removeOrder(memberId, index) {
    if (!currentGatheringId) return;
    
    try {
        const doc = await db.collection('gatherings').doc(currentGatheringId).get();
        const data = doc.data();
        const orders = data.orders || {};
        const arr = orders[memberId] || [];
        
        arr.splice(index, 1);
        if (arr.length === 0) arr.push({ name: '', price: '' });
        orders[memberId] = arr;
        
        await db.collection('gatherings').doc(currentGatheringId).update({
            orders: orders
        });
    } catch (e) {
        console.error('移除餐點失敗:', e);
    }
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
async function summarizeOrders() {
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
            const memberId = member.id;
            const memberName = member.name;
            if (!attendees[memberId]) return;
            const arr = orders[memberId] || [];
            const validOrders = arr.filter(o => o && o.name && o.name.trim());
            let memberTotal = 0;
            
            validOrders.forEach(o => {
                allItems.push({ name: o.name.trim(), price: o.price || 0 });
                if (o.price) memberTotal += parseInt(o.price) || 0;
            });
            
            if (validOrders.length > 0) {
                memberDetails.push({ member: memberName, orders: validOrders, total: memberTotal, family: g.name });
                familyTotals[g.name] += memberTotal;
            }
        });
    });
    
    const grouped = simpleSummarize(allItems);
    renderSummary(grouped, memberDetails, familyTotals);
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

function renderSummary(grouped, memberDetails, familyTotals) {
    const container = document.getElementById('summary-content');
    const grandTotal = Object.values(familyTotals).reduce((a, b) => a + b, 0);
    
    if (grouped.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#9a9285;padding:20px;">尚無餐點資料</p>';
        return;
    }
    
    let html = `<div class="summary-section"><h3>餐點統計</h3>`;
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
    
    html += '<div class="summary-section"><h3>各家庭金額</h3>';
    Object.entries(familyTotals).forEach(([name, total]) => {
        if (total > 0) {
            html += `<div class="summary-item"><span class="summary-item-name">${name}</span><span class="summary-item-price">$${total}</span></div>`;
        }
    });
    html += '</div>';
    
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
    
    familyGroups.forEach(g => {
        g.members.forEach(member => {
            if (attendees[member.id]) {
                const arr = orders[member.id] || [];
                arr.filter(o => o && o.name && o.name.trim()).forEach(o => {
                    items.push(o.name.trim());
                    grandTotal += parseInt(o.price) || 0;
                });
            }
        });
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

// ===== 輪盤 =====
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
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, angle, angle + arc);
        ctx.closePath();
        ctx.fillStyle = wheelColors[i % wheelColors.length];
        ctx.fill();
        ctx.strokeStyle = '#fdfcfa';
        ctx.lineWidth = 2;
        ctx.stroke();
        
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
    const targetAngle = -winIndex * arc - arc / 2;
    const spins = 5 * Math.PI * 2;
    const totalRotation = spins + targetAngle - (wheelAngle % (Math.PI * 2));
    
    const startAngle = wheelAngle;
    const startTime = Date.now();
    const duration = 4000;
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
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

// ===== 菜單管理（使用 Firestore）=====
async function loadMenus() {
    try {
        const snapshot = await db.collection('menus').orderBy('createdAt', 'desc').get();
        menus = [];
        snapshot.forEach(doc => {
            menus.push({ id: doc.id, ...doc.data() });
        });
    } catch (e) {
        console.error('載入菜單失敗:', e);
        menus = [];
    }
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
        document.getElementById('menu-name-input').value = menu ? menu.name : '';
        editMenuItems = menu && menu.items ? [...menu.items] : [];
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

async function saveMenu() {
    const name = document.getElementById('menu-name-input').value.trim();
    if (!name) return alert('請輸入菜單名稱');
    
    try {
        if (currentEditMenuId) {
            // 更新現有菜單
            await db.collection('menus').doc(currentEditMenuId).update({
                name: name,
                items: editMenuItems
            });
        } else {
            // 建立新菜單
            await db.collection('menus').add({
                name: name,
                items: editMenuItems,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        await loadMenus();
        showScreen('menu');
        renderMenuList();
    } catch (e) {
        console.error('儲存菜單失敗:', e);
        alert('儲存失敗：' + e.message);
    }
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
