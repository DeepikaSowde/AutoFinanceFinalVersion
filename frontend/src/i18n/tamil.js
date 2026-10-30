import { MOTOLEND_TAMIL } from './motolendTamil';

// One English → Tamil dictionary for the whole app, built from the approved
// workbook (MotoLend-English-to-Tamil.xlsx). Nothing here is translated by
// machine or by hand: every Tamil string is a cell of the workbook.
//
// The workbook's sheets sometimes give the same English different Tamil.
// So that a label reads the same on every page, each English text gets one
// value: the one most sheets give; on a tie, the earliest module sheet in the
// workbook, then Sheet1 (the general glossary), then Loan Details View 2 (the
// app-wide list). A row whose Tamil is the English itself ("Moto") is a
// vote to keep the English; when it wins, the text stays English.
//
// The corrections in MotoLend_Missing_Tamil_Translations.docx come later
// and are kept as their own sheet; where it has a value, that value wins.
export const CORRECTIONS_SHEET = 'MotoLend_Missing_Tamil_Translations.docx';

// Workbook order. The server returns sheets alphabetically, so order comes
// from here, not from the object.
const SHEET_ORDER = [
  'Sheet1',
  'Login Module',
  'Collection and Payment',
  'Customer Management Module',
  'Customer List',
  'Guarantor and Referral',
  'Loan Details View',
  'Referral Commission',
  'Dashboard Module',
  'Dashboard Charts',
  'Dashboard KPI',
  'Operational Dashboard',
  'Capital, Chit & Outstanding',
  'Chit Investment',
  'Investors',
  'Expense View',
  'Ledger',
  'Income Overview & Income View',
  'Loan Details View 2',
];
const GENERAL_RANK = { Sheet1: 1000, 'Loan Details View 2': 1001 };
const sheetRank = (sheet) => {
  if (sheet in GENERAL_RANK) return GENERAL_RANK[sheet];
  const index = SHEET_ORDER.indexOf(sheet);
  return index === -1 ? 500 : index;
};

const PLACEHOLDER = /\$\{[^}]+\}/g;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasLetters = (text) => /[A-Za-z]/.test(text);

// Picks one Tamil value per English text. Returns { english: { tamil, sheets, options } }.
export const resolveTranslations = (table = MOTOLEND_TAMIL) => {
  const byEnglish = {};
  Object.entries(table).forEach(([sheet, rows]) => {
    Object.entries(rows || {}).forEach(([english, tamil]) => {
      if (!english || !tamil) return;
      const options = (byEnglish[english] ||= {});
      (options[tamil] ||= []).push(sheet);
    });
  });

  const resolved = {};
  Object.entries(byEnglish).forEach(([english, options]) => {
    const ranked = Object.entries(options)
      .map(([tamil, sheets]) => ({
        tamil,
        sheets,
        corrected: sheets.includes(CORRECTIONS_SHEET),
        count: sheets.length,
        rank: Math.min(...sheets.map(sheetRank)),
      }))
      .sort((a, b) => b.corrected - a.corrected || b.count - a.count || a.rank - b.rank);
    resolved[english] = { tamil: ranked[0].tamil, sheets: ranked[0].sheets, options: ranked };
  });
  return resolved;
};

// { exact: Map(english → tamil), templates: [{ pattern, names, tamil }] }
export const buildDictionary = (table = MOTOLEND_TAMIL) => {
  const exact = new Map();
  const templates = [];

  Object.entries(resolveTranslations(table)).forEach(([english, { tamil }]) => {
    if (tamil === english) return;
    if (!english.includes('${')) {
      exact.set(english, tamil);
      return;
    }
    // A template such as 'Year ${year}': usable only when it has words of its
    // own and the Tamil keeps every placeholder.
    const names = english.match(PLACEHOLDER);
    if (!hasLetters(english.replace(PLACEHOLDER, '')) || names.some((name) => !tamil.includes(name))) return;
    // ${n} is a count and ${amount} a number, so they match only digits;
    // any other placeholder matches any text.
    const parts = english.split(PLACEHOLDER).map(escapeRegExp);
    const source = parts.reduce((acc, part, index) => {
      if (index === 0) return part;
      const name = names[index - 1];
      const value = name === '${n}' ? '(\\d[\\d,]*)' : name === '${amount}' ? '(\\d[\\d,.]*)' : '(.+?)';
      return acc + value + part;
    }, '');
    const pattern = new RegExp(`^${source}$`);
    templates.push({ pattern, names, tamil });
  });

  return { exact, templates };
};

export const DEFAULT_DICTIONARY = buildDictionary();

// Punctuation around a label ("Status:", "Select Month (", "• Paid") is kept
// as is and only the words inside are looked up.
const AFFIXES = /^([\s([•·*:–—-]*)(.*?)([\s:*([–—-]*)$/;

const lookup = (text, dictionary) => {
  const direct = dictionary.exact.get(text);
  if (direct !== undefined) return direct;

  for (const { pattern, names, tamil } of dictionary.templates) {
    const match = text.match(pattern);
    if (!match) continue;
    // Values filled into the template (a month, a year, a page number) are
    // translated only when they are themselves an approved label.
    return names.reduce((result, name, index) => {
      const value = match[index + 1];
      return result.split(name).join(dictionary.exact.get(value) ?? value);
    }, tamil);
  }

  const [, prefix, core, suffix] = text.match(AFFIXES) || [];
  if (core && core !== text) {
    const inner = dictionary.exact.get(core);
    if (inner !== undefined) return `${prefix}${inner}${suffix}`;
  }
  return undefined;
};

// Tamil for a piece of interface text, keeping its surrounding whitespace, or
// undefined when the workbook has no approved entry (the English then stays).
export const translateText = (raw, dictionary = DEFAULT_DICTIONARY) => {
  if (typeof raw !== 'string' || !hasLetters(raw)) return undefined;
  const text = raw.trim();
  const tamil = lookup(text, dictionary);
  if (tamil === undefined) return undefined;
  const start = raw.indexOf(text);
  return raw.slice(0, start) + tamil + raw.slice(start + text.length);
};
