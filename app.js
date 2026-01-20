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

// ===== Gemini API - 請替換成你的 API Key =====
const GEMINI_API_KEY = 'AIzaSyDOAsJRpYFsaCi76J-uLKJe4Luh0gx8iBg';

// ===== 家庭成員資料 =====
const familyGroups = [
    { id: 'grandparents', name: '阿公阿嬤', members: ['陳惠舜', '林貞惠'] },
    { id: 'family1', name: '世松家', members: ['陳世松', '張秋蓮', '陳昱臻', '陳昱瑋'] },
    { id: 'family2', name: '世賓家', members: ['陳世賓', '鄭瑩', '陳昱婕', '陳宇'] },
    { id: 'family3', name: '慶龍家', members: ['江慶龍', '陳怡君', '江柏宏', '江冠宏'] },
    { id: 'family4', name: '朝慶家', members: ['陳朝慶', '陳一辰', '陳奕豪'] }
];

const ADMIN_PASSWORD = '000000';
const SUPER_ADMIN_PASSWORD = '66666666';

// ===== 全域變數 =====
let currentGatheringId = null;
let currentGatheringData = null;
let unsubscribe = null;
let expandedGroups = new Set();
let isSuperAdmin = false;
let forcedWheelResult = null;
let wheelOptions = [];
let deleteTargetId = null;

const wheelColors = ['#4a5568', '#8b7355', '#6b8e5f', '#a0522d', '#708090', '#5d6d7e', '#7d6544', '#5a7a50'];

// ===== DOM =====
const screens = {
    home: document.getElementById('home-screen'),
    gathering: document.getElementById('gathering-screen'),
    admin: document.getElementById('admin-screen'),
    superAdmin: document.getElementById('super-admin-screen')
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
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('create-gathering-btn').addEventListener('click', () => {
        document.getElementById('gathering-date').valueAsDate = new Date();
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
    document.getElementById('wheel-new-option').addEventListener('keypress', (e) => { if (e.key === 'Enter') addWheelOption(); });
    document.getElementById('spin-wheel-btn').addEventListener('click', spinWheel);
    
    Object.values(modals).forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    });
    
    // 隱藏超級管理員入口 - 點標題5次
    let clicks = 0, timer = null;
    document.querySelector('.app-title').addEventListener('click', () => {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(() => clicks = 0, 2000);
        if (clicks >= 5) { clicks = 0; showModal('superAdmin'); }
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

function createGatheringCard(id, data, showAdminActions) {
    const card = document.createElement('div');
    card.className = 'gathering-card';
    const attending = countAttending(data.attendees || {});
    const orders = countTotalOrders(data.orders || {});
    const isClosed = data.orderStatus === 'closed';
    
    card.innerHTML = `
        <div class="gathering-card-header">
            <div class="gathering-card-title">${data.name}</div>
            ${isClosed ? '<span class="status-badge closed">已結單</span>' : ''}
        </div>
        <div class="gathering-card-info">${data.date}${data.restaurant ? ' · ' + data.restaurant : ''}</div>
        <div class="gathering-card-stats">
            <span>${attending} 人參加</span>
            <span>${orders} 份餐點</span>
        </div>
        ${showAdminActions ? `
            <div class="gathering-card-actions">
                <button class="btn btn-small btn-ghost" onclick="event.stopPropagation(); toggleGatheringStatus('${id}', '${data.status}')">
                    ${data.status === 'active' ? '封存' : '恢復'}
                </button>
                <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); requestDelete('${id}')">刪除</button>
            </div>
        ` : `
            <div class="gathering-card-actions">
                <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); requestDelete('${id}')">刪除</button>
            </div>
        `}
    `;
    card.addEventListener('click', () => openGathering(id));
    return card;
}

function requestDelete(id) { deleteTargetId = id; showModal('delete'); }
async function confirmDelete() {
    if (!deleteTargetId) return;
    try {
        await db.collection('gatherings').doc(deleteTargetId).delete();
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
    if (!name || !date) return alert('請填寫聚餐名稱和日期');
    try {
        await db.collection('gatherings').add({
            name, date, restaurant, status: 'active', orderStatus: 'open',
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
        renderGatheringDetail(currentGatheringData);
    });
}

function renderGatheringDetail(data) {
    document.getElementById('gathering-title').textContent = data.name;
    document.getElementById('gathering-info').textContent = `${data.date}${data.restaurant ? ' · ' + data.restaurant : ''}`;
    
    const statusEl = document.getElementById('gathering-status');
    const isClosed = data.orderStatus === 'closed';
    statusEl.textContent = isClosed ? '已結單' : '點餐中';
    statusEl.className = 'status-badge ' + (isClosed ? 'closed' : 'ordering');
    
    document.getElementById('close-order-btn').textContent = isClosed ? '重新開放點餐' : '結束點餐';
    document.getElementById('total-attending').textContent = countAttending(data.attendees || {});
    document.getElementById('total-ordered').textContent = countTotalOrders(data.orders || {});
    
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
        
        el.innerHTML = `
            <div class="group-header" onclick="toggleGroup('${group.id}')">
                <div><span class="group-title">${group.name}</span><span class="group-count">（${count}/${group.members.length}）</span></div>
                <span class="group-toggle">▼</span>
            </div>
            <div class="group-content">${group.members.map(m => renderMember(m, attendees, orders, canEdit)).join('')}</div>
        `;
        container.appendChild(el);
    });
}

function renderMember(member, attendees, orders, canEdit) {
    const attending = attendees[member] || false;
    const memberOrders = orders[member] || [''];
    const display = memberOrders.length > 0 ? memberOrders : [''];
    
    return `
        <div class="member-item" data-member="${member}">
            <div class="member-row">
                <input type="checkbox" class="member-checkbox" ${attending ? 'checked' : ''} ${canEdit ? '' : 'disabled'}
                    onchange="updateAttendance('${member}', this.checked)">
                <span class="member-name">${member}</span>
                <span class="member-status ${attending ? '' : 'not-attending'}">${attending ? '參加' : '未參加'}</span>
            </div>
            <div class="orders-container">
                ${display.map((o, i) => `
                    <div class="order-item">
                        <input type="text" class="order-input" placeholder="輸入餐點名稱..." value="${o}"
                            ${attending && canEdit ? '' : 'disabled'} data-member="${member}" data-index="${i}"
                            onchange="updateSingleOrder('${member}', ${i}, this.value)">
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

async function updateAttendance(member, attending) {
    if (!currentGatheringId) return;
    const updates = { [`attendees.${member}`]: attending };
    if (!attending) updates[`orders.${member}`] = firebase.firestore.FieldValue.delete();
    else updates[`orders.${member}`] = [''];
    await db.collection('gatherings').doc(currentGatheringId).update(updates);
}

async function updateSingleOrder(member, index, value) {
    if (!currentGatheringId) return;
    const doc = await db.collection('gatherings').doc(currentGatheringId).get();
    const orders = doc.data().orders || {};
    const arr = orders[member] || [''];
    arr[index] = value.trim();
    await db.collection('gatherings').doc(currentGatheringId).update({ [`orders.${member}`]: arr });
}

async function addOrder(member) {
    if (!currentGatheringId) return;
    const doc = await db.collection('gatherings').doc(currentGatheringId).get();
    const arr = doc.data().orders?.[member] || [];
    arr.push('');
    await db.collection('gatherings').doc(currentGatheringId).update({ [`orders.${member}`]: arr });
}

async function removeOrder(member, index) {
    if (!currentGatheringId) return;
    const doc = await db.collection('gatherings').doc(currentGatheringId).get();
    const arr = doc.data().orders?.[member] || [];
    arr.splice(index, 1);
    if (arr.length === 0) arr.push('');
    await db.collection('gatherings').doc(currentGatheringId).update({ [`orders.${member}`]: arr });
}

async function toggleOrderStatus() {
    if (!currentGatheringId || !currentGatheringData) return;
    const newStatus = currentGatheringData.orderStatus === 'closed' ? 'open' : 'closed';
    await db.collection('gatherings').doc(currentGatheringId).update({ orderStatus: newStatus });
}

function countAttending(a) { return Object.values(a).filter(v => v).length; }
function countTotalOrders(o) {
    let c = 0;
    Object.values(o).forEach(arr => { if (Array.isArray(arr)) c += arr.filter(x => x && x.trim()).length; });
    return c;
}

// ===== AI 統計 =====
async function summarizeOrders() {
    const data = currentGatheringData;
    if (!data) return;
    const orders = data.orders || {};
    const attendees = data.attendees || {};
    
    const allItems = [];
    const details = [];
    Object.entries(orders).forEach(([member, arr]) => {
        if (!attendees[member] || !Array.isArray(arr)) return;
        const valid = arr.filter(x => x && x.trim());
        if (valid.length > 0) {
            details.push({ member, orders: valid });
            valid.forEach(item => allItems.push(item.trim()));
        }
    });
    
    let grouped;
    if (GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE') {
        grouped = await summarizeWithAI(allItems);
    } else {
        grouped = simpleSummarize(allItems);
    }
    
    renderSummary(grouped, details);
    showModal('summary');
}

function simpleSummarize(items) {
    const map = {};
    items.forEach(item => { map[item] = (map[item] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

async function summarizeWithAI(items) {
    if (items.length === 0) return [];
    
    const prompt = `你是餐點整理助手。請將以下餐點清單整理並合併相似項目。
例如「青醬雞肉燉飯」和「雞肉青醬燉飯」應該合併為同一項。
請直接回傳 JSON 格式，不要有其他文字：
[{"name": "餐點名稱", "count": 數量}, ...]

餐點清單：
${items.join('\n')}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { console.error('AI 統計失敗:', e); }
    
    return simpleSummarize(items);
}

function renderSummary(items, details) {
    const container = document.getElementById('summary-content');
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#9a9285;padding:20px;">尚無餐點資料</p>';
        return;
    }
    
    let html = '<div class="summary-section"><h3>餐點統計</h3>';
    items.forEach(i => {
        html += `<div class="summary-item"><span class="summary-item-name">${i.name}</span><span class="summary-item-count">x ${i.count}</span></div>`;
    });
    html += `<div class="summary-total">共 ${items.reduce((s, i) => s + i.count, 0)} 份餐點</div></div>`;
    
    html += '<div class="summary-section"><h3>個人明細</h3>';
    details.forEach(d => {
        html += `<div class="summary-item"><span class="summary-item-name">${d.member}</span><span style="color:#6b655a;font-size:0.9rem;">${d.orders.join('、')}</span></div>`;
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
    Object.entries(orders).forEach(([m, arr]) => {
        if (attendees[m] && Array.isArray(arr)) arr.filter(x => x && x.trim()).forEach(i => items.push(i.trim()));
    });
    
    const grouped = simpleSummarize(items);
    let text = `${data.name}\n${data.date}${data.restaurant ? ' · ' + data.restaurant : ''}\n\n餐點統計：\n`;
    grouped.forEach(i => text += `- ${i.name} x ${i.count}\n`);
    text += `\n共 ${grouped.reduce((s, i) => s + i.count, 0)} 份餐點`;
    
    navigator.clipboard.writeText(text).then(() => alert('已複製')).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('已複製');
    });
}

// ===== 輪盤 =====
function loadWheelOptions() {
    const saved = localStorage.getItem('wheelOptions');
    wheelOptions = saved ? JSON.parse(saved) : [];
    renderWheelOptions();
    buildWheel();
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
    buildWheel();
    input.value = '';
}

function removeWheelOption(i) {
    wheelOptions.splice(i, 1);
    saveWheelOptions();
    renderWheelOptions();
    buildWheel();
}

function buildWheel() {
    const inner = document.getElementById('wheel-inner');
    inner.innerHTML = '';
    inner.style.transform = 'rotate(0deg)';
    if (wheelOptions.length === 0) return;
    
    const angle = 360 / wheelOptions.length;
    wheelOptions.forEach((opt, i) => {
        const seg = document.createElement('div');
        seg.className = 'wheel-segment';
        seg.style.backgroundColor = wheelColors[i % wheelColors.length];
        seg.style.transform = `rotate(${i * angle - 90}deg) skewY(${90 - angle}deg)`;
        
        const txt = document.createElement('div');
        txt.className = 'wheel-segment-text';
        txt.textContent = opt;
        txt.style.transform = `skewY(${angle - 90}deg) rotate(${angle / 2}deg)`;
        
        seg.appendChild(txt);
        inner.appendChild(seg);
    });
}

function spinWheel() {
    if (wheelOptions.length < 2) return alert('請至少新增 2 個選項');
    
    const inner = document.getElementById('wheel-inner');
    const result = document.getElementById('wheel-result');
    result.classList.remove('show');
    
    let winIndex;
    if (forcedWheelResult) {
        winIndex = wheelOptions.findIndex(o => o === forcedWheelResult);
        if (winIndex === -1) winIndex = Math.floor(Math.random() * wheelOptions.length);
    } else {
        winIndex = Math.floor(Math.random() * wheelOptions.length);
    }
    
    const angle = 360 / wheelOptions.length;
    const target = 360 - (winIndex * angle + angle / 2);
    const total = 5 * 360 + target;
    
    inner.style.transition = 'none';
    inner.style.transform = 'rotate(0deg)';
    void inner.offsetWidth;
    inner.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    inner.style.transform = `rotate(${total}deg)`;
    
    setTimeout(() => {
        result.textContent = `結果：${wheelOptions[winIndex]}`;
        result.classList.add('show');
    }, 4000);
}

function setForcedResult() {
    const val = document.getElementById('forced-wheel-result').value.trim();
    if (!val) return;
    forcedWheelResult = val;
    document.getElementById('forced-result-status').textContent = `已設定強制結果：${val}`;
}

function clearForcedResult() {
    forcedWheelResult = null;
    document.getElementById('forced-wheel-result').value = '';
    document.getElementById('forced-result-status').textContent = '已清除強制設定';
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
            card.addEventListener('click', () => { isSuperAdmin = true; openGathering(doc.id); });
            list.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

async function toggleGatheringStatus(id, status) {
    await db.collection('gatherings').doc(id).update({ status: status === 'active' ? 'archived' : 'active' });
    loadAdminGatherings();
    loadSuperAdminGatherings();
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
