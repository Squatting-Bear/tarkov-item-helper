// File for functions used by more than one of the scraper utilities.

export const OUTPUT_DIR = './output';

export const HEADING_REGEX = /^=+([^=]+)=+/;

export function makeLineIterator(text) {
  return text.split(/\r?\n/).values();
}

export function pageTitleToUrl(pageTitle) {
  return "https://escapefromtarkov.fandom.com/wiki/" + pageTitle;
}

export function getPageText(wikiPage) {
  let textNode = wikiPage.querySelector('revision > text')
  return textNode && textNode.textContent;
}

export function findPage(wikiDocument, pageTitle) {
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
