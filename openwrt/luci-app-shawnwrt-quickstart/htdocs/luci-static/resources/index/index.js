(function() {
    // Utility: Detect LuCI base URL and token
    const baseUrl = window.location.pathname.split('/admin/')[0] + '/admin';
    const stokMatch = window.location.href.match(/stok=([a-f0-9]+)/);
    const stok = stokMatch ? stokMatch[1] : null;

    function getApiUrl(path) {
        let url = baseUrl + '/' + path;
        if (stok) {
            url = window.location.pathname.split(';stok=')[0] + ';stok=' + stok + '/admin/' + path;
        }
        return url;
    }

    // Utility: Format bytes
    function formatSpeed(bytes) {
        if (!bytes || bytes === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Chart logic
    const canvas = document.getElementById('sw-speed-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const MAX_DATA_POINTS = 60;
    const history = { down: new Array(MAX_DATA_POINTS).fill(0), up: new Array(MAX_DATA_POINTS).fill(0) };

    function drawChart() {
        const w = canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio;
        const h = canvas.height = canvas.parentElement.clientHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        const dw = canvas.parentElement.clientWidth;
        const dh = canvas.parentElement.clientHeight;

        ctx.clearRect(0, 0, dw, dh);
        const maxVal = Math.max(...history.down, ...history.up, 1024 * 10);
        const stepX = dw / (MAX_DATA_POINTS - 1);

        function drawLine(data, color, fillGradient) {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            for (let i = 0; i < MAX_DATA_POINTS; i++) {
                const x = i * stepX;
                const y = dh - (data[i] / maxVal) * (dh - 40) - 20;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.lineTo(dw, dh);
            ctx.lineTo(0, dh);
            ctx.fillStyle = fillGradient;
            ctx.fill();
        }

        const gradDown = ctx.createLinearGradient(0, 0, 0, dh);
        gradDown.addColorStop(0, 'rgba(0, 122, 255, 0.2)');
        gradDown.addColorStop(1, 'rgba(0, 122, 255, 0)');
        const gradUp = ctx.createLinearGradient(0, 0, 0, dh);
        gradUp.addColorStop(0, 'rgba(88, 86, 214, 0.2)');
        gradUp.addColorStop(1, 'rgba(88, 86, 214, 0)');

        drawLine(history.down, '#007aff', gradDown);
        drawLine(history.up, '#5856d6', gradUp);
    }

    // Data Polling
    let lastTraffic = null;
    let lastTime = Date.now();

    async function updateStatus() {
        try {
            const res = await fetch(getApiUrl('index/api/system/status'));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const result = data.result || {};

            if (result.hostname) document.getElementById('sw-device-name').textContent = result.hostname;

            if (result.uptime) {
                const s = parseInt(result.uptime);
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                const sec = s % 60;
                document.getElementById('sw-uptime').textContent = `Uptime: ${h}h ${m}m ${sec}s`;
            }

            if (result.cpuUsage !== undefined) {
                const cpu = parseInt(result.cpuUsage);
                document.getElementById('sw-cpu-val').textContent = cpu + '%';
                document.getElementById('sw-cpu-bar').style.width = cpu + '%';
            }
            if (result.memoryUsage !== undefined) {
                const mem = parseInt(result.memoryUsage);
                document.getElementById('sw-mem-val').textContent = mem + '%';
                document.getElementById('sw-mem-bar').style.width = mem + '%';
            }
            if (result.cpuTemperature) {
                document.getElementById('sw-temp-val').textContent = parseFloat(result.cpuTemperature).toFixed(1) + ' °C';
            }

            const netInd = document.getElementById('sw-net-status');
            const netTxt = netInd.querySelector('.sw-status-text');
            if (result.wan_ip && result.wan_ip !== '0.0.0.0') {
                netInd.className = 'sw-status-capsule online';
                netTxt.textContent = '网络已连接';
            } else {
                netInd.className = 'sw-status-capsule offline';
                netTxt.textContent = '正在确认联通性...';
            }

            if (result.traffic) {
                const now = Date.now();
                const dt = (now - lastTime) / 1000;
                if (lastTraffic && dt > 0) {
                    const dBytes = Math.max(0, result.traffic.rx_bytes - lastTraffic.rx_bytes);
                    const uBytes = Math.max(0, result.traffic.tx_bytes - lastTraffic.tx_bytes);
                    const dSpeed = dBytes / dt;
                    const uSpeed = uBytes / dt;

                    history.down.shift(); history.down.push(dSpeed);
                    history.up.shift(); history.up.push(uSpeed);

                    document.getElementById('sw-val-down').textContent = formatSpeed(dSpeed);
                    document.getElementById('sw-val-up').textContent = formatSpeed(uSpeed);
                    drawChart();
                }
                lastTraffic = result.traffic;
                lastTime = now;
            }

            if (result.interfaces) {
                const list = document.getElementById('sw-if-list');
                list.innerHTML = result.interfaces.map(iface => `
                    <div class="sw-if-item">
                        <div class="sw-if-info">
                            <span class="sw-if-name">${iface.name} <span class="sw-if-tag">${iface.device || ''}</span></span>
                            <span class="sw-if-ip">${iface.ip || '未分配 IP'}</span>
                        </div>
                        <div class="sw-if-meta">
                            <div class="sw-if-speed">${iface.speed ? iface.speed + 'M' : '--'}</div>
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) {
            console.error('Polling error:', e);
            document.getElementById('sw-net-status').querySelector('.sw-status-text').textContent = 'API 连接失败: ' + e.message;
        }
    }

    async function checkOTA() {
        try {
            const res = await fetch(getApiUrl('index/api/system/check-update'));
            const data = await res.json();
            if (data.update_available) document.getElementById('sw-ota-alert').classList.remove('hidden');
        } catch (e) {}
    }

    setInterval(updateStatus, 2000);
    updateStatus();
    checkOTA();
    window.addEventListener('resize', drawChart);
})();
