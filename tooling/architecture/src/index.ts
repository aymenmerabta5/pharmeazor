export interface PackageRule {
  name: string;
  allowedDependencies: string[];
}

export function defineArchitecture(rules: PackageRule[]): PackageRule[] {
  return rules;
}
