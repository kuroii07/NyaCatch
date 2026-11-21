import type { AppStore } from "@mediago/shared-common";
export type Values = Partial<AppStore>;
export type DraftKind = "proxy" | "remote";
export type Draft = { base: Values; values: Values; conflict: boolean };
export function snapshot(kind: DraftKind, settings: Values): Values {
  return Object.fromEntries(
    (kind === "proxy"
      ? ["proxy", "useProxy", "downloadProxySwitch"]
      : ["dockerUrl", "apiKey", "enableDocker"]
    ).map((key) => [key, settings[key as keyof AppStore]]),
  );
}
export function changes(base: Values, values: Values): Values {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => !Object.is(base[key as keyof AppStore], value),
    ),
  );
}
export function reconcile(entry: Draft, current: Values): Draft {
  const edited = changes(entry.base, entry.values);
  const conflict = Object.entries(edited).some(
    ([key, value]) =>
      !Object.is(
        entry.base[key as keyof AppStore],
        current[key as keyof AppStore],
      ) && !Object.is(value, current[key as keyof AppStore]),
  );
  return {
    base: current,
    values: { ...current, ...edited },
    conflict:
      Object.keys(changes(current, { ...current, ...edited })).length > 0 &&
      (entry.conflict || conflict),
  };
}
export function matches(current: Values, target: Values) {
  return Object.entries(target).every(([key, value]) =>
    Object.is(current[key as keyof AppStore], value),
  );
}
