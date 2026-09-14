import { InputNumber } from "@douyinfe/semi-ui";

export default function SetZoomSensitivity({ value, onChange }) {
  return (
    <InputNumber
      className="w-full"
      value={value}
      min={1}
      max={20}
      onChange={(v) => {
        if (v < 1 || v > 20) return;
        onChange(v);
      }}
    />
  );
}
