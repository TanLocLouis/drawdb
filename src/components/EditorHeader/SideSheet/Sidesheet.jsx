import { SideSheet as SemiUISideSheet } from "@douyinfe/semi-ui";
import { SIDESHEET } from "../../../data/constants";
import Timeline from "./Timeline";
import { useTranslation } from "react-i18next";

export default function Sidesheet({ type, onClose }) {
  const { t } = useTranslation();

  function getTitle(type) {
    switch (type) {
      case SIDESHEET.TIMELINE:
        return t("timeline");
      default:
        break;
    }
  }

  function getContent(type) {
    switch (type) {
      case SIDESHEET.TIMELINE:
        return <Timeline />;
      default:
        break;
    }
  }

  return (
    <SemiUISideSheet
      visible={type !== SIDESHEET.NONE}
      onCancel={onClose}
      width={420}
      title={<div className="text-lg">{getTitle(type)}</div>}
      style={{ paddingBottom: "16px" }}
      bodyStyle={{ padding: "0px" }}
    >
      <div className="sidesheet-theme">{getContent(type)}</div>
    </SemiUISideSheet>
  );
}
