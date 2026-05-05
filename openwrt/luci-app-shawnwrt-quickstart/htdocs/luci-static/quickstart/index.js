(function() {
    'use strict';

    var pollInterval = 2000;
    var maxChartPoints = 60;
    var chartData = { down: [], up: [] };
    var lastTraffic = null;
    var chartCanvas = document.getElementById('swrt-speed-chart');
    var chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;

    function formatSpeed(bytes) {
        if (bytes === 0) return '0 KB/s';
        var k = 1024;
        var sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        if (i < 0) i = 0;
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatUptime(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = seconds % 60;
        return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
    }

    function request(url) {
        return fetch(url).then(function(res) { return res.json(); });
    }

    function updateStatus() {
        request('/cgi-bin/luci/admin/quickstart/api/system/status').then(function(data) {
            var res = data.result;
            if (!res) return;

            document.getElementById('swrt-cpu-val').textContent = res.cpuUsage + '%';
            document.getElementById('swrt-cpu-bar').style.width = res.cpuUsage + '%';
            
            var memUsage = 100 - res.memAvailablePercentage;
            document.getElementById('swrt-mem-val').textContent = memUsage + '%';
            document.getElementById('swrt-mem-bar').style.width = memUsage + '%';
            
            document.getElementById('swrt-temp-val').textContent = (res.cpuTemperature || 0) + ' °C';
            document.getElementById('swrt-uptime').textContent = 'Uptime: ' + formatUptime(res.uptime);
        });

        request('/cgi-bin/luci/admin/quickstart/api/u/network/status').then(function(data) {
            var res = data.result;
            if (!res) return;

            var indicator = document.getElementById('swrt-net-indicator');
            if (res.networkInfo === 'netSuccess') {
                indicator.className = 'swrt-net-status online';
                indicator.querySelector('.swrt-status-text').textContent = '网络正常';
            } else {
                indicator.className = 'swrt-net-status offline';
                indicator.querySelector('.swrt-status-text').textContent = '未连接互联网';
            }

            var ifList = document.getElementById('swrt-if-list');
            ifList.innerHTML = '';
            
            ['wan', 'lan', 'wifi'].forEach(function(key) {
                var info = res[key];
                if (!info) return;

                var item = document.createElement('div');
                item.className = 'swrt-if-item';
                item.innerHTML = 
                    '<div class="swrt-if-main">' +
                        '<div class="swrt-if-name">' + key.toUpperCase() + ' <span class="swrt-if-tag">' + info.device + '</span></div>' +
                        '<div class="swrt-if-ip">' + info.ipaddr + '</div>' +
                    '</div>' +
                    '<div class="swrt-if-side">' +
                        '<div class="swrt-if-speed">' + info.speed + '</div>' +
                    '</div>';
                ifList.appendChild(item);
            });
        });

        // Update real-time speed from ubus directly for precision
        fetch('/ubus', {
            method: 'POST',
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "call", params: ["", "network.device", "status", {}] })
        }).then(function(res) { return res.json(); }).then(function(data) {
            var devices = data.result || {};
            var totalRx = 0, totalTx = 0;
            
            // Sum traffic for WAN or all physical devices
            for (var dev in devices) {
                if (dev === 'lo' || dev.indexOf('br-') === 0 || dev.indexOf('veth') === 0) continue;
                var stats = devices[dev].statistics;
                if (stats) {
                    totalRx += stats.rx_bytes;
                    totalTx += stats.tx_bytes;
                }
            }

            var now = Date.now();
            if (lastTraffic) {
                var dt = (now - lastTraffic.time) / 1000;
                var rxSpeed = (totalRx - lastTraffic.rx) / dt;
                var txSpeed = (totalTx - lastTraffic.tx) / dt;

                document.getElementById('swrt-cur-down').textContent = formatSpeed(rxSpeed);
                document.getElementById('swrt-cur-up').textContent = formatSpeed(txSpeed);

                updateChart(rxSpeed, txSpeed);
            }

            lastTraffic = { time: now, rx: totalRx, tx: totalTx };
        });
    }

    function updateChart(rx, tx) {
        chartData.down.push(rx);
        chartData.up.push(tx);
        if (chartData.down.length > maxChartPoints) {
            chartData.down.shift();
            chartData.up.shift();
        }
        drawChart();
    }

    function drawChart() {
        if (!chartCtx) return;

        var w = chartCanvas.clientWidth;
        var h = chartCanvas.clientHeight;
        chartCanvas.width = w * window.devicePixelRatio;
        chartCanvas.height = h * window.devicePixelRatio;
        chartCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

        chartCtx.clearRect(0, 0, w, h);

        var max = 1024 * 1024; // Min scale 1MB/s
        chartData.down.forEach(function(v) { if (v > max) max = v; });
        chartData.up.forEach(function(v) { if (v > max) max = v; });
        max = max * 1.1;

        function drawLine(data, color, fill) {
            if (data.length < 2) return;
            chartCtx.beginPath();
            chartCtx.strokeStyle = color;
            chartCtx.lineWidth = 2;
            chartCtx.lineJoin = 'round';
            
            var step = w / (maxChartPoints - 1);
            for (var i = 0; i < data.length; i++) {
                var x = i * step;
                var y = h - (data[i] / max) * h;
                if (i === 0) chartCtx.moveTo(x, y);
                else chartCtx.lineTo(x, y);
            }
            chartCtx.stroke();

            if (fill) {
                chartCtx.lineTo((data.length - 1) * step, h);
                chartCtx.lineTo(0, h);
                chartCtx.fillStyle = fill;
                chartCtx.fill();
            }
        }

        drawLine(chartData.down, '#007aff', 'rgba(0,122,255,0.1)');
        drawLine(chartData.up, '#5856d6', 'rgba(88,86,214,0.1)');
    }

    function checkOta() {
        request('/cgi-bin/luci/admin/quickstart/api/system/check-update').then(function(data) {
            if (data && data.result && data.result.needUpdate) {
                document.getElementById('swrt-ota-capsule').classList.remove('hidden');
            }
        }).catch(function() {});
    }

    // Initial load
    request('/cgi-bin/luci/admin/quickstart/api/u/system/version').then(function(data) {
        if (data.result && data.result.model) {
            document.getElementById('swrt-device-name').textContent = data.result.model;
        }
    });

    setInterval(updateStatus, pollInterval);
    updateStatus();
    checkOta();
    
    window.addEventListener('resize', drawChart);

})();
