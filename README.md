# ShawnWrt OTA

Small OTA helper for ShawnWrt builds.

It detects the local router board, finds the matching sysupgrade image in the
latest GitHub Release, verifies the GitHub SHA256 digest, and can run
`sysupgrade -T` before installing.

Supported boards:

- `cudy_tr3000-512mb-v1`
- `qihoo_360t7`

## Opkg Feed

The package workflow publishes a signed opkg feed to the `opkg` branch:

```sh
src/gz shawnwrt_ota https://raw.githubusercontent.com/ShawnRn/shawnwrt-ota/opkg
```

Firmware builds include the feed public key, so `opkg update` can keep normal
signature verification enabled.

GitHub Pages also mirrors the same files for browser inspection:
<https://shawnrn.github.io/shawnwrt-ota/>

Commands:

```sh
shawnwrt-ota check
shawnwrt-ota download
shawnwrt-ota test
shawnwrt-ota install
```

`install` preserves config and records installed packages through
`sysupgrade -k`.
