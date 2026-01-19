// app.js

// ===== 1. 全域變數新增 =====
let isSuperAdmin = false;
let currentRouletteItems = []; // 暫存輪盤選項，實際應用建議存入 Firestore
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"; // ⚠️ 請在此填入你的 API Key

// ===== 2. 超級管理員邏輯 (Konami Code 或簡單密碼) =====
document.getElementById('super-admin-trigger').addEventListener('click', () => {
    const password = prompt("請輸入宗主密碼："); // 簡單驗證
    if (password === "admin888") { // 自訂密碼
        isSuperAdmin = true;
        alert("歡迎歸來，宗主。權限已解鎖。");
        document.body.classList.add('super-admin-mode');
        document.getElementById('admin-rigging-panel').style.display = 'block';
        
        // 重新渲染當前畫面以解鎖輸入框
        if (currentGatheringId) {
            loadGatheringDetails(currentGatheringId);
        }
    }
});

// ===== 3. 修改 loadGatheringDetails (權限鎖定邏輯) =====
// 找到原本的 loadGatheringDetails，在 render 訂單輸入框的地方加入檢查
function renderOrderInputs(data) {
    // ... 原本的迴圈 ...
    const isLocked = data.status === 'ended' && !isSuperAdmin;
    
    // 在生成 input HTML 時：
    // <input type="text" ... ${isLocked ? 'disabled class="locked-input"' : ''} ...>
    // <button ... ${isLocked ? 'disabled style="display:none"' : ''} ...>
}

// 另外，修改「結束聚餐」的邏輯，只有管理員可以重啟，但任何人可以結束？
// 需求 3：結單後只有超級管理員能修改。
// 確保 Firestore 寫入規則 (Security Rules) 或前端邏輯擋住非管理員寫入。

// ===== 4. 需求 1：任何人都能刪除 (原本是 Admin Only) =====
// 將 deleteGathering 按鈕加入到 Main Screen (首頁) 的列表渲染中
function renderGatheringList(snapshot) {
    // ... 原本的 card 生成 ...
    // 在 card 的 action 區塊加入刪除按鈕，不再檢查權限
    /*
    <button class="btn-icon delete-btn" onclick="event.stopPropagation(); deleteGathering('${doc.id}')">
        🗑️
    </button>
    */
}

// ===== 5. 需求 2：命運輪盤 & 作弊功能 =====
function addRouletteItem() {
    const input = document.getElementById('roulette-input');
    if (input.value.trim()) {
        currentRouletteItems.push(input.value.trim());
        input.value = '';
        drawWheel(); // 重繪轉盤
        // 建議：這裡應該要 update 到 Firestore 的 gathering document 下，讓大家同步
        // db.collection('gatherings').doc(currentGatheringId).update({ roulette: currentRouletteItems });
    }
}

function drawWheel() {
    const wheel = document.getElementById('wheel');
    wheel.innerHTML = '';
    const sliceAngle = 360 / currentRouletteItems.length;
    
    currentRouletteItems.forEach((item, index) => {
        // 使用 CSS conic-gradient 或建立多個 div 旋轉來製作扇形
        // 這裡為了簡單，用 JS 動態生成 conic-gradient string
        // 實際實作建議用 Canvas 或 SVG 會比較美觀，但 CSS gradient 最快
    });
    
    // 簡易 CSS 更新
    let gradientStr = currentRouletteItems.map((item, index) => {
        const start = index * (100 / currentRouletteItems.length);
        const end = (index + 1) * (100 / currentRouletteItems.length);
        const color = index % 2 === 0 ? '#f9f7f2' : '#e0dcd3'; // 米色與深米色交替
        return `${color} ${start}% ${end}%`;
    }).join(', ');
    
    wheel.style.background = `conic-gradient(${gradientStr})`;
}

function spinWheel() {
    const container = document.getElementById('wheel-container');
    const riggedIndex = document.getElementById('rigged-index').value;
    
    let stopAtAngle;
    
    if (isSuperAdmin && riggedIndex !== '') {
        // 作弊模式：計算需要停在哪個角度才能指到 riggedIndex
        const count = currentRouletteItems.length;
        const sliceDeg = 360 / count;
        // 簡單計算：目標反向旋轉
        stopAtAngle = 360 * 5 + (360 - (riggedIndex * sliceDeg)); 
    } else {
        // 隨機模式
        stopAtAngle = 360 * 5 + Math.random() * 360;
    }
    
    container.style.transform = `rotate(${stopAtAngle}deg)`;
    
    // 顯示結果
    setTimeout(() => {
        // 計算落點邏輯...
        alert("命運決定了！吃這個！");
    }, 4000);
}


// ===== 6. 需求 AI：Gemini 整合 =====
async function summarizeOrdersWithAI() {
    const btn = document.getElementById('ai-organize-btn');
    btn.textContent = "🤖 思考中...";
    btn.disabled = true;

    // 1. 蒐集所有訂單字串
    let allOrders = [];
    // 假設 currentGatheringData 已載入
    Object.values(currentGatheringData.orders).forEach(userOrders => {
        allOrders = allOrders.concat(userOrders);
    });

    // 2. 準備 Prompt
    const prompt = `
        你是一個專業的餐飲統計員。以下是一份混亂的點餐清單：
        ${JSON.stringify(allOrders)}
        
        請幫我整理成乾淨的 JSON 格式。
        規則：
        1. 合併相似餐點 (例如 "青醬雞肉飯" 和 "雞肉青醬燉飯" 視為同一類，除非有明顯不同)。
        2. 提取 "主食" 和 "備註/飲料/湯品"。
        3. 輸出格式必須是 JSON Array: [{ "item": "標準品名", "count": 數量, "notes": ["相關備註1", "相關備註2"] }]
        4. 不要輸出 Markdown，只要純 JSON。
    `;

    try {
        // 3. 呼叫 Gemini API (REST API)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;
        
        // 清理 Markdown code block (如果有)
        const jsonStr = aiText.replace(/```json|```/g, '').trim();
        const result = JSON.parse(jsonStr);

        // 4. 渲染結果
        renderAISummary(result);

    } catch (error) {
        console.error("AI 出錯:", error);
        alert("AI 腦袋打結了，請稍後再試。");
    } finally {
        btn.textContent = "✨ AI 智慧整理 (Gemini)";
        btn.disabled = false;
    }
}

function renderAISummary(data) {
    const container = document.getElementById('summary-content');
    container.innerHTML = '<h3>🤖 AI 智慧整理結果</h3>';
    
    data.forEach(group => {
        const div = document.createElement('div');
        div.className = 'summary-item';
        div.innerHTML = `
            <span class="summary-item-name">${group.item} 
                <small style="color:#888; display:block; font-size:0.8em">${group.notes.join(', ')}</small>
            </span>
            <span class="summary-item-count">${group.count}</span>
        `;
        container.appendChild(div);
    });
}
