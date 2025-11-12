// File for functions used by more than one of the scraper utilities.

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
