'use strict';
'require view';
'require uci';
'require fs';
'require ui';
'require form';

var zh = (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase().indexOf('zh') === 0;

function runOta(args) {
	return fs.exec('/usr/bin/shawnwrt-ota', args).then(function(res) {
		return { ok: true, stdout: (res.stdout || '').trim() };
	}).catch(function() {
		return { ok: false, stdout: '' };
	});
}

function parseInfo(text) {
	var info = {};
	(text || '').split(/\n/).forEach(function(line) {
		var pos = line.indexOf('=');
		if (pos > 0) info[line.slice(0, pos)] = line.slice(pos + 1);
	});
	return info;
}

return view.extend({
	load: function() {
		var self = this;
		return Promise.all([
			runOta(['board']),
			runOta(['status']),
			uci.load('shawnwrt_ota')
		]).then(function(results) {
			self._boardId = (results[0].stdout || '').trim();
			self._statusInfo = parseInfo(results[1].stdout);
			return self;
		});
	},

	render: function() {
		var self = this;
		var info = self._statusInfo;
		var boardId = self._boardId;
		
		var m, s, o;

		m = new form.Map('shawnwrt_ota', (zh ? '系统更新' : 'System Update'));

		// Status Display Section
		s = m.section(form.NamedSection, 'state', 'state', (zh ? '当前状态' : 'Current Status'));
		s.render = L.bind(function() {
			var color, bgColor, icon, title;
			if (info.STATE === 'current') {
				color = '#34c759';
				bgColor = 'rgba(52,199,89,0.1)';
				icon = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
				title = zh ? '当前已是最新版本' : 'System is up to date';
			} else if (info.STATE === 'update') {
				color = '#007aff';
				bgColor = 'rgba(0,122,255,0.1)';
				icon = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>';
				title = zh ? '发现新版本' : 'Update Available';
			} else {
				color = '#ff9500';
				bgColor = 'rgba(255,149,0,0.1)';
				icon = '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>';
				title = zh ? '正在检查更新...' : 'Checking...';
			}
			
			var sizeStr = info.SIZE ? (parseInt(info.SIZE) / 1048576).toFixed(1) + ' MB' : '---';
			
			var iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg>';
			var iconNode = E('div', { 'style': 'width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:' + bgColor + ';' });
			iconNode.style.webkitMask = 'url("data:image/svg+xml,' + encodeURIComponent(iconSvg) + '") center/contain no-repeat';
			iconNode.style.mask = 'url("data:image/svg+xml,' + encodeURIComponent(iconSvg) + '") center/contain no-repeat';
			iconNode.style.backgroundColor = color;
			
			var node = E('div', { 'class': 'cbi-section-descr' }, [
				E('div', { 'style': 'display:flex;align-items:center;gap:1rem;margin-bottom:1rem' }, [
					iconNode,
					E('div', [
						E('div', { 'style': 'font-size:1.1rem;font-weight:600;margin-bottom:0.2rem' }, [title]),
						E('div', { 'style': 'font-size:0.85rem;opacity:0.6;font-family:ui-monospace' }, [info.CLOUD_TAG || info.INSTALLED_TAG || '---'])
					])
				]),
				E('table', { 'style': 'width:100%;border-collapse:collapse;margin-top:1rem' }, [
					E('tbody', [
						E('tr', [E('td', { 'style': 'padding:0.5rem 0.8rem;border-bottom:1px solid rgba(0,0,0,0.06);font-size:0.8rem;opacity:0.5;width:40%' }, [zh ? '当前版本' : 'Current Version']), E('td', { 'style': 'padding:0.5rem 0.8rem;border-bottom:1px solid rgba(0,0,0,0.06);font-size:0.85rem;font-family:ui-monospace' }, [info.INSTALLED_TAG || '---'])]),
						E('tr', [E('td', { 'style': 'padding:0.5rem 0.8rem;border-bottom:1px solid rgba(0,0,0,0.06);font-size:0.8rem;opacity:0.5' }, [zh ? '云端版本' : 'Cloud Version']), E('td', { 'style': 'padding:0.5rem 0.8rem;border-bottom:1px solid rgba(0,0,0,0.06);font-size:0.85rem;font-family:ui-monospace' }, [info.CLOUD_TAG || '---'])]),
						E('tr', [E('td', { 'style': 'padding:0.5rem 0.8rem;border-bottom:1px solid rgba(0,0,0,0.06);font-size:0.8rem;opacity:0.5' }, [zh ? '设备目标' : 'Device Target']), E('td', { 'style': 'padding:0.5rem 0.8rem;border-bottom:1px solid rgba(0,0,0,0.06);font-size:0.85rem;font-family:ui-monospace' }, [boardId])]),
						E('tr', [E('td', { 'style': 'padding:0.5rem 0.8rem;font-size:0.8rem;opacity:0.5' }, [zh ? '文件大小' : 'File Size']), E('td', { 'style': 'padding:0.5rem 0.8rem;font-size:0.85rem;font-family:ui-monospace' }, [sizeStr])])
					])
				]),
				E('div', { 'style': 'display:flex;gap:0.5rem;margin-top:1rem' }, [
					info.STATE === 'update' ? E('button', {
						'class': 'btn cbi-button-action',
						'style': 'background:#007aff;color:#fff',
						'click': function() {
							ui.showModal(zh ? '下载并安装' : 'Download & Install', [
								E('p', [zh ? '更新过程中网络会短暂中断，完成后路由器将自动重启。建议在更新前备份配置。' : 'Network will disconnect briefly. The router will reboot automatically. Backup is recommended.']),
								E('div', { 'class': 'right' }, [
									E('button', { 'class': 'btn', 'click': ui.hideModal }, [zh ? '关闭' : 'Close']),
									' ',
									E('button', { 'class': 'btn cbi-button-negative', 'click': function() {
						ui.hideModal();
						var progressModal = ui.showModal(zh ? '正在下载并安装...' : 'Downloading & Installing...', [
							E('div', { 'style': 'text-align:center;padding:1rem' }, [
								E('div', { 'style': 'font-size:2rem;margin-bottom:1rem' }, ['⏳']),
								E('div', { 'id': 'ota-progress-text', 'style': 'font-size:0.9rem;margin-bottom:0.5rem' }, [zh ? '正在启动下载...' : 'Starting download...']),
								E('div', { 'style': 'width:100%;height:8px;background:rgba(0,0,0,0.1);border-radius:4px;overflow:hidden' }, [
									E('div', { 'id': 'ota-progress-bar', 'style': 'width:0%;height:100%;background:#007aff;transition:width 0.3s' })
								])
							])
						]);
						runOta(['start', 'all']).then(function() {
							var pollProgress = function() {
								runOta(['job-status']).then(function(res) {
									var job = parseInfo(res.stdout);
									var progressBar = document.getElementById('ota-progress-bar');
									var progressText = document.getElementById('ota-progress-text');
									if (!progressBar) return;
									
									if (job.JOB_RUNNING === '1') {
										var progress = parseInt(job.PROGRESS || '0');
										var stage = job.STAGE || '';
										progressBar.style.width = progress + '%';
										if (stage === 'download') {
											progressText.textContent = zh ? ('正在下载: ' + progress + '%') : ('Downloading: ' + progress + '%');
										} else if (stage === 'install') {
											progressText.textContent = zh ? '正在安装固件...' : 'Installing firmware...';
											progressBar.style.width = '100%';
										} else {
											progressText.textContent = zh ? '正在处理...' : 'Processing...';
										}
										setTimeout(pollProgress, 1000);
									} else {
										if (job.LAST_ERROR) {
											progressText.textContent = zh ? ('错误: ' + job.LAST_ERROR) : ('Error: ' + job.LAST_ERROR);
											progressBar.style.background = '#ff3b30';
											setTimeout(function() { ui.hideModal(); location.reload(); }, 3000);
										} else {
											progressText.textContent = zh ? '安装完成，正在重启...' : 'Installation complete, rebooting...';
											progressBar.style.width = '100%';
											progressBar.style.background = '#34c759';
											setTimeout(function() { location.reload(); }, 5000);
										}
									}
								});
							};
							setTimeout(pollProgress, 1000);
						});
					}}, [zh ? '确认' : 'Confirm'])
								])
							]);
						}
					}, [zh ? '下载并安装' : 'Download & Install']) : '',
					E('button', {
						'class': 'btn cbi-button-action',
						'click': function(ev) {
							ev.target.disabled = true;
							ev.target.textContent = zh ? '检查中...' : 'Checking...';
							runOta(['start', 'check']).then(function() {
								var poll = function() {
									runOta(['job-status']).then(function(res) {
										var job = parseInfo(res.stdout);
										if (job.JOB_RUNNING === '1') {
											setTimeout(poll, 1000);
										} else {
											location.reload();
										}
									});
								};
								poll();
							});
						}
					}, [zh ? '检查更新' : 'Check for Updates']),
					E('button', {
						'class': 'btn cbi-button-action',
						'click': function() {
							runOta(['job-status']).then(function(res) {
								ui.showModal(zh ? '执行日志' : 'Execution Log', [
									E('pre', { 'style': 'max-height:400px;overflow:auto;font-size:12px;font-family:ui-monospace;background:rgba(0,0,0,0.04);padding:1rem;border-radius:10px;white-space:pre-wrap' }, [res.stdout]),
									E('div', { 'class': 'right', 'style': 'margin-top:1rem' }, [
										E('button', { 'class': 'btn', 'click': ui.hideModal }, [zh ? '关闭' : 'Close'])
									])
								]);
							});
						}
					}, [zh ? '执行日志' : 'Execution Log'])
				])
			]);
			return node;
		}, this);

		// Auto Update Section
		s = m.section(form.NamedSection, 'auto', 'config', (zh ? '自动更新' : 'Auto Update'));
		s.anonymous = false;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', (zh ? '启用自动更新' : 'Enable Auto Update'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'start_hour', (zh ? '开始时间' : 'Start Time'));
		for (var h = 0; h < 24; h++) o.value(h, (h < 10 ? '0' : '') + h + ':00');
		o.default = '1';

		o = s.option(form.ListValue, 'end_hour', (zh ? '结束时间' : 'End Time'));
		for (var h = 0; h < 24; h++) o.value(h, (h < 10 ? '0' : '') + h + ':00');
		o.default = '3';
		o.validate = function(section_id, value) {
			var start = s.getUIElement(section_id, 'start_hour').getValue();
			if (parseInt(value) <= parseInt(start)) {
				return (zh ? '结束时间必须大于开始时间' : 'End time must be greater than start time');
			}
			return true;
		};

		return m.render();
	},
	
	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return fs.exec('/etc/init.d/shawnwrt-ota-cron', ['restart']).catch(function() {});
		});
	}
});
