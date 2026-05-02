include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-wifi7
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI WiFi 7 MT7996 module
LUCI_DEPENDS:=+luci-base

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-wifi7
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=$(LUCI_TITLE)
  DEPENDS:=$(LUCI_DEPENDS)
  PKGARCH:=all
endef

define Package/luci-app-wifi7/description
  LuCI module for WiFi 7 (MT7996 / BPI-R4).
  Provides Network > WiFi 7 with tabs for Overview, MLD config,
  Radio, Networks, Stations and Diagnostics.
  Requires OpenWrt with MT7996 support and MLD hostapd.
endef

define Build/Prepare
endef

define Build/Compile
endef

define Package/luci-app-wifi7/install
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/wifi7
	$(INSTALL_DATA) ./files/www/luci-static/resources/view/wifi7/index.js \
		$(1)/www/luci-static/resources/view/wifi7/index.js

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/usr/share/luci/menu.d/luci-app-wifi7.json \
		$(1)/usr/share/luci/menu.d/luci-app-wifi7.json

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/luci-app-wifi7.json \
		$(1)/usr/share/rpcd/acl.d/luci-app-wifi7.json
endef

$(eval $(call BuildPackage,luci-app-wifi7))
