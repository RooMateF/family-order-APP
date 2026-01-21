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

// ===== 家庭成員 - 從 Firestore 載入 =====
let familyGroups = [];
let memberById = {};
let memberNameById = {};

// 預設家庭結構（首次使用時會存入 Firestore）
const defaultFamilyGroups = [
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

function buildMemberLookup() {
    memberById = {};
    memberNameById = {};
    familyGroups.forEach(g => {
        g.members.forEach(m => {
            memberById[m.id] = m;
            memberNameById[m.id] = m.name;
        });
    });
}

async function loadFamilyGroups() {
    try {
        const doc = await db.collection('shared').doc('familyGroups').get();
        if (doc.exists) {
            familyGroups = doc.data().groups || [];
        } else {
            // 首次使用，存入預設值
            familyGroups = defaultFamilyGroups;
            await db.collection('shared').doc('familyGroups').set({ groups: familyGroups });
        }
        buildMemberLookup();
    } catch (e) {
        console.error('載入家庭成員失敗:', e);
        familyGroups = defaultFamilyGroups;
        buildMemberLookup();
    }
}

async function saveFamilyGroups() {
    try {
        await db.collection('shared').doc('familyGroups').set({ groups: familyGroups });
        buildMemberLookup();
        console.log('家庭成員儲存成功');
    } catch (e) {
        console.error('儲存家庭成員失敗:', e);
        alert('儲存失敗: ' + e.message);
    }
}

// 產生新的成員 ID
function generateMemberId() {
    let maxNum = 0;
    familyGroups.forEach(g => {
        g.members.forEach(m => {
            const match = m.id.match(/^m(\d+)$/);
            if (match) {
                maxNum = Math.max(maxNum, parseInt(match[1]));
            }
        });
    });
    return 'm' + String(maxNum + 1).padStart(2, '0');
}

// 產生新的家庭 ID
function generateFamilyId() {
    let maxNum = 0;
    familyGroups.forEach(g => {
        const match = g.id.match(/^family(\d+)$/);
        if (match) {
            maxNum = Math.max(maxNum, parseInt(match[1]));
        }
    });
    return 'family' + (maxNum + 1);
}

const ADMIN_PASSWORD = '000000';
const SUPER_ADMIN_PASSWORD = '66666666';

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
    summary: document.getElementById('summary-modal'),
    family: document.getElementById('family-modal'),
    menuView: document.getElementById('menu-view-modal')
};

function showScreen(name) {
    Object.values(screens).forEach(s => s && s.classList.remove('active'));
    screens[name] && screens[name].classList.add('active');
}
function showModal(name) { modals[name].classList.add('active'); }
function hideModal(name) { modals[name].classList.remove('active'); }

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
    await loadFamilyGroups();  // 先載入家庭成員
    loadGatherings();
    loadMenus();
    initWheel();
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
    document.getElementById('view-menu-btn').addEventListener('click', showMenuView);
    document.getElementById('close-menu-view').addEventListener('click', () => hideModal('menuView'));
    
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
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    });
    
    // 家庭成員管理
    document.getElementById('add-family-btn').addEventListener('click', () => openFamilyEditor(null));
    document.getElementById('cancel-family').addEventListener('click', () => hideModal('family'));
    document.getElementById('save-family').addEventListener('click', saveFamily);
    document.getElementById('add-member-btn').addEventListener('click', addEditMember);
    document.getElementById('new-member-name').addEventListener('keypress', (e) => { 
        if (e.key === 'Enter') { e.preventDefault(); addEditMember(); } 
    });
    
    let clicks = 0, timer = null;
    document.querySelector('.app-title').addEventListener('click', () => {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(() => clicks = 0, 2000);
        if (clicks >= 5) { clicks = 0; showModal('superAdmin'); }
    });
    
    // 初始化菜單選單事件
    initMenuSuggestionEvents();
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
    // 如果正在處理選單選擇，跳過這次渲染
    if (skipNextRender) {
        console.log('跳過渲染，等待資料庫更新');
        return;
    }
    
    document.getElementById('gathering-title').textContent = data.name;
    document.getElementById('gathering-info').textContent = `${data.date}${data.restaurant ? ' · ' + data.restaurant : ''}`;
    
    const menuRow = document.getElementById('gathering-menu-row');
    const menuInfo = document.getElementById('gathering-menu-info');
    if (currentMenuData) {
        menuInfo.textContent = `使用菜單：${currentMenuData.name}`;
        menuRow.style.display = 'flex';
    } else {
        menuRow.style.display = 'none';
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
                                onblur="handleInputBlur(this, '${memberId}', ${i})"
                                onfocus="showMenuSuggestions(this)">
                        </div>
                        <input type="number" class="order-price" placeholder="$" 
                            value="${o.price || ''}"
                            ${attending && canEdit ? '' : 'disabled'}
                            data-member-id="${memberId}" data-index="${i}"
                            onblur="updateSingleOrder('${memberId}', ${i}, 'price', this.value)">
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
let suggestionJustSelected = false;
let skipNextRender = false;  // 防止選擇後被 Firestore 更新覆蓋

function showMenuSuggestions(input) {
    const suggestions = document.getElementById('menu-suggestions');
    const value = input.value.trim().toLowerCase();
    
    // 每次都更新，確保指向正確的輸入框
    activeSuggestionInput = input;
    
    if (!currentMenuData || !currentMenuData.items) {
        suggestions.classList.remove('show');
        return;
    }
    
    // 空值時顯示所有選項，有輸入時過濾
    const matches = value.length === 0 
        ? currentMenuData.items 
        : currentMenuData.items.filter(item => item.name.toLowerCase().includes(value));
    
    if (matches.length === 0) {
        suggestions.classList.remove('show');
        return;
    }
    
    // 把目標輸入框的資訊存到選單的 data 屬性上
    suggestions.dataset.targetMemberId = input.dataset.memberId;
    suggestions.dataset.targetIndex = input.dataset.index;
    
    // 計算位置
    const rect = input.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const menuHeight = Math.min(matches.length * 52, 220);
    
    if (spaceBelow < menuHeight && rect.top > menuHeight) {
        suggestions.style.bottom = (viewportHeight - rect.top + 4) + 'px';
        suggestions.style.top = 'auto';
    } else {
        suggestions.style.top = (rect.bottom + 4) + 'px';
        suggestions.style.bottom = 'auto';
    }
    
    suggestions.style.left = rect.left + 'px';
    suggestions.style.width = Math.max(rect.width, 280) + 'px';
    
    // 使用 data 屬性存儲資料
    suggestions.innerHTML = matches.slice(0, 10).map(item => `
        <div class="menu-suggestion-item" data-name="${item.name.replace(/"/g, '&quot;')}" data-price="${item.price || 0}">
            <span>${item.name}</span>
            ${item.price ? `<span class="menu-suggestion-price">$${item.price}</span>` : ''}
        </div>
    `).join('');
    
    suggestions.classList.add('show');
}

function selectSuggestion(name, price) {
    const suggestions = document.getElementById('menu-suggestions');
    
    // 從選單的 data 屬性獲取目標資訊
    const memberId = suggestions.dataset.targetMemberId;
    const index = suggestions.dataset.targetIndex;
    
    console.log('selectSuggestion 被呼叫:', name, price);
    console.log('目標 memberId:', memberId, 'index:', index);
    
    if (!memberId || index === undefined) {
        console.error('找不到目標輸入框資訊');
        return;
    }
    
    suggestionJustSelected = true;
    skipNextRender = true;  // 防止 Firestore 更新覆蓋輸入框
    
    // 隱藏選單
    suggestions.classList.remove('show');
    
    // 用 querySelector 直接找到正確的輸入框
    const nameInput = document.querySelector(`input.order-input[data-member-id="${memberId}"][data-index="${index}"]`);
    const priceInputEl = document.querySelector(`input.order-price[data-member-id="${memberId}"][data-index="${index}"]`);
    
    console.log('找到的名稱輸入框:', nameInput);
    console.log('找到的價格輸入框:', priceInputEl);
    
    // 設定餐點名稱
    if (nameInput) {
        nameInput.value = name;
        console.log('已設定名稱:', name);
    }
    
    // 設定價格（包含 0 元的情況）
    if (priceInputEl && price !== undefined && price !== null) {
        priceInputEl.value = price;
        console.log('已設定價格:', price);
    }
    
    // 更新資料庫
    updateSingleOrder(memberId, parseInt(index), 'name', name);
    if (price !== undefined && price !== null) {
        updateSingleOrder(memberId, parseInt(index), 'price', price);
    }
    
    activeSuggestionInput = null;
    
    // 延遲後重置標記，讓 Firestore 更新後可以正常渲染
    setTimeout(() => {
        suggestionJustSelected = false;
        skipNextRender = false;
    }, 500);
}

function handleInputBlur(input, memberId, index) {
    // 如果剛選擇了選單項目，不處理 blur
    if (suggestionJustSelected) return;
    
    setTimeout(() => {
        if (!suggestionJustSelected) {
            updateSingleOrder(memberId, index, 'name', input.value);
        }
    }, 100);
}

// 初始化選單事件監聽
function initMenuSuggestionEvents() {
    // 點擊選單外部時關閉（但排除選單本身和輸入框）
    document.addEventListener('pointerdown', (e) => {
        const menu = document.getElementById('menu-suggestions');
        if (!menu || !menu.classList.contains('show')) return;
        
        const hitMenu = menu.contains(e.target);
        const hitInput = activeSuggestionInput && (e.target === activeSuggestionInput);
        
        if (!hitMenu && !hitInput) {
            menu.classList.remove('show');
        }
    }, { capture: true });
    
    // 在選單上點擊時選取項目（使用 pointerdown 避免 blur 先觸發）
    document.addEventListener('pointerdown', (e) => {
        const item = e.target.closest('.menu-suggestion-item');
        if (!item) return;
        
        e.preventDefault();  // 阻止 blur 事件
        e.stopPropagation();
        
        const name = item.dataset.name || '';
        const price = parseInt(item.dataset.price) || 0;
        selectSuggestion(name, price);
    }, { capture: true });
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
        
        if (field === 'price') {
            // 處理價格：允許 0，只有空字串或非數字才設為空
            const numValue = parseInt(value);
            arr[index][field] = (value === '' || value === null || value === undefined || isNaN(numValue)) ? '' : numValue;
        } else {
            arr[index][field] = value.trim();
        }
        
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

function showMenuView() {
    if (!currentMenuData || !currentMenuData.items) {
        alert('沒有菜單資料');
        return;
    }
    
    document.getElementById('menu-view-title').textContent = currentMenuData.name;
    
    const content = document.getElementById('menu-view-content');
    content.innerHTML = currentMenuData.items.map(item => `
        <div class="menu-view-item">
            <span class="menu-view-item-name">${item.name}</span>
            <span class="menu-view-item-price">${item.price ? '$' + item.price : '-'}</span>
        </div>
    `).join('');
    
    showModal('menuView');
}

// ===== 輪盤（全域共用，使用獨立的 Firestore document）=====
let wheelUnsubscribe = null;

function initWheel() {
    // 監聽轉盤資料的即時變化
    wheelUnsubscribe = db.collection('shared').doc('wheel').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            wheelOptions = data.options || [];
            const lastResult = data.result || null;
            
            console.log('轉盤資料更新:', wheelOptions, '結果:', lastResult);
            
            renderWheelOptions();
            if (!wheelSpinning) {
                // 保留當前角度重繪
                drawWheel(wheelAngle);
            }
            
            // 顯示結果
            const resultEl = document.getElementById('wheel-result');
            if (lastResult) {
                resultEl.textContent = `結果：${lastResult}`;
                resultEl.classList.add('show');
            } else {
                resultEl.classList.remove('show');
            }
        } else {
            // 如果文件不存在，建立它
            db.collection('shared').doc('wheel').set({
                options: [],
                result: null
            });
        }
    }, err => {
        console.error('監聽轉盤失敗:', err);
    });
}

async function saveWheelOptions() {
    console.log('儲存轉盤選項:', wheelOptions);
    try {
        await db.collection('shared').doc('wheel').update({
            options: wheelOptions
        });
        console.log('轉盤選項儲存成功');
    } catch (e) {
        // 如果文件不存在，用 set 建立
        if (e.code === 'not-found') {
            await db.collection('shared').doc('wheel').set({
                options: wheelOptions,
                result: null
            });
            console.log('轉盤選項建立成功');
        } else {
            console.error('儲存轉盤選項失敗:', e);
            alert('儲存失敗: ' + e.message);
        }
    }
}

async function saveWheelResult(resultText) {
    console.log('儲存轉盤結果:', resultText);
    try {
        await db.collection('shared').doc('wheel').update({
            result: resultText
        });
        console.log('轉盤結果儲存成功');
    } catch (e) {
        console.error('儲存轉盤結果失敗:', e);
    }
}

function renderWheelOptions() {
    const list = document.getElementById('wheel-options-list');
    if (!list) return;
    list.innerHTML = wheelOptions.map((opt, i) => `
        <span class="wheel-option-tag">${opt}<button class="wheel-option-remove" onclick="removeWheelOption(${i})">×</button></span>
    `).join('');
}

async function addWheelOption() {
    const input = document.getElementById('wheel-new-option');
    const val = input.value.trim();
    console.log('addWheelOption 被呼叫, 值:', val);
    if (!val) return;
    
    wheelOptions.push(val);
    renderWheelOptions();
    drawWheel(wheelAngle);  // 保留當前角度
    input.value = '';
    
    await saveWheelOptions();
}

async function removeWheelOption(i) {
    console.log('removeWheelOption 被呼叫, index:', i);
    wheelOptions.splice(i, 1);
    renderWheelOptions();
    drawWheel(wheelAngle);  // 保留當前角度
    
    await saveWheelOptions();
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

async function spinWheel() {
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
    
    // 在選項範圍內隨機一個位置（不是正中間）
    // 隨機偏移量：-0.4 到 +0.4 之間（避免太靠近邊緣）
    const randomOffset = (Math.random() - 0.5) * 0.8 * arc;
    const targetAngle = -winIndex * arc - arc / 2 + randomOffset;
    
    const spins = 5 * Math.PI * 2;
    const totalRotation = spins + targetAngle - (wheelAngle % (Math.PI * 2));
    
    const startAngle = wheelAngle;
    const startTime = Date.now();
    const duration = 4000;
    const winnerName = wheelOptions[winIndex];
    
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
            result.textContent = `結果：${winnerName}`;
            result.classList.add('show');
            
            // 儲存結果到 Firestore，讓其他人也能看到
            saveWheelResult(winnerName);
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
        renderFamilyManageList();
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

// ===== 家庭成員管理 =====
let editingFamilyId = null;
let editingMembers = [];

function renderFamilyManageList() {
    const list = document.getElementById('family-manage-list');
    if (!list) return;
    
    if (familyGroups.length === 0) {
        list.innerHTML = '<p class="empty-message">尚無家庭資料</p>';
        return;
    }
    
    list.innerHTML = familyGroups.map(group => `
        <div class="family-manage-card">
            <div class="family-manage-header">
                <span class="family-manage-name">${group.name}</span>
                <div class="family-manage-actions-row">
                    <button class="btn btn-ghost" onclick="openFamilyEditor('${group.id}')">編輯</button>
                    <button class="btn btn-ghost" onclick="requestDeleteFamily('${group.id}')">刪除</button>
                </div>
            </div>
            <div class="family-manage-members">
                ${group.members.map(m => `<span class="family-member-tag">${m.name}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

function openFamilyEditor(familyId) {
    editingFamilyId = familyId;
    
    if (familyId) {
        // 編輯現有家庭
        const family = familyGroups.find(g => g.id === familyId);
        if (!family) return;
        document.getElementById('family-modal-title').textContent = '編輯家庭';
        document.getElementById('family-name-input').value = family.name;
        editingMembers = family.members.map(m => ({ ...m }));
    } else {
        // 新增家庭
        document.getElementById('family-modal-title').textContent = '新增家庭';
        document.getElementById('family-name-input').value = '';
        editingMembers = [];
    }
    
    renderEditingMembers();
    showModal('family');
}

function renderEditingMembers() {
    const list = document.getElementById('family-members-list');
    if (editingMembers.length === 0) {
        list.innerHTML = '<p style="color: var(--text-light); font-size: 0.9rem;">尚無成員，請新增</p>';
        return;
    }
    
    list.innerHTML = editingMembers.map((m, i) => `
        <div class="family-member-edit-item">
            <span>${m.name}</span>
            <button onclick="removeEditingMember(${i})">×</button>
        </div>
    `).join('');
}

function addEditMember() {
    const input = document.getElementById('new-member-name');
    const name = input.value.trim();
    if (!name) return;
    
    const newId = generateMemberId();
    editingMembers.push({ id: newId, name: name });
    renderEditingMembers();
    input.value = '';
}

function removeEditingMember(index) {
    editingMembers.splice(index, 1);
    renderEditingMembers();
}

async function saveFamily() {
    const name = document.getElementById('family-name-input').value.trim();
    if (!name) return alert('請輸入家庭名稱');
    if (editingMembers.length === 0) return alert('請至少新增一位成員');
    
    if (editingFamilyId) {
        // 更新現有家庭
        const index = familyGroups.findIndex(g => g.id === editingFamilyId);
        if (index !== -1) {
            familyGroups[index].name = name;
            familyGroups[index].members = editingMembers;
        }
    } else {
        // 新增家庭
        const newId = generateFamilyId();
        familyGroups.push({
            id: newId,
            name: name,
            members: editingMembers
        });
    }
    
    await saveFamilyGroups();
    hideModal('family');
    renderFamilyManageList();
}

function requestDeleteFamily(familyId) {
    const family = familyGroups.find(g => g.id === familyId);
    if (!family) return;
    
    if (!confirm(`確定要刪除「${family.name}」嗎？此操作無法復原。`)) return;
    
    const index = familyGroups.findIndex(g => g.id === familyId);
    if (index !== -1) {
        familyGroups.splice(index, 1);
        saveFamilyGroups();
        renderFamilyManageList();
    }
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
window.handleInputBlur = handleInputBlur;
window.openFamilyEditor = openFamilyEditor;
window.removeEditingMember = removeEditingMember;
window.requestDeleteFamily = requestDeleteFamily;
