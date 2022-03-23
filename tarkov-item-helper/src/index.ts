import { count } from 'console';
import * as readline from 'readline';
import { Item, Purpose, ItemExchange, Quest, HideoutLevelDetails, Craft, VendorLoyaltyLevel, Trade, Vendor,
         Notable, Completable, HideoutModule, pmcLevelComparator } from './data';
import { SettingsManager } from './user-settings';

// Represents one of the commands available to the user.
interface CommandInfo {
  name: string;
  handler: (args: string, context: CommandContext) => void;
  parameters: string;
  description: string;
}

// A list of the available commands.
const COMMANDS: CommandInfo[] = [
  {
    name: '',
    handler: handleDefault,
    parameters: '<number>|<string>|\'-\'',
    description: `Any command which does not begin with a / character is interpreted as a default command. If
      it is just a number, it is treated as a reference to a numbered line in the output of the previous
      command.  Otherwise, it is treated as an item "short name", and the uses of that item (both direct
      and indirect) for the purposes of quest objectives and hideout module construction are shown. Case,
      whitespace, and punctuation are ignored, e.g. "F Scdr." and "fscdr" are equivalent.
      As an example, entering "scdr" will list uses for the "Screwdriver" item, one per line with each
      line numbered.  If the next command is "2", the second use listed will be described in more
      detail.
      Entering just the '-' (hyphen) character will repeat the command prior to the one just executed.`
  },
  {
    name: '/help',
    handler: handleHelp,
    parameters: '',
    description: `Shows a list of available commands.`
  },
  {
    name: '/trim',
    handler: handleTrim,
    parameters: ' [number]',
    description: `Sets the PMC level at which requirements will be 'trimmed' (i.e. not shown in the output of
      most commands).  For example, if a quest can't be obtained until this level or higher, it will
      be excluded from results where it would otherwise appear.  The default trim is 15.
      If no number is given, the command shows the current trim level.`
  },
  {
    name: '/note',
    handler: handleNote,
    parameters: ' <number> <text>',
    description: `Attaches a note to the thing identified by the given number, which must refer to a
      numbered line in the previous command's output.  The note will be displayed whenever the
      thing it's attached to appears in the output.`
  },
  {
    name: '/complete',
    handler: handleComplete,
    parameters: ' <number>',
    description: `Marks as complete the thing identified by the given number, which must refer to a
      numbered line in the previous command's output.  Quests, hideout module levels, and vendor
      levels can be marked as complete.`
  },
  {
    name: '/find',
    handler: handleFindItems,
    parameters: ' <regex>',
    description: `Searches for items where the item's name contains the given regular expression.`
  },
  {
    name: '/findq',
    handler: handleFindQuests,
    parameters: ' <regex>',
    description: `Searches for quests where the quest name or the name of its vendor contains the
      given regular expression.`
  },
  {
    name: '/findh',
    handler: handleFindHideoutModules,
    parameters: ' <regex>',
    description: `Searches for hideout module levels where the module name contains the given
      regular expression.`
  },
  {
    name: '/findv',
    handler: handleFindVendorLevels,
    parameters: ' <regex>',
    description: `Searches for vendors whose name contains the given regular expression.`
  },
  {
    name: '/findnote',
    handler: handleFindNote,
    parameters: ' <regex>',
    description: `Searches for things with an attached note that contains the given regular expression.`
  },
  {
    name: '/all',
    handler: handleAll,
    parameters: ' <command>',
    description: `Executes the given command and displays all results (i.e. does not exclude results based on
      the trim level or facility completion status).  For example, '/all /findq prapor' will show all quests
      offered by Prapor, including those that have been marked completed and those which require a PMC level
      higher than the current trim setting.`
  }
];

// Context required when handling a command.
class CommandContext {
  numberedLines: NumberedThingWrapper[] = [];
  showAllResults?: boolean;
  elidedCount: number = 0;

  constructor(public commandText: string, public previous?: CommandContext, public addToHistory: boolean = true) {
  }

  // Adds a line of output, labelled with a number so it can be referred to by the next command.
  addNumberedLine(info: NumberedThingWrapper, ...extraLines: string[]): void {
    let shown = true;

    // Decide whether we should actually show this line or ignore it.
    if (!info.alwaysShow && !this.showAllResults) {
      let completed = info.isCompleted && info.isCompleted();
      let trimmed = info.getRequiredPmcLevel && (info.getRequiredPmcLevel() >= getTrimLevel());
      shown = !(completed || trimmed);
    }
    
    if (shown) {
      // Get the note, if any, the user has attached to this thing.
      let note = info.getNote && info.getNote();
      note = note ? (` [USER NOTE: ${note}]`) : '';

      // If the thing is completable, tell the user whether it's completed or, if not, what PMC
      // level is required before it can be completed.
      let status = '';
      if (info.isCompleted) {
        if (info.isCompleted()) {
          status = ' *completed';
        }
        else if (info.getRequiredPmcLevel) {
          status = ` *PMC${info.getRequiredPmcLevel()}`;
        }
      }

      this.numberedLines.push(info);
      let lineNumber = this.numberedLines.length;

      console.log(`${lineNumber}:\t${info.getSummary()}${status}${note}`);
  
      for (const extraLine of extraLines) {
        this.addSimpleLine(extraLine);
      }
    }
    else {
      ++this.elidedCount;
    }
  }

  // Adds a line of output without numbering it.
  addSimpleLine(line: string, lessIndent?: boolean) {
    let indent = lessIndent ? '\t' : '\t\t\t';
    console.log(`${indent}${line}`);
  }

  takeElidedCount() {
    let count = this.elidedCount;
    this.elidedCount = 0;
    return count;
  }

  // Head of a linked list of prior commands.
  static history?: CommandContext;
}

// Returns the current 'trim' level, the PMC level at which requirements are excluded.
function getTrimLevel(): number {
  return SettingsManager.get(settings => settings.pmcLevelTrim);
}

// Prints the details of the item, if any, identified by the given short name.
function printItemByShortName(shortName: string, context: CommandContext) {
  let items = Item.getItemsByShortName(shortName);
  if (items.length === 0) {
    context.addSimpleLine(`No items found with short name "${shortName}"`);
  }
  else if (items.length > 1) {
    context.addSimpleLine(`Ambiguous short name "${shortName}", could be:`);
    for (const item of items) {
      context.addNumberedLine(new ItemWrapper(item));
    }
  }
  else {
    new ItemWrapper(items[0]).printDetails(context);
  }
}

// Prints a list of the quest/hideout purposes for the given item.
function printPurposes(item: Item, context: CommandContext) {
  let purposes = Purpose.getPurposesForItem(item);
  if (purposes.length > 0) {
    context.addSimpleLine(`Quest and hideout purposes for this item:`);
  }

  for (const purpose of purposes) {
    context.addNumberedLine(new PurposeWrapper(purpose));
  }

  let trimCount = context.takeElidedCount();
  if (trimCount) {
    context.addSimpleLine(`(${trimCount} purposes were trimmed due to PMC level ` +
      'requirements or already being completed.)');
  }
}

// Interface representing a line of output that is labelled with a number so that it may be referred
// to in the next command.
interface NumberedThingWrapper {
  // Returns the text to be printed when this object is added to the command output.
  getSummary(): string;

  // Prints detailed information when this object's line is referenced by the subsequent command.
  printDetails(context: CommandContext): void;

  // If true, this object will always be output (otherwise, it may be ignored due to PMC level
  // requirements or completed objectives).
  alwaysShow?: boolean;

  // Optional implementation for wrapped items that can be annotated or completed.
  getNote?: () => string | undefined;
  setNote?: (note?: string) => void;
  isCompleted?: () => boolean;
  setCompleted?: (isCompleted: boolean) => void;
  getRequiredPmcLevel?: () => number;
}

// Base class for numbered lines that describe a Notable object.
abstract class NotableWrapper {
  protected constructor(private notable: Notable) {
  }

  getNote(): string | undefined {
    return this.notable.getUserNote();
  }

  setNote(note?: string) {
    this.notable.setUserNote(note);
  }
}

// Base class for numbered lines that describe a Completable object.
abstract class CompletableWrapper extends NotableWrapper {
  protected constructor(private completable: Completable) {
    super(completable);
  }

  isCompleted(): boolean {
    return this.completable.isCompleted();
  }

  setCompleted(isCompleted: boolean) {
    this.completable.setCompleted(isCompleted);
  }

  getRequiredPmcLevel(): number {
    return this.completable.getRequiredPmcLevel();
  }
}

// Class representing a numbered line describing an Item.
class ItemWrapper extends NotableWrapper implements NumberedThingWrapper {
  constructor(private item: Item, private count?: number) {
    super(item);
  }

  getSummary(): string {
    let summary = `"${this.item.name}" (${this.item.getRawShortName()})`;
    if (this.count) {
      summary += ` x${this.count}`;
    }
    return summary;
  }

  printDetails(context: CommandContext) {
    let item = this.item;
    context.addNumberedLine(new ItemWrapper(item));

    if (item.url) {
      context.addSimpleLine(`Wiki: ${item.url}`);
    }
    let exchanges = item.getExchanges();
    if (exchanges.length) {
      context.addSimpleLine('Trades and crafts involving this item:');
    }
    else {
      context.addSimpleLine('No known trades or crafts involve this item');
    }

    // Print trades and crafts where item is an input
    for (const product of exchanges.sort(pmcLevelComparator)) {
      context.addNumberedLine(new ExchangeWrapper(product, false));
    }
    let trimCount = context.takeElidedCount();
    if (trimCount) {
      context.addSimpleLine(`(${trimCount} trades and/or crafts were trimmed due to PMC level requirements)`);
    }

    // Print quests where item is an objective and hideout module levels where item is a requirement.
    printPurposes(item, context);
  }
}

// Class representing a numbered line describing an Exchange (i.e. craft or trade).
// todo: might want to add notes to these (e.g. is it profitable).  if so, first line of details
// should be self-reference (add 'useBriefSummary' arg to ctor).
class ExchangeWrapper implements NumberedThingWrapper {
  constructor(private exchange: ItemExchange, public alwaysShow: boolean) {
  }

  getRequiredPmcLevel() {
    return this.exchange.getRequiredPmcLevel();
  }

  getSummary(): string {
    let exchange = this.exchange;
    let pmcReq = this.exchange.isAvailable() ? '' : `*PMC${this.getRequiredPmcLevel()}\t`;
    let summary = `${pmcReq}${exchange.getKind().toUpperCase()} (`;
    let separator = '';
    for (const item of exchange.getInputItems()) {
      let itemCount = exchange.getItemCount(item);
      summary += `${separator}"${item.name}" x${itemCount}`;
      separator = ', ';
    }
    let provider = exchange.getProviderDescription();
    let outputItem = exchange.getOutputItem();
    summary += `) at ${provider} to get ("${outputItem.name}" x${exchange.getItemCount(outputItem)})`;
    return summary;
  }

  printDetails(context: CommandContext) {
    let exchange = this.exchange;
    context.addSimpleLine(exchange.getKind().toUpperCase());

    if (exchange.getKind() === 'craft') {
      let moduleLvl = (exchange as Craft).hideoutLevel;
      context.addNumberedLine(new HideoutLevelWrapper(moduleLvl, true));
    }
    else {
      let vendorLvl = (exchange as Trade).vendorLoyaltyLevel;
      context.addNumberedLine(new VendorLevelWrapper(vendorLvl));
    }
    context.addSimpleLine(`give:`);

    for (const item of exchange.getInputItems()) {
      let itemCount = exchange.getItemCount(item);
      context.addNumberedLine(new ItemWrapper(item, itemCount));
    }

    context.addSimpleLine(`to get:`);
    let outputItem = exchange.getOutputItem();
    context.addNumberedLine(new ItemWrapper(outputItem, exchange.getItemCount(outputItem)));
  }
}

// Class representing a numbered line describing a Quest.
class QuestWrapper extends CompletableWrapper implements NumberedThingWrapper {
  constructor(private quest: Quest, public alwaysShow: boolean) {
    super(quest);
  }

  getSummary(): string {
    return `Quest "${this.quest.getName()}", from ${this.quest.getVendorName()}`;
  }

  printDetails(context: CommandContext) {
    // todo: should show all objectives not just items (requires change to wiki scraper)
    let quest = this.quest;
    context.addNumberedLine(this, `Wiki: ${quest.getUrl()}`);
    context.addSimpleLine(`requires:`);
    context.addSimpleLine(`PMC level ${quest.getRequiredPmcLevel()}`, true);

    for (const item of quest.getRequiredItems()) {
      let itemCount = quest.getRequiredItemCount(item);
      context.addNumberedLine(new ItemWrapper(item, itemCount));
    }

    for (const prereq of quest.getPriorQuests().sort(pmcLevelComparator)) {
      context.addNumberedLine(new QuestWrapper(prereq, true));
    }
  }
}

// Class representing a numbered line describing a Vendor.
class VendorLevelWrapper extends CompletableWrapper implements NumberedThingWrapper {
  alwaysShow: boolean = true;

  constructor(private vendorLevel: VendorLoyaltyLevel) {
    super(vendorLevel);
  }

  getSummary(): string {
    return this.vendorLevel.getDescription();
  }

  printDetails(context: CommandContext) {
    let vendorLevel = this.vendorLevel;
    let pmcReq = vendorLevel.pmcLevelRequired;
    context.addNumberedLine(this, (this.isCompleted() ? 'is completed' : `requires PMC level ${pmcReq}`));
  }
}

// Class representing a numbered line describing a HideoutLevelDetails.
class HideoutLevelWrapper extends CompletableWrapper implements NumberedThingWrapper {
  constructor(private hideoutLevel: HideoutLevelDetails, public alwaysShow: boolean) {
    super(hideoutLevel);
  }

  getSummary(): string {
    return this.hideoutLevel.getDescription();
  }

  printDetails(context: CommandContext) {
    let hideoutLevel = this.hideoutLevel;
    context.addNumberedLine(this, 'requires:');

    for (const [ reqKind, reqDetails ] of hideoutLevel.getAllRequirements()) {
      if (reqKind === 'item') {
        let item = reqDetails as Item;
        let itemCount = hideoutLevel.getRequiredItemCount(item);
        context.addNumberedLine(new ItemWrapper(item, itemCount));
      }
      else if (reqKind === 'hideout') {
        let hideoutLvl = reqDetails as HideoutLevelDetails;
        context.addNumberedLine(new HideoutLevelWrapper(hideoutLvl, true));
      }
      else if (reqKind === 'vendor') {
        let vendorLvl = reqDetails as VendorLoyaltyLevel;
        context.addNumberedLine(new VendorLevelWrapper(vendorLvl));
      }
      else {
        context.addSimpleLine(`${reqDetails}`, true);
      }
    }
  }
}

// Class representing a numbered line describing a Purpose.
class PurposeWrapper implements NumberedThingWrapper {
  constructor(private purpose: Purpose) {
  }

  isCompleted(): boolean {
    return this.purpose.target.isCompleted();
  }

  getRequiredPmcLevel(): number {
    return this.purpose.getRequiredPmcLevel();
  }

  getSummary(): string {
    let target = this.purpose.target;
    // console.log('got purpose ' + target.getDescription());
  
    let summary = ``;
    for (const segment of this.purpose.trail) {
      summary += '"' + segment.item.name + '" x' + segment.countOut + ' -> ';
    }
    summary += target.getDescription();
    return summary;
  }

  printDetails(context: CommandContext) {
    // Show the trail of exchanges (if any) to convert the initial item to the useful item.
    let purpose = this.purpose;
    for (const segment of purpose.trail) {
      let exchange = segment.exchange;
      if (exchange) {
        let exchangeLine = '';
        let exchangeCount = segment.getExchangeCount();
        exchangeLine += `... ${exchangeCount} time${(exchangeCount === 1) ? '': 's'}`;
        context.addNumberedLine(new ExchangeWrapper(exchange, true), exchangeLine);
      }
    }

    // Show what the item's used for.
    let lastItem = purpose.trail[purpose.trail.length - 1].item;
    if (Quest.KIND === purpose.target.getKind()) {
      let quest = purpose.target as Quest;
      let requirement = `... requires item "${lastItem.name}" x${quest.getRequiredItemCount(lastItem)}`;
      context.addNumberedLine(new QuestWrapper(quest, true), requirement);
    }
    else if (HideoutLevelDetails.KIND === purpose.target.getKind()) {
      let hideoutLvl = purpose.target as HideoutLevelDetails;
      let requirement = `... requires item "${lastItem.name}" x${hideoutLvl.getRequiredItemCount(lastItem)}`;
      context.addNumberedLine(new HideoutLevelWrapper(hideoutLvl, true), requirement);
    }
    else {
      throw `Unknown target kind: ${purpose.target.getKind()}`;
    }

    // Also show a summary of the total raw materials.
    context.addSimpleLine('Total items input:');
    for (const [item, amount] of purpose.getAllInputs()) {
      context.addNumberedLine(new ItemWrapper(item, amount));
    }
  }
}

// Helper function that handles a reference to a numbered line in the previous command's output.
function referPreviousOutput(lineNumber: number, context: CommandContext) {
  let numberedLine = context.previous && context.previous.numberedLines[lineNumber - 1];
  if (numberedLine) {
    numberedLine.printDetails(context);
  }
  else {
    console.error(`No line ${lineNumber} in previous command`);
  }
}

// Handles a 'default' command (i.e. any text not starting with a slash character).
function handleDefault(line: string, context: CommandContext): void {
  if (/^\d+$/.test(line)) {
    // A number, presumably a reference to a numbered line in the previous output.
    if (context.previous) {
      referPreviousOutput(+line, context);
    }
    else {
      console.error('No previous output to reference.');
      context.addToHistory = false;
    }
  }
  else if ('-' === line) {
    // A 'back' command, telling us to show a prior command.
    context.addToHistory = false;
    let history = CommandContext.history && CommandContext.history.previous;
    if (history) {
      let commandText = history.commandText;
      CommandContext.history = history.previous;
      handleCommand(commandText, new CommandContext(commandText, history.previous));
    }
    else {
      console.error('No history to navigate back to.');
    }
  }
  else {
    // Otherwise, assume it's an item short name.
    printItemByShortName(line, context);
  }
}

// Handles a /help command.
function handleHelp(args: string, context: CommandContext) {
  for (const commandInfo of COMMANDS) {
    console.log(`${commandInfo.name}${commandInfo.parameters}`);
    console.log(`\t${commandInfo.description}`);
  }
}

// Handles a /trim command.
function handleTrim(args: string, context: CommandContext) {
  let newTrim = +args;
  SettingsManager.set(settings => settings.pmcLevelTrim = newTrim);
  context.addSimpleLine(`Trim set to ${newTrim}`);
}

// Helper function that returns the (wrapped) object being referred to via line number
// in a /note or /complete command.
function resolveLineReference(args: string, context: CommandContext): NumberedThingWrapper | undefined {
  let match = /(\d+)(\s|$)/.exec(args);
  if (!match) {
    console.error('Command has invalid arguments (no line number given)');
    return;
  }

  let lineNumber = +(match[1]);
  let lineWrapper = context.previous?.numberedLines[lineNumber - 1];
  if (!lineWrapper) {
    console.error(`No line number ${lineNumber} found in previous command`);
  }
  return lineWrapper;
}

// Handles a /note command.
function handleNote(args: string, context: CommandContext) {
  let lineWrapper = resolveLineReference(args, context);
  if (lineWrapper?.setNote) {
    let match = /\d+(.*)/.exec(args);
    let note = match && match[1];
    lineWrapper.setNote(note?.trim());
    context.addSimpleLine(`Note added`);
    context.addNumberedLine(lineWrapper);
  }
  else if (lineWrapper) {
    console.error(`Error: cannot add note to things of this type`);
  }
}

// Handles a /complete command.
function handleComplete(args: string, context: CommandContext) {
  let lineWrapper = resolveLineReference(args, context);
  if (lineWrapper?.setCompleted) {
    lineWrapper.setCompleted(true);
    context.addSimpleLine(`Completion recorded`);
    context.addNumberedLine(lineWrapper);
  }
  else if (lineWrapper) {
    console.error(`Error: cannot complete things of this type`);
  }
}

// Base class providing functionality for use in the various 'find' commands (/findv, /findq, etc.).
abstract class FindxCommandHelper<T> {
  abstract getSearchKey(thing: T): string;
  abstract sortingFunction(a: T, b: T): number;
  abstract wrapResult(thing: T): NumberedThingWrapper;
  reportNoMatches: boolean = true;

  doSearch(regexString: string, searchSpace: T[], context: CommandContext): number {
    if (!regexString) {
      console.error('Error: missing argument');
      return 0;
    }
    else {
      let regex = new RegExp(regexString, 'i');
      let results: T[] = [];
      for (const thing of searchSpace) {
        if (regex.test(this.getSearchKey(thing))) {
          results.push(thing);
        }
      }

      if (!results.length && this.reportNoMatches) {
        console.log('No matches found');
      }
      else {
        results.sort(this.sortingFunction);
        for (const thing of results) {
          context.addNumberedLine(this.wrapResult(thing));
          // todo: show count of elided things?
        }
      }
      return results.length;
    }
  }
}

// Implements the /find command.
class ItemFinder extends FindxCommandHelper<Item> {
  getSearchKey(item: Item): string {
    return item.name + '|' + item.rawShortName;
  }

  sortingFunction(a: Item, b: Item): number {
    return b.name.localeCompare(a.name);
  }

  wrapResult(item: Item): NumberedThingWrapper {
    return new ItemWrapper(item);
  }
}

// Base class for implementing /find[x] commands for Completable objects.
abstract class CompletableFinder<C extends Completable> extends FindxCommandHelper<C> {
  sortingFunction = pmcLevelComparator;
}

// Implements the /findq command.
class QuestFinder extends CompletableFinder<Quest> {
  getSearchKey(quest: Quest): string {
    return quest.getName() + '|' + quest.getVendorName();
  }

  wrapResult(quest: Quest): NumberedThingWrapper {
    return new QuestWrapper(quest, false);
  }
}

// Implements the /findh command.
class HideoutModuleFinder extends CompletableFinder<HideoutLevelDetails> {
  getSearchKey(hideoutLvl: HideoutLevelDetails): string {
    return hideoutLvl.module.getName() + '|' + hideoutLvl.level;
  }
  wrapResult(hideoutLvl: HideoutLevelDetails): NumberedThingWrapper {
    return new HideoutLevelWrapper(hideoutLvl, false);
  }
}

// Implements the /findv command.
class VendorLevelFinder extends CompletableFinder<VendorLoyaltyLevel> {
  getSearchKey(vendorLvl: VendorLoyaltyLevel): string {
    return vendorLvl.getDescription();
  }
  wrapResult(vendorLvl: VendorLoyaltyLevel): NumberedThingWrapper {
    return new VendorLevelWrapper(vendorLvl);
  }
}

// Handles the /find command.
function handleFindItems(args: string, context: CommandContext) {
  new ItemFinder().doSearch(args, Item.getAllItems(), context);
}

// Handles the /findq command.
function handleFindQuests(args: string, context: CommandContext) {
  new QuestFinder().doSearch(args, Object.values(Quest.QUESTS_BY_URL), context);
}

// Handles the /findh command.
function handleFindHideoutModules(args: string, context: CommandContext) {
  new HideoutModuleFinder().doSearch(args, HideoutModule.getAllLevels(), context);
}

// Handles the /findv command.
function handleFindVendorLevels(args: string, context: CommandContext) {
  new VendorLevelFinder().doSearch(args, Vendor.getAllLoyaltyLevels(), context);
}

// Handles the /findnote command.
function handleFindNote(args: string, context: CommandContext) {
  function getNote<T extends Notable>(thing: T): string {
    return thing.getUserNote() || '';
  }

  let itemFinder = new class extends ItemFinder { getSearchKey = getNote; reportNoMatches = false; };
  let count = itemFinder.doSearch(args, Item.getAllItems(), context);

  let questFinder = new class extends QuestFinder { getSearchKey = getNote; reportNoMatches = false; };
  count += questFinder.doSearch(args, Object.values(Quest.QUESTS_BY_URL), context);

  let hideoutFinder = new class extends HideoutModuleFinder { getSearchKey = getNote; reportNoMatches = false; };
  count += hideoutFinder.doSearch(args, HideoutModule.getAllLevels(), context);

  let vendorFinder = new class extends VendorLevelFinder { getSearchKey = getNote; reportNoMatches = !count; };
  vendorFinder.doSearch(args, Vendor.getAllLoyaltyLevels(), context);
}

// Handles the /all command.
function handleAll(args: string, context: CommandContext) {
  context.showAllResults = true;
  handleCommand(args, context);
}

// Command-line interface object.
const cli = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Waits for user input then passes it to handleCommand.
function waitForCommand() {
  if (process.stdin.readable) {
    cli.question('---> ', handleCommand);
  }
  else {
    cli.close();
  }
}

// Handles a command from the user.
function handleCommand(commandText: string, overrideContext?: CommandContext) {
  commandText = commandText.trim();
  let match = /(\/\w+)\s*/.exec(commandText);
  let context = overrideContext || new CommandContext(commandText, CommandContext.history);
  try {
    if (match) {
      // The command begins with a slash, so look for it among the non-default commands.
      let commandName = match[1];
      for (const commandInfo of COMMANDS) {
        if (commandInfo.name === commandName) {
          commandInfo.handler(commandText.slice(match[0].length), context);
          commandName = '';
          break;
        }
      }

      if (commandName) {
        console.error(`Unknown command '${commandName}'`);
        context.addToHistory = false;
      }
    }
    else if (commandText) {
      // Not a slash command, treat it as default.
      handleDefault(commandText, context)
    }
    else {
      // Empty line.
      context.addToHistory = false;
    }

    if (context.addToHistory) {
      CommandContext.history = context;
    }
  }
  catch (err) {
    console.error(err);
  }

  waitForCommand();
}

// Standard magic for logging unforeseen errors.
function onUnexpectedError(error: any) {
  console.error(`Unexpected error: ${error.name}\nMessage: ${error.message}`);
}
process.on('uncaughtException', onUnexpectedError);
process.on('unhandledRejection', onUnexpectedError);

// Start the app.
console.log('Enter /help for a list of available commands.');
waitForCommand();

// todo:
// - implement /uncomplete cmd (unmark quest or hideout module as complete)
// - there are other errors that should set addToHistory to false
// - altyn fshield details gives 'Item not foundDogtag USEC'
// - possibly /complete /note /trim shouldn't do anything when run from history, just show output.
// - if last command failed, history shouldn't skip over previous successful one.
