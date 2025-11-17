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
  let linesIterator = common.makeLineIterator(hideoutText);
  let modulesSection = common.findLine(linesIterator, /==Modules==/);
  console.log('modulesSection = ' + modulesSection);

  let hideoutModules = [];
  while (common.findLine(linesIterator, common.WIKI_TABLE_BEGIN_REGEX, common.HEADING_REGEX)) {
    let table = common.readWikiTable(linesIterator);
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

    //TODO what do we use id for, can we remove it? same for the 'url' attribute on some things.
    hideoutModules.push({ id: moduleName, name: moduleName, levels: levelsInfo });
  }

  if (!fs.existsSync(common.OUTPUT_DIR)){
      fs.mkdirSync(common.OUTPUT_DIR);
  }
  fs.writeFileSync(HIDEOUT_FILE, JSON.stringify(hideoutModules));

  console.log('finished');
});

function processHideoutModuleLevel(moduleTableRow) {
  // console.log(moduleTableRow);
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
