// File for functions used by more than one of the scraper utilities.

export const OUTPUT_DIR = './output';

export const HEADING_REGEX = /^=+([^=]+)=+/;

export function makeLineIterator(text) {
  return text.split(/\r?\n/).values();
}

export function pageTitleToUrl(pageTitle) {
  return "https://escapefromtarkov.fandom.com/wiki/" + pageTitle.replaceAll(' ', '_');
}

export function getPageText(wikiPage) {
  let textNode = wikiPage.querySelector('revision > text')
  return textNode && textNode.textContent;
}

export function findPage(wikiDocument, pageTitle) {
  // Xpath turns out to be prohibitively slow, so fell back to doing it the hard way.
  // let resultPage = doc.evaluate("/mediawiki/page[title = 'Quests']", doc, null, window.XPathResult.ANY_TYPE);

  let resultPage = null;
  let wikiPages = wikiDocument.querySelectorAll(':root > page');
  for (const wikiPage of wikiPages) {
    let title = wikiPage.querySelector('title');
    if (title && title.textContent === pageTitle) {
      resultPage = wikiPage;
      break;
    }
  }
  return resultPage;
}

export function findLine(linesIterator, searchRegex, terminatingRegex) {
  do {
    let next = linesIterator.next();
    if (next.done) {
      return null;
    }
    let line = next.value;
    if (terminatingRegex && terminatingRegex.test(line)) {
      return null;
    }

    let result = searchRegex.exec(line);
    if (result) {
      return result;
    }
  } while (true);
}

const WIKI_LINK_REGEX = /[^\[]*\[\[([^\|\]]*)\|?[^\]]*\]\]/g;

export function extractWikiLink(wikiString) {
  return extractWikiLinks(wikiString)[0];
}

export function extractWikiLinks(wikiString) {
  let links = [];
  for (let matchResult of wikiString.matchAll(WIKI_LINK_REGEX)) {
    links.push(matchResult[1]);
  }
  return links;
}

export const WIKI_TABLE_BEGIN_REGEX = /^\{\|\s*class="wikitable/;

// Reads a wiki table into a triply nested array, i.e. returns an array of rows, where each row
// is an array of cells, where each cell is an array of strings (lines).
export function readWikiTable(linesIterator) {
  let rows = [];
  let row = [];
  let cell = [];
  for (;;) {
    let nextLine = linesIterator.next();
    if (nextLine.done || nextLine.value.startsWith('|}')) {
      row.push(cell);
      rows.push(row);
      break;
    }

    let line = nextLine.value.trim();
    if (line.startsWith('|-')) {
      // Beginning of next row
      row.push(cell);
      cell = [];
      rows.push(row);
      row = [];
      if (line.length > 2) {
        cell.push(line.substring(2));
      }
    }
    else if (line.startsWith('|') || line.startsWith('!')) {
      // Beginning of a new cell
      if (cell.length > 0) {
        row.push(cell);
        cell = [];
      }
      if (line.length > 1) {
        cell.push(line.substring(1));
      }
    }
    else {
      // Line is in current cell
      cell.push(line);
    }
  }
  return rows;
}
