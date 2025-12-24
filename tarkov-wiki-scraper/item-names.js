import * as fs from 'fs';
import * as common from './common.js';

console.log('start');

const ITEM_NAMES_FILE = common.OUTPUT_DIR + '/item-names.json';

const localeFile = process.argv[2];

const MISSING_NAMES = [
  { Name: 'Decrypted Sliderkey flash drive marked with A.P.', ShortName: 'USB A.P. d.' },
  { Name: 'Reprogrammed keycard for A.P.\'s apartment lock (Green)', ShortName: 'A.P. Green' },
  { Name: 'Reprogrammed keycard for A.P.\'s apartment lock (Blue)', ShortName: 'A.P. Blue' },
  { Name: 'Reprogrammed keycard for A.P.\'s apartment lock (Red)', ShortName: 'A.P. Red' },
  { Name: 'Station 14-4 KORD Arshavin K. pass (Restored)', ShortName: '14-4 rst.' },
  { Name: 'Station 14-4 KORD Arshavin K. pass (Damaged)', ShortName: '14-4 dmg.' },
  { Name: '.308 ME ammo pack (20 pcs)', ShortName: 'ME' },
  { Name: 'Audio recorder', ShortName: 'Rec.' },
  { Name: 'Elektronik\'s key', ShortName: 'Elektronik' }
];

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

  // Add names present in game but missing from the source file
  for (const [index, value] of MISSING_NAMES.entries()) {
    const fakeId = 'FAKE_ID__' + index;
    result[fakeId] = value;
  }

  if (!fs.existsSync(common.OUTPUT_DIR)){
      fs.mkdirSync(common.OUTPUT_DIR);
  }
  fs.writeFileSync(ITEM_NAMES_FILE, JSON.stringify({ data: { templates: result } }));

  console.log('finished');
}
