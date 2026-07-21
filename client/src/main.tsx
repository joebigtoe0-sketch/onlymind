import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { connectSocket } from "./net/socket";
import { useCosmos } from "./store";

connectSocket();

// tiny debug hook (also used by headless verification)
(window as unknown as Record<string, unknown>).__onlymind = {
  select: (id: string | null) => useCosmos.getState().select(id),
  marks: () => useCosmos.getState().marks,
  companion: () => useCosmos.getState().companion,
};

createRoot(document.getElementById("root")!).render(<App />);
