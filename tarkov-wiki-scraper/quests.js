import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as common from './common.js';

console.log('start');

//const VENDOR_NAMES = [ 'Prapor', 'Therapist', 'Skier', 'Peacekeeper', 'Mechanic', 'Ragman', 'Jaeger', 'Fence' ];
const OUTPUT_DIR = './output';
const QUESTS_FILE = OUTPUT_DIR + '/quests.json';

let wikiXmlFile = process.argv[2];
console.log('reading quests from file: ' + wikiXmlFile);

function findLine(linesIterator, searchRegex, terminatingRegex) {
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

const HEADING_REGEX = /^=+([^=]+)=+/;

JSDOM.fromFile(wikiXmlFile, { contentType: "application/xml" }).then(async wikiXml => {
  let window = wikiXml.window;
  let doc = window.document;
  // Xpath turns out to be prohibitively slow, so fell back to doing it the hard way.
  // let questsPageResult = doc.evaluate("/mediawiki/page[title = 'Quests']", doc, null, window.XPathResult.ANY_TYPE);

  let questsPage = common.findPage(doc, 'Quests');
  console.log('questsPage found = ' + (questsPage != null));

  let questsText = common.getPageText(questsPage);
  console.log('questsPage content = ' + questsText.substr(0, 60));

  let linesIterator = common.makeLineIterator(questsText);
  let foundQuestsTable = findLine(linesIterator, /==List of Quests==/);
  console.log('foundQuestsTable = ' + foundQuestsTable);

  let quests = [];
  const wikiRowBeginMarkup = /^\|\-/;
  while (findLine(linesIterator, wikiRowBeginMarkup, HEADING_REGEX)) {
    let questTitleLine = linesIterator.next().value;
    // There's one case of a superfluous 'row begin' line (for the 'Key to the City' quest).
    while (wikiRowBeginMarkup.exec(questTitleLine)) {
      questTitleLine = linesIterator.next().value;
    }

    let questTitleMatch = /^\|\s*\[\[([^\|\]]*)\|?[^\]]*\]\]\s*$/.exec(questTitleLine);
    let questTitle = questTitleMatch && questTitleMatch[1];
    if (questTitle) {
      console.log('quest: ' + questTitle);
      let questPage = common.findPage(doc, questTitle);
      // console.log('quest page found ' + (questPage != null));
      let questInfo = processQuestPage(questPage, questTitle);
      quests.push(questInfo);
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)){
      fs.mkdirSync(OUTPUT_DIR);
  }
  fs.writeFileSync(QUESTS_FILE, JSON.stringify(quests));

  console.log('finished');
});

function parseInfobox(wikiText) {
  let linesIterator = common.makeLineIterator(wikiText);
  if (!findLine(linesIterator, /^\{\{Infobox/, HEADING_REGEX)) {
    console.log('warning: could not find infobox');
    return null;
  }

  let infobox = {};
  do {
    let nextLine = linesIterator.next();
    if (nextLine.done || /^\}\}/.test(nextLine.value)) {
      break;
    }

    let match = /^\|([^=]+)=(.*)/.exec(nextLine.value);
    if (!match || !match[1]) {
      console.log('warning: could not parse infobox line: ' + nextLine.value);
    }
    else {
      infobox[match[1].trim()] = match[2];
    }
  } while (true);
  return infobox;
}

function processUnorderedList(linesIterator, lineParser) {
  do {
    let nextLine = linesIterator.next();
    if (nextLine.done || !nextLine.value.startsWith('*')) {
      break;
    }
    lineParser(nextLine.value);
  } while (true);
}

const WIKI_LINK_REGEX = /[^\[]*\[\[([^\|\]]*)\|?[^\]]*\]\]/g;

function extractWikiLinks(wikiString) {
  let links = [];
  for (let matchResult of wikiString.matchAll(WIKI_LINK_REGEX)) {
    links.push(matchResult[1]);
  }
  return links;
}

function processQuestPage(questPage, questName) {
  let questText = common.getPageText(questPage);
  let infobox = parseInfobox(questText);
  let vendorName = infobox['given by'];
  vendorName = vendorName && extractWikiLinks(vendorName)[0];
  if (!vendorName) {
    console.log('warning: no vendor in infobox for quest ' + questName);
  }

  let questUrl = common.pageTitleToUrl(questName);
  let questInfo = { vendor: vendorName, name: questName, url: questUrl};

  // Get links to previous quests
  if (infobox.previous) {
    let previousQuestInfo = [];
    for (let previousQuestTitle of extractWikiLinks(infobox.previous)) {
      let previousQuest = { url: common.pageTitleToUrl(previousQuestTitle), text: previousQuestTitle };
      // console.log(previousQuest);
      previousQuestInfo.push(previousQuest);
    }
    questInfo.previousQuests = previousQuestInfo;
  }

  // Look for requirements and objectives
  let linesIterator = common.makeLineIterator(questText);
  do {
    let heading = findLine(linesIterator, HEADING_REGEX);
    if (!heading) {
      break;
    }

    if (heading[1] === 'Requirements') {
      // Check for a minimum level requirement.
      processUnorderedList(linesIterator, line => {
        let match = / be level (\d+) /.exec(line);
        if (match) {
          // console.log('level req=' + match[1]);
          questInfo.requiredLevel = +(match[1]);
        }
      });
    }
    else if (heading[1] === 'Objectives') {
      // Parse item objectives (any other objectives will just be recorded as text).
      let objectivesInfo = [];
      processUnorderedList(linesIterator, line => {
        let match = /[Ff]ind\sa?(?<num>\d+)?\s?\[\[(?<link>[^\|\]]+)\|?[^\]]*\]\](?<raid>.*in raid)?/.exec(line);
        if (match) {
          let itemName = match.groups.link;
          let item = { kind: 'item', count: (match.groups.num || 1), url: common.pageTitleToUrl(itemName), name: itemName };
          // console.log(item);
          objectivesInfo.push(item);
        }
        else {
          let item = { kind: 'unknown', text: line };
          // console.log(item);
          objectivesInfo.push(item);
        }
      });
      questInfo.objectives = objectivesInfo;
    }
  } while (true);

  return questInfo;
}
