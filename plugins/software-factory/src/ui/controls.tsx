// Controls shared by the AIRD tabs and the details panel.
import type { GateStatus, ItemLabel } from "../contract";
import { GATE_STATUS, useFactoryRpc } from "./data";
import { Segmented } from "./kit";

export function LabelToggle({
  item,
  airdId,
  onChanged,
}: {
  item: { id: string; label: ItemLabel; labelSource: "auto" | "user" };
  airdId: string;
  onChanged: () => void;
}) {
  const rpc = useFactoryRpc();
  const set = (label: ItemLabel | null) => {
    rpc.call("label_set", { airdId, itemId: item.id, label }).then(onChanged, () => undefined);
  };
  return (
    <span className="inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <Segmented<ItemLabel>
        size="xs"
        value={item.label}
        onChange={(value) => set(value)}
        items={[
          { value: "bug", label: "Баг", tone: "bad" },
          { value: "task", label: "Не баг", tone: "good" },
        ]}
      />
      {item.labelSource === "user" ? (
        <button
          type="button"
          title="Вернуть автоматическую разметку"
          className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => set(null)}
        >
          авто
        </button>
      ) : null}
    </span>
  );
}

export type GateChoice = GateStatus | "auto";

export function GateStatusSelect({
  airdId,
  gate,
  onChanged,
}: {
  airdId: string;
  gate: { id: string; status: GateStatus; statusSource: "derived" | "user" };
  onChanged: () => void;
}) {
  const rpc = useFactoryRpc();
  return (
    <span onClick={(event) => event.stopPropagation()}>
      <select
        value={gate.statusSource === "user" ? gate.status : "auto"}
        onChange={(event) => {
          const choice = event.target.value as GateChoice;
          rpc
            .call("gate_set", { airdId, gateId: gate.id, status: choice === "auto" ? null : choice })
            .then(onChanged, () => undefined);
        }}
        className="h-7 cursor-pointer rounded-md border border-input bg-transparent px-1.5 text-xs"
        aria-label={`Статус ${gate.id}`}
      >
        <option value="auto">Авто</option>
        {(Object.keys(GATE_STATUS) as GateStatus[]).map((status) => (
          <option key={status} value={status}>
            {GATE_STATUS[status].label}
          </option>
        ))}
      </select>
    </span>
  );
}
