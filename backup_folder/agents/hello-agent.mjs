import { Agent } from "@swatechnology/swa-multi-agent-orchestrator";

export default class HelloAgent extends Agent {
  constructor(options) {
    super(options);
  }

  processRequest = async () => {
    const text = "hello world";

    return {
      role: "assistant",
      content: [{ text: text || "No response" }],
    };
  };
}
