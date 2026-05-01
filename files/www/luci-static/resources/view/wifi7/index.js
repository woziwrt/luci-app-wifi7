'use strict';
'require view';
'require fs';
'require rpc';
'require poll';

var callUciGetWireless = rpc.declare({
    object: 'uci',
    method: 'get',
    params: [ 'config' ],
    expect: { values: {} }
});

var callHostapdStatus = rpc.declare({
    object: 'hostapd.ap-mld-1',
    method: 'get_status',
    expect: {}
});

var callExec = rpc.declare({
    object: 'file',
    method: 'exec',
    params: [ 'command', 'params' ],
    expect: {}
});

function parseStat(raw) {
    var out = {};
    if (!raw) return out;
    raw.split('\n').forEach(function(line) {
        var eq = line.indexOf('=');
        if (eq > 0)
            out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    });
    return out;
}

var bwMap = {
    '0': '20 MHz', '1': '40 MHz', '2': '80 MHz',
    '3': '160 MHz', '4': '320 MHz',
    '5': '160 MHz', '6': '320 MHz',
    '9': '160 MHz'
};

function freqLabel(stat) {
    var ch = stat['channel'] || '?';
    var fr = stat['freq']    || '?';
    var bw = bwMap[stat['eht_oper_chwidth']] || stat['eht_oper_chwidth'] || '?';
    return 'CH ' + ch + '  /  ' + fr + ' MHz  /  ' + bw;
}

function chanUtil(stat) {
    var u = parseInt(stat['chan_util_avg']);
    if (isNaN(u) || u > 100) return 'N/A';
    return u + '%';
}

function badge(text, bg, fg) {
    return E('span', { 'style':
        'display:inline-block;font-size:11px;font-weight:bold;padding:2px 7px;' +
        'border-radius:3px;background:' + bg + ';color:' + fg }, text);
}

function skuBanner(skuOff) {
    return E('div', { 'style':
        'border-radius:6px;padding:9px 13px;margin-bottom:14px;' +
        (skuOff
            ? 'background:#3a0a0a;border:1px solid #e24b4a;color:#f4a0a0'
            : 'background:#0a2a0a;border:1px solid #1d9e75;color:#7fff7f') }, [
        E('strong', {}, skuOff ? 'SKU regulation inactive -- ' : 'SKU regulation active -- '),
        skuOff
            ? 'transmitting without country power limits (up to 27 dBm). Set country + sku_idx on the Radio tab.'
            : 'TX power limited by country regulatory.'
    ]);
}

function infoBanner(text) {
    return E('div', { 'style':
        'border-radius:6px;padding:9px 13px;margin-bottom:14px;' +
        'background:#0a1a3a;border:1px solid #85b7eb;color:#b5d4f4' }, text);
}

function warnBanner(text) {
    return E('div', { 'style':
        'border-radius:6px;padding:9px 13px;margin-bottom:14px;' +
        'background:#2a1a0a;border:1px solid #f5a623;color:#fac775' }, text);
}

function sectionBox(title, dotColor, extra, bodyEl) {
    var header = E('div', { 'style':
        'background:#16213e;padding:7px 12px;font-size:13px;font-weight:bold;' +
        'display:flex;align-items:center;gap:10px' }, [
        E('span', { 'style':
            'display:inline-block;width:8px;height:8px;border-radius:50%;' +
            'background:' + dotColor }),
        title
    ]);
    if (extra) {
        var sp = E('span', { 'style':
            'margin-left:auto;font-weight:normal;font-size:12px;color:#aaa' });
        sp.textContent = extra;
        header.appendChild(sp);
    }
    return E('div', { 'style':
        'border:1px solid #444;border-radius:6px;margin-bottom:12px;overflow:hidden' }, [
        header,
        E('div', { 'style': 'padding:10px 12px' }, [ bodyEl ])
    ]);
}

function fieldRow(label, valueEl) {
    var row = E('div', { 'style':
        'display:grid;grid-template-columns:170px 1fr;gap:8px;' +
        'align-items:start;padding:5px 0;' +
        'border-bottom:1px solid #2a2a3a;font-size:12px' });
    var lbl = E('div', { 'style': 'color:#888;padding-top:2px' });
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(typeof valueEl === 'string'
        ? (function(){ var d = E('div', {}); d.textContent = valueEl; return d; })()
        : valueEl);
    return row;
}

function roValue(text) {
    var d = E('div', { 'style':
        'font-family:monospace;font-size:11px;color:#ccc;padding-top:2px' });
    d.textContent = text;
    return d;
}

function parseStationDump(raw) {
    var stations = [];
    var cur      = null;
    var curLink  = null;

    raw.split('\n').forEach(function(line) {
        var staMx = line.match(/^Station ([0-9a-f:]+) \(on /i);
        if (staMx) {
            if (cur) stations.push(cur);
            cur = { mac: staMx[1], connected: '', links: {} };
            curLink = null;
            return;
        }
        if (!cur) return;

        var t = line.replace(/\t/g, ' ').trim();

        var linkMx = t.match(/^Link (\d+):$/);
        if (linkMx) {
            curLink = linkMx[1];
            cur.links[curLink] = {
                addr: '', signal: '', signal_arr: '',
                tx: '', rx: '', idle: true
            };
            return;
        }

        if (t.match(/^connected time:/))
            cur.connected = t.replace('connected time:', '').trim();

        if (curLink !== null) {
            var lk = cur.links[curLink];

            var addrMx = t.match(/^address:\s+([0-9a-f:]+)/i);
            if (addrMx) { lk.addr = addrMx[1]; return; }

            var sigMx = t.match(/^signal:\s+([-\d]+)\s+(\[[\d,\s-]+\])\s+dBm/);
            if (sigMx) {
                lk.signal     = sigMx[1];
                lk.signal_arr = sigMx[2];
                lk.idle       = (parseInt(sigMx[1]) === 0);
                return;
            }
            var sigMx0 = t.match(/^signal:\s+([-\d]+)\s+dBm/);
            if (sigMx0) {
                lk.signal = sigMx0[1];
                lk.idle   = (parseInt(sigMx0[1]) === 0);
                return;
            }

            var txMx = t.match(/^tx bitrate:\s+(.+)/);
            if (txMx) { lk.tx = txMx[1]; return; }

            var rxMx = t.match(/^rx bitrate:\s+(.+)/);
            if (rxMx) { lk.rx = rxMx[1]; return; }
        }
    });
    if (cur) stations.push(cur);
    return stations;
}

return view.extend({

    activeTab: 'overview',

    loadData: function() {
        return Promise.all([
            L.resolveDefault(callUciGetWireless('wireless'), {}),
            L.resolveDefault(callHostapdStatus(), {}),
            L.resolveDefault(callExec('/bin/cat', [
                '/sys/kernel/debug/ieee80211/phy0/mt76/sku_disable'
            ]), { stdout: '1' }),
            L.resolveDefault(callExec('/usr/sbin/hostapd_cli', [
                '-i', 'ap-mld-1', '-l', '0', 'stat'
            ]), { stdout: '' }),
            L.resolveDefault(callExec('/usr/sbin/hostapd_cli', [
                '-i', 'ap-mld-1', '-l', '1', 'stat'
            ]), { stdout: '' }),
            L.resolveDefault(callExec('/usr/sbin/hostapd_cli', [
                '-i', 'ap-mld-1', '-l', '2', 'stat'
            ]), { stdout: '' }),
            L.resolveDefault(callExec('/usr/sbin/iw', [
                'dev', 'ap-mld-1', 'station', 'dump'
            ]), { stdout: '' }),
            L.resolveDefault(callExec('/bin/cat', [
                '/sys/kernel/debug/ieee80211/phy0/mt76/fw_version'
            ]), { stdout: '' }),
            L.resolveDefault(callExec('/bin/cat', [
                '/sys/kernel/debug/ieee80211/phy0/mt76/band0/txpower_info'
            ]), { stdout: '' }),
            L.resolveDefault(callExec('/bin/cat', [
                '/sys/kernel/debug/ieee80211/phy0/mt76/band1/txpower_info'
            ]), { stdout: '' }),
            L.resolveDefault(callExec('/bin/cat', [
                '/sys/kernel/debug/ieee80211/phy0/mt76/band2/txpower_info'
            ]), { stdout: '' })
        ]);
    },

    load: function() {
        return this.loadData();
    },

    switchTab: function(name, container, data) {
        this.activeTab = name;
        var tabs = container.querySelectorAll('.wifi7-tab');
        tabs.forEach(function(t) {
            var active = t.getAttribute('data-tab') === name;
            t.style.borderBottom = active ? '2px solid #85b7eb' : '2px solid transparent';
            t.style.color = active ? '#85b7eb' : '#888';
        });
        var content = container.querySelector('.wifi7-content');
        while (content.firstChild) content.removeChild(content.firstChild);
        content.appendChild(this.renderTab(name, data));
    },

    renderTab: function(name, data) {
        switch(name) {
            case 'overview':    return this.renderOverview(data);
            case 'mld':         return this.renderMLD(data);
            case 'radio':       return this.renderRadio(data);
            case 'legacy':      return this.renderLegacy(data);
            case 'stations':    return this.renderStations(data);
            case 'diagnostics': return this.renderDiagnostics(data);
            default:            return E('div', {}, 'Unknown tab');
        }
    },

    render: function(data) {
        var self = this;

        var tabDefs = [
            { id: 'overview',    label: 'Overview' },
            { id: 'mld',         label: 'MLD config' },
            { id: 'radio',       label: 'Radio' },
            { id: 'legacy',      label: 'Legacy networks' },
            { id: 'stations',    label: 'Stations' },
            { id: 'diagnostics', label: 'Diagnostics' }
        ];

        var tabBar = E('div', { 'style':
            'display:flex;gap:2px;border-bottom:1px solid #333;margin-bottom:16px' });

        tabDefs.forEach(function(td) {
            var t = E('div', {
                'class': 'wifi7-tab',
                'data-tab': td.id,
                'style':
                    'padding:6px 14px;font-size:13px;cursor:pointer;' +
                    'border-bottom:2px solid transparent;color:#888;' +
                    'transition:color .15s'
            });
            t.textContent = td.label;
            t.addEventListener('mouseover', function() {
                if (self.activeTab !== td.id) t.style.color = '#ccc';
            });
            t.addEventListener('mouseout', function() {
                if (self.activeTab !== td.id) t.style.color = '#888';
            });
            t.addEventListener('click', function() {
                self.switchTab(td.id, container, data);
            });
            tabBar.appendChild(t);
        });

        var content = E('div', { 'class': 'wifi7-content' });

        var container = E('div', { 'style':
            'font-family:sans-serif;color:#ddd;padding:4px 0' }, [
            E('h2', { 'style': 'margin-bottom:14px' }, 'WiFi 7 - MT7996 / BPI-R4'),
            tabBar,
            content
        ]);

        this.switchTab(this.activeTab, container, data);

        poll.add(L.bind(function() {
            return this.loadData().then(L.bind(function(newData) {
                data = newData;
                self.switchTab(self.activeTab, container, newData);
            }, this));
        }, this), 10);

        return container;
    },

    renderOverview: function(data) {
        var uciData = data[0];
        var hapdSt  = data[1];
        var skuRaw  = data[2].stdout ? data[2].stdout.trim() : '1';
        var stat0   = parseStat(data[3].stdout || '');
        var stat1   = parseStat(data[4].stdout || '');
        var stat2   = parseStat(data[5].stdout || '');

        var skuOff = skuRaw === '1';
        var hapdOK = hapdSt && hapdSt.status === 'ENABLED';

        var mldSSID = '', mldEnc = '';
        Object.keys(uciData).forEach(function(sid) {
            var s = uciData[sid];
            if (s['.type'] === 'wifi-iface' && s['mlo'] === '1') {
                mldSSID = s['ssid'] || '';
                mldEnc  = s['encryption'] || '';
            }
        });

        function linkCard(label, bg, fg, stat) {
            var txp     = stat['max_txpower'];
            var txpCol  = skuOff ? '#e24b4a' : '#1d9e75';
            var txpNote = skuOff ? ' (no SKU limit)' : ' (regulated)';
            return E('div', { 'style':
                'border:1px solid #333;border-radius:6px;padding:10px 12px;' +
                'background:#1a1a2e;flex:1;min-width:0' }, [
                badge(label, bg, fg),
                E('div', { 'style':
                    'font-size:14px;font-weight:bold;color:#fff;margin-top:6px' },
                    freqLabel(stat)),
                E('div', { 'style': 'font-size:12px;color:#aaa;margin-top:3px' },
                    'EHT  |  util: ' + chanUtil(stat) +
                    '  |  num_links: ' + (stat['num_links'] || '?')),
                E('div', { 'style':
                    'font-size:12px;color:' + txpCol + ';margin-top:4px' },
                    'Tx: ' + (txp || '?') + ' dBm' + txpNote)
            ]);
        }

        var mldBody = E('div', {}, [
            E('div', { 'style': 'display:flex;gap:8px;margin-bottom:10px' }, [
                linkCard('2.4 GHz -- Link 0', '#0a2a1a', '#5dcaa5', stat0),
                linkCard('5 GHz -- Link 1',   '#0a1a3a', '#85b7eb', stat1),
                linkCard('6 GHz -- Link 2',   '#1a0a3a', '#afa9ec', stat2)
            ]),
            E('div', { 'style': 'font-size:12px;color:#888' },
                'type: ' + (stat0['ap_mld_type'] || 'STR') +
                '  |  clients: ' + (stat0['num_sta[0]'] || '0') +
                '  |  MLD MAC: ' + (stat0['mld_addr[0]'] || '?'))
        ]);

        var legacyRows = [];
        var bandInfo = {
            'radio0': ['2.4G', '#0a2a1a', '#5dcaa5'],
            'radio1': ['5G',   '#0a1a3a', '#85b7eb'],
            'radio2': ['6G',   '#1a0a3a', '#afa9ec']
        };
        Object.keys(uciData).sort().forEach(function(sid) {
            var s = uciData[sid];
            if (s['.type'] === 'wifi-iface' && s['mlo'] !== '1' && s['mode'] === 'ap') {
                var bi  = bandInfo[s['device']] || [s['device'], '#222', '#aaa'];
                var enc = s['encryption'] || 'none';
                legacyRows.push(E('div', { 'style':
                    'display:flex;align-items:center;gap:8px;padding:5px 0;' +
                    'border-bottom:1px solid #2a2a3a;font-size:12px' }, [
                    badge(bi[0], bi[1], bi[2]),
                    E('span', { 'style': 'font-family:monospace' }, s['ssid'] || sid),
                    E('span', { 'style': 'color:#888;margin-left:4px' },
                        enc === 'none' ? 'open' : enc),
                    E('span', { 'style':
                        'margin-left:auto;font-size:10px;padding:2px 6px;' +
                        'border-radius:3px;background:#2a2a1a;color:#aaa' }, 'LEGACY')
                ]));
            }
        });

        return E('div', {}, [
            skuBanner(skuOff),
            E('div', { 'style': 'font-size:12px;margin-bottom:14px;color:#aaa' }, [
                'hostapd ap-mld-1: ',
                E('strong', { 'style': 'color:' + (hapdOK ? '#1d9e75' : '#e24b4a') },
                    hapdOK ? 'ENABLED' : 'NOT RUNNING')
            ]),
            sectionBox('MLD network -- ap_mld_1',
                hapdOK ? '#1d9e75' : '#888',
                'SSID: ' + mldSSID + '  |  ' + mldEnc,
                mldBody),
            E('div', { 'style':
                'border:1px solid #444;border-radius:6px;overflow:hidden' }, [
                E('div', { 'style':
                    'background:#16213e;padding:7px 12px;' +
                    'font-size:13px;font-weight:bold' },
                    'Legacy networks'),
                E('div', { 'style': 'padding:8px 12px' },
                    legacyRows.length ? legacyRows
                        : [E('div', { 'style': 'font-size:12px;color:#888' },
                            'No legacy networks.')])
            ])
        ]);
    },

    renderMLD: function(data) {
        var uciData = data[0];
        var mldSID  = '';
        var mldSSID = '', mldEnc = '', mldKey = '', mldRsno = '';

        Object.keys(uciData).forEach(function(sid) {
            var s = uciData[sid];
            if (s['.type'] === 'wifi-iface' && s['mlo'] === '1') {
                mldSID  = sid;
                mldSSID = s['ssid']            || '';
                mldEnc  = s['encryption']      || 'sae';
                mldKey  = s['key']             || '';
                mldRsno = s['encryption_rsno'] || 'sae';
            }
        });

        var stat0 = parseStat(data[3].stdout || '');

        var ssidInput = E('input', {
            'type': 'text', 'value': mldSSID,
            'style': 'background:#1a1a2e;border:1px solid #444;border-radius:4px;' +
                     'color:#fff;padding:4px 8px;font-size:12px;width:220px'
        });
        var keyInput = E('input', {
            'type': 'password', 'value': mldKey,
            'style': 'background:#1a1a2e;border:1px solid #444;border-radius:4px;' +
                     'color:#fff;padding:4px 8px;font-size:12px;width:220px'
        });

        var encSel = E('select', { 'style':
            'background:#1a1a2e;border:1px solid #444;border-radius:4px;' +
            'color:#fff;padding:4px 8px;font-size:12px;width:220px' });
        [['sae',       'WPA3-SAE (recommended)'],
         ['sae-mixed', 'WPA2/WPA3 mixed'],
         ['owe',       'Enhanced Open (OWE)']].forEach(function(o) {
            var opt = E('option', { 'value': o[0] }, o[1]);
            if (mldEnc === o[0]) opt.selected = true;
            encSel.appendChild(opt);
        });

        var rsnoSel = E('select', { 'style':
            'background:#1a1a2e;border:1px solid #444;border-radius:4px;' +
            'color:#fff;padding:4px 8px;font-size:12px;width:220px' });
        [['sae',     'sae (default)'],
         ['sae-ext', 'sae-ext'],
         ['none',    'none']].forEach(function(o) {
            var opt = E('option', { 'value': o[0] }, o[1]);
            if (mldRsno === o[0]) opt.selected = true;
            rsnoSel.appendChild(opt);
        });

        var progressDiv = E('div', { 'style': 'display:none;margin-top:12px' }, [
            E('div', { 'style':
                'background:#1a1a2e;border:1px solid #444;border-radius:6px;' +
                'padding:12px 14px;text-align:center' }, [
                E('div', { 'style':
                    'font-size:13px;font-weight:bold;margin-bottom:6px' },
                    'Applying configuration...'),
                E('div', { 'style': 'font-size:11px;color:#f5a623;margin-bottom:10px' },
                    'wifi restart may take 60-180 s -- do not power cycle'),
                E('div', { 'style':
                    'height:5px;background:#333;border-radius:3px;' +
                    'overflow:hidden;margin-bottom:8px' }, [
                    E('div', { 'id': 'wifi7-pbar', 'style':
                        'height:100%;background:#185fa5;border-radius:3px;' +
                        'width:0%;transition:width .4s' })
                ]),
                E('div', { 'id': 'wifi7-pstat',
                    'style': 'font-size:11px;color:#888' }, 'Waiting...')
            ])
        ]);

        var applyBtn = E('button', { 'style':
            'background:#185fa5;color:#fff;border:none;border-radius:4px;' +
            'padding:6px 16px;font-size:12px;cursor:pointer' }, 'Save & apply');
        var discardBtn = E('button', { 'style':
            'background:#2a2a3a;color:#aaa;border:1px solid #444;border-radius:4px;' +
            'padding:6px 16px;font-size:12px;cursor:pointer;margin-right:8px' }, 'Discard');

        var callUciSet = rpc.declare({
            object: 'uci', method: 'set',
            params: ['config', 'section', 'values'], expect: {}
        });
        var callUciCommit = rpc.declare({
            object: 'uci', method: 'commit',
            params: ['config'], expect: {}
        });

        applyBtn.addEventListener('click', function() {
            var newSSID = ssidInput.value.trim();
            var newKey  = keyInput.value;
            var newEnc  = encSel.value;
            var newRsno = rsnoSel.value;
            if (!newSSID) { alert('SSID cannot be empty'); return; }
            if (newKey.length < 8 && newEnc !== 'owe') {
                alert('Password must be at least 8 characters'); return; }

            progressDiv.style.display = 'block';
            applyBtn.disabled   = true;
            discardBtn.disabled = true;

            var pbar  = document.getElementById('wifi7-pbar');
            var pstat = document.getElementById('wifi7-pstat');
            var steps = [
                [10, 'Writing UCI config...'],
                [25, 'Committing wireless UCI...'],
                [40, 'Running wifi restart...'],
                [60, 'Waiting for hostapd init...'],
                [80, 'Polling hostapd.ap-mld-1 status...']
            ];
            var si = 0;
            function nextStep() {
                if (si >= steps.length) return;
                pbar.style.width  = steps[si][0] + '%';
                pstat.textContent = steps[si][1];
                si++;
                if (si < steps.length) setTimeout(nextStep, 800);
            }
            nextStep();

            L.resolveDefault(callUciSet('wireless', mldSID, {
                ssid: newSSID, key: newKey,
                encryption: newEnc, encryption_rsno: newRsno
            }), null).then(function() {
                return L.resolveDefault(callUciCommit('wireless'), null);
            }).then(function() {
                return callExec('/sbin/wifi', []);
            }).then(function() {
                var tries    = 0;
                var maxTries = 60;
                function doPoll() {
                    tries++;
                    pbar.style.width  = Math.min(80 + tries, 98) + '%';
                    pstat.textContent = 'Polling hostapd (' + tries + '/' + maxTries + ')...';
                    L.resolveDefault(callHostapdStatus(), {}).then(function(st) {
                        if (st && st.status === 'ENABLED') {
                            pbar.style.width  = '100%';
                            pstat.textContent = 'Done -- WiFi active';
                            applyBtn.disabled   = false;
                            discardBtn.disabled = false;
                            setTimeout(function() {
                                progressDiv.style.display = 'none';
                                pbar.style.width = '0%';
                            }, 2000);
                        } else if (tries >= maxTries) {
                            pstat.textContent =
                                'Timeout! Try: 1) reboot   2) power cycle if no response';
                            pstat.style.color = '#e24b4a';
                            applyBtn.disabled   = false;
                            discardBtn.disabled = false;
                        } else {
                            setTimeout(doPoll, 3000);
                        }
                    });
                }
                setTimeout(doPoll, 3000);
            });
        });

        return E('div', {}, [
            infoBanner('MLD SSID, password and encryption are stored in ap_mld_1 UCI section. PMF (ieee80211w=2) is mandatory for MLD and enforced automatically.'),
            sectionBox('ap_mld_1 -- network configuration', '#1d9e75', null,
                E('div', {}, [
                    fieldRow('SSID',             ssidInput),
                    fieldRow('Password',         keyInput),
                    fieldRow('Encryption',       encSel),
                    fieldRow('RSNO layer',       rsnoSel),
                    fieldRow('PMF (ieee80211w)', roValue('required (=2) -- enforced for MLD')),
                    fieldRow('MLO',              roValue('mlo=1 -- enabled'))
                ])),
            sectionBox('Per-link info (read-only)', '#444', null,
                E('div', {}, [
                    fieldRow('Link 0 / radio0',
                        roValue('2.4 GHz  |  link addr: ' + (stat0['link_addr'] || '?'))),
                    fieldRow('Link 1 / radio1', roValue('5 GHz')),
                    fieldRow('Link 2 / radio2', roValue('6 GHz')),
                    fieldRow('MLD MAC',
                        roValue(stat0['mld_addr[0]'] || '?')),
                    fieldRow('Active links',
                        roValue('mld_allowed_links: 0x07  (2G + 5G + 6G)'))
                ])),
            E('div', { 'style':
                'display:flex;justify-content:flex-end;margin-top:4px' }, [
                discardBtn, applyBtn
            ]),
            progressDiv
        ]);
    },

    renderRadio: function(data) {
        return E('div', {}, [
            warnBanner('Country and sku_idx must always be written together. ' +
                'Country change requires a full reboot -- wifi restart is not sufficient.'),
            E('div', { 'style':
                'font-size:13px;color:#888;padding:20px;text-align:center' },
                'Radio tab -- coming in next step')
        ]);
    },

    renderLegacy: function(data) {
        var uciData = data[0];

        // Collect legacy wifi-iface sections (non-MLD, mode=ap)
        var bandMeta = {
            'radio0': { band: '2.4G', bg: '#0a2a1a', fg: '#5dcaa5' },
            'radio1': { band: '5G',   bg: '#0a1a3a', fg: '#85b7eb' },
            'radio2': { band: '6G',   bg: '#1a0a3a', fg: '#afa9ec' }
        };
        var legacyIfaces = [];
        Object.keys(uciData).sort().forEach(function(sid) {
            var s = uciData[sid];
            if (s['.type'] === 'wifi-iface' && s['mlo'] !== '1' && s['mode'] === 'ap') {
                var meta = bandMeta[s['device']] || { band: s['device'], bg: '#222', fg: '#aaa' };
                legacyIfaces.push({ sid: sid, s: s, meta: meta });
            }
        });

        var callUciSet = rpc.declare({
            object: 'uci', method: 'set',
            params: ['config', 'section', 'values'], expect: {}
        });
        var callUciCommit = rpc.declare({
            object: 'uci', method: 'commit',
            params: ['config'], expect: {}
        });

        var inputStyle = 'background:#1a1a2e;border:1px solid #444;border-radius:4px;' +
                         'color:#fff;padding:4px 8px;font-size:12px;width:220px';
        var selStyle   = inputStyle;

        // Build a card per interface
        var cards = legacyIfaces.map(function(ifc) {
            var sid  = ifc.sid;
            var s    = ifc.s;
            var meta = ifc.meta;
            var is6g = s['device'] === 'radio2';

            var ssidInp = E('input', { 'type': 'text', 'value': s['ssid'] || '',
                'style': inputStyle });
            var keyInp  = E('input', { 'type': 'password', 'value': s['key'] || '',
                'style': inputStyle });

            // Encryption options -- 6G: no open allowed
            var encOpts = is6g
                ? [['sae',       'WPA3-SAE (required on 6 GHz)'],
                   ['sae-mixed', 'WPA2/WPA3 mixed']]
                : [['none',      'Open (no password)'],
                   ['psk2',      'WPA2-PSK'],
                   ['psk-mixed', 'WPA/WPA2 mixed'],
                   ['sae-mixed', 'WPA2/WPA3 mixed'],
                   ['sae',       'WPA3-SAE']];

            var encSel = E('select', { 'style': selStyle });
            encOpts.forEach(function(o) {
                var opt = E('option', { 'value': o[0] });
                opt.textContent = o[1];
                if ((s['encryption'] || 'none') === o[0]) opt.selected = true;
                encSel.appendChild(opt);
            });

            // Show/hide password field -- handled by applyKeyVis below

            var disChk = E('input', { 'type': 'checkbox',
                'checked': s['disabled'] === '1' ? true : null,
                'style': 'width:16px;height:16px;cursor:pointer' });

            var statusSpan = E('span', { 'style': 'font-size:11px;color:#888;margin-left:8px' });

            var applyBtn  = E('button', { 'style':
                'background:#185fa5;color:#fff;border:none;border-radius:4px;' +
                'padding:5px 14px;font-size:12px;cursor:pointer' }, 'Save & apply');
            var discardBtn = E('button', { 'style':
                'background:#2a2a3a;color:#aaa;border:1px solid #444;border-radius:4px;' +
                'padding:5px 14px;font-size:12px;cursor:pointer;margin-right:8px' }, 'Discard');

            discardBtn.addEventListener('click', function() {
                ssidInp.value    = s['ssid'] || '';
                keyInp.value     = s['key']  || '';
                disChk.checked   = s['disabled'] === '1';
                // reset encryption select
                Array.prototype.forEach.call(encSel.options, function(o) {
                    o.selected = o.value === (s['encryption'] || 'none');
                });
                applyKeyVis();
                statusSpan.textContent = '';
            });

            applyBtn.addEventListener('click', function() {
                var newSSID = ssidInp.value.trim();
                var newEnc  = encSel.value;
                var newKey  = keyInp.value;
                if (!newSSID) { alert('SSID cannot be empty'); return; }
                if (newEnc !== 'none' && newKey.length < 8) {
                    alert('Password must be at least 8 characters'); return; }
                if (is6g && newEnc === 'none') {
                    alert('Open network not allowed on 6 GHz -- hostapd will reject it'); return; }

                applyBtn.disabled  = true;
                discardBtn.disabled = true;
                statusSpan.textContent = 'Writing UCI...';
                statusSpan.style.color = '#f5a623';

                var vals = { ssid: newSSID, encryption: newEnc,
                             disabled: disChk.checked ? '1' : '0' };
                if (newEnc !== 'none') vals.key = newKey;

                L.resolveDefault(callUciSet('wireless', sid, vals), null)
                .then(function() {
                    statusSpan.textContent = 'Committing...';
                    return L.resolveDefault(callUciCommit('wireless'), null);
                }).then(function() {
                    statusSpan.textContent = 'Running wifi restart...';
                    return callExec('/sbin/wifi', []);
                }).then(function() {
                    statusSpan.textContent = 'Done';
                    statusSpan.style.color = '#1d9e75';
                    applyBtn.disabled  = false;
                    discardBtn.disabled = false;
                    setTimeout(function() { statusSpan.textContent = ''; }, 3000);
                });
            });

            // Wrap keyRow in a div so we can show/hide it cleanly
            var keyWrap = E('div', {});
            keyWrap.appendChild(fieldRow('Password', keyInp));

            function applyKeyVis() {
                keyWrap.style.display = encSel.value === 'none' ? 'none' : '';
            }
            encSel.addEventListener('change', applyKeyVis);
            applyKeyVis();

            var bodyRows = [
                fieldRow('SSID', ssidInp),
                fieldRow('Encryption', encSel),
                keyWrap,
                fieldRow('Disabled',
                    E('div', { 'style': 'display:flex;align-items:center;gap:8px' }, [
                        disChk,
                        E('span', { 'style': 'font-size:11px;color:#666' },
                            'disables this interface only')
                    ])),
                fieldRow('UCI section', roValue(sid + '  (device: ' + s['device'] + ')'))
            ];

            return E('div', { 'style':
                'border:1px solid #444;border-radius:6px;overflow:hidden;margin-bottom:10px' }, [
                E('div', { 'style':
                    'background:#16213e;padding:7px 12px;font-size:13px;font-weight:bold;' +
                    'display:flex;align-items:center;gap:8px' }, [
                    badge(meta.band, meta.bg, meta.fg),
                    E('span', {}, s['ssid'] || sid),
                    E('span', { 'style': 'font-size:11px;color:#666;margin-left:4px' },
                        s['disabled'] === '1' ? '(disabled)' : '')
                ]),
                (function() {
                    var bd = E('div', { 'style': 'padding:10px 12px' });
                    bodyRows.forEach(function(r) { if (r) bd.appendChild(r); });
                    return bd;
                })(),
                E('div', { 'style':
                    'display:flex;justify-content:flex-end;align-items:center;' +
                    'padding:8px 12px;border-top:1px solid #2a2a3a' }, [
                    statusSpan, discardBtn, applyBtn
                ])
            ]);
        });

        return E('div', {}, [
            infoBanner('Legacy networks are independent from MLD. ' +
                'Open networks disable EHT (WiFi 7). ' +
                'Open on 6 GHz is rejected by hostapd -- sae or sae-mixed required.'),
            legacyIfaces.length
                ? E('div', {}, cards)
                : E('div', { 'style': 'font-size:12px;color:#888;padding:20px;text-align:center' },
                    'No legacy networks configured.')
        ]);
    },

    renderStations: function(data) {
        var stations = parseStationDump(data[6].stdout || '');

        var bandNames = { '0': '2.4G', '1': '5G', '2': '6G' };
        var bandBg    = { '0': '#0a2a1a', '1': '#0a1a3a', '2': '#1a0a3a' };
        var bandFg    = { '0': '#5dcaa5', '1': '#85b7eb', '2': '#afa9ec' };

        var staEls = stations.map(function(sta) {
            var linkEls = Object.keys(sta.links).sort().map(function(lid) {
                var lk   = sta.links[lid];
                var bg   = bandBg[lid]   || '#1a1a3a';
                var fg   = bandFg[lid]   || '#aaa';
                var name = bandNames[lid] || ('Link ' + lid);

                if (lk.idle) {
                    return E('div', { 'style':
                        'font-size:11px;margin-top:5px;color:#555;' +
                        'display:flex;align-items:center;gap:6px' }, [
                        badge(name, bg, fg),
                        E('span', {}, 'idle (STR)  |  peer: ' + lk.addr)
                    ]);
                }
                return E('div', { 'style':
                    'font-size:11px;margin-top:5px;color:#ccc;' +
                    'display:flex;align-items:flex-start;gap:6px' }, [
                    badge(name, bg, fg),
                    E('div', { 'style': 'line-height:1.8' }, [
                        'signal: ' + lk.signal +
                            (lk.signal_arr ? ' ' + lk.signal_arr : '') + ' dBm',
                        E('br'),
                        'Tx: ' + lk.tx,
                        E('br'),
                        'Rx: ' + lk.rx,
                        E('br'),
                        'peer MAC: ' + lk.addr
                    ])
                ]);
            });

            return E('div', { 'style':
                'padding:10px 0;border-bottom:1px solid #2a2a3a' }, [
                E('div', { 'style':
                    'display:flex;align-items:center;gap:6px;margin-bottom:6px' }, [
                    badge('MLD', '#0a1a3a', '#85b7eb'),
                    badge('EHT', '#0a2a1a', '#5dcaa5'),
                    E('span', { 'style':
                        'font-family:monospace;font-size:12px;color:#fff' },
                        sta.mac),
                    E('span', { 'style':
                        'color:#888;font-size:11px;margin-left:4px' },
                        sta.connected ? 'connected: ' + sta.connected : '')
                ]),
                E('div', {}, linkEls)
            ]);
        });

        return E('div', {}, [
            sectionBox(
                'MLD clients -- ap_mld_1',
                stations.length ? '#1d9e75' : '#888',
                stations.length + ' connected',
                E('div', {},
                    stations.length ? staEls
                        : [E('div', { 'style':
                            'font-size:12px;color:#888;padding:4px 0' },
                            'No clients connected.')])
            )
        ]);
    },

    renderDiagnostics: function(data) {
        var skuRaw = data[2].stdout  ? data[2].stdout.trim()  : '?';
        var fwRaw  = data[7].stdout  ? data[7].stdout.trim()  : '?';
        var tp0    = data[8].stdout  || '';
        var tp1    = data[9].stdout  || '';
        var tp2    = data[10].stdout || '';

        var skuBad = skuRaw === '1';

        function dcrd(label, val, bad) {
            return E('div', { 'style':
                'border:1px solid #333;border-radius:6px;padding:8px 11px' }, [
                E('div', { 'style':
                    'font-size:11px;color:#888;margin-bottom:3px' }, label),
                E('div', { 'style':
                    'font-size:12px;font-family:monospace;color:' +
                    (bad ? '#e24b4a' : '#ccc') }, val)
            ]);
        }

        return E('div', {}, [
            E('div', { 'style':
                'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px' }, [
                dcrd('Firmware',     fwRaw),
                dcrd('MT76 driver',  'mt7996 / kernel 6.12'),
                dcrd('sku_disable',
                    skuRaw + (skuBad ? ' -- regulation INACTIVE' : ' -- regulation active'),
                    skuBad),
                dcrd('Single wiphy', 'phy0 (radio0 + radio1 + radio2)')
            ]),
            sectionBox('txpower_info -- band 0 (2.4 GHz)', '#444', null,
                E('pre', { 'style':
                    'font-size:11px;color:#aaa;margin:0;' +
                    'white-space:pre-wrap;line-height:1.5' },
                    tp0 || 'N/A')),
            sectionBox('txpower_info -- band 1 (5 GHz)', '#444', null,
                E('pre', { 'style':
                    'font-size:11px;color:#aaa;margin:0;' +
                    'white-space:pre-wrap;line-height:1.5' },
                    tp1 || 'N/A')),
            sectionBox('txpower_info -- band 2 (6 GHz)', '#444', null,
                E('pre', { 'style':
                    'font-size:11px;color:#aaa;margin:0;' +
                    'white-space:pre-wrap;line-height:1.5' },
                    tp2 || 'N/A'))
        ]);
    },

    handleSave:      null,
    handleSaveApply: null,
    handleReset:     null

});
