# luci-app-wifi7

LuCI module for WiFi 7 (MT7996 / BPI-R4) — Network > WiFi 7

Custom LuCI view for managing the MT7996 tri-band WiFi 7 radio on the Banana Pi BPI-R4
(MediaTek MT7988A / Filogic 880). Requires a custom OpenWrt build with MT7996 support
and MLD (Multi-Link Device) hostapd.

## Hardware

- Board: Banana Pi BPI-R4 (MT7988A)
- WiFi chip: MT7996 (WiFi 7 / EHT, tri-band)
- Tested on: OpenWrt 25.12-SNAPSHOT, LuCI 26.118.65222~15aabe7

## Features

| Tab | Status | Description |
|-----|--------|-------------|
| Overview | Working | SKU banner, 3 MLD link cards with live data, legacy networks list, 10s auto-refresh |
| MLD config | Working | SSID/password/encryption edit, Save & apply with progress bar + hostapd polling |
| Radio | Working | Channel/htmode per radio, country+sku_idx (paired), DFS labels, lpi_enable, background_radar |
| Stations | Working | MLD clients (ap_mld_1) + legacy clients (phy0.0/1/2-ap0), 10s auto-refresh |
| Legacy networks | Placeholder | Coming soon |
| Diagnostics | Working | fw_version, sku_disable, txpower_info band0/1/2 |

## Installation

No build step required — plain JS files.

### Manual deploy

```bash
# From repo root
scp files/www/luci-static/resources/view/wifi7/index.js root@192.168.1.1:/www/luci-static/resources/view/wifi7/
scp files/usr/share/luci/menu.d/luci-app-wifi7.json root@192.168.1.1:/usr/share/luci/menu.d/
scp files/usr/share/rpcd/acl.d/luci-app-wifi7.json root@192.168.1.1:/usr/share/rpcd/acl.d/

# Restart rpcd (required after ACL change)
ssh root@192.168.1.1 /etc/init.d/rpcd restart
```

After JS-only changes (index.js): Ctrl+F5 in browser, no rpcd restart needed.

### As OpenWrt package

Copy `files/` contents to your OpenWrt build tree or use as a feed package.

## Data sources

| Data | Source |
|------|--------|
| UCI wireless config | uci get config=wireless |
| hostapd MLD status | hostapd.ap-mld-1 get_status |
| SKU regulation | /sys/kernel/debug/ieee80211/phy0/mt76/sku_disable |
| FW version | /sys/kernel/debug/ieee80211/phy0/mt76/fw_version |
| Per-link stats | hostapd_cli -i ap-mld-1 -l {0,1,2} stat |
| MLD station dump | iw dev ap-mld-1 station dump |
| Legacy station dump | iw dev phy0.{0,1,2}-ap0 station dump |
| TX power info | /sys/kernel/debug/ieee80211/phy0/mt76/band{0,1,2}/txpower_info |

## Known hardware specifics (MT7996 / BPI-R4)

- `eht_oper_chwidth=9` means 160 MHz (MTK-specific value, not in IEEE standard map)
- iPhone connects via MLD but uses only Link 2 (6G) for heavy traffic — Links 0/1 show signal=0 dBm (normal STR behavior)
- `mongo:4.4.18` is the only MongoDB version compatible with MT7988A (ARMv8.0)
- Country change requires full reboot — `wifi restart` is not sufficient

## Project

Part of the [woziwrt](https://github.com/woziwrt) BPI-R4 OpenWrt project.

- Build system: [woziwrt/bpi-r4-deploy](https://github.com/woziwrt/bpi-r4-deploy)
- UniFi stack: [woziwrt/bpi-r4-unifi](https://github.com/woziwrt/bpi-r4-unifi)
