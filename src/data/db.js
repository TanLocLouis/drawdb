import Dexie from "dexie";
import { v4 as uuidv4 } from "uuid";
import { templateSeeds } from "./seeds";

export const db = new Dexie("drawDB");

db.version(68)
  .stores({
    diagrams: null,
    templates: "++id, custom, templateId",
  })
  .upgrade(async (tx) => {
    await tx.templates.toCollection().modify((template) => {
      if (!template.templateId) {
        template.templateId = uuidv4();
      }
    });
  });

db.on("populate", (transaction) => {
  transaction.templates.bulkAdd(templateSeeds).catch((e) => console.log(e));
});
