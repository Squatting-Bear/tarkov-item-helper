import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as common from './common.js';

console.log('start');

const HIDEOUT_FILE = common.OUTPUT_DIR + '/hideout.json';

let wikiXmlFile = process.argv[2];

JSDOM.fromFile(wikiXmlFile, { contentType: "application/xml" }).then(async wikiXml => {
  let doc = wikiXml.window.document;

  let hideoutPage = common.findPage(doc, 'Hideout');
  console.log('hideout page found = ' + (hideoutPage != null));

  let hideoutText = common.getPageText(hideoutPage);
  console.log('hideoutPage content = ' + hideoutText.substr(0, 60));

  let linesIterator = common.makeLineIterator(hideoutText);
  let modulesSection = common.findLine(linesIterator, /==Modules==/);
  console.log('modulesSection = ' + modulesSection);

  let hideoutModules = [];
  const wikiRowBeginMarkup = /^\{\|\s*class="wikitable"/;
  while (common.findLine(linesIterator, wikiRowBeginMarkup, common.HEADING_REGEX)) {
    let table = readWikiTable(linesIterator);
    let tableRows = table.values();

    // First row should contain a single cell with the module name in it.
    let moduleNameCell = tableRows.next().value[0];
    let moduleName = /[^\|]+\|\s*([^\<]+)/.exec(moduleNameCell[0])[1];
    console.log('reading table for module ' + moduleName);

    // Second row is headings.
    tableRows.next();

    // Each remaining row should describe one 'level' of the hideout module.  (Note that
    // the wiki authors also add an empty row at the end of the table for some reason.)
    let levelsInfo = [];
    for (const moduleLevel of tableRows) {
      if (moduleLevel.length >= 2) {
        let processedLevel = processHideoutModuleLevel(moduleLevel);
        levelsInfo.push(processedLevel);
      }
    }
    //ajw what do we use id for, can we remove it?
    hideoutModules.push({ id: moduleName, name: moduleName, levels: levelsInfo });
  }

  if (!fs.existsSync(common.OUTPUT_DIR)){
      fs.mkdirSync(common.OUTPUT_DIR);
  }
  fs.writeFileSync(HIDEOUT_FILE, JSON.stringify(hideoutModules));

  console.log('finished');
});

// Reads a wiki table into a triply nested array, i.e. returns an array of rows, where each row
// is an array of cells, where each cell is an array of strings (lines).
function readWikiTable(linesIterator) {
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

function processHideoutModuleLevel(moduleTableRow) {
  // console.log(moduleTableRow);
  //ajw maybe should assert this is what we expect
  let levelNumber = +(moduleTableRow[0][0]);

  let requirements = [];
  for (const requirementText of moduleTableRow[1]) {
    let match = /^\*\s(\[\[[^\]]+\]\])\s+LL(\d+)$/.exec(requirementText);
    if (match) {
      // Vendor requirement
      let name = common.extractWikiLink(match[1]);
      requirements.push({ kind: 'vendor', name: name, url: common.pageTitleToUrl(name), level: +(match[2])});
    }
    else if (match = /^\*\sLevel\s+(\d)\s+\[\[Hideout#Modules\|([^\]]+)\]\]/.exec(requirementText)) {
      // Hideout requirement
      //ajw modules don't have their own pages, so the 'url' isn't a url - can we get rid of this attrib?
      let reqModule = match[2];
      requirements.push({ kind: 'hideout', name: reqModule, url: ('hideout-module:' + reqModule), level: +(match[1])});
    }
    else if (match = /^\*\s(\d+)\s+(\[\[[^\]]+\]\])/.exec(requirementText)) {
      // Item requirement
      let item = common.extractWikiLink(match[2]);
      requirements.push({ kind: 'item', name: item, url: common.pageTitleToUrl(item), count: +(match[1])});
    }
    else if ((requirementText === 'Or') || /\* Owning /.test(requirementText)) {
      // Skip these; they're used when modules can be pre-unlocked by owning particular editions of the game.
    }
    else {
      requirements.push({ kind: 'unknown', text: requirementText });
    }
  }
  // console.log(requirements);

  return { level: levelNumber, requirements: requirements };
}
