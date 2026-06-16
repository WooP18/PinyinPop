/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2010-2023 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde
 */

'use strict';

function loadVals() {
    chrome.storage.local.get({
        popupcolor: 'white',
        tonecolors: 'yes',
        toneColorScheme: 'standard',
        fontSize: 'small',
        simpTrad: 'classic',
        zhuyin: 'no',
        grammar: 'yes',
        vocab: 'yes',
        saveToWordList: 'allEntries',
        skritterTLD: 'com'
    }, (items) => {
        // null-safe: a stale/unknown stored value shouldn't crash the whole page
        let check = (selector) => {
            let el = document.querySelector(selector);
            if (el) el.checked = true;
        };

        check(`input[name="popupColor"][value="${items.popupcolor}"]`);

        if (items.tonecolors === 'no') {
            check('#toneColorsNone');
        } else {
            check(`input[name="toneColors"][value="${items.toneColorScheme}"]`);
        }

        check(`input[name="fontSize"][value="${items.fontSize}"]`);
        check(`input[name="simpTrad"][value="${items.simpTrad}"]`);
        document.querySelector('#zhuyin').checked = items.zhuyin === 'yes';
        document.querySelector('#grammar').checked = items.grammar !== 'no';
        document.querySelector('#vocab').checked = items.vocab !== 'no';
        check(`input[name="saveToWordList"][value="${items.saveToWordList}"]`);
        check(`input[name="skritterTLD"][value="${items.skritterTLD}"]`);
    });
}

function setPopupColor(popupColor) {
    chrome.storage.local.set({ popupcolor: popupColor });
}

function setToneColorScheme(toneColorScheme) {
    if (toneColorScheme === 'none') {
        chrome.storage.local.set({ tonecolors: 'no' });
    } else {
        chrome.storage.local.set({ tonecolors: 'yes', toneColorScheme: toneColorScheme });
    }
}

function setOption(option, value) {
    chrome.storage.local.set({ [option]: value });
}

function setBooleanOption(option, value) {
    let yesNo = value ? 'yes' : 'no';
    setOption(option, yesNo);
}

window.addEventListener('load', () => {

    loadVals();

    document.querySelectorAll('input[name="popupColor"]').forEach((input) => {
        input.addEventListener('change',
            () => setPopupColor(input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="toneColors"]').forEach((input) => {
        input.addEventListener('change',
            () => setToneColorScheme(input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="fontSize"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('fontSize', input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="simpTrad"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('simpTrad', input.getAttribute('value')));
    });

    document.querySelector('#zhuyin').addEventListener('change',
        (event) => setBooleanOption('zhuyin', event.target.checked));

    document.querySelector('#grammar').addEventListener('change',
        (event) => setBooleanOption('grammar', event.target.checked));

    document.querySelector('#vocab').addEventListener('change',
        (event) => setBooleanOption('vocab', event.target.checked));

    document.querySelectorAll('input[name="saveToWordList"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('saveToWordList', input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="skritterTLD"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('skritterTLD', input.getAttribute('value')));
    });
});
