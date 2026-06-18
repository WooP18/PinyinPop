/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2010-2023 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde

 ---

 Originally based on Rikaikun 0.8
 Copyright (C) 2010 Erek Speed
 http://code.google.com/p/rikaikun/

 ---

 Originally based on Rikaichan 1.07
 by Jonathan Zarate
 http://www.polarcloud.com/

 ---

 Originally based on RikaiXUL 0.4 by Todd Rudick
 http://www.rikai.com/
 http://rikaixul.mozdev.org/

 ---

 This program is free software; you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation; either version 2 of the License, or
 (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program; if not, write to the Free Software
 Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA

 ---

 Please do not change or remove any of the copyrights or links to web pages
 when modifying any of the files.

 */

'use strict';

import { ZhongwenDictionary } from './dict.js';

let isEnabled = false;
let isActivated = false;
let tabIDs = {};
let dict;
let dictReady = null;

// Restore tab tracking after a service-worker restart (MV3 kills idle SWs).
// chrome.storage.session is in-memory and survives SW restarts within a
// browser session, so wordlist/help tab reuse keeps working.
if (chrome.storage.session) {
    chrome.storage.session.get('tabIDs', (items) => {
        if (items && items.tabIDs) {
            tabIDs = items.tabIDs;
        }
    });
}

function setTabID(tabType, id) {
    tabIDs[tabType] = id;
    if (chrome.storage.session) {
        chrome.storage.session.set({ tabIDs });
    }
}

// Send a message to a tab, swallowing the expected "no receiver" error that
// occurs on pages without our content script (chrome://, web store, PDFs).
function sendTabMessage(tabId, message) {
    chrome.tabs.sendMessage(tabId, message, () => void chrome.runtime.lastError);
}

let zhongwenOptions = {
    css: 'white',
    tonecolors: 'yes',
    fontSize: 'small',
    skritterTLD: 'com',
    zhuyin: 'no',
    grammar: 'yes',
    vocab: 'yes',
    simpTrad: 'classic',
    toneColorScheme: 'standard'
};

function applyStorageItems(items) {
    if (items.popupcolor !== undefined) zhongwenOptions.css = items.popupcolor;
    if (items.tonecolors !== undefined) zhongwenOptions.tonecolors = items.tonecolors;
    if (items.fontSize !== undefined) zhongwenOptions.fontSize = items.fontSize;
    if (items.skritterTLD !== undefined) zhongwenOptions.skritterTLD = items.skritterTLD;
    if (items.zhuyin !== undefined) zhongwenOptions.zhuyin = items.zhuyin;
    if (items.grammar !== undefined) zhongwenOptions.grammar = items.grammar;
    if (items.vocab !== undefined) zhongwenOptions.vocab = items.vocab;
    if (items.simpTrad !== undefined) zhongwenOptions.simpTrad = items.simpTrad;
    if (items.toneColorScheme !== undefined) zhongwenOptions.toneColorScheme = items.toneColorScheme;
}

async function updateActionIcon(active) {
    const size = 48;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');

    const blob = await fetch(chrome.runtime.getURL('images/pinyinpop48.png')).then(r => r.blob());
    const bitmap = await createImageBitmap(blob);
    ctx.drawImage(bitmap, 0, 0, size, size);

    if (active) {
        const bw = 39, bh = 18, r = 3;
        const bx = size - bw - 1, by = size - bh - 1;

        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + bw - r, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
        ctx.lineTo(bx + bw, by + bh - r);
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
        ctx.lineTo(bx + r, by + bh);
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();
        ctx.fillStyle = 'rgba(128, 0, 200, 0.85)';
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 17px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('on', bx + bw / 2, by + bh / 2 + 0.5);
    }

    const imageData = ctx.getImageData(0, 0, size, size);
    chrome.action.setIcon({ imageData: { 48: imageData } });
    chrome.action.setBadgeText({ text: '' });
}

// Enable by default on first install
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.storage.local.set({ enabled: '1' });
    }
});

// Restore state when service worker starts (or restarts)
chrome.storage.local.get(
    ['enabled', 'popupcolor', 'tonecolors', 'fontSize', 'skritterTLD', 'zhuyin', 'grammar', 'vocab', 'simpTrad', 'toneColorScheme'],
    (items) => {
        isEnabled = items.enabled === '1';
        applyStorageItems(items);

        if (isEnabled) {
            updateActionIcon(true);
            chrome.contextMenus.removeAll(() => {
                chrome.contextMenus.create({ id: 'wordlist', title: 'Open word list' });
                chrome.contextMenus.create({ id: 'help', title: 'Show help in new tab' });
            });
            ensureDict();
        }
    }
);

// Keep options in sync when changed from options page, and push to open tabs
chrome.storage.onChanged.addListener((changes) => {
    const mapped = {
        popupcolor: changes.popupcolor,
        tonecolors: changes.tonecolors,
        fontSize: changes.fontSize,
        skritterTLD: changes.skritterTLD,
        zhuyin: changes.zhuyin,
        grammar: changes.grammar,
        vocab: changes.vocab,
        simpTrad: changes.simpTrad,
        toneColorScheme: changes.toneColorScheme
    };
    const relevant = {};
    for (const [key, change] of Object.entries(mapped)) {
        if (change) relevant[key] = change.newValue;
    }
    if (Object.keys(relevant).length === 0) return;
    applyStorageItems(relevant);

    // Push updated config immediately to all open tabs so options take effect
    // without requiring a page reload. addEventListener deduplicates same-ref
    // listeners so re-sending 'enable' is safe.
    if (isEnabled) {
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                sendTabMessage(tab.id, {
                    type: 'enable',
                    config: zhongwenOptions
                });
            }
        });
    }
});

function activateExtension(tabId, showHelp) {
    isActivated = true;
    isEnabled = true;
    chrome.storage.local.set({ enabled: '1' });

    ensureDict();

    sendTabMessage(tabId, {
        'type': 'enable',
        'config': zhongwenOptions
    });

    if (showHelp) {
        sendTabMessage(tabId, {
            'type': 'showHelp'
        });
    }

    updateActionIcon(true);

    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: 'wordlist', title: 'Open word list' });
        chrome.contextMenus.create({ id: 'help', title: 'Show help in new tab' });
    });
}

async function loadDictData() {
    let wordDict = fetch(chrome.runtime.getURL(
        'data/cedict_ts.u8')).then(r => r.text());
    let wordIndex = fetch(chrome.runtime.getURL(
        'data/cedict.idx')).then(r => r.text());
    let grammarKeywords = fetch(chrome.runtime.getURL(
        'data/grammarKeywordsMin.json')).then(r => r.json());
    let vocabKeywords = fetch(chrome.runtime.getURL(
        'data/vocabularyKeywordsMin.json')).then(r => r.json());

    return Promise.all([wordDict, wordIndex, grammarKeywords, vocabKeywords]);
}

async function loadDictionary() {
    let [wordDict, wordIndex, grammarKeywords, vocabKeywords] = await loadDictData();
    return new ZhongwenDictionary(wordDict, wordIndex, grammarKeywords, vocabKeywords);
}

// Single shared promise so concurrent searches (and SW restarts) reuse one load
function ensureDict() {
    if (dict) {
        return Promise.resolve(dict);
    }
    if (!dictReady) {
        dictReady = loadDictionary().then(r => {
            dict = r;
            isActivated = true;
            return r;
        }).catch(err => {
            // Allow a later retry if the fetch failed
            dictReady = null;
            throw err;
        });
    }
    return dictReady;
}

function deactivateExtension() {
    isActivated = false;
    isEnabled = false;
    chrome.storage.local.set({ enabled: '0' });

    dict = undefined;
    dictReady = null;

    updateActionIcon(false);

    chrome.windows.getAll(
        { 'populate': true },
        function (windows) {
            for (let i = 0; i < windows.length; ++i) {
                let tabs = windows[i].tabs;
                for (let j = 0; j < tabs.length; ++j) {
                    sendTabMessage(tabs[j].id, {
                        'type': 'disable'
                    });
                }
            }
        }
    );

    chrome.contextMenus.removeAll();
}

function activateExtensionToggle(currentTab) {
    if (isActivated) {
        deactivateExtension();
    } else {
        activateExtension(currentTab.id, true);
    }
}

function enableTab(tabId) {
    if (isEnabled) {
        if (!isActivated) {
            activateExtension(tabId, false);
        }
        sendTabMessage(tabId, {
            'type': 'enable',
            'config': zhongwenOptions
        });
    }
}

function search(text) {
    if (!dict) {
        return;
    }

    let entry = dict.wordSearch(text);

    if (entry) {
        for (let i = 0; i < entry.data.length; i++) {
            let word = entry.data[i][1];
            if (!entry.grammar && dict.hasGrammarKeyword(word) && (entry.matchLen === word.length)) {
                entry.grammar = { keyword: word, index: i };
            }
            if (!entry.vocab && dict.hasVocabKeyword(word) && (entry.matchLen === word.length)) {
                entry.vocab = { keyword: word, index: i };
            }
        }
    }

    return entry;
}

chrome.action.onClicked.addListener(activateExtensionToggle);

chrome.tabs.onActivated.addListener(activeInfo => {
    if (activeInfo.tabId === tabIDs['wordlist']) {
        chrome.tabs.reload(activeInfo.tabId);
    } else if (activeInfo.tabId !== tabIDs['help']) {
        enableTab(activeInfo.tabId);
    }
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    if (changeInfo.status === 'complete' && tabId !== tabIDs['help'] && tabId !== tabIDs['wordlist']) {
        enableTab(tabId);
    }
});

function createTab(url, tabType) {
    chrome.tabs.create({ url }, tab => {
        setTabID(tabType, tab.id);
    });
}

chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === 'wordlist') {
        let url = '/wordlist.html';
        let tabID = tabIDs['wordlist'];
        if (tabID) {
            chrome.tabs.get(tabID, function (tab) {
                if (tab && tab.url && (tab.url.endsWith('wordlist.html'))) {
                    chrome.tabs.update(tabID, { active: true });
                } else {
                    createTab(url, 'wordlist');
                }
            });
        } else {
            createTab(url, 'wordlist');
        }
    } else if (info.menuItemId === 'help') {
        let url = '/help.html';
        let tabID = tabIDs['help'];
        if (tabID) {
            chrome.tabs.get(tabID, function (tab) {
                if (tab && (tab.url.endsWith('help.html'))) {
                    chrome.tabs.update(tabID, { active: true });
                } else {
                    createTab(url, 'help');
                }
            });
        } else {
            createTab(url, 'help');
        }
    }
});

chrome.runtime.onMessage.addListener(function (request, sender, callback) {

    let tabID;

    switch (request.type) {

        case 'search': {
            // Dictionary may not be loaded yet (e.g. service worker just woke
            // from idle). Wait for it so the first hover doesn't silently fail.
            ensureDict().then(() => {
                let response = search(request.text);
                if (response) {
                    response.originalText = request.originalText;
                }
                callback(response);
            }).catch(() => callback(null));
        }
            return true; // keep the message channel open for the async callback

        case 'open': {
            tabID = tabIDs[request.tabType];
            if (tabID) {
                chrome.tabs.get(tabID, () => {
                    if (!chrome.runtime.lastError) {
                        chrome.tabs.update(tabID, { active: true, url: request.url });
                    } else {
                        createTab(request.url, request.tabType);
                    }
                });
            } else {
                createTab(request.url, request.tabType);
            }
        }
            break;

        case 'add': {
            chrome.storage.local.get(['wordlist', 'saveToWordList'], (items) => {
                let saveFirstEntryOnly = items.saveToWordList === 'firstEntryOnly';
                let wordlist = items.wordlist ? JSON.parse(items.wordlist) : [];

                for (let i in request.entries) {
                    let entry = {};
                    entry.timestamp = Date.now();
                    entry.simplified = request.entries[i].simplified;
                    entry.traditional = request.entries[i].traditional;
                    entry.pinyin = request.entries[i].pinyin;
                    entry.definition = request.entries[i].definition;
                    wordlist.push(entry);
                    if (saveFirstEntryOnly) {
                        break;
                    }
                }
                chrome.storage.local.set({ wordlist: JSON.stringify(wordlist) });
            });
        }
            break;
    }
});
