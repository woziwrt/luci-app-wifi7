# luci-app-wifi7

**⚠️ ALPHA / BETA — Work in progress. Feedback welcome!**

LuCI module for WiFi 7 (MT7996 / BPI-R4) — adds **Network > WiFi 7** to your OpenWrt interface.

## Hardware

- Board: **Banana Pi BPI-R4** (MediaTek MT7988A / Filogic 880)
- WiFi chip: **MT7996** (WiFi 7 / EHT, tri-band 2.4G + 5G + 6G)
- Tested on: OpenWrt 25.12-SNAPSHOT, LuCI 26.118.65222~15aabe7

## Features

| Tab | Description |
|-----|-------------|
| **Overview** | Live MLD link cards (channel, bandwidth, TX power, utilization), legacy networks list, SKU regulation status |
| **MLD config** | Edit MLD SSID, password, encryption. MLO enable/disable. Per-link TX power info |
| **Radio** | Channel, HT mode, TX power per radio. Country + sku_idx (paired). DFS labels, lpi_enable, background_radar |
| **Networks** | Add/Remove legacy networks with smart defaults. Advanced settings (encryption, HT mode) |
| **Stations** | Live client list — MLD clients (ap_mld_1) + legacy clients per band. WiFi mode badges (BE/AX/AC/N/G) |
| **Diagnostics** | Firmware version, SKU status, TX power tables (band0/1/2), per-link current TX, DFS status, MAT table |

## Installation

### Quick install (pre-built APK)

Download the latest APK from [Releases](https://github.com/woziwrt/luci-app-wifi7/releases) and install:

```bash
# Copy APK to router
scp luci-app-wifi7-*.apk root@192.168.1.1:/tmp/

# Install
ssh root@192.168.1.1 "apk add --allow-untrusted /tmp/luci-app-wifi7-*.apk && /etc/init.d/rpcd restart"
```

Then open **Network > WiFi 7** in LuCI. If the menu doesn't appear, do a hard reload (Ctrl+Shift+R).

### Manual deploy (from source)

```bash
# Clone
git clone https://github.com/woziwrt/luci-app-wifi7.git
cd luci-app-wifi7/luci-app-wifi7

# Deploy files
scp root/www/luci-static/resources/view/wifi7/index.js \
    root@192.168.1.1:/www/luci-static/resources/view/wifi7/

scp root/usr/share/luci/menu.d/luci-app-wifi7.json \
    root@192.168.1.1:/usr/share/luci/menu.d/

scp root/usr/share/rpcd/acl.d/luci-app-wifi7.json \
    root@192.168.1.1:/usr/share/rpcd/acl.d/

# Restart rpcd (required after ACL change)
ssh root@192.168.1.1 "/etc/init.d/rpcd restart"
```

### Build from source (OpenWrt build system)

```bash
cd /your/openwrt/build/dir

# Copy into luci feed
cp -r /path/to/luci-app-wifi7/luci-app-wifi7 feeds/luci/applications/luci-app-wifi7
ln -s ../../../feeds/luci/applications/luci-app-wifi7 package/feeds/luci/luci-app-wifi7
echo "CONFIG_PACKAGE_luci-app-wifi7=m" >> .config

# Build
make package/feeds/luci/luci-app-wifi7/{clean,compile} V=s

# APK: bin/packages/aarch64_cortex-a53/luci/luci-app-wifi7-0.apk
```

## Known issues & limitations (alpha)

- **MLD only on MT7996** — This module is specifically designed for the MT7996 tri-band chip on BPI-R4. It will not work on other hardware without modification.
- **wifi up required** — After reboot, run `wifi up` before the module shows live data.
- **APK version shows "0"** — Will be fixed in future release with proper versioning.
- **No signal/noise ratio** — Coming in v2.
- **MLD network management** — Currently only one MLD network (ap_mld_1) is supported. Adding new MLD networks is planned for v2.

## Feedback & bug reports

This is an **alpha/beta release**. Please report issues, suggestions and feedback:

- **GitHub Issues**: [github.com/woziwrt/luci-app-wifi7/issues](https://github.com/woziwrt/luci-app-wifi7/issues)
- **OpenWrt Forum**: [BPI-R4 MTK-SDK thread](https://forum.openwrt.org/t/banana-bpi-r4-all-related-to-mtk-sdk/221080)

Especially interested in feedback on:
- Does it work on your BPI-R4?
- What features are missing?
- What doesn't work as expected?
- UI/UX suggestions

## Related projects

- Build system: [woziwrt/bpi-r4-deploy](https://github.com/woziwrt/bpi-r4-deploy)
- UniFi stack: [woziwrt/bpi-r4-unifi](https://github.com/woziwrt/bpi-r4-unifi)

## License

Apache-2.0
