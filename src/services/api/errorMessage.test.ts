import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/components/i18n";
import { localizeApiMessage } from "./errorMessage";

afterEach(() => i18n.changeLanguage("en"));

describe("localizeApiMessage", () => {
  it("translates a message the API sends verbatim", async () => {
    await i18n.changeLanguage("ru");

    expect(
      localizeApiMessage("unauthorized", "Invalid login credentials"),
    ).toBe("Неверный логин или пароль.");
  });

  it("keeps the names inside a refused transition", async () => {
    await i18n.changeLanguage("ru");

    expect(
      localizeApiMessage(
        "bad_request",
        'The workflow has no transition from "To Do" to "Done".',
      ),
    ).toBe("В рабочем процессе нет перехода из «To Do» в «Done».");
  });

  it("keeps the server's text in English", () => {
    expect(localizeApiMessage("bad_request", "title: Required")).toBe(
      "title: Required",
    );
  });

  it("falls back to the code's sentence in other languages", async () => {
    await i18n.changeLanguage("ru");

    expect(localizeApiMessage("conflict", "something new")).toBe(
      "Конфликт: данные уже изменились или уже существуют.",
    );
    expect(localizeApiMessage("teapot", "something new")).toBe(
      "Что-то пошло не так. Попробуйте ещё раз.",
    );
  });
});
