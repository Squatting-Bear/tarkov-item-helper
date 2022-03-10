// Type definitions.

export interface RawRequirement {
  kind: string, // "item", "vendor", "hideout", or "unknown"
};

export interface RawItemReq extends RawRequirement {
  url: string,
  name: string,
  count: number
};

export interface RawVendorReq extends RawRequirement {
  url: string,
  name: string,
  level: number
};

export interface RawHideoutReq extends RawRequirement {
  url: string,
  name: string,
  level: number
};

export interface RawUnknownReq extends RawRequirement {
  text: string
};

export interface RawProvider {
  kind: string, // "craft" or "trade"
  module?: string, // If kind is "craft" (refers to a hideout module)
  vendor?: string, // If kind is "trade" (is the name of a vendor)
  level: number
};

export interface RawCraftOrTrade {
  inputs: RawItemReq[],
  provider: RawProvider,
  output: RawItemReq
};

export interface RawHideoutLevelDetails {
  requirements?: RawRequirement[]
}

export interface RawHideoutModule {
  id: string,
  name: string,
  levels: RawHideoutLevelDetails[]
}

export interface RawQuestReference {
  url: string,
  text: string
}

export interface RawQuest {
  vendor: string,
  url: string,
  name: string,
  previousQuests?: RawQuestReference[],
  requiredLevel?: number,
  objectives: RawItemReq[]
}
