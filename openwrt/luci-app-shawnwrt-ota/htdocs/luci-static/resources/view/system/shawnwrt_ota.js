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
			runOta(['job-status']),
			uci.load('shawnwrt_ota')
		]).then(function(results) {
			self._boardId = (results[0].stdout || '').trim();
			self._statusInfo = parseInfo(results[1].stdout);
			self._jobInfo = parseInfo(results[2].stdout);
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
			} else if (info.STATE === 'need_check') {
				color = '#8e8e93';
				bgColor = 'rgba(142,142,147,0.1)';
				icon = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
				title = zh ? '尚未检查更新' : 'Never checked';
				
				// Auto-trigger check on first load
				if (!this._autoChecked) {
					this._autoChecked = true;
					runOta(['start', 'check']).then(function() {
						setTimeout(function() { location.reload(); }, 3000);
					});
				}
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
					(info.STATE === 'update' && self._jobInfo.JOB_RUNNING !== '1') ? E('button', {
						'class': 'btn cbi-button-action',
						'style': 'background:#007aff;color:#fff',
						'click': function() {
							ui.showModal(zh ? '下载并安装' : 'Download & Install', [
								E('p', [zh ? '更新过程中网络会短暂中断，完成后路由器将自动重启。建议在更新前备份配置。' : 'Network will disconnect briefly. The router will reboot automatically. Backup is recommended.']),
								E('div', { 'class': 'right' }, [
									E('button', { 'class': 'btn', 'click': ui.hideModal }, [zh ? '取消' : 'Cancel']),
									' ',
									E('button', { 'class': 'btn cbi-button-negative', 'click': function() {
										ui.hideModal();
										runOta(['start', 'all']).then(function() {
											location.reload();
										});
									}}, [zh ? '确认' : 'Confirm'])
								])
							]);
						}
					}, [zh ? '下载并安装' : 'Download & Install']) : '',
					E('button', {
						'class': 'btn cbi-button-action',
						'disabled': (self._jobInfo.JOB_RUNNING === '1') ? 'disabled' : null,
						'click': function(ev) {
							ev.target.disabled = true;
							ev.target.textContent = zh ? '检查中...' : 'Checking...';
							runOta(['start', 'check']).then(function() {
								location.reload();
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

		// Ongoing Task Section
		if (self._jobInfo.JOB_RUNNING === '1') {
			s = m.section(form.NamedSection, 'task', 'state', (zh ? '正在执行任务' : 'Ongoing Task'));
			s.render = L.bind(function() {
				var job = self._jobInfo;
				var progress = parseInt(job.JOB_PROGRESS || '0');
				var stage = job.JOB_COMMAND === 'check' ? (zh ? '正在检查更新...' : 'Checking...') : (zh ? '正在下载固件...' : 'Downloading...');
				
				if (job.JOB_COMMAND === 'all' || job.JOB_COMMAND === 'download' || job.JOB_COMMAND === 'install') {
					var raw = job.LOG_BEGIN ? job.LOG_BEGIN : ''; // Actually it's inside the same stdout
					// We'll poll this
				}

				var node = E('div', { 'class': 'cbi-section-descr', 'style': 'padding:1rem;background:rgba(0,122,255,0.05);border-radius:12px;border:1px solid rgba(0,122,255,0.1)' }, [
					E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem' }, [
						E('div', { 'style': 'display:flex;align-items:center;gap:0.6rem' }, [
							E('span', { 'style': 'width:18px;height:18px;display:inline-block;color:#007aff' }, [
								E('svg', { 'viewBox': '0 0 24 24', 'xmlns': 'http://www.w3.org/2000/svg', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round', 'style': 'animation: ota-spin 1s linear infinite' }, [
									E('style', {}, ['@keyframes ota-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }']),
									E('circle', { 'cx': '12', 'cy': '12', 'r': '10', 'style': 'opacity:0.2' }),
									E('path', { 'd': 'M12 2 a 10 10 0 0 1 10 10' })
								])
							]),
							E('span', { 'id': 'ota-task-text', 'style': 'font-weight:500;font-size:0.9rem' }, [stage])
						]),
						E('span', { 'id': 'ota-task-percent', 'style': 'font-family:ui-monospace;font-size:0.85rem;opacity:0.7' }, [progress + '%'])
					]),
					E('div', { 'style': 'width:100%;height:6px;background:rgba(0,122,255,0.1);border-radius:3px;overflow:hidden' }, [
						E('div', { 'id': 'ota-task-bar', 'style': 'width:' + progress + '%;height:100%;background:#007aff;transition:width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' })
					])
				]);

				// Start polling loop
				var poll = function() {
					runOta(['job-status']).then(function(res) {
						var j = parseInfo(res.stdout);
						var bar = document.getElementById('ota-task-bar');
						var txt = document.getElementById('ota-task-text');
						var pct = document.getElementById('ota-task-percent');
						if (!bar) return;

						if (j.JOB_RUNNING === '1') {
							var prg = parseInt(j.JOB_PROGRESS || '0');
							bar.style.width = prg + '%';
							pct.textContent = prg + '%';
							
							if (j.JOB_COMMAND === 'check') {
								txt.textContent = zh ? '正在检查更新...' : 'Checking...';
							} else if (prg > 0 && prg < 100) {
								txt.textContent = zh ? ('正在下载固件: ' + prg + '%') : ('Downloading firmware: ' + prg + '%');
							} else if (prg >= 100) {
								txt.textContent = zh ? '正在校验并安装...' : 'Verifying and installing...';
							} else {
								txt.textContent = zh ? '正在准备任务...' : 'Preparing task...';
							}
							setTimeout(poll, 1500);
						} else {
							location.reload();
						}
					});
				};
				setTimeout(poll, 1500);

				return node;
			}, this);
		}

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

		// Advanced Section
		s = m.section(form.NamedSection, 'config', 'config', (zh ? '高级设置' : 'Advanced Settings'));
		
		o = s.option(form.Value, 'repo', (zh ? 'GitHub 仓库' : 'GitHub Repository'));
		o.placeholder = 'ShawnRn/immortalwrt-mt7981-cudy-tr3000';
		o.rmempty = false;

		o = s.option(form.Value, 'api_base', (zh ? 'API 基准地址' : 'API Base URL'));
		o.placeholder = 'https://api.github.com';
		o.rmempty = false;
		o.description = zh ? '如果 API 请求超时，可以尝试使用代理地址。' : 'Try a proxy if API requests timeout.';

		return m.render();
	},
	
	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return fs.exec('/etc/init.d/shawnwrt-ota-cron', ['restart']).catch(function() {});
		});
	}
});
