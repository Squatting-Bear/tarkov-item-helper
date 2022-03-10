import { JSDOM } from 'jsdom';
import * as fs from 'fs';

console.log('start');

const VENDOR_NAMES = [ 'Prapor', 'Therapist', 'Skier', 'Peacekeeper', 'Mechanic', 'Ragman', 'Jaeger', 'Fence' ];
const OUTPUT_DIR = './output';
const QUESTS_FILE = OUTPUT_DIR + '/quests.json';

let quests = [];

JSDOM.fromURL('https://escapefromtarkov.fandom.com/wiki/Quests').then(async questsPage => {
  //console.log(questsPage.window.document.body.getAttribute('class'));
  let body = questsPage.window.document.body;

  // For each vendor, process their table of quests.
  for (const vendorName of VENDOR_NAMES) {
    let table = body.querySelector('table.' + vendorName + '-content');
    await processQuestTable(vendorName, table);
  }
  // let table = body.querySelector('table.' + VENDOR_NAMES[1] + '-content');
  // await processQuestTable(VENDOR_NAMES[1], table);

  if (!fs.existsSync(OUTPUT_DIR)){
      fs.mkdirSync(OUTPUT_DIR);
  }
  fs.writeFileSync(QUESTS_FILE, JSON.stringify(quests));

  console.log('finished');
});

async function processQuestTable(vendorName, table) {
  // Get the <tr> elements within the table's <tbody>
  let rows = table.firstElementChild.children;

  // Skip first two rows, which are table headers
  for (let i = 2; i < rows.length; ++i) {
  //ajw for (let i = 28; i < 29; ++i) {
    let anchor = rows[i].querySelector('th > b > a');
    console.log(anchor.href);
    let questPage = await JSDOM.fromURL(anchor.href);
    processQuestPage(vendorName, anchor.text, anchor.href, questPage);
  }
}

function processQuestPage(vendorName, questName, questUrl, questPage) {
  // console.log(questPage.window.document.body.getAttribute('class'));
  let body = questPage.window.document.body;
  let questInfo = { vendor: vendorName, name: questName, url: questUrl};

  // Get links to previous quests
  let infoboxCells = body.querySelectorAll('td.va-infobox-content');
  for (let infoboxCell of infoboxCells) {
    let text = infoboxCell.textContent
    //console.log(text);
    if (text && text.startsWith('Previous:')) {
      //console.log('yes');
      let previousQuestInfo = [];
      let previousQuestAnchors = infoboxCell.querySelectorAll('a');
      for (let previousQuestAnchor of previousQuestAnchors) {
        let previousQuest = { url: previousQuestAnchor.href, text: previousQuestAnchor.text };
        //console.log(previousQuest);
        previousQuestInfo.push(previousQuest);
      }
      questInfo.previousQuests = previousQuestInfo;
    }
  }

  // Get requirements
  let requirementsTitleSpan = body.querySelector('h2 > span[id=Requirements]');
  for (let node = requirementsTitleSpan && requirementsTitleSpan.parentNode; node; node = node.nextSibling) {
    // console.log(node.nodeName);
    if (node.nodeName.toLowerCase() === 'ul') {
      let requirementsText = node.textContent;
      // console.log(requirementsText);
      if (requirementsText) {
        let match = / be level (\d+) /.exec(requirementsText);
        if (match) {
          // console.log('level req=' + match[1]);
          questInfo.requiredLevel = +(match[1]);
        }
      }
      break;
    }
  }

  // Get objectives
  let objectivesInfo = [];
  let objectivesTitleSpan = body.querySelector('h2 > span[id=Objectives]');
  for (let node = objectivesTitleSpan && objectivesTitleSpan.parentNode; node; node = node.nextSibling) {
    // console.log(node.nodeName);
    if (node.nodeName.toLowerCase() === 'ul') {
      for (const objective of node.children) {
        let objectiveText = objective.textContent;
        // console.log(objectiveText);
        if (objectiveText) {
          let count = 1;
          let match = /Find\s+(\d+)\s/.exec(objectiveText);
          if (match) {
            count = +(match[1]);
          }
          else {
            match = /Find.+ in raid/.exec(objectiveText);
          }

          if (match) {
            // console.log(match[1]);
            let itemLink = objective.querySelector('a');
            if (itemLink) {
              let item = { kind: 'item', count: count, url: itemLink.href, name: itemLink.text.trim() };
              // console.log(item);
              objectivesInfo.push(item);
            }
          }
        }
      }
    }
  }
  questInfo.objectives = objectivesInfo;
  quests.push(questInfo);
}

// Quest Requirements/Objectives DOM Example
//<div class="mw-parser-output">
//  <!-- ... other stuff -->
//
//  <h2><span class="mw-headline" id="Requirements">Requirements</span></h2>
//  <ul><li>Must be level 18 to start this quest.</li></ul>
//  <h2><span class="mw-headline" id="Objectives">Objectives</span></h2>
//  <ul>
//    <li>Eliminate 12 <a href="/wiki/Scavs" title="Scavs">Scavs</a> on <a href="/wiki/Shoreline" title="Shoreline">Shoreline</a> while using a suppressed weapon</li>
//    <li>Find 7 <a href="/wiki/Lower_half-mask" title="Lower half-mask">Lower half-masks</a> <a href="/wiki/Found_in_raid" title="Found in raid"><font color="red">in raid</font></a></li>
//    <li>Hand over 7 <a href="/wiki/Lower_half-mask" title="Lower half-mask">Lower half-masks</a> to <a href="/wiki/Prapor" title="Prapor">Prapor</a></li>
//  </ul>
//
//  <!-- other stuff ... -->
//</div>
