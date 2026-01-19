// ===== Firebase 設定 =====
const firebaseConfig = {
    apiKey: "AIzaSyCftNjFmb347SXmukXRiFhrEea0rxduI64",
    authDomain: "family-order-app.firebaseapp.com",
    projectId: "family-order-app",
    storageBucket: "family-order-app.firebasestorage.app",
    messagingSenderId: "172416471032",
    appId: "1:172416471032:web:f16a0e0d82b1519f63500d",
    measurementId: "G-1Y8VQT05VR"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ===== 家庭成員資料 =====
const familyGroups = [
    {
        id: 'grandparents',
        name: '阿公阿嬤',
        members: ['陳惠舜', '林貞惠']
    },
    {
        id: 'family1',
        name: '世松家',
        members: ['陳世松', '張秋蓮', '陳昱臻', '陳昱瑋']
    },
    {
        id: 'family2',
        name: '世賓家',
        members: ['陳世賓', '鄭瑩', '陳昱婕', '陳宇']
    },
    {
        id: 'family3',
        name: '慶龍家',
        members: ['江慶龍', '陳怡君', '江柏宏', '江冠宏']
    },
    {
        id: 'family4',
        name: '朝慶家',
        members: ['陳朝慶', '陳一辰', '陳奕豪']
    }
];

// ===== 管理員密碼 =====
const ADMIN_PASSWORD = 'family2025';

// ===== 全域變數 =====
let currentGatheringId = null;
let unsubscribe = null;
let expandedGroups = new Set(); // 記錄展開的分組

// ===== DOM 元素 =====
const screens = {
    home: document.getElementById('home-screen'),
    gathering: document.getElementById('gathering-screen'),
    admin: document.getElementById('admin-screen')
};

const modals = {
    create: document.getElementById('create-modal'),
    admin: document.getElementById('admin-modal'),
    summary: document.getElementById('summary-modal')
};

// ===== 頁面切換 =====
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function showModal(modalName) {
    modals[modalName].classList.add('active');
}

function hideModal(modalName) {
    modals[modalName].classList.remove('active');
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    loadGatherings();
    setupEventListeners();
});

function setupEventListeners() {
    // 建立聚餐
    document.getElementById('create-gathering-btn').addEventListener('click', () => {
        document.getElementById('gathering-date').valueAsDate = new Date();
        showModal('create');
    });
    
    document.getElementById('cancel-create').addEventListener('click', () => hideModal('create'));
    document.getElementById('create-form').addEventListener('submit', createGathering);
    
    // 管理員
    document.getElementById('admin-btn').addEventListener('click', () => showModal('admin'));
    document.getElementById('cancel-admin').addEventListener('click', () => hideModal('admin'));
    document.getElementById('admin-form').addEventListener('submit', adminLogin);
    document.getElementById('admin-back-to-home').addEventListener('click', () => showScreen('home'));
    
    // 聚餐詳情
    document.getElementById('back-to-home').addEventListener('click', () => {
        if (unsubscribe) unsubscribe();
        expandedGroups.clear();
        showScreen('home');
        loadGatherings();
    });
    
    // 統計
    document.getElementById('summarize-btn').addEventListener('click', summarizeOrders);
    document.getElementById('close-summary').addEventListener('click', () => hideModal('summary'));
    document.getElementById('copy-summary').addEventListener('click', copySummary);
    
    // 點擊 modal 外部關閉
    Object.values(modals).forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// ===== 載入聚餐列表 =====
async function loadGatherings() {
    const listEl = document.getElementById('gathering-list');
    
    try {
        const snapshot = await db.collection('gatherings')
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .get();
        
        if (snapshot.empty) {
            listEl.innerHTML = '<p class="empty-message">目前沒有進行中的聚餐<br><span>點擊上方按鈕建立一個吧！</span></p>';
            return;
        }
        
        listEl.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const card = createGatheringCard(doc.id, data);
            listEl.appendChild(card);
        });
    } catch (error) {
        console.error('載入聚餐失敗:', error);
        listEl.innerHTML = '<p class="empty-message">載入失敗，請重新整理</p>';
    }
}

function createGatheringCard(id, data) {
    const card = document.createElement('div');
    card.className = 'gathering-card';
    card.onclick = () => openGathering(id);
    
    const attendingCount = countAttending(data.attendees || {});
    const orderedCount = countTotalOrders(data.orders || {});
    
    card.innerHTML = `
        <div class="gathering-card-title">${data.name}</div>
        <div class="gathering-card-info">
            📅 ${data.date}${data.restaurant ? ` · 🏪 ${data.restaurant}` : ''}
        </div>
        <div class="gathering-card-stats">
            <span>👥 ${attendingCount} 人參加</span>
            <span>🍜 ${orderedCount} 份餐點</span>
        </div>
    `;
    
    return card;
}

// ===== 建立聚餐 =====
async function createGathering(e) {
    e.preventDefault();
    
    const name = document.getElementById('gathering-name').value.trim();
    const date = document.getElementById('gathering-date').value;
    const restaurant = document.getElementById('gathering-restaurant').value.trim();
    
    if (!name || !date) {
        alert('請填寫聚餐名稱和日期');
        return;
    }
    
    try {
        await db.collection('gatherings').add({
            name,
            date,
            restaurant,
            status: 'active',
            attendees: {},
            orders: {}, // orders[member] = ['餐點1', '餐點2', ...]
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideModal('create');
        document.getElementById('create-form').reset();
        loadGatherings();
    } catch (error) {
        console.error('建立聚餐失敗:', error);
        alert('建立失敗，請稍後再試');
    }
}

// ===== 開啟聚餐詳情 =====
function openGathering(id) {
    currentGatheringId = id;
    showScreen('gathering');
    
    // 即時監聽資料變更
    unsubscribe = db.collection('gatherings').doc(id).onSnapshot(doc => {
        if (!doc.exists) {
            alert('聚餐不存在');
            showScreen('home');
            return;
        }
        
        const data = doc.data();
        renderGatheringDetail(data);
    });
}

function renderGatheringDetail(data) {
    document.getElementById('gathering-title').textContent = data.name;
    document.getElementById('gathering-info').textContent = 
        `📅 ${data.date}${data.restaurant ? ` · 🏪 ${data.restaurant}` : ''}`;
    
    const attendees = data.attendees || {};
    const orders = data.orders || {};
    
    document.getElementById('total-attending').textContent = countAttending(attendees);
    document.getElementById('total-ordered').textContent = countTotalOrders(orders);
    
    renderFamilyGroups(attendees, orders);
}

function renderFamilyGroups(attendees, orders) {
    const container = document.getElementById('family-groups');
    container.innerHTML = '';
    
    familyGroups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'family-group';
        groupEl.id = `group-${group.id}`;
        
        // 保持展開狀態
        if (expandedGroups.has(group.id)) {
            groupEl.classList.add('expanded');
        }
        
        const attendingInGroup = group.members.filter(m => attendees[m]).length;
        
        groupEl.innerHTML = `
            <div class="group-header" onclick="toggleGroup('${group.id}')">
                <div>
                    <span class="group-title">${group.name}</span>
                    <span class="group-count">（${attendingInGroup}/${group.members.length} 人參加）</span>
                </div>
                <span class="group-toggle">▼</span>
            </div>
            <div class="group-content">
                ${group.members.map(member => renderMemberItem(member, attendees, orders)).join('')}
            </div>
        `;
        
        container.appendChild(groupEl);
    });
}

function renderMemberItem(member, attendees, orders) {
    const isAttending = attendees[member] || false;
    const memberOrders = orders[member] || [];
    
    // 確保至少有一個空的輸入欄位
    const displayOrders = memberOrders.length > 0 ? memberOrders : [''];
    
    return `
        <div class="member-item" data-member="${member}">
            <div class="member-row">
                <input type="checkbox" class="member-checkbox" 
                    ${isAttending ? 'checked' : ''} 
                    onchange="updateAttendance('${member}', this.checked)">
                <span class="member-name">${member}</span>
                <span class="member-status ${isAttending ? '' : 'not-attending'}">
                    ${isAttending ? '✓ 參加' : '未參加'}
                </span>
            </div>
            <div class="orders-container">
                ${displayOrders.map((order, index) => `
                    <div class="order-item">
                        <input type="text" class="order-input" 
                            placeholder="輸入餐點名稱..."
                            value="${order}"
                            ${isAttending ? '' : 'disabled'}
                            data-member="${member}"
                            data-index="${index}"
                            onchange="updateSingleOrder('${member}', ${index}, this.value)">
                        ${displayOrders.length > 1 ? `
                            <button class="btn-remove-order" 
                                onclick="removeOrder('${member}', ${index})"
                                ${isAttending ? '' : 'disabled'}>×</button>
                        ` : ''}
                    </div>
                `).join('')}
                <button class="btn-add-order" 
                    onclick="addOrder('${member}')"
                    ${isAttending ? '' : 'disabled'}>
                    ＋ 新增餐點
                </button>
            </div>
        </div>
    `;
}

function toggleGroup(groupId) {
    const groupEl = document.getElementById(`group-${groupId}`);
    groupEl.classList.toggle('expanded');
    
    // 記錄展開狀態
    if (groupEl.classList.contains('expanded')) {
        expandedGroups.add(groupId);
    } else {
        expandedGroups.delete(groupId);
    }
}

// ===== 更新出席狀態 =====
async function updateAttendance(member, isAttending) {
    if (!currentGatheringId) return;
    
    try {
        const updates = {
            [`attendees.${member}`]: isAttending
        };
        
        // 如果取消參加，清空餐點
        if (!isAttending) {
            updates[`orders.${member}`] = firebase.firestore.FieldValue.delete();
        } else {
            // 如果參加，初始化一個空的餐點陣列
            updates[`orders.${member}`] = [''];
        }
        
        await db.collection('gatherings').doc(currentGatheringId).update(updates);
    } catch (error) {
        console.error('更新失敗:', error);
    }
}

// ===== 更新單筆餐點 =====
async function updateSingleOrder(member, index, value) {
    if (!currentGatheringId) return;
    
    try {
        // 先取得目前的餐點
        const doc = await db.collection('gatherings').doc(currentGatheringId).get();
        const data = doc.data();
        const orders = data.orders || {};
        const memberOrders = orders[member] || [''];
        
        // 更新指定索引的餐點
        memberOrders[index] = value.trim();
        
        await db.collection('gatherings').doc(currentGatheringId).update({
            [`orders.${member}`]: memberOrders
        });
    } catch (error) {
        console.error('更新餐點失敗:', error);
    }
}

// ===== 新增餐點欄位 =====
async function addOrder(member) {
    if (!currentGatheringId) return;
    
    try {
        const doc = await db.collection('gatherings').doc(currentGatheringId).get();
        const data = doc.data();
        const orders = data.orders || {};
        const memberOrders = orders[member] || [];
        
        memberOrders.push('');
        
        await db.collection('gatherings').doc(currentGatheringId).update({
            [`orders.${member}`]: memberOrders
        });
    } catch (error) {
        console.error('新增餐點失敗:', error);
    }
}

// ===== 移除餐點欄位 =====
async function removeOrder(member, index) {
    if (!currentGatheringId) return;
    
    try {
        const doc = await db.collection('gatherings').doc(currentGatheringId).get();
        const data = doc.data();
        const orders = data.orders || {};
        const memberOrders = orders[member] || [];
        
        memberOrders.splice(index, 1);
        
        // 確保至少有一個空欄位
        if (memberOrders.length === 0) {
            memberOrders.push('');
        }
        
        await db.collection('gatherings').doc(currentGatheringId).update({
            [`orders.${member}`]: memberOrders
        });
    } catch (error) {
        console.error('移除餐點失敗:', error);
    }
}

// ===== 計算統計 =====
function countAttending(attendees) {
    return Object.values(attendees).filter(v => v).length;
}

function countTotalOrders(orders) {
    let count = 0;
    Object.values(orders).forEach(memberOrders => {
        if (Array.isArray(memberOrders)) {
            count += memberOrders.filter(o => o && o.trim()).length;
        }
    });
    return count;
}

// ===== 統計餐點 =====
function summarizeOrders() {
    db.collection('gatherings').doc(currentGatheringId).get().then(doc => {
        const data = doc.data();
        const orders = data.orders || {};
        const attendees = data.attendees || {};
        
        // 收集所有餐點
        const allItems = [];
        const memberDetails = [];
        
        Object.entries(orders).forEach(([member, memberOrders]) => {
            if (!attendees[member] || !Array.isArray(memberOrders)) return;
            
            const validOrders = memberOrders.filter(o => o && o.trim());
            if (validOrders.length > 0) {
                memberDetails.push({ member, orders: validOrders });
                validOrders.forEach(item => {
                    allItems.push(item.trim());
                });
            }
        });
        
        // 直接統計（不做任何轉換）
        const grouped = {};
        allItems.forEach(item => {
            if (!grouped[item]) {
                grouped[item] = 0;
            }
            grouped[item]++;
        });
        
        // 轉換成陣列並排序
        const sortedItems = Object.entries(grouped)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        
        // 顯示結果
        renderSummary(sortedItems, memberDetails);
        showModal('summary');
    });
}

function renderSummary(sortedItems, memberDetails) {
    const container = document.getElementById('summary-content');
    
    if (sortedItems.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#8a8a8a;padding:20px;">還沒有人點餐 🍽️</p>';
        return;
    }
    
    // 餐點統計
    let html = '<div class="summary-section"><h3>📊 餐點統計</h3>';
    sortedItems.forEach(item => {
        html += `
            <div class="summary-item">
                <span class="summary-item-name">${item.name}</span>
                <span class="summary-item-count">× ${item.count}</span>
            </div>
        `;
    });
    
    const totalItems = sortedItems.reduce((sum, item) => sum + item.count, 0);
    html += `<div class="summary-total">共 ${totalItems} 份餐點 🎉</div>`;
    html += '</div>';
    
    // 個人點餐明細
    html += '<div class="summary-section"><h3>👥 個人明細</h3>';
    memberDetails.forEach(({ member, orders }) => {
        html += `
            <div class="summary-item">
                <span class="summary-item-name">${member}</span>
                <span style="color:#8a8a8a;font-size:0.9rem;">${orders.join('、')}</span>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

function copySummary() {
    db.collection('gatherings').doc(currentGatheringId).get().then(doc => {
        const data = doc.data();
        const orders = data.orders || {};
        const attendees = data.attendees || {};
        
        // 收集所有餐點
        const allItems = [];
        Object.entries(orders).forEach(([member, memberOrders]) => {
            if (!attendees[member] || !Array.isArray(memberOrders)) return;
            memberOrders.filter(o => o && o.trim()).forEach(item => {
                allItems.push(item.trim());
            });
        });
        
        // 統計
        const grouped = {};
        allItems.forEach(item => {
            if (!grouped[item]) grouped[item] = 0;
            grouped[item]++;
        });
        
        const sortedItems = Object.entries(grouped)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        
        // 產生文字
        let text = `🍽️ ${data.name}\n`;
        text += `📅 ${data.date}${data.restaurant ? ` · ${data.restaurant}` : ''}\n\n`;
        text += `📊 餐點統計：\n`;
        sortedItems.forEach(item => {
            text += `• ${item.name} × ${item.count}\n`;
        });
        text += `\n共 ${sortedItems.reduce((sum, item) => sum + item.count, 0)} 份餐點`;
        
        navigator.clipboard.writeText(text).then(() => {
            alert('已複製到剪貼簿！📋');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('已複製到剪貼簿！📋');
        });
    });
}

// ===== 管理員功能 =====
function adminLogin(e) {
    e.preventDefault();
    const password = document.getElementById('admin-password').value;
    
    if (password === ADMIN_PASSWORD) {
        hideModal('admin');
        document.getElementById('admin-password').value = '';
        showScreen('admin');
        loadAdminGatherings();
    } else {
        alert('密碼錯誤 🔒');
    }
}

async function loadAdminGatherings() {
    const listEl = document.getElementById('admin-gathering-list');
    
    try {
        const snapshot = await db.collection('gatherings')
            .orderBy('createdAt', 'desc')
            .get();
        
        if (snapshot.empty) {
            listEl.innerHTML = '<p class="empty-message">沒有任何聚餐紀錄</p>';
            return;
        }
        
        listEl.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'gathering-card';
            
            const attendingCount = countAttending(data.attendees || {});
            
            card.innerHTML = `
                <div class="gathering-card-title">
                    ${data.name}
                    <span style="font-size:0.8rem;color:${data.status === 'active' ? '#7fcdbb' : '#b5b5b5'};">
                        [${data.status === 'active' ? '進行中' : '已結束'}]
                    </span>
                </div>
                <div class="gathering-card-info">
                    📅 ${data.date}${data.restaurant ? ` · 🏪 ${data.restaurant}` : ''}
                </div>
                <div class="gathering-card-stats">
                    <span>👥 ${attendingCount} 人參加</span>
                </div>
                <div class="admin-actions">
                    <button class="btn btn-small ${data.status === 'active' ? 'btn-ghost' : 'btn-success'}" 
                        onclick="event.stopPropagation(); toggleGatheringStatus('${doc.id}', '${data.status}')">
                        ${data.status === 'active' ? '結束聚餐' : '重新開啟'}
                    </button>
                    <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); deleteGathering('${doc.id}')">
                        刪除
                    </button>
                </div>
            `;
            
            listEl.appendChild(card);
        });
    } catch (error) {
        console.error('載入失敗:', error);
    }
}

async function toggleGatheringStatus(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'ended' : 'active';
    
    try {
        await db.collection('gatherings').doc(id).update({ status: newStatus });
        loadAdminGatherings();
    } catch (error) {
        console.error('更新狀態失敗:', error);
    }
}

async function deleteGathering(id) {
    if (!confirm('確定要刪除這個聚餐嗎？\n此操作無法復原 ⚠️')) return;
    
    try {
        await db.collection('gatherings').doc(id).delete();
        loadAdminGatherings();
    } catch (error) {
        console.error('刪除失敗:', error);
    }
}

// ===== 讓函式可在 HTML 中使用 =====
window.toggleGroup = toggleGroup;
window.updateAttendance = updateAttendance;
window.updateSingleOrder = updateSingleOrder;
window.addOrder = addOrder;
window.removeOrder = removeOrder;
window.toggleGatheringStatus = toggleGatheringStatus;
window.deleteGathering = deleteGathering;
