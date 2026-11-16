// Software Factory — frontend entry. One nav panel ("Software Factory") with
// its own routes:
//   /plugins/software-factory/factory                     projects → AIRDs
//   /plugins/software-factory/factory/aird/<id>[/<tab>]   one AIRD
//   /plugins/software-factory/factory/agents              agent roles
import { useEffect, useState } from "react";
import { definePluginApp, useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { RpcContract } from "./src/contract";
import { CHANGED, PANEL_PATH } from "./src/ui/data";
import { AgentsView } from "./src/ui/agents";
import { DetailView, type DetailTab } from "./src/ui/detail";
import { HomeView } from "./src/ui/home";
import { MetricsView } from "./src/ui/metrics";
import { QuestionsView, ThreadQuestionForm } from "./src/ui/questions";

const TABS: DetailTab[] = ["overview", "questions", "workorders", "acceptance", "gates", "agents", "commits"];

function FactoryPage({ subPath }: { subPath: string }) {
  const navigate = useBbNavigate();
  const segments = subPath
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const go = (path: string, replace = false) => navigate.toPluginPanel(PANEL_PATH, { subPath: path, replace });

  if (segments[0] === "aird" && segments[1]) {
    const id = segments[1];
    const tab = TABS.includes(segments[2] as DetailTab) ? (segments[2] as DetailTab) : "overview";
    return (
      <DetailView
        id={id}
        tab={tab}
        onTab={(next) => go(`aird/${id}/${next}`, true)}
        onBack={() => go("")}
        onAgents={() => go("agents")}
        onMetrics={(runKey) => go(runKey ? `metrics/run/${runKey}` : "metrics")}
      />
    );
  }
  if (segments[0] === "metrics") {
    return <MetricsView key={segments[2] ?? "all"} onBack={() => go("")} initialRun={segments[1] === "run" ? (segments[2] ?? null) : null} />;
  }
  if (segments[0] === "agents") return <AgentsView onBack={() => go("")} />;
  if (segments[0] === "questions") return <QuestionsView onBack={() => go("")} onOpenAird={(id) => go(`aird/${id}/questions`)} />;
  return (
    <HomeView
      onOpen={(id) => go(`aird/${id}`)}
      onAgents={() => go("agents")}
      onMetrics={() => go("metrics")}
      onQuestions={() => go("questions")}
      onOpenQuestion={(id) => go(`aird/${id}/questions`)}
    />
  );
}

/** Navigation badge: questions waiting on the user first, else running agents. */
function useRunningBadge() {
  const rpc = useRpc<RpcContract>();
  const [state, setState] = useState({ running: 0, openQuestions: 0 });
  const load = () => {
    rpc.call("running_count", null).then(
      (result) => setState(result),
      () => undefined,
    );
  };
  useEffect(() => {
    load();
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc]);
  useRealtime(CHANGED, load);
  if (state.openQuestions > 0) {
    return { count: state.openQuestions, tone: "warning" as const, label: `${state.openQuestions} вопросов агентов ждут ответа` };
  }
  return state.running > 0 ? { count: state.running, tone: "neutral" as const, label: `${state.running} AIRD-агентов работают` } : null;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "factory",
    title: "Software Factory",
    icon: "Factory",
    path: PANEL_PATH,
    component: FactoryPage,
    experimental_useBadge: useRunningBadge,
  });
  // sf_ask_user: the question card inside the agent's thread.
  app.slots.pendingInteraction({ id: "aird-question", component: ThreadQuestionForm });
});
