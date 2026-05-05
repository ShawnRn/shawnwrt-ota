'use strict';
'require view';
'require poll';
'require rpc';
'require fs';

var callSystemBoard = rpc.declare({object:'system',method:'board'});
var callSystemInfo = rpc.declare({object:'system',method:'info'});
var callNetIfDump = rpc.declare({object:'network.interface',method:'dump'});

var IC = {
	clock:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
	globe:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/></svg>',
	down:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
	up:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
	cpu:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
	mem:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 6V4M12 6V4M17 6V4M7 18v2M12 18v2M17 18v2"/></svg>',
	temp:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
	net:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
	wifi:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>',
	ota:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
	power:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/></svg>'
};

function fmtSpeed(b){
	if(b>=1073741824)return(b/1073741824).toFixed(1)+' GB/s';
	if(b>=1048576)return(b/1048576).toFixed(1)+' MB/s';
	if(b>=1024)return(b/1024).toFixed(1)+' KB/s';
	return b.toFixed(0)+' B/s';
}

function fmtUptime(s){
	var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
	if(d>0)return d+'天'+h+'时'+m+'分';
	if(h>0)return h+'时'+m+'分';
	return m+'分';
}

function parseNetDev(text){
	var r={};
	(text||'').split('\n').forEach(function(l){
		var m=l.trim().match(/^(\S+):\s*(.*)/);
		if(!m)return;
		var cols=m[2].trim().split(/\s+/).map(Number);
		r[m[1]]={rx:cols[0]||0,tx:cols[8]||0};
	});
	return r;
}

/* ── Smooth area chart on raw Canvas ── */
function SpeedChart(canvas){
	this.canvas=canvas;
	this.ctx=canvas.getContext('2d');
	this.MAX=60;
	this.down=[];
	this.up=[];
	for(var i=0;i<this.MAX;i++){this.down.push(0);this.up.push(0);}
}
SpeedChart.prototype.push=function(d,u){
	this.down.push(d);this.up.push(u);
	if(this.down.length>this.MAX)this.down.shift();
	if(this.up.length>this.MAX)this.up.shift();
	this.draw();
};
SpeedChart.prototype.draw=function(){
	var c=this.canvas,ctx=this.ctx;
	var dpr=window.devicePixelRatio||1;
	var w=c.parentNode.clientWidth,h=c.parentNode.clientHeight||200;
	c.width=w*dpr;c.height=h*dpr;
	c.style.width=w+'px';c.style.height=h+'px';
	ctx.scale(dpr,dpr);

	var fg=getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()||'#333';
	ctx.clearRect(0,0,w,h);

	/* grid */
	ctx.strokeStyle=fg;ctx.globalAlpha=0.06;ctx.lineWidth=1;
	for(var i=1;i<4;i++){
		var gy=h*i/4;
		ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(w,gy);ctx.stroke();
	}
	ctx.globalAlpha=1;

	var max=Math.max.apply(null,this.down.concat(this.up));
	if(max<1024)max=1024;
	max*=1.2;

	var self=this;
	function drawArea(data,color,alpha){
		var step=w/(self.MAX-1);
		var pts=data.map(function(v,i){return{x:i*step,y:h-v/max*(h-10)};});
		ctx.beginPath();
		ctx.moveTo(pts[0].x,pts[0].y);
		for(var i=0;i<pts.length-1;i++){
			var xm=(pts[i].x+pts[i+1].x)/2,ym=(pts[i].y+pts[i+1].y)/2;
			ctx.quadraticCurveTo(pts[i].x,pts[i].y,xm,ym);
		}
		ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y);
		ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
		ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();
		var grad=ctx.createLinearGradient(0,0,0,h);
		grad.addColorStop(0,color.replace(')',','+alpha+')').replace('rgb','rgba'));
		grad.addColorStop(1,color.replace(')',',0.02)').replace('rgb','rgba'));
		ctx.fillStyle=grad;ctx.fill();
	}
	drawArea(this.down,'rgb(0,122,255)',0.25);
	drawArea(this.up,'rgb(88,86,214)',0.2);
};

return view.extend({
	load:function(){
		return Promise.all([
			callSystemBoard(),
			callSystemInfo(),
			callNetIfDump(),
			fs.trimmed('/sys/class/thermal/thermal_zone0/temp').catch(function(){return'';}),
			fs.read('/proc/net/dev').catch(function(){return'';}),
			fs.exec('/usr/bin/shawnwrt-ota',['status']).catch(function(){return{stdout:''};})
		]);
	},

	render:function(data){
		var board=data[0]||{},sysinfo=data[1]||{},netdump=data[2]||{},
		    tempRaw=data[3]||'',netdevText=data[4]||'',otaRes=data[5]||{};

		var hostname=board.hostname||'ShawnWrt';
		var mem=sysinfo.memory||{};
		var memPct=mem.total?Math.round((mem.total-mem.available)/(mem.total)*100):0;
		var loads=sysinfo.load||[0,0,0];
		var cpuPct=Math.min(100,Math.round(loads[0]/65536*100));
		var tempC=tempRaw?Math.round(parseInt(tempRaw)/1000):null;
		var uptime=sysinfo.uptime||0;

		/* Detect WAN status */
		var ifaces=(netdump.interface||[]);
		var wanIf=null,wanUp=false,wanDev='';
		ifaces.forEach(function(f){
			if(f.interface==='wan'||f.interface==='wan6'){
				if(f.up)wanUp=true;
				if(f.interface==='wan'){wanIf=f;wanDev=f.l3_device||f.device||'';}
			}
		});

		/* OTA check */
		var otaInfo={};
		(otaRes.stdout||'').split('\n').forEach(function(l){
			var p=l.indexOf('=');if(p>0)otaInfo[l.slice(0,p)]=l.slice(p+1);
		});
		var hasUpdate=otaInfo.STATE==='update';

		/* Previous net stats for delta calc */
		var prevStats=parseNetDev(netdevText);
		var prevTime=Date.now();

		/* ── Build DOM ── */
		var css=E('style',{},[''+
'#sw-home{color:var(--foreground,#1d1d1f);padding:0 0 2rem}'+
'.sw-hdr{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:1.8rem}'+
'.sw-hname{font-size:2rem;font-weight:800;margin:0;color:var(--foreground,#1d1d1f);border:none!important}'+
'.sw-hdr-right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:.5rem}'+
'.sw-pill{display:inline-flex;align-items:center;gap:.5rem;padding:5px 14px;border-radius:100px;font-size:.85rem;font-weight:600;background:rgba(127,127,127,.1);color:var(--foreground,#1d1d1f)}'+
'.sw-pill svg{flex-shrink:0}'+
'.sw-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}'+
'.sw-dot-ok{background:#34c759;box-shadow:0 0 6px #34c759}'+
'.sw-dot-err{background:#ff3b30}'+
'.sw-ota-pill{background:#007aff;color:#fff!important;cursor:pointer;text-decoration:none}'+
'.sw-ota-pill:hover{background:#0062cc}'+
'.sw-card{background:var(--panel-bg,#fff);border:1px solid var(--border,rgba(0,0,0,.08));border-radius:16px;padding:1.5rem;margin-bottom:1.2rem}'+
'.sw-card-t{font-size:1.1rem;font-weight:700;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem;color:var(--foreground,#1d1d1f)}'+
'.sw-spd-legend{display:flex;gap:1.5rem;font-size:.85rem;font-weight:600;margin-left:auto}'+
'.sw-spd-dl{color:#007aff}.sw-spd-ul{color:#5856d6}'+
'.sw-chart-wrap{width:100%;height:200px;position:relative;margin-top:.8rem}'+
'.sw-chart-wrap canvas{position:absolute;top:0;left:0}'+
'.sw-row{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}'+
'@media(max-width:768px){.sw-row{grid-template-columns:1fr}}'+
'.sw-res-item{display:flex;align-items:center;gap:.8rem;margin-bottom:1rem}'+
'.sw-res-icon{flex-shrink:0;opacity:.5}'+
'.sw-res-info{flex:1;min-width:0}'+
'.sw-res-top{display:flex;justify-content:space-between;font-size:.85rem;font-weight:600;margin-bottom:.4rem}'+
'.sw-bar{height:6px;background:rgba(127,127,127,.15);border-radius:10px;overflow:hidden}'+
'.sw-bar-fill{height:100%;border-radius:10px;transition:width .8s ease}'+
'.sw-if-item{display:flex;justify-content:space-between;align-items:center;padding:.8rem 0;border-bottom:1px solid var(--border,rgba(0,0,0,.06))}'+
'.sw-if-item:last-child{border:none}'+
'.sw-if-name{font-weight:700;font-size:.95rem}'+
'.sw-if-meta{font-size:.8rem;opacity:.5}'+
'.sw-if-ip{font-family:ui-monospace,monospace;font-size:.85rem;text-align:right}'+
'.sw-if-status{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px}'+
'.sw-footer{display:flex;gap:.8rem;margin-top:1.5rem;flex-wrap:wrap;justify-content:center}'+
'.sw-btn{background:rgba(127,127,127,.08);border:1px solid var(--border,rgba(0,0,0,.08));color:var(--foreground,#1d1d1f);padding:10px 24px;border-radius:12px;font-size:.9rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:.5rem;transition:all .15s}'+
'.sw-btn:hover{background:#007aff;color:#fff;border-color:#007aff}'+
'']);

		var elUptime=E('span',{},['--']);
		var elDot=E('span',{class:'sw-dot '+(wanUp?'sw-dot-ok':'sw-dot-err')});
		var elNetText=E('span',{},[wanUp?'网络正常':'未联网']);
		var elDlSpd=E('strong',{},['0 B/s']);
		var elUlSpd=E('strong',{},['0 B/s']);
		var elCpuPct=E('span',{},['0%']);
		var elCpuBar=E('div',{class:'sw-bar-fill',style:'width:0%;background:#007aff'});
		var elMemPct=E('span',{},['0%']);
		var elMemBar=E('div',{class:'sw-bar-fill',style:'width:0%;background:#5856d6'});
		var elTemp=E('span',{},['--']);
		var elIfBox=E('div',{});

		/* Header */
		var hdrRight=E('div',{class:'sw-hdr-right'},[
			E('div',{class:'sw-pill'},[E('span',{innerHTML:IC.clock}),' ',elUptime]),
			E('div',{class:'sw-pill'},[elDot,' ',elNetText])
		]);
		if(hasUpdate){
			hdrRight.appendChild(E('a',{class:'sw-pill sw-ota-pill',href:L.url('admin/system/shawnwrt-ota')},[
				E('span',{innerHTML:IC.ota}),' 有新版本'
			]));
		}

		var chartCanvas=E('canvas',{});
		var chart=null;

		var container=E('div',{id:'sw-home'},[
			css,
			E('div',{class:'sw-hdr'},[
				E('div',{},[E('h1',{class:'sw-hname'},[hostname])]),
				hdrRight
			]),
			/* Speed card */
			E('div',{class:'sw-card'},[
				E('div',{class:'sw-card-t'},[
					E('span',{innerHTML:IC.net}),
					'实时流量',
					E('div',{class:'sw-spd-legend'},[
						E('span',{class:'sw-spd-dl'},[E('span',{innerHTML:IC.down}),' ',elDlSpd]),
						E('span',{class:'sw-spd-ul'},[E('span',{innerHTML:IC.up}),' ',elUlSpd])
					])
				]),
				E('div',{class:'sw-chart-wrap'},[chartCanvas])
			]),
			/* Two-column row */
			E('div',{class:'sw-row'},[
				/* Interfaces */
				E('div',{class:'sw-card'},[
					E('div',{class:'sw-card-t'},[E('span',{innerHTML:IC.globe}),'网络接口']),
					elIfBox
				]),
				/* Resources */
				E('div',{class:'sw-card'},[
					E('div',{class:'sw-card-t'},[E('span',{innerHTML:IC.cpu}),'系统资源']),
					E('div',{class:'sw-res-item'},[
						E('div',{class:'sw-res-icon',innerHTML:IC.cpu}),
						E('div',{class:'sw-res-info'},[
							E('div',{class:'sw-res-top'},[E('span',{},['CPU']),elCpuPct]),
							E('div',{class:'sw-bar'},[elCpuBar])
						])
					]),
					E('div',{class:'sw-res-item'},[
						E('div',{class:'sw-res-icon',innerHTML:IC.mem}),
						E('div',{class:'sw-res-info'},[
							E('div',{class:'sw-res-top'},[E('span',{},['内存']),elMemPct]),
							E('div',{class:'sw-bar'},[elMemBar])
						])
					]),
					E('div',{class:'sw-res-item'},[
						E('div',{class:'sw-res-icon',innerHTML:IC.temp}),
						E('div',{class:'sw-res-info'},[
							E('div',{class:'sw-res-top'},[E('span',{},['温度']),elTemp])
						])
					])
				])
			]),
			/* Footer buttons */
			E('div',{class:'sw-footer'},[
				E('button',{class:'sw-btn',click:function(){location.href=L.url('admin/network/wireless');}},[E('span',{innerHTML:IC.wifi}),'无线设置']),
				E('button',{class:'sw-btn',click:function(){location.href=L.url('admin/system/shawnwrt-ota');}},[E('span',{innerHTML:IC.ota}),'系统升级']),
				E('button',{class:'sw-btn',click:function(){if(confirm('确定重启路由器？'))location.href=L.url('admin/system/reboot');}},[E('span',{innerHTML:IC.power}),'重启'])
			])
		]);

		/* Render interfaces */
		function renderIfaces(ifList){
			while(elIfBox.firstChild)elIfBox.removeChild(elIfBox.firstChild);
			ifList.forEach(function(f){
				if(f.interface==='loopback')return;
				var addrs=(f['ipv4-address']||[]).map(function(a){return a.address;}).join(', ')||'--';
				var dev=f.l3_device||f.device||'';
				var up=!!f.up;
				elIfBox.appendChild(E('div',{class:'sw-if-item'},[
					E('div',{},[
						E('span',{class:'sw-if-status',style:'background:'+(up?'#34c759':'#ccc')}),
						E('span',{class:'sw-if-name'},[f.interface.toUpperCase()]),
						E('span',{class:'sw-if-meta'},[' · '+dev])
					]),
					E('div',{class:'sw-if-ip'},[addrs])
				]));
			});
		}
		renderIfaces(ifaces);

		/* Initial values */
		elUptime.textContent=fmtUptime(uptime);
		elCpuPct.textContent=cpuPct+'%';
		elCpuBar.style.width=cpuPct+'%';
		elMemPct.textContent=memPct+'%';
		elMemBar.style.width=memPct+'%';
		elTemp.textContent=tempC!==null?tempC+' °C':'N/A';

		/* Init chart after DOM attached */
		requestAnimationFrame(function(){
			chart=new SpeedChart(chartCanvas);
			chart.draw();
		});

		/* Polling - 3s interval, minimal CPU */
		poll.add(function(){
			return Promise.all([
				callSystemInfo(),
				fs.read('/proc/net/dev').catch(function(){return'';}),
				fs.trimmed('/sys/class/thermal/thermal_zone0/temp').catch(function(){return'';})
			]).then(function(r){
				var si=r[0]||{},ndText=r[1]||'',tRaw=r[2]||'';
				var now=Date.now();
				var dt=(now-prevTime)/1000;
				prevTime=now;

				/* Uptime */
				elUptime.textContent=fmtUptime(si.uptime||0);

				/* CPU & Memory */
				var ld=si.load||[0];
				var cp=Math.min(100,Math.round(ld[0]/65536*100));
				elCpuPct.textContent=cp+'%';
				elCpuBar.style.width=cp+'%';
				if(cp>80)elCpuBar.style.background='#ff3b30';
				else if(cp>50)elCpuBar.style.background='#ff9500';
				else elCpuBar.style.background='#007aff';

				var mi=si.memory||{};
				var mp=mi.total?Math.round((mi.total-mi.available)/mi.total*100):0;
				elMemPct.textContent=mp+'%';
				elMemBar.style.width=mp+'%';

				/* Temperature */
				var tc=tRaw?Math.round(parseInt(tRaw)/1000):null;
				elTemp.textContent=tc!==null?tc+' °C':'N/A';

				/* Network speed */
				var curStats=parseNetDev(ndText);
				var totalDl=0,totalUl=0;
				var trackDev=wanDev||'';
				if(trackDev&&curStats[trackDev]&&prevStats[trackDev]&&dt>0){
					totalDl=Math.max(0,(curStats[trackDev].rx-prevStats[trackDev].rx)/dt);
					totalUl=Math.max(0,(curStats[trackDev].tx-prevStats[trackDev].tx)/dt);
				}else{
					/* fallback: sum all non-lo */
					for(var k in curStats){
						if(k==='lo'||!prevStats[k])continue;
						totalDl+=Math.max(0,(curStats[k].rx-prevStats[k].rx)/dt);
						totalUl+=Math.max(0,(curStats[k].tx-prevStats[k].tx)/dt);
					}
					totalDl=totalDl/2;totalUl=totalUl/2;
				}
				prevStats=curStats;

				elDlSpd.textContent=fmtSpeed(totalDl);
				elUlSpd.textContent=fmtSpeed(totalUl);
				if(chart)chart.push(totalDl,totalUl);
			});
		},3);

		/* Refresh interfaces every 30s */
		poll.add(function(){
			return callNetIfDump().then(function(d){
				var il=(d||{}).interface||[];
				renderIfaces(il);
				/* Update WAN status */
				var wUp=false;
				il.forEach(function(f){if((f.interface==='wan'||f.interface==='wan6')&&f.up)wUp=true;});
				elDot.className='sw-dot '+(wUp?'sw-dot-ok':'sw-dot-err');
				elNetText.textContent=wUp?'网络正常':'未联网';
			});
		},30);

		return container;
	},

	handleSaveApply:null,
	handleSave:null,
	handleReset:null
});
