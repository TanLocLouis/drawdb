import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Slot } from "../../context/ExtensionsContext";
import {
  Action,
  Cardinality,
  Constraint,
  darkBgTheme,
  ObjectType,
  gridSize,
  gridCircleRadius,
  minAreaSize,
  defaultRelationshipColor,
} from "../../data/constants";
import { Toast } from "@douyinfe/semi-ui";
import Table from "./Table";
import View from "./View";
import Area from "./Area";
import Relationship from "./Relationship";
import Note from "./Note";
import {
  useCanvas,
  useSettings,
  useTransform,
  useDiagram,
  useUndoRedo,
  useSelect,
  useAreas,
  useNotes,
  useLayout,
  useSaveState,
  useCollab,
  useViews,
} from "../../hooks";
import { useTranslation } from "react-i18next";
import { useEventListener } from "usehooks-ts";
import {
  areFieldsCompatible,
  getTableHeight,
  getTableWidth,
} from "../../utils/utils";
import {
  getViewHeight,
  getViewWidth,
  resolveViewColumns,
} from "../../utils/views";
import { getRectFromEndpoints, isInsideRect } from "../../utils/rect";
import { State, noteWidth } from "../../data/constants";
import { nanoid } from "nanoid";

const notDragging = {
  id: -1,
  type: ObjectType.NONE,
  grabOffset: { x: 0, y: 0 },
};

export default function Canvas() {
  const { t } = useTranslation();

  const canvasRef = useRef(null);
  const canvasContextValue = useCanvas();
  const {
    canvas: { viewBox },
    coords: { toDiagramSpace },
    pointer,
  } = canvasContextValue;

  const { tables, updateTable, relationships, addRelationship, database } =
    useDiagram();
  const { setSaveState } = useSaveState();
  const { areas, updateArea } = useAreas();
  const { views, updateView } = useViews();
  const { notes, updateNote } = useNotes();
  const { layout } = useLayout();
  const { settings } = useSettings();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { transform, setTransform } = useTransform();
  const {
    selectedElement,
    setSelectedElement,
    bulkSelectedElements,
    setBulkSelectedElements,
  } = useSelect();
  const [dragging, setDragging] = useState(notDragging);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const dragRef = useRef({
    active: false,
    mainElement: null,
    elements: [],
    delta: { x: 0, y: 0 },
  });
  const dragRafRef = useRef(null);
  const canvasRectRef = useRef(null);
  const elementPointerDownRef = useRef(null);

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);
  const [linking, setLinking] = useState(false);
  const [linkingLine, setLinkingLine] = useState({
    startTableId: -1,
    startFieldId: -1,
    endTableId: -1,
    endFieldId: -1,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });
  const { emitAwareness } = useCollab();
  const lastLinkingRef = useRef(false);
  const rightClickPanned = useRef(false);

  useEffect(() => {
    if (linking) {
      emitAwareness({
        linking: {
          startX: linkingLine.startX,
          startY: linkingLine.startY,
          endX: linkingLine.endX,
          endY: linkingLine.endY,
        },
      });
      lastLinkingRef.current = true;
    } else if (lastLinkingRef.current) {
      emitAwareness({ linking: null });
      lastLinkingRef.current = false;
    }
  }, [
    linking,
    linkingLine.startX,
    linkingLine.startY,
    linkingLine.endX,
    linkingLine.endY,
    emitAwareness,
  ]);
  const [hoveredTable, setHoveredTable] = useState({
    tableId: null,
    fieldId: null,
  });
  const [panning, setPanning] = useState({
    isPanning: false,
    panStart: { x: 0, y: 0 },
    cursorStart: { x: 0, y: 0 },
  });
  const [areaResize, setAreaResize] = useState({ id: -1, dir: "none" });
  const [areaInitDimensions, setAreaInitDimensions] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [bulkSelectRect, setBulkSelectRect] = useState({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    show: false,
    ctrlKey: false,
    metaKey: false,
  });
  const isSameElement = (el1, el2) => {
    return el1.id === el2.id && el1.type === el2.type;
  };

  const displayTables = useMemo(() => {
    if (dragDelta.x === 0 && dragDelta.y === 0) return tables;
    const movingIds = new Set(
      dragRef.current.elements
        .filter((el) => el.type === ObjectType.TABLE)
        .map((el) => el.id),
    );
    if (movingIds.size === 0) return tables;
    return tables.map((t) => {
      if (movingIds.has(t.id)) {
        return { ...t, x: t.x + dragDelta.x, y: t.y + dragDelta.y };
      }
      return t;
    });
  }, [tables, dragDelta]);

  const displayAreas = useMemo(() => {
    if (dragDelta.x === 0 && dragDelta.y === 0) return areas;
    const movingIds = new Set(
      dragRef.current.elements
        .filter((el) => el.type === ObjectType.AREA)
        .map((el) => el.id),
    );
    if (movingIds.size === 0) return areas;
    return areas.map((a) => {
      if (movingIds.has(a.id)) {
        return { ...a, x: a.x + dragDelta.x, y: a.y + dragDelta.y };
      }
      return a;
    });
  }, [areas, dragDelta]);

  const displayNotes = useMemo(() => {
    if (dragDelta.x === 0 && dragDelta.y === 0) return notes;
    const movingIds = new Set(
      dragRef.current.elements
        .filter((el) => el.type === ObjectType.NOTE)
        .map((el) => el.id),
    );
    if (movingIds.size === 0) return notes;
    return notes.map((n) => {
      if (movingIds.has(n.id)) {
        return { ...n, x: n.x + dragDelta.x, y: n.y + dragDelta.y };
      }
      return n;
    });
  }, [notes, dragDelta]);

  const displayViews = useMemo(() => {
    if (dragDelta.x === 0 && dragDelta.y === 0) return views;
    const movingIds = new Set(
      dragRef.current.elements
        .filter((el) => el.type === ObjectType.VIEW)
        .map((el) => el.id),
    );
    if (movingIds.size === 0) return views;
    return views.map((v) => {
      if (movingIds.has(v.id)) {
        return { ...v, x: v.x + dragDelta.x, y: v.y + dragDelta.y };
      }
      return v;
    });
  }, [views, dragDelta]);

  const collectSelectedElements = () => {
    const rect = getRectFromEndpoints(bulkSelectRect);
    const elements = [];
    const shouldAddElement = (elementRect, element) => {
      // if ctrl key is pressed, only add the elements that are not already selected
      // can theoretically be optimized later if the selected elements is
      // a map from id to element (after the ids are made unique)
      return (
        isInsideRect(elementRect, rect) &&
        ((!bulkSelectRect.ctrlKey && !bulkSelectRect.metaKey) ||
          !bulkSelectedElements.some((el) => isSameElement(el, element)))
      );
    };

    tables.forEach((table) => {
      if (table.locked) return;

      const element = {
        id: table.id,
        type: ObjectType.TABLE,
        currentCoords: { x: table.x, y: table.y },
        initialCoords: { x: table.x, y: table.y },
      };
      const tableRect = {
        x: table.x,
        y: table.y,
        width: getTableWidth(table),
        height: getTableHeight(table, settings.showComments, relationships),
      };
      if (shouldAddElement(tableRect, element)) {
        elements.push(element);
      }
    });

    views.forEach((view) => {
      if (view.locked) return;

      const element = {
        id: view.id,
        type: ObjectType.VIEW,
        currentCoords: { x: view.x, y: view.y },
        initialCoords: { x: view.x, y: view.y },
      };
      const viewRect = {
        x: view.x,
        y: view.y,
        width: getViewWidth(view),
        height: getViewHeight(
          view,
          resolveViewColumns(view, tables),
          settings.showComments,
        ),
      };
      if (shouldAddElement(viewRect, element)) {
        elements.push(element);
      }
    });

    areas.forEach((area) => {
      if (area.locked) return;

      const element = {
        id: area.id,
        type: ObjectType.AREA,
        currentCoords: { x: area.x, y: area.y },
        initialCoords: { x: area.x, y: area.y },
      };
      const areaRect = {
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
      };
      if (shouldAddElement(areaRect, element)) {
        elements.push(element);
      }
    });

    notes.forEach((note) => {
      if (note.locked) return;

      const element = {
        id: note.id,
        type: ObjectType.NOTE,
        currentCoords: { x: note.x, y: note.y },
        initialCoords: { x: note.x, y: note.y },
      };
      const noteRect = {
        x: note.x,
        y: note.y,
        width: note.width ?? noteWidth,
        height: note.height,
      };
      if (shouldAddElement(noteRect, element)) {
        elements.push(element);
      }
    });

    if (bulkSelectRect.ctrlKey || bulkSelectRect.metaKey) {
      setBulkSelectedElements([...bulkSelectedElements, ...elements]);
    } else {
      setBulkSelectedElements(elements);
    }
  };

  const handlePointerDownOnElement = (e, { element, type }) => {
    if (selectedElement.open && !layout.sidebar) return;

    if (!e.isPrimary) return;

    if (!element.locked || !(e.ctrlKey || e.metaKey)) {
      setSelectedElement((prev) => ({
        ...prev,
        element: type,
        id: element.id,
        open: false,
      }));
    }

    if (element.locked) {
      if (!(e.ctrlKey || e.metaKey)) {
        setBulkSelectedElements([]);
      }
      return;
    }

    setBulkSelectRect((prev) => ({
      ...prev,
      show: false,
    }));

    const elementInBulk = {
      id: element.id,
      type,
      currentCoords: { x: element.x, y: element.y },
      initialCoords: { x: element.x, y: element.y },
    };

    const isSelected = bulkSelectedElements.some((el) =>
      isSameElement(el, elementInBulk),
    );

    if (e.ctrlKey || e.metaKey) {
      if (isSelected) {
        if (bulkSelectedElements.length > 1) {
          setBulkSelectedElements(
            bulkSelectedElements.filter(
              (el) => !isSameElement(el, elementInBulk),
            ),
          );
          setSelectedElement({
            ...selectedElement,
            element: ObjectType.NONE,
            id: -1,
            open: false,
          });
        }
      } else {
        setBulkSelectedElements([...bulkSelectedElements, elementInBulk]);
      }
      setDragging(notDragging);
      return;
    }

    if (!isSelected) {
      setBulkSelectedElements([elementInBulk]);
    }

    if (canvasRef.current) {
      canvasRectRef.current = canvasRef.current.getBoundingClientRect();
    }
    const rect = canvasRectRef.current;
    const diagPos = rect
      ? toDiagramSpace({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
      : pointer.spaces.diagram;

    const grabOffset = {
      x: diagPos.x - element.x,
      y: diagPos.y - element.y,
    };

    const getElementCoords = (el) => {
      if (el.currentCoords?.x !== undefined) return el.currentCoords;
      if (el.type === ObjectType.TABLE) {
        const t = tables.find((item) => item.id === el.id);
        if (t) return { x: t.x, y: t.y };
      } else if (el.type === ObjectType.AREA) {
        const a = areas.find((item) => item.id === el.id);
        if (a) return { x: a.x, y: a.y };
      } else if (el.type === ObjectType.NOTE) {
        const n = notes.find((item) => item.id === el.id);
        if (n) return { x: n.x, y: n.y };
      } else if (el.type === ObjectType.VIEW) {
        const v = views.find((item) => item.id === el.id);
        if (v) return { x: v.x, y: v.y };
      }
      return { x: el.x ?? 0, y: el.y ?? 0 };
    };

    const movingElements = isSelected
      ? bulkSelectedElements.map((el) => {
          const coords = getElementCoords(el);
          return {
            id: el.id,
            type: el.type,
            initialCoords: { x: coords.x, y: coords.y },
          };
        })
      : [
          {
            id: element.id,
            type,
            initialCoords: { x: element.x, y: element.y },
          },
        ];

    dragRef.current = {
      active: true,
      mainElement: {
        id: element.id,
        type,
        grabOffset,
        initialCoords: { x: element.x, y: element.y },
      },
      elements: movingElements,
      delta: { x: 0, y: 0 },
    };

    setDragging({
      id: element.id,
      type,
      grabOffset,
    });
    setDragDelta({ x: 0, y: 0 });
  };

  const coordinatesAfterSnappingToGrid = ({ x, y }) => {
    if (settings.snapToGrid) {
      return {
        x: Math.round(x / gridSize) * gridSize,
        y: Math.round(y / gridSize) * gridSize,
      };
    }
    return { x, y };
  };

  /**
   * @param {PointerEvent} e
   */
  const handlePointerMove = (e) => {
    if (selectedElement.open && !layout.sidebar) return;

    if (!e.isPrimary) return;

    if (!canvasRectRef.current && canvasRef.current) {
      canvasRectRef.current = canvasRef.current.getBoundingClientRect();
    }
    const rect = canvasRectRef.current;
    const currentScreen = rect
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : pointer.spaces.screen;
    const currentDiagram = rect
      ? toDiagramSpace(currentScreen)
      : pointer.spaces.diagram;

    if (panning.isPanning) {
      setTransform((prev) => ({
        ...prev,
        pan: {
          x:
            panning.panStart.x +
            (panning.cursorStart.x - currentScreen.x) / transform.zoom,
          y:
            panning.panStart.y +
            (panning.cursorStart.y - currentScreen.y) / transform.zoom,
        },
      }));
      return;
    }

    if (layout.readOnly) return;

    if (linking) {
      setLinkingLine({
        ...linkingLine,
        endX: currentDiagram.x,
        endY: currentDiagram.y,
      });
      return;
    }

    if (dragRef.current.active) {
      const { x: mainElementFinalX, y: mainElementFinalY } =
        coordinatesAfterSnappingToGrid({
          x: currentDiagram.x - dragRef.current.mainElement.grabOffset.x,
          y: currentDiagram.y - dragRef.current.mainElement.grabOffset.y,
        });

      const deltaX =
        mainElementFinalX - dragRef.current.mainElement.initialCoords.x;
      const deltaY =
        mainElementFinalY - dragRef.current.mainElement.initialCoords.y;

      dragRef.current.delta = { x: deltaX, y: deltaY };

      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null;
          if (dragRef.current.active) {
            setDragDelta({ ...dragRef.current.delta });
          }
        });
      }
      return;
    }

    if (areaResize.id !== -1) {
      if (areaResize.dir === "none") return;
      let newDims = { ...areaInitDimensions };
      setPanning((old) => ({ ...old, isPanning: false }));
      const { x, y } = coordinatesAfterSnappingToGrid(currentDiagram);

      switch (areaResize.dir) {
        case "br":
          newDims.width = x - areaInitDimensions.x;
          newDims.height = y - areaInitDimensions.y;
          break;
        case "tl":
          newDims.x = x;
          newDims.y = y;
          newDims.width = areaInitDimensions.width - (x - areaInitDimensions.x);
          newDims.height =
            areaInitDimensions.height - (y - areaInitDimensions.y);
          break;
        case "tr":
          newDims.y = y;
          newDims.width = x - areaInitDimensions.x;
          newDims.height =
            areaInitDimensions.height - (y - areaInitDimensions.y);
          break;
        case "bl":
          newDims.x = x;
          newDims.width = areaInitDimensions.width - (x - areaInitDimensions.x);
          newDims.height = y - areaInitDimensions.y;
          break;
      }

      if (newDims.width <= minAreaSize) {
        newDims.width = minAreaSize;
        if (areaResize.dir === "tl" || areaResize.dir === "bl") {
          newDims.x =
            areaInitDimensions.x + areaInitDimensions.width - minAreaSize;
        }
      }

      if (newDims.height <= minAreaSize) {
        newDims.height = minAreaSize;
        if (areaResize.dir === "tl" || areaResize.dir === "tr") {
          newDims.y =
            areaInitDimensions.y + areaInitDimensions.height - minAreaSize;
        }
      }

      updateArea(areaResize.id, { ...newDims });
      return;
    }

    if (bulkSelectRect.show) {
      setBulkSelectRect((prev) => ({
        ...prev,
        x2: currentDiagram.x,
        y2: currentDiagram.y,
      }));
    }
  };

  /**
   * @param {PointerEvent} e
   */
  const handlePointerDown = (e) => {
    if (!e.isPrimary) return;

    // don't pan if the sidesheet for editing a table is open
    if (
      (selectedElement.element === ObjectType.TABLE ||
        selectedElement.element === ObjectType.VIEW) &&
      selectedElement.open &&
      !layout.sidebar
    )
      return;

    if (canvasRef.current) {
      canvasRectRef.current = canvasRef.current.getBoundingClientRect();
    }
    const rect = canvasRectRef.current;
    const currentScreen = rect
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : pointer.spaces.screen;
    const currentDiagram = rect
      ? toDiagramSpace(currentScreen)
      : pointer.spaces.diagram;

    const clickedElement = elementPointerDownRef.current;
    elementPointerDownRef.current = null;

    const isMouseLeftButton = e.button === 0;
    const isMouseMiddleButton = e.button === 1;
    const isMouseRightButton = e.button === 2;

    if (isMouseLeftButton) {
      setBulkSelectRect({
        x1: currentDiagram.x,
        y1: currentDiagram.y,
        x2: currentDiagram.x,
        y2: currentDiagram.y,
        show: clickedElement === null || !clickedElement.element.locked,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
      });
      if (clickedElement !== null) {
        handlePointerDownOnElement(e, clickedElement);
      }
      pointer.setStyle("crosshair");
    } else if (isMouseMiddleButton || isMouseRightButton) {
      if (isMouseRightButton) rightClickPanned.current = false;
      setPanning({
        isPanning: true,
        panStart: transform.pan,
        // Diagram space depends on the current panning.
        // Use screen space to avoid circular dependencies and undefined behavior.
        cursorStart: currentScreen,
      });
      pointer.setStyle("grabbing");
    }
  };

  const isDragging = () => {
    return dragRef.current.active || dragging.type !== ObjectType.NONE;
  };

  const didResize = (id) => {
    return !(
      areas[id].x === areaInitDimensions.x &&
      areas[id].y === areaInitDimensions.y &&
      areas[id].width === areaInitDimensions.width &&
      areas[id].height === areaInitDimensions.height
    );
  };

  const didPan = () =>
    !(
      transform.pan.x === panning.panStart.x &&
      transform.pan.y === panning.panStart.y
    );

  /**
   * @param {PointerEvent} e
   */
  const handlePointerUp = (e) => {
    if (selectedElement.open && !layout.sidebar) return;

    if (!e.isPrimary) return;

    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    if (dragRef.current.active) {
      const finalDelta = dragRef.current.delta;
      const didMove = finalDelta.x !== 0 || finalDelta.y !== 0;

      if (didMove) {
        const movedElements = dragRef.current.elements;
        const finalCoordsMap = new Map();

        movedElements.forEach((el) => {
          const finalCoords = {
            x: el.initialCoords.x + finalDelta.x,
            y: el.initialCoords.y + finalDelta.y,
          };
          finalCoordsMap.set(`${el.type}_${el.id}`, finalCoords);

          if (el.type === ObjectType.TABLE) {
            updateTable(el.id, finalCoords);
          } else if (el.type === ObjectType.AREA) {
            updateArea(el.id, finalCoords);
          } else if (el.type === ObjectType.NOTE) {
            updateNote(el.id, finalCoords);
          } else if (el.type === ObjectType.VIEW) {
            updateView(el.id, finalCoords);
          }
        });

        setUndoStack((prev) => [
          ...prev,
          {
            action: Action.MOVE,
            bulk: true,
            message: t("bulk_update"),
            elements: movedElements.map((el) => ({
              id: el.id,
              type: el.type,
              undo: el.initialCoords,
              redo: {
                x: el.initialCoords.x + finalDelta.x,
                y: el.initialCoords.y + finalDelta.y,
              },
            })),
          },
        ]);
        setRedoStack([]);
        setBulkSelectedElements((prev) =>
          prev.map((el) => {
            const finalCoords = finalCoordsMap.get(`${el.type}_${el.id}`);
            if (finalCoords) {
              return {
                ...el,
                initialCoords: { ...finalCoords },
                currentCoords: { ...finalCoords },
              };
            }
            return el;
          }),
        );
      }

      dragRef.current.active = false;
      dragRef.current.delta = { x: 0, y: 0 };
      dragRef.current.elements = [];
      setDragDelta({ x: 0, y: 0 });
      setDragging(notDragging);
    }

    if (bulkSelectRect.show) {
      if (!canvasRectRef.current && canvasRef.current) {
        canvasRectRef.current = canvasRef.current.getBoundingClientRect();
      }
      const rect = canvasRectRef.current;
      const currentDiagram = rect
        ? toDiagramSpace({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        : pointer.spaces.diagram;

      setBulkSelectRect((prev) => ({
        ...prev,
        x2: currentDiagram.x,
        y2: currentDiagram.y,
        show: false,
      }));
      if (!isDragging()) {
        collectSelectedElements();
      }
    }
    setDragging(notDragging);

    if (panning.isPanning && didPan()) {
      setSaveState(State.SAVING);
      if (e.button === 2) rightClickPanned.current = true;
    }
    setPanning((old) => ({ ...old, isPanning: false }));
    pointer.setStyle("default");

    if (linking) handleLinking();
    setLinking(false);

    if (areaResize.id !== -1 && didResize(areaResize.id)) {
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.AREA,
          aid: areaResize.id,
          undo: {
            ...areas[areaResize.id],
            x: areaInitDimensions.x,
            y: areaInitDimensions.y,
            width: areaInitDimensions.width,
            height: areaInitDimensions.height,
          },
          redo: areas[areaResize.id],
          message: t("edit_area", {
            areaName: areas[areaResize.id].name,
            extra: "[resize]",
          }),
        },
      ]);
      setRedoStack([]);
    }
    setAreaResize({ id: -1, dir: "none" });
    setAreaInitDimensions({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  };

  const handleGripField = useCallback(() => {
    setPanning((old) => ({ ...old, isPanning: false }));
    setDragging(notDragging);
    dragRef.current.active = false;
    dragRef.current.delta = { x: 0, y: 0 };
    dragRef.current.elements = [];
    setDragDelta({ x: 0, y: 0 });
    setLinking(true);
  }, []);

  const getCardinality = (startField, endField) => {
    const startIsUnique = startField.unique || startField.primary;
    const endIsUnique = endField.unique || endField.primary;

    if (startIsUnique && endIsUnique) {
      return Cardinality.ONE_TO_ONE;
    }

    if (startIsUnique && !endIsUnique) {
      return Cardinality.ONE_TO_MANY;
    }

    if (!startIsUnique && endIsUnique) {
      return Cardinality.MANY_TO_ONE;
    }

    return Cardinality.ONE_TO_ONE;
  };

  const handleLinking = () => {
    if (hoveredTable.tableId === null) return;
    if (hoveredTable.fieldId === null) return;

    const { fields: startTableFields, name: startTableName } = tables.find(
      (t) => t.id === linkingLine.startTableId,
    );
    const startField = startTableFields.find(
      (f) => f.id === linkingLine.startFieldId,
    );
    const { fields: endTableFields, name: endTableName } = tables.find(
      (t) => t.id === hoveredTable.tableId,
    );
    const endField = endTableFields.find((f) => f.id === hoveredTable.fieldId);

    if (!areFieldsCompatible(database, startField.type, endField.type)) {
      Toast.info(t("cannot_connect"));
      return;
    }
    if (
      linkingLine.startTableId === hoveredTable.tableId &&
      linkingLine.startFieldId === hoveredTable.fieldId
    )
      return;

    const cardinality = getCardinality(startField, endField);

    const newRelationship = {
      ...linkingLine,
      cardinality,
      endTableId: hoveredTable.tableId,
      endFieldId: hoveredTable.fieldId,
      fields: [
        {
          startFieldId: linkingLine.startFieldId,
          endFieldId: hoveredTable.fieldId,
        },
      ],
      updateConstraint: Constraint.NONE,
      deleteConstraint: Constraint.NONE,
      name: `fk_${startTableName}_${startField.name}_${endTableName}`,
      color: defaultRelationshipColor,
      id: nanoid(),
    };
    delete newRelationship.startX;
    delete newRelationship.startY;
    delete newRelationship.endX;
    delete newRelationship.endY;
    addRelationship(newRelationship);
  };

  useEventListener(
    "wheel",
    (e) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        let delta = e.deltaY;
        if (Math.abs(delta) > 50) {
          delta = Math.sign(delta) * 15;
        }

        const divisor = 1000 / settings.zoomSensitivity;
        const zoomFactor = Math.exp(-delta / divisor);
        setTransform((prev) => {
          const newZoom = prev.zoom * zoomFactor;
          const zoomRatio = newZoom / prev.zoom;
          return {
            pan: {
              x:
                prev.pan.x +
                (pointer.spaces.diagram.x - prev.pan.x) * (1 - 1 / zoomRatio),
              y:
                prev.pan.y +
                (pointer.spaces.diagram.y - prev.pan.y) * (1 - 1 / zoomRatio),
            },
            zoom: newZoom,
          };
        });
      } else if (e.shiftKey) {
        const horizontalDelta =
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        setTransform((prev) => ({
          ...prev,
          pan: {
            ...prev.pan,
            x: prev.pan.x + horizontalDelta / prev.zoom,
          },
        }));
      } else {
        setTransform((prev) => ({
          ...prev,
          pan: {
            ...prev.pan,
            x: prev.pan.x + e.deltaX / prev.zoom,
            y: prev.pan.y + e.deltaY / prev.zoom,
          },
        }));
      }
    },
    canvasRef,
    { passive: false },
  );

  return (
    <div className="grow h-full touch-none" id="canvas">
      <div
        className="w-full h-full"
        style={{
          cursor: pointer.style,
          backgroundColor: settings.mode === "dark" ? darkBgTheme : "white",
        }}
      >
        <svg
          id="diagram"
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={(e) => {
            if (rightClickPanned.current) {
              e.preventDefault();
              rightClickPanned.current = false;
            }
          }}
          className="absolute w-full h-full touch-none"
          viewBox={`${viewBox.left} ${viewBox.top} ${viewBox.width} ${viewBox.height}`}
        >
          {settings.showGrid && (
            <>
              <defs>
                <pattern
                  id="pattern-grid"
                  x={-gridCircleRadius}
                  y={-gridCircleRadius}
                  width={gridSize}
                  height={gridSize}
                  patternUnits="userSpaceOnUse"
                  patternContentUnits="userSpaceOnUse"
                >
                  <circle
                    cx={gridCircleRadius}
                    cy={gridCircleRadius}
                    r={gridCircleRadius}
                    fill="rgb(99, 152, 191)"
                    opacity="1"
                  />
                </pattern>
              </defs>
              <rect
                x={viewBox.left}
                y={viewBox.top}
                width={viewBox.width}
                height={viewBox.height}
                fill="url(#pattern-grid)"
              />
            </>
          )}
          {displayAreas.map((a) => (
            <Area
              key={a.id}
              data={a}
              setResize={setAreaResize}
              setInitDimensions={setAreaInitDimensions}
              onPointerDown={() => {
                elementPointerDownRef.current = {
                  element: a,
                  type: ObjectType.AREA,
                };
              }}
            />
          ))}
          {relationships.map((e) => (
            <Relationship key={e.id} data={e} tables={displayTables} />
          ))}
          {displayTables.map((table) => (
            <Table
              key={table.id}
              tableData={table}
              setHoveredTable={setHoveredTable}
              handleGripField={handleGripField}
              setLinkingLine={setLinkingLine}
              onPointerDown={() => {
                elementPointerDownRef.current = {
                  element: table,
                  type: ObjectType.TABLE,
                };
              }}
            />
          ))}
          {displayViews.map((view) => (
            <View
              key={view.id}
              viewData={view}
              onPointerDown={() => {
                elementPointerDownRef.current = {
                  element: view,
                  type: ObjectType.VIEW,
                };
              }}
            />
          ))}
          {linking && (
            <path
              d={`M ${linkingLine.startX} ${linkingLine.startY} L ${linkingLine.endX} ${linkingLine.endY}`}
              stroke="red"
              strokeDasharray="8,8"
              className="pointer-events-none touch-none"
            />
          )}
          <Slot name="svg-overlay" />
          {displayNotes.map((n) => (
            <Note
              key={n.id}
              data={n}
              onPointerDown={() => {
                elementPointerDownRef.current = {
                  element: n,
                  type: ObjectType.NOTE,
                };
              }}
            />
          ))}
          {bulkSelectRect.show && (
            <rect
              {...getRectFromEndpoints(bulkSelectRect)}
              stroke="grey"
              fill="grey"
              fillOpacity={0.15}
              strokeDasharray={10}
            />
          )}
        </svg>
      </div>
      {settings.showDebugCoordinates && (
        <div className="fixed flex flex-col flex-wrap gap-6 bg-[rgba(var(--semi-grey-1),var(--tw-bg-opacity))]/40 border border-color bottom-4 right-4 p-4 rounded-xl backdrop-blur-xs pointer-events-none select-none">
          <table className="table-auto grow">
            <thead>
              <tr>
                <th className="text-left" colSpan={3}>
                  {t("transform")}
                </th>
              </tr>
              <tr className="italic [&_th]:font-normal [&_th]:text-right">
                <th>pan x</th>
                <th>pan y</th>
                <th>scale</th>
              </tr>
            </thead>
            <tbody className="[&_td]:text-right [&_td]:min-w-[8ch]">
              <tr>
                <td>{transform.pan.x.toFixed(2)}</td>
                <td>{transform.pan.y.toFixed(2)}</td>
                <td>{transform.zoom.toFixed(4)}</td>
              </tr>
            </tbody>
          </table>
          <table className="table-auto grow [&_th]:text-left [&_th:not(:first-of-type)]:text-right [&_td:not(:first-of-type)]:text-right [&_td]:min-w-[8ch]">
            <thead>
              <tr>
                <th colSpan={4}>{t("viewbox")}</th>
              </tr>
              <tr className="italic [&_th]:font-normal">
                <th>left</th>
                <th>top</th>
                <th>width</th>
                <th>height</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{viewBox.left.toFixed(2)}</td>
                <td>{viewBox.top.toFixed(2)}</td>
                <td>{viewBox.width.toFixed(2)}</td>
                <td>{viewBox.height.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <table className="table-auto grow [&_th]:text-left [&_th:not(:first-of-type)]:text-right [&_td:not(:first-of-type)]:text-right [&_td]:min-w-[8ch]">
            <thead>
              <tr>
                <th colSpan={3}>{t("cursor_coordinates")}</th>
              </tr>
              <tr className="italic [&_th]:font-normal">
                <th>{t("coordinate_space")}</th>
                <th>x</th>
                <th>y</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("coordinate_space_screen")}</td>
                <td>{pointer.spaces.screen.x.toFixed(2)}</td>
                <td>{pointer.spaces.screen.y.toFixed(2)}</td>
              </tr>
              <tr>
                <td>{t("coordinate_space_diagram")}</td>
                <td>{pointer.spaces.diagram.x.toFixed(2)}</td>
                <td>{pointer.spaces.diagram.y.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
