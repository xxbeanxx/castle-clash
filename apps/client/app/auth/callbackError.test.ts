import { describe, expect, it } from "vitest";
import { readCallbackError } from "./callbackError.js";

describe("readCallbackError", () => {
  it("returns null when the callback carries no error", () => {
    expect(readCallbackError("", "#access_token=abc&refresh_token=def")).toBeNull();
    expect(readCallbackError("?next=%2Flobby", "")).toBeNull();
  });

  it("reads an identity collision from the query string", () => {
    expect(
      readCallbackError(
        "?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user",
        "",
      ),
    ).toEqual({
      kind: "account-exists",
      code: "identity_already_exists",
      description: "Identity is already linked to another user",
    });
  });

  it("reads the same error from the URL fragment", () => {
    expect(
      readCallbackError(
        "",
        "#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user&sb=",
      )?.kind,
    ).toBe("account-exists");
  });

  it("treats an email that already belongs to another account as the same situation", () => {
    expect(readCallbackError("?error=invalid_request&error_code=email_exists", "")?.kind).toBe(
      "account-exists",
    );
  });

  it("classifies a user backing out of Google's screen", () => {
    expect(
      readCallbackError("?error=access_denied&error_description=User+denied+access", "")?.kind,
    ).toBe("cancelled");
  });

  it("falls back to a generic error, keeping the description for display", () => {
    expect(readCallbackError("?error=server_error&error_description=Something+broke", "")).toEqual({
      kind: "other",
      code: null,
      description: "Something broke",
    });
  });

  it("prefers the query over the fragment when both name an error", () => {
    expect(
      readCallbackError("?error_code=email_exists", "#error_code=identity_already_exists")?.code,
    ).toBe("email_exists");
  });
});
