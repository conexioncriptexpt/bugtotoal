import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

export const TechPickerDialog = ({ open, onOpenChange, title, description, onConfirm, excludeId, testId = "tech-picker" }) => {
  const [techs, setTechs] = useState([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setValue("");
      api.get("/technicians").then(({ data }) => setTechs(data.filter((t) => t.active && t.id !== excludeId)));
    }
  }, [open, excludeId]);
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(value);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#12141C] border-[#222736]" data-testid={`${testId}-dialog`}>
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger data-testid={`${testId}-select`}><SelectValue placeholder="Escolha um técnico" /></SelectTrigger>
          <SelectContent>
            {techs.map((t) => (
              <SelectItem key={t.id} value={t.id} data-testid={`${testId}-option-${t.id}`}>
                {t.name} {t.role === "super_admin" ? "(Super Admin)" : ""} {t.busy ? "· ocupado" : t.online ? "· online" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <button className="cc-btn-ghost px-4 py-2 rounded-lg" onClick={() => onOpenChange(false)} data-testid={`${testId}-cancel`}>Cancelar</button>
          <button className="cc-btn-lime px-4 py-2 rounded-lg disabled:opacity-40" disabled={!value || busy} onClick={confirm} data-testid={`${testId}-confirm`}>Confirmar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
