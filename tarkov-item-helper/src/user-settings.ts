import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface UserSettings {
  settingsVersion: number;
  pmcLevelTrim: number;
  completed: {
    quest: { [url: string]: boolean };
    hideout:  { [id: string]: boolean };
    vendor: { [id: string]: boolean };
  };
  userNotes: {
    item: { [url: string]: string };
    quest: { [url: string]: string };
    hideout: { [id: string]: string };
    vendor: { [id: string]: string };
  };
}

const DEFAULT_SETTINGS: UserSettings = {
  settingsVersion: 1,
  pmcLevelTrim: 15,
  completed: {
    quest: {
    },
    hideout: {
    },
    vendor: {
      "Therapist:1": true,
      "Prapor:1": true,
      "Skier:1": true,
      "Peacekeeper:1": true,
      "Mechanic:1": true,
      "Ragman:1": true,
      "Fence:1": true
    }
  },
  userNotes: {
    item: {
    },
    quest: {
    },
    hideout: {
    },
    vendor: {
    }
  }
}

// Controls access to the persistent user settings.
export class SettingsManager {
  static get(accessor: (settings: UserSettings) => any) {
    return accessor(SettingsManager.SETTINGS);
  }

  static set(mutator: (settings: UserSettings) => void) {
    mutator(SettingsManager.SETTINGS);
    fs.writeFileSync(SettingsManager.SETTINGS_FILENAME, JSON.stringify(SettingsManager.SETTINGS));
  }

  static reset() {
    SettingsManager.SETTINGS = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    fs.unlinkSync(SettingsManager.SETTINGS_FILENAME);
  }

  private static SETTINGS_FILENAME = path.join(os.homedir(), '.tarkov-item-helper', 'user-settings.json');
  private static SETTINGS: UserSettings = SettingsManager.setup();

  private static setup(): UserSettings {
    let settingsFilename = SettingsManager.SETTINGS_FILENAME;
    let appUserDir =  path.dirname(settingsFilename);
    if (!fs.existsSync(appUserDir)) {
      fs.mkdirSync(appUserDir);
    }

    if (fs.existsSync(settingsFilename)) {
      console.log(`Using user settings from ${settingsFilename}`);
      return JSON.parse(fs.readFileSync(settingsFilename).toString());
    }
    else {
      console.log(`No user settings file found; using defaults`);
      // Make a copy of DEFAULT_SETTINGS in case we are reset later.
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  }
}

