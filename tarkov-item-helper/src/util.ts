
export abstract class Fail {
  static unless(condition: any, message: string) {
    if (!condition) {
      throw message;
    }
  }
}
