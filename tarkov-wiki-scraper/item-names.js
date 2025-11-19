import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as common from './common.js';

console.log('start');

const ITEM_NAMES_FILE = common.OUTPUT_DIR + '/item-names.json';

const localeFile = process.argv[2];

createItemNamesFile();

function createItemNamesFile() {
  const localeText = fs.readFileSync(localeFile);
  const localeData = JSON.parse(localeText).data;

  let result = {};
  for (const [key, value] of Object.entries(localeData)) {
    const itemMatch = /^(.+) Name$/.exec(key);
    if (itemMatch && value) {
      const id = itemMatch[1];
      const shortName = localeData[id + ' ShortName'];
      if (shortName) {
        let item = { Name: value, ShortName: shortName };

        //ajw could show this in long-form output for items
        // const description = localeData[id + ' Description'];
        // if (description) {
        //   item.Description = description;
        // }
  
        result[id] = item;
      }
    }
  }

  if (!fs.existsSync(common.OUTPUT_DIR)){
      fs.mkdirSync(common.OUTPUT_DIR);
  }
  fs.writeFileSync(ITEM_NAMES_FILE, JSON.stringify({ data: { templates: result } }));

  console.log('finished');
}
