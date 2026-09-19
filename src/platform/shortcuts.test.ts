import { describe, expect, it } from "vitest";
import { shortcut } from "./shortcuts";

describe("platform shortcuts", () => {
  it("uses the platform's actual modifier in both search and lyrics hints", () => {
    expect(shortcut("k", "MacIntel")).toBe("⌘K");
    expect(shortcut("l", "Win32")).toBe("Ctrl L");
    expect(shortcut("k", "Linux x86_64")).toBe("Ctrl K");
  });
});
