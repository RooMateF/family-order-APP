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
const ADMIN_PASSWORD = 'family2025'; // 你可以改成自己想要的密碼

// ===== 全域變數 =====
let currentGatheringId = null;
let unsubscribe = null; // Firestore 即時監聽

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
        showScreen('home');
        loadGatherings();
    });
    
    // AI 整理
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
            listEl.innerHTML = '<p class="empty-message">目前沒有進行中的聚餐</p>';
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
    const orderedCount = countOrdered(data.orders || {});
    
    card.innerHTML = `
        <div class="gathering-card-title">${data.name}</div>
        <div class="gathering-card-info">
            📅 ${data.date}${data.restaurant ? ` · 🍽️ ${data.restaurant}` : ''}
        </div>
        <div class="gathering-card-stats">
            <span>👥 ${attendingCount} 人參加</span>
            <span>📝 ${orderedCount} 已點餐</span>
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
            orders: {},
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
        `📅 ${data.date}${data.restaurant ? ` · 🍽️ ${data.restaurant}` : ''}`;
    
    const attendees = data.attendees || {};
    const orders = data.orders || {};
    
    document.getElementById('total-attending').textContent = countAttending(attendees);
    document.getElementById('total-ordered').textContent = countOrdered(orders);
    
    renderFamilyGroups(attendees, orders);
}

function renderFamilyGroups(attendees, orders) {
    const container = document.getElementById('family-groups');
    container.innerHTML = '';
    
    familyGroups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'family-group';
        groupEl.id = `group-${group.id}`;
        
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
    const order = orders[member] || '';
    
    return `
        <div class="member-item">
            <div class="member-row">
                <input type="checkbox" class="member-checkbox" 
                    ${isAttending ? 'checked' : ''} 
                    onchange="updateAttendance('${member}', this.checked)">
                <span class="member-name">${member}</span>
                <span class="member-status ${isAttending ? '' : 'not-attending'}">
                    ${isAttending ? '參加' : '未參加'}
                </span>
            </div>
            <div class="order-input-container">
                <input type="text" class="order-input" 
                    placeholder="輸入餐點..."
                    value="${order}"
                    ${isAttending ? '' : 'disabled'}
                    onchange="updateOrder('${member}', this.value)"
                    onfocus="this.select()">
            </div>
        </div>
    `;
}

function toggleGroup(groupId) {
    const groupEl = document.getElementById(`group-${groupId}`);
    groupEl.classList.toggle('expanded');
}

// ===== 更新出席狀態 =====
async function updateAttendance(member, isAttending) {
    if (!currentGatheringId) return;
    
    try {
        await db.collection('gatherings').doc(currentGatheringId).update({
            [`attendees.${member}`]: isAttending
        });
        
        // 如果取消參加，清空餐點
        if (!isAttending) {
            await db.collection('gatherings').doc(currentGatheringId).update({
                [`orders.${member}`]: firebase.firestore.FieldValue.delete()
            });
        }
    } catch (error) {
        console.error('更新失敗:', error);
    }
}

// ===== 更新餐點 =====
async function updateOrder(member, order) {
    if (!currentGatheringId) return;
    
    try {
        await db.collection('gatherings').doc(currentGatheringId).update({
            [`orders.${member}`]: order.trim()
        });
    } catch (error) {
        console.error('更新餐點失敗:', error);
    }
}

// ===== 計算統計 =====
function countAttending(attendees) {
    return Object.values(attendees).filter(v => v).length;
}

function countOrdered(orders) {
    return Object.values(orders).filter(v => v && v.trim()).length;
}

// ===== AI 整理餐點 =====
function summarizeOrders() {
    db.collection('gatherings').doc(currentGatheringId).get().then(doc => {
        const data = doc.data();
        const orders = data.orders || {};
        const attendees = data.attendees || {};
        
        // 收集所有餐點
        const allItems = [];
        
        Object.entries(orders).forEach(([member, order]) => {
            if (!order || !attendees[member]) return;
            
            // 分割餐點（支援 +、,、、、和、/）
            const items = order.split(/[+,、和/]/).map(s => s.trim()).filter(s => s);
            items.forEach(item => {
                allItems.push({ member, item: normalizeItem(item) });
            });
        });
        
        // 合併相似餐點
        const grouped = groupSimilarItems(allItems);
        
        // 顯示結果
        renderSummary(grouped, attendees, orders);
        showModal('summary');
    });
}

// 標準化餐點名稱
function normalizeItem(item) {
    // 移除多餘空格
    item = item.trim();
    
    // 常見同義詞對照
    const synonyms = {
        // 青醬相關
        '雞肉青醬': '青醬雞肉',
        '雞腿青醬': '青醬雞腿',
        '牛肉青醬': '青醬牛肉',
        '豬肉青醬': '青醬豬肉',
        '海鮮青醬': '青醬海鮮',
        
        // 燉飯
        '飯': '燉飯',
        
        // 湯品
        '牛肉清湯': '牛肉湯',
        '牛肉濃湯': '牛肉湯',
        '玉米濃湯': '玉米湯',
        '玉米清湯': '玉米湯',
        
        // 義大利麵
        '義大利面': '義大利麵',
        '意大利麵': '義大利麵',
        '意大利面': '義大利麵',
    };
    
    // 檢查完全匹配
    if (synonyms[item]) {
        return synonyms[item];
    }
    
    // 排序關鍵字（讓「雞肉青醬燉飯」和「青醬雞肉燉飯」一樣）
    const keywords = extractKeywords(item);
    
    return keywords.sorted + (keywords.suffix || '');
}

function extractKeywords(item) {
    // 定義關鍵字類別
    const sauces = ['青醬', '紅醬', '白醬', '奶油', '蒜香', '茄汁', '咖哩'];
    const proteins = ['雞肉', '雞腿', '牛肉', '豬肉', '海鮮', '鮭魚', '蝦', '蛤蜊', '培根'];
    const bases = ['燉飯', '義大利麵', '披薩', '焗烤', '麵', '飯'];
    const soups = ['湯', '濃湯', '清湯'];
    
    let foundSauce = '';
    let foundProtein = '';
    let foundBase = '';
    let foundSoup = '';
    
    sauces.forEach(s => { if (item.includes(s)) foundSauce = s; });
    proteins.forEach(p => { if (item.includes(p)) foundProtein = p; });
    bases.forEach(b => { if (item.includes(b)) foundBase = b; });
    soups.forEach(s => { if (item.includes(s)) foundSoup = s; });
    
    // 如果是湯品
    if (foundSoup && !foundBase) {
        return { sorted: foundProtein + foundSoup, suffix: '' };
    }
    
    // 標準順序：醬料 + 蛋白質 + 主食
    const sorted = [foundSauce, foundProtein, foundBase].filter(k => k).join('');
    
    return { sorted: sorted || item, suffix: '' };
}

function groupSimilarItems(allItems) {
    const groups = {};
    
    allItems.forEach(({ member, item }) => {
        if (!groups[item]) {
            groups[item] = { count: 0, members: [] };
        }
        groups[item].count++;
        groups[item].members.push(member);
    });
    
    // 轉換成陣列並排序
    return Object.entries(groups)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count);
}

function renderSummary(grouped, attendees, orders) {
    const container = document.getElementById('summary-content');
    
    if (grouped.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;">還沒有人點餐</p>';
        return;
    }
    
    // 餐點統計
    let html = '<div class="summary-section"><h3>📊 餐點統計</h3>';
    grouped.forEach(item => {
        html += `
            <div class="summary-item">
                <span class="summary-item-name">${item.name}</span>
                <span class="summary-item-count">× ${item.count}</span>
            </div>
        `;
    });
    
    const totalItems = grouped.reduce((sum, item) => sum + item.count, 0);
    html += `<div class="summary-total">共 ${totalItems} 份餐點</div>`;
    html += '</div>';
    
    // 個人點餐明細
    html += '<div class="summary-section"><h3>👥 個人明細</h3>';
    Object.entries(orders).forEach(([member, order]) => {
        if (order && attendees[member]) {
            html += `
                <div class="summary-item">
                    <span class="summary-item-name">${member}</span>
                    <span style="color:#666;font-size:0.9rem;">${order}</span>
                </div>
            `;
        }
    });
    html += '</div>';
    
    container.innerHTML = html;
}

function copySummary() {
    db.collection('gatherings').doc(currentGatheringId).get().then(doc => {
        const data = doc.data();
        const orders = data.orders || {};
        const attendees = data.attendees || {};
        
        // 收集並整理餐點
        const allItems = [];
        Object.entries(orders).forEach(([member, order]) => {
            if (!order || !attendees[member]) return;
            const items = order.split(/[+,、和/]/).map(s => s.trim()).filter(s => s);
            items.forEach(item => {
                allItems.push({ member, item: normalizeItem(item) });
            });
        });
        
        const grouped = groupSimilarItems(allItems);
        
        // 產生文字
        let text = `🍽️ ${data.name}\n`;
        text += `📅 ${data.date}${data.restaurant ? ` · ${data.restaurant}` : ''}\n\n`;
        text += `📊 餐點統計：\n`;
        grouped.forEach(item => {
            text += `• ${item.name} × ${item.count}\n`;
        });
        text += `\n共 ${grouped.reduce((sum, item) => sum + item.count, 0)} 份餐點`;
        
        navigator.clipboard.writeText(text).then(() => {
            alert('已複製到剪貼簿！');
        }).catch(() => {
            // 備用方案
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('已複製到剪貼簿！');
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
        alert('密碼錯誤');
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
                    <span style="font-size:0.8rem;color:${data.status === 'active' ? '#27ae60' : '#999'};">
                        [${data.status === 'active' ? '進行中' : '已結束'}]
                    </span>
                </div>
                <div class="gathering-card-info">
                    📅 ${data.date}${data.restaurant ? ` · 🍽️ ${data.restaurant}` : ''}
                </div>
                <div class="gathering-card-stats">
                    <span>👥 ${attendingCount} 人參加</span>
                </div>
                <div class="admin-actions">
                    <button class="btn btn-small ${data.status === 'active' ? 'btn-ghost' : 'btn-secondary'}" 
                        onclick="toggleGatheringStatus('${doc.id}', '${data.status}')">
                        ${data.status === 'active' ? '結束聚餐' : '重新開啟'}
                    </button>
                    <button class="btn btn-small btn-danger" onclick="deleteGathering('${doc.id}')">
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
    if (!confirm('確定要刪除這個聚餐嗎？此操作無法復原。')) return;
    
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
window.updateOrder = updateOrder;
window.toggleGatheringStatus = toggleGatheringStatus;
window.deleteGathering = deleteGathering;
