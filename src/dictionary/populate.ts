import AdmZip from "adm-zip";
import { Database } from "sql.js";
import { DOWNLOAD_PATH } from "../constants";
import { Toast } from "@raycast/api";
import { isKana } from "wanakana";
import { normalizeKana, sql } from "../utils";
import { parseTerm } from "./jitendex";
import { YomitanTerm } from "./types";

type JitendexIndex = {
  revision: string;
  title: string;
  attribution?: string;
};

export function createTables(db: Database) {
  return db.run(sql`
    DROP TABLE IF EXISTS metadata;
    DROP TABLE IF EXISTS entries;
    DROP TABLE IF EXISTS kanji_index;
    DROP TABLE IF EXISTS kana_index;
    DROP TABLE IF EXISTS gloss_fts_index;

    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE entries (
      entry_id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      common_forms_count INTEGER NOT NULL DEFAULT 0,
      has_kanji BOOLEAN NOT NULL DEFAULT 0
    );

    CREATE TABLE kanji_index (
      kanji_text TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      PRIMARY KEY (kanji_text, entry_id),
      FOREIGN KEY (entry_id) REFERENCES entries(entry_id) ON DELETE CASCADE
    );
    CREATE INDEX idx_kanji_text_prefix ON kanji_index(kanji_text);

    CREATE TABLE kana_index (
      kana_text TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      PRIMARY KEY (kana_text, entry_id),
      FOREIGN KEY (entry_id) REFERENCES entries(entry_id) ON DELETE CASCADE
    );
    CREATE INDEX idx_kana_text_prefix ON kana_index(kana_text);

    CREATE VIRTUAL TABLE gloss_fts_index USING fts5(
      entry_id UNINDEXED,
      sense_idx UNINDEXED,
      gloss_content,
      tokenize = 'unicode61'
    );
  `);
}

export async function populateTables(db: Database, toast: Toast, abortSignal: AbortSignal) {
  if (abortSignal.aborted) return false;

  try {
    console.log("Opening Jitendex archive...");
    const zip = new AdmZip(DOWNLOAD_PATH);
    const indexEntry = zip.getEntry("index.json");
    if (!indexEntry) throw new Error("Jitendex archive has no index.json");

    const metadata = JSON.parse(indexEntry.getData().toString("utf8")) as JitendexIndex;
    const banks = zip
      .getEntries()
      .filter((entry) => /^term_bank_\d+\.json$/.test(entry.entryName))
      .sort((a, b) => bankNumber(a.entryName) - bankNumber(b.entryName));
    if (banks.length === 0) throw new Error("Jitendex archive has no term banks");

    console.log("Creating database tables...");
    createTables(db);
    db.run("PRAGMA journal_mode = OFF;");
    db.run("BEGIN TRANSACTION;");
    db.run(
      sql`INSERT INTO metadata (key, value) VALUES ('version', :version), ('date', :date), ('title', :title), ('attribution', :attribution);`,
      {
        ":version": metadata.revision,
        ":date": metadata.revision.split(".").slice(0, 3).join("-"),
        ":title": metadata.title,
        ":attribution": metadata.attribution ?? "",
      },
    );

    const entryStmt = db.prepare(
      sql`INSERT INTO entries (entry_id, data, common_forms_count, has_kanji) VALUES (:entry_id, :data, :common_forms_count, :has_kanji);`,
    );
    const kanjiStmt = db.prepare(sql`INSERT INTO kanji_index (kanji_text, entry_id) VALUES (:kanji_text, :entry_id);`);
    const kanaStmt = db.prepare(
      sql`INSERT OR IGNORE INTO kana_index (kana_text, entry_id) VALUES (:kana_text, :entry_id);`,
    );
    const glossStmt = db.prepare(
      sql`INSERT INTO gloss_fts_index (entry_id, sense_idx, gloss_content) VALUES (:entry_id, :sense_idx, :gloss_content);`,
    );

    let entryId = 0;
    for (const [bankIndex, bank] of banks.entries()) {
      if (abortSignal.aborted) {
        db.run("ROLLBACK;");
        return false;
      }

      const terms = JSON.parse(bank.getData().toString("utf8")) as YomitanTerm[];
      terms.forEach((term, termIndex) => {
        const entry = parseTerm(term, bankIndex, termIndex);
        entryId += 1;
        entryStmt.run({
          ":entry_id": entryId,
          ":data": JSON.stringify(entry),
          ":common_forms_count": Number(entry.score > 0),
          ":has_kanji": Number(!isKana(entry.term)),
        });

        if (isKana(entry.term)) {
          kanaStmt.run({ ":kana_text": normalizeKana(entry.term), ":entry_id": entryId });
        } else {
          kanjiStmt.run({ ":kanji_text": entry.term, ":entry_id": entryId });
        }
        kanaStmt.run({ ":kana_text": normalizeKana(entry.reading), ":entry_id": entryId });

        entry.senses.forEach((sense, senseIndex) => {
          sense.glosses.forEach((gloss) => {
            glossStmt.run({ ":entry_id": entryId, ":sense_idx": senseIndex, ":gloss_content": gloss });
          });
        });
      });

      toast.title = "Indexing Jitendex...";
      toast.message = `Progress: ${Math.round(((bankIndex + 1) / banks.length) * 100)}%`;
      toast.style = Toast.Style.Animated;
      await new Promise((resolve) => setImmediate(resolve));
    }

    entryStmt.free();
    kanjiStmt.free();
    kanaStmt.free();
    glossStmt.free();
    db.run("COMMIT;");
    console.log(`Indexed ${entryId} Jitendex terms.`);
    return true;
  } catch (error) {
    console.error("Failed to index Jitendex:", error);
    return false;
  }
}

function bankNumber(name: string) {
  return Number(name.match(/\d+/)?.[0] ?? 0);
}
