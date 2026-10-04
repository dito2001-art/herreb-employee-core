import App from "./app";
import { WorkforceShell } from "./workforce-shell";

export function WorkforceRoot() {
  return (
    <WorkforceShell
      assistant={
        <div className="workforce-assistant h-full min-h-0 overflow-hidden">
          <App />
        </div>
      }
    />
  );
}
