--[[
LuCI - Lua Configuration Interface

Copyright 2012-2015 linkease <linkease@gmail.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

]]--

module("luci.controller.quickstart", package.seeall)

function index()
	-- Main Index Page
	entry({"admin", "index"}, template("index/index"), _("主页"), 1).leaf = true
	
	-- APIs
	entry({"admin", "index", "api", "system", "status"}, call("api_system_status")).leaf = true
	entry({"admin", "index", "api", "u", "system", "version"}, call("api_system_version")).leaf = true
	entry({"admin", "index", "api", "system", "check-update"}, call("api_check_update")).leaf = true

	-- Backward compatibility redirect if needed
	entry({"admin", "quickstart"}, alias("admin", "index"), nil, 1)
end

function api_system_status()
    local uci = require "luci.model.uci".cursor()
    local sys = require "luci.sys"
    local utl = require "luci.util"
    local http = require "luci.http"
    local json = require "luci.jsonc"

    local result = {
        hostname = sys.hostname(),
        uptime = sys.uptime(),
        cpuUsage = 0,
        memoryUsage = 0,
        cpuTemperature = 0,
        wan_ip = "0.0.0.0",
        traffic = { rx_bytes = 0, tx_bytes = 0 },
        interfaces = {}
    }

    -- CPU Usage
    local cpu_stat = utl.exec("top -bn1 | grep 'CPU:' | head -n1")
    local cpu_idle = cpu_stat:match("(%d+)%% idle")
    if cpu_idle then result.cpuUsage = 100 - tonumber(cpu_idle) end

    -- Memory
    local mem = sys.memory()
    if mem.total > 0 then
        result.memoryUsage = math.floor(((mem.total - mem.free - mem.buffered - mem.cached) / mem.total) * 100)
    end

    -- Temperature (try multiple sources)
    local temp = utl.exec("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null")
    if not temp or temp == "" then
        temp = utl.exec("ubus call luci getTempInfo 2>/dev/null | grep -o '[0-9.]*' | head -n1")
    end
    if temp and temp ~= "" then
        result.cpuTemperature = tonumber(temp) / (tonumber(temp) > 1000 and 1000 or 1)
    end

    -- Network Status
    local wan_if = uci:get("network", "wan", "device") or uci:get("network", "wan", "ifname") or "eth0"
    result.wan_ip = utl.exec("ip -4 addr show " .. wan_if .. " | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}' | head -n1"):gsub("\n", "")
    
    -- Traffic
    local rx = utl.exec("cat /sys/class/net/" .. wan_if .. "/statistics/rx_bytes 2>/dev/null")
    local tx = utl.exec("cat /sys/class/net/" .. wan_if .. "/statistics/tx_bytes 2>/dev/null")
    result.traffic.rx_bytes = tonumber(rx) or 0
    result.traffic.tx_bytes = tonumber(tx) or 0

    -- Interfaces
    local ifaces = {"wan", "lan", "eap"}
    for _, v in ipairs(ifaces) do
        local dev = uci:get("network", v, "device") or uci:get("network", v, "ifname")
        if dev then
            local ip = utl.exec("ip -4 addr show " .. dev .. " | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}' | head -n1"):gsub("\n", "")
            local speed = utl.exec("ethtool " .. dev .. " 2>/dev/null | grep Speed | grep -oE '[0-9]+'"):gsub("\n", "")
            table.insert(result.interfaces, {
                name = v:upper(),
                device = dev,
                ip = (ip ~= "") and ip or nil,
                speed = (speed ~= "") and speed or nil
            })
        end
    end

    http.prepare_content("application/json")
    http.write_json({result = result})
end

function api_check_update()
    local utl = require "luci.util"
    local http = require "luci.http"
    
    -- Execute the OTA check script
    local check = utl.exec("/usr/bin/shawnwrt-ota status")
    local update_available = (check:find("Update Available") or check:find("发现新版本")) and true or false
    
    http.prepare_content("application/json")
    http.write_json({update_available = update_available})
end

function api_system_version()
    local utl = require "luci.util"
    local http = require "luci.http"
    local version = utl.exec("cat /etc/shawnwrt_version 2>/dev/null || cat /etc/openwrt_version"):gsub("\n", "")
    
    http.prepare_content("application/json")
    http.write_json({version = version})
end
