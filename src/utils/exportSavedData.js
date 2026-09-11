import JSZip from "jszip";
import { db } from "../data/db";
import { saveAs } from "file-saver";
import { diagramApi } from "../api/diagrams";

const zip = new JSZip();

const formatDiagram = (diagram) => {
  const formattedDiagram = { ...diagram };
  formattedDiagram.relationships = diagram.references;
  formattedDiagram.subjectAreas = diagram.areas;

  delete formattedDiagram.references;
  delete formattedDiagram.areas;

  return formattedDiagram;
};

export async function exportSavedData() {
  const diagramsFolder = zip.folder("diagrams");

  const summaries = await diagramApi.list();
  const diagrams = await Promise.all(
    summaries.map((diagram) => diagramApi.get(diagram.id)),
  );
  diagrams.forEach((serverDiagram) => {
    const diagram = {
      ...serverDiagram.document,
      name: serverDiagram.name,
      diagramId: serverDiagram.id,
    };
    diagramsFolder.file(
      `${diagram.name}(${diagram.diagramId}).json`,
      JSON.stringify(formatDiagram(diagram), null, 2),
    );
  });

  const templatesFolder = zip.folder("templates");

  await db.templates.where({ custom: 1 }).each((template) => {
    templatesFolder.file(
      `${template.title}(${template.id}).json`,
      JSON.stringify(formatDiagram(template), null, 2),
    );
    return true;
  });

  zip.generateAsync({ type: "blob" }).then(function (content) {
    const date = new Date();
    saveAs(
      content,
      `${date.getFullYear()}_${date.getMonth()}_${date.getDay()}_export.zip`,
    );
  });
}
