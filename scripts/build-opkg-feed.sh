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

cli_version="$(sed -n 's/^PKG_VERSION:=//p' "${repo_root}/openwrt/shawnwrt-ota/Makefile")"
cli_release="$(sed -n 's/^PKG_RELEASE:=//p' "${repo_root}/openwrt/shawnwrt-ota/Makefile")"
cli_data="$(mktemp -d)"
mkdir -p "${cli_data}/usr/bin"
install -m 0755 "${repo_root}/src/usr/bin/shawnwrt-ota" "${cli_data}/usr/bin/shawnwrt-ota"
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

: > "${dist_dir}/Packages"
for ipk in "${dist_dir}"/*.ipk; do
	add_package_index "${ipk}"
done

# raw.githubusercontent.com serves Packages.gz as an opaque blob; this opkg
# build stores the index as-is, so keep the conventional filename but publish
# plain text for reliable parsing on the router.
cp "${dist_dir}/Packages" "${dist_dir}/Packages.gz"

if [ -n "${SHAWNWRT_OTA_USIGN_SECRET_KEY:-}" ]; then
	key_file="$(mktemp)"
	printf '%s\n' "${SHAWNWRT_OTA_USIGN_SECRET_KEY}" > "${key_file}"
	usign -S -m "${dist_dir}/Packages" -s "${key_file}" -x "${dist_dir}/Packages.sig"
	rm -f "${key_file}"
fi
