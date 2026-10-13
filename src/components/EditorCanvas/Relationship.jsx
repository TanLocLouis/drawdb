import { useMemo, useState, memo } from "react";
import { Cardinality, ObjectType, Tab } from "../../data/constants";
import { calcPath, calcCompositePath } from "../../utils/calcPath";
import { useDiagram, useSettings, useLayout, useSelect } from "../../hooks";
import { useTranslation } from "react-i18next";
import { SideSheet } from "@douyinfe/semi-ui";
import RelationshipInfo from "../EditorSidePanel/RelationshipsTab/RelationshipInfo";
import {
  getVisibleFieldIndex,
  getVisibleFields,
  getRelationshipFields,
  getTableWidth,
  getFieldOffsetY,
  getCommentHeight,
} from "../../utils/utils";
import { tableFieldHeight, tableHeaderHeight } from "../../data/constants";

const labelFontSize = 16;
const cardinalityOffset = 28;

function CardinalityLabel({ x, y, text, color, r = 12, padding = 14 }) {
  const textWidth = Math.max(10, (text?.length ?? 1) * 8.5);

  return (
    <g>
      <rect
        x={x - textWidth / 2 - padding / 2}
        y={y - r}
        rx={r}
        ry={r}
        width={textWidth + padding}
        height={r * 2}
        fill={color ?? "grey"}
        className="group-hover:fill-sky-600"
      />
      <text
        x={x}
        y={y}
        fill="white"
        strokeWidth="0.5"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  );
}

function Relationship({ data, tables: propTables }) {
  const { settings } = useSettings();
  const { tables: diagramTables, relationships } = useDiagram();
  const tables = propTables ?? diagramTables;
  const { layout } = useLayout();
  const { selectedElement, setSelectedElement } = useSelect();
  const { t } = useTranslation();

  const pathValues = useMemo(() => {
    const startTable = tables.find((t) => t.id === data.startTableId);
    const endTable = tables.find((t) => t.id === data.endTableId);

    if (!startTable || !endTable || startTable.hidden || endTable.hidden)
      return null;

    const startFields = getVisibleFields(startTable, relationships);
    const endFields = getVisibleFields(endTable, relationships);

    const pairs = getRelationshipFields(data);

    return {
      startFieldIndex: getVisibleFieldIndex(
        startTable,
        data.startFieldId,
        relationships,
      ),
      endFieldIndex: getVisibleFieldIndex(
        endTable,
        data.endFieldId,
        relationships,
      ),
      startFieldIndices: pairs.map((p) =>
        getVisibleFieldIndex(startTable, p.startFieldId, relationships),
      ),
      endFieldIndices: pairs.map((p) =>
        getVisibleFieldIndex(endTable, p.endFieldId, relationships),
      ),
      startTable: {
        x: startTable.x,
        y: startTable.y,
        width: getTableWidth(startTable),
        comment: startTable.comment,
        fields: startFields,
      },
      endTable: {
        x: endTable.x,
        y: endTable.y,
        width: getTableWidth(endTable),
        comment: endTable.comment,
        fields: endFields,
      },
    };
  }, [tables, relationships, data]);

  const isComposite = (pathValues?.startFieldIndices?.length ?? 0) > 1;

  const pathData = useMemo(() => {
    if (!pathValues) return null;

    if (isComposite) {
      const comp = calcCompositePath(
        {
          startTable: pathValues.startTable,
          endTable: pathValues.endTable,
          startFieldIndices: pathValues.startFieldIndices,
          endFieldIndices: pathValues.endFieldIndices,
        },
        1,
        settings.showComments,
      );
      if (!comp) return null;
      return {
        path: comp.path,
        labelX: comp.labelPoint.x,
        labelY: comp.labelPoint.y,
        cardinalityStartX: comp.startCardinality.x,
        cardinalityStartY: comp.startCardinality.y,
        cardinalityEndX: comp.endCardinality.x,
        cardinalityEndY: comp.endCardinality.y,
      };
    }

    const pathString = calcPath(pathValues, 1, settings.showComments);
    const startTableWidth = getTableWidth(pathValues.startTable);
    const endTableWidth = getTableWidth(pathValues.endTable);
    const x1 = pathValues.startTable.x;
    const y1 =
      pathValues.startTable.y +
      getFieldOffsetY(
        pathValues.startTable.fields ?? [],
        pathValues.startFieldIndex,
        startTableWidth,
        settings.showComments,
      ) +
      tableHeaderHeight +
      getCommentHeight(
        pathValues.startTable.comment,
        startTableWidth,
        settings.showComments,
      ) +
      tableFieldHeight / 2;
    const x2 = pathValues.endTable.x;
    const y2 =
      pathValues.endTable.y +
      getFieldOffsetY(
        pathValues.endTable.fields ?? [],
        pathValues.endFieldIndex,
        endTableWidth,
        settings.showComments,
      ) +
      getCommentHeight(
        pathValues.endTable.comment,
        endTableWidth,
        settings.showComments,
      ) +
      tableHeaderHeight +
      tableFieldHeight / 2;

    const midX = (x2 + x1 + startTableWidth) / 2;
    const startX = x1 + startTableWidth <= x2 ? x1 + startTableWidth : x1;
    const endX = x2 + endTableWidth < x1 ? x2 + endTableWidth : x2;

    const dirStart = midX >= startX ? 1 : -1;
    const dirEnd = midX >= endX ? 1 : -1;

    return {
      path: pathString,
      labelX: midX,
      labelY: (y1 + y2) / 2,
      cardinalityStartX: startX + dirStart * cardinalityOffset,
      cardinalityStartY: y1,
      cardinalityEndX: endX + dirEnd * cardinalityOffset,
      cardinalityEndY: y2,
    };
  }, [pathValues, isComposite, settings.showComments]);

  const [hovered, setHovered] = useState(false);

  let cardinalityStart = "1";
  let cardinalityEnd = "1";

  switch (data.cardinality) {
    case t(Cardinality.MANY_TO_ONE):
    case Cardinality.MANY_TO_ONE:
      cardinalityStart = data.manyLabel || "n";
      cardinalityEnd = "1";
      break;
    case t(Cardinality.ONE_TO_MANY):
    case Cardinality.ONE_TO_MANY:
      cardinalityStart = "1";
      cardinalityEnd = data.manyLabel || "n";
      break;
    case t(Cardinality.ONE_TO_ONE):
    case Cardinality.ONE_TO_ONE:
      cardinalityStart = "1";
      cardinalityEnd = "1";
      break;
    default:
      break;
  }

  const edit = () => {
    if (!layout.sidebar) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.RELATIONSHIP,
        id: data.id,
        open: true,
      }));
    } else {
      setSelectedElement((prev) => ({
        ...prev,
        currentTab: Tab.RELATIONSHIPS,
        element: ObjectType.RELATIONSHIP,
        id: data.id,
        open: true,
      }));
      if (selectedElement.currentTab !== Tab.RELATIONSHIPS) return;
      document
        .getElementById(`scroll_ref_${data.id}`)
        .scrollIntoView({ behavior: "smooth" });
    }
  };

  if (!pathData) return null;

  return (
    <>
      <g
        className="select-none group"
        onDoubleClick={edit}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        {/* invisible wider path for better hover ux */}
        <path
          d={pathData.path}
          fill="none"
          stroke="transparent"
          strokeWidth={12}
          cursor="pointer"
        />
        <path
          d={pathData.path}
          className="relationship-path"
          style={{ stroke: hovered ? undefined : data.color }}
          fill="none"
          cursor="pointer"
        />
        {settings.showRelationshipLabels && (
          <text
            x={pathData.labelX}
            y={pathData.labelY}
            fill={data.color ?? (settings.mode === "dark" ? "lightgrey" : "#333")}
            fontSize={labelFontSize}
            fontWeight={500}
            textAnchor="middle"
            dominantBaseline="central"
            className="group-hover:fill-sky-600"
          >
            {data.name}
          </text>
        )}
        {settings.showCardinality && (
          <>
            <CardinalityLabel
              x={pathData.cardinalityStartX}
              y={pathData.cardinalityStartY}
              text={cardinalityStart}
              color={data.color}
            />
            <CardinalityLabel
              x={pathData.cardinalityEndX}
              y={pathData.cardinalityEndY}
              text={cardinalityEnd}
              color={data.color}
            />
          </>
        )}
      </g>
      <SideSheet
        title={t("edit")}
        size="small"
        visible={
          selectedElement.element === ObjectType.RELATIONSHIP &&
          selectedElement.id === data.id &&
          selectedElement.open &&
          !layout.sidebar
        }
        onCancel={() => {
          setSelectedElement((prev) => ({
            ...prev,
            open: false,
          }));
        }}
        style={{ paddingBottom: "16px" }}
      >
        <div className="sidesheet-theme">
          <RelationshipInfo data={data} />
        </div>
      </SideSheet>
    </>
  );
}

export default memo(Relationship, (prevProps, nextProps) => {
  if (prevProps.data !== nextProps.data) return false;
  if (prevProps.tables === nextProps.tables) return true;
  const prevStart = prevProps.tables?.find((t) => t.id === nextProps.data.startTableId);
  const nextStart = nextProps.tables?.find((t) => t.id === nextProps.data.startTableId);
  const prevEnd = prevProps.tables?.find((t) => t.id === nextProps.data.endTableId);
  const nextEnd = nextProps.tables?.find((t) => t.id === nextProps.data.endTableId);
  return prevStart === nextStart && prevEnd === nextEnd;
});
