
export abstract class Fail {
  static unless(condition: any, message: string) {
    if (!condition) {
      throw message;
    }
  }
}

export function pushUnique(target: any[], ...items: any) {
  for (const item of items) {
    if (!target.includes(item)) {
      target.push(item);
    }
  }
}
