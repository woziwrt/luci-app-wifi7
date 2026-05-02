include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI WiFi 7 MT7996 module
LUCI_DEPENDS:=+luci-base
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=woziwrt

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
