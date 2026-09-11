import assert from "node:assert/strict";
import test from "node:test";
import { createDiagramStore, openDatabase } from "./database.js";
import { isValidOperationPreview } from "./protocol.js";

test("diagram persistence enforces optimistic versions and operation IDs", () => {
  const database = openDatabase(":memory:");
  const store = createDiagramStore(database);

  const created = store.create({
    id: "diagram-1",
    name: "One",
    document: { tables: [] },
  });
  assert.equal(created.version, 1);

  const updated = store.updateSnapshot({
    id: "diagram-1",
    name: "Updated",
    document: { tables: [{ id: "table-1" }] },
    baseVersion: 1,
    operationId: "operation-1",
  });
  assert.equal(updated.status, "updated");
  assert.equal(updated.diagram.version, 2);

  const duplicate = store.updateSnapshot({
    id: "diagram-1",
    name: "Duplicate",
    document: {},
    baseVersion: 1,
    operationId: "operation-1",
  });
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.diagram.name, "Updated");

  const conflict = store.updateSnapshot({
    id: "diagram-1",
    name: "Stale",
    document: {},
    baseVersion: 1,
    operationId: "operation-2",
  });
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.diagram.version, 2);
  database.close();
});

test("validates ephemeral table movement previews", () => {
  assert.equal(
    isValidOperationPreview({
      type: "table.move",
      payload: { id: "table-1", x: 120.5, y: -40 },
    }),
    true,
  );
  assert.equal(
    isValidOperationPreview({
      type: "table.move",
      payload: { id: "../table", x: 1, y: 2 },
    }),
    false,
  );
  assert.equal(
    isValidOperationPreview({
      type: "table.move",
      payload: { id: "table-1", x: Number.NaN, y: 2 },
    }),
    false,
  );
});
