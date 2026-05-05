#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="${repo_root}/dist"

rm -rf "${dist_dir}"
mkdir -p "${dist_dir}"

build_ipk() {
	local name="$1"
	local version="$2"
	local release="$3"
	local depends="$4"
	local description="$5"
	local data_dir="$6"
	local pkg="${name}_${version}-${release}_all.ipk"
	local work

	work="$(mktemp -d)"
	mkdir -p "${work}/control"
	cp -a "${data_dir}" "${work}/data"

	cat > "${work}/control/control" <<EOF
Package: ${name}
Version: ${version}-${release}
Architecture: all
Maintainer: Shawn Rain
Section: admin
Priority: optional
Depends: ${depends}
Description: ${description}
EOF

	echo 2.0 > "${work}/debian-binary"
	COPYFILE_DISABLE=1 tar --format=ustar --owner=0 --group=0 --numeric-owner -C "${work}/control" -czf "${work}/control.tar.gz" .
	COPYFILE_DISABLE=1 tar --format=ustar --owner=0 --group=0 --numeric-owner -C "${work}/data" -czf "${work}/data.tar.gz" .
	(
		cd "${work}"
		COPYFILE_DISABLE=1 tar --format=ustar --owner=0 --group=0 --numeric-owner -czf "${dist_dir}/${pkg}" ./debian-binary ./data.tar.gz ./control.tar.gz
	)
	sha256sum "${dist_dir}/${pkg}" > "${dist_dir}/${pkg}.sha256"
	rm -rf "${work}"
}

add_package_index() {
	local ipk="$1"
	local meta
	local filename

	meta="$(mktemp -d)"
	filename="$(basename "${ipk}")"

	COPYFILE_DISABLE=1 tar -xzf "${ipk}" -C "${meta}" ./control.tar.gz
	COPYFILE_DISABLE=1 tar -xzf "${meta}/control.tar.gz" -C "${meta}" ./control

	cat "${meta}/control" >> "${dist_dir}/Packages"
	{
		printf 'Filename: %s\n' "${filename}"
		printf 'Size: %s\n' "$(wc -c < "${ipk}" | tr -d ' ')"
		printf 'SHA256sum: %s\n\n' "$(sha256sum "${ipk}" | awk '{print $1}')"
	} >> "${dist_dir}/Packages"

	rm -rf "${meta}"
}

compile_lmo() {
	local po_file="$1"
	local lmo_file="$2"

	python3 - "$po_file" "$lmo_file" <<'PY'
import ast
import struct
import sys

po_file, lmo_file = sys.argv[1], sys.argv[2]


def sfh_hash(data: bytes, init: int) -> int:
    if not data:
        return 0

    h = init & 0xFFFFFFFF
    length = len(data)
    rem = length & 3
    end = length - rem
    off = 0

    def get16(pos):
        return data[pos] | (data[pos + 1] << 8)

    while off < end:
        h = (h + get16(off)) & 0xFFFFFFFF
        tmp = ((get16(off + 2) << 11) ^ h) & 0xFFFFFFFF
        h = (((h << 16) & 0xFFFFFFFF) ^ tmp) & 0xFFFFFFFF
        off += 4
        h = (h + (h >> 11)) & 0xFFFFFFFF

    if rem == 3:
        h = (h + get16(off)) & 0xFFFFFFFF
        h ^= (h << 16) & 0xFFFFFFFF
        b = data[off + 2]
        if b >= 128:
            b -= 256
        h ^= (b << 18) & 0xFFFFFFFF
        h = (h + (h >> 11)) & 0xFFFFFFFF
    elif rem == 2:
        h = (h + get16(off)) & 0xFFFFFFFF
        h ^= (h << 11) & 0xFFFFFFFF
        h = (h + (h >> 17)) & 0xFFFFFFFF
    elif rem == 1:
        b = data[off]
        if b >= 128:
            b -= 256
        h = (h + b) & 0xFFFFFFFF
        h ^= (h << 10) & 0xFFFFFFFF
        h = (h + (h >> 1)) & 0xFFFFFFFF

    h ^= (h << 3) & 0xFFFFFFFF
    h = (h + (h >> 5)) & 0xFFFFFFFF
    h ^= (h << 4) & 0xFFFFFFFF
    h = (h + (h >> 17)) & 0xFFFFFFFF
    h ^= (h << 25) & 0xFFFFFFFF
    h = (h + (h >> 6)) & 0xFFFFFFFF
    return h & 0xFFFFFFFF


def unquote_po(line: str) -> str:
    return ast.literal_eval(line[line.find('"'):])


entries = []
current = None


def flush():
    global current
    if not current:
        return
    msgid = current.get("msgid", "")
    msgstr = current.get("msgstr", "")
    if msgid and msgstr and msgid != msgstr:
        key = msgid.encode("utf-8")
        val = msgstr.encode("utf-8")
        entries.append((sfh_hash(key, len(key)), 1, val))
    current = None


with open(po_file, "r", encoding="utf-8") as f:
    active = None
    for raw in f:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("msgid "):
            flush()
            current = {"msgid": unquote_po(line), "msgstr": ""}
            active = "msgid"
        elif line.startswith("msgstr "):
            if current is None:
                current = {"msgid": "", "msgstr": ""}
            current["msgstr"] = unquote_po(line)
            active = "msgstr"
        elif line.startswith('"') and active and current is not None:
            current[active] += unquote_po(line)
    flush()

payload = bytearray()
index = []
for key_id, plural_count, val in entries:
    offset = len(payload)
    payload.extend(val)
    while len(payload) % 4:
        payload.append(0)
    index.append((key_id, plural_count, offset, len(val)))

index.sort(key=lambda item: item[0])
with open(lmo_file, "wb") as out:
    out.write(payload)
    for item in index:
        out.write(struct.pack(">IIII", *item))
    if payload:
        out.write(struct.pack(">I", len(payload)))
PY
}

cli_version="$(sed -n 's/^PKG_VERSION:=//p' "${repo_root}/openwrt/shawnwrt-ota/Makefile")"
cli_release="$(sed -n 's/^PKG_RELEASE:=//p' "${repo_root}/openwrt/shawnwrt-ota/Makefile")"
cli_data="$(mktemp -d)"
mkdir -p "${cli_data}/usr/bin"
install -m 0755 "${repo_root}/src/usr/bin/shawnwrt-ota" "${cli_data}/usr/bin/shawnwrt-ota"
mkdir -p "${cli_data}/etc/uci-defaults"
install -m 0755 \
	"${repo_root}/openwrt/shawnwrt-ota/files/etc/uci-defaults/99-shawnwrt-ota-finalize" \
	"${cli_data}/etc/uci-defaults/99-shawnwrt-ota-finalize"
build_ipk "shawnwrt-ota" "${cli_version}" "${cli_release}" \
	"curl, jsonfilter, libubus, busybox" \
	"ShawnWrt OTA updater" "${cli_data}"
rm -rf "${cli_data}"

luci_version="$(sed -n 's/^PKG_VERSION:=//p' "${repo_root}/openwrt/luci-app-shawnwrt-ota/Makefile")"
luci_release="$(sed -n 's/^PKG_RELEASE:=//p' "${repo_root}/openwrt/luci-app-shawnwrt-ota/Makefile")"
luci_data="$(mktemp -d)"
cp -a "${repo_root}/openwrt/luci-app-shawnwrt-ota/root/." "${luci_data}/"
mkdir -p "${luci_data}/www/luci-static/resources/view/system"
install -m 0644 \
	"${repo_root}/openwrt/luci-app-shawnwrt-ota/htdocs/luci-static/resources/view/system/shawnwrt_ota.js" \
	"${luci_data}/www/luci-static/resources/view/system/shawnwrt_ota.js"
build_ipk "luci-app-shawnwrt-ota" "${luci_version}" "${luci_release}" \
	"shawnwrt-ota, luci-base" \
	"LuCI support for ShawnWrt OTA" "${luci_data}"
rm -rf "${luci_data}"

channel_version="$(sed -n 's/^PKG_VERSION:=//p' "${repo_root}/openwrt/luci-app-shawnwrt-channel-analysis/Makefile")"
channel_release="$(sed -n 's/^PKG_RELEASE:=//p' "${repo_root}/openwrt/luci-app-shawnwrt-channel-analysis/Makefile")"
channel_data="$(mktemp -d)"
cp -a "${repo_root}/openwrt/luci-app-shawnwrt-channel-analysis/root/." "${channel_data}/"
mkdir -p "${channel_data}/www/luci-static/resources/view/status"
install -m 0644 \
	"${repo_root}/openwrt/luci-app-shawnwrt-channel-analysis/htdocs/luci-static/resources/view/status/shawnwrt_channel_analysis.js" \
	"${channel_data}/www/luci-static/resources/view/status/shawnwrt_channel_analysis.js"
mkdir -p "${channel_data}/usr/lib/lua/luci/i18n"
compile_lmo \
	"${repo_root}/openwrt/luci-app-shawnwrt-channel-analysis/po/zh-cn/shawnwrt-channel-analysis.po" \
	"${channel_data}/usr/lib/lua/luci/i18n/shawnwrt-channel-analysis.zh-cn.lmo"
build_ipk "luci-app-shawnwrt-channel-analysis" "${channel_version}" "${channel_release}" \
	"rpcd-mod-iwinfo, iwinfo" \
	"ShawnWrt MTK channel analysis" "${channel_data}"
rm -rf "${channel_data}"

index_version="$(sed -n 's/^PKG_VERSION:=//p' "${repo_root}/openwrt/luci-app-shawnwrt-index/Makefile")"
index_release="$(sed -n 's/^PKG_RELEASE:=//p' "${repo_root}/openwrt/luci-app-shawnwrt-index/Makefile")"
index_data="$(mktemp -d)"

# Root overlay (menu JSON, ACL JSON, uci-defaults, etc.)
cp -a "${repo_root}/openwrt/luci-app-shawnwrt-index/root/." "${index_data}/"

# JS view
mkdir -p "${index_data}/www/luci-static/resources/view/index"
install -m 0644 \
	"${repo_root}/openwrt/luci-app-shawnwrt-index/htdocs/luci-static/resources/view/index/home.js" \
	"${index_data}/www/luci-static/resources/view/index/home.js"

build_ipk "luci-app-shawnwrt-index" "${index_version}" "${index_release}" \
	"luci-base" \
	"ShawnWrt Index homepage" "${index_data}"
rm -rf "${index_data}"

: > "${dist_dir}/Packages"
for ipk in "${dist_dir}"/*.ipk; do
	add_package_index "${ipk}"
done

# opkg src/gz expects a real gzip file.
gzip -9nk "${dist_dir}/Packages"

if [ -n "${SHAWNWRT_OTA_USIGN_SECRET_KEY:-}" ]; then
	key_file="$(mktemp)"
	printf '%s\n' "${SHAWNWRT_OTA_USIGN_SECRET_KEY}" > "${key_file}"
	usign -S -m "${dist_dir}/Packages" -s "${key_file}" -x "${dist_dir}/Packages.sig"
	rm -f "${key_file}"
fi
