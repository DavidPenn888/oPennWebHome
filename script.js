const DEFAULT_ENGINES = {
    bing: { name: "必应", url: "https://www.bing.com/search?q=" },
    google: { name: "谷歌", url: "https://www.google.com/search?q=" },
    baidu: { name: "百度", url: "https://www.baidu.com/s?wd=" }
};

const DEFAULTS = {
    title: "主页",
    theme: "auto",
    transparentHeader: false,
    headerTextColor: "auto",
    headerShadow: false,
    showQuickAdd: true,
    defaultSearchEngine: "bing",
    customEngines: {},
    bgType: "theme",
    bgValue: "",
    bgColorRGB: { r: 255, g: 255, b: 255 },
    showWeather: false,
    weatherLocationMode: "auto", // auto or manual
    weatherManualCity: "",
    weatherCache: null,
    storage: {
        type: "local", // local or cloudflare
        cloudflare: {
            apiUrl: "",
            apiKey: ""
        }
    },
    links: [
        { name: "Google", url: "https://google.com" },
        { name: "Bilibili", url: "https://bilibili.com" },
        { name: "GitHub", url: "https://github.com" },
    ]
};

let appData = {};
let allEngines = {};
let isSortMode = false;
let currentBgType = 'color';
let currentFolderPath = [];
let isDragDropMode = false;
let selectedItems = new Set(); // 存储选中的项目索引

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    mergeEngines();
    applyTheme();
    applyHeaderTextColor();
    applyHeaderTransparent();
    await applyBackground();
    renderTitle();
    renderSearchDropdowns();
    renderIcons();
    renderLinksList();
    renderEnginesList();
    initSettingsListeners();
    initSortListeners();
    initBgTabs();
    applyWeatherUI();
    
    // 初始化当前文件夹显示
    updateCurrentFolderDisplay();
    
    // 初始化当前文件夹点击事件
    initCurrentFolderListener();
    
    // 初始化自动刷新机制
    setupDataRefresh();

});

async function loadData() {
    try {
        // 先从本地存储加载基础配置，包括存储方式
        let stored = localStorage.getItem('myHomePageData');
        let tempData = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULTS));
        
        // 如果存储方式是CloudFlare KV，尝试从KV加载数据
        if (tempData.storage && tempData.storage.type === 'cloudflare') {
            try {
                // 检查CloudFlare KV配置是否完整
                if (tempData.storage.cloudflare && tempData.storage.cloudflare.apiUrl && tempData.storage.cloudflare.apiKey) {
                    const kvData = await loadFromCloudflareKV(tempData.storage.cloudflare);
                    if (kvData) {
                        // 验证KV数据结构的完整性
                        if (validateDataStructure(kvData)) {
                            // 保留本地的CloudFlare配置，不被KV数据覆盖
                            kvData.storage.cloudflare = tempData.storage.cloudflare;
                            appData = kvData;
                            // 确保数据完整性
                            ensureDataIntegrity();
                            // 同时更新本地存储，作为备份
                            localStorage.setItem('myHomePageData', JSON.stringify(appData));
                            return;
                        } else {
                            console.error('CloudFlare KV数据结构不完整，使用本地存储');
                        }
                    }
                } else {
                    console.error('CloudFlare KV配置不完整，使用本地存储');
                }
            } catch (e) {
                console.error('从CloudFlare KV加载失败，使用本地存储:', e);
                // 加载失败时，保持存储类型为'cloudflare'，只使用本地存储的数据
                // 这样用户的CloudFlare配置不会丢失
                localStorage.setItem('myHomePageData', JSON.stringify(tempData));
                appData = tempData;
                ensureDataIntegrity();
                return;
            }
        }
        
        // 使用本地存储或默认数据
        appData = tempData;
        // 确保所有必要的字段都存在
        ensureDataIntegrity();
    } catch (e) {
        console.error('加载数据失败，使用默认数据:', e);
        appData = JSON.parse(JSON.stringify(DEFAULTS));
    }
}

// 验证数据结构的完整性
function validateDataStructure(data) {
    return data && 
           typeof data === 'object' &&
           Array.isArray(data.links) &&
           typeof data.storage === 'object' &&
           typeof data.storage.type === 'string';
}

// 确保数据完整性
function ensureDataIntegrity() {
    if(!appData.defaultSearchEngine) appData.defaultSearchEngine = DEFAULTS.defaultSearchEngine;
    if(!appData.customEngines) appData.customEngines = {};
    if(!appData.links) appData.links = DEFAULTS.links;
    if(!appData.theme) appData.theme = DEFAULTS.theme;
    if(appData.transparentHeader === undefined) appData.transparentHeader = false;
    if(appData.headerTextColor === undefined) appData.headerTextColor = "auto";
    if(appData.headerShadow === undefined) appData.headerShadow = false;
    if(appData.showQuickAdd === undefined) appData.showQuickAdd = true;
    if(!appData.bgColorRGB) appData.bgColorRGB = { r: 255, g: 255, b: 255 };
    if(appData.showWeather === undefined) appData.showWeather = DEFAULTS.showWeather;
    if(!appData.weatherLocationMode) appData.weatherLocationMode = DEFAULTS.weatherLocationMode;
    if(!appData.weatherManualCity) appData.weatherManualCity = DEFAULTS.weatherManualCity;
    if(!appData.storage) appData.storage = JSON.parse(JSON.stringify(DEFAULTS.storage));
    if(!appData.storage.cloudflare) appData.storage.cloudflare = JSON.parse(JSON.stringify(DEFAULTS.storage.cloudflare));
    // 保留已有的CloudFlare配置，不被默认值覆盖
    // 如果storage.type为cloudflare，确保cloudflare配置存在
    if(appData.storage.type === 'cloudflare' && !appData.storage.cloudflare) {
        appData.storage.cloudflare = {};
    }
}

async function loadFromCloudflareKV(config) {
    let { apiUrl, apiKey } = config;
    if (!apiUrl || !apiKey) {
        throw new Error('CloudFlare KV 配置不完整');
    }
    
    // 自动添加 /api/myHomePageData 后缀
    if (!apiUrl.endsWith('/api/myHomePageData')) {
        apiUrl = apiUrl.replace(/\/$/, '') + '/api/myHomePageData';
    }
    
    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        }
    });
    
    if (!response.ok) {
        if (response.status === 404) {
            return null; // 数据不存在，返回null
        }
        throw new Error('CloudFlare KV 加载失败');
    }
    
    const data = await response.json();
    return data;
}

async function fetchDailyImage() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const cached = localStorage.getItem('dailyImageData');

    if (cached) {
        const { date, data } = JSON.parse(cached);
        if (date === today && data && data.url) {
            return data; // Return cached data if it's for today
        }
    }

    try {
        const response = await fetch('https://bing.biturl.top/?resolution=UHD&format=json&index=0&mkt=zh-CN');
        if (!response.ok) throw new Error('Network response was not ok.');
        
        const data = await response.json();
        if (data && data.url) {
            // Prepend bing.com to the URL if it's relative
            if (data.url.startsWith('/th?id=')) {
                data.url = 'https://www.bing.com' + data.url;
            }

            localStorage.setItem('dailyImageData', JSON.stringify({ date: today, data }));
            return data;
        }
    } catch (error) {
        console.error("Failed to fetch daily image:", error);
        return null; // Return null on error
    }
}

async function saveData() {
    try {
        if (appData.storage.type === 'local') {
            localStorage.setItem('myHomePageData', JSON.stringify(appData));
        } else if (appData.storage.type === 'cloudflare') {
            await saveToCloudflareKV();
            // 保存成功后，同时更新本地存储作为备份
            localStorage.setItem('myHomePageData', JSON.stringify(appData));
        }
        // 保存成功后，触发数据刷新
        triggerDataRefresh();
    } catch (e) {
        alert("存储失败！" + e.message);
        // 如果是CloudFlare KV保存失败，保持存储类型为'cloudflare'，但保存到本地存储作为备份
        if (appData.storage.type === 'cloudflare') {
            // 保持存储类型为'cloudflare'，这样用户的CloudFlare配置不会丢失
            localStorage.setItem('myHomePageData', JSON.stringify(appData));
            alert('已保存到本地存储作为备份，但仍保持CloudFlare KV模式');
        }
    }
}

// 自动刷新机制
let dataRefreshInterval = null;

function setupDataRefresh() {
    // 清除现有的定时器
    if (dataRefreshInterval) {
        clearInterval(dataRefreshInterval);
    }
    
    // 如果使用CloudFlare KV，设置定时刷新
    if (appData.storage.type === 'cloudflare') {
        // 每30秒刷新一次数据
        dataRefreshInterval = setInterval(async () => {
            // 检查CloudFlare KV配置是否完整
            if (appData.storage.cloudflare && appData.storage.cloudflare.apiUrl && appData.storage.cloudflare.apiKey) {
                try {
                    await loadData();
                    renderIcons();
                    updateCurrentFolderDisplay();
                } catch (e) {
                    console.error('定时刷新数据失败:', e);
                }
            }
        }, 30000);
    }
}

function triggerDataRefresh() {
    // 手动触发数据刷新
    if (appData.storage.type === 'cloudflare') {
        // 检查CloudFlare KV配置是否完整
        if (appData.storage.cloudflare && appData.storage.cloudflare.apiUrl && appData.storage.cloudflare.apiKey) {
            loadData().then(() => {
                renderIcons();
                updateCurrentFolderDisplay();
            }).catch(e => {
                console.error('手动刷新数据失败:', e);
            });
        }
    }
}

// 在存储方式变更时重新设置刷新机制
function updateStorageType(type) {
    appData.storage.type = type;
    setupDataRefresh();
}

async function saveToCloudflareKV() {
    let { apiUrl, apiKey } = appData.storage.cloudflare;
    if (!apiUrl || !apiKey) {
        throw new Error('CloudFlare KV 配置不完整');
    }
    
    // 验证数据结构的完整性
    if (!validateDataStructure(appData)) {
        throw new Error('数据结构不完整，无法保存到CloudFlare KV');
    }
    
    // 自动添加 /api/myHomePageData 后缀
    if (!apiUrl.endsWith('/api/myHomePageData')) {
        apiUrl = apiUrl.replace(/\/$/, '') + '/api/myHomePageData';
    }
    
    try {
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(appData)
        });
        
        if (!response.ok) {
            throw new Error(`CloudFlare KV 存储失败: ${response.status} ${response.statusText}`);
        }
    } catch (e) {
        console.error('保存到CloudFlare KV失败:', e);
        throw e;
    }
}

function mergeEngines() {
    allEngines = { ...DEFAULT_ENGINES, ...appData.customEngines };
}

function renderTitle() {
    document.getElementById('page-title').innerText = appData.title;
    document.getElementById('title-input').value = appData.title;
}

function renderSearchDropdowns() {
    const searchSelect = document.getElementById('search-engine-select');
    const defaultSelect = document.getElementById('default-search-engine');
    searchSelect.innerHTML = '';
    defaultSelect.innerHTML = '';
    for (const [key, engine] of Object.entries(allEngines)) {
        const opt1 = document.createElement('option'); opt1.value = key; opt1.text = engine.name;
        searchSelect.appendChild(opt1);
        const opt2 = document.createElement('option'); opt2.value = key; opt2.text = engine.name;
        defaultSelect.appendChild(opt2);
    }
    searchSelect.value = appData.defaultSearchEngine;
    defaultSelect.value = appData.defaultSearchEngine;
    updateSearchPlaceholder();
}

function updateSearchPlaceholder() {
    const searchSelect = document.getElementById('search-engine-select');
    const engine = allEngines[searchSelect.value];
    document.getElementById('search-input').placeholder = engine ? `${engine.name}搜索` : "搜索...";
}
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search-engine-select').addEventListener('change', updateSearchPlaceholder);
});

window.handleSearch = function(e) {
    e.preventDefault();
    const input = document.getElementById('search-input');
    const query = input.value.trim();
    if (query) {
        const engine = allEngines[document.getElementById('search-engine-select').value];
        if (engine) {
            window.open(engine.url + encodeURIComponent(query), '_blank');
            input.value = '';
        }
    }
    return false;
}

function renderIcons() {
    const grid = document.getElementById('icon-grid');
    grid.innerHTML = '';
    
    // 在移动版中恢复天气组件（仅在根目录且非编辑模式）
    if (window.innerWidth <= 768 && !isSortMode) {
        const weatherWidget = document.getElementById('weather-widget');
        if (weatherWidget) {
            weatherWidget.style.display = 'flex';
        }
    }
    
    appData.links.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'icon-card';
        if (isSortMode) card.classList.add('sorting-mode');
        
        if (isSortMode) {
            card.draggable = true;
            card.dataset.index = index;
            card.dataset.type = item.type || 'link';
            
            // 删除按钮 (左上角)
            const delBtn = document.createElement('div');
            delBtn.className = 'sort-delete-btn';
            delBtn.innerHTML = '×';
            delBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteLink(index);
            };
            card.appendChild(delBtn);
            
            // 编辑按钮 (右上角) - 新增
            const editBtn = document.createElement('div');
            editBtn.className = 'sort-edit-btn';
            editBtn.innerHTML = '✎';
            editBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (item.type === 'folder') {
                    openFolderEditModal(index);
                } else {
                    openIconEditModal(index);
                }
            };
            card.appendChild(editBtn);
            
            // 选择状态指示器 (左下角)
            const selectIndicator = document.createElement('div');
            selectIndicator.className = 'select-indicator';
            if (selectedItems.has(index)) {
                selectIndicator.classList.add('selected');
            }
            selectIndicator.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleItemSelection(index);
            };
            card.appendChild(selectIndicator);
            
            // 点击卡片切换选择状态
            card.onclick = (e) => {
                e.preventDefault();
                toggleItemSelection(index);
            };
            
            // 鼠标事件
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('drop', handleDrop);
            card.addEventListener('dragend', handleDragEnd);
            
            // 触摸事件
            card.addEventListener('touchstart', handleTouchStart, { passive: false });
            card.addEventListener('touchmove', handleTouchMove, { passive: false });
            card.addEventListener('touchend', handleTouchEnd, { passive: false });
        } else {
            if (item.type === 'folder') {
                card.onclick = () => {
                    openFolder(index);
                };
                card.style.cursor = 'pointer';
            } else {
                card.onclick = () => {
                    window.open(item.url, '_blank');
                };
                card.style.cursor = 'pointer';
            }
        }
        
        const box = document.createElement('div');
        box.className = 'icon-box';
        if (item.type === 'folder') {
            box.innerText = '📁';
        } else {
            const firstChar = item.name.charAt(0).toUpperCase();
            box.innerText = firstChar;
        }
        card.appendChild(box);
        
        const span = document.createElement('span');
        span.innerText = item.name;
        card.appendChild(span);
        
        grid.appendChild(card);
    });



    if (appData.showQuickAdd) {
        const addCard = document.createElement('div');
        addCard.className = 'icon-card add-card';
        addCard.onclick = () => {
            document.getElementById('quick-add-modal').style.display = 'block';
            document.getElementById('quick-link-name').value = '';
            document.getElementById('quick-link-url').value = '';
            document.getElementById('quick-link-name').focus();
        };
        
        const box = document.createElement('div');
        box.className = 'icon-box';
        box.innerText = '+';
        addCard.appendChild(box);
        
        const span = document.createElement('span');
        span.innerText = '添加';
        addCard.appendChild(span);
        
        grid.appendChild(addCard);
    }
}

function applyTheme() {
    const body = document.body;
    const themeLightBtn = document.getElementById('theme-light');
    const themeAutoBtn = document.getElementById('theme-auto');
    const themeDarkBtn = document.getElementById('theme-dark');
    
    themeLightBtn.classList.remove('active');
    themeAutoBtn.classList.remove('active');
    themeDarkBtn.classList.remove('active');
    
    if (appData.theme === 'dark') {
        body.classList.add('dark-mode');
        themeDarkBtn.classList.add('active');
    } else if (appData.theme === 'light') {
        body.classList.remove('dark-mode');
        themeLightBtn.classList.add('active');
    } else {
        themeAutoBtn.classList.add('active');
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            body.classList.add('dark-mode');
        } else {
            body.classList.remove('dark-mode');
        }
    }
    
    applyHeaderTextColor();
}

function applyHeaderTextColor() {
    const header = document.getElementById('top-bar');
    const textAutoBtn = document.getElementById('header-text-auto');
    const textLightBtn = document.getElementById('header-text-light');
    const textDarkBtn = document.getElementById('header-text-dark');
    
    textAutoBtn.classList.remove('active');
    textLightBtn.classList.remove('active');
    textDarkBtn.classList.remove('active');
    
    header.classList.remove('header-text-light');
    header.classList.remove('header-text-dark');
    
    if (appData.headerTextColor === 'light') {
        header.classList.add('header-text-light');
        textLightBtn.classList.add('active');
    } else if (appData.headerTextColor === 'dark') {
        header.classList.add('header-text-dark');
        textDarkBtn.classList.add('active');
    } else {
        textAutoBtn.classList.add('active');
        if (document.body.classList.contains('dark-mode')) {
            header.classList.add('header-text-light');
        } else {
            header.classList.add('header-text-dark');
        }
    }
}

function applyHeaderTransparent() {
    const header = document.getElementById('top-bar');
    const options = document.getElementById('transparent-options');

    if (appData.transparentHeader) {
        header.classList.add('transparent');
        options.style.display = 'block';

        if (appData.headerShadow) {
            header.classList.add('header-shadow');
        } else {
            header.classList.remove('header-shadow');
        }
    } else {
        header.classList.remove('transparent');
        header.classList.remove('header-shadow'); // Also remove shadow when transparent is off
        options.style.display = 'none';
    }
}

function applyWeatherUI() {
    const widget = document.getElementById('weather-widget');
    if (appData.showWeather) {
        widget.style.display = 'block';
        fetchAndRenderWeather();
    } else {
        widget.style.display = 'none';
    }
}

function getWeatherDescription(code) {
    const descriptions = {
        0: { text: '晴', icon: '☀️' },
        1: { text: '基本晴朗', icon: '🌤️' },
        2: { text: '局部多云', icon: '⛅️' },
        3: { text: '阴', icon: '☁️' },
        45: { text: '雾', icon: '🌫️' },
        48: { text: '霜', icon: '🌫️' },
        51: { text: '小雨', icon: '🌦️' },
        53: { text: '中雨', icon: '🌦️' },
        55: { text: '大雨', icon: '🌦️' },
        61: { text: '小雨', icon: '🌧️' },
        63: { text: '中雨', icon: '🌧️' },
        65: { text: '大雨', icon: '🌧️' },
        80: { text: '阵雨', icon: '🌧️' },
        81: { text: '大阵雨', icon: '🌧️' },
        82: { text: '暴力阵雨', icon: '🌧️' },
        95: { text: '雷暴', icon: '⛈️' },
        96: { text: '雷暴伴有冰雹', icon: '⛈️' },
        99: { text: '雷暴伴有冰雹', icon: '⛈️' }
    };
    return descriptions[code] || { text: '未知', icon: '' };
}

async function fetchAndRenderWeather() {
    const widget = document.getElementById('weather-widget');
    widget.textContent = '加载中...';

    try {
        let lat, lon, city;
        if (appData.weatherLocationMode === 'auto') {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
            });
            lat = position.coords.latitude;
            lon = position.coords.longitude;
            city = '当前位置';
        } else {
            if (!appData.weatherManualCity) {
                widget.textContent = '请设置城市';
                return;
            }
            // Use a geocoding API to get lat/lon from city name
            const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(appData.weatherManualCity)}&count=1&language=zh-CN&format=json`);
            const geoData = await geoResponse.json();
            if (!geoData.results || geoData.results.length === 0) {
                throw new Error('找不到城市');
            }
            lat = geoData.results[0].latitude;
            lon = geoData.results[0].longitude;
            city = geoData.results[0].name;
        }

        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`);
        const weatherData = await weatherResponse.json();

        if (weatherData && weatherData.current_weather && weatherData.daily) {
            const current = weatherData.current_weather;
            const daily = weatherData.daily;
            const temp = Math.round(current.temperature);
            const maxTemp = Math.round(daily.temperature_2m_max[0]);
            const minTemp = Math.round(daily.temperature_2m_min[0]);
            const weatherDesc = getWeatherDescription(current.weathercode);

            if (window.innerWidth <= 768) {
                widget.innerHTML = `<span>${minTemp}°~${maxTemp}°C &nbsp; ${weatherDesc.icon}</span>`;
            } else {
                // Desktop view: two lines
                widget.innerHTML = `
                    <div class="weather-line-1">
                        <span>${temp}°C</span>
                        <span>${weatherDesc.icon} ${weatherDesc.text}</span>
                    </div>
                    <div class="weather-line-2">今日 ${minTemp}° ~ ${maxTemp}°C</div>
                `;
            }
        } else {
            throw new Error('天气数据格式不完整');
        }
    } catch (error) {
        widget.textContent = `天气加载失败`;
        console.error("Weather fetch error:", error);
    }
}

async function applyBackground() {
    const bgLayer = document.getElementById('bg-layer');
    
    bgLayer.style.backgroundImage = 'none';
    bgLayer.style.backgroundColor = 'transparent';

    if (appData.bgType === 'color') {
        bgLayer.style.backgroundColor = appData.bgValue || 'transparent';
    } else if (appData.bgType === 'daily') {
        const dailyImg = await fetchDailyImage();
        if (dailyImg && dailyImg.url) {
            bgLayer.style.backgroundImage = `url('${dailyImg.url}')`;
        }
    } else if (['url', 'local', 'base64'].includes(appData.bgType)) {
        if (appData.bgValue) {
            bgLayer.style.backgroundImage = `url('${appData.bgValue}')`;
        }
    }
}

function renderLinksList() {
    const list = document.getElementById('links-list');
    list.innerHTML = '';
    appData.links.forEach((link, index) => {
        const item = document.createElement('div');
        item.className = 'link-item';
        item.innerHTML = `<span>${link.name}</span><div><button class="btn-action btn-edit" onclick="prepareEdit(${index})">修改</button><button class="btn-action btn-delete" onclick="deleteLink(${index})">删除</button></div>`;
        list.appendChild(item);
    });
}

function renderEnginesList() {
    const list = document.getElementById('engines-list');
    if (!list) return;
    list.innerHTML = '';
    for (const [key, engine] of Object.entries(appData.customEngines)) {
        const item = document.createElement('div');
        item.className = 'engine-item';
        item.innerHTML = `<span>${engine.name}</span><div><button class="btn-action btn-edit" onclick="openEngineModal('${key}')">修改</button><button class="btn-action btn-delete" onclick="deleteEngine('${key}')">删除</button></div>`;
        list.appendChild(item);
    }
    if (Object.keys(appData.customEngines).length === 0) {
        list.innerHTML = '<div style="padding:10px; color:#888; text-align:center;">暂无自定义引擎</div>';
    }
}



function initBgTabs() {
    const tabs = document.querySelectorAll('.bg-tab');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentBgType = tab.dataset.type;
            updateBgTabsUI();
        }
    });
}

function updateBgTabsUI() {
    document.querySelectorAll('.bg-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.bg-tab[data-type="${currentBgType}"]`)?.classList.add('active');
    
    document.getElementById('bg-color-panel').style.display = currentBgType === 'color' ? 'block' : 'none';
    document.getElementById('bg-local-panel').style.display = currentBgType === 'local' ? 'block' : 'none';
    document.getElementById('bg-upload-panel').style.display = currentBgType === 'upload' ? 'block' : 'none';
    document.getElementById('bg-url-panel').style.display = currentBgType === 'url' ? 'block' : 'none';
    document.getElementById('bg-daily-panel').style.display = currentBgType === 'daily' ? 'block' : 'none';
}

function initSortListeners() {
    const enableBtn = document.getElementById('enable-sort-btn');
    const toggleBtn = document.getElementById('toggle-sort-btn');
    const selectAllBtn = document.getElementById('select-all-btn');
    
    enableBtn.onclick = () => {
        isSortMode = true;
        isDragDropMode = true;
        enableBtn.style.display = 'none';
        toggleBtn.style.display = 'inline-block';
        selectAllBtn.style.display = 'inline-block';
        selectedItems.clear(); // 清空选中状态
        updateCurrentFolderDisplay();
        
        // 在移动版中隐藏天气组件
        if (window.innerWidth <= 768) {
            const weatherWidget = document.getElementById('weather-widget');
            if (weatherWidget) {
                weatherWidget.style.display = 'none';
            }
        }
        
        // 根据当前路径渲染相应内容
        if (currentFolderPath.length === 0) {
            renderIcons();
        } else {
            const currentFolder = getFolderByPath(currentFolderPath);
            renderFolderContents(currentFolder);
        }
    };
    
    toggleBtn.onclick = () => {
        isSortMode = false;
        isDragDropMode = false;
        toggleBtn.style.display = 'none';
        selectAllBtn.style.display = 'none';
        enableBtn.style.display = 'inline-block';
        selectedItems.clear(); // 清空选中状态
        saveData();
        updateCurrentFolderDisplay();
        
        // 在移动版中恢复天气组件（仅在根目录）
        if (window.innerWidth <= 768 && currentFolderPath.length === 0) {
            const weatherWidget = document.getElementById('weather-widget');
            if (weatherWidget) {
                weatherWidget.style.display = 'flex';
            }
        }
        
        // 根据当前路径渲染相应内容
        if (currentFolderPath.length === 0) {
            renderIcons();
        } else {
            const currentFolder = getFolderByPath(currentFolderPath);
            renderFolderContents(currentFolder);
        }
    };
    
    // 全选/反全选按钮点击事件
    selectAllBtn.onclick = () => {
        const items = currentFolderPath.length === 0 ? appData.links : getFolderByPath(currentFolderPath).children;
        const allSelected = selectedItems.size === items.length;
        
        if (allSelected) {
            // 反全选
            selectedItems.clear();
        } else {
            // 全选
            selectedItems.clear();
            for (let i = 0; i < items.length; i++) {
                selectedItems.add(i);
            }
        }
        
        // 重新渲染以更新选择状态
        if (currentFolderPath.length === 0) {
            renderIcons();
        } else {
            const currentFolder = getFolderByPath(currentFolderPath);
            renderFolderContents(currentFolder);
        }
    };
}

// 切换项目选择状态
function toggleItemSelection(index) {
    if (selectedItems.has(index)) {
        selectedItems.delete(index);
    } else {
        selectedItems.add(index);
    }
    
    // 重新渲染以更新选择状态
    if (currentFolderPath.length === 0) {
        renderIcons();
    } else {
        const currentFolder = getFolderByPath(currentFolderPath);
        renderFolderContents(currentFolder);
    }
}

function updateCurrentFolderDisplay() {
    const currentFolderElement = document.getElementById('current-folder');
    if (!currentFolderElement) return;
    
    // 清除之前的类
    currentFolderElement.classList.remove('drag-drop-mode');
    
    // 始终显示当前文件夹名称，无论是否处于编辑状态
    if (currentFolderPath.length === 0) {
        currentFolderElement.textContent = '首页';
        currentFolderElement.setAttribute('data-tooltip', '首页');
    } else {
        const currentFolder = getFolderByPath(currentFolderPath);
        currentFolderElement.textContent = currentFolder.name;
        currentFolderElement.setAttribute('data-tooltip', currentFolder.name);
    }
}

function initCurrentFolderListener() {
    const currentFolderElement = document.getElementById('current-folder');
    if (!currentFolderElement) return;
    
    currentFolderElement.addEventListener('click', () => {
        if (!isDragDropMode) {
            // 默认模式下返回主页
            currentFolderPath = [];
            renderIcons();
            updateCurrentFolderDisplay();
            
            // 返回首页时，在移动版中恢复天气组件
            if (window.innerWidth <= 768) {
                const weatherWidget = document.getElementById('weather-widget');
                if (weatherWidget) {
                    // 方案一：直接使用display: flex立即显示
                    weatherWidget.style.display = 'flex';
                }
            }
        }
        // 编辑模式下不执行操作，等待拖放
    });
    
    // 添加鼠标拖放事件监听器
    currentFolderElement.addEventListener('dragover', (e) => {
        if (isDragDropMode) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });
    
    currentFolderElement.addEventListener('drop', (e) => {
        if (isDragDropMode) {
            e.preventDefault();
            const dragSrcIndex = parseInt(e.dataTransfer.getData('text/plain'));
            if (!isNaN(dragSrcIndex)) {
                moveItemToParentFolder(dragSrcIndex);
            }
        }
    });
    
    // 添加触摸事件监听器，支持移动端拖放和点击
    let touchStartTime = 0;
    let touchMoved = false;
    
    currentFolderElement.addEventListener('touchstart', (e) => {
        touchStartTime = Date.now();
        touchMoved = false;
    }, { passive: true });
    
    currentFolderElement.addEventListener('touchmove', (e) => {
        touchMoved = true;
        if (isDragDropMode) {
            e.preventDefault();
            
            currentFolderElement.style.borderColor = 'var(--accent-color)';
            currentFolderElement.style.backgroundColor = 'var(--card-hover)';
        }
    }, { passive: false });
    
    currentFolderElement.addEventListener('touchend', (e) => {
        const touchEndTime = Date.now();
        const touchDuration = touchEndTime - touchStartTime;
        
        if (isDragDropMode) {
            e.preventDefault();
            
            currentFolderElement.style.borderColor = '';
            currentFolderElement.style.backgroundColor = '';
            
            if (dragSrcIndex !== null && currentFolderPath.length > 0) {
                moveItemToParentFolder(dragSrcIndex);
            }
        } else if (!touchMoved && touchDuration < 300) {
            // 短暂的触摸且未移动，视为点击
            e.preventDefault();
            if (!isDragDropMode) {
                currentFolderPath = [];
                renderIcons();
                updateCurrentFolderDisplay();
                
                if (window.innerWidth <= 768) {
                    const weatherWidget = document.getElementById('weather-widget');
                    if (weatherWidget) {
                        weatherWidget.style.display = 'flex';
                    }
                }
            }
        }
    }, { passive: false });
}

function moveItemToParentFolder(index) {
    if (currentFolderPath.length === 0) return; // 已经在根目录
    
    // 获取当前文件夹
    const currentFolder = getFolderByPath(currentFolderPath);
    // 获取要移动的项目
    const itemToMove = currentFolder.children[index];
    
    if (!itemToMove) return;
    
    // 从当前文件夹中移除项目
    currentFolder.children.splice(index, 1);
    
    // 获取父文件夹
    let parentFolder;
    if (currentFolderPath.length === 1) {
        // 父文件夹是根目录
        parentFolder = appData;
    } else {
        // 父文件夹是上一级文件夹
        const parentPath = currentFolderPath.slice(0, -1);
        parentFolder = getFolderByPath(parentPath);
    }
    
    // 将项目添加到父文件夹
    if (parentFolder === appData) {
        parentFolder.links.push(itemToMove);
    } else {
        parentFolder.children.push(itemToMove);
    }
    
    // 保存数据并重新渲染
    saveData();
    renderFolderContents(currentFolder);
    
    // 清空选中状态
    selectedItems.clear();
    
    // 重新渲染父文件夹，确保上级目录能看到新添加的项目
    if (parentFolder === appData) {
        // 如果父文件夹是根目录，不需要重新渲染，因为当前不在根目录
    } else {
        // 重新渲染父文件夹
        const parentPath = currentFolderPath.slice(0, -1);
        const parentFolderObj = getFolderByPath(parentPath);
        // 注意：不要在这里调用renderFolderContents，因为会切换到父文件夹视图
    }
}

function deleteFolderItem(index) {
    if (currentFolderPath.length === 0) return;
    
    const currentFolder = getFolderByPath(currentFolderPath);
    openConfirmModal('确定要删除这个项目吗？', function() {
        currentFolder.children.splice(index, 1);
        saveData();
        renderFolderContents(currentFolder);
    });
}

function getFolderByPath(path) {
    let current = appData;
    for (const index of path) {
        if (current === appData) {
            // 根目录下使用links
            current = current.links[index];
        } else {
            // 非根目录下使用children
            current = current.children[index];
        }
    }
    return current;
}

let dragSrcIndex = null;
let dragSrcType = null;
let dragSrcPath = null;

function handleDragStart(e) {
    dragSrcIndex = parseInt(this.dataset.index);
    dragSrcType = this.dataset.type || 'link';
    dragSrcPath = this.dataset.folderPath ? JSON.parse(this.dataset.folderPath) : [];
    this.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    
    // 检查是否有多个项目被选中
    if (selectedItems.size > 0) {
        // 如果有选中项目，使用选中项目列表
        const selectedIndices = Array.from(selectedItems);
        e.dataTransfer.setData('text/plain', JSON.stringify(selectedIndices));
        e.dataTransfer.setData('isMultiple', 'true');
    } else {
        // 否则使用单个项目
        e.dataTransfer.setData('text/plain', dragSrcIndex);
        e.dataTransfer.setData('isMultiple', 'false');
    }
    
    e.dataTransfer.setData('type', dragSrcType);
    e.dataTransfer.setData('path', JSON.stringify(dragSrcPath));
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    
    // 清除所有之前的高亮
    document.querySelectorAll('.icon-card').forEach(card => {
        card.style.borderColor = '';
        card.style.backgroundColor = '';
        card.style.boxShadow = '';
        card.style.transform = '';
        card.style.borderTop = '';
        card.style.borderBottom = '';
        card.style.borderLeft = '';
        card.style.borderRight = '';
    });
    
    // 高亮显示目标
    const target = e.target.closest('.icon-card');
    if (target) {
        // 获取目标路径
        const dragDstPath = target.dataset.folderPath ? JSON.parse(target.dataset.folderPath) : [];
        
        // 检查是否在同一个容器内
        const isSameContainer = JSON.stringify(dragSrcPath) === JSON.stringify(dragDstPath);
        
        // 获取鼠标在目标元素内的位置
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;
        
        if (isSameContainer) {
            // 目标在同一个容器内，允许排序或拖入文件夹
            e.dataTransfer.dropEffect = 'move';
            if (target.dataset.type === 'folder' && x > width * 0.3 && x < width * 0.7 && y > height * 0.3 && y < height * 0.7) {
                // 目标是文件夹且鼠标在水平和垂直中间区域，允许拖入
                target.style.borderColor = 'var(--accent-color)';
                target.style.borderWidth = '2px';
                target.style.backgroundColor = 'var(--card-hover)';
                target.style.boxShadow = '0 0 10px rgba(0, 123, 255, 0.5)';
                target.style.transform = 'scale(1.05)';
                target.style.transition = 'all 0.2s ease';
            } else if (x < width * 0.3) {
                // 鼠标在左侧30%区域，显示左边框高亮
                target.style.borderLeft = '3px solid var(--accent-color)';
                target.style.backgroundColor = 'var(--card-hover)';
            } else if (x > width * 0.7) {
                // 鼠标在右侧30%区域，显示右边框高亮
                target.style.borderRight = '3px solid var(--accent-color)';
                target.style.backgroundColor = 'var(--card-hover)';
            }
        } else if (target.dataset.type === 'folder' && x > width * 0.3 && x < width * 0.7 && y > height * 0.3 && y < height * 0.7) {
            // 目标是文件夹且鼠标在水平和垂直中间区域，允许拖入
            e.dataTransfer.dropEffect = 'move';
            target.style.borderColor = 'var(--accent-color)';
            target.style.borderWidth = '2px';
            target.style.backgroundColor = 'var(--card-hover)';
            target.style.boxShadow = '0 0 10px rgba(0, 123, 255, 0.5)';
            target.style.transform = 'scale(1.05)';
            target.style.transition = 'all 0.2s ease';
        } else {
            // 目标不在同一个容器内且不是文件夹，禁止拖入
            e.dataTransfer.dropEffect = 'none';
        }
    }
    
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    
    const target = e.target.closest('.icon-card');
    if (!target) return false;
    
    const dragDstIndex = parseInt(target.dataset.index);
    const dragDstType = target.dataset.type;
    const dragDstPath = target.dataset.folderPath ? JSON.parse(target.dataset.folderPath) : [];
    
    // 获取目标文件夹
    let dragDstFolder = null;
    if (dragDstType === 'folder') {
        dragDstFolder = getFolderByPath(dragDstPath);
        if (dragDstFolder && dragDstFolder.children) {
            // 查找目标文件夹中的具体文件夹
            dragDstFolder = dragDstFolder.children[dragDstIndex];
        }
    }
    
    // 检查是否是同一个项目
    if (JSON.stringify(dragSrcPath) === JSON.stringify(dragDstPath) && dragSrcIndex === dragDstIndex) {
        return false;
    }
    
    // 获取鼠标在目标元素内的位置
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    // 检查是否是在同一个容器内
    const isSameContainer = JSON.stringify(dragSrcPath) === JSON.stringify(dragDstPath);
    
    // 检查是否要拖拽到文件夹中
    let isDroppingToFolder = false;
    if (dragDstType === 'folder' && x > width * 0.3 && x < width * 0.7 && y > height * 0.3 && y < height * 0.7) {
        // 目标是文件夹且鼠标在水平和垂直中间区域，执行拖入操作
        isDroppingToFolder = true;
    }
    
    // 如果不是同一个容器且目标不是文件夹，则拒绝接收
    if (!isSameContainer && !isDroppingToFolder) {
        return false;
    }
    
    // 检查是否是多选拖拽
    const isMultiple = e.dataTransfer.getData('isMultiple') === 'true';
    let itemsToMove = [];
    let sourceContainer;
    
    if (isMultiple) {
        // 处理多选拖拽
        try {
            const selectedIndices = JSON.parse(e.dataTransfer.getData('text/plain'));
            
            if (dragSrcPath.length === 0) {
                // 从根目录拖拽
                sourceContainer = appData;
                // 按索引降序排序，避免删除时索引变化
                selectedIndices.sort((a, b) => b - a);
                for (const index of selectedIndices) {
                    itemsToMove.unshift(appData.links[index]);
                    appData.links.splice(index, 1);
                }
            } else {
                // 从文件夹中拖拽
                const sourceFolder = getFolderByPath(dragSrcPath);
                sourceContainer = sourceFolder;
                // 按索引降序排序，避免删除时索引变化
                selectedIndices.sort((a, b) => b - a);
                for (const index of selectedIndices) {
                    itemsToMove.unshift(sourceFolder.children[index]);
                    sourceFolder.children.splice(index, 1);
                }
            }
        } catch (error) {
            console.error('解析选中项目失败:', error);
            return false;
        }
    } else {
        // 处理单个项目拖拽
        if (dragSrcPath.length === 0) {
            // 从根目录拖拽
            sourceContainer = appData;
            itemsToMove.push(appData.links[dragSrcIndex]);
            appData.links.splice(dragSrcIndex, 1);
        } else {
            // 从文件夹中拖拽
            const sourceFolder = getFolderByPath(dragSrcPath);
            sourceContainer = sourceFolder;
            itemsToMove.push(sourceFolder.children[dragSrcIndex]);
            sourceFolder.children.splice(dragSrcIndex, 1);
        }
    }
    
    // 检查是否要拖拽到文件夹中
    if (isDroppingToFolder) {
        // 获取目标文件夹
        let targetFolder;
        if (dragDstPath.length === 0) {
            // 目标是根目录中的文件夹
            targetFolder = appData.links[dragDstIndex];
        } else {
            // 目标是文件夹中的文件夹
            const parentFolder = getFolderByPath(dragDstPath);
            targetFolder = parentFolder.children[dragDstIndex];
        }
        
        // 检查循环引用
        for (const item of itemsToMove) {
            if (isCircularReference(item, targetFolder)) {
                alert('不能将文件夹拖入其子文件夹中，会形成循环引用');
                return false;
            }
        }
        
        // 添加到目标文件夹
        for (const item of itemsToMove) {
            targetFolder.children.push(item);
        }
        
        // 保存数据并重新渲染
        saveData();
        
        // 重新渲染源容器
        if (dragSrcPath.length === 0) {
            renderIcons();
        } else {
            const sourceFolder = getFolderByPath(dragSrcPath);
            renderFolderContents(sourceFolder);
        }
        
        // 清空选中状态
        selectedItems.clear();
        
        // 重新渲染目标容器
        if (dragDstPath.length === 0) {
            renderIcons();
        } else {
            const parentFolder = getFolderByPath(dragDstPath);
            renderFolderContents(parentFolder);
        }
        
        // 确保当前视图正确更新
        if (currentFolderPath.length === 0) {
            renderIcons();
        } else {
            const currentFolder = getFolderByPath(currentFolderPath);
            renderFolderContents(currentFolder);
        }
    } else if (isSameContainer) {
        // 处理同一个容器内的排序
        // 根据鼠标位置确定插入位置
        let insertIndex = dragDstIndex;
        if (x < width * 0.3) {
            // 鼠标在左侧30%区域，插入到目标之前
            if (dragSrcIndex < dragDstIndex) {
                insertIndex--;
            }
        } else if (x > width * 0.7) {
            // 鼠标在右侧30%区域，插入到目标之后
            insertIndex = dragDstIndex + 1;
            if (dragSrcIndex > dragDstIndex) {
                insertIndex--;
            }
        } else {
            // 鼠标在中间区域，默认插入到目标之后
            insertIndex = dragDstIndex + 1;
            if (dragSrcIndex > dragDstIndex) {
                insertIndex--;
            }
        }
        
        if (!isMultiple) {
            // 单个项目排序
            // 插入到目标位置
            if (sourceContainer === appData) {
                sourceContainer.links.splice(insertIndex, 0, itemsToMove[0]);
                renderIcons();
            } else {
                // 确保sourceContainer有children属性
                if (sourceContainer && sourceContainer.children) {
                    sourceContainer.children.splice(insertIndex, 0, itemsToMove[0]);
                    renderFolderContents(sourceContainer);
                }
            }
            saveData();
        } else {
            // 多项目排序
            // 按索引升序排序，保持原始顺序
            const selectedIndices = JSON.parse(e.dataTransfer.getData('text/plain')).sort((a, b) => a - b);
            
            // 调整插入位置，考虑选中项目的位置
            let itemsBeforeTarget = 0;
            for (const index of selectedIndices) {
                if (index < insertIndex) {
                    itemsBeforeTarget++;
                }
            }
            insertIndex -= itemsBeforeTarget;
            
            // 插入项目
            for (const item of itemsToMove) {
                // 检查是否存在循环引用
                if (item.type === 'folder' && dragDstType === 'folder') {
                    if (isCircularReference(item, dragDstFolder)) {
                        continue; // 跳过循环引用的文件夹
                    }
                }
                
                if (sourceContainer === appData) {
                    sourceContainer.links.splice(insertIndex, 0, item);
                } else if (sourceContainer && sourceContainer.children) {
                    sourceContainer.children.splice(insertIndex, 0, item);
                }
                insertIndex++;
            }
            
            // 清空选中状态
            selectedItems.clear();
            
            // 保存数据并重新渲染
            saveData();
            if (sourceContainer === appData) {
                renderIcons();
            } else if (sourceContainer && sourceContainer.children) {
                renderFolderContents(sourceContainer);
            }
        }
    }
    
    // 清空选中状态（无论哪种情况都清空）
    selectedItems.clear();
    
    return false;
}

function handleDragEnd(e) {
    this.style.opacity = '1';
    
    // 清除所有高亮
    document.querySelectorAll('.icon-card').forEach(card => {
        card.style.borderColor = '';
        card.style.borderWidth = '';
        card.style.borderTop = '';
        card.style.borderBottom = '';
        card.style.borderLeft = '';
        card.style.borderRight = '';
        card.style.backgroundColor = '';
        card.style.boxShadow = '';
        card.style.transform = '';
        card.style.transition = '';
    });
    
    // 清空选中状态
    selectedItems.clear();
    
    // 重新渲染当前视图，确保选中状态被正确清除
    if (currentFolderPath.length === 0) {
        renderIcons();
    } else {
        const currentFolder = getFolderByPath(currentFolderPath);
        renderFolderContents(currentFolder);
    }
}

function isCircularReference(source, target) {
    // 检查是否将文件夹拖入其子文件夹中
    if (source.type === 'folder') {
        // 检查目标是否是源的子文件夹
        return isChildFolder(source, target);
    }
    return false;
}

function isChildFolder(parent, child) {
    if (parent.type !== 'folder' || child.type !== 'folder') {
        return false;
    }
    
    if (!parent.children) {
        return false;
    }
    
    for (const item of parent.children) {
        if (item === child) {
            return true;
        }
        if (item.type === 'folder' && isChildFolder(item, child)) {
            return true;
        }
    }
    
    return false;
}

// 触摸事件处理
let touchStartX = 0;
let touchStartY = 0;
let touchDragging = false;

function handleTouchStart(e) {
    // 检查是否点击了删除或编辑按钮
    const target = e.target;
    if (target.classList.contains('sort-delete-btn') || target.classList.contains('sort-edit-btn')) {
        // 如果点击了删除或编辑按钮，不阻止默认行为，让按钮的点击事件正常触发
        return;
    }
    
    // 阻止默认行为，防止页面滚动
    e.preventDefault();
    
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchDragging = false;
    
    // 设置全局变量dragSrcIndex
    dragSrcIndex = parseInt(this.dataset.index);
    dragSrcType = this.dataset.type || 'link';
    dragSrcPath = this.dataset.folderPath ? JSON.parse(this.dataset.folderPath) : [];
    
    // 模拟dragstart事件
    const dragStartEvent = new Event('dragstart');
    dragStartEvent.dataTransfer = {
        effectAllowed: 'move',
        dropEffect: 'move',
        setData: function(key, value) {
            this[key] = value;
        },
        getData: function(key) {
            return this[key];
        }
    };
    
    this.dispatchEvent(dragStartEvent);
}

function handleTouchMove(e) {
    // 检查是否点击了删除或编辑按钮
    const target = e.target;
    if (target.classList.contains('sort-delete-btn') || target.classList.contains('sort-edit-btn')) {
        // 如果点击了删除或编辑按钮，不阻止默认行为，让按钮的点击事件正常触发
        return;
    }
    
    // 阻止默认行为，防止页面滚动
    e.preventDefault();
    
    if (!touchDragging) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        
        // 如果移动距离超过10px，认为是拖动操作
        if (deltaX > 10 || deltaY > 10) {
            touchDragging = true;
        }
    }
    
    if (touchDragging) {
        // 模拟dragover事件
        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const target = element.closest('.icon-card');
        
        if (target) {
            const dragOverEvent = new Event('dragover');
            dragOverEvent.preventDefault = function() {};
            dragOverEvent.stopPropagation = function() {};
            dragOverEvent.dataTransfer = {
                dropEffect: 'move'
            };
            // 添加客户端坐标，用于计算触摸位置
            dragOverEvent.clientX = touch.clientX;
            dragOverEvent.clientY = touch.clientY;
            target.dispatchEvent(dragOverEvent);
        }
    }
}

function handleTouchEnd(e) {
    // 检查是否点击了删除或编辑按钮
    const target = e.target;
    if (target.classList.contains('sort-delete-btn') || target.classList.contains('sort-edit-btn')) {
        // 如果点击了删除或编辑按钮，不阻止默认行为，让按钮的点击事件正常触发
        return;
    }
    
    // 阻止默认行为
    e.preventDefault();
    
    if (touchDragging) {
        // 模拟drop事件
        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const target = element.closest('.icon-card');
        
        if (target) {
            const dropEvent = new Event('drop');
            dropEvent.stopPropagation = function() {};
            // 手动设置dataTransfer，确保drop事件能获取到拖拽索引
            dropEvent.dataTransfer = {
                getData: function(key) {
                    if (key === 'text/plain') {
                        // 检查是否有多选项目
                        if (selectedItems.size > 0) {
                            return JSON.stringify(Array.from(selectedItems));
                        } else {
                            return dragSrcIndex.toString();
                        }
                    } else if (key === 'isMultiple') {
                        return selectedItems.size > 0 ? 'true' : 'false';
                    }
                    return null;
                }
            };
            // 添加客户端坐标，用于计算触摸位置
            dropEvent.clientX = touch.clientX;
            dropEvent.clientY = touch.clientY;
            target.dispatchEvent(dropEvent);
        }
        
        // 模拟dragend事件
        const dragEndEvent = new Event('dragend');
        this.dispatchEvent(dragEndEvent);
    } else {
        // 如果不是拖拽，模拟点击事件
        const clickEvent = new Event('click');
        this.dispatchEvent(clickEvent);
    }
    
    touchDragging = false;
}

// 搜索引擎弹窗
window.openEngineModal = function(key = null) {
    const modal = document.getElementById('engine-modal');
    const title = document.getElementById('engine-modal-title');
    const nameInput = document.getElementById('engine-name-input');
    const urlInput = document.getElementById('engine-url-input');
    const keyInput = document.getElementById('engine-edit-key');
    
    modal.style.display = 'block';
    if (key) {
        const engine = appData.customEngines[key];
        title.innerText = '修改引擎';
        nameInput.value = engine.name;
        urlInput.value = engine.url;
        keyInput.value = key;
    } else {
        title.innerText = '添加引擎';
        nameInput.value = '';
        urlInput.value = '';
        keyInput.value = '';
    }
}
window.closeEngineModal = function() {
    document.getElementById('engine-modal').style.display = 'none';
}
window.saveEngineFromModal = function() {
    const name = document.getElementById('engine-name-input').value.trim();
    const url = document.getElementById('engine-url-input').value.trim();
    const key = document.getElementById('engine-edit-key').value.trim();
    if (!name || !url) { alert('请填写完整信息'); return; }
    if (key) {
        appData.customEngines[key] = { name, url };
    } else {
        const newKey = 'custom_' + Date.now();
        appData.customEngines[newKey] = { name, url };
    }
    saveData();
    mergeEngines();
    renderSearchDropdowns();
    renderEnginesList();
    closeEngineModal();
}

// 快速添加弹窗
window.closeQuickAddModal = function() {
    // 重置表单内容
    document.getElementById('quick-link-name').value = '';
    document.getElementById('quick-link-url').value = '';
    
    // 重置项目类型为默认的'link'类型
    const linkTypeBtn = document.getElementById('add-type-link');
    const folderTypeBtn = document.getElementById('add-type-folder');
    const urlGroup = document.getElementById('url-group');
    
    linkTypeBtn.classList.add('active');
    folderTypeBtn.classList.remove('active');
    urlGroup.style.display = 'block';
    currentAddType = 'link';
    
    // 关闭模态框
    document.getElementById('quick-add-modal').style.display = 'none';
}

// 项目类型切换
let currentAddType = 'link';

document.addEventListener('DOMContentLoaded', () => {
    const linkTypeBtn = document.getElementById('add-type-link');
    const folderTypeBtn = document.getElementById('add-type-folder');
    const urlGroup = document.getElementById('url-group');
    
    linkTypeBtn.onclick = () => {
        linkTypeBtn.classList.add('active');
        folderTypeBtn.classList.remove('active');
        urlGroup.style.display = 'block';
        currentAddType = 'link';
    };
    
    folderTypeBtn.onclick = () => {
        folderTypeBtn.classList.add('active');
        linkTypeBtn.classList.remove('active');
        urlGroup.style.display = 'none';
        currentAddType = 'folder';
    };
});

window.saveQuickLink = function() {
    const name = document.getElementById('quick-link-name').value.trim();
    
    if (!name) { alert('请填写名称'); return; }
    
    if (currentAddType === 'link') {
        let url = document.getElementById('quick-link-url').value.trim();
        if (!url) { alert('请填写网站网址'); return; }
        if(!url.startsWith('http')) url = 'https://' + url;
        
        if (currentFolderPath.length === 0) {
            // 在根目录添加
            appData.links.push({ name, url });
        } else {
            // 在当前文件夹添加
            const currentFolder = getFolderByPath(currentFolderPath);
            currentFolder.children.push({ name, url });
        }
    } else {
        if (currentFolderPath.length === 0) {
            // 在根目录添加
            appData.links.push({ name, type: 'folder', children: [] });
        } else {
            // 在当前文件夹添加
            const currentFolder = getFolderByPath(currentFolderPath);
            currentFolder.children.push({ name, type: 'folder', children: [] });
        }
    }
    
    saveData();
    
    // 根据当前路径渲染相应内容
    if (currentFolderPath.length === 0) {
        renderIcons();
    } else {
        const currentFolder = getFolderByPath(currentFolderPath);
        renderFolderContents(currentFolder);
        // 更新当前目录显示
        updateCurrentFolderDisplay();
    }
    
    closeQuickAddModal();
}

// 图标编辑弹窗 (新增)
window.openIconEditModal = function(index) {
    const modal = document.getElementById('icon-edit-modal');
    const link = appData.links[index];
    
    document.getElementById('icon-edit-index').value = index;
    document.getElementById('icon-edit-name').value = link.name;
    document.getElementById('icon-edit-url').value = link.url;
    
    modal.style.display = 'block';
}

window.closeIconEditModal = function() {
    document.getElementById('icon-edit-modal').style.display = 'none';
}

window.saveIconEdit = function() {
    const index = parseInt(document.getElementById('icon-edit-index').value);
    const name = document.getElementById('icon-edit-name').value.trim();
    let url = document.getElementById('icon-edit-url').value.trim();
    
    if (!name || !url) { alert('请填写完整信息'); return; }
    if(!url.startsWith('http')) url = 'https://' + url;
    
    // 根据当前路径确定是编辑根目录还是文件夹内的图标
    if (currentFolderPath.length === 0) {
        // 编辑根目录的图标
        appData.links[index] = { name, url };
        saveData();
        renderIcons();
    } else {
        // 编辑文件夹内的图标
        const currentFolder = getFolderByPath(currentFolderPath);
        currentFolder.children[index] = { name, url };
        saveData();
        renderFolderContents(currentFolder);
        updateCurrentFolderDisplay();
    }
    
    closeIconEditModal();
}

// 文件夹功能
function openFolder(index) {
    let folder;
    if (currentFolderPath.length === 0) {
        // 从根目录打开文件夹
        folder = appData.links[index];
    } else {
        // 从当前文件夹打开子文件夹
        const currentFolder = getFolderByPath(currentFolderPath);
        folder = currentFolder.children[index];
    }
    
    if (folder && folder.type === 'folder') {
        currentFolderPath.push(index);
        renderFolderContents(folder);
        updateCurrentFolderDisplay();
        
        // 在移动版中隐藏天气组件
        if (window.innerWidth <= 768) {
            const weatherWidget = document.getElementById('weather-widget');
            if (weatherWidget) {
                // 方案一：直接使用display: none立即隐藏
                weatherWidget.style.display = 'none';
            }
        }
    }
}

function renderFolderContents(folder) {
    const grid = document.getElementById('icon-grid');
    grid.innerHTML = '';
    
    // 在移动版中隐藏天气组件
    if (window.innerWidth <= 768) {
        const weatherWidget = document.getElementById('weather-widget');
        if (weatherWidget) {
            weatherWidget.style.display = 'none';
        }
    }
    
    // 添加返回按钮
    const backCard = document.createElement('div');
    backCard.className = 'icon-card';
    
    if (isSortMode) {
        // 编辑模式下，返回按钮变为"拖到上级"功能
        backCard.onclick = () => {
            // 编辑模式下不执行返回操作
        };
        
        // 添加拖放事件监听器
        backCard.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            // 高亮显示拖放区域
            backCard.style.borderColor = 'var(--accent-color)';
            backCard.style.backgroundColor = 'var(--card-hover)';
        });
        
        backCard.addEventListener('drop', (e) => {
            e.preventDefault();
            // 清除高亮
            backCard.style.borderColor = '';
            backCard.style.backgroundColor = '';
            
            // 检查是否是多选拖拽
            const isMultiple = e.dataTransfer.getData('isMultiple') === 'true';
            
            if (isMultiple) {
                // 处理多选拖拽
                try {
                    const selectedIndices = JSON.parse(e.dataTransfer.getData('text/plain'));
                    // 按索引降序排序，避免删除时索引变化
                    selectedIndices.sort((a, b) => b - a);
                    for (const index of selectedIndices) {
                        moveItemToParentFolder(index);
                    }
                } catch (error) {
                    console.error('解析选中项目失败:', error);
                }
            } else {
                // 处理单个项目拖拽
                const dragSrcIndex = parseInt(e.dataTransfer.getData('text/plain'));
                if (!isNaN(dragSrcIndex)) {
                    moveItemToParentFolder(dragSrcIndex);
                }
            }
        });
        
        backCard.addEventListener('dragend', () => {
            // 清除高亮
            backCard.style.borderColor = '';
            backCard.style.backgroundColor = '';
        });
        
        // 添加触摸事件监听器，支持移动端拖放
        backCard.addEventListener('touchstart', (e) => {
            // 阻止默认行为
            e.preventDefault();
        }, { passive: false });
        
        backCard.addEventListener('touchmove', (e) => {
            // 阻止默认行为，防止页面滚动
            e.preventDefault();
            
            // 高亮显示拖放区域
            backCard.style.borderColor = 'var(--accent-color)';
            backCard.style.backgroundColor = 'var(--card-hover)';
        }, { passive: false });
        
        backCard.addEventListener('touchend', (e) => {
            // 阻止默认行为
            e.preventDefault();
            
            // 清除高亮
            backCard.style.borderColor = '';
            backCard.style.backgroundColor = '';
            
            // 模拟drop事件，调用moveItemToParentFolder函数
            // 确保dragSrcIndex不为null且当前在文件夹中
            if (dragSrcIndex !== null && !isNaN(dragSrcIndex) && currentFolderPath.length > 0) {
                moveItemToParentFolder(dragSrcIndex);
                // 重置dragSrcIndex，避免重复操作
                dragSrcIndex = null;
            }
        }, { passive: false });
        
        const backIcon = document.createElement('div');
        backIcon.className = 'icon-box';
        backIcon.innerText = '📁';
        
        const backText = document.createElement('span');
        backText.innerText = '拖到上级';
        
        backCard.appendChild(backIcon);
        backCard.appendChild(backText);
    } else {
        // 默认模式下，返回按钮保持返回功能
        backCard.onclick = () => {
            currentFolderPath.pop();
            if (currentFolderPath.length === 0) {
                renderIcons();
                
                // 返回首页时，在移动版中恢复天气组件
                if (window.innerWidth <= 768) {
                    const weatherWidget = document.getElementById('weather-widget');
                    if (weatherWidget) {
                        // 方案一：直接使用display: flex立即显示
                        weatherWidget.style.display = 'flex';
                    }
                }
            } else {
                const parentFolder = getFolderByPath(currentFolderPath);
                renderFolderContents(parentFolder);
            }
            updateCurrentFolderDisplay();
        };
        
        const backIcon = document.createElement('div');
        backIcon.className = 'icon-box';
        backIcon.innerText = '⬅️';
        
        const backText = document.createElement('span');
        backText.innerText = '返回';
        
        backCard.appendChild(backIcon);
        backCard.appendChild(backText);
    }
    
    grid.appendChild(backCard);
    
    // 渲染文件夹内容
    folder.children.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'icon-card';
        if (isSortMode) card.classList.add('sorting-mode');
        
        if (isSortMode) {
            card.draggable = true;
            card.dataset.index = index;
            card.dataset.type = item.type || 'link';
            card.dataset.folderPath = JSON.stringify(currentFolderPath);
            
            // 删除按钮 (左上角)
            const delBtn = document.createElement('div');
            delBtn.className = 'sort-delete-btn';
            delBtn.innerHTML = '×';
            delBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteFolderItem(index);
            };
            card.appendChild(delBtn);
            
            // 编辑按钮 (右上角) - 新增
            const editBtn = document.createElement('div');
            editBtn.className = 'sort-edit-btn';
            editBtn.innerHTML = '✎';
            editBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (item.type === 'folder') {
                    openFolderEditModal(index);
                } else {
                    openIconEditModal(index);
                }
            };
            card.appendChild(editBtn);
            
            // 选择状态指示器 (左下角)
            const selectIndicator = document.createElement('div');
            selectIndicator.className = 'select-indicator';
            if (selectedItems.has(index)) {
                selectIndicator.classList.add('selected');
            }
            selectIndicator.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleItemSelection(index);
            };
            card.appendChild(selectIndicator);
            
            // 点击卡片切换选择状态
            card.onclick = (e) => {
                e.preventDefault();
                toggleItemSelection(index);
            };
            
            // 鼠标事件
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('drop', handleDrop);
            card.addEventListener('dragend', handleDragEnd);
            
            // 触摸事件
            card.addEventListener('touchstart', handleTouchStart, { passive: false });
            card.addEventListener('touchmove', handleTouchMove, { passive: false });
            card.addEventListener('touchend', handleTouchEnd, { passive: false });
        } else {
            if (item.type === 'folder') {
                card.onclick = () => {
                    openFolder(index);
                };
                card.style.cursor = 'pointer';
            } else {
                card.onclick = () => {
                    window.open(item.url, '_blank');
                };
                card.style.cursor = 'pointer';
            }
        }
        
        const box = document.createElement('div');
        box.className = 'icon-box';
        if (item.type === 'folder') {
            box.innerText = '📁';
        } else {
            const firstChar = item.name.charAt(0).toUpperCase();
            box.innerText = firstChar;
        }
        card.appendChild(box);
        
        const span = document.createElement('span');
        span.innerText = item.name;
        card.appendChild(span);
        
        grid.appendChild(card);
    });
    
    // 添加新建按钮
    if (appData.showQuickAdd || appData.showAddFolder) {
        const addCard = document.createElement('div');
        addCard.className = 'icon-card add-card';
        addCard.onclick = () => {
            document.getElementById('quick-add-modal').style.display = 'block';
        };
        
        const addIcon = document.createElement('div');
        addIcon.className = 'icon-box';
        addIcon.innerText = '+';
        
        const addText = document.createElement('span');
        addText.innerText = '添加';
        
        addCard.appendChild(addIcon);
        addCard.appendChild(addText);
        grid.appendChild(addCard);
    }
}

function getFolderByPath(path) {
    let current = appData;
    for (const index of path) {
        if (current === appData) {
            // 根目录下使用links
            current = current.links[index];
        } else {
            // 非根目录下使用children
            current = current.children[index];
        }
    }
    return current;
}

// 文件夹编辑模态框
window.openFolderEditModal = function(index) {
    const modal = document.getElementById('folder-edit-modal');
    const folder = appData.links[index];
    
    document.getElementById('folder-edit-index').value = index;
    document.getElementById('folder-edit-name').value = folder.name;
    
    modal.style.display = 'block';
}

window.closeFolderEditModal = function() {
    document.getElementById('folder-edit-modal').style.display = 'none';
}

window.saveFolderEdit = function() {
    const index = parseInt(document.getElementById('folder-edit-index').value);
    const name = document.getElementById('folder-edit-name').value.trim();
    
    if (!name) { alert('请填写文件夹名称'); return; }
    
    // 根据当前路径确定是编辑根目录还是文件夹内的文件夹
    if (currentFolderPath.length === 0) {
        // 编辑根目录的文件夹
        appData.links[index].name = name;
        saveData();
        renderIcons();
    } else {
        // 编辑文件夹内的文件夹
        const currentFolder = getFolderByPath(currentFolderPath);
        currentFolder.children[index].name = name;
        saveData();
        renderFolderContents(currentFolder);
        updateCurrentFolderDisplay();
    }
    
    closeFolderEditModal();
}

// 修改deleteLink函数以支持删除文件夹和批量删除
// 确认对话框相关变量
let confirmCallback = null;

// 打开确认对话框
function openConfirmModal(message, callback) {
    const modal = document.getElementById('confirm-modal');
    const messageElement = document.getElementById('confirm-message');
    messageElement.textContent = message;
    confirmCallback = callback;
    modal.style.display = 'block';
}

// 关闭确认对话框
function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    modal.style.display = 'none';
    confirmCallback = null;
}

// 确认操作
function confirmAction() {
    if (confirmCallback) {
        confirmCallback();
    }
    closeConfirmModal();
}

window.deleteLink = function(index) {
    // 检查是否有多选项目
    if (selectedItems.size > 0) {
        // 如果有多选项目，删除所有选中的项目
        openConfirmModal(`确定删除这 ${selectedItems.size} 个选中的项目吗？`, function() {
            // 将选中的索引按从大到小排序，避免删除时索引变化
            const sortedIndices = Array.from(selectedItems).sort((a, b) => b - a);
            sortedIndices.forEach(i => {
                appData.links.splice(i, 1);
            });
            // 清空选中状态
            selectedItems.clear();
            saveData();
            renderIcons();
            renderLinksList();
            // 检查编辑索引是否在删除范围内
            const editIndex = parseInt(document.getElementById('edit-index').value);
            if (sortedIndices.includes(editIndex)) resetAddForm();
        });
    } else {
        // 如果没有多选项目，只删除当前点击的项目
        openConfirmModal('确定要删除这个项目吗？', function() {
            appData.links.splice(index, 1);
            saveData();
            renderIcons();
            renderLinksList();
            if(document.getElementById('edit-index').value == index) resetAddForm();
        });
    }
}

function initSettingsListeners() {
    const modal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('open-settings-btn');
    const closeBtn = modal.querySelector('.close-btn');

    // --- Open/Close Modal --- //
    openBtn.onclick = () => {
        modal.style.display = "block";
        // Sync UI on open
        syncSettingsUI();
    };
    closeBtn.onclick = () => { modal.style.display = "none"; };
    window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

    // --- Settings Navigation --- //
    const navItems = document.querySelectorAll('.settings-nav-item');
    navItems.forEach(item => {
        item.onclick = () => {
            const section = item.dataset.section;
            
            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Show corresponding section
            document.querySelectorAll('.settings-section').forEach(sec => {
                sec.classList.remove('active');
            });
            document.getElementById(`${section}-section`).classList.add('active');
        };
    });
    
    // --- Storage Settings --- //
    const storageLocalBtn = document.getElementById('storage-local');
    const storageCloudflareBtn = document.getElementById('storage-cloudflare');
    const cloudflareConfig = document.getElementById('cloudflare-config');
    
    // 初始化存储方式按钮状态
    if (appData.storage.type === 'local') {
        storageLocalBtn.classList.add('active');
        storageCloudflareBtn.classList.remove('active');
        cloudflareConfig.style.display = 'none';
    } else {
        storageLocalBtn.classList.remove('active');
        storageCloudflareBtn.classList.add('active');
        cloudflareConfig.style.display = 'block';
    }
    
    // 本地存储按钮点击事件
    storageLocalBtn.onclick = () => {
        storageLocalBtn.classList.add('active');
        storageCloudflareBtn.classList.remove('active');
        cloudflareConfig.style.display = 'none';
        appData.storage.type = 'local';
    };
    
    // CloudFlare KV按钮点击事件
    storageCloudflareBtn.onclick = () => {
        storageLocalBtn.classList.remove('active');
        storageCloudflareBtn.classList.add('active');
        cloudflareConfig.style.display = 'block';
        // 填充CloudFlare配置
        document.getElementById('cf-api-url').value = appData.storage.cloudflare.apiUrl || '';
        document.getElementById('cf-api-key').value = appData.storage.cloudflare.apiKey || '';
    };
    
    // 测试连接按钮点击事件
    document.getElementById('btn-test-cloudflare').onclick = async () => {
        let apiUrl = document.getElementById('cf-api-url').value;
        const apiKey = document.getElementById('cf-api-key').value;
        
        if (!apiUrl || !apiKey) {
            alert('请填写完整的CloudFlare KV配置');
            return;
        }
        
        // 自动添加 /api/myHomePageData 后缀
        if (!apiUrl.endsWith('/api/myHomePageData')) {
            apiUrl = apiUrl.replace(/\/$/, '') + '/api/myHomePageData';
        }
        
        try {
            // 显示加载状态
            const testBtn = document.getElementById('btn-test-cloudflare');
            const originalText = testBtn.textContent;
            testBtn.textContent = '测试中...';
            testBtn.disabled = true;
            
            // 先尝试读取数据
            console.log('开始测试Cloudflare KV连接...');
            console.log('请求URL:', apiUrl);
            
            const readResponse = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                }
            });
            
            console.log('读取请求状态:', readResponse.status);
            
            if (readResponse.ok) {
                console.log('读取成功！');
                // 检查云端是否有数据
                const cloudData = await readResponse.json();
                console.log('云端数据:', cloudData);
                
                // 检查本地是否有数据
                const hasLocalData = appData.links && appData.links.length > 0;
                const hasCloudData = cloudData && cloudData.links && cloudData.links.length > 0;
                
                // 如果两边都有数据，显示选择对话框
                if (hasLocalData && hasCloudData) {
                    showCloudflareSyncDialog(apiUrl, apiKey);
                } else if (hasCloudData) {
                    // 只有云端有数据，自动下载
                    await downloadFromCloud(apiUrl, apiKey);
                } else if (hasLocalData) {
                    // 只有本地有数据，自动上传
                    await uploadToCloud(apiUrl, apiKey);
                } else {
                    // 两边都没有数据，只是显示连接成功
                    alert('连接成功！Worker API 工作正常。');
                }
            } else if (readResponse.status === 404) {
                console.log('读取失败：键不存在，这是正常的');
                // 检查本地是否有数据
                const hasLocalData = appData.links && appData.links.length > 0;
                
                if (hasLocalData) {
                    // 本地有数据，上传到云端
                    await uploadToCloud(apiUrl, apiKey);
                } else {
                    // 本地也没有数据，尝试写入一个测试数据
                    const testData = { test: true, timestamp: new Date().toISOString() };
                    const writeResponse = await fetch(apiUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify(testData) });
                    
                    if (writeResponse.ok) {
                        console.log('写入成功！');
                        alert('连接成功！Worker API 工作正常。');
                    } else {
                        console.log('写入失败，状态码:', writeResponse.status);
                        try {
                            const errorData = await writeResponse.json();
                            console.log('错误信息:', errorData);
                            alert(`连接失败，状态码：${writeResponse.status}\n错误信息：${errorData.error || errorData.message || '未知错误'}`);
                        } catch {
                            alert(`连接失败，状态码：${writeResponse.status}`);
                        }
                    }
                }
            } else if (readResponse.status === 401) {
                console.log('认证失败：UUID 密钥错误');
                alert('连接失败：UUID 密钥错误，请检查配置。');
            } else {
                console.log('读取失败，状态码:', readResponse.status);
                try {
                    const errorData = await readResponse.json();
                    console.log('错误信息:', errorData);
                    alert(`连接失败，状态码：${readResponse.status}\n错误信息：${errorData.error || errorData.message || '未知错误'}`);
                } catch {
                    alert(`连接失败，状态码：${readResponse.status}`);
                }
            }
        } catch (e) {
            console.error('测试连接失败:', e);
            
            // 提供更详细的错误信息和解决方案
            let errorMessage = '连接失败：';
            if (e.message.includes('Failed to fetch')) {
                errorMessage += '网络连接失败，可能的原因：\n';
                errorMessage += '1. 网络连接问题\n';
                errorMessage += '2. API 地址错误\n';
                errorMessage += '3. Worker 未部署或部署失败\n\n';
                errorMessage += '解决方案：\n';
                errorMessage += '1. 确保网络连接正常\n';
                errorMessage += '2. 检查 API 地址是否正确\n';
                errorMessage += '3. 确认 Worker 已成功部署\n';
                errorMessage += '4. 检查 Worker 日志中的错误信息';
            } else {
                errorMessage += e.message;
            }
            
            alert(errorMessage);
        } finally {
            // 确保按钮状态恢复
            const testBtn = document.getElementById('btn-test-cloudflare');
            testBtn.textContent = '测试连接';
            testBtn.disabled = false;
        }
    };
    
    // 保存存储设置按钮点击事件
    document.getElementById('btn-save-storage').onclick = async () => {
        if (storageCloudflareBtn.classList.contains('active')) {
            const apiUrl = document.getElementById('cf-api-url').value;
            const apiKey = document.getElementById('cf-api-key').value;
            
            if (!apiUrl || !apiKey) {
                alert('请填写完整的CloudFlare KV配置');
                return;
            }
            
            appData.storage.type = 'cloudflare';
            appData.storage.cloudflare.apiUrl = apiUrl;
            appData.storage.cloudflare.apiKey = apiKey;
        } else {
            appData.storage.type = 'local';
        }
        
        await saveData();
        alert('存储设置已保存');
    };
    
    // 显示CloudFlare同步对话框
    function showCloudflareSyncDialog(apiUrl, apiKey) {
        // 创建对话框
        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.style.display = 'block';
        dialog.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>数据同步</h2>
                    <span class="close-btn" onclick="this.parentElement.parentElement.parentElement.style.display='none';">&times;</span>
                </div>
                <div class="modal-body">
                    <p>检测到本地和云端都有数据，请选择同步方式：</p>
                    <div class="input-row" style="flex-direction: column; gap: 15px; margin-top: 20px;">
                        <button id="btn-download-cloud" class="btn-small" style="background:#17a2b8; width: 100%; padding: 12px;">
                            📥 删除本地并下载云端配置
                        </button>
                        <button id="btn-upload-local" class="btn-small" style="background:#28a745; width: 100%; padding: 12px;">
                            📤 删除云端并上传本地配置
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // 下载云端配置
        document.getElementById('btn-download-cloud').onclick = async () => {
            await downloadFromCloud(apiUrl, apiKey);
            dialog.style.display = 'none';
        };
        
        // 上传本地配置
        document.getElementById('btn-upload-local').onclick = async () => {
            await uploadToCloud(apiUrl, apiKey);
            dialog.style.display = 'none';
        };
    }
    
    // 从云端下载配置
    async function downloadFromCloud(apiUrl, apiKey) {
        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                }
            });
            
            if (response.ok) {
                const cloudData = await response.json();
                appData = cloudData;
                saveData();
                alert('云端配置已下载并覆盖本地配置');
                location.reload();
            } else {
                alert('下载云端配置失败');
            }
        } catch (error) {
            console.error('下载云端配置失败:', error);
            alert('下载云端配置失败: ' + error.message);
        }
    }
    
    // 上传本地配置到云端
    async function uploadToCloud(apiUrl, apiKey) {
        try {
            // 先删除云端数据
            await fetch(apiUrl, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                }
            });
            
            // 再上传本地数据
            const response = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify(appData)
            });
            
            if (response.ok) {
                alert('本地配置已上传并覆盖云端配置');
            } else {
                alert('上传本地配置失败');
            }
        } catch (error) {
            console.error('上传本地配置失败:', error);
            alert('上传本地配置失败: ' + error.message);
        }
    }
    
    // 下载本地化部署资料按钮点击事件
    document.getElementById('btn-download-local').onclick = () => {
        // 创建下载链接
        const downloadLink = document.createElement('a');
        downloadLink.href = 'file.zip';
        downloadLink.download = 'local-deployment-package.zip';
        downloadLink.target = '_blank';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    };
    
    // 清除所有数据按钮点击事件
    document.getElementById('btn-clear-all-data').onclick = () => {
        openClearDataModal();
    };
    
    // 打开清除数据对话框
    function openClearDataModal() {
        document.getElementById('clear-data-modal').style.display = 'block';
        document.getElementById('clear-data-step-1').style.display = 'block';
        document.getElementById('clear-data-step-2').style.display = 'none';
        document.getElementById('clear-data-confirm-input').value = '';
    }
    
    // 关闭清除数据对话框
    window.closeClearDataModal = function() {
        document.getElementById('clear-data-modal').style.display = 'none';
    }
    
    // 第一步确认按钮点击事件
    document.getElementById('btn-confirm-step-1').onclick = () => {
        document.getElementById('clear-data-step-1').style.display = 'none';
        document.getElementById('clear-data-step-2').style.display = 'block';
    };
    
    // 第二步返回按钮点击事件
    document.getElementById('btn-back-step-2').onclick = () => {
        document.getElementById('clear-data-step-2').style.display = 'none';
        document.getElementById('clear-data-step-1').style.display = 'block';
    };
    
    // 第二步确认按钮点击事件
    document.getElementById('btn-confirm-step-2').onclick = () => {
        const confirmText = document.getElementById('clear-data-confirm-input').value.trim();
        if (confirmText === '我确定清除') {
            clearAllData();
        } else {
            alert('请输入正确的确认文本');
        }
    };
    
    // 清除所有数据
    async function clearAllData() {
        try {
            // 清除本地存储
            localStorage.clear();
            
            // 重置应用数据
            appData = JSON.parse(JSON.stringify(DEFAULTS));
            
            // 如果使用CloudFlare KV，也清除云端数据
            if (appData.storage.type === 'cloudflare' && appData.storage.cloudflare.apiUrl && appData.storage.cloudflare.apiKey) {
                try {
                    await saveToCloudflareKV();
                } catch (e) {
                    console.error('清除云端数据失败:', e);
                    // 云端数据清除失败不影响本地数据清除
                }
            }
            
            // 关闭对话框
            closeClearDataModal();
            
            // 重新初始化应用
            await loadData();
            renderApps();
            renderSearchEngines();
            // 重新渲染设置界面
            renderLinksList();
            renderEnginesList();
            
            // 显示成功提示
            alert('所有数据已成功清除');
        } catch (e) {
            console.error('清除数据失败:', e);
            // 即使出现错误，本地存储已经被清除，所以仍然显示成功提示
            closeClearDataModal();
            alert('所有数据已成功清除');
            // 刷新页面以确保应用状态正确
            location.reload();
        }
    }

    // --- Auto-saving Setting Handlers --- //

    // Theme
    document.getElementById('theme-light').onclick = () => { updateSetting('theme', 'light', applyTheme); };
    document.getElementById('theme-auto').onclick = () => { updateSetting('theme', 'auto', applyTheme); };
    document.getElementById('theme-dark').onclick = () => { updateSetting('theme', 'dark', applyTheme); };

    // Header Text Color
    document.getElementById('header-text-auto').onclick = () => { updateSetting('headerTextColor', 'auto', applyHeaderTextColor); };
    document.getElementById('header-text-light').onclick = () => { updateSetting('headerTextColor', 'light', applyHeaderTextColor); };
    document.getElementById('header-text-dark').onclick = () => { updateSetting('headerTextColor', 'dark', applyHeaderTextColor); };

    // Transparent Header
    document.getElementById('transparent-header-toggle').onclick = () => {
        const button = document.getElementById('transparent-header-toggle');
        const currentState = button.dataset.state === 'on';
        updateSetting('transparentHeader', !currentState, applyHeaderTransparent);
        syncToggle(button, !currentState);
    };

    // Weather
    document.getElementById('weather-toggle').onclick = () => {
        const button = document.getElementById('weather-toggle');
        const currentState = button.dataset.state === 'on';
        updateSetting('showWeather', !currentState, () => {
            syncWeatherSettingsUI();
            applyWeatherUI();
        });
        syncToggle(button, !currentState);
    };
    document.getElementById('weather-loc-auto').onclick = () => {
        updateSetting('weatherLocationMode', 'auto', () => {
            syncWeatherSettingsUI();
            fetchAndRenderWeather();
        });
    };
    document.getElementById('weather-loc-manual').onclick = () => {
        updateSetting('weatherLocationMode', 'manual', syncWeatherSettingsUI);
    };
    document.getElementById('weather-manual-city').onchange = (e) => {
        updateSetting('weatherManualCity', e.target.value, fetchAndRenderWeather);
    };

    // Header Shadow
    document.getElementById('header-shadow-toggle').onclick = () => {
        const button = document.getElementById('header-shadow-toggle');
        const currentState = button.dataset.state === 'on';
        updateSetting('headerShadow', !currentState, applyHeaderTransparent);
        syncToggle(button, !currentState);
    };

    document.getElementById('quick-add-toggle').onclick = () => {
        const button = document.getElementById('quick-add-toggle');
        const currentState = button.dataset.state === 'on';
        updateSetting('showQuickAdd', !currentState, renderIcons);
        syncToggle(button, !currentState);
    };

    // Default Search Engine
    document.getElementById('default-search-engine').onchange = (e) => {
        updateSetting('defaultSearchEngine', e.target.value, () => {
            document.getElementById('search-engine-select').value = e.target.value;
            updateSearchPlaceholder();
        });
    };

    // --- Manual-saving Actions --- //

    // Add/Reset Search Engines
    document.getElementById('btn-add-engine').onclick = () => { openEngineModal(); };
    document.getElementById('btn-reset-engines').onclick = () => {
        openConfirmModal('确定删除所有自定义搜索引擎吗？', function() {
            appData.customEngines = {};
            appData.defaultSearchEngine = DEFAULTS.defaultSearchEngine;
            saveData();
            mergeEngines();
            renderSearchDropdowns();
            renderEnginesList();
        });
    };

    // Save/Reset Background
    document.getElementById('btn-save-bg').onclick = () => {
        if (currentBgType === 'color') {
            appData.bgType = 'color';
            appData.bgValue = document.getElementById('color-picker-input').value;
        } else if (currentBgType === 'url') {
            const val = document.getElementById('bg-url-input').value.trim();
            if (!val) { alert('请输入 URL'); return; }
            appData.bgType = 'url';
            appData.bgValue = val;
        } else if (currentBgType === 'local') {
            const val = document.getElementById('bg-local-input').value.trim();
            if (!val) { alert('请输入本地文件路径'); return; }
            appData.bgType = 'local';
            appData.bgValue = val;
        } else if (currentBgType === 'upload') {
            const compressedData = document.getElementById('bg-upload-input').dataset.compressed;
            if (!compressedData) { alert('请先上传并等待图片压缩完成'); return; }
            appData.bgType = 'base64';
            appData.bgValue = compressedData;
        } else if (currentBgType === 'daily') {
            appData.bgType = 'daily';
            appData.bgValue = ''; // Clear any previous value
        }
        saveData();
        applyBackground();
        alert('背景已保存');
    };
    document.getElementById('btn-reset-bg').onclick = () => {
        appData.bgType = 'theme';
        appData.bgValue = '';
        saveData();
        applyBackground();
    };

    // Handle image upload and compression
    document.getElementById('bg-upload-input').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const previewPanel = document.getElementById('upload-preview');
        const previewImg = document.getElementById('upload-preview-img');
        const infoDiv = document.getElementById('upload-info');

        previewPanel.style.display = 'block';
        infoDiv.textContent = '正在压缩图片...';
        previewImg.src = '';

        try {
            const compressedDataUrl = await compressImage(file);
            previewImg.src = compressedDataUrl;
            
            const originalSize = (file.size / 1024).toFixed(2);
            const newSize = (compressedDataUrl.length * 0.75 / 1024).toFixed(2);
            infoDiv.textContent = `压缩成功！原大小: ${originalSize} KB -> 新大小: ${newSize} KB`;

            // Store the compressed data temporarily until user hits save
            e.target.dataset.compressed = compressedDataUrl;

        } catch (error) {
            infoDiv.textContent = `压缩失败: ${error.message}`;
            previewImg.src = '';
            e.target.dataset.compressed = '';
        }
    };

    // Save Title
    document.getElementById('btn-save-title').onclick = () => {
        const val = document.getElementById('title-input').value.trim();
        if (val) { 
            appData.title = val; 
            saveData(); 
            renderTitle(); 
        }
    };

    // Add/Update/Cancel Link
    document.getElementById('btn-add-link').onclick = () => {
        const nameInput = document.getElementById('new-link-name');
        const urlInput = document.getElementById('new-link-url');
        const indexInput = document.getElementById('edit-index');
        const name = nameInput.value.trim();
        let url = urlInput.value.trim();
        const editIndex = parseInt(indexInput.value);

        if (name && url) {
            if (!url.startsWith('http')) url = 'https://' + url;
            if (editIndex >= 0) {
                appData.links[editIndex] = { name, url };
            } else {
                appData.links.push({ name, url });
            }
            saveData();
            renderIcons();
            renderLinksList();
            resetAddForm();
        } else {
            alert('请填写名称和网址');
        }
    };
    document.getElementById('btn-cancel-edit').onclick = () => { resetAddForm(); };

    // Import/Export
    document.getElementById('btn-export-config').onclick = () => {
        const dataStr = JSON.stringify(appData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `homepage-config-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    // 导出符合Edge/Chrome风格的收藏网页数据
    document.getElementById('btn-export-bookmarks').onclick = () => {
        // 创建HTML格式的书签
        function createHtmlBookmark(node, indent) {
            let html = '';
            const indentStr = ' '.repeat(indent * 4);
            
            if (node.type === 'folder' && node.children) {
                html += `${indentStr}<DT><H3 ADD_DATE="${Date.now()}">${node.name}</H3>\n`;
                html += `${indentStr}<DL><p>\n`;
                node.children.forEach(child => {
                    html += createHtmlBookmark(child, indent + 1);
                });
                html += `${indentStr}</DL><p>\n`;
            } else if (node.type !== 'folder' && node.url) {
                html += `${indentStr}<DT><A HREF="${node.url}" ADD_DATE="${Date.now()}">${node.name}</A>\n`;
            }
            
            return html;
        }
        
        // 构建HTML书签文件
        const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>书签</TITLE>
<H1>书签</H1>
<DL><p>
<DT><H3 ADD_DATE="${Date.now()}" PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
<DL><p>
${appData.links.map(link => createHtmlBookmark(link, 2)).join('')}
</DL><p>
</DL><p>`;
        
        // 导出为HTML文件
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookmarks-${new Date().toISOString().slice(0, 10)}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    document.getElementById('btn-import-config').onclick = () => {
        document.getElementById('file-import-input').click();
    };
    document.getElementById('file-import-input').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (importedData.links && importedData.title) {
                    appData = importedData;
                    saveData();
                    location.reload();
                } else {
                    alert('配置文件格式不正确');
                }
            } catch (err) {
                alert('文件解析失败');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // 书签导入功能
    initBookmarkImport();
};

// 初始化书签导入功能
function initBookmarkImport() {
    // 浏览器选择
    const browserEdgeBtn = document.getElementById('browser-edge');
    const browserChromeBtn = document.getElementById('browser-chrome');
    let selectedBrowser = 'edge';

    browserEdgeBtn.onclick = () => {
        browserEdgeBtn.classList.add('active');
        browserChromeBtn.classList.remove('active');
        selectedBrowser = 'edge';
    };

    browserChromeBtn.onclick = () => {
        browserChromeBtn.classList.add('active');
        browserEdgeBtn.classList.remove('active');
        selectedBrowser = 'chrome';
    };

    // 默认选择Edge
    browserEdgeBtn.click();

    // 导入模式选择
    const importIncrementalBtn = document.getElementById('import-incremental');
    const importFullBtn = document.getElementById('import-full');
    let importMode = 'incremental';

    importIncrementalBtn.onclick = () => {
        importIncrementalBtn.classList.add('active');
        importFullBtn.classList.remove('active');
        importMode = 'incremental';
    };

    importFullBtn.onclick = () => {
        importFullBtn.classList.add('active');
        importIncrementalBtn.classList.remove('active');
        importMode = 'full';
    };

    // 默认选择增量导入
    importIncrementalBtn.click();

    // 文件选择
    const btnSelectBookmark = document.getElementById('btn-select-bookmark');
    const bookmarkFileInput = document.getElementById('bookmark-file-input');
    const bookmarkFileName = document.getElementById('bookmark-file-name');

    btnSelectBookmark.onclick = () => {
        bookmarkFileInput.click();
    };

    bookmarkFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            bookmarkFileName.textContent = file.name;
            parseBookmarkFile(file, selectedBrowser);
        } else {
            bookmarkFileName.textContent = '未选择文件';
            document.getElementById('import-preview').innerHTML = '<p style="text-align: center; color: #888;">请选择书签文件以查看预览</p>';
        }
    };

    // 导入按钮
    const btnImportBookmark = document.getElementById('btn-import-bookmark');
    let parsedBookmarks = [];

    btnImportBookmark.onclick = () => {
        if (parsedBookmarks.length === 0) {
            alert('请先选择并解析书签文件');
            return;
        }

        importBookmarks(parsedBookmarks, importMode);
    };

    // 解析书签文件
    function parseBookmarkFile(file, browser) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const htmlContent = event.target.result;
                parsedBookmarks = parseBookmarkHTML(htmlContent, browser);
                displayBookmarkPreview(parsedBookmarks);
            } catch (err) {
                alert('书签文件解析失败: ' + err.message);
                document.getElementById('import-preview').innerHTML = '<p style="text-align: center; color: #ff0000;">解析失败，请检查文件格式</p>';
            }
        };
        reader.readAsText(file);
    }

    // 解析书签HTML文件
    function parseBookmarkHTML(htmlContent, browser) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // 查找书签文件夹根节点
        const rootNode = doc.querySelector('dl');
        if (!rootNode) {
            return [];
        }
        
        // 递归解析文件夹结构
        function parseNode(node, parentPath = '') {
            const items = [];
            let currentFolder = null;
            
            for (let child of node.children) {
                if (child.tagName === 'DT') {
                    const h3 = child.querySelector('h3');
                    const a = child.querySelector('a');
                    const dl = child.querySelector('dl');
                    
                    if (h3) {
                        // 文件夹
                        const folderName = h3.textContent.trim();
                        const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
                        currentFolder = {
                            type: 'folder',
                            name: folderName,
                            path: folderPath,
                            children: []
                        };
                        items.push(currentFolder);
                        
                        // 解析文件夹内的内容
                        if (dl) {
                            const folderItems = parseNode(dl, folderPath);
                            currentFolder.children = folderItems;
                        }
                    } else if (a) {
                        // 书签
                        const href = a.getAttribute('href');
                        const title = a.textContent.trim();
                        
                        if (href && title) {
                            items.push({
                                type: 'bookmark',
                                name: title,
                                url: href,
                                path: parentPath
                            });
                        }
                    }
                }
            }
            
            return items;
        }
        
        return parseNode(rootNode);
    }

    // 显示书签预览
    function displayBookmarkPreview(bookmarks) {
        const previewDiv = document.getElementById('import-preview');
        
        if (bookmarks.length === 0) {
            previewDiv.innerHTML = '<p style="text-align: center; color: #888;">未找到书签</p>';
            return;
        }

        // 计算书签总数
        function countBookmarks(items) {
            let count = 0;
            items.forEach(item => {
                if (item.type === 'bookmark') {
                    count++;
                } else if (item.type === 'folder' && item.children) {
                    count += countBookmarks(item.children);
                }
            });
            return count;
        }

        // 递归生成预览HTML
        function generatePreviewHTML(items, indent = 0) {
            let html = '<ul style="list-style: none; padding-left: ' + (indent * 20) + 'px;">';
            items.forEach((item, index) => {
                if (item.type === 'folder') {
                    html += `<li style="padding: 5px; border-bottom: 1px solid #eee;">`;
                    html += `<strong style="color: #007bff;">📁 ${item.name}</strong>`;
                    if (item.children && item.children.length > 0) {
                        html += generatePreviewHTML(item.children, indent + 1);
                    }
                    html += `</li>`;
                } else if (item.type === 'bookmark') {
                    html += `<li style="padding: 5px; border-bottom: 1px solid #eee;">`;
                    html += `<strong>${item.name}</strong><br>`;
                    html += `<small style="color: #888;">${item.url}</small>`;
                    if (item.path) {
                        html += `<br><small style="color: #6c757d;">文件夹: ${item.path}</small>`;
                    }
                    html += `</li>`;
                }
            });
            html += '</ul>';
            return html;
        }

        const totalBookmarks = countBookmarks(bookmarks);
        let html = generatePreviewHTML(bookmarks);
        html += `<p style="text-align: center; margin-top: 10px; font-size: 0.9rem; color: #888;">共 ${totalBookmarks} 个书签</p>`;

        previewDiv.innerHTML = html;
    }

    // 导入书签
    function importBookmarks(bookmarks, mode) {
        const progressDiv = document.getElementById('import-progress');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        // 显示进度条
        progressDiv.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = '准备导入...';

        // 计算书签总数
        function countBookmarks(items) {
            let count = 0;
            items.forEach(item => {
                if (item.type === 'bookmark') {
                    count++;
                } else if (item.type === 'folder' && item.children) {
                    count += countBookmarks(item.children);
                }
            });
            return count;
        }

        const totalCount = countBookmarks(bookmarks);
        let importedCount = 0;

        // 如果是全量导入，先清空现有链接
        if (mode === 'full') {
            appData.links = [];
        }

        // 查找或创建文件夹
        function findOrCreateFolder(path) {
            if (!path) return appData.links;
            
            const pathParts = path.split('/');
            let currentFolder = appData.links;
            
            pathParts.forEach(folderName => {
                let folder = currentFolder.find(item => item.type === 'folder' && item.name === folderName);
                if (!folder) {
                    folder = { name: folderName, type: 'folder', children: [] };
                    currentFolder.push(folder);
                }
                currentFolder = folder.children;
            });
            
            return currentFolder;
        }

        // 递归导入书签
        function importItems(items) {
            items.forEach(item => {
                if (item.type === 'folder' && item.children) {
                    // 导入文件夹内的内容
                    importItems(item.children);
                } else if (item.type === 'bookmark') {
                    // 查找或创建目标文件夹
                    const targetFolder = findOrCreateFolder(item.path);
                    
                    // 检查是否已存在相同的链接
                    const existingIndex = targetFolder.findIndex(link => link.url === item.url);
                    if (existingIndex === -1 || mode === 'full') {
                        if (existingIndex === -1) {
                            targetFolder.push({ name: item.name, url: item.url });
                        } else {
                            targetFolder[existingIndex] = { name: item.name, url: item.url };
                        }
                        importedCount++;
                    }
                }
            });
        }

        // 开始导入
        importItems(bookmarks);

        // 更新进度条
        let progress = Math.round((importedCount / totalCount) * 100);
        progressFill.style.width = `${progress}%`;
        progressText.textContent = '导入完成！';
        
        // 保存数据
        saveData();
        
        // 延迟关闭进度条并显示成功消息
        setTimeout(() => {
            progressDiv.style.display = 'none';
            alert(`成功导入 ${importedCount} 个书签`);
            // 重新渲染图标
            renderIcons();
        }, 1000);
    }
}

/**
 * A helper function to update a setting, save it, and apply the change.
 * @param {string} key The key in appData to update.
 * @param {*} value The new value.
 * @param {Function} applyFunction The function to call to apply the change visually.
 */
function updateSetting(key, value, applyFunction) {
    appData[key] = value;
    saveData();
    if (applyFunction) {
        applyFunction();
    }
}

/**
 * Syncs the entire settings modal UI based on the current appData.
 */
function syncSettingsUI() {
    // Sync storage settings
    const storageLocalBtn = document.getElementById('storage-local');
    const storageCloudflareBtn = document.getElementById('storage-cloudflare');
    const cloudflareConfig = document.getElementById('cloudflare-config');
    
    if (appData.storage.type === 'local') {
        storageLocalBtn.classList.add('active');
        storageCloudflareBtn.classList.remove('active');
        cloudflareConfig.style.display = 'none';
    } else {
        storageLocalBtn.classList.remove('active');
        storageCloudflareBtn.classList.add('active');
        cloudflareConfig.style.display = 'block';
        document.getElementById('cf-api-url').value = appData.storage.cloudflare.apiUrl || '';
        document.getElementById('cf-api-key').value = appData.storage.cloudflare.apiKey || '';
    }
    
    // Sync background inputs
    document.getElementById('color-picker-input').value = (appData.bgType === 'color' ? appData.bgValue : '#ffffff');
    document.getElementById('bg-url-input').value = (appData.bgType === 'url' ? appData.bgValue : '');
    document.getElementById('bg-local-input').value = (appData.bgType === 'local' ? appData.bgValue : '');

    // Handle upload preview
    const previewPanel = document.getElementById('upload-preview');
    if (appData.bgType === 'base64' && appData.bgValue) {
        previewPanel.style.display = 'block';
        document.getElementById('upload-preview-img').src = appData.bgValue;
        document.getElementById('upload-info').textContent = '当前已保存的图片。';
    } else {
        previewPanel.style.display = 'none';
    }
    document.getElementById('bg-upload-input').value = ''; // Clear file input
    delete document.getElementById('bg-upload-input').dataset.compressed;

    if (['color', 'local', 'url', 'base64', 'daily'].includes(appData.bgType)) {
        currentBgType = appData.bgType === 'base64' ? 'upload' : appData.bgType;
    } else {
        currentBgType = 'color'; // Default to color tab if it's 'theme'
    }
    updateBgTabsUI();

    // Sync toggle buttons
    syncToggle(document.getElementById('transparent-header-toggle'), appData.transparentHeader);
    syncToggle(document.getElementById('header-shadow-toggle'), appData.headerShadow);
    syncToggle(document.getElementById('quick-add-toggle'), appData.showQuickAdd);
    syncToggle(document.getElementById('weather-toggle'), appData.showWeather);

    // Sync weather specific UI
    syncWeatherSettingsUI();

    // Sync other settings
    renderLinksList();
    renderEnginesList();
    resetAddForm();
}

function syncToggle(button, isOn) {
    if (isOn) {
        button.dataset.state = 'on';
        button.textContent = '开';
    } else {
        button.dataset.state = 'off';
        button.textContent = '关';
    }
}

function syncWeatherSettingsUI() {
    const weatherOptions = document.getElementById('weather-options');
    weatherOptions.style.display = appData.showWeather ? 'block' : 'none';

    const autoBtn = document.getElementById('weather-loc-auto');
    const manualBtn = document.getElementById('weather-loc-manual');
    const manualInput = document.getElementById('weather-manual-input-container');

    if (appData.weatherLocationMode === 'auto') {
        autoBtn.classList.add('active');
        manualBtn.classList.remove('active');
        manualInput.style.display = 'none';
    } else {
        autoBtn.classList.remove('active');
        manualBtn.classList.add('active');
        manualInput.style.display = 'block';
    }

    document.getElementById('weather-manual-city').value = appData.weatherManualCity;
}

function resetAddForm() {
    document.getElementById('new-link-name').value = '';
    document.getElementById('new-link-url').value = '';
    document.getElementById('edit-index').value = '-1';
    document.getElementById('btn-add-link').innerText = '添加';
    document.getElementById('btn-cancel-edit').style.display = 'none';
}
window.prepareEdit = function(index) {
    const link = appData.links[index];
    document.getElementById('new-link-name').value = link.name;
    document.getElementById('new-link-url').value = link.url;
    document.getElementById('edit-index').value = index;
    document.getElementById('btn-add-link').innerText = '更新';
    document.getElementById('btn-cancel-edit').style.display = 'inline-block';
    document.getElementById('new-link-name').scrollIntoView({behavior: "smooth"});
}
// 这个函数会被上面的deleteLink函数覆盖，所以不需要修改
// window.deleteLink = function(index) {
//     // 检查是否有多选项目
//     if (selectedItems.size > 0) {
//         // 如果有多选项目，删除所有选中的项目
//         if(confirm(`确定删除这 ${selectedItems.size} 个选中的图标吗？`)) {
//             // 将选中的索引按从大到小排序，避免删除时索引变化
//             const sortedIndices = Array.from(selectedItems).sort((a, b) => b - a);
//             sortedIndices.forEach(i => {
//                 appData.links.splice(i, 1);
//             });
//             // 清空选中状态
//             selectedItems.clear();
//             saveData();
//             renderIcons();
//             renderLinksList();
//             // 检查编辑索引是否在删除范围内
//             const editIndex = parseInt(document.getElementById('edit-index').value);
//             if (sortedIndices.includes(editIndex)) resetAddForm();
//         }
//     } else {
//         // 如果没有多选项目，只删除当前点击的项目
//         if(confirm('确定删除这个图标吗？')) {
//             appData.links.splice(index, 1);
//             saveData();
//             renderIcons();
//             renderLinksList();
//             if(document.getElementById('edit-index').value == index) resetAddForm();
//         }
//     }
// };
window.deleteEngine = function(key) {
    openConfirmModal('确定删除这个自定义搜索引擎吗？', function() {
        delete appData.customEngines[key];
        if (appData.defaultSearchEngine === key) appData.defaultSearchEngine = DEFAULTS.defaultSearchEngine;
        saveData();
        mergeEngines();
        renderSearchDropdowns();
        renderEnginesList();
    });
};

/**
 * Compresses an image file to a base64 string under a specified size limit.
 * @param {File} file The image file to compress.
 * @param {number} maxSizeKB The maximum size in kilobytes.
 * @returns {Promise<string>} A promise that resolves with the compressed base64 string.
 */
function compressImage(file, maxSizeKB = 500) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                let quality = 0.9;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                const maxSizeBytes = maxSizeKB * 1024;

                // Estimate base64 size (very rough, but good enough for this)
                const getBase64Size = (str) => str.length * 0.75;

                while (getBase64Size(dataUrl) > maxSizeBytes && quality > 0.1) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }

                if (getBase64Size(dataUrl) > maxSizeBytes) {
                    return reject(new Error(`无法将图片压缩到 ${maxSizeKB}KB 以下。`));
                }

                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 视口变化监听器，处理键盘弹出等情况
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
        const topBar = document.querySelector('.top-bar');
        if (topBar && window.innerWidth <= 768) {
            // 确保安全区域适配始终生效
            topBar.style.paddingTop = `max(10px, ${window.visualViewport.pageTop}px, env(safe-area-inset-top, 10px))`;
        }
    });
}

// 设备方向变化监听器
window.addEventListener('orientationchange', function() {
    const topBar = document.querySelector('.top-bar');
    if (topBar && window.innerWidth <= 768) {
        // 重新计算安全区域
        setTimeout(() => {
            topBar.style.paddingTop = 'max(10px, env(safe-area-inset-top, 10px))';
            topBar.style.paddingLeft = 'max(15px, env(safe-area-inset-left, 15px))';
            topBar.style.paddingRight = 'max(15px, env(safe-area-inset-right, 15px))';
        }, 100);
    }
});