import test from "node:test";
import assert from "node:assert/strict";
import { previewMessages } from "./preview";
test("compatible preview messages cover five languages and retain interpolation", () => {
  const keys = Object.keys(previewMessages.zh).sort();
  for (const language of ["zh", "zh-TW", "en", "ja", "ko"] as const) {
    assert.deepEqual(Object.keys(previewMessages[language]).sort(), keys);
    for (const key of keys) {
      assert.ok(previewMessages[language][key].trim());
      assert.deepEqual(
        (previewMessages[language][key].match(/\{\{\w+\}\}/g) || []).sort(),
        (previewMessages.zh[key].match(/\{\{\w+\}\}/g) || []).sort(),
      );
    }
  }
});
