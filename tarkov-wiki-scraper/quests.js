import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as common from './common.js';

console.log('start');

//const VENDOR_NAMES = [ 'Prapor', 'Therapist', 'Skier', 'Peacekeeper', 'Mechanic', 'Ragman', 'Jaeger', 'Fence' ];
const QUESTS_FILE = common.OUTPUT_DIR + '/quests.json';

let wikiXmlFile = process.argv[2];
console.log('reading quests from file: ' + wikiXmlFile);

JSDOM.fromFile(wikiXmlFile, { contentType: "application/xml" }).then(async wikiXml => {
  let window = wikiXml.window;
  let doc = window.document;

  let questsPage = common.findPage(doc, 'Quests');
  console.log('questsPage found = ' + (questsPage != null));

  let questsText = common.getPageText(questsPage);
  let linesIterator = common.makeLineIterator(questsText);
  let foundQuestsTable = common.findLine(linesIterator, /==List of Quests==/);
  console.log('foundQuestsTable = ' + foundQuestsTable);

  let quests = [];
  const wikiRowBeginMarkup = /^\|\-/;
  while (common.findLine(linesIterator, wikiRowBeginMarkup, common.HEADING_REGEX)) {
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

  if (!fs.existsSync(common.OUTPUT_DIR)){
      fs.mkdirSync(common.OUTPUT_DIR);
  }
  fs.writeFileSync(QUESTS_FILE, JSON.stringify(quests));

  console.log('finished');
});

function parseInfobox(wikiText) {
  let linesIterator = common.makeLineIterator(wikiText);
  if (!common.findLine(linesIterator, /^\{\{Infobox/, common.HEADING_REGEX)) {
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

function processQuestPage(questPage, questName) {
  let questText = common.getPageText(questPage);
  let infobox = parseInfobox(questText);
  let vendorName = infobox['given by'];
  vendorName = vendorName && common.extractWikiLink(vendorName);
  if (!vendorName) {
    console.log('warning: no vendor in infobox for quest ' + questName);
  }

  let questUrl = common.pageTitleToUrl(questName);
  let questInfo = { vendor: vendorName, name: questName, url: questUrl};

  // Get links to previous quests
  if (infobox.previous) {
    let previousQuestInfo = [];
    for (let previousQuestTitle of common.extractWikiLinks(infobox.previous)) {
      let previousQuest = { url: common.pageTitleToUrl(previousQuestTitle), text: previousQuestTitle };
      // console.log(previousQuest);
      previousQuestInfo.push(previousQuest);
    }
    questInfo.previousQuests = previousQuestInfo;
  }

  // Look for requirements and objectives
  let linesIterator = common.makeLineIterator(questText);
  do {
    let headingMatch = common.findLine(linesIterator, common.HEADING_REGEX);
    if (!headingMatch) {
      break;
    }

    const heading = headingMatch[1].trim();
    if (heading === 'Requirements') {
      // Check for a minimum level requirement.
      processUnorderedList(linesIterator, line => {
        let match = / be level (\d+) /.exec(line);
        if (match) {
          // console.log('level req=' + match[1]);
          questInfo.requiredLevel = +(match[1]);
        }
      });
    }
    else if (heading === 'Objectives') {
      // Parse item objectives (any other objectives will just be recorded as text).
      let objectivesInfo = [];
      processUnorderedList(linesIterator, line => {
        let match = /[Ff]ind\sa?(?<num>\d+)?\s?\[\[(?<link>[^\|\]]+)\|?[^\]]*\]\](?<raid>.*in raid)?/.exec(line);
        if (match && !isObjectiveIncorrectMatch(match)) {
          let itemName = match.groups.link;
          let itemCount = match.groups.num ? +(match.groups.num) : 1;
          //ajw currently assuming every requirement is find-in-raid, but we should do
          // more extensive checking.
          let item = { kind: 'item', count: itemCount, url: common.pageTitleToUrl(itemName), name: itemName, findInRaid: true };
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

// Checks for specific known false positives when trying to match 'find item' objectives, these are
// difficult to eliminate from the regex so we just check for them individually.
function isObjectiveIncorrectMatch(match) {
  if (match.groups.link === 'Found in raid') {
    // This happens with Peacekeeper's 'Trophies' quest, it has lines that start like this:
    //   Find [[Found in raid|<font color="red">in raid</font>]] and hand over 20 [[BEAR]] ...
    return true;
  }
  if (match.groups.link === 'Jaeger') {
    // This happens with Mechanic's 'Introduction' quest, it has this line:
    //   Find [[Jaeger]]'s camp at the specified spot on [[Woods]]
    return true;
  }
  return false;
}
