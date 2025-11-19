  // skip first two rows, which are table headers
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as common from './common.js';

console.log('start');

const CRAFT_SPECIFIC_STUFF = {
  pageTitle: 'Crafts',
  tableRowProcessor: processCraftRow,
  outputFilename: (common.OUTPUT_DIR + '/crafts.json'),
};

const TRADE_SPECIFIC_STUFF = {
  pageTitle: 'Barter trades',
  tableRowProcessor: processTradeRow,
  outputFilename: (common.OUTPUT_DIR + '/trades.json'),
};

if (!fs.existsSync(common.OUTPUT_DIR)){
  fs.mkdirSync(common.OUTPUT_DIR);
}

let wikiXmlFile = process.argv[2];

JSDOM.fromFile(wikiXmlFile, { contentType: "application/xml" }).then(async wikiXml => {
  let doc = wikiXml.window.document;
  processCraftsOrTradesPage(doc, CRAFT_SPECIFIC_STUFF);
  processCraftsOrTradesPage(doc, TRADE_SPECIFIC_STUFF);
});

function processCraftsOrTradesPage(doc, specificStuff) {
  let page = common.findPage(doc, specificStuff.pageTitle);
  console.log(specificStuff.pageTitle + ' page found = ' + (page != null));
  let pageText = common.getPageText(page);

  let result = [];
  let linesIterator = common.makeLineIterator(pageText);
  while (common.findLine(linesIterator, common.WIKI_TABLE_BEGIN_REGEX)) {
    let table = common.readWikiTable(linesIterator);
    let rowIterator = table.values();

    // Skip heading row
    rowIterator.next();

    for (const row of rowIterator) {
      const outputEntry = specificStuff.tableRowProcessor(row);
      if (outputEntry) {
        result.push(outputEntry);
      }
    }
  }

  fs.writeFileSync(specificStuff.outputFilename, JSON.stringify(result));
  console.log('finished writing ' + specificStuff.outputFilename);
}

const INPUT_ITEM_REGEX = /\[\[[^\]]+\]\]\s*(?:x(?<num>\d+)\s*)?\<br\/\>\s*[^\[\+]*\[\[(?<id>[^\|\]]*)\|?[^\]]*\]\]/g;

function readItemList(itemListText) {
  let inputs = [];
  for (let matchResult of itemListText.matchAll(INPUT_ITEM_REGEX)) {
    let itemCount = matchResult.groups.num ? +(matchResult.groups.num) : 1;
    let itemName = matchResult.groups.id.trim();
    inputs.push({ kind: 'item', count: itemCount, url: common.pageTitleToUrl(itemName), name: itemName });
  }
  return inputs;
}

function processCraftRow(tableRow) {
  // console.log(tableRow);
  let inputsText = tableRow[0][0];
  if (inputsText.startsWith(' colspan="5"')) {
    // No craft in this row, just an informational message
    return null;
  }

  let inputs = readItemList(inputsText);

  const HIDEOUT_MODULE_REGEX = /\[\[Hideout#Modules\|([^\]]+)\]\]/;
  let moduleNameAndMaybeLevel = HIDEOUT_MODULE_REGEX.exec(tableRow[2][0])[1];
  let levelMatch = /(.+)\s[Ll]evel\s+(\d+)\s*/.exec(moduleNameAndMaybeLevel);
  let level = levelMatch ? (+(levelMatch[2])) : 1;
  let moduleName = levelMatch ? levelMatch[1] : moduleNameAndMaybeLevel;
  let provider = { kind: 'craft', module: moduleName.trim(), level: level };

  let output = readItemList(tableRow[4][0])[0];
  let result = { inputs: inputs, provider: provider, output: output };

  // console.log(result);
  return result;
}

function processTradeRow(tableRow) {
  // console.log(tableRow);
  let inputsText = tableRow[0][0];
  if (!inputsText && tableRow.length == 1) {
    // Empty row, probably a formatting error by the page author.
    return null;
  }

  let inputs = readItemList(inputsText);

  const VENDOR_WITH_LL_REGEX = /\[\[[^\|]*\|([^\]]+) LL(\d+)\s*\]\]/;
  let vendorMatch = VENDOR_WITH_LL_REGEX.exec(tableRow[2][0]);
  let provider = { kind: 'trade', vendor: (vendorMatch[1]).trim(), level: +(vendorMatch[2]) };

  // The output cell contains an image link (then a text link, but that's redundant for us).
  const WIKI_IMAGE_LINK_REGEX = /[^\[]*\[\[.*\|link=([^\]]*)\]\]/;
  let outputItemName = WIKI_IMAGE_LINK_REGEX.exec(tableRow[4][0])[1];
  let output = { kind: 'item', count: 1, url: common.pageTitleToUrl(outputItemName), name: outputItemName };
  let result = { inputs: inputs, provider: provider, output: output };

  // console.log(result);
  return result;
}
