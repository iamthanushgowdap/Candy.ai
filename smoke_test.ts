import { curateFeedbackDataset } from "./src/lib/ai/feedbackLoop";

async function main() {
  console.log("Running self-improvement dataset curation smoke test...");
  try {
    const { report, dataset } = await curateFeedbackDataset();
    console.log("SUCCESS! Curation Report:");
    console.log(JSON.stringify(report, null, 2));
    console.log(`Total samples compiled: ${dataset.length}`);
  } catch (e) {
    console.error("Curation smoke test failed:", e);
  }
}

main();
