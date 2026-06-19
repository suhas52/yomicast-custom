import fs from "node:fs";
import { DB_PATH, SQLITE_WASM_PATH } from "./constants";
import { useEffect, useMemo, useState } from "react";
import initSqlJs, { Database } from "sql.js";
import { Action, ActionPanel, closeMainWindow, launchCommand, LaunchProps, LaunchType, List } from "@raycast/api";
import { normalizeKana } from "./utils";
import { isJapanese, isKana } from "wanakana";
import { searchEnglish, searchKana, searchKanji } from "./dictionary/search";
import { DictionaryEntry, DictionarySense } from "./dictionary/types";
import dedent from "ts-dedent";

type FormattedKanjiItem = {
  id: string;
  kana: string;
  kanji?: string;
  definition?: string;
  detail: string;
};

type LaunchContext = {
  query?: string;
  text?: string | null;
  error?: string;
};

function isDbSetup() {
  return fs.existsSync(DB_PATH);
}

let db: Database | undefined;
async function getDb() {
  if (db) return db;

  // Start promises in parallel
  const readWasm = fs.promises.readFile(SQLITE_WASM_PATH);
  const readDb = fs.promises.readFile(DB_PATH);

  const SQL = await initSqlJs({ wasmBinary: await readWasm });
  db = new SQL.Database(await readDb);
  return db;
}

function search(db: Database, query: string) {
  const japaneseQuery = normalizeKana(query);
  if (!isJapanese(japaneseQuery)) {
    return searchEnglish(db, query);
  }

  if (isKana(japaneseQuery)) {
    return searchKana(db, japaneseQuery);
  }

  return searchKanji(db, japaneseQuery);
}

function formatKanjiItem(item: DictionaryEntry): FormattedKanjiItem {
  const kanji = item.term !== item.reading ? item.term : undefined;
  const kana = item.reading;
  const definition = item.senses.at(0)?.glosses.at(0);

  let glossCount = 0;
  const formatGlosses = (sense: DictionarySense) => {
    const formattedGlosses = [];
    for (const gloss of sense.glosses) {
      glossCount += 1;
      formattedGlosses.push(`${glossCount}. ${gloss}`);
    }

    const example = sense.example;
    return dedent`
      ${formattedGlosses.join("\n")}
        > ${example?.japanese || ""}
        >
        > ${example?.english || ""}
    `;
  };

  const formatSense = (sense: DictionarySense) => {
    const pos = sense.partOfSpeech.join(", ");

    return dedent`
      ${pos ? `##### ${pos}` : ""}
      ${formatGlosses(sense)}
    `;
  };

  const sensesMarkdown = item.senses.map(formatSense).join("\n\n");

  const detail = dedent`
    ## ${kanji || kana}
    ${kanji ? kana : ""}

    ${sensesMarkdown}
  `;

  return {
    id: item.id,
    kanji,
    kana,
    definition,
    detail,
  };
}

function getInitialQuery(launchContext?: LaunchContext, fallbackText?: string) {
  return launchContext?.query ?? launchContext?.text?.trim() ?? fallbackText ?? "";
}

function hasInvalidOCRContext(launchContext?: LaunchContext) {
  return Boolean(launchContext?.error || launchContext?.text === null || launchContext?.text?.trim() === "");
}

export default function Command({ launchContext, fallbackText }: LaunchProps<{ launchContext?: LaunchContext }>) {
  if (hasInvalidOCRContext(launchContext)) {
    void closeMainWindow();
    return null;
  }

  const [isSetup] = useState(isDbSetup);
  if (!isSetup) {
    return (
      <List>
        <List.EmptyView
          title="Dictionary not set up"
          description='Press "Return" to set up the dictionary.'
          actions={
            <ActionPanel>
              <Action
                title="Update Dictionary"
                onAction={() => {
                  launchCommand({ name: "update-dictionary", type: LaunchType.UserInitiated });
                }}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const [db, setDb] = useState<Database>();
  const [query, setQuery] = useState(getInitialQuery(launchContext, fallbackText));
  const [showingDetail, setShowingDetail] = useState(false);

  useEffect(() => {
    getDb().then((db) => setDb(db));
    return () => db?.close();
  }, []);

  const results = useMemo(() => {
    if (!db || query.trim() === "") return [];
    const res = search(db, query);
    return res;
  }, [db, query]);

  const formattedData = db ? results.map((item) => formatKanjiItem(item)) : [];

  return (
    <List
      navigationTitle="Translate Japanese"
      searchBarPlaceholder="Search Yomicast..."
      searchText={query}
      onSearchTextChange={setQuery}
      isShowingDetail={showingDetail}
    >
      {formattedData.map((item) => (
        <List.Item
          key={item.id}
          title={item.kanji ?? item.kana}
          subtitle={item.kanji && !showingDetail ? item.kana : undefined}
          accessories={[{ text: item.definition }]}
          detail={<List.Item.Detail markdown={item.detail} />}
          actions={
            <ActionPanel>
              <Action title="Toggle Detail" onAction={() => setShowingDetail(!showingDetail)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
