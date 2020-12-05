import Merger from "../merger";
import {
  StorageInterface,
  databaseTest,
  noteTest,
  TEST_NOTE,
  TEST_NOTEBOOK,
} from "../../../__tests__/utils";
import { enableFetchMocks, disableFetchMocks } from "jest-fetch-mock";
import { tagsCollectionParams, mainCollectionParams } from "./utils";
import { login, getEncrypted } from "./utils";

const emptyServerResponse = {
  notes: [],
  notebooks: [],
  delta: [],
  text: [],
  tags: [],
  colors: [],
  trash: [],
  settings: [],
};

const testItem = { id: "someId", dateEdited: 2 };

test("server response with all arrays empty should cause early return", async () => {
  const merger = new Merger();
  const result = await merger.merge(emptyServerResponse);
  expect(result).toBe(false);
});

test("null server response should return false", async () => {
  const merger = new Merger();
  const result = await merger.merge();
  expect(result).toBe(false);
});

const tests = [
  mainCollectionParams("notes", "note", TEST_NOTE),
  mainCollectionParams("notebooks", "notebook", TEST_NOTEBOOK),
  tagsCollectionParams("tags", "someTag"),
  tagsCollectionParams("colors", "red"),
];

describe.each(tests)(
  "general %s syncing tests",
  (collection, add, edit, get) => {
    beforeAll(() => {
      enableFetchMocks();
    });

    beforeEach(() => {
      fetch.resetMocks();
      StorageInterface.clear();
    });

    test(`merge ${collection} into empty database`, () =>
      databaseTest().then(async (db) => {
        await login(db);
        const merger = new Merger(db);
        const result = await merger.merge(
          {
            [collection]: [
              { id: testItem.id, ...(await getEncrypted(testItem)) },
            ],
            synced: false,
          },
          0
        );
        expect(result).toBe(true);
        expect(db[collection].all[0].id).toStrictEqual(testItem.id);
        expect(db[collection].all[0].dateEdited).toStrictEqual(
          testItem.dateEdited
        );
      }));

    test(`merge local and remote ${collection}`, () =>
      databaseTest().then(async (db) => {
        await login(db);
        const merger = new Merger(db);
        const item = await add(db);
        item.title = "Google";
        const result = await merger.merge(
          {
            [collection]: [{ id: item.id, ...(await getEncrypted(item)) }],
            synced: false,
          },
          0
        );
        expect(result).toBe(true);
        expect(db[collection].all.length).toBe(1);
        expect(db[collection].all[0]).toStrictEqual(item);
      }));

    test(`local ${collection} are more updated than remote ones`, () =>
      databaseTest().then(async (db) => {
        await login(db);
        const merger = new Merger(db);
        const item = await add(db);
        await edit(db, item);
        item.title = "Google";
        const result = await merger.merge(
          {
            [collection]: [{ id: item.id, ...(await getEncrypted(item)) }],
            synced: false,
          },
          0
        );
        expect(result).toBe(true);
        expect(db[collection].all.length).toBe(1);
        expect(db[collection].all[0]).toStrictEqual(get(db, item));
      }));
  }
);

test("local delta updated after lastSyncedTimestamp should cause merge conflict", () => {
  StorageInterface.clear();
  return noteTest().then(async ({ db, id }) => {
    await login(db);

    const contentId = db.notes.note(id).data.contentId;
    const merger = new Merger(db);
    const result = await merger.merge(
      {
        content: [
          {
            id: contentId,
            ...(await getEncrypted({
              id: contentId,
              noteId: id,
              type: "delta",
              data: [{ insert: "my name is" }],
              dateEdited: 2919,
              conflicted: false,
              resolved: false,
            })),
          },
        ],
      },
      200
    );
    const localContent = await db.content.raw(contentId);
    expect(localContent.conflicted.id).toBe(contentId);
    expect(localContent.conflicted.noteId).toBe(id);
    expect(result).toBe(true);
    expect(await db.context.read("hasConflicts")).toBe(true);
  });
});
