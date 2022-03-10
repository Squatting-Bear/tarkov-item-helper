  // skip first two rows, which are table headers
import { JSDOM } from 'jsdom';
import * as fs from 'fs';

console.log('start');

const OUTPUT_DIR = './output';

const CRAFTS_FILE = OUTPUT_DIR + '/crafts.json';
const TRADES_FILE = OUTPUT_DIR + '/trades.json';

const CRAFT_SPECIFIC_STUFF = {
  providerParser: craftProviderParser,
  outputItemsParser: processItemsList,
};

const TRADE_SPECIFIC_STUFF = {
  providerParser: tradeProviderParser,
  outputItemsParser: processSingleItem,
};

if (!fs.existsSync(OUTPUT_DIR)){
  fs.mkdirSync(OUTPUT_DIR);
}

JSDOM.fromURL('https://escapefromtarkov.fandom.com/wiki/Crafts').then(async craftsPage => {
  //console.log(craftsPage.window.document.body.getAttribute('class'));
  let crafts = processCraftsOrTradesPage(craftsPage, CRAFT_SPECIFIC_STUFF);
  fs.writeFileSync(CRAFTS_FILE, JSON.stringify(crafts));
  console.log('finished crafts');
});

JSDOM.fromURL('https://escapefromtarkov.fandom.com/wiki/Barter_trades').then(async tradesPage => {
  //console.log(craftsPage.window.document.body.getAttribute('class'));
  let trades = processCraftsOrTradesPage(tradesPage, TRADE_SPECIFIC_STUFF);
  fs.writeFileSync(TRADES_FILE, JSON.stringify(trades));
  console.log('finished trades');
});

function processCraftsOrTradesPage(page, specificStuff) {
  let result = [];
  let body = page.window.document.body;
  let tables = body.querySelectorAll('div#content div.mw-parser-output table.wikitable.mw-collapsible > tbody');
  for (const table of tables) {
    // Get the <tr> elements within the <tbody>
    let rows = table.children;
  
    // skip first row, which is table header
    for (let i = 1; i < rows.length; ++i) {
    //ajw for (let i = 28; i < 29; ++i) {
      result.push(processCraftOrTradeRow(rows[i], specificStuff));
    }
  }
  return result;
}

function processCraftOrTradeRow(row, specificStuff) {
  // console.log('processCraftRow');
  // First <th> element in row is inputs
  let inputs = row.firstElementChild;
  let parsedInputs = processItemsList(inputs);

  // Next <th> element is a separator, the one after that specifies the hideout module which
  // performs the craft.
  let providerCell = inputs.nextElementSibling.nextElementSibling;
  checkNodeName(providerCell, 'th');
  let parsedProvider = specificStuff.providerParser(providerCell);

  // Next <th> element is a separator, the one after that gives the output of the craft.
  let outputCell = providerCell.nextElementSibling.nextElementSibling;
  let parsedOutput = specificStuff.outputItemsParser(outputCell);
  if (parsedOutput.length !== 1) throw "Wrong number of outputs";

  return { inputs: parsedInputs, provider: parsedProvider, output: parsedOutput[0] };
}

function processItemsList(itemsList) {
  checkNodeName(itemsList, 'th');
  let parsedItems = [];
  let itemChildren = itemsList.childNodes;

  for (let i = 0; i < itemChildren.length; ++i) {
    // Each input has (among other things) an 'xN' text where N is number
    // required, followed by link to item's wiki page.
    let itemChild = itemChildren[i];
    // console.log('itemChild: ' + itemChild.nodeType + ':' + itemChild);
    if (itemChild.nodeType === 3) { //TEXT_NODE
      // console.log('text: ' + itemChild.textContent);
      let match = /\s*x(\d+)\s*/.exec(itemChild.textContent);
      if (match) {
        // Text should be followed by <br> element then the <a> we want.
        do {
          itemChild = itemChild.nextSibling;
        } while (itemChild && itemChild.nodeName.toLowerCase() !== 'a');
        checkNodeName(itemChild, 'a');
        parsedItems.push({ kind: 'item', count: +(match[1]), url: itemChild.href, name: itemChild.text.trim() });
        // console.log('item: ' + itemChild.text);
      }
    }
  }
  return parsedItems;
}

function processSingleItem(itemCell) {
  checkNodeName(itemCell, 'th');
  let itemLinks = itemCell.querySelectorAll('a');
  if (itemLinks.length < 2) throw "Not enough links in output cell";
  let itemLink = itemLinks[1];
  return [{ kind: 'item', count: 1, url: itemLink.href, name: itemLink.text.trim() }];
}

function craftProviderParser(providerCell) {
  let hideoutLink = providerCell.querySelector('a');
  let hideoutText = hideoutLink.text;
  let hideoutMatch = /(.*)\slevel\s+(\d+)/.exec(hideoutText);
  if (!hideoutMatch) throw "Hideout text did not match";
  return { kind: 'craft', module: (hideoutMatch[1]).trim(), level: +(hideoutMatch[2]) }
}

function tradeProviderParser(providerCell) {
  let vendorLinks = providerCell.querySelectorAll('a');
  if (vendorLinks.length < 2) throw "Not enough links in vendor cell";
  let vendorLink = vendorLinks[1];
  let vendorText = vendorLink.text;
  let vendorMatch = /(.*)\sLL(\d)/.exec(vendorText);
  if (!vendorMatch) throw "Vendor text did not match";
  return { kind: 'trade', vendor: (vendorMatch[1]).trim(), level: +(vendorMatch[2]) }
}

function checkNodeName(node, name) {
  if (!node) throw ("Missing node: " + name);
  if (node.nodeName.toLowerCase() !== name.toLowerCase()) throw ("Unexpected node: " + node.nodeName);
}

// Craft DOM Example
//<tr>
//  <th style="width:Auto;">Needed items</th><th colspan="3" style="width:Auto;">Module and time</th><th style="width:Auto;">Produced items</th></tr><tr>
//  <th><a href="/wiki/Pack_of_sugar" title="Pack of sugar"><img alt="Sugar icon.png" src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/a/a8/Sugar_icon.png/revision/latest/scale-to-width-down/64?cb=20220120110613" decoding="async" data-image-name="Sugar icon.png" data-image-key="Sugar_icon.png" width="64" height="64"></a> x2<br><a href="/wiki/Pack_of_sugar" title="Pack of sugar">Pack of sugar</a><br>+<br><a href="/wiki/Purified_water" title="Purified water"><img alt="Purified water icon.png" src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/2/2b/Purified_water_icon.png/revision/latest/scale-to-width-down/127?cb=20191109111053" decoding="async" data-image-name="Purified water icon.png" data-image-key="Purified_water_icon.png" width="127" height="127"></a> x1<br><a href="/wiki/Purified_water" title="Purified water">Purified water</a></th>
//  <th><big>→</big></th>
//  <th><big><a href="/wiki/Hideout#Modules" title="Hideout">Booze generator level 1</a></big><br>3 h 3 min 20 sec</th>
//  <th><big>→</big></th>
//  <th><a href="/wiki/%22Fierce_Hatchling%22_moonshine" title="&quot;Fierce Hatchling&quot; moonshine"><img alt="Fiece hatchling moonshine icon.png" src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/a/ad/Fiece_hatchling_moonshine_icon.png/revision/latest/scale-to-width-down/64?cb=20201015201315" decoding="async" data-image-name="Fiece hatchling moonshine icon.png" data-image-key="Fiece_hatchling_moonshine_icon.png" width="64" height="127"></a> x1<br><a href="/wiki/%22Fierce_Hatchling%22_moonshine" title="&quot;Fierce Hatchling&quot; moonshine">"Fierce Hatchling" moonshine</a></th>
//</tr>

// Trade DOM Example
//<tr>
//  <th><a href="/wiki/Horse_figurine" title="Horse figurine"><img alt="Horse figurine Icon.png" src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/2/27/Horse_figurine_Icon.png/revision/latest/scale-to-width-down/64?cb=20211220222449" decoding="async" data-image-name="Horse figurine Icon.png" data-image-key="Horse_figurine_Icon.png" data-src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/2/27/Horse_figurine_Icon.png/revision/latest/scale-to-width-down/64?cb=20211220222449" class=" lazyloaded" width="64" height="127"></a> x2<br><a href="/wiki/Horse_figurine" title="Horse figurine">Horse figurine</a><br>+<br><a href="/wiki/Smoked_Chimney_drain_cleaner" title="Smoked Chimney drain cleaner"><img alt="Smokedchimneydraincleanericon.png" src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/5/54/Smokedchimneydraincleanericon.png/revision/latest/scale-to-width-down/64?cb=20200502000144" decoding="async" data-image-name="Smokedchimneydraincleanericon.png" data-image-key="Smokedchimneydraincleanericon.png" data-src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/5/54/Smokedchimneydraincleanericon.png/revision/latest/scale-to-width-down/64?cb=20200502000144" class=" lazyloaded" width="64" height="127"></a> x1<br><a href="/wiki/Smoked_Chimney_drain_cleaner" title="Smoked Chimney drain cleaner">Smoked Chimney drain cleaner</a></th>
//  <th><big>→</big></th>
//  <th><a href="/wiki/Prapor" title="Prapor"><img alt="Prapor 1 icon.png" src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/f/fc/Prapor_1_icon.png/revision/latest/scale-to-width-down/130?cb=20180822110125" decoding="async" data-image-name="Prapor 1 icon.png" data-image-key="Prapor_1_icon.png" data-src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/f/fc/Prapor_1_icon.png/revision/latest/scale-to-width-down/130?cb=20180822110125" class=" ls-is-cached lazyloaded" width="130" height="130"></a><br><a href="/wiki/Prapor" title="Prapor">Prapor LL1</a></th>
//  <th><big>→</big></th>
//  <th><a href="/wiki/AKS-74U_5.45x39_assault_rifle" title="AKS-74U 5.45x39 assault rifle"><img alt="AKS-74U icon.png" src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/8/89/AKS-74U_icon.png/revision/latest/scale-to-width-down/180?cb=20190313230111" decoding="async" data-image-name="AKS-74U icon.png" data-image-key="AKS-74U_icon.png" data-src="https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/8/89/AKS-74U_icon.png/revision/latest/scale-to-width-down/180?cb=20190313230111" class=" lazyloaded" width="180" height="90"></a><p><a href="/wiki/AKS-74U_5.45x39_assault_rifle" title="AKS-74U 5.45x39 assault rifle">AKS-74U 5.45x39 assault rifle</a></p></th>
//</tr>
