import { translateText } from './tamil';

// Shows the app's interface text in Tamil by swapping the text the page
// renders, and puts the English back when switched off. Components keep
// rendering English and no state, value or stored data is touched: only
// text nodes and the placeholder / title / aria-label attributes change,
// and only when the whole text is an approved workbook entry. Form values
// (input, textarea), code and anything inside translate="no" are left
// alone. Native alert / confirm / prompt messages go through the same
// dictionary.

const ATTRIBUTES = ['placeholder', 'title', 'aria-label'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
const SKIP_SELECTOR = '[translate="no"], [contenteditable="true"]';

// text node → { english, tamil } and element → { attribute: { english, tamil } }
const textRecords = new WeakMap();
const attributeRecords = new WeakMap();

let dictionary = null; // set while Tamil is on
let observer = null;

const isSkipped = (element) =>
  !element || SKIP_TAGS.has(element.tagName) || Boolean(element.closest?.(SKIP_SELECTOR));

const translateTextNode = (node) => {
  if (isSkipped(node.parentElement)) return;
  const current = node.nodeValue;
  const record = textRecords.get(node);
  // Already shown in Tamil: translate again from the English it came from
  // (the dictionary may have been refreshed from the server).
  const english = record && current === record.tamil ? record.english : current;
  const tamil = translateText(english, dictionary);
  if (tamil === undefined) {
    textRecords.delete(node);
    if (record && current === record.tamil) node.nodeValue = record.english;
    return;
  }
  textRecords.set(node, { english, tamil });
  if (current !== tamil) node.nodeValue = tamil;
};

const translateAttribute = (element, name) => {
  if (!element.hasAttribute(name) || isSkipped(element)) return;
  const current = element.getAttribute(name);
  const records = attributeRecords.get(element) || {};
  const record = records[name];
  const english = record && current === record.tamil ? record.english : current;
  const tamil = translateText(english, dictionary);
  if (tamil === undefined) {
    delete records[name];
    return;
  }
  records[name] = { english, tamil };
  attributeRecords.set(element, records);
  if (current !== tamil) element.setAttribute(name, tamil);
};

const walk = (root, onText, onElement) => {
  if (root.nodeType === Node.TEXT_NODE) {
    onText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) onElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) onText(node);
    else onElement(node);
  }
};

const translateTree = (root) =>
  walk(root, translateTextNode, (element) => ATTRIBUTES.forEach((name) => translateAttribute(element, name)));

const restoreTree = (root) =>
  walk(
    root,
    (node) => {
      const record = textRecords.get(node);
      if (record && node.nodeValue === record.tamil) node.nodeValue = record.english;
      textRecords.delete(node);
    },
    (element) => {
      const records = attributeRecords.get(element);
      if (!records) return;
      Object.entries(records).forEach(([name, record]) => {
        if (element.getAttribute(name) === record.tamil) element.setAttribute(name, record.english);
      });
      attributeRecords.delete(element);
    }
  );

const onMutations = (mutations) => {
  if (!dictionary) return;
  mutations.forEach((mutation) => {
    if (mutation.type === 'characterData') translateTextNode(mutation.target);
    else if (mutation.type === 'attributes') translateAttribute(mutation.target, mutation.attributeName);
    else mutation.addedNodes.forEach(translateTree);
  });
};

// Native dialogs cannot be reached through the page, so their message is
// translated on the way in. The answer they return is unchanged.
const nativeDialogs = {};
const patchDialogs = () => {
  ['alert', 'confirm', 'prompt'].forEach((name) => {
    if (nativeDialogs[name]) return;
    const original = window[name].bind(window);
    nativeDialogs[name] = original;
    window[name] = (message, ...rest) =>
      original(dictionary ? translateText(String(message ?? ''), dictionary) ?? message : message, ...rest);
  });
};

// Tamil on with this dictionary, or (dictionary = null) back to English.
export const applyTamil = (nextDictionary) => {
  const root = document.body;
  if (!nextDictionary) {
    observer?.disconnect();
    observer = null;
    dictionary = null;
    restoreTree(root);
    document.documentElement.lang = 'en';
    return;
  }

  patchDialogs();
  dictionary = nextDictionary;
  document.documentElement.lang = 'ta';
  translateTree(root);
  if (!observer) {
    observer = new MutationObserver(onMutations);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });
  }
};
