import { JSDOM } from 'jsdom';
import * as fs from 'fs';

console.log('start');

const OUTPUT_DIR = './output';

const HIDEOUT_FILE = OUTPUT_DIR + '/hideout.json';

let hideoutModules = [];

JSDOM.fromURL('https://escapefromtarkov.fandom.com/wiki/Hideout').then(async hideoutPage => {
  //console.log(hideoutPage.window.document.body.getAttribute('class'));
  let body = hideoutPage.window.document.body;
  let moduleSelectors = body.querySelectorAll('div.dealer-toggle');

  // For each hideout module, extract info from its table.
  for (const moduleSelector of moduleSelectors) {
    let moduleId = moduleSelector.getAttribute('data-dealer');
    let moduleName = moduleSelector.getAttribute('title');
    let table = body.querySelector('table.' + moduleId + '-content');
    processHideoutTable(moduleId, moduleName, table);
  }
  // let ajwHideoutModule = 'Medstation';
  // let table = body.querySelector('table.' + ajwHideoutModule + '-content');
  // processHideoutTable(ajwHideoutModule, table);

  if (!fs.existsSync(OUTPUT_DIR)){
      fs.mkdirSync(OUTPUT_DIR);
  }
  fs.writeFileSync(HIDEOUT_FILE, JSON.stringify(hideoutModules));

  console.log('finished');
});

function processHideoutTable(moduleId, moduleName, table) {
  // Get the <tr> elements within the table's <tbody>
  let rows = table.firstElementChild.children;
  let levelsInfo = [];

  // skip first two rows, which are table headers
  for (let i = 2; i < rows.length; ++i) {
  //ajw for (let i = 28; i < 29; ++i) {
    let row = rows[i];
    let cell = row.firstElementChild;
    // First cell is the module level this row is about.  We know this from
    // our loop counter anyway.
    //let level = +(cell.textContent);

    // 2nd cell contains list of requirements.
    cell = cell.nextElementSibling;
    let reqList = cell.firstElementChild;
    if (reqList.nodeName.toLowerCase() !== 'ul') {
      console.warn('unexpected element type: ' + reqList.nodeName);
    }
    let parsedRequirements = [];
    for (const requirement of reqList.children) {
      parsedRequirements.push(parseRequirement(requirement));
    }
    levelsInfo.push({ requirements: parsedRequirements });
  }
  hideoutModules.push({ id: moduleId, name: moduleName, levels: levelsInfo });
}

function parseRequirement(reqNode) {
  let reqText = reqNode.textContent.trim();
  let link = reqNode.querySelector('a');
  let match = /^\w+\s+LL(\d)$/.exec(reqText);
  if (match && link) {
    // Vendor requirement
    return { kind: 'vendor', name: link.text, url: link.href, level: +(match[1])};
  }

  match = /^Level\s+(\d)\s+\w+/.exec(reqText);
  if (match && link) {
    // Hideout requirement
    return { kind: 'hideout', name: link.text, url: link.href, level: +(match[1])};
  }

  match = /^(\d+)\s+\S+/.exec(reqText);
  if (match && link) {
    // Item requirement
    return { kind: 'item', name: link.text, url: link.href, count: +(match[1])};
  }

  return { kind: 'unknown', text: reqText };
}

// Hideout Module DOM Example
//<tr>
//  <th>3</th>
//  <td>
//    <ul>
//      <li>1 <a href="/wiki/Ratchet_wrench" title="Ratchet wrench">Ratchet wrench</a></li>
//      <li>20,000 Roubles</li>
//      <li>2 <a href="/wiki/Pliers_Elite" title="Pliers Elite">Pliers Elite</a></li>
//      <li>5 <a href="/wiki/Shustrilo_sealing_foam" title="Shustrilo sealing foam">Shustrilo sealing foam</a></li>
//      <li><a href="/wiki/Jaeger" title="Jaeger">Jaeger</a> LL3</li>
//      <li>Level 3 <a href="/wiki/Hideout#Generator" title="Hideout">Generator</a></li>
//      <li>Level 3 <a href="/wiki/Hideout#Heating" title="Hideout">Heating</a></li>
//    </ul>
//  </td>
//  <td>
//    <ul>
//      <li>Produce <a href="/wiki/Purified_water" title="Purified water">Purified water</a></li>
//      <li>Hydration regeneration rate <font color="green">+19 WP/hr</font> (37 WP/hr in total)</li>
//    </ul>
//  </td>
//  <td>16 Hours</td>
//</tr>
