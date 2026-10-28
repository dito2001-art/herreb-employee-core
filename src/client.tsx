import "./styles.css";
import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { EMP003Pilot } from "./emp003-pilot";

const WorkforceRoot = lazy(() =>
  import("./workforce-root").then((module) => ({
    default: module.WorkforceRoot
  }))
);

const root = createRoot(document.getElementById("root")!);
// The authenticated staging Worker sets this marker. No hostname guessing or
// chat hooks are needed in the EMP-003-only pilot. Authorization remains server-side.
root.render(
  document.documentElement.dataset.workforceMode === "emp003" ? (
    <EMP003Pilot />
  ) : (
    <Suspense fallback={<p>Cargando Workforce…</p>}>
      <WorkforceRoot />
    </Suspense>
  )
);
