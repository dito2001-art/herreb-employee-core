import "./styles.css";
import { createRoot } from "react-dom/client";
import { WorkforceRoot } from "./workforce-root";

const root = createRoot(document.getElementById("root")!);
root.render(<WorkforceRoot />);
