// ===== 家庭點餐系統設定檔 =====
// 分享給其他家庭時，只需修改這個檔案

const CONFIG = {
    // === Firebase 設定 ===
    // 到 Firebase Console 建立專案後，複製設定貼到這裡
    firebase: {
        apiKey: "AIzaSyCftNjFmb347SXmukXRiFhrEea0rxduI64",
        authDomain: "family-order-app.firebaseapp.com",
        projectId: "family-order-app",
        storageBucket: "family-order-app.firebasestorage.app",
        messagingSenderId: "172416471032",
        appId: "1:172416471032:web:f16a0e0d82b1519f63500d"
    },

    // === 網站標題 ===
    siteTitle: "惠舜&貞惠's Family",

    // === 密碼設定 ===
    adminPassword: "000000",        // 管理員密碼
    superAdminPassword: "66666666", // 超級管理員密碼

    // === 預設家庭成員 ===
    // 首次使用時會存入 Firebase，之後可在管理員介面修改
    // 如果想要空白開始，設為 []
    defaultFamilyGroups: [
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
    ],

    // === 預設文字（placeholder）===
    placeholders: {
        gatheringName: "例如：2026 春節聚餐",
        restaurant: "例如：里約",
        menuName: "例如：里約菜單"
    }
};
