include $(TOPDIR)/rules.mk

PKG_NAME:=shawnwrt-ota
PKG_VERSION:=1.0.11
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/shawnwrt-ota
  SECTION:=admin
  CATEGORY:=Administration
  TITLE:=ShawnWrt OTA updater
  MAINTAINER:=Shawn Rain
  DEPENDS:=+curl +jsonfilter +libubus +busybox
  PKGARCH:=all
endef

define Package/shawnwrt-ota/description
  OTA helper for ShawnWrt TR3000 512MB and Qihoo 360T7 builds.
endef

define Build/Compile
endef

define Package/shawnwrt-ota/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/shawnwrt-ota $(1)/usr/bin/shawnwrt-ota
	$(INSTALL_BIN) ./files/usr/bin/shawnwrt-steerd $(1)/usr/bin/shawnwrt-steerd
	$(INSTALL_BIN) ./files/usr/bin/shawnwrt-ota-cron-helper $(1)/usr/bin/shawnwrt-ota-cron-helper
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/shawnwrt_ota $(1)/etc/config/shawnwrt_ota
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/shawnwrt-steerd $(1)/etc/init.d/shawnwrt-steerd
	$(INSTALL_BIN) ./files/etc/init.d/shawnwrt-ota-cron $(1)/etc/init.d/shawnwrt-ota-cron
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-shawnwrt-ota-finalize $(1)/etc/uci-defaults/99-shawnwrt-ota-finalize
endef

$(eval $(call BuildPackage,shawnwrt-ota))
