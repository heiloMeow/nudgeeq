import { useCallback, useState } from "react";
type Toast = { id: string; text: string; fromRoleId?: string };

export function useToasts() {
  const [items, setItems] = useState<Toast[]>([]);
  const addToast = useCallback((t: Omit<Toast,"id">) => {
    const id = Math.random().toString(36).slice(2);
    setItems(list => [...list, { id, ...t }]);
    setTimeout(() => setItems(list => list.filter(x => x.id !== id)), 3500);
  }, []);
  const renderer = () => <Toasts items={items} />;
  return { addToast, renderer };
}

export default function Toasts({ items }: { items: Toast[] }) {
  return (
    <div className="fixed right-4 top-4 z-[120] space-y-2">
      {items.map(t => (
        <div
          key={t.id}
          className="rounded-xl border border-white/30 bg-white/10 backdrop-blur px-3 py-2 shadow-[0_8px_20px_rgba(0,0,0,.35)]"
        >
          <div className="text-sm">
            <span className="opacity-80 mr-1">Reply:</span>{t.text}
          </div>
        </div>
      ))}
    </div>
  );
}
