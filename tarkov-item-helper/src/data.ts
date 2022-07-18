import * as fs from 'fs';
import * as path from 'path';
import { RawCraftOrTrade, RawItemReq, RawQuest, RawHideoutModule, RawHideoutLevelDetails,
         RawRequirement, RawHideoutReq, RawVendorReq, RawUnknownReq } from './types';
import { SettingsManager } from './user-settings';
import { Fail } from './util';

const RAW_DATA_DIR = path.join(__dirname, '../assets/raw-data');

const RAW_CRAFTS_FILENAME = path.join(RAW_DATA_DIR, 'crafts.json');
const RAW_TRADES_FILENAME = path.join(RAW_DATA_DIR, 'trades.json');
const RAW_QUESTS_FILENAME = path.join(RAW_DATA_DIR, 'quests.json');
const RAW_HIDEOUT_FILENAME = path.join(RAW_DATA_DIR, 'hideout.json');
const SHORT_NAMES_FILENAME = path.join(RAW_DATA_DIR, 'TestBackendLocaleEn.dat');
const ITEM_NAME_FIXES_FILE = path.join(RAW_DATA_DIR, 'name-fixes.json');

const COLLECTOR_QUEST_URL = 'https://escapefromtarkov.fandom.com/wiki/Collector';

// Specifies the PMC requirements for upgrading the vendors.
const VENDOR_PMC_LEVEL_REQS: { [name: string]: number[] } = {
  "Prapor": [ 1, 15, 26, 36 ],
  "Therapist": [ 1, 13, 24, 35 ],
  "Skier": [ 1, 15, 28, 38 ],
  "Peacekeeper": [ 1, 14, 23, 37 ],
  "Mechanic": [ 1, 20, 30, 40 ],
  "Ragman": [ 1, 17, 32, 42 ],
  "Jaeger": [ 2, 15, 22, 33 ],
  "Fence": [ 1, 1, 1, 1 ]
};

// Base class for objects to which the user may attach notes.
export abstract class Notable {
  private userNote?: string;

  constructor(protected category: string, protected id: string) {
    this.userNote = SettingsManager.get(settings => {
      let categories = settings.userNotes as { [categoryName: string]: { [id: string]: string } };
      return categories[category][id];
    });
  }

  getUserNote() {
    return this.userNote;
  }

  setUserNote(value?: string) {
    this.userNote = value;
    SettingsManager.set(settings => {
      let categories = settings.userNotes as { [categoryName: string]: { [id: string]: string } };
      if (value) {
        categories[this.category][this.id] = value;
      }
      else {
        delete(categories[this.category][this.id]);
      }
    });
  }
}

// Base class for items in the game.
export class Item extends Notable {
  // The full name of the item.
  name: string;
  // The url of the item's wiki page.
  url?: string;
  // The short name of the item as it appears on its icon in-game.
  rawShortName: string;
  // The items short name converted to lower case, without whitespace and punctuation.
  shortName: string;
  // Trades and crafts which take this item as an input.
  products: ItemExchange[] = [];
  // Trades and crafts which produce this item as an output.
  producers: ItemExchange[] = [];
  // Hideout module levels which require this item for construction.
  hideoutLevels: HideoutLevelDetails[] = [];
  // Quests which require this item as an objective.
  quests: Quest[] = [];

  static BY_LONG_NAME: { [name: string]: Item } = Item.createItems();
  static BY_URL: { [url: string]: Item } = {};

  private constructor(name: string, rawShortName: string) {
    super('item', name);
    this.name = name;
    this.rawShortName = rawShortName;
    this.shortName = rawShortName.replace(/\W/g, '').toLowerCase();
  }

  getRawShortName() {
    return this.rawShortName;
  }

  getExchanges() {
    return this.products.concat(this.producers);
  }

  // Only use during setup
  _addProduct(product: ItemExchange) {
    this.products.push(product);
    let outputItemProducers = product.getOutputItem().producers;
    if (outputItemProducers.indexOf(product) < 0) {
      outputItemProducers.push(product);
    }
  }

  // Only use during setup
  _addHideoutLevel(hideoutLevel: HideoutLevelDetails) {
    this.hideoutLevels.push(hideoutLevel);
  }

  // Only use during setup
  _addQuest(quest: Quest) {
    this.quests.push(quest);
  }

  static getAllItems(): Item[] {
    return Object.values(Item.BY_LONG_NAME);
  }

  // Returns a list of items whose short name matches, or begins with, the given string.
  static getItemsByShortName(shortName: string): Item[] {
    shortName = shortName.replace(/\W/g, '').toLowerCase();
    if (!shortName) {
      return [];
    }

    let exactMatches: Item[] = [];
    let prefixMatches: Item[] = [];
    for (const item of Item.getAllItems()) {
      if (item.shortName === shortName) {
        exactMatches.push(item);
      }
      else if (item.shortName.startsWith(shortName)) {
        prefixMatches.push(item);
      }
    }
    return exactMatches.length ? exactMatches : prefixMatches;
  }

  // Only use during setup
  static _getFromWikiReference(rawItemReq: RawItemReq) {
    let item = Item.BY_URL[rawItemReq.url];
    if (!item) {
      let name = Item.NAME_FIXES[rawItemReq.name] || rawItemReq.name;
      item = Item.BY_LONG_NAME[name];

      let doingUpdate = false; // Set to true when data needs updating due to game patch.
      if (doingUpdate && !item) {
        console.error(`Unknown item: '${name}'\t${rawItemReq.url}`);
        item = new Item(name, name);
      }

      Fail.unless(item, `Unknown item: ${name}`);
      item.url = rawItemReq.url;
      Item.BY_URL[rawItemReq.url] = item;
    }
    return item;
  }

  private static createItems() {
    let result: { [name: string]: Item } = {};
    let shortNamesData = JSON.parse(fs.readFileSync(SHORT_NAMES_FILENAME).toString());
    for (const itemId in shortNamesData.data.templates) {
      let itemTemplate = shortNamesData.data.templates[itemId];
      let rawShortName = itemTemplate.ShortName.toString();
      if (rawShortName && rawShortName !== 'Item') {
        result[itemTemplate.Name] = new Item(itemTemplate.Name, rawShortName);
      }
    }
    return result;
  }
 
  private static NAME_FIXES = JSON.parse(fs.readFileSync(ITEM_NAME_FIXES_FILE).toString());
}

// Interface for things that have a PMC level requirement.
interface RequiresPmcLevel {
  getRequiredPmcLevel(): number;
}

// Base class for things which can be 'completed' in the game, e.g. quests.
export abstract class Completable extends Notable implements RequiresPmcLevel {
  private completed: boolean;

  constructor(category: string, id: string) {
    super(category, id);
    this.completed = SettingsManager.get(settings => {
      let categories = settings.completed as { [categoryName: string]: { [id: string]: boolean } };
      return categories[category][id];
    });
  }

  isCompleted() {
    return !!this.completed;
  }

  setCompleted(value: boolean) {
    this.completed = value;
    SettingsManager.set(settings => {
      let categories = settings.completed as { [categoryName: string]: { [id: string]: boolean } };
      if (value) {
        categories[this.category][this.id] = true;
      }
      else {
        delete(categories[this.category][this.id]);
      }
    });
  }

  abstract getRequiredPmcLevel(): number;
}

// Represents a single loyalty level of a single vendor.
export class VendorLoyaltyLevel extends Completable {
  constructor(public vendor: Vendor, public level: number, public pmcLevelRequired: number) {
    super('vendor', `${vendor.name}:${level}`);
  }

  getDescription(): string {
    return `${this.vendor.name} LL${this.level}`;
  }

  getRequiredPmcLevel() {
    return this.pmcLevelRequired;
  }
}

// Represents a vendor in the game.
export class Vendor {
  loyaltyLevels: VendorLoyaltyLevel[];

  constructor(public name: string, rawLoyaltyLevels: number[]) {
    this.loyaltyLevels = rawLoyaltyLevels.map((pmcLevelReq, index) => new VendorLoyaltyLevel(this, index + 1, pmcLevelReq));
  }

  static getLoyaltyLevel(vendorName: string, level: number): VendorLoyaltyLevel {
    let vendor = Vendor.BY_NAME[vendorName];
    Fail.unless(vendor, `Unknown vendor "${vendorName}"`);

    let loyaltyLevel = vendor.loyaltyLevels[level - 1];
    Fail.unless(loyaltyLevel, `Loyalty level ${level} does not exist on vendor "${vendorName}"`);
    return loyaltyLevel;
  }

  static getAllLoyaltyLevels(): VendorLoyaltyLevel[] {
    let vendors = Object.values(Vendor.BY_NAME);
    let levels: VendorLoyaltyLevel[] = [];
    for (const vendor of vendors) {
      levels.push(...vendor.loyaltyLevels);
    }
    return levels;
  }

  static BY_NAME: { [vendorName: string]: Vendor } = Object.keys(VENDOR_PMC_LEVEL_REQS).reduce((result, name) =>
    {
      result[name] = new Vendor(name, VENDOR_PMC_LEVEL_REQS[name]);
      return result;
    },
    {} as { [vendorName: string]: Vendor }
  );
}

// Represents a craft or trade in the game.
export abstract class ItemExchange implements RequiresPmcLevel {
  constructor(protected rawCraftOrTrade: RawCraftOrTrade) {
    this.getOutputItem(); // to ensure item created
    for (const input of this.getInputItems()) {
      input._addProduct(this);
    }
  }

  abstract givesInRaid(): boolean;
  abstract getProviderDescription(): string;

  getKind(): string {
    return this.rawCraftOrTrade.provider.kind;
  }

  getInputItems(): Item[] {
    return this.rawCraftOrTrade.inputs.map(rawItemReq => Item._getFromWikiReference(rawItemReq));
  }

  getOutputItem(): Item {
    return Item._getFromWikiReference(this.rawCraftOrTrade.output);
  }

  getItemCount(item: Item) {
    if (item === this.getOutputItem()) {
      return this.rawCraftOrTrade.output.count;
    }
    return RequirementsHelper.getRequiredItemCount(item, this.rawCraftOrTrade.inputs);
  }

  isAvailable() {
    return this.getProvider().isCompleted();
  }

  abstract getRequiredPmcLevel(): number;
  abstract getProvider(): Completable;
}

// Represents an item craft in the game.
export class Craft extends ItemExchange {
  hideoutLevel: HideoutLevelDetails;

  constructor(rawCraft: RawCraftOrTrade) {
    super(rawCraft);
    let provider = rawCraft.provider;
    Fail.unless(provider.kind === 'craft', `Unexpected kind: ${provider.kind}`);

    let moduleName = (provider.module as string).toLowerCase();
    this.hideoutLevel = HideoutModule.getModuleLevel(moduleName, provider.level);
  }

  givesInRaid(): boolean {
    return true;
  }

  getRequiredPmcLevel(): number {
    return this.hideoutLevel.getRequiredPmcLevel();
  }

  getProvider() {
    return this.hideoutLevel;
  }

  getProviderDescription(): string {
    return this.hideoutLevel.getDescription();
  }
}

// Represents a barter trade in the game.
export class Trade extends ItemExchange {
  vendorLoyaltyLevel: VendorLoyaltyLevel;

  constructor(rawTrade: RawCraftOrTrade) {
    super(rawTrade);
    let provider = rawTrade.provider;
    Fail.unless(provider.kind === 'trade', `Unexpected kind: ${provider.kind}`);
    this.vendorLoyaltyLevel = Vendor.getLoyaltyLevel(provider.vendor || '<name missing>', provider.level);
  }

  givesInRaid(): boolean {
    return false;
  }

  getRequiredPmcLevel(): number {
    return this.vendorLoyaltyLevel.pmcLevelRequired;
  }

  getProvider() {
    return this.vendorLoyaltyLevel;
  }

  getProviderDescription(): string {
    return this.vendorLoyaltyLevel.getDescription();
  }
}

// An interface for things that require items for completion.
export interface RequiresItems extends RequiresPmcLevel {
  getKind(): number;
  getDescription(): string;
  getRequiredItems(): Item[];
  requiresInRaid(): boolean;
  getRequiredItemCount(item: Item): number;
  isCompleted(): boolean;
}

// Interface for an object which has a PMC level requirement and is a node in a DAG of similar
// objects, where nodes referred to by this one will have equal or higher requirement.
// (Specifically, the objects are Quests and Hideout module levels.)
interface PmcLevelReqGraphNode<T extends PmcLevelReqGraphNode<T>> extends RequiresPmcLevel {
  getDescription(): string;
  _setRequiredPmcLevel(pmcLevel: number): void;
  getSubsequentNodes(): T[];
  getPriorNodes(): T[];
}

// Helper function to get both direct and indirect prior nodes of a given PmcLevelReqGraphNode.
function getPriorNodesTransitive<T extends PmcLevelReqGraphNode<T>>(startNode: T, output: T[]) {
  let unseen = startNode.getPriorNodes().filter(node => !output.includes(node));
  output.push(...unseen);
  for (const newPriorNode of unseen) {
    getPriorNodesTransitive(newPriorNode, output);
  }
}

// Contains helper functions for processing requirements in their JSON form.
class RequirementsHelper {
  static getRequiredItems(rawRequirements?: RawRequirement[]): Item[] {
    let requiredItems: Item[] = [];
    if (rawRequirements) {
      for (const rawReq of rawRequirements) {
        if (rawReq.kind === 'item') {
          requiredItems.push(Item._getFromWikiReference(rawReq as RawItemReq));
        }
      }
    }
    return requiredItems;
  }

  // Helper function to find the requirement for the given item and return the amount required.
  static getRequiredItemCount(item: Item, requirements: RawRequirement[]) {
    let id = item.url;
    for (const requirement of requirements) {
      if (requirement.kind === 'item') {
        let itemRequirement = requirement as RawItemReq;
        if (itemRequirement.url === id) {
          return itemRequirement.count;
        }
      }
    }
    throw ("Item not found" + item.name);
  }

  static getAllRequirements(rawRequirements?: RawRequirement[]): [ string, any ][] {
    let requirements: [ string, any ][] = [];
    if (rawRequirements) {
      for (const rawReq of rawRequirements) {
        let reqDetails: any;
        if (rawReq.kind === 'item') {
          reqDetails = Item._getFromWikiReference(rawReq as RawItemReq);
        }
        else if (rawReq.kind === 'hideout') {
          let hideoutReq = rawReq as RawHideoutReq;
          reqDetails = HideoutModule.getModuleLevel(hideoutReq.name, hideoutReq.level);
        }
        else if (rawReq.kind === 'vendor') {
          let vendorReq = rawReq as RawVendorReq;
          reqDetails = Vendor.getLoyaltyLevel(vendorReq.name, vendorReq.level);
        }
        else {
          reqDetails = (rawReq as RawUnknownReq).text;
        }
        requirements.push([ rawReq.kind, reqDetails ]);
      }
    }
    return requirements;
  }
}

// Represents a quest in the game.
export class Quest extends Completable implements PmcLevelReqGraphNode<Quest> {
  static readonly KIND = 0;

  private priorQuests: Quest[] = [];
  private subsequentQuests: Quest[] = [];
  private requiredPmcLevel: number;

  constructor(private rawQuest: RawQuest) {
    super('quest', rawQuest.url);
    for (const requirement of this.getRequiredItems()) {
      requirement._addQuest(this);
    }
    this.requiredPmcLevel = rawQuest.requiredLevel || 1;
    if (rawQuest.url === COLLECTOR_QUEST_URL && !rawQuest.requiredLevel) {
      // Special case, wiki doesn't list a requirement for this but it actually has a high one.
      this.requiredPmcLevel = 62;
    }
    Quest.QUESTS_BY_URL[rawQuest.url] = this;
  }

  getKind(): number {
    return Quest.KIND;
  }

  getVendorName() {
    return this.rawQuest.vendor;
  }

  getName() {
    return this.rawQuest.name;
  }

  getDescription(): string {
    return this.rawQuest.name;
  }

  getUrl(): string{
    return this.rawQuest.url;
  }

  getRequiredItems(): Item[] {
    return RequirementsHelper.getRequiredItems(this.rawQuest.objectives);
  }

  getAllRequirements(): [ string, any ][] {
    return RequirementsHelper.getAllRequirements(this.rawQuest.objectives);
  }

  requiresInRaid() {
    return true;
  }

  getRequiredItemCount(item: Item): number {
    return RequirementsHelper.getRequiredItemCount(item, this.rawQuest.objectives);
  }

  getRequiredPmcLevel() {
    return this.requiredPmcLevel;
  }

  // Only use during setup
  _setRequiredPmcLevel(pmcLevel: number) {
    this.requiredPmcLevel = pmcLevel;
  }

  getPriorNodes(): Quest[] {
    return this.getPriorQuests();
  }

  getPriorNodesTransitive() {
    let output: Quest[] = [];
    getPriorNodesTransitive(this, output);
    return output;
  }

  getSubsequentNodes(): Quest[] {
    return this.getSubsequentQuests();
  }

  getPriorQuests() {
    return this.priorQuests;
  }

  getSubsequentQuests() {
    return this.subsequentQuests;
  }

  // Only use during setup
  _setupQuestConnections() {
    let previousQuests = this.rawQuest.previousQuests;
    if (previousQuests) {
      for (const previous of previousQuests) {
        let prevQuest = Quest.QUESTS_BY_URL[previous.url];
        if (!prevQuest) {
          console.warn('!!! Unknown quest: ' + previous.url);
        }
        else {
          this.priorQuests.push(prevQuest);
          prevQuest.subsequentQuests.push(this);
        }
      }
    }
  }

  static QUESTS_BY_URL: { [url: string]: Quest } = {};
}

// Represents a single level of a hideout module.
export class HideoutLevelDetails extends Completable implements PmcLevelReqGraphNode<HideoutLevelDetails> {
  static readonly KIND = 1;

  // Hideout module levels which must be built before this one can be built.
  private priorModLvls: HideoutLevelDetails[] = [];
  // Hideout module levels which cannot be built until this one is.
  private subsequentModLvls: HideoutLevelDetails[] = [];
  // The PMC level required to build this level, computed from its various requirements.
  private requiredPmcLevel: number = 1;

  constructor(private rawHideoutLevelDetails: RawHideoutLevelDetails, public module: HideoutModule, public level: number) {
    super('hideout', module.getName().toLowerCase() + ':' + level);
    for (const requirement of this.getRequiredItems()) {
      requirement._addHideoutLevel(this);
    }
  }

  getKind(): number {
    return HideoutLevelDetails.KIND;
  }

  getDescription(): string {
    return `Hideout ${this.module.getName()} level ${this.level}`;
  }

  getRequiredItems(): Item[] {
    return RequirementsHelper.getRequiredItems(this.rawHideoutLevelDetails.requirements);
  }

  getAllRequirements(): [ string, any ][] {
    return RequirementsHelper.getAllRequirements(this.rawHideoutLevelDetails.requirements);
  }

  requiresInRaid() {
    return false;
  }

  getRequiredItemCount(item: Item): number {
    return RequirementsHelper.getRequiredItemCount(item, this.rawHideoutLevelDetails.requirements || []);
  }

  getRequiredPmcLevel() {
    return this.requiredPmcLevel;
  }

  _setRequiredPmcLevel(pmcLevel: number) {
    this.requiredPmcLevel = pmcLevel;
  }

  getPriorNodes(): HideoutLevelDetails[] {
    return this.priorModLvls;
  }

  getPriorNodesTransitive() {
    let output: HideoutLevelDetails[] = [];
    getPriorNodesTransitive(this, output);
    return output;
  }

  getSubsequentNodes(): HideoutLevelDetails[] {
    return this.subsequentModLvls;
  }

  // Only use during setup
  _setupModuleConnections(prevModLvl?: HideoutLevelDetails) {
    if (prevModLvl) {
      this.priorModLvls.push(prevModLvl);
      prevModLvl.subsequentModLvls.push(this);
    }

    if (this.rawHideoutLevelDetails.requirements) {
      for (const rawReq of this.rawHideoutLevelDetails.requirements) {
        if (rawReq.kind === 'hideout') {
          // Record the fact that we depend on another module
          let rawHideoutReq = rawReq as RawHideoutReq;
          let priorModLvl = HideoutModule.getModuleLevel(rawHideoutReq.name, rawHideoutReq.level);
          this.priorModLvls.push(priorModLvl);
          priorModLvl.subsequentModLvls.push(this);
        }
        else if (rawReq.kind === 'vendor') {
          // Also set up vendor loyalty level reqs.
          let rawVendorReq = rawReq as RawVendorReq;
          let vendorLoyaltyLevel = Vendor.getLoyaltyLevel(rawVendorReq.name, rawVendorReq.level);
          this.requiredPmcLevel = Math.max(this.requiredPmcLevel, vendorLoyaltyLevel.pmcLevelRequired);
        }
      }
    }
  }
}

// Represents a module in the hideout.
export class HideoutModule {
  private levelDetails: HideoutLevelDetails[];

  constructor(private rawHideoutModule: RawHideoutModule) {
    this.levelDetails = [];
    let levels = rawHideoutModule.levels
    for (let i = 0; i < levels.length; ++i) {
      this.levelDetails.push(new HideoutLevelDetails(levels[i], this, (i + 1)));
    }

    HideoutModule.MODULES_BY_NAME[this.getName().toLowerCase()] = this;
  }

  getName() {
    return this.rawHideoutModule.name;
  }

  getLevelDetails() {
    return this.levelDetails;
  }

  private static MODULES_BY_NAME: { [name: string]: HideoutModule } = {};

  static getByName(name: string) {
    return HideoutModule.MODULES_BY_NAME[name.toLowerCase()];
  }

  static getAll(): HideoutModule[] {
    return Object.values(HideoutModule.MODULES_BY_NAME);
  }

  static getAllLevels(): HideoutLevelDetails[] {
    let levels: HideoutLevelDetails[] = [];
    for (const module of HideoutModule.getAll()) {
      levels.push(...module.getLevelDetails());
    }
    return levels;
  }

  static getModuleLevel(moduleName: string, level: number) {
    let module = HideoutModule.getByName(moduleName);
    Fail.unless(module, `Unknown hideout module: ${moduleName}`);

    let moduleLevel = module.getLevelDetails()[level - 1];
    Fail.unless(moduleLevel, `Unknown hideout module level: ${moduleName} ${level}`);
    return moduleLevel;
  }
}

// Represents one step in a sequence of trades and crafts required to produce a desired item.
export class TrailSegment {
  constructor(public item: Item, public countIn: number, public countOut: number, public exchange?: ItemExchange) {
    // console.log('new segment: ' + item.name + ' x' + countIn + '->x' + countOut);
  }

  static fromExchange(exchange: ItemExchange, inputItem: Item) {
    const inputCount = exchange.getItemCount(inputItem);
    const outputItem = exchange.getOutputItem();
    const outputCount = exchange.getItemCount(outputItem);
    return new TrailSegment(outputItem, inputCount, outputCount, exchange);
  }

  getExchangeCount(): number {
    let exchange = this.exchange;
    return exchange ? Math.ceil(this.countOut / exchange.getItemCount(exchange.getOutputItem())) : 0;
  }
}

// Represents a use, possibly indirect via crafts/trades, for an item in constructing a hideout module
// level or fulfilling a quest objective.
export class Purpose {
  constructor(public trail: TrailSegment[], public target: RequiresItems) {
    // Compute total numbers of items required.
    let index = trail.length - 1;
    let neededCount = target.getRequiredItemCount(trail[index].item);
    for (; index >= 0; --index) {
      let segment = trail[index];
      let exchangeCount = Math.ceil(neededCount / segment.countOut);
      let adjustedCountIn = segment.countIn * exchangeCount;
      trail[index] = new TrailSegment(segment.item, adjustedCountIn, neededCount, segment.exchange);
      neededCount = adjustedCountIn;
    }
  }

  getRequiredPmcLevel(): number {
    let reqLevel = 1;
    for (const segment of this.trail) {
      if (segment.exchange) {
        reqLevel = Math.max(reqLevel, segment.exchange.getRequiredPmcLevel());
      }
    }
    return Math.max(reqLevel, this.target.getRequiredPmcLevel());
  }

  getAllInputs(): Map<Item, number> {
    let inputs = new Map<Item, number>();
    let startSegment = this.trail[0];
    inputs.set(startSegment.item, startSegment.countOut);

    let outputItem = startSegment.item;
    for (const segment of this.trail.slice(1)) {
      let exchange = segment.exchange as ItemExchange;
      let exchangeCount = segment.getExchangeCount();
      for (const inputItem of exchange.getInputItems()) {
        if (inputItem !== outputItem) {
          let currentAmount = inputs.get(inputItem) || 0;
          let inputCount = exchange.getItemCount(inputItem) * exchangeCount;
          inputs.set(inputItem, (currentAmount + inputCount));
        }
      }
      outputItem = segment.item;
    }
    return inputs;
  }

  static getPurposesForItem(item: Item) {
    let results: Purpose[] = [];
    let seen = new Set<object>([item]);
    doPurposeStep(item, true, [ new TrailSegment(item, 0, 1) ]);
    return results.sort(pmcLevelComparator);

    function doPurposeStep(stepItem: Item, isInRaid: boolean, trail: TrailSegment[]) {
      if (isInRaid) {
        for (const quest of stepItem.quests) {
          if (!seen.has(quest)) {
            seen.add(quest);
            results.push(new Purpose([...trail], quest));
          }
        }
      }

      for (const hideoutLevel of stepItem.hideoutLevels) {
        if (!seen.has(hideoutLevel)) {
          seen.add(hideoutLevel);
          results.push(new Purpose([...trail], hideoutLevel));
        }
      }

      for (const product of stepItem.products) {
        let nextItem = product.getOutputItem();
        if (!seen.has(nextItem)) {
          seen.add(nextItem);
          doPurposeStep(nextItem, product.givesInRaid(), [...trail, TrailSegment.fromExchange(product, stepItem)]);
        }
      }
    }
  }
}

export function pmcLevelComparator(a: RequiresPmcLevel, b: RequiresPmcLevel): number {
  return a.getRequiredPmcLevel() - b.getRequiredPmcLevel();
}

// Helper function that traverses a graph of PMC level dependencies to compute the minimum PMC
// level required at each node.
function traversePmcLevelRequirementsGraph<T extends PmcLevelReqGraphNode<T>>(nodes: T[]) {
  let sortedNodes = [...nodes].sort(pmcLevelComparator);
  let workingStack: T[] = [];
  while (sortedNodes.length || workingStack.length) {
    let node = (workingStack.length ? workingStack.pop() : sortedNodes.pop()) as T;
    for (const subsequentNode of node.getSubsequentNodes()) {
      if (subsequentNode.getRequiredPmcLevel() < node.getRequiredPmcLevel()) {
        // The 'subsequentNode' requires 'node' to be done first, so adjust its level to be that
        // of 'node', and move it from sortedNodes to workingStack.
        subsequentNode._setRequiredPmcLevel(node.getRequiredPmcLevel());
        sortedNodes.splice(sortedNodes.indexOf(subsequentNode), 1);
        workingStack.push(subsequentNode);
      }
    }
  }
}

// Only use during setup
function computeQuestPmcLevels(quests: Quest[]) {
  // Set up quest pre-requisite references.
  for (const quest of quests) {
    quest._setupQuestConnections();
  }

  traversePmcLevelRequirementsGraph(quests);
}

// Only use during setup
function computeHideoutPmcLevels(hideoutModules: HideoutModule[]) {
  // Set up hideout module level pre-reqs.
  let allModLvls: HideoutLevelDetails[] = [];
  for (const module of hideoutModules) {
    let prevModLvl;
    for (const modLvl of module.getLevelDetails()) {
      modLvl._setupModuleConnections(prevModLvl);
      allModLvls.push(modLvl);
      prevModLvl = modLvl;
    }
  }
  traversePmcLevelRequirementsGraph(allModLvls);
}

function doSetup() {
  let rawTrades = JSON.parse(fs.readFileSync(RAW_TRADES_FILENAME).toString()) as RawCraftOrTrade[];
  rawTrades.map(rawTrade => new Trade(rawTrade));
  
  let rawQuests = JSON.parse(fs.readFileSync(RAW_QUESTS_FILENAME).toString()) as RawQuest[];
  let quests = rawQuests.map(rawQuest => new Quest(rawQuest));
  
  let rawHideoutModules = JSON.parse(fs.readFileSync(RAW_HIDEOUT_FILENAME).toString()) as RawHideoutModule[];
  let hideoutModules = rawHideoutModules.map(rawHideoutModule => new HideoutModule(rawHideoutModule));
  
  let rawCrafts = JSON.parse(fs.readFileSync(RAW_CRAFTS_FILENAME).toString()) as RawCraftOrTrade[];
  rawCrafts.map(rawCraft => new Craft(rawCraft));

  computeQuestPmcLevels(quests);
  computeHideoutPmcLevels(hideoutModules);
}
doSetup();
